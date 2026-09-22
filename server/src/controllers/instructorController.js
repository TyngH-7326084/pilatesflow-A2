const Instructor = require("../models/Instructor");
const Class = require("../models/Class");
const RecurrenceGeneratorFactory = require("../patterns/RecurrenceGeneratorFactory");

// POST /api/instructors  (Admin only)
async function createInstructor(req, res) {
  const { name, bio, specialties } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Instructor name is required." });
  }

  try {
    const instructor = await Instructor.create({
      name: name.trim(),
      bio: bio ? bio.trim() : "",
      specialties: specialties || [],
    });
    return res.status(201).json(instructor);
  } catch (err) {
    return res.status(500).json({ error: "Could not create instructor." });
  }
}

// GET /api/instructors
async function getInstructors(req, res) {
  try {
    const instructors = await Instructor.find().sort({ name: 1 });
    return res.json(instructors);
  } catch (err) {
    return res.status(500).json({ error: "Could not load instructors." });
  }
}

// GET /api/instructors/:id
async function getInstructorById(req, res) {
  try {
    const instructor = await Instructor.findById(req.params.id);
    if (!instructor) {
      return res.status(404).json({ error: "Instructor not found." });
    }
    return res.json(instructor);
  } catch (err) {
    return res.status(500).json({ error: "Could not load instructor." });
  }
}

// PUT /api/instructors/:id  (Admin only)
async function updateInstructor(req, res) {
  const { name, bio, specialties } = req.body;

  if (name !== undefined && !name.trim()) {
    return res.status(400).json({ error: "Instructor name cannot be empty." });
  }

  try {
    const instructor = await Instructor.findById(req.params.id);
    if (!instructor) {
      return res.status(404).json({ error: "Instructor not found." });
    }

    if (name !== undefined) instructor.name = name.trim();
    if (bio !== undefined) instructor.bio = bio.trim();
    if (specialties !== undefined) instructor.specialties = specialties;

    const updated = await instructor.save();
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Could not update instructor." });
  }
}

// DELETE /api/instructors/:id  (Admin only)
// AC: blocked if the instructor has any upcoming (future-dated) classes.
async function deleteInstructor(req, res) {
  try {
    const instructor = await Instructor.findById(req.params.id);
    if (!instructor) {
      return res.status(404).json({ error: "Instructor not found." });
    }

    const upcomingClassCount = await Class.countDocuments({
      instructor: instructor._id,
      classDateTime: { $gte: new Date() },
    });

    if (upcomingClassCount > 0) {
      return res.status(400).json({
        error: `Cannot delete instructor: they have ${upcomingClassCount} upcoming class(es) scheduled. Reassign or cancel those classes first.`,
      });
    }

    await instructor.deleteOne();
    return res.json({ message: "Instructor deleted successfully." });
  } catch (err) {
    return res.status(500).json({ error: "Could not delete instructor." });
  }
}

// ---- US1.2: Weekly availability ----
 
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/; // "HH:MM", 24-hour
 
// POST /api/instructors/:id/availability  (Admin only)
// AC: adding a slot persists; overlapping slots for the same instructor are rejected.
async function addAvailability(req, res) {
  const { dayOfWeek, startTime, endTime } = req.body;
 
  const validDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  if (!dayOfWeek || !validDays.includes(dayOfWeek)) {
    return res.status(400).json({ error: "A valid dayOfWeek is required." });
  }
  if (!startTime || !TIME_RE.test(startTime) || !endTime || !TIME_RE.test(endTime)) {
    return res.status(400).json({ error: "startTime and endTime must be in HH:MM (24-hour) format." });
  }
  if (startTime >= endTime) {
    return res.status(400).json({ error: "startTime must be before endTime." });
  }
 
  try {
    const instructor = await Instructor.findById(req.params.id);
    if (!instructor) {
      return res.status(404).json({ error: "Instructor not found." });
    }
 
    // Overlap check: same day, and time ranges intersect.
    // Two ranges [s1,e1) and [s2,e2) overlap if s1 < e2 AND s2 < e1.
    const hasOverlap = instructor.availability.some(
      (slot) =>
        slot.dayOfWeek === dayOfWeek &&
        startTime < slot.endTime &&
        slot.startTime < endTime
    );
 
    if (hasOverlap) {
      return res.status(400).json({
        error: `This overlaps an existing availability slot on ${dayOfWeek}.`,
      });
    }
 
    instructor.availability.push({ dayOfWeek, startTime, endTime });
    const updated = await instructor.save();
    return res.status(201).json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Could not add availability slot." });
  }
}
 
// DELETE /api/instructors/:id/availability/:slotId  (Admin only)
async function removeAvailability(req, res) {
  try {
    const instructor = await Instructor.findById(req.params.id);
    if (!instructor) {
      return res.status(404).json({ error: "Instructor not found." });
    }
 
    const slot = instructor.availability.id(req.params.slotId);
    if (!slot) {
      return res.status(404).json({ error: "Availability slot not found." });
    }
 
    slot.deleteOne();
    const updated = await instructor.save();
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Could not remove availability slot." });
  }
}
 
// ---- US1.3: Recurring slot generation ----
 
// POST /api/instructors/:id/generate-slots  (Admin only)
// AC: given a start date and number of weeks, one class is created per
// weekly occurrence; a slot clashing with an existing class for that
// instructor at the exact same date/time is skipped and reported.
async function generateSlots(req, res) {
  const { slotId, className, capacity, startDate, numberOfWeeks } = req.body;
 
  if (!slotId) {
    return res.status(400).json({ error: "slotId is required." });
  }
  if (!className || !className.trim()) {
    return res.status(400).json({ error: "className is required." });
  }
  const capacityNum = Number(capacity);
  if (Number.isNaN(capacityNum) || capacityNum <= 0) {
    return res.status(400).json({ error: "Capacity must be greater than zero." });
  }
  const parsedStart = new Date(startDate);
  if (!startDate || Number.isNaN(parsedStart.getTime())) {
    return res.status(400).json({ error: "A valid startDate is required." });
  }
  const weeksNum = Number(numberOfWeeks);
  if (!Number.isInteger(weeksNum) || weeksNum <= 0 || weeksNum > 52) {
    return res.status(400).json({ error: "numberOfWeeks must be a whole number between 1 and 52." });
  }
 
  try {
    const instructor = await Instructor.findById(req.params.id);
    if (!instructor) {
      return res.status(404).json({ error: "Instructor not found." });
    }
 
    const availabilitySlot = instructor.availability.id(slotId);
    if (!availabilitySlot) {
      return res.status(404).json({ error: "Availability slot not found." });
    }
 
    const generator = RecurrenceGeneratorFactory.getGenerator("weekly");
    const candidates = generator.generate({
      instructor,
      availabilitySlot,
      className: className.trim(),
      capacity: capacityNum,
      startDate: parsedStart,
      numberOfWeeks: weeksNum,
    });
 
    const created = [];
    const skipped = [];
 
    for (const candidate of candidates) {
      const conflict = await Class.findOne({
        instructor: instructor._id,
        classDateTime: candidate.classDateTime,
      });
 
      if (conflict) {
        skipped.push({
          classDateTime: candidate.classDateTime,
          reason: `Instructor already has a class at this exact date/time (conflicts with "${conflict.className}").`,
        });
        continue;
      }
 
      const newClass = await Class.create({
        ...candidate,
        createdBy: req.user.sub,
      });
      created.push(newClass);
    }
 
    return res.status(201).json({ created, skipped });
  } catch (err) {
    return res.status(500).json({ error: "Could not generate class slots." });
  }
}
 
module.exports = {
  createInstructor,
  getInstructors,
  getInstructorById,
  updateInstructor,
  deleteInstructor,
  addAvailability,
  removeAvailability,
  generateSlots,
};