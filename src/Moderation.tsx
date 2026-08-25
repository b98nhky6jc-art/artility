import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import "./App.css";

type ArtworkStatusModerationCase = {
  id: string;
  case_type: "artwork_status_report";
  state: "pending";
  created_at: string;
  subject: {
    type: "artwork";
    id: number;
    title: string | null;
    town: string | null;
    city: string | null;
    current_status: string;
  };
  reporter: {
    id: string;
    name: string | null;
    email: string | null;
  };
  payload: {
    report_id: number;
    report_type: string;
    date_observed: string;
    note: string | null;
    photo_storage_key: string | null;
    replacement_artwork_id: number | null;
  };
};

type QueueResponse = {
  items: ArtworkStatusModerationCase[];
};

type QueueState =
  | "loading"
  | "ready"
  | "signed_out"
  | "forbidden"
  | "error";

type Decision = "approved" | "rejected";

function formatStatusLabel(value: string) {
  const labels: Record<string, string> = {
    present: "Present",
    no_longer_there: "No longer there",
    changed_replaced: "Changed / replaced",
    damaged: "Damaged",
    defaced: "Defaced",
  };

  return (
    labels[value] ??
    value.replaceAll("_", " ").replace(/^./, (letter) =>
      letter.toUpperCase(),
    )
  );
}

function formatDate(value: string) {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00.000Z`
    : value.includes("T")
      ? value
      : value.replace(" ", "T") + "Z";

  return new Date(normalized).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getArtworkTitle(item: ArtworkStatusModerationCase) {
  return item.subject.title?.trim() || `Artwork #${item.subject.id}`;
}

function getArtworkLocation(item: ArtworkStatusModerationCase) {
  return item.subject.city || item.subject.town || "Location not recorded";
}

