const mongoose = require("mongoose");

const classSchema = new mongoose.Schema(
  {
    className: {
      type: String,
      required: true,
      trim: true,
    },
    instructorName: {
      type: String,
      required: true,
      trim: true,
    },
    // Tyng: new field, used going forward for real instructor linkage
    instructor: { 
      type: mongoose.Schema.Types.ObjectId,
      ref: "Instructor",
    },
    classDateTime: {
      type: Date,
      required: true,
    },
    capacity: {
      type: Number,
      required: true,
      min: 1, // AC: capacity of zero or less is rejected
    },
    // Every capacity-changing transaction increments this value. Updating the
    // shared class document creates database-level contention, so two API
    // instances cannot both claim the final place from stale counts.
    capacityVersion: {
      type: Number,
      default: 0,
      select: false,
    },
    status: {
      type: String,
      enum: ["Draft", "Published", "Full", "Cancelled"],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Class", classSchema);
