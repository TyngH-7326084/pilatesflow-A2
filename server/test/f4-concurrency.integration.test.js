const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const request = require("supertest");
const Booking = require("../src/models/Booking");
const Class = require("../src/models/Class");
const User = require("../src/models/User");
const bookingRoutes = require("../src/routes/bookingRoutes");

const TRIAL_COUNT = 10;
const REQUESTS_PER_TRIAL = 20;
const TARGET_CAPACITY = 5;

let replicaSet;
const jwtSecret = "pf50-test-secret";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/bookings", bookingRoutes);
  app.use((error, req, res, next) => {
    res.status(error.status || 500).json({ error: error.message });
  });
  return app;
}

function memberToken(memberId) {
  return jwt.sign({ sub: String(memberId), role: "member" }, jwtSecret, {
    expiresIn: "5m",
  });
}

test.before(async () => {
  process.env.JWT_SECRET = jwtSecret;
  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  await mongoose.connect(replicaSet.getUri(), { dbName: "pilatesflow_pf50" });
  await Promise.all([User.syncIndexes(), Class.syncIndexes(), Booking.syncIndexes()]);
});

test.after(async () => {
  await mongoose.disconnect();
  await replicaSet?.stop();
});

async function seedTrial(trialNumber) {
  await mongoose.connection.dropDatabase();
  await Promise.all([User.syncIndexes(), Class.syncIndexes(), Booking.syncIndexes()]);

  const passwordHash = "not-used-by-service-test";
  const admin = await User.create({
    name: "PF-50 administrator",
    email: `pf50-admin-${trialNumber}@example.test`,
    passwordHash,
    role: "admin",
  });

  const members = await User.insertMany(
    Array.from({ length: REQUESTS_PER_TRIAL }, (_, index) => ({
      name: `PF-50 member ${index + 1}`,
      email: `pf50-${trialNumber}-${index + 1}@example.test`,
      passwordHash,
      role: "member",
      status: "active",
    }))
  );

  const [sourceClass, targetClass] = await Class.create([
    {
      className: "PF-50 source class",
      instructorName: "Concurrency Test Instructor",
      classDateTime: new Date("2035-01-01T09:00:00.000Z"),
      capacity: REQUESTS_PER_TRIAL,
      status: "Published",
      createdBy: admin._id,
    },
    {
      className: "PF-50 target class",
      instructorName: "Concurrency Test Instructor",
      classDateTime: new Date("2035-01-02T09:00:00.000Z"),
      capacity: TARGET_CAPACITY,
      status: "Published",
      createdBy: admin._id,
    },
  ]);

  const reschedulingMembers = members.slice(10);
  const sourceBookings = await Booking.insertMany(
    reschedulingMembers.map((member) => ({
      user: member._id,
      class: sourceClass._id,
    }))
  );

  return {
    members,
    sourceBookings,
    sourceClass,
    targetClass,
  };
}

test(
  "PF-50: authenticated HTTP requests preserve capacity and source bookings across ten reset trials",
  { timeout: 120_000 },
  async (t) => {
    const app = createTestApp();

    for (let trial = 1; trial <= TRIAL_COUNT; trial += 1) {
      const fixture = await seedTrial(trial);
      const operations = [
        ...fixture.members.slice(0, 10).map((member) => ({
          kind: "create",
          actorId: String(member._id),
          run: () =>
            request(app)
              .post("/api/bookings")
              .set("Authorization", `Bearer ${memberToken(member._id)}`)
              .send({ classId: String(fixture.targetClass._id) }),
        })),
        ...fixture.sourceBookings.map((booking) => ({
          kind: "reschedule",
          actorId: String(booking.user),
          bookingId: String(booking._id),
          run: () =>
            request(app)
              .patch(`/api/bookings/${booking._id}/reschedule`)
              .set("Authorization", `Bearer ${memberToken(booking.user)}`)
              .send({ targetClassId: String(fixture.targetClass._id) }),
        })),
      ];

      assert.equal(operations.length, REQUESTS_PER_TRIAL);
      const results = await Promise.all(operations.map((operation) => operation.run()));
      const successes = results.filter((result) => [200, 201].includes(result.status));
      const conflicts = results.filter((result) => result.status === 409);
      const responseSummary = Object.entries(
        results.reduce((summary, result) => {
          const key = `${result.status}: ${result.body?.error || "success"}`;
          summary[key] = (summary[key] || 0) + 1;
          return summary;
        }, {})
      )
        .map(([response, count]) => `${count}x ${response}`)
        .join(", ");

      assert.equal(
        successes.length,
        TARGET_CAPACITY,
        `trial ${trial} successes; responses: ${responseSummary}`
      );
      assert.equal(
        conflicts.length,
        REQUESTS_PER_TRIAL - TARGET_CAPACITY,
        `trial ${trial} conflicts`
      );
      for (const result of conflicts) {
        assert.match(result.body.error, /class is full/i);
      }
      assert.deepEqual(
        results.filter((result) => ![200, 201, 409].includes(result.status)),
        [],
        `trial ${trial} returned an unexpected HTTP status`
      );

      const targetBookings = await Booking.find({
        class: fixture.targetClass._id,
      }).lean();
      assert.equal(targetBookings.length, TARGET_CAPACITY);
      assert.equal(
        new Set(targetBookings.map((booking) => String(booking.user))).size,
        TARGET_CAPACITY,
        `trial ${trial} duplicate user/class booking`
      );

      for (let index = 0; index < operations.length; index += 1) {
        const operation = operations[index];
        if (operation.kind !== "reschedule" || results[index].status !== 409) {
          continue;
        }

        const unchanged = await Booking.findById(operation.bookingId).lean();
        assert.ok(unchanged, `trial ${trial} lost a rejected source booking`);
        assert.equal(String(unchanged.class), String(fixture.sourceClass._id));
      }

      const duplicateGroups = await Booking.aggregate([
        {
          $group: {
            _id: { user: "$user", class: "$class" },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
      ]);
      assert.deepEqual(duplicateGroups, []);

      t.diagnostic(
        `trial=${trial} requests=${REQUESTS_PER_TRIAL} successes=${successes.length} ` +
          `capacity_conflicts=${conflicts.length} target_bookings=${targetBookings.length} ` +
          `duplicate_groups=${duplicateGroups.length} rejected_sources_preserved=true`
      );
    }
  }
);