function ModerationCaseCard({
  item,
  reviewing,
  error,
  onDecision,
}: {
  item: ArtworkStatusModerationCase;
  reviewing: Decision | null;
  error: string;
  onDecision: (item: ArtworkStatusModerationCase, decision: Decision) => void;
}) {
  const reporter =
    item.reporter.name || item.reporter.email || item.reporter.id;

  return (
    <article
      className="moderation-case"
      aria-labelledby={`moderation-case-${item.payload.report_id}`}
    >
      <div className="moderation-case-heading">
        <div>
          <div className="moderation-case-badges">
            <span className="moderation-type-badge">Artwork status</span>
            <span className="moderation-state-badge">Pending</span>
          </div>
          <h2 id={`moderation-case-${item.payload.report_id}`}>
            {getArtworkTitle(item)}
          </h2>
          <p>
            {getArtworkLocation(item)} · Current status: {" "}
            <strong>{formatStatusLabel(item.subject.current_status)}</strong>
          </p>
        </div>

        <Link
          to={`/artwork/${item.subject.id}`}
          className="moderation-artwork-link"
        >
          View artwork →
        </Link>
      </div>

      <div className="moderation-case-body">
        {item.payload.photo_storage_key && (
          <a
            href={`/api/images/${item.payload.photo_storage_key}`}
            className="moderation-evidence-link"
            target="_blank"
            rel="noreferrer"
          >
            <img
              src={`/api/images/${item.payload.photo_storage_key}`}
              alt={`Supporting evidence for ${formatStatusLabel(item.payload.report_type).toLowerCase()}`}
              loading="lazy"
              decoding="async"
            />
          </a>
        )}

        <div className="moderation-report-copy">
          <dl className="moderation-metadata">
            <div>
              <dt>Reported status</dt>
              <dd>{formatStatusLabel(item.payload.report_type)}</dd>
            </div>
            <div>
              <dt>Date observed</dt>
              <dd>{formatDate(item.payload.date_observed)}</dd>
            </div>
            <div>
              <dt>Reporter</dt>
              <dd>
                {reporter}
                {item.reporter.name && item.reporter.email && (
                  <small>{item.reporter.email}</small>
                )}
              </dd>
            </div>
            <div>
              <dt>Submitted</dt>
              <dd>{formatDate(item.created_at)}</dd>
            </div>
          </dl>

          {item.payload.note && (
            <div className="moderation-note">
              <strong>Reporter note</strong>
              <p>{item.payload.note}</p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="moderation-actions">
        <button
          type="button"
          className="moderation-approve-button"
          disabled={reviewing !== null}
          onClick={() => onDecision(item, "approved")}
        >
          {reviewing === "approved" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          className="moderation-reject-button"
          disabled={reviewing !== null}
          onClick={() => onDecision(item, "rejected")}
        >
          {reviewing === "rejected" ? "Rejecting…" : "Reject"}
        </button>
      </div>
    </article>
  );
}

export default function Moderation() {
  const [queueState, setQueueState] = useState<QueueState>("loading");
  const [items, setItems] = useState<ArtworkStatusModerationCase[]>([]);
  const [reviewing, setReviewing] = useState<{
    id: string;
    decision: Decision;
  } | null>(null);
  const [caseErrors, setCaseErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");

  const loadQueue = useCallback(async () => {
    setQueueState("loading");

    try {
      const response = await fetch(
        "/api/admin/moderation/cases?state=pending&type=artwork_status_report",
        { cache: "no-store" },
      );

      if (response.status === 401) {
        setQueueState("signed_out");
        return;
      }

      if (response.status === 403) {
        setQueueState("forbidden");
        return;
      }

      if (!response.ok) {
        throw new Error(`Moderation API returned ${response.status}`);
      }

      const data = (await response.json()) as QueueResponse;

      setItems(data.items ?? []);
      setQueueState("ready");
    } catch (error) {
      console.error(error);
      setQueueState("error");
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  async function reviewCase(
    item: ArtworkStatusModerationCase,
    decision: Decision,
  ) {
    setReviewing({ id: item.id, decision });
    setCaseErrors((current) => ({ ...current, [item.id]: "" }));
    setNotice("");

    try {
      const response = await fetch(
        `/api/admin/moderation/cases/artwork-status-report/${item.payload.report_id}/decision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not review this report.");
      }

      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setNotice(
        decision === "approved"
          ? `${getArtworkTitle(item)} was approved and its public status is now ${formatStatusLabel(item.payload.report_type).toLowerCase()}.`
          : `${getArtworkTitle(item)} was rejected. Its public status was not changed.`,
      );
    } catch (error) {
      setCaseErrors((current) => ({
        ...current,
        [item.id]:
          error instanceof Error
            ? error.message
            : "Could not review this report.",
      }));
    } finally {
      setReviewing(null);
    }
  }

  if (queueState === "signed_out") {
    return (
      <main className="page-main moderation-page">
        <section className="page-panel moderation-access-panel">
          <span className="eyebrow">CONTENT REVIEW</span>
          <h1>Sign in to continue</h1>
          <p>Moderator access is required to review status reports.</p>
          <Link to="/login" className="report-signin-link">
            Sign in
          </Link>
        </section>
      </main>
    );
  }

  if (queueState === "forbidden") {
    return (
      <main className="page-main moderation-page">
        <section className="page-panel moderation-access-panel">
          <span className="eyebrow">CONTENT REVIEW</span>
          <h1>Moderator access required</h1>
          <p>This queue is available only to Artility admins and moderators.</p>
          <Link to="/" className="report-signin-link">
            Return to Explore
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page-main moderation-page">
      <section className="page-panel moderation-hero">
        <div>
          <span className="eyebrow">CONTENT REVIEW</span>
          <h1>Moderation queue</h1>
          <p>
            Review community reports before they affect an artwork’s public
            status. Decisions preserve the full dated record.
          </p>
        </div>
        <div className="moderation-queue-count" aria-live="polite">
          <strong>{items.length}</strong>
          <span>{items.length === 1 ? "pending case" : "pending cases"}</span>
        </div>
      </section>

      {notice && (
        <p className="moderation-notice" role="status">
          {notice}
        </p>
      )}

      {queueState === "loading" && (
        <p className="message">Loading moderation queue…</p>
      )}

      {queueState === "error" && (
        <div className="moderation-load-error">
          <p>Couldn’t load the moderation queue.</p>
          <button type="button" onClick={() => void loadQueue()}>
            Try again
          </button>
        </div>
      )}

      {queueState === "ready" && items.length === 0 && (
        <section className="moderation-empty">
          <span aria-hidden="true">✓</span>
          <h2>All caught up</h2>
          <p>There are no pending artwork status reports.</p>
        </section>
      )}

      {queueState === "ready" && items.length > 0 && (
        <section className="moderation-case-list" aria-label="Pending reports">
          {items.map((item) => (
            <ModerationCaseCard
              key={item.id}
              item={item}
              reviewing={
                reviewing?.id === item.id ? reviewing.decision : null
              }
              error={caseErrors[item.id] ?? ""}
              onDecision={reviewCase}
            />
          ))}
        </section>
      )}
    </main>
  );
}
