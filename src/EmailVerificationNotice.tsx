import { useState } from "react";
import { authClient } from "./lib/auth-client";

type EmailVerificationNoticeProps = {
  email: string;
  compact?: boolean;
};

export default function EmailVerificationNotice({
  email,
  compact = false,
}: EmailVerificationNoticeProps) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function resendVerification() {
    setSending(true);
    setMessage("");
    setError("");

    try {
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: "/verify-email",
      });

      if (result.error) {
        setError(
          result.error.message ?? "Could not send a verification email.",
        );
        return;
      }

      setMessage(`Verification email sent to ${email}.`);
    } catch (error) {
      console.error(error);
      setError("Could not send a verification email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className={`verification-notice${compact ? " verification-notice-compact" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div>
        <strong>Verify your email to contribute</strong>
        <p>
          You can keep browsing, but uploads, edits and check-ins require a
          verified email. We sent a link to <strong>{email}</strong>.
        </p>
      </div>

      <div className="verification-notice-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={resendVerification}
          disabled={sending}
        >
          {sending ? "Sending…" : "Resend verification"}
        </button>

        {message && <span className="verification-success">{message}</span>}
        {error && <span className="form-error">{error}</span>}
      </div>
    </div>
  );
}
