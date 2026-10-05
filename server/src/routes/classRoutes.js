const express = require("express");
const { createClass, getClasses, handleTransition  } = require("../controllers/classController");
const { requireAuth, requireAdmin } = require("../middleware/authMiddleware");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

router.get("/", asyncHandler(getClasses)); // any logged-in role can view
router.post("/", requireAuth, requireAdmin, asyncHandler(createClass)); // admin only
router.post("/:id/transition", requireAuth, requireAdmin, asyncHandler(handleTransition)); // admin only

module.exports = router;