const express = require("express");
const {
  createBooking,
  getMyBookings,
  cancelBooking,
  rescheduleBooking,
} = require("../controllers/bookingController");
const { requireAuth } = require("../middleware/authMiddleware");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

router.post("/", requireAuth, asyncHandler(createBooking));
router.get("/mine", requireAuth, asyncHandler(getMyBookings));
router.patch("/:id/reschedule", requireAuth, asyncHandler(rescheduleBooking));
router.delete("/:id", requireAuth, asyncHandler(cancelBooking));

module.exports = router;
