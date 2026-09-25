import { useState, useEffect } from "react";
import axios from "axios";
import Navbar from "../components/Navbar";

const API = import.meta.env.VITE_API_URL ?? "";

export default function Schedule() {
  const [classes, setClasses] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [bookingMessages, setBookingMessages] = useState({}); // { [classId]: { type, text } }
  const [bookingInProgress, setBookingInProgress] = useState(null);
  const [waitlistPositions, setWaitlistPositions] = useState({}); // { [classId]: position }

  const role = localStorage.getItem("role"); // "admin" | "member" | null

  const loadClasses = async () => {
    try {
      const { data } = await axios.get(`${API}/api/classes`);
      const now = new Date();
      const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const upcoming = data.filter((c) => {
        const classTime = new Date(c.classDateTime);
        return classTime >= now && classTime <= sevenDaysOut;
      });

      setClasses(upcoming);
    } catch (err) {
      setError("Could not load the schedule. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const loadWaitlist = async () => {
  if (role !== "member") return;
  try {
    const token = localStorage.getItem("token");
    const { data } = await axios.get(`${API}/api/waitlist/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setWaitlistPositions(Object.fromEntries(data.map((w) => [w.class._id, w.position])));
  } catch (err) {
    // Non-fatal: the schedule still renders without waitlist positions
  }
};

useEffect(() => {
  loadClasses();
  loadWaitlist();
}, []);

  const handleBook = async (classId) => {
    setBookingInProgress(classId);
    setBookingMessages((prev) => ({ ...prev, [classId]: null }));
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API}/api/bookings`,
        { classId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setBookingMessages((prev) => ({
        ...prev,
        [classId]: { type: "success", text: "Booked! See you in class." },
      }));
      await loadClasses(); // refresh spot counts
    } catch (err) {
      setBookingMessages((prev) => ({
        ...prev,
        [classId]: {
          type: "error",
          text: err.response?.data?.error || "Could not book this class.",
        },
      }));
    } finally {
      setBookingInProgress(null);
    }
  };
  
  const handleJoinWaitlist = async (classId) => {
  setBookingInProgress(classId);
  setBookingMessages((prev) => ({ ...prev, [classId]: null }));
  try {
    const token = localStorage.getItem("token");
    const { data } = await axios.post(
      `${API}/api/waitlist`,
      { classId },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    setWaitlistPositions((prev) => ({ ...prev, [classId]: data.position }));
    setBookingMessages((prev) => ({
      ...prev,
      [classId]: { type: "success", text: `You're on the waitlist at position #${data.position}.` },
    }));
  } catch (err) {
    setBookingMessages((prev) => ({
      ...prev,
      [classId]: {
        type: "error",
        text: err.response?.data?.error || "Could not join the waitlist.",
      },
    }));
    await loadClasses(); // a spot may have opened up, so show "Book" again
  } finally {
    setBookingInProgress(null);
  }
};


  return (
    <>
      <Navbar />
      <div className="schedule-page">
        <h2 className="class-list-title">Next 7 Days</h2>
        <p className="schedule-subtitle">
          Browse the schedule. Sign up to reserve a spot.
        </p>

        {loading && <p>Loading schedule...</p>}
        {error && <p role="alert" className="auth-error">{error}</p>}

        {!loading && !error && classes.length === 0 && (
          <p>No classes scheduled in the next 7 days.</p>
        )}

        {!loading && classes.length > 0 && (
          <ul className="class-list">
            {classes.map((c) => (
              <li key={c._id} className="class-list-item">
                <div>
                  <strong>{c.className}</strong>
                  <p className="class-meta">
                    {c.instructorName} ·{" "}
                    {new Date(c.classDateTime).toLocaleString(undefined, {
                      weekday: "short",
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  {bookingMessages[c._id] && (
                    <p
                      role="alert"
                      className={
                        bookingMessages[c._id].type === "success"
                          ? "success-banner"
                          : "auth-error"
                      }
                    >
                      {bookingMessages[c._id].text}
                    </p>
                  )}
                </div>
                <div className="class-list-actions">
                  <span className="class-capacity">
                    {c.availableSpots > 0 ? `${c.availableSpots} spots available` : "Class full"}
                  </span>
                  {role === "member" && c.availableSpots > 0 && (
                    <button
                      className="btn-primary"
                      onClick={() => handleBook(c._id)}
                      disabled={bookingInProgress === c._id}
                    >
                      {bookingInProgress === c._id ? "Booking..." : "Book"}
                    </button>
                  )}
                  {role === "member" && c.availableSpots <= 0 &&
                    (waitlistPositions[c._id] ? (
                      <span className="class-capacity">Waitlist #{waitlistPositions[c._id]}</span>
                    ) : (
                      <button
                        className="btn-secondary"
                        onClick={() => handleJoinWaitlist(c._id)}
                        disabled={bookingInProgress === c._id}
                      >
                        {bookingInProgress === c._id ? "Joining..." : "Join waitlist"}
                      </button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}