import { useState, useEffect } from "react";
import axios from "axios";
import Navbar from "../components/Navbar";
import InstructorManagement from "../components/InstructorManagement";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function AdminDashboard() {
  const [classes, setClasses] = useState([]);
  const [className, setClassName] = useState("");
  const [instructorName, setInstructorName] = useState("");
  const [classDateTime, setClassDateTime] = useState("");
  const [capacity, setCapacity] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadClasses = async () => {
    try {
      const { data } = await axios.get(`${API}/api/classes`);
      setClasses(data);
    } catch (err) {
      setError("Could not load classes.");
    }
  };

  useEffect(() => {
    loadClasses();
  }, []);

  const validate = () => {
    if (!className.trim()) return "Class name is required.";
    if (!instructorName.trim()) return "Instructor name is required.";
    if (!classDateTime) return "Class date and time is required.";
    if (!capacity || Number(capacity) <= 0) return "Capacity must be greater than zero.";
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setSuccessMsg("");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API}/api/classes`,
        { className, instructorName, classDateTime, capacity: Number(capacity) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccessMsg("Class created!");
      setClassName("");
      setInstructorName("");
      setClassDateTime("");
      setCapacity("");
      await loadClasses(); // refresh list immediately
    } catch (err) {
      setError(err.response?.data?.error || "Could not create class.");
      setSuccessMsg("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Navbar />
      <div className="admin-page">
        <div className="create-class-card">
          <h2 className="auth-title">Create a Class</h2>
          <form onSubmit={handleSubmit} className="auth-form">
            <label htmlFor="className">Class Name</label>
            <input
              id="className"
              type="text"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="Enter class name"
            />

            <label htmlFor="instructorName">Instructor Name</label>
            <input
              id="instructorName"
              type="text"
              value={instructorName}
              onChange={(e) => setInstructorName(e.target.value)}
              placeholder="Enter instructor name"
            />

            <label htmlFor="classDateTime">Class Date and Time</label>
            <input
              id="classDateTime"
              type="datetime-local"
              value={classDateTime}
              onChange={(e) => setClassDateTime(e.target.value)}
            />

            <label htmlFor="capacity">Class Capacity</label>
            <input
              id="capacity"
              type="number"
              min="1"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="e.g. 10"
            />

            {error && <p role="alert" className="auth-error">{error}</p>}
            {successMsg && <p className="success-banner">{successMsg}</p>}

            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? "Creating..." : "Create Class"}
            </button>
          </form>
        </div>

        <div className="class-list-card">
          <h3 className="class-list-title">All Classes</h3>
          {classes.length === 0 ? (
            <p>No classes scheduled yet.</p>
          ) : (
            <ul className="class-list">
              {classes.map((c) => (
                <li key={c._id} className="class-list-item">
                  <div>
                    <strong>{c.className}</strong>
                    <p className="class-meta">
                      {c.instructorName} · {new Date(c.classDateTime).toLocaleString()}
                    </p>
                  </div>
                  <span className="class-capacity">Capacity: {c.capacity}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <InstructorManagement />
      </div>
    </>
  );
}