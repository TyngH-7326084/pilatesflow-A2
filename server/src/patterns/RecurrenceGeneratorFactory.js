// Factory pattern, matching the Week 9 tutorial's taught structure (see
// VehicleFactory.get_vehicle in Tutorial 9): a factory class with a
// method that returns a different concrete generator instance based on
// a type string, without the caller needing to know which concrete
// class implements it.
//
// Only "weekly" exists today, but the same factory could return a
// BiweeklyRecurrenceGenerator or MonthlyRecurrenceGenerator later
// without any change to the controller that calls it -- exactly the
// "Flexibility" and "Scalability" benefits described in the tutorial.

const DAY_INDEX = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

// ---- Concrete product ----

class WeeklyRecurrenceGenerator {
  // Finds the first date on/after startDate that falls on the slot's day of week.
  _firstOccurrence(startDate, dayOfWeek) {
    const targetDay = DAY_INDEX[dayOfWeek];
    const date = new Date(startDate);
    date.setHours(0, 0, 0, 0);
    while (date.getDay() !== targetDay) {
      date.setDate(date.getDate() + 1);
    }
    return date;
  }

  // Combines a calendar date with the slot's start time into one Date object.
  _buildDateTime(date, startTime) {
    const [hours, minutes] = startTime.split(":").map(Number);
    const dt = new Date(date);
    dt.setHours(hours, minutes, 0, 0);
    return dt;
  }

  // Produces the array of Class-shaped objects, one per weekly occurrence.
  generate({ instructor, availabilitySlot, className, capacity, startDate, numberOfWeeks }) {
    const slots = [];
    let occurrence = this._firstOccurrence(startDate, availabilitySlot.dayOfWeek);

    for (let week = 0; week < numberOfWeeks; week++) {
      slots.push({
        className,
        instructorName: instructor.name,
        instructor: instructor._id,
        classDateTime: this._buildDateTime(occurrence, availabilitySlot.startTime),
        capacity,
      });
      occurrence = new Date(occurrence);
      occurrence.setDate(occurrence.getDate() + 7);
    }

    return slots;
  }
}

// ---- Factory ----

class RecurrenceGeneratorFactory {
  static getGenerator(recurrenceType) {
    switch (recurrenceType) {
      case "weekly":
        return new WeeklyRecurrenceGenerator();
      default:
        throw new Error(`Unknown recurrence type: ${recurrenceType}`);
    }
  }
}

module.exports = RecurrenceGeneratorFactory;