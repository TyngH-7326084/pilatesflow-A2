const User = require("../models/User");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/members?search=  (Admin only)
async function getMembers(req, res) {
  const { search } = req.query;

  const filter = { role: "member" };
  if (search && search.trim()) {
    const regex = new RegExp(search.trim(), "i");
    filter.$or = [{ name: regex }, { email: regex }];
  }

  try {
    const members = await User.find(filter)
      .select("-passwordHash")
      .sort({ createdAt: -1 });
    return res.json(members);
  } catch (err) {
    return res.status(500).json({ error: "Could not load members." });
  }
}

// PUT /api/members/:id
// Admin can edit any member. A member can edit their own record, but
// cannot change their own tier (self-upgrade must not be possible).
async function updateMember(req, res) {
  const { name, email, tier, status } = req.body;

  const isAdmin = req.user.role === "admin";
  const isSelf = req.user.sub === req.params.id;

  if (!isAdmin && !isSelf) {
    return res.status(403).json({ error: "Not authorized to edit this member." });
  }

  if (name !== undefined && !name.trim()) {
    return res.status(400).json({ error: "Name cannot be empty." });
  }
  if (email !== undefined && !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  try {
    const member = await User.findById(req.params.id);
    if (!member) {
      return res.status(404).json({ error: "Member not found." });
    }

    if (email !== undefined) {
      const existing = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: member._id },
      });
      if (existing) {
        return res.status(409).json({ error: "An account with that email already exists." });
      }
      member.email = email.toLowerCase();
    }

    if (name !== undefined) member.name = name.trim();
    if (status !== undefined) member.status = status;

    // Only an admin may change tier; a self-edit silently ignores it.
    if (tier !== undefined && isAdmin) member.tier = tier;

    const updated = await member.save();
    const { passwordHash, ...safeMember } = updated.toObject();
    return res.json(safeMember);
  } catch (err) {
    return res.status(500).json({ error: "Could not update member." });
  }
}

module.exports = { getMembers, updateMember };
