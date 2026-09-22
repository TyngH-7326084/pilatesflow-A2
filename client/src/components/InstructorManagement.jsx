import { useState, useEffect } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const emptyForm = { name: "", bio: "", specialties: "" };
const emptySlotForm = { dayOfWeek: "Monday", startTime: "", endTime: "" };
const emptyGenerateForm = { className: "", capacity: "", startDate: "", numberOfWeeks: "" };

export default function InstructorManagement() {
  const [instructors, setInstructors] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // US1.2: which instructor's availability panel is currently open
  const [managingId, setManagingId] = useState(null);
  const [slotForm, setSlotForm] = useState(emptySlotForm);
  const [slotError, setSlotError] = useState("");

  // US1.3: which slot's "generate classes" form is currently open, and its state
  const [generatingSlotId, setGeneratingSlotId] = useState(null);
  const [generateForm, setGenerateForm] = useState(emptyGenerateForm);
  const [generateError, setGenerateError] = useState("");
  const [generateResult, setGenerateResult] = useState(null);
  const [generating, setGenerating] = useState(false);

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
      setError(err.response?.data?.error || "Failed to delete instructor.");
    }
  };

  // ---- US1.2: availability management ----

  const toggleAvailability = (id) => {
    setSlotError("");
    setSlotForm(emptySlotForm);
    setGeneratingSlotId(null);
    setGenerateResult(null);
    setManagingId(managingId === id ? null : id);
  };

  const handleSlotChange = (e) => {
    setSlotForm({ ...slotForm, [e.target.name]: e.target.value });
  };

  const handleAddSlot = async (e, instructorId) => {
    e.preventDefault();
    setSlotError("");

    if (!slotForm.startTime || !slotForm.endTime) {
      setSlotError("Start and end time are required.");
      return;
    }

    try {
      await axios.post(
        `${API}/api/instructors/${instructorId}/availability`,
        slotForm,
        authHeaders()
      );
      setSlotForm(emptySlotForm);
      await loadInstructors();
    } catch (err) {
      setSlotError(err.response?.data?.error || "Could not add availability slot.");
    }
  };

  const handleRemoveSlot = async (instructorId, slotId) => {
    setSlotError("");
    try {
      await axios.delete(
        `${API}/api/instructors/${instructorId}/availability/${slotId}`,
        authHeaders()
      );
      await loadInstructors();
    } catch (err) {
      setSlotError(err.response?.data?.error || "Could not remove availability slot.");
    }
  };

  // ---- US1.3: generate recurring classes from a slot ----

  const toggleGenerateForm = (slotId) => {
    setGenerateError("");
    setGenerateResult(null);
    setGenerateForm(emptyGenerateForm);
    setGeneratingSlotId(generatingSlotId === slotId ? null : slotId);
  };

  const handleGenerateChange = (e) => {
    setGenerateForm({ ...generateForm, [e.target.name]: e.target.value });
  };

  const handleGenerateSubmit = async (e, instructorId, slotId) => {
    e.preventDefault();
    setGenerateError("");
    setGenerateResult(null);

    if (!generateForm.className.trim()) {
      setGenerateError("Class name is required.");
      return;
    }
    if (!generateForm.capacity || Number(generateForm.capacity) <= 0) {
      setGenerateError("Capacity must be greater than zero.");
      return;
    }
    if (!generateForm.startDate) {
      setGenerateError("Start date is required.");
      return;
    }
    if (!generateForm.numberOfWeeks || Number(generateForm.numberOfWeeks) <= 0) {
      setGenerateError("Number of weeks must be at least 1.");
      return;
    }

    setGenerating(true);
    try {
      const { data } = await axios.post(
        `${API}/api/instructors/${instructorId}/generate-slots`,
        {
          slotId,
          className: generateForm.className.trim(),
          capacity: Number(generateForm.capacity),
          startDate: generateForm.startDate,
          numberOfWeeks: Number(generateForm.numberOfWeeks),
        },
        authHeaders()
      );
      setGenerateResult(data);
      setGenerateForm(emptyGenerateForm);
    } catch (err) {
      setGenerateError(err.response?.data?.error || "Could not generate classes.");
    } finally {
      setGenerating(false);
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
            <li key={instructor._id} className="class-list-item" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong>{instructor.name}</strong>
                  {instructor.specialties?.length > 0 && (
                    <p className="class-meta">{instructor.specialties.join(", ")}</p>
                  )}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={() => handleEdit(instructor)} className="btn-secondary">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(instructor._id)} className="btn-secondary">
                    Delete
                  </button>
                  <button onClick={() => toggleAvailability(instructor._id)} className="btn-secondary">
                    {managingId === instructor._id ? "Close Availability" : "Manage Availability"}
                  </button>
                </div>
              </div>

              {managingId === instructor._id && (
                <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
                  {instructor.availability?.length > 0 ? (
                    <ul className="class-list">
                      {instructor.availability.map((slot) => (
                        <li key={slot._id} className="class-list-item" style={{ flexDirection: "column", alignItems: "stretch" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span>
                              {slot.dayOfWeek}: {slot.startTime}–{slot.endTime}
                            </span>
                            <div style={{ display: "flex", gap: "8px" }}>
                              <button
                                onClick={() => toggleGenerateForm(slot._id)}
                                className="btn-secondary"
                              >
                                {generatingSlotId === slot._id ? "Close" : "Generate Classes"}
                              </button>
                              <button
                                onClick={() => handleRemoveSlot(instructor._id, slot._id)}
                                className="btn-secondary"
                              >
                                Remove
                              </button>
                            </div>
                          </div>

                          {generatingSlotId === slot._id && (
                            <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
                              <form
                                onSubmit={(e) => handleGenerateSubmit(e, instructor._id, slot._id)}
                                className="auth-form"
                              >
                                <label htmlFor={`className-${slot._id}`}>Class Name</label>
                                <input
                                  id={`className-${slot._id}`}
                                  name="className"
                                  type="text"
                                  value={generateForm.className}
                                  onChange={handleGenerateChange}
                                  placeholder="e.g. Reformer Basics"
                                />

                                <label htmlFor={`capacity-${slot._id}`}>Capacity</label>
                                <input
                                  id={`capacity-${slot._id}`}
                                  name="capacity"
                                  type="number"
                                  min="1"
                                  value={generateForm.capacity}
                                  onChange={handleGenerateChange}
                                  placeholder="e.g. 10"
                                />

                                <label htmlFor={`startDate-${slot._id}`}>Start Date</label>
                                <input
                                  id={`startDate-${slot._id}`}
                                  name="startDate"
                                  type="date"
                                  value={generateForm.startDate}
                                  onChange={handleGenerateChange}
                                />

                                <label htmlFor={`weeks-${slot._id}`}>Number of Weeks</label>
                                <input
                                  id={`weeks-${slot._id}`}
                                  name="numberOfWeeks"
                                  type="number"
                                  min="1"
                                  max="52"
                                  value={generateForm.numberOfWeeks}
                                  onChange={handleGenerateChange}
                                  placeholder="e.g. 4"
                                />

                                {generateError && <p role="alert" className="auth-error">{generateError}</p>}

                                <button type="submit" className="btn-primary" disabled={generating}>
                                  {generating ? "Generating..." : "Generate"}
                                </button>
                              </form>

                              {generateResult && (
                                <div style={{ marginTop: "12px" }}>
                                  <p className="success-banner">
                                    {generateResult.created.length} class(es) created.
                                    {generateResult.skipped.length > 0 &&
                                      ` ${generateResult.skipped.length} skipped due to conflicts.`}
                                  </p>
                                  {generateResult.skipped.length > 0 && (
                                    <ul className="class-list">
                                      {generateResult.skipped.map((skip, i) => (
                                        <li key={i} className="class-list-item">
                                          <span className="class-meta">
                                            {new Date(skip.classDateTime).toLocaleString()}: {skip.reason}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No availability set yet.</p>
                  )}

                  <form
                    onSubmit={(e) => handleAddSlot(e, instructor._id)}
                    className="auth-form"
                    style={{ marginTop: "12px" }}
                  >
                    <label htmlFor={`day-${instructor._id}`}>Day</label>
                    <select
                      id={`day-${instructor._id}`}
                      name="dayOfWeek"
                      value={slotForm.dayOfWeek}
                      onChange={handleSlotChange}
                    >
                      {DAYS.map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>

                    <label htmlFor={`start-${instructor._id}`}>Start Time</label>
                    <input
                      id={`start-${instructor._id}`}
                      name="startTime"
                      type="time"
                      value={slotForm.startTime}
                      onChange={handleSlotChange}
                    />

                    <label htmlFor={`end-${instructor._id}`}>End Time</label>
                    <input
                      id={`end-${instructor._id}`}
                      name="endTime"
                      type="time"
                      value={slotForm.endTime}
                      onChange={handleSlotChange}
                    />

                    {slotError && <p role="alert" className="auth-error">{slotError}</p>}

                    <button type="submit" className="btn-primary">
                      Add Slot
                    </button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}