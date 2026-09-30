const mongoose = require("mongoose");
const CapacityService = require("./CapacityService");

class BookingServiceError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "BookingServiceError";
    this.status = status;
  }
}

class BookingService {
  constructor({
    Booking,
    Class,
    User,
    now = () => new Date(),
    runInTransaction,
    afterBookingUpdate = async () => {},
    afterCapacityRelease = async () => {},
    capacityService,
  }) {
    this.Booking = Booking;
    this.Class = Class;
    this.User = User;
    this.now = now;
    this.runInTransaction =
      runInTransaction || ((operation) => this.withMongoTransaction(operation));
    this.afterBookingUpdate = afterBookingUpdate;
    this.afterCapacityRelease = afterCapacityRelease;
    this.capacityService =
      capacityService || new CapacityService({ Booking, Class });
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

  async createBooking({ actorId, classId }) {
    this.assertValidId(actorId, "actorId");
    this.assertValidId(classId, "classId");

    try {
      return await this.runInTransaction(async (session) => {
        const member = await this.withSession(
          this.User.findById(actorId),
          session
        );
        if (!member || member.status === "inactive") {
          throw new BookingServiceError(403, "Your account is deactivated.");
        }

        const locked = await this.capacityService.lockClasses([classId], session);
        const targetClass = locked.get(String(classId));
        if (!targetClass) {
          throw new BookingServiceError(404, "Class not found.");
        }
        this.assertEligibleClass(targetClass, "Selected");

        const duplicate = await this.withSession(
          this.Booking.exists({ user: actorId, class: classId }),
          session
        );
        if (duplicate) {
          throw new BookingServiceError(
            409,
            "You have already booked this class."
          );
        }

        const bookedCount = await this.capacityService.countBookings(
          classId,
          session
        );
        if (bookedCount >= targetClass.capacity) {
          throw new BookingServiceError(409, "This class is full.");
        }

        const created = await this.Booking.create(
          [{ user: actorId, class: classId }],
          session ? { session } : undefined
        );
        const booking = Array.isArray(created) ? created[0] : created;

        return {
          booking,
          availableSpots: targetClass.capacity - bookedCount - 1,
        };
      });
    } catch (error) {
      if (error?.code === 11000) {
        throw new BookingServiceError(
          409,
          "You have already booked this class."
        );
      }
      throw error;
    }
  }

  async cancelBooking({ actorId, bookingId }) {
    this.assertValidId(actorId, "actorId");
    this.assertValidId(bookingId, "bookingId");

    const result = await this.runInTransaction(async (session) => {
      const booking = await this.withSession(
        this.Booking.findById(bookingId),
        session
      );
      if (!booking) {
        throw new BookingServiceError(404, "Booking not found.");
      }
      if (booking.user.toString() !== actorId) {
        throw new BookingServiceError(
          403,
          "You can only cancel your own bookings."
        );
      }

      const sourceClassId = booking.class.toString();
      const locked = await this.capacityService.lockClasses(
        [sourceClassId],
        session
      );
      if (!locked.get(sourceClassId)) {
        throw new BookingServiceError(404, "Current class not found.");
      }

      await booking.deleteOne(session ? { session } : undefined);
      return { sourceClassId };
    });

    // F2 can supply a promotion callback here. It runs only after commit, so a
    // rolled-back cancellation or reschedule never promotes a waitlist entry.
    await this.afterCapacityRelease(result);
    return result;
  }

  async getRescheduleOptions({ actorId, bookingId }) {
    this.assertValidId(actorId, "actorId");
    this.assertValidId(bookingId, "bookingId");

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

    const sourceClass = await this.Class.findById(booking.class);
    if (!sourceClass) {
      throw new BookingServiceError(404, "Current class not found.");
    }
    this.assertEligibleClass(sourceClass, "Current");

    const otherBookings = await this.Booking.find({
      _id: { $ne: booking._id },
      user: actorId,
    }).select("class");
    const excludedClassIds = [
      String(booking.class),
      ...otherBookings.map((item) => String(item.class)),
    ];

    const candidates = await this.Class.find({
      _id: { $nin: excludedClassIds },
      classDateTime: { $gt: this.now() },
      $or: [{ status: /^published$/i }, { status: { $exists: false } }],
    }).sort({ classDateTime: 1 });

    const options = await Promise.all(
      candidates.map(async (classDocument) => {
        const bookedCount = await this.Booking.countDocuments({
          class: classDocument._id,
        });
        const availableSpots = classDocument.capacity - bookedCount;
        if (availableSpots <= 0) return null;

        const values =
          typeof classDocument.toObject === "function"
            ? classDocument.toObject()
            : classDocument;
        return { ...values, availableSpots };
      })
    );

    return options.filter(Boolean);
  }

  async rescheduleBooking({ actorId, bookingId, targetClassId }) {
    this.assertValidId(actorId, "actorId");
    this.assertValidId(bookingId, "bookingId");
    this.assertValidId(targetClassId, "targetClassId");

    return this.runInTransaction(async (session) => {
      const member = await this.withSession(this.User.findById(actorId), session);
      if (!member || member.status === "inactive") {
        throw new BookingServiceError(403, "Your account is deactivated.");
      }

      const booking = await this.withSession(
        this.Booking.findById(bookingId),
        session
      );
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

      const lockedClasses = await this.capacityService.lockClasses(
        [sourceClassId, targetClassId],
        session
      );
      const sourceClass = lockedClasses.get(sourceClassId);
      const targetClass = lockedClasses.get(String(targetClassId));
      if (!sourceClass) {
        throw new BookingServiceError(404, "Current class not found.");
      }
      if (!targetClass) {
        throw new BookingServiceError(404, "Destination class not found.");
      }

      this.assertEligibleClass(sourceClass, "Current");
      this.assertEligibleClass(targetClass, "Destination");

      const duplicate = await this.withSession(
        this.Booking.exists({
          _id: { $ne: booking._id },
          user: actorId,
          class: targetClassId,
        }),
        session
      );
      if (duplicate) {
        throw new BookingServiceError(
          409,
          "You already have a booking for the destination class."
        );
      }

      const bookedCount = await this.capacityService.countBookings(
        targetClassId,
        session
      );
      if (bookedCount >= targetClass.capacity) {
        throw new BookingServiceError(409, "The destination class is full.");
      }

      booking.class = targetClassId;
      await booking.save(session ? { session } : undefined);
      await this.afterBookingUpdate({ booking, sourceClass, targetClass, session });

      if (typeof booking.populate === "function") {
        await booking.populate("class");
      }

      return {
        booking,
        sourceClassId,
        availableSpots: targetClass.capacity - bookedCount - 1,
      };
    }).then(async (result) => {
      await this.afterCapacityRelease({ sourceClassId: result.sourceClassId });
      return result;
    });
  }
}

module.exports = { BookingService, BookingServiceError };
