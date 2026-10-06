const mongoose = require('mongoose');
const CapacityService = require('./CapacityService');
const { getPromotionStrategyInstance } = require('../patterns/PromotionStrategy');
const ClassModel = require('../models/Class');

//US2.7: promotes the highest priority waitlist member into a freed seat.
//This is the Strategy Pattern: it asks each member's tier strategy for a priority and never compares tier strings itself.
class PromotionService {
  constructor({ Waitlist, Booking, Class = ClassModel, runInTransaction, capacityService }) {
    this.Waitlist = Waitlist;
    this.Booking = Booking;
    this.runInTransaction = runInTransaction || ((operation) => this.withMongoTransaction(operation));
    this.capacityService = capacityService || new CapacityService({ Booking, Class });
  }

async withMongoTransaction(operation) {
    const session = await mongoose.startSession();
    let result;

    try {
      await session.withTransaction(async () => {
        result = await operation(session);
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  withSession(query, session) {
    return session && typeof query?.session === "function"
      ? query.session(session)
      : query;
  }

  // Highest tier priority first; within a tier the earlier joinedAt wins;
  // _id breaks ties for entries created in the same millisecond.
  rankEntries(entries) {
    return [...entries].sort((a, b) => {
      const priorityA = getPromotionStrategyInstance(a.member.tier).priority();
      const priorityB = getPromotionStrategyInstance(b.member.tier).priority();
      if (priorityA !== priorityB) return priorityB - priorityA;

      const joinedDiff = new Date(a.joinedAt) - new Date(b.joinedAt);
      if (joinedDiff !== 0) return joinedDiff;

      return String(a._id).localeCompare(String(b._id));
    });
  }

    async promoteNext({ sourceClassId }) {
    return this.runInTransaction(async (session) => {
      // Lock the class so a direct booking cannot take the same seat at the same time.
      const locked = await this.capacityService.lockClasses([sourceClassId], session);
      const targetClass = locked.get(String(sourceClassId));
      if (!targetClass) return null;

      const bookedCount = await this.capacityService.countBookings(
        sourceClassId,
        session
      );
      if (bookedCount >= targetClass.capacity) return null;

      // Populate member so ranking uses the member's CURRENT tier (downgrade AC).
      const entries = await this.withSession(
        this.Waitlist.find({ class: sourceClassId }).populate("member"),
        session
      );
      const eligible = entries.filter(
        (entry) => entry.member && entry.member.status !== "inactive"
      );
      // Empty waitlist AC: the seat simply stays free.
      if (eligible.length === 0) return null;

      const [next] = this.rankEntries(eligible);

      // Booking + waitlist removal happen in one transaction: both or neither.
      const created = await this.Booking.create(
        [{ user: next.member._id, class: sourceClassId }],
        session ? { session } : undefined
      );
      await next.deleteOne(session ? { session } : undefined);

      return {
        booking: Array.isArray(created) ? created[0] : created,
        promotedMemberId: String(next.member._id),
      };
    });
  }
} 


module.exports = PromotionService;
