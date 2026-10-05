class ClassState {
  async transitionTo(classObj, targetStatus) {  
    throw new Error(`Cannot transition class from '${classObj.status}' to '${targetStatus}'.`);
  }
}

class DraftState extends ClassState {
  async transitionTo(classObj, targetStatus) {
    // A Draft can only be published or completely cancelled
    if (targetStatus === 'Published' || targetStatus === 'Cancelled') {
      classObj.status = targetStatus;
      await classObj.save();
    } else {
      await super.transitionTo(classObj, targetStatus);
    }
  }
}

class PublishedState extends ClassState {
  async transitionTo(classObj, targetStatus) {
    // A Published class can become Full (bookings maxed) or Cancelled
    if (targetStatus === 'Full' || targetStatus === 'Cancelled') {
      classObj.status = targetStatus;
      await classObj.save();
    } else {
      await super.transitionTo(classObj, targetStatus);
    }
  }
}

class FullState extends ClassState {
  async transitionTo(classObj, targetStatus) {
    // A Full class can go back to Published (if a user cancels a spot) or become Cancelled
    if (targetStatus === 'Published' || targetStatus === 'Cancelled') {
      classObj.status = targetStatus;
      await classObj.save();
    } else {
      await super.transitionTo(classObj, targetStatus);
    }
  }
}

class CancelledState extends ClassState {
}

const getClassStateInstance = (statusString) => {
const status = statusString || 'Published'; 
  switch (statusString) {
    case 'Draft': return new DraftState();
    case 'Published': return new PublishedState();
    case 'Full': return new FullState();
    case 'Cancelled': return new CancelledState();
    default: return new PublishedState();
  }
};

module.exports = { getClassStateInstance };
