class CapacityService {
  constructor({ Booking, Class }) {
    this.Booking = Booking;
    this.Class = Class;
  }

  withSession(query, session) {
    return session && typeof query?.session === "function"
      ? query.session(session)
      : query;
  }

  async lockClasses(classIds, session) {
    const uniqueIds = [...new Set(classIds.map(String))].sort();
    const lockedClasses = new Map();

    for (const classId of uniqueIds) {
      const classDocument = await this.Class.findOneAndUpdate(
        { _id: classId },
        { $inc: { capacityVersion: 1 } },
        { new: true, session }
      );
      lockedClasses.set(classId, classDocument);
    }

    return lockedClasses;
  }

  async countBookings(classId, session) {
    return this.withSession(
      this.Booking.countDocuments({ class: classId }),
      session
    );
  }
}

module.exports = CapacityService;
