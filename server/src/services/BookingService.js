const mongoose = require("mongoose");

class BookingServiceError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "BookingServiceError";
    this.status = status;
  }
}

class BookingService {
  constructor({ Booking, Class, User, now = () => new Date() }) {
    this.Booking = Booking;
    this.Class = Class;
    this.User = User;
    this.now = now;
  }

  assertValidId(value, fieldName) {
    if (!value || !mongoose.Types.ObjectId.isValid(value)) {
      throw new BookingServiceError(400, `${fieldName} must be a valid ID.`);
    }
  }

  assertEligibleClass(targetClass, label) {
    if (new Date(targetClass.classDateTime) <= this.now()) {
      throw new BookingServiceError(409, `${label} class has already started.`);
    }

    // F3 will add the status field. Once present, only published classes are eligible.
    if (
      targetClass.status &&
      String(targetClass.status).toLowerCase() !== "published"
    ) {
      throw new BookingServiceError(409, `${label} class is not published.`);
    }
  }

  async rescheduleBooking({ actorId, bookingId, targetClassId }) {
    this.assertValidId(bookingId, "bookingId");
    this.assertValidId(targetClassId, "targetClassId");

    const member = await this.User.findById(actorId);
    if (!member || member.status === "inactive") {
      throw new BookingServiceError(403, "Your account is deactivated.");
    }

    const booking = await this.Booking.findById(bookingId);
    if (!booking) {
      throw new BookingServiceError(404, "Booking not found.");
    }
    if (booking.user.toString() !== actorId) {
      throw new BookingServiceError(
        403,
        "You can only reschedule your own bookings."
      );
    }

    const sourceClassId = booking.class.toString();
    if (sourceClassId === targetClassId) {
      throw new BookingServiceError(
        400,
        "Choose a different class to reschedule."
      );
    }

    const [sourceClass, targetClass] = await Promise.all([
      this.Class.findById(sourceClassId),
      this.Class.findById(targetClassId),
    ]);
    if (!sourceClass) {
      throw new BookingServiceError(404, "Current class not found.");
    }
    if (!targetClass) {
      throw new BookingServiceError(404, "Destination class not found.");
    }

    this.assertEligibleClass(sourceClass, "Current");
    this.assertEligibleClass(targetClass, "Destination");

    const duplicate = await this.Booking.exists({
      _id: { $ne: booking._id },
      user: actorId,
      class: targetClassId,
    });
    if (duplicate) {
      throw new BookingServiceError(
        409,
        "You already have a booking for the destination class."
      );
    }

    const bookedCount = await this.Booking.countDocuments({
      class: targetClassId,
    });
    if (bookedCount >= targetClass.capacity) {
      throw new BookingServiceError(409, "The destination class is full.");
    }

    // PF-48 will move this mutation and the shared capacity update into a
    // MongoDB transaction. US4.1 deliberately keeps the existing booking ID.
    booking.class = targetClassId;
    await booking.save();

    if (typeof booking.populate === "function") {
      await booking.populate("class");
    }

    return {
      booking,
      sourceClassId,
      availableSpots: targetClass.capacity - bookedCount - 1,
    };
  }
}

module.exports = { BookingService, BookingServiceError };
