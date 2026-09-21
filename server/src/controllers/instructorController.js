const Instructor = require("../models/Instructor");
const Class = require("../models/Class");

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

module.exports = {
  createInstructor,
  getInstructors,
  getInstructorById,
  updateInstructor,
  deleteInstructor,
};