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

function createFixture({
  targetCount = 2,
  targetCapacity = 5,
  memberId = ids.member,
  bookingUser = ids.member,
  sourceStatus = "published",
  targetStatus = "published",
  sourceDate = "2030-01-01T09:00:00.000Z",
  targetDate = "2030-01-02T09:00:00.000Z",
  duplicate = false,
  missingBooking = false,
  missingSource = false,
  missingTarget = false,
  afterBookingUpdate,
} = {}) {
  let saveCount = 0;
  const booking = {
    _id: ids.booking,
    user: bookingUser,
    class: ids.source,
    async save() {
      saveCount += 1;
    },
  };
  const classes = {
    [ids.source]: {
      _id: ids.source,
      classDateTime: sourceDate,
      capacity: 10,
      status: sourceStatus,
    },
    [ids.target]: {
      _id: ids.target,
      classDateTime: targetDate,
      capacity: targetCapacity,
      status: targetStatus,
    },
  };
  const Booking = {
    findById: async () => (missingBooking ? null : booking),
    exists: async () => duplicate,
    countDocuments: async () => targetCount,
  };
  const Class = {
    findById: async (id) => {
      if (id === ids.source && missingSource) return null;
      if (id === ids.target && missingTarget) return null;
      return classes[id] ?? null;
    },
  };
  const User = {
    findById: async () => ({ _id: memberId, status: "active" }),
  };

  const runInTransaction = async (operation) => {
    const originalClassId = booking.class;
    try {
      return await operation({ id: "test-session" });
    } catch (error) {
      booking.class = originalClassId;
      throw error;
    }
  };

  return {
    booking,
    getSaveCount: () => saveCount,
    service: new BookingService({
      Booking,
      Class,
      User,
      now: () => new Date("2029-01-01T00:00:00.000Z"),
      runInTransaction,
      afterBookingUpdate,
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

test("malformed booking and destination IDs are rejected before database access", async () => {
  const fixture = createFixture();

  await assert.rejects(
    fixture.service.rescheduleBooking({
      actorId: ids.member,
      bookingId: "not-an-id",
      targetClassId: ids.target,
    }),
    (error) => error.status === 400 && /bookingId/.test(error.message)
  );

  await assert.rejects(
    fixture.service.rescheduleBooking({
      actorId: ids.member,
      bookingId: ids.booking,
      targetClassId: "not-an-id",
    }),
    (error) => error.status === 400 && /targetClassId/.test(error.message)
  );
});

test("missing booking and destination class return 404", async () => {
  const missingBooking = createFixture({ missingBooking: true });
  await assert.rejects(
    missingBooking.service.rescheduleBooking({
      actorId: ids.member,
      bookingId: ids.booking,
      targetClassId: ids.target,
    }),
    (error) => error.status === 404 && error.message === "Booking not found."
  );

  const missingTarget = createFixture({ missingTarget: true });
  await assert.rejects(
    missingTarget.service.rescheduleBooking({
      actorId: ids.member,
      bookingId: ids.booking,
      targetClassId: ids.target,
    }),
    (error) =>
      error.status === 404 && error.message === "Destination class not found."
  );
});

test("another member cannot reschedule the booking", async () => {
  const otherMember = "64b000000000000000000099";
  const fixture = createFixture({ bookingUser: otherMember });

  await assert.rejects(
    fixture.service.rescheduleBooking({
      actorId: ids.member,
      bookingId: ids.booking,
      targetClassId: ids.target,
    }),
    (error) =>
      error.status === 403 &&
      error.message === "You can only reschedule your own bookings."
  );
  assert.equal(fixture.booking.class, ids.source);
});

test("past or unpublished classes and duplicate bookings are rejected", async () => {
  const cases = [
    {
      fixture: createFixture({ sourceDate: "2028-12-31T23:59:59.000Z" }),
      message: "Current class has already started.",
    },
    {
      fixture: createFixture({ targetStatus: "cancelled" }),
      message: "Destination class is not published.",
    },
    {
      fixture: createFixture({ duplicate: true }),
      message: "You already have a booking for the destination class.",
    },
  ];

  for (const { fixture, message } of cases) {
    await assert.rejects(
      fixture.service.rescheduleBooking({
        actorId: ids.member,
        bookingId: ids.booking,
        targetClassId: ids.target,
      }),
      (error) => error.status === 409 && error.message === message
    );
    assert.equal(fixture.booking.class, ids.source);
  }
});

test("a failure after the booking update rolls the entire move back", async () => {
  const fixture = createFixture({
    afterBookingUpdate: async () => {
      throw new Error("simulated transaction failure");
    },
  });

  await assert.rejects(
    fixture.service.rescheduleBooking({
      actorId: ids.member,
      bookingId: ids.booking,
      targetClassId: ids.target,
    }),
    /simulated transaction failure/
  );

  assert.equal(fixture.booking.class, ids.source);
});
