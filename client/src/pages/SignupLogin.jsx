import { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";
import Navbar from "../components/Navbar";

const API = import.meta.env.VITE_API_URL ?? "";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^(?=.*\d).{8,}$/;

export default function SignupLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [authMessage] = useState(() => sessionStorage.getItem("authMessage") || "");
  const [mode, setMode] = useState(location.state?.mode || (authMessage ? "login" : "signup"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(authMessage);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    sessionStorage.removeItem("authMessage");
  }, []);


  const validate = () => {
    if (!EMAIL_RE.test(email)) return "Enter a valid email address.";
    if (mode === "signup" && !PASSWORD_RE.test(password)) {
      return "Password must be at least 8 characters and include a number.";
    }
    if (!password) return "Password is required.";
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const { data } = await axios.post(`${API}/api/auth/${mode}`, { email, password });
      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.user.role);
      navigate(data.user.role === "admin" ? "/admin" : "/schedule");
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Navbar />
      <div className="auth-card">
        <h2 className="auth-title">PilatesFlow</h2>
        <form onSubmit={handleSubmit} className="auth-form">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p role="alert" className="auth-error">{error}</p>}

          {mode === "signup" ? (
            <>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? "Creating..." : "Create Account"}
              </button>
              <div className="auth-toggle-row">
                <button type="button" className="btn-secondary" onClick={() => setMode("login")}>
                  Login
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => { setEmail(""); setPassword(""); setError(""); }}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? "Logging in..." : "Login"}
              </button>
              <div className="auth-toggle-row">
                <button type="button" className="btn-ghost" onClick={() => setMode("signup")}>
                  Back
                </button>
                <button type="button" className="btn-secondary" onClick={() => setMode("signup")}>
                  Sign Up
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </>
  );
}