const mongoose = require('mongoose');

const availabilitySchema = new mongoose.Schema(
  {
    dayOfWeek: {
      type: String,
      enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      required: true,
    },
    startTime: {
      // 24-hour "HH:MM" format, e.g. "09:00"
      type: String,
      required: true,
    },
    endTime: {
      type: String,
      required: true,
    },
  },
  { _id: true } // each slot gets its own id, needed to remove a specific slot later
);

const instructorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Instructor name is required'],
      trim: true,
    },
    bio: {
      type: String,
      trim: true,
      default: '',
    },
    specialties: {
      type: [String],
      default: [],
    },
    // US1.2 will add an `availability` array here (day, startTime, endTime).
    availability: {
      type: [availabilitySchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Instructor', instructorSchema);