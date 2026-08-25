import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { authClient } from "./lib/auth-client";
import "./App.css";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
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
        setError(result.error.message ?? "Could not sign in with Google.");
        setSocialSigningIn(false);
      }
    } catch (error) {
      console.error(error);
      setError("Could not sign in with Google.");
      setSocialSigningIn(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSigningIn(true);

    try {
      const result = await authClient.signIn.email({
        email: email.trim(),
        password,
      });

      if (result.error) {
        setError(result.error.message ?? "Could not sign in.");
        return;
      }

      navigate("/");
    } catch (error) {
      console.error(error);
      setError("Could not sign in.");
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <div className="detail-shell">
      <header className="detail-header">
        <Link to="/" className="back-link">
          ← Back to map
        </Link>
      </header>

      <main className="detail-main">
        <section className="auth-panel">
          <span className="eyebrow">WELCOME BACK</span>

          <h1>Sign in</h1>

          <p>Pick up where you left off.</p>

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
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            {error && <p className="form-error">{error}</p>}

            <button className="checkin-button" disabled={signingIn}>
              {signingIn ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="auth-footer">
            New here? <Link to="/signup">Create account</Link>
          </p>
        </section>
      </main>
    </div>
  );
}
