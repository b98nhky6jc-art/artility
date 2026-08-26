import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { authClient } from "./lib/auth-client";
import CommunitySafetyNotice from "./CommunitySafetyNotice";
import "./App.css";

export default function Signup() {
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [socialSigningIn, setSocialSigningIn] = useState(false);
  const [error, setError] = useState("");

  async function handleGoogleSignIn() {
    setError("");
    setSocialSigningIn(true);

    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
      });

      if (result?.error) {
        setError(result.error.message ?? "Could not continue with Google.");
        setSocialSigningIn(false);
      }
    } catch (error) {
      console.error(error);
      setError("Could not continue with Google.");
      setSocialSigningIn(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");

    if (!displayName.trim()) {
      setError("Please enter your name.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSaving(true);

    try {
      const result = await authClient.signUp.email({
        email: email.trim(),
        password,
        name: displayName.trim(),
      });

      if (result.error) {
        setError(result.error.message ?? "Could not create account.");
        return;
      }

      navigate("/");
    } catch (error) {
      console.error(error);
      setError("Could not create account.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="detail-shell">
      <header className="detail-header">
        <Link to="/" className="back-link">
          ← Back to map
        </Link>

        <span className="detail-number">Create account</span>
      </header>

      <main className="detail-main">
        <section className="auth-panel">
          <span className="eyebrow">JOIN THE HUNT</span>

          <h1>Create account</h1>

          <p>Keep track of your finds and contribute artwork.</p>
          <CommunitySafetyNotice context="profile" />

          <button
            type="button"
            className="social-login-button"
            onClick={handleGoogleSignIn}
            disabled={socialSigningIn}
          >
            <span className="google-mark">G</span>
            {socialSigningIn ? "Connecting…" : "Continue with Google"}
          </button>

          <div className="auth-divider">
            <span>or</span>
          </div>

          <form className="add-artwork-form" onSubmit={handleSubmit}>
            <label>
              Your name
              <input
                type="text"
                required
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>

            <label>
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            <label>
              Password
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            <label>
              Confirm password
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>

            {error && <p className="form-error">{error}</p>}

            <button className="checkin-button" disabled={saving}>
              {saving ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="auth-footer">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </section>
      </main>
    </div>
  );
}
