import { useState, useEffect } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

const emptyForm = { name: "", bio: "", specialties: "" };

export default function InstructorManagement() {
  const [instructors, setInstructors] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const authHeaders = () => {
    const token = localStorage.getItem("token");
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  const loadInstructors = async () => {
    try {
      const { data } = await axios.get(`${API}/api/instructors`, authHeaders());
      setInstructors(data);
    } catch (err) {
      setError("Could not load instructors.");
    }
  };

  useEffect(() => {
    loadInstructors();
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const validate = () => {
    if (!form.name.trim()) return "Instructor name is required.";
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

    const payload = {
      name: form.name.trim(),
      bio: form.bio.trim(),
      specialties: form.specialties
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };

    setError("");
    setSubmitting(true);
    try {
      if (editingId) {
        await axios.put(`${API}/api/instructors/${editingId}`, payload, authHeaders());
        setSuccessMsg("Instructor updated!");
      } else {
        await axios.post(`${API}/api/instructors`, payload, authHeaders());
        setSuccessMsg("Instructor added!");
      }
      resetForm();
      await loadInstructors();
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong.");
      setSuccessMsg("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (instructor) => {
    setEditingId(instructor._id);
    setForm({
      name: instructor.name,
      bio: instructor.bio || "",
      specialties: (instructor.specialties || []).join(", "),
    });
    setError("");
    setSuccessMsg("");
  };

  const handleDelete = async (id) => {
    setError("");
    setSuccessMsg("");
    if (!window.confirm("Delete this instructor?")) return;

    try {
      await axios.delete(`${API}/api/instructors/${id}`, authHeaders());
      setSuccessMsg("Instructor deleted.");
      await loadInstructors();
    } catch (err) {
      // Displays the "upcoming classes" guard message from the backend
      setError(err.response?.data?.error || "Failed to delete instructor.");
    }
  };

  return (
    <div className="create-class-card">
      <h2 className="auth-title">{editingId ? "Edit Instructor" : "Add Instructor"}</h2>
      <form onSubmit={handleSubmit} className="auth-form">
        <label htmlFor="name">Name</label>
        <input
          id="name"
          name="name"
          type="text"
          value={form.name}
          onChange={handleChange}
          placeholder="Enter instructor name"
        />

        <label htmlFor="bio">Bio</label>
        <input
          id="bio"
          name="bio"
          type="text"
          value={form.bio}
          onChange={handleChange}
          placeholder="Short bio"
        />

        <label htmlFor="specialties">Specialties</label>
        <input
          id="specialties"
          name="specialties"
          type="text"
          value={form.specialties}
          onChange={handleChange}
          placeholder="Comma separated, e.g. Reformer, Mat Pilates"
        />

        {error && <p role="alert" className="auth-error">{error}</p>}
        {successMsg && <p className="success-banner">{successMsg}</p>}

        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Saving..." : editingId ? "Update Instructor" : "Add Instructor"}
        </button>
        {editingId && (
          <button type="button" onClick={resetForm} className="btn-secondary">
            Cancel
          </button>
        )}
      </form>

      <h3 className="class-list-title">All Instructors</h3>
      {instructors.length === 0 ? (
        <p>No instructors yet.</p>
      ) : (
        <ul className="class-list">
          {instructors.map((instructor) => (
            <li key={instructor._id} className="class-list-item">
              <div>
                <strong>{instructor.name}</strong>
                {instructor.specialties?.length > 0 && (
                  <p className="class-meta">{instructor.specialties.join(", ")}</p>
                )}
              </div>
              <div>
                <button onClick={() => handleEdit(instructor)} className="btn-secondary">
                  Edit
                </button>
                <button onClick={() => handleDelete(instructor._id)} className="btn-secondary">
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}