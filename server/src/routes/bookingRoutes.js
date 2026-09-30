const express = require("express");
const {
  createBooking,
  getMyBookings,
  cancelBooking,
  getRescheduleOptions,
  rescheduleBooking,
} = require("../controllers/bookingController");
const { requireAuth } = require("../middleware/authMiddleware");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

router.post("/", requireAuth, asyncHandler(createBooking));
router.get("/mine", requireAuth, asyncHandler(getMyBookings));
router.get(
  "/:id/reschedule-options",
  requireAuth,
  asyncHandler(getRescheduleOptions)
);
router.patch("/:id/reschedule", requireAuth, asyncHandler(rescheduleBooking));
router.delete("/:id", requireAuth, asyncHandler(cancelBooking));

module.exports = router;
