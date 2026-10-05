const Class = require("../models/Class");
const Booking = require("../models/Booking");
const { getClassStateInstance } = require("../patterns/ClassStates");

// POST /api/classes  (Admin only)
// US5 acceptance criteria: missing field or capacity <= 0 -> rejected, no class created.
async function createClass(req, res) {
  const { className, instructorName, classDateTime, capacity } = req.body;

  if (!className || !instructorName || !classDateTime || capacity === undefined) {
    return res.status(400).json({ error: "All fields are required." });
  }

  const capacityNum = Number(capacity);
  if (Number.isNaN(capacityNum) || capacityNum <= 0) {
    return res.status(400).json({ error: "Capacity must be greater than zero." });
  }

  const parsedDate = new Date(classDateTime);
  if (Number.isNaN(parsedDate.getTime())) {
    return res.status(400).json({ error: "Enter a valid class date and time." });
  }

  try {
    const newClass = await Class.create({
      className: className.trim(),
      instructorName: instructorName.trim(),
      classDateTime: parsedDate,
      capacity: capacityNum,
      createdBy: req.user.sub,
    });

    return res.status(201).json(newClass);
  } catch (err) {
    return res.status(500).json({ error: "Could not create class." });
  }
}

// GET /api/classes
// US5 acceptance criteria: schedule list refreshes and reflects newly created classes immediately.
async function getClasses(req, res) {
  try {
    const classes = await Class.find().sort({ classDateTime: 1 });

    const withAvailability = await Promise.all(
      classes.map(async (c) => {
        const bookedCount = await Booking.countDocuments({ class: c._id });
        return {
          ...c.toObject(),
          availableSpots: c.capacity - bookedCount,
        };
      })
    );

    return res.json(withAvailability);
  } catch (err) {
    return res.status(500).json({ error: "Could not load classes." });
  }
}

// Handles transitions using the State Design Pattern
async function handleTransition(req, res) {
  try {
    const { id } = req.params;
    const { targetStatus } = req.body;

    const classObj = await Class.findById(id);
    if (!classObj) return res.status(404).json({ error: "Class not found" });

    const currentState = getClassStateInstance(classObj.status || "Draft");

    await currentState.transitionTo(classObj, targetStatus);

    return res.status(200).json({ message: "State updated successfully", class: classObj });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

module.exports = { createClass, getClasses, handleTransition };