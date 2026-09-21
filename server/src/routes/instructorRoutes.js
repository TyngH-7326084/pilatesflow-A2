const express = require('express');
const router = express.Router();

const {
  createInstructor,
  getInstructors,
  getInstructorById,
  updateInstructor,
  deleteInstructor,
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

module.exports = router;