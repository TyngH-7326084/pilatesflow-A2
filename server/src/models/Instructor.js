const mongoose = require('mongoose');

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
    // Left out for now so US1.1 stays scoped to plain CRUD.
  },
  { timestamps: true }
);

module.exports = mongoose.model('Instructor', instructorSchema);