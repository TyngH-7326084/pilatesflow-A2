const Waitlist = require('../models/Waitlist');
const Booking = require('../models/Booking');
const Class = require('../models/Class');
const User = require('../models/User');

// Position = nember of entries for the class that joined earlier, + 1. 
// _id breaks ties if two members join in the same millisecond

async function getPosition(classId, entry) {
  const ahead = await Waitlist.countDocuments({
    class: classId,
    $or: [
      { joinedAt: { $lt: entry.joinedAt } },
      { joinedAt: entry.joinedAt, _id: { $lt: entry._id } },
    ],
  });
  return ahead + 1;
}

// POST /api/waitlist (required Authentication)
// US2.5 AC: only full classes, no duplicates (409), returns position
async function joinWaitlist(req, res) {
    const { classId } = req.body;

    if (!classId) {
        return res.status(400).json({ error: "classId is required" });
    }

    // US2.3 AC: deactivated members cannot join waitlist
    const member = await User.findById(req.user.sub);
    if (!member || member.status === "inactive") {
        return res.status(403).json({ error: "Your account is deactivated. You cannot join the waitlist." });
    }
    
    const targetClass = await Class.findById(classId);
    if (!targetClass) {
        return res.status(404).json({ error: "Class not found" });
    }

    const alreadyBooked = await Booking.exists({ user: req.user.sub, class: classId });
    if (alreadyBooked) {
        return res.status(409).json({ error: "You are already booked for this class." });
    }

    // US2.5 AC: a class with spare capacity must be booked, not waitlisted
    const bookedCount = await Booking.countDocuments({ class: classId });
    if (bookedCount < targetClass.capacity) {
        return res.status(400).json({
            error: "This class still has available spots. Please book the class instead of joining the waitlist.",
        })
    }

    try {
        const entry = await Waitlist.create({ member: req.user.sub, class: classId });
        const position = await getPosition(classId, entry);
        return res.status(201).json({ message: "Successfully joined the waitlist.", position });
    } catch (err) {
        // Duplicate key error from the unique index = already on the waitlist
        if (err.code === 11000) {
            return res.status(409).json({ error: "You are already on the waitlist for this class." });
        }
        return res.status(500).json({ error: "An error occurred while joining the waitlist." });
    }
}

// GET /api/waitlist/mine (required Authentication)
async function getMyWaitlist(req, res) {
    const entries = await Waitlist.find({ member: req.user.sub }).populate('class');

    const withPositions = await Promise.all(
        entries
        .filter((entry) => entry.class) // Filter out entries without a valid class
        .map(async (e) => ({
        ...e.toObject(),
        position: await getPosition(e.class._id, e),
      }))
  );

  return res.json(withPositions);
}

module.exports = { joinWaitlist, getMyWaitlist };
