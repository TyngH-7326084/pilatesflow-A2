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

  const loadBookings = async () => {
    try {
      const token = localStorage.getItem("token");
      const { data } = await axios.get(`${API}/api/bookings/mine`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBookings(data);
    } catch (err) {
      setError("Could not load your bookings. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

    useEffect(() => {
      loadBookings();
  }, []);

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

    } catch (err) {
      setWaitlistError("Could not load your waitlist entries. Please try again later.");
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
    loadBookings();
    loadWaitlist();
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
                <button
                  className="btn-ghost"
                  onClick={() => handleCancel(b._id)}
                  disabled={cancelling === b._id}
                >
                  {cancelling === b._id ? "Cancelling..." : "Cancel"}
                </button>
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