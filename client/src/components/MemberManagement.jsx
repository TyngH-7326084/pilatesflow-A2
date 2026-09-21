import { useState, useEffect } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

const emptyForm = { name: "", email: "", tier: "basic", status: "active" };

export default function MemberManagement() {
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const authHeaders = () => {
    const token = localStorage.getItem("token");
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  const loadMembers = async () => {
    try {
      const { data } = await axios.get(
        `${API}/api/members?search=${encodeURIComponent(search)}`,
        authHeaders()
      );
      setMembers(data);
    } catch (err) {
      setError("Could not load members.");
    }
  };

  useEffect(() => {
    loadMembers();
  }, [search]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const validate = () => {
    if (!form.name.trim()) return "Name is required.";
    if (!form.email.trim()) return "Email is required.";
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editingId) return;

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setSuccessMsg("");
      return;
    }

    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      tier: form.tier,
      status: form.status,
    };

    setError("");
    setSubmitting(true);
    try {
      await axios.put(`${API}/api/members/${editingId}`, payload, authHeaders());
      setSuccessMsg("Member updated!");
      resetForm();
      await loadMembers();
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong.");
      setSuccessMsg("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (member) => {
    setEditingId(member._id);
    setForm({
      name: member.name || "",
      email: member.email,
      tier: member.tier,
      status: member.status,
    });
    setError("");
    setSuccessMsg("");
  };

  return (
    <div className="create-class-card">
      <h2 className="auth-title">Members</h2>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or email"
        className="member-search"
      />

      {editingId && (
        <form onSubmit={handleSubmit} className="auth-form">
          <h3 className="class-list-title">Edit Member</h3>

          <label htmlFor="name">Name</label>
          <input
            id="name"
            name="name"
            type="text"
            value={form.name}
            onChange={handleChange}
            placeholder="Member name"
          />

          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            placeholder="Member email"
          />

          <label htmlFor="tier">Tier</label>
          <select id="tier" name="tier" value={form.tier} onChange={handleChange}>
            <option value="basic">Basic</option>
            <option value="premium">Premium</option>
          </select>

          <label htmlFor="status">Status</label>
          <select id="status" name="status" value={form.status} onChange={handleChange}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          {error && <p role="alert" className="auth-error">{error}</p>}
          {successMsg && <p className="success-banner">{successMsg}</p>}

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Saving..." : "Update Member"}
          </button>
          <button type="button" onClick={resetForm} className="btn-secondary">
            Cancel
          </button>
        </form>
      )}

      {!editingId && (error || successMsg) && (
        <>
          {error && <p role="alert" className="auth-error">{error}</p>}
          {successMsg && <p className="success-banner">{successMsg}</p>}
        </>
      )}

      <h3 className="class-list-title">All Members</h3>
      {members.length === 0 ? (
        <p>No members found.</p>
      ) : (
        <ul className="class-list">
          {members.map((member) => (
            <li key={member._id} className="class-list-item">
              <div>
                <strong>{member.name || "(no name)"}</strong>
                <p className="class-meta">
                  {member.email} · {member.tier} · {member.status}
                </p>
              </div>
              <div>
                <button onClick={() => handleEdit(member)} className="btn-secondary">
                  Edit
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
