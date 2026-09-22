const express = require('express');
const router = express.Router();

const {
  createInstructor,
  getInstructors,
  getInstructorById,
  updateInstructor,
  deleteInstructor,
  addAvailability,
  removeAvailability,
  generateSlots,
} = require('../controllers/instructorController');

const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const asyncHandler = require('../middleware/asyncHandler');

router.route('/')
  .get(requireAuth, requireAdmin, asyncHandler(getInstructors))
  .post(requireAuth, requireAdmin, asyncHandler(createInstructor));

router.route('/:id')
  .get(requireAuth, requireAdmin, asyncHandler(getInstructorById))
  .put(requireAuth, requireAdmin, asyncHandler(updateInstructor))
  .delete(requireAuth, requireAdmin, asyncHandler(deleteInstructor));

router.route('/:id/availability')
  .post(requireAuth, requireAdmin, asyncHandler(addAvailability));
 
router.route('/:id/availability/:slotId')
  .delete(requireAuth, requireAdmin, asyncHandler(removeAvailability));

router.route('/:id/generate-slots')
  .post(requireAuth, requireAdmin, asyncHandler(generateSlots));

module.exports = router;