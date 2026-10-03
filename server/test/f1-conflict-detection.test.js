// PF-22 (US1.4): Functional tests for F1 conflict detection.
// Covers the three conflict rules in F1:
//   F1-02  overlapping availability slots are rejected
//   F1-03  generated classes that clash with an existing class are skipped and reported
//   F1-01  instructors with upcoming classes cannot be deleted
//
// Uses Node's built-in test runner (same as test/f4-reschedule.test.js).
// The Mongoose models are replaced with in-memory fakes for each test,
// so no database connection is needed and the tests can run in CI.

const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const Instructor = require("../src/models/Instructor");
const Class = require("../src/models/Class");
const RecurrenceGeneratorFactory = require("../src/patterns/RecurrenceGeneratorFactory");
const {
  addAvailability,
  generateSlots,
  deleteInstructor,
} = require("../src/controllers/instructorController");

// ---- Helpers ----

// Temporarily replaces a model method; every replacement is undone after each test.
const restores = [];
function stub(obj, method, impl) {
  const hadOwn = Object.prototype.hasOwnProperty.call(obj, method);
  const original = obj[method];
  obj[method] = impl;
  restores.push(() => {
    if (hadOwn) obj[method] = original;
    else delete obj[method];
  });
}
afterEach(() => {
  while (restores.length) restores.pop()();
});

// Minimal Express response object that records the status code and JSON body.
function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

// In-memory instructor with an availability array that supports .id(), like a Mongoose subdocument array.
function fakeInstructor(slots = []) {
  const availability = slots.map((slot, i) => ({ _id: `slot${i + 1}`, ...slot }));
  availability.id = (id) => availability.find((slot) => slot._id === id) ?? null;

  let saveCount = 0;
  let deleted = false;
  const instructor = {
    _id: "64b0000000000000000000a1",
    name: "Lisa Turner",
    availability,
    async save() {
      saveCount += 1;
      return this;
    },
    async deleteOne() {
      deleted = true;
    },
  };
  return { instructor, getSaveCount: () => saveCount, wasDeleted: () => deleted };
}

const WEDNESDAY_9AM = { dayOfWeek: "Wednesday", startTime: "09:00", endTime: "10:00" };

// ---- F1-02: availability overlap detection ----

describe("F1-02 Availability conflict detection (US1.2)", () => {
  async function addSlot(existingSlots, newSlot) {
    const fixture = fakeInstructor(existingSlots);
    stub(Instructor, "findById", async () => fixture.instructor);
    const res = fakeRes();
    await addAvailability({ params: { id: fixture.instructor._id }, body: newSlot }, res);
    return { res, fixture };
  }

  it("rejects a slot that overlaps an existing slot on the same day", async () => {
    const { res, fixture } = await addSlot([WEDNESDAY_9AM], {
      dayOfWeek: "Wednesday",
      startTime: "09:30",
      endTime: "10:30",
    });

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /overlaps an existing availability slot on Wednesday/);
    assert.equal(fixture.instructor.availability.length, 1);
    assert.equal(fixture.getSaveCount(), 0);
  });

  it("rejects a slot that completely contains an existing slot", async () => {
    const { res, fixture } = await addSlot([WEDNESDAY_9AM], {
      dayOfWeek: "Wednesday",
      startTime: "08:00",
      endTime: "11:00",
    });

    assert.equal(res.statusCode, 400);
    assert.equal(fixture.getSaveCount(), 0);
  });

  it("accepts the same time on a different day", async () => {
    const { res, fixture } = await addSlot([WEDNESDAY_9AM], {
      dayOfWeek: "Thursday",
      startTime: "09:00",
      endTime: "10:00",
    });

    assert.equal(res.statusCode, 201);
    assert.equal(fixture.instructor.availability.length, 2);
    assert.equal(fixture.getSaveCount(), 1);
  });

  it("accepts a back-to-back slot that starts when the existing one ends", async () => {
    const { res, fixture } = await addSlot([WEDNESDAY_9AM], {
      dayOfWeek: "Wednesday",
      startTime: "10:00",
      endTime: "11:00",
    });

    assert.equal(res.statusCode, 201);
    assert.equal(fixture.instructor.availability.length, 2);
  });

  it("rejects a slot whose start time is not before its end time", async () => {
    const { res, fixture } = await addSlot([], {
      dayOfWeek: "Wednesday",
      startTime: "10:00",
      endTime: "09:00",
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "startTime must be before endTime.");
    assert.equal(fixture.getSaveCount(), 0);
  });
});

// ---- F1-03: recurring class clash detection ----

