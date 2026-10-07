const test = require("node:test");
const assert = require("node:assert/strict");
const PromotionService = require("../src/services/PromotionService");
const { BookingService } = require("../src/services/BookingService");

const CLASS_A = "a".repeat(24);
const CLASS_B = "b".repeat(24);

let counter = 0;
const newId = () => (++counter).toString(16).padStart(24, "0");

// In-memory fakes shared by BookingService and PromotionService, so a cancel or
// reschedule runs the real promotion path without a database.
function setup(waitlisted = []) {
  const store = { users: {}, bookings: [], waitlist: [] };
  const classes = {
    [CLASS_A]: { _id: CLASS_A, capacity: 1, classDateTime: "2030-01-01T09:00:00.000Z", status: "Published" },
    [CLASS_B]: { _id: CLASS_B, capacity: 10, classDateTime: "2030-01-02T09:00:00.000Z", status: "Published" },
  };

  const addUser = (tier, status = "active") => {
    const user = { _id: newId(), tier, status };
    store.users[user._id] = user;
    return user;
  };

  const addBooking = (fields) => {
    const booking = {
      _id: newId(),
      ...fields,
      async save() {},
      async deleteOne() {
        store.bookings = store.bookings.filter((b) => b !== booking);
      },
    };
    store.bookings.push(booking);
    return booking;
  };

  const Booking = {
    create: async (docs) => docs.map(addBooking),
    countDocuments: async ({ class: classId }) =>
      store.bookings.filter((b) => String(b.class) === String(classId)).length,
    findById: async (bookingId) => store.bookings.find((b) => b._id === bookingId) ?? null,
    exists: async () => false,
  };
  const Class = {
    findById: async (classId) => classes[classId] ?? null,
    findOneAndUpdate: async ({ _id }) => classes[_id] ?? null,
  };
  const User = {
    findById: async (userId) => store.users[userId] ?? null,
  };
  // populate() reads the user at call time, so a tier change after joining is visible.
  const Waitlist = {
    find: ({ class: classId }) => ({
      populate: async () =>
        store.waitlist
          .filter((e) => String(e.class) === String(classId))
          .map((e) => ({
            ...e,
            member: store.users[e.member] ?? null,
            async deleteOne() {
              store.waitlist = store.waitlist.filter((x) => x._id !== e._id);
            },
          })),
    }),
  };

  const runInTransaction = (operation) => operation(null);
  const promotionService = new PromotionService({ Waitlist, Booking, Class, runInTransaction });
  const bookingService = new BookingService({
    Booking,
    Class,
    User,
    runInTransaction,
    afterCapacityRelease: ({ sourceClassId }) => promotionService.promoteNext({ sourceClassId }),
  });

  // Class A starts full: its one seat is held by seatHolder.
  const seatHolder = addUser("basic");
  const seatBooking = addBooking({ user: seatHolder._id, class: CLASS_A });

  const members = waitlisted.map(({ tier, joinedAt, status }) => {
    const member = addUser(tier, status);
    store.waitlist.push({
      _id: newId(),
      member: member._id,
      class: CLASS_A,
      joinedAt: new Date(`2030-01-01T${joinedAt}:00.000Z`),
    });
    return member;
  });

  const bookedIn = (classId) =>
    store.bookings.filter((b) => b.class === classId).map((b) => b.user);
  const cancelSeat = () =>
    bookingService.cancelBooking({ actorId: seatHolder._id, bookingId: seatBooking._id });

  return { store, members, seatHolder, seatBooking, bookingService, promotionService, bookedIn, cancelSeat };
}

test("cancelling promotes a Premium member (joined 10:00) over a Basic member (joined 09:00)", async () => {
  const { members: [premium], bookedIn, cancelSeat } = setup([
    { tier: "premium", joinedAt: "10:00" },
    { tier: "basic", joinedAt: "09:00" },
  ]);

  await cancelSeat();

  assert.deepEqual(bookedIn(CLASS_A), [premium._id]);
});

test("within the same tier the earlier join time wins", async () => {
  const { members: [, early], bookedIn, cancelSeat } = setup([
    { tier: "basic", joinedAt: "10:00" },
    { tier: "basic", joinedAt: "09:00" },
  ]);

  await cancelSeat();

  assert.deepEqual(bookedIn(CLASS_A), [early._id]);
});

test("promotion creates a booking and removes only the promoted waitlist entry", async () => {
  const { members: [premium, basic], store, cancelSeat } = setup([
    { tier: "premium", joinedAt: "10:00" },
    { tier: "basic", joinedAt: "09:00" },
  ]);

  await cancelSeat();

  assert.ok(store.bookings.some((b) => b.user === premium._id && b.class === CLASS_A));
  assert.deepEqual(store.waitlist.map((e) => e.member), [basic._id]);
});

test("cancelling with an empty waitlist returns the seat to capacity", async () => {
  const { store, bookedIn, cancelSeat } = setup([]);

  await cancelSeat();

  assert.deepEqual(bookedIn(CLASS_A), []);
  assert.equal(store.waitlist.length, 0);
});

test("a member downgraded while waitlisted is ranked at their current tier", async () => {
  const { members: [downgraded, basic], bookedIn, cancelSeat } = setup([
    { tier: "premium", joinedAt: "10:00" },
    { tier: "basic", joinedAt: "09:00" },
  ]);
  downgraded.tier = "basic"; // downgraded after joining the waitlist

  await cancelSeat();

  assert.deepEqual(bookedIn(CLASS_A), [basic._id]);
});

test("a seat freed by an F4 reschedule runs the same promotion path", async () => {
  const { members: [premium], seatHolder, seatBooking, bookingService, bookedIn } = setup([
    { tier: "premium", joinedAt: "10:00" },
  ]);

  await bookingService.rescheduleBooking({
    actorId: seatHolder._id,
    bookingId: seatBooking._id,
    targetClassId: CLASS_B,
  });

  assert.deepEqual(bookedIn(CLASS_A), [premium._id]);
  assert.deepEqual(bookedIn(CLASS_B), [seatHolder._id]);
});

test("an inactive member is skipped", async () => {
  const { members: [, active], bookedIn, cancelSeat } = setup([
    { tier: "premium", joinedAt: "08:00", status: "inactive" },
    { tier: "basic", joinedAt: "09:00" },
  ]);

  await cancelSeat();

  assert.deepEqual(bookedIn(CLASS_A), [active._id]);
});

test("no promotion happens while the class is still full", async () => {
  const { store, promotionService } = setup([{ tier: "premium", joinedAt: "10:00" }]);

  const result = await promotionService.promoteNext({ sourceClassId: CLASS_A });

  assert.equal(result, null);
  assert.equal(store.waitlist.length, 1);
});
