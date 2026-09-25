const express = require("express");
const { joinWaitlist, getMyWaitlist, leaveWaitlist } = require("../controllers/waitlistController");
const { requireAuth } = require("../middleware/authMiddleware");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

router.post("/", requireAuth, asyncHandler(joinWaitlist)); // 401 if no/invalid token
router.get("/mine", requireAuth, asyncHandler(getMyWaitlist));
router.delete("/:id", requireAuth, asyncHandler(leaveWaitlist));
module.exports = router;