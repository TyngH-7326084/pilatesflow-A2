// US2.8: Waitlist coverage (US2.5, US2.6) plus promotion through the real API (US2.7).
// Uses a replica set because booking cancellation and promotion run in transactions.

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const request = require("supertest");
const User = require("../src/models/User");
const Class = require("../src/models/Class");
const Booking = require("../src/models/Booking");
const Waitlist = require("../src/models/Waitlist");
const waitlistRoutes = require("../src/routes/waitlistRoutes");
const bookingRoutes = require("../src/routes/bookingRoutes");
const errorHandler = require("../src/middleware/errorHandler");

let replicaSet;
let app;

function createTestApp() {
  const testApp = express();
  testApp.use(express.json());
  testApp.use("/api/waitlist", waitlistRoutes);
  testApp.use("/api/bookings", bookingRoutes);
  testApp.use(errorHandler);
  return testApp;
}

const auth = (user) => ({
  Authorization: `Bearer ${jwt.sign(
    { sub: String(user._id), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "5m" }
  )}`,
});

const join = (user, classId) =>
  request(app).post("/api/waitlist").set(auth(user)).send({ classId: String(classId) });

test.before(async () => {
  process.env.JWT_SECRET = "us28-waitlist-secret";
  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  await mongoose.connect(replicaSet.getUri(), { dbName: "pilatesflow_us28_waitlist" });
  await Promise.all([User, Class, Booking, Waitlist].map((Model) => Model.syncIndexes()));
  app = createTestApp();
});

test.after(async () => {
  await mongoose.disconnect();
  await replicaSet?.stop();
});

// fullClass has capacity 1 and its seat is held by `holder`; openClass has spare seats.
let admin, holder, basic, basic2, premium, inactive;
let fullClass, openClass, holderBooking;
test.beforeEach(async () => {
  await Promise.all([User, Class, Booking, Waitlist].map((Model) => Model.deleteMany({})));

  [admin, holder, basic, basic2, premium, inactive] = await User.create([
    { email: "admin@pf.test", passwordHash: "x", role: "admin" },
    { email: "holder@pf.test", passwordHash: "x", role: "member" },
    { email: "basic@pf.test", passwordHash: "x", role: "member", tier: "basic" },
    { email: "basic2@pf.test", passwordHash: "x", role: "member", tier: "basic" },
    { email: "premium@pf.test", passwordHash: "x", role: "member", tier: "premium" },
    { email: "inactive@pf.test", passwordHash: "x", role: "member", status: "inactive" },
  ]);

  const classFields = {
    instructorName: "Test Instructor",
    classDateTime: new Date("2035-01-01T09:00:00.000Z"),
    status: "Published",
    createdBy: admin._id,
  };
  [fullClass, openClass] = await Class.create([
    { ...classFields, className: "Full class", capacity: 1 },
    { ...classFields, className: "Open class", capacity: 5 },
  ]);
  holderBooking = await Booking.create({ user: holder._id, class: fullClass._id });
});

// ---- US2.5 Join waitlist ----

test("US2.5: joining without a token returns 401", async () => {
  const res = await request(app).post("/api/waitlist").send({ classId: String(fullClass._id) });
  assert.equal(res.status, 401);
});

test("US2.5: missing classId returns 400", async () => {
  const res = await request(app).post("/api/waitlist").set(auth(basic)).send({});
  assert.equal(res.status, 400);
});

test("US2.5: unknown class returns 404", async () => {
  const res = await join(basic, new mongoose.Types.ObjectId());
  assert.equal(res.status, 404);
});

test("US2.5: a class with spare capacity returns 400 (book it instead)", async () => {
  const res = await join(basic, openClass._id);
  assert.equal(res.status, 400);
  assert.equal(await Waitlist.countDocuments(), 0);
});

test("US2.5: joining a full class returns 201 with the queue position", async () => {
  const first = await join(basic, fullClass._id);
  const second = await join(premium, fullClass._id);

  assert.equal(first.status, 201);
  assert.equal(first.body.position, 1);
  assert.equal(second.status, 201);
  assert.equal(second.body.position, 2);
});

test("US2.5: joining the same waitlist twice returns 409", async () => {
  await join(basic, fullClass._id);
  const again = await join(basic, fullClass._id);

  assert.equal(again.status, 409);
  assert.equal(await Waitlist.countDocuments(), 1);
});

test("US2.5: a member already booked into the class gets 409", async () => {
  const res = await join(holder, fullClass._id);
  assert.equal(res.status, 409);
});

test("US2.3: a deactivated member cannot join a waitlist (403)", async () => {
  const res = await join(inactive, fullClass._id);
  assert.equal(res.status, 403);
});

test("US2.3: a deactivated member cannot book a class (403)", async () => {
  const res = await request(app)
    .post("/api/bookings")
    .set(auth(inactive))
    .send({ classId: String(openClass._id) });
  assert.equal(res.status, 403);
});

// ---- US2.6 View and leave waitlist ----

test("US2.6: a member sees their own entries with positions", async () => {
  await join(basic, fullClass._id);
  await join(premium, fullClass._id);

  const res = await request(app).get("/api/waitlist/mine").set(auth(premium));

  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].position, 2);
});

test("US2.6: removing another member's entry returns 403 and keeps it", async () => {
  await join(basic, fullClass._id);
  const entry = await Waitlist.findOne({ member: basic._id });

  const res = await request(app).delete(`/api/waitlist/${entry._id}`).set(auth(premium));

  assert.equal(res.status, 403);
  assert.ok(await Waitlist.findById(entry._id));
});

test("US2.6: a malformed entry id returns 404", async () => {
  const res = await request(app).delete("/api/waitlist/not-an-id").set(auth(basic));
  assert.equal(res.status, 404);
});

test("US2.6: leaving moves everyone behind up by one", async () => {
  await join(basic, fullClass._id);
  await join(premium, fullClass._id);
  const entry = await Waitlist.findOne({ member: basic._id });

  const leave = await request(app).delete(`/api/waitlist/${entry._id}`).set(auth(basic));
  const mine = await request(app).get("/api/waitlist/mine").set(auth(premium));

  assert.equal(leave.status, 200);
  assert.equal(mine.body[0].position, 1);
});

// ---- US2.7 Promotion through the real cancel endpoint ----

test("US2.7 Premium strategy: cancelling promotes Premium over an earlier Basic", async () => {
  await Waitlist.create([
    { member: basic._id, class: fullClass._id, joinedAt: new Date("2030-01-01T09:00:00Z") },
    { member: premium._id, class: fullClass._id, joinedAt: new Date("2030-01-01T10:00:00Z") },
  ]);

  const res = await request(app).delete(`/api/bookings/${holderBooking._id}`).set(auth(holder));

  assert.equal(res.status, 200);
  assert.ok(await Booking.exists({ user: premium._id, class: fullClass._id }));
  const remaining = await Waitlist.find({ class: fullClass._id });
  assert.deepEqual(remaining.map((e) => String(e.member)), [String(basic._id)]);
});

test("US2.7 Basic strategy: between two Basic members the earlier join wins", async () => {
  await Waitlist.create([
    { member: basic2._id, class: fullClass._id, joinedAt: new Date("2030-01-01T10:00:00Z") },
    { member: basic._id, class: fullClass._id, joinedAt: new Date("2030-01-01T09:00:00Z") },
  ]);

  await request(app).delete(`/api/bookings/${holderBooking._id}`).set(auth(holder));

  assert.ok(await Booking.exists({ user: basic._id, class: fullClass._id }));
  assert.equal(await Booking.exists({ user: basic2._id, class: fullClass._id }), null);
});
