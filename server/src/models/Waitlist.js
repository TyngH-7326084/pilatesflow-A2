const mongoose = require("mongoose");

const waitlistSchema = new mongoose.Schema(
  {
    member: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
    // US2.5 AC: entry records a join timestamp; queue order is by this field
    joinedAt: { type: Date, default: Date.now, required: true },
  },
  { timestamps: true }
);

// US2.5 AC: a mamber can only be on a class's waitlist once
waitlistSchema.index({ member: 1, class: 1 }, { unique: true });
// supports position lookups (entries for a class ordered by join time)
waitlistSchema.index({ class: 1, joinedAt: 1 });

module.exports = mongoose.model("Waitlist", waitlistSchema);