const express = require("express");
const { joinWaitlist, getMyWaitlist } = require("../controllers/waitlistController");
const { requireAuth } = require("../middleware/authMiddleware");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

router.post("/", requireAuth, asyncHandler(joinWaitlist)); // 401 if no/invalid token
router.get("/mine", requireAuth, asyncHandler(getMyWaitlist));

module.exports = router;