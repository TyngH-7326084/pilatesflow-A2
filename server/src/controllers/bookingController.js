const Booking = require("../models/Booking");
const Class = require("../models/Class");
const User = require("../models/User");
const RescheduleBookingCommand = require("../commands/RescheduleBookingCommand");
const { BookingService } = require("../services/BookingService");

const bookingService = new BookingService({ Booking, Class, User });

// POST /api/bookings  (Member only, requireAuth)
// US5 acceptance criteria: capacity check, duplicate check, success/error messaging
async function createBooking(req, res) {
  const { classId } = req.body;

  if (!classId) {
    return res.status(400).json({ error: "classId is required." });
  }

  // US2.3 AC: deactivated members are blocked from making new bookings.
  const bookingUser = await User.findById(req.user.sub);
  if (!bookingUser || bookingUser.status === "inactive") {
    return res.status(403).json({ error: "Your account is deactivated." });
  }

  const targetClass = await Class.findById(classId);
  if (!targetClass) {
    return res.status(404).json({ error: "Class not found." });
  }

  // US5 acceptance criteria: block booking once class is at capacity
  const bookedCount = await Booking.countDocuments({ class: classId });
  if (bookedCount >= targetClass.capacity) {
    return res.status(400).json({ error: "This class is full." });
  }

  try {
    const booking = await Booking.create({
      user: req.user.sub,
      class: classId,
    });
    return res.status(201).json({
      booking,
      availableSpots: targetClass.capacity - (bookedCount + 1),
    });
  } catch (err) {
    // Duplicate key error from the unique index = already booked
    if (err.code === 11000) {
      return res.status(400).json({ error: "You have already booked this class." });
    }
    return res.status(500).json({ error: "Could not create booking." });
  }
}

// GET /api/bookings/mine  (Member only, requireAuth)
async function getMyBookings(req, res) {
  try {
    const bookings = await Booking.find({ user: req.user.sub })
      .populate("class")
      .sort({ createdAt: -1 });
    return res.json(bookings);
  } catch (err) {
    return res.status(500).json({ error: "Could not load your bookings." });
  }
}

// DELETE /api/bookings/:id  (Member only, requireAuth, must own booking)
async function cancelBooking(req, res) {
  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return res.status(404).json({ error: "Booking not found." });
  }
  if (booking.user.toString() !== req.user.sub) {
    return res.status(403).json({ error: "You can only cancel your own bookings." });
  }

  await booking.deleteOne();
  return res.json({ message: "Booking cancelled." });
}

// PATCH /api/bookings/:id/reschedule (Member only, requireAuth)
// PF-46: retain the booking identity while moving it to an eligible class.
async function rescheduleBooking(req, res) {
  const command = new RescheduleBookingCommand({
    actorId: req.user.sub,
    bookingId: req.params.id,
    targetClassId: req.body?.targetClassId,
    bookingService,
  });

  const result = await command.execute();
  return res.json({
    message: "Booking rescheduled successfully.",
    ...result,
  });
}

module.exports = {
  createBooking,
  getMyBookings,
  cancelBooking,
  rescheduleBooking,
};
