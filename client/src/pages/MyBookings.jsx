import { useState, useEffect } from "react";
import axios from "axios";
import Navbar from "../components/Navbar";

const API = import.meta.env.VITE_API_URL ?? "";

export default function MyBookings() {
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [cancelMessage, setCancelMessage] = useState("");
  const [cancelling, setCancelling] = useState(null);
  const [waitlist, setWaitlist] = useState([]);
  const [waitlistError, setWaitlistError] = useState("");
  const [leaving, setLeaving] = useState(null);
  const [classes, setClasses] = useState([]);
  const [rescheduleOpen, setRescheduleOpen] = useState(null);
  const [targetClassId, setTargetClassId] = useState("");
  const [rescheduling, setRescheduling] = useState(null);
  const [rescheduleMessage, setRescheduleMessage] = useState("");

  const loadBookings = async () => {
    try {
      const token = localStorage.getItem("token");
      const { data } = await axios.get(`${API}/api/bookings/mine`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const loadedAt = new Date();
      setBookings(
        data.map((booking) => ({
          ...booking,
          rescheduleEligible:
            booking.class &&
            new Date(booking.class.classDateTime) > loadedAt &&
            (!booking.class.status ||
              booking.class.status.toLowerCase() === "published"),
        }))
      );
    } catch {
      setError("Could not load your bookings. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (bookingId) => {
    setCancelling(bookingId);
    setCancelMessage("");
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/api/bookings/${bookingId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCancelMessage("Booking cancelled.");
      await loadBookings();
    } catch (err) {
      setCancelMessage(err.response?.data?.error || "Could not cancel booking.");
    } finally {
      setCancelling(null);
    }
  };

  const loadWaitlist = async () => {
    try {
      const token = localStorage.getItem("token");
      const { data } = await axios.get(`${API}/api/waitlist/mine`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setWaitlist(data);
      setWaitlistError("");

    } catch {
      setWaitlistError("Could not load your waitlist entries. Please try again later.");
    }
  };

  const loadClasses = async () => {
    try {
      const { data } = await axios.get(`${API}/api/classes`);
      const loadedAt = new Date();
      setClasses(
        data.filter(
          (classItem) => new Date(classItem.classDateTime) > loadedAt
        )
      );
    } catch {
      setRescheduleMessage("Could not load classes for rescheduling.");
    }
  };

  const eligibleDestinations = (booking) => {
    const bookedClassIds = new Set(
      bookings.filter((b) => b._id !== booking._id).map((b) => b.class?._id)
    );

    return classes.filter((classItem) => {
      const published =
        !classItem.status || classItem.status.toLowerCase() === "published";
      return (
        classItem._id !== booking.class?._id &&
        !bookedClassIds.has(classItem._id) &&
        classItem.availableSpots > 0 &&
        published
      );
    });
  };

  const openReschedule = (bookingId) => {
    setRescheduleOpen(bookingId);
    setTargetClassId("");
    setRescheduleMessage("");
  };

  const closeReschedule = () => {
    setRescheduleOpen(null);
    setTargetClassId("");
    setRescheduleMessage("");
  };

  const handleReschedule = async (bookingId) => {
    if (!targetClassId) {
      setRescheduleMessage("Choose a destination class.");
      return;
    }

    setRescheduling(bookingId);
    setRescheduleMessage("");
    try {
      const token = localStorage.getItem("token");
      const { data } = await axios.patch(
        `${API}/api/bookings/${bookingId}/reschedule`,
        { targetClassId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCancelMessage(data.message);
      setRescheduleOpen(null);
      setTargetClassId("");
      await Promise.all([loadBookings(), loadClasses()]);
    } catch (err) {
      setRescheduleMessage(
        err.response?.data?.error || "Could not reschedule booking."
      );
      await Promise.all([loadBookings(), loadClasses()]);
    } finally {
      setRescheduling(null);
    }
  };
  
  const handleLeaveWaitlist = async (entryId) => {
    setLeaving(entryId);
    setCancelMessage("");
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/api/waitlist/${entryId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCancelMessage("Waitlist entry removed.");
      await loadWaitlist();
    } catch (err) {
      setCancelMessage(err.response?.data?.error || "Could not remove waitlist entry.");
    } finally {
      setLeaving(null);
    }
  };

  useEffect(() => {
    // These loaders update state after their network requests resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBookings();
    loadWaitlist();
    loadClasses();
  }, []);

  return (
    <>
      <Navbar />
      <div className="schedule-page">
        <h2 className="class-list-title">My Bookings</h2>
        <p className="schedule-subtitle">
          Manage the classes you've reserved a spot in.
        </p>

        {loading && <p>Loading your bookings...</p>}
        {error && <p role="alert" className="auth-error">{error}</p>}
        {cancelMessage && (
          <p role="alert" className="success-banner">{cancelMessage}</p>
        )}

        {!loading && !error && bookings.length === 0 && (
          <p>You haven't booked any classes yet.</p>
        )}

        {!loading && bookings.length > 0 && (
          <ul className="class-list">
            {bookings.map((b) => (
              <li key={b._id} className="class-list-item">
                <div>
                  <strong>{b.class.className}</strong>
                  <p className="class-meta">
                    {b.class.instructorName} ·{" "}
                    {new Date(b.class.classDateTime).toLocaleString(undefined, {
                      weekday: "short",
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <div className="booking-actions">
                  <div className="booking-action-buttons">
                    {b.rescheduleEligible && (
                      <button
                        className="btn-secondary"
                        onClick={() => openReschedule(b._id)}
                        disabled={rescheduling === b._id}
                      >
                        Reschedule
                      </button>
                    )}
                    <button
                      className="btn-ghost"
                      onClick={() => handleCancel(b._id)}
                      disabled={cancelling === b._id}
                    >
                      {cancelling === b._id ? "Cancelling..." : "Cancel"}
                    </button>
                  </div>

                  {rescheduleOpen === b._id && (
                    <div className="reschedule-panel">
                      <label htmlFor={`reschedule-${b._id}`}>
                        Destination class
                      </label>
                      <select
                        id={`reschedule-${b._id}`}
                        value={targetClassId}
                        onChange={(event) => setTargetClassId(event.target.value)}
                        disabled={rescheduling === b._id}
                      >
                        <option value="">Choose a class</option>
                        {eligibleDestinations(b).map((classItem) => (
                          <option key={classItem._id} value={classItem._id}>
                            {classItem.className} · {classItem.instructorName} ·{" "}
                            {new Date(classItem.classDateTime).toLocaleString()}
                            {` · ${classItem.availableSpots} spots`}
                          </option>
                        ))}
                      </select>
                      {eligibleDestinations(b).length === 0 && (
                        <p className="class-meta">
                          No eligible destination classes currently have space.
                        </p>
                      )}
                      {rescheduleMessage && (
                        <p role="alert" className="auth-error">
                          {rescheduleMessage}
                        </p>
                      )}
                      <div className="booking-action-buttons">
                        <button
                          className="btn-primary"
                          onClick={() => handleReschedule(b._id)}
                          disabled={rescheduling === b._id || !targetClassId}
                        >
                          {rescheduling === b._id ? "Moving..." : "Confirm move"}
                        </button>
                        <button
                          className="btn-ghost"
                          onClick={closeReschedule}
                          disabled={rescheduling === b._id}
                        >
                          Keep current class
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <h2 className="class-list-title">My Waitlists</h2>
        <p className="schedule-subtitle">
        Classes you're queued for. Leave any you no longer want.
        </p>

      {waitlistError && <p role="alert" className="auth-error">{waitlistError}</p>}

      {!loading && !waitlistError && waitlist.length === 0 && (
        <p>You're not on any waitlists.</p>
      )}

        {waitlist.length > 0 && (
          <ul className="class-list">
            {waitlist.map((w) => (
              <li key={w._id} className="class-list-item">
                <div>
                  <strong>{w.class.className}</strong>
                  <p className="class-meta">
                    {new Date(w.class.classDateTime).toLocaleString(undefined, {
                      weekday: "short",
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · Position #{w.position}
                  </p>
                </div>
                <button
                  className="btn-ghost"
                  onClick={() => handleLeaveWaitlist(w._id)}
                  disabled={leaving === w._id}
                >
                  {leaving === w._id ? "Leaving..." : "Leave waitlist"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
