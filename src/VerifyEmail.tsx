import { useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import EmailVerificationNotice from "./EmailVerificationNotice";
import { authClient } from "./lib/auth-client";
import { canUserContribute } from "./emailVerification";
import "./App.css";

export default function VerifyEmail() {
  const { data: session, isPending, refetch } = authClient.useSession();
  const [searchParams] = useSearchParams();
  const verificationError = searchParams.get("error");
  const verificationCompleted = searchParams.get("verified") === "1";
  const canContribute = canUserContribute(session?.user);

  useEffect(() => {
    if (verificationCompleted) {
      void refetch({ query: { disableCookieCache: true } });
    }
  }, [refetch, verificationCompleted]);

  return (
    <div className="detail-shell">
      <header className="detail-header">
        <Link to="/" className="back-link">
          ← Back to map
        </Link>

        <span className="detail-number">Email verification</span>
      </header>

      <main className="detail-main">
        <section className="auth-panel verification-page">
          <span className="eyebrow">ACCOUNT SECURITY</span>

          {isPending ? (
            <p>Checking your email status…</p>
          ) : session?.user && canContribute ? (
            <>
              <h1>
                {session.user.emailVerified
                  ? "Email verified"
                  : "Account ready"}
              </h1>
              <p>
                You can now upload artwork, edit details and check in when
                you’re nearby.
              </p>

              <div className="verification-page-actions">
                <Link to="/add-artwork" className="checkin-button">
                  Add artwork
                </Link>
                <Link to="/" className="secondary-button">
                  Browse the map
                </Link>
              </div>
            </>
          ) : session?.user ? (
            <>
              <h1>Check your inbox</h1>

              {verificationError && (
                <p className="form-error">
                  That verification link is invalid or has expired. Request a
                  fresh link below.
                </p>
              )}

              <EmailVerificationNotice email={session.user.email} />

              <p className="auth-footer">
                <Link to="/">Continue browsing</Link>
              </p>
            </>
          ) : (
            <>
              <h1>Sign in to verify your email</h1>
              <p>
                Your verification link may already have succeeded. Sign in to
                check your account status or request another link.
              </p>
              <Link to="/login" className="checkin-button">
                Sign in
              </Link>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
