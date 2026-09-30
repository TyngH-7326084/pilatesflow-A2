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

  const result = await bookingService.createBooking({
    actorId: req.user.sub,
    classId,
  });
  return res.status(201).json(result);
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
  await bookingService.cancelBooking({
    actorId: req.user.sub,
    bookingId: req.params.id,
  });
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
