class RescheduleBookingCommand {
  constructor({ actorId, bookingId, targetClassId, bookingService }) {
    this.actorId = actorId;
    this.bookingId = bookingId;
    this.targetClassId = targetClassId;
    this.bookingService = bookingService;
  }

  execute() {
    return this.bookingService.rescheduleBooking({
      actorId: this.actorId,
      bookingId: this.bookingId,
      targetClassId: this.targetClassId,
    });
  }
}

module.exports = RescheduleBookingCommand;