describe("F1-03 Recurring slot clash detection (US1.3)", () => {
  const body = {
    slotId: "slot1",
    className: "Reformer Beginner",
    capacity: 10,
    startDate: "2026-09-28",
    numberOfWeeks: 4,
  };

  // Builds the exact dates the controller will try, using the same factory it uses.
  function expectedDates(instructor) {
    return RecurrenceGeneratorFactory.getGenerator("weekly")
      .generate({
        instructor,
        availabilitySlot: instructor.availability[0],
        className: body.className,
        capacity: body.capacity,
        startDate: new Date(body.startDate),
        numberOfWeeks: body.numberOfWeeks,
      })
      .map((candidate) => candidate.classDateTime);
  }

  // Fakes the Class collection: `existing` holds the dates that already have a class.
  function setUp(existing = []) {
    const fixture = fakeInstructor([WEDNESDAY_9AM]);
    stub(Instructor, "findById", async () => fixture.instructor);

    let createCount = 0;
    stub(Class, "findOne", async (query) =>
      existing.some((date) => date.getTime() === query.classDateTime.getTime())
        ? { className: "Reformer Beginner" }
        : null
    );
    stub(Class, "create", async (doc) => {
      createCount += 1;
      return { _id: `class${createCount}`, ...doc };
    });
    return { fixture, getCreateCount: () => createCount };
  }

  async function generate(fixture) {
    const res = fakeRes();
    await generateSlots(
      { params: { id: fixture.instructor._id }, body, user: { sub: "admin1" } },
      res
    );
    return res;
  }

  it("creates one class per week on the slot's day and start time", async () => {
    const { fixture } = setUp();
    const res = await generate(fixture);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.created.length, 4);
    assert.equal(res.body.skipped.length, 0);
    for (const created of res.body.created) {
      assert.equal(created.classDateTime.getDay(), 3); // Wednesday
      assert.equal(created.classDateTime.getHours(), 9);
      assert.equal(created.classDateTime.getMinutes(), 0);
      assert.equal(created.createdBy, "admin1");
    }
  });

  it("skips and reports an occurrence that clashes with an existing class", async () => {
    const probe = fakeInstructor([WEDNESDAY_9AM]).instructor;
    const clashDate = expectedDates(probe)[1]; // the second week already has a class
    const { fixture, getCreateCount } = setUp([clashDate]);

    const res = await generate(fixture);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.created.length, 3);
    assert.equal(res.body.skipped.length, 1);
    assert.equal(res.body.skipped[0].classDateTime.getTime(), clashDate.getTime());
    assert.match(res.body.skipped[0].reason, /already has a class at this exact date\/time/);
    assert.equal(getCreateCount(), 3);
  });

  it("creates nothing when every occurrence clashes", async () => {
    const probe = fakeInstructor([WEDNESDAY_9AM]).instructor;
    const { fixture, getCreateCount } = setUp(expectedDates(probe));

    const res = await generate(fixture);

    assert.equal(res.body.created.length, 0);
    assert.equal(res.body.skipped.length, 4);
    assert.equal(getCreateCount(), 0);
  });
});

// ---- F1-01: deletion blocked by upcoming classes ----

describe("F1-01 Instructor deletion guard (US1.1)", () => {
  function setUp(upcomingCount) {
    const fixture = fakeInstructor([WEDNESDAY_9AM]);
    stub(Instructor, "findById", async () => fixture.instructor);

    let lastQuery;
    stub(Class, "countDocuments", async (query) => {
      lastQuery = query;
      return upcomingCount;
    });
    return { fixture, getLastQuery: () => lastQuery };
  }

  it("blocks deleting an instructor who has upcoming classes", async () => {
    const { fixture } = setUp(4);
    const res = fakeRes();

    await deleteInstructor({ params: { id: fixture.instructor._id } }, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /4 upcoming class\(es\)/);
    assert.equal(fixture.wasDeleted(), false);
  });

  it("only counts future-dated classes as upcoming", async () => {
    const { fixture, getLastQuery } = setUp(0);
    const before = Date.now();

    await deleteInstructor({ params: { id: fixture.instructor._id } }, fakeRes());

    const query = getLastQuery();
    assert.equal(query.instructor, fixture.instructor._id);
    assert.ok(query.classDateTime.$gte instanceof Date);
    assert.ok(query.classDateTime.$gte.getTime() >= before);
  });

  it("allows deleting an instructor with no upcoming classes", async () => {
    const { fixture } = setUp(0);
    const res = fakeRes();

    await deleteInstructor({ params: { id: fixture.instructor._id } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.message, "Instructor deleted successfully.");
    assert.equal(fixture.wasDeleted(), true);
  });
});