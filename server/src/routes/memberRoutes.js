const express = require("express");
const router = express.Router();

const { getMembers, updateMember, deactivateMember } = require("../controllers/memberController");
const { requireAuth, requireAdmin } = require("../middleware/authMiddleware");
const asyncHandler = require("../middleware/asyncHandler");

router.get("/", requireAuth, requireAdmin, asyncHandler(getMembers));
router.put("/:id", requireAuth, asyncHandler(updateMember));
router.patch("/:id/deactivate", requireAuth, requireAdmin, asyncHandler(deactivateMember));

module.exports = router;
