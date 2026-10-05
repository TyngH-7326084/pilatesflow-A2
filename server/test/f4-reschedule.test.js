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
  sourceStatus = "Published",
  targetStatus = "Published",
  sourceDate = "2030-01-01T09:00:00.000Z",
  targetDate = "2030-01-02T09:00:00.000Z",
  duplicate = false,
  missingBooking = false,
  missingSource = false,
  missingTarget = false,
  afterBookingUpdate,
  afterCapacityRelease,
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
    findOneAndUpdate: async ({ _id }) => {
      if (_id === ids.source && missingSource) return null;
      if (_id === ids.target && missingTarget) return null;
      return classes[_id] ?? null;
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
      afterCapacityRelease,
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
      fixture: createFixture({ targetStatus: "Cancelled" }),
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
  let promotionAttempts = 0;
  const fixture = createFixture({
    afterBookingUpdate: async () => {
      throw new Error("simulated transaction failure");
    },
    afterCapacityRelease: async () => {
      promotionAttempts += 1;
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
  assert.equal(promotionAttempts, 0);
});

function createConcurrentFixture() {
  const members = {
    one: ids.member,
    two: "64b000000000000000000011",
  };
  const existingBooking = {
    _id: ids.booking,
    user: members.one,
    class: ids.source,
    async save() {},
  };
  const bookings = [existingBooking];
  const classes = {
    [ids.source]: {
      _id: ids.source,
      classDateTime: "2030-01-01T09:00:00.000Z",
      capacity: 5,
      status: "Published",
    },
    [ids.target]: {
      _id: ids.target,
      classDateTime: "2030-01-02T09:00:00.000Z",
      capacity: 1,
      status: "Published",
    },
  };
  let transactionQueue = Promise.resolve();

  const runInTransaction = async (operation) => {
    const previous = transactionQueue;
    let release;
    transactionQueue = new Promise((resolve) => {
      release = resolve;
    });
    await previous;

    const snapshot = bookings.map((booking) => ({ ...booking }));
    try {
      return await operation({ id: "serialized-database-session" });
    } catch (error) {
      bookings.splice(0, bookings.length, ...snapshot);
      existingBooking.class = ids.source;
      throw error;
    } finally {
      release();
    }
  };

  const Booking = {
    findById: async (id) => bookings.find((booking) => booking._id === id),
    exists: async ({ _id, user, class: classId }) =>
      bookings.some(
        (booking) =>
          (!_id?.$ne || booking._id !== _id.$ne) &&
          booking.user === user &&
          booking.class === classId
      ),
    countDocuments: async ({ class: classId }) =>
      bookings.filter((booking) => booking.class === classId).length,
    create: async ([values]) => {
      const booking = {
        _id: "64b000000000000000000012",
        ...values,
      };
      bookings.push(booking);
      return [booking];
    },
  };
  const Class = {
    findById: async (id) => classes[id] ?? null,
    findOneAndUpdate: async ({ _id }) => classes[_id] ?? null,
  };
  const User = {
    findById: async (id) => ({ _id: id, status: "active" }),
  };
  const service = new BookingService({
    Booking,
    Class,
    User,
    now: () => new Date("2029-01-01T00:00:00.000Z"),
    runInTransaction,
  });

  return { bookings, existingBooking, members, service };
}

test("two members racing for the final place produce exactly one booking", async () => {
  const fixture = createConcurrentFixture();

  const results = await Promise.allSettled([
    fixture.service.createBooking({
      actorId: fixture.members.two,
      classId: ids.target,
    }),
    fixture.service.rescheduleBooking({
      actorId: fixture.members.one,
      bookingId: ids.booking,
      targetClassId: ids.target,
    }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(
    fixture.bookings.filter((booking) => booking.class === ids.target).length,
    1
  );

  if (fixture.existingBooking.class !== ids.target) {
    assert.equal(fixture.existingBooking.class, ids.source);
  }
});

test("reschedule options exclude current, booked, past, unpublished, and full classes", async () => {
  const otherBookedClassId = "64b000000000000000000020";
  const openClassId = "64b000000000000000000021";
  const fullClassId = "64b000000000000000000022";
  let receivedClassQuery;

  const Booking = {
    findById: async () => ({
      _id: ids.booking,
      user: ids.member,
      class: ids.source,
    }),
    find: () => ({
      select: async () => [{ class: otherBookedClassId }],
    }),
    countDocuments: async ({ class: classId }) =>
      String(classId) === fullClassId ? 2 : 1,
  };
  const Class = {
    findById: async () => ({
      _id: ids.source,
      classDateTime: "2030-01-01T09:00:00.000Z",
      status: "Published",
    }),
    find: (query) => ({
      sort: async () => {
        receivedClassQuery = query;
        return [
          {
            _id: openClassId,
            className: "Open class",
            classDateTime: "2030-01-02T09:00:00.000Z",
            status: "Published",
            capacity: 3,
          },
          {
            _id: fullClassId,
            className: "Full class",
            classDateTime: "2030-01-03T09:00:00.000Z",
            status: "Published",
            capacity: 2,
          },
        ];
      },
    }),
  };
  const service = new BookingService({
    Booking,
    Class,
    User: {},
    now: () => new Date("2029-01-01T00:00:00.000Z"),
  });

  const options = await service.getRescheduleOptions({
    actorId: ids.member,
    bookingId: ids.booking,
  });

  assert.deepEqual(receivedClassQuery._id.$nin, [
    ids.source,
    otherBookedClassId,
  ]);
  assert.equal(
    receivedClassQuery.classDateTime.$gt.toISOString(),
    "2029-01-01T00:00:00.000Z"
  );
  assert.equal(receivedClassQuery.$or[0].status.toString(), "/^published$/i");
  assert.deepEqual(receivedClassQuery.$or[1], {
    status: { $exists: false },
  });
  assert.equal(options.length, 1);
  assert.equal(options[0]._id, openClassId);
  assert.equal(options[0].availableSpots, 2);
});
