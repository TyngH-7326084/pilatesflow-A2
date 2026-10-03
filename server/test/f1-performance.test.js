// PF-23 (NFR-F1): Slot generation performance.
// Requirement: generating recurring class slots across a date range of up to
// 12 weeks shall complete within 2 seconds.
//
// The Class and Instructor models are replaced with in-memory fakes, and each
// database call is given a simulated delay (SIMULATED_DB_LATENCY_MS) so the
// measurement reflects realistic round trips to MongoDB, not just the
// in-memory generation logic. 12 weeks = 12 clash checks + 12 inserts.

const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");

const Instructor = require("../src/models/Instructor");
const Class = require("../src/models/Class");
const { generateSlots } = require("../src/controllers/instructorController");

const TIME_LIMIT_MS = 2000;
const SIMULATED_DB_LATENCY_MS = 25;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

describe("NFR-F1 Slot generation performance (PF-23)", () => {
  it(`generates 12 weeks of classes in under ${TIME_LIMIT_MS} ms`, async () => {
    const availability = [
      { _id: "slot1", dayOfWeek: "Wednesday", startTime: "09:00", endTime: "10:00" },
    ];
    availability.id = (id) => availability.find((slot) => slot._id === id) ?? null;
    const instructor = { _id: "64b0000000000000000000a1", name: "Lisa Turner", availability };

    stub(Instructor, "findById", async () => {
      await delay(SIMULATED_DB_LATENCY_MS);
      return instructor;
    });
    stub(Class, "findOne", async () => {
      await delay(SIMULATED_DB_LATENCY_MS);
      return null;
    });
    let createCount = 0;
    stub(Class, "create", async (doc) => {
      await delay(SIMULATED_DB_LATENCY_MS);
      createCount += 1;
      return { _id: `class${createCount}`, ...doc };
    });

    const res = fakeRes();
    const start = performance.now();
    await generateSlots(
      {
        params: { id: instructor._id },
        body: {
          slotId: "slot1",
          className: "Reformer Beginner",
          capacity: 10,
          startDate: "2026-09-28",
          numberOfWeeks: 12,
        },
        user: { sub: "admin1" },
      },
      res
    );
    const elapsed = performance.now() - start;

    console.log(
      `    12-week generation took ${elapsed.toFixed(0)} ms ` +
        `(limit ${TIME_LIMIT_MS} ms, ${SIMULATED_DB_LATENCY_MS} ms simulated latency per DB call)`
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.created.length, 12);
    assert.ok(
      elapsed < TIME_LIMIT_MS,
      `Generation took ${elapsed.toFixed(0)} ms, exceeding the ${TIME_LIMIT_MS} ms limit`
    );
  });
});