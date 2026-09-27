const test = require("node:test");
const assert = require("node:assert/strict");
const RescheduleBookingCommand = require("../src/commands/RescheduleBookingCommand");
const {
  BookingService,
  BookingServiceError,
} = require("../src/services/BookingService");

const ids = {
  member: "64b000000000000000000001",
  booking: "64b000000000000000000002",
  source: "64b000000000000000000003",
  target: "64b000000000000000000004",
};

function createFixture({ targetCount = 2, targetCapacity = 5 } = {}) {
  let saveCount = 0;
  const booking = {
    _id: ids.booking,
    user: ids.member,
    class: ids.source,
    async save() {
      saveCount += 1;
    },
  };
  const classes = {
    [ids.source]: {
      _id: ids.source,
      classDateTime: "2030-01-01T09:00:00.000Z",
      capacity: 10,
    },
    [ids.target]: {
      _id: ids.target,
      classDateTime: "2030-01-02T09:00:00.000Z",
      capacity: targetCapacity,
    },
  };
  const Booking = {
    findById: async () => booking,
    exists: async () => false,
    countDocuments: async () => targetCount,
  };
  const Class = { findById: async (id) => classes[id] ?? null };
  const User = {
    findById: async () => ({ _id: ids.member, status: "active" }),
  };

  return {
    booking,
    getSaveCount: () => saveCount,
    service: new BookingService({
      Booking,
      Class,
      User,
      now: () => new Date("2029-01-01T00:00:00.000Z"),
    }),
  };
}

test("command moves the existing booking and reports remaining capacity", async () => {
  const fixture = createFixture();
  const command = new RescheduleBookingCommand({
    actorId: ids.member,
    bookingId: ids.booking,
    targetClassId: ids.target,
    bookingService: fixture.service,
  });

  const result = await command.execute();

  assert.equal(result.booking._id, ids.booking);
  assert.equal(result.booking.user, ids.member);
  assert.equal(result.booking.class, ids.target);
  assert.equal(result.sourceClassId, ids.source);
  assert.equal(result.availableSpots, 2);
  assert.equal(fixture.getSaveCount(), 1);
});

test("same-class request is rejected without changing the booking", async () => {
  const fixture = createFixture();

  await assert.rejects(
    fixture.service.rescheduleBooking({
      actorId: ids.member,
      bookingId: ids.booking,
      targetClassId: ids.source,
    }),
    (error) =>
      error instanceof BookingServiceError &&
      error.status === 400 &&
      error.message === "Choose a different class to reschedule."
  );

  assert.equal(fixture.booking.class, ids.source);
  assert.equal(fixture.getSaveCount(), 0);
});

test("full destination is rejected without losing the original booking", async () => {
  const fixture = createFixture({ targetCount: 5, targetCapacity: 5 });

  await assert.rejects(
    fixture.service.rescheduleBooking({
      actorId: ids.member,
      bookingId: ids.booking,
      targetClassId: ids.target,
    }),
    (error) =>
      error instanceof BookingServiceError &&
      error.status === 409 &&
      error.message === "The destination class is full."
  );

  assert.equal(fixture.booking.class, ids.source);
  assert.equal(fixture.getSaveCount(), 0);
});
