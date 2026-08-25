import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import "./App.css";

type ModerationSubject = {
  type: "artwork";
  id: number;
  title: string | null;
  town: string | null;
  city: string | null;
  current_status: string;
};

type ModerationReporter = {
  id: string | null;
  name: string | null;
  email: string | null;
};

type ArtworkStatusModerationCase = {
  id: string;
  case_type: "artwork_status_report";
  state: "pending";
  created_at: string;
  subject: ModerationSubject;
  reporter: ModerationReporter;
  payload: {
    report_id: number;
    report_type: string;
    date_observed: string;
    note: string | null;
    photo_storage_key: string | null;
    replacement_artwork_id: number | null;
  };
};

type ArtworkPhotoModerationCase = {
  id: string;
  case_type: "artwork_photo";
  state: "manual_review";
  created_at: string;
  subject: ModerationSubject;
  reporter: ModerationReporter;
  payload: {
    photo_id: number;
    reason: string | null;
    provider: string | null;
    model: string | null;
    categories: string | null;
    scores: string | null;
    moderation_error: string | null;
    source_mime_type: string | null;
    stored_mime_type: string | null;
    width: number | null;
    height: number | null;
    byte_size: number | null;
  };
};

type ModerationCase =
  | ArtworkStatusModerationCase
  | ArtworkPhotoModerationCase;

type QueueResponse = { items: ModerationCase[] };

type BulkApprovalResponse = {
  approved?: number[];
  skipped?: number[];
  failed?: Array<{ id: number; error: string }>;
  error?: string;
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

function getArtworkTitle(item: ModerationCase) {
  return item.subject.title?.trim() || `Artwork #${item.subject.id}`;
}

function getArtworkLocation(item: ModerationCase) {
  return item.subject.city || item.subject.town || "Location not recorded";
}

function formatBytes(value: number | null) {
  if (!value) {
    return "Not recorded";
  }

  return value >= 1024 * 1024
    ? `${(value / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.ceil(value / 1024)} KB`;
}

function getFlaggedCategories(value: string | null) {
  if (!value) {
    return "None recorded";
  }

  try {
    const categories = JSON.parse(value) as Record<string, boolean>;
    const flagged = Object.entries(categories)
      .filter(([, selected]) => selected)
      .map(([category]) => formatStatusLabel(category));

    return flagged.length ? flagged.join(", ") : "No flagged category";
  } catch {
    return "Could not read result";
  }
}

function ModerationCaseCard({
  item,
  reviewing,
  error,
  onDecision,
}: {
  item: ModerationCase;
  reviewing: Decision | null;
  error: string;
  onDecision: (item: ModerationCase, decision: Decision) => void;
}) {
  const reporter =
    item.reporter.name || item.reporter.email || item.reporter.id || "Unknown";
  const isImageCase = item.case_type === "artwork_photo";
  const imageUrl = isImageCase
    ? `/api/admin/moderation/images/artwork-photo/${item.payload.photo_id}`
    : item.payload.photo_storage_key
      ? `/api/admin/moderation/images/artwork-status-report/${item.payload.report_id}`
      : null;

  return (
    <article className="moderation-case" aria-labelledby={`case-${item.id}`}>
      <div className="moderation-case-heading">
        <div>
          <div className="moderation-case-badges">
            <span className="moderation-type-badge">
              {isImageCase ? "Artwork image" : "Artwork status"}
            </span>
            <span className="moderation-state-badge">
              {isImageCase ? "Manual review" : "Pending"}
            </span>
          </div>
          <h2 id={`case-${item.id}`}>{getArtworkTitle(item)}</h2>
          <p>
            {getArtworkLocation(item)} · Current status:{" "}
            <strong>{formatStatusLabel(item.subject.current_status)}</strong>
          </p>
        </div>

        {isImageCase ? (
          <span className="moderation-artwork-link moderation-artwork-private">
            Not public yet
          </span>
        ) : (
          <Link
            to={`/artwork/${item.subject.id}`}
            className="moderation-artwork-link"
          >
            View artwork →
          </Link>
        )}
      </div>

      <div className="moderation-case-body">
        {imageUrl && (
          <a
            href={imageUrl}
            className="moderation-evidence-link"
            target="_blank"
            rel="noreferrer"
          >
            <img
              src={imageUrl}
              alt={
                isImageCase
                  ? `Quarantined upload for ${getArtworkTitle(item)}`
                  : `Supporting evidence for ${formatStatusLabel(item.payload.report_type).toLowerCase()}`
              }
              loading="lazy"
              decoding="async"
            />
          </a>
        )}

        <div className="moderation-report-copy">
          {isImageCase ? (
            <>
              <dl className="moderation-metadata">
                <div>
                  <dt>Automated result</dt>
                  <dd>{getFlaggedCategories(item.payload.categories)}</dd>
                </div>
                <div>
                  <dt>Normalized image</dt>
                  <dd>
                    {item.payload.width && item.payload.height
                      ? `${item.payload.width} × ${item.payload.height}`
                      : "Dimensions unavailable"}
                    <small>{formatBytes(item.payload.byte_size)}</small>
                  </dd>
                </div>
                <div>
                  <dt>Uploader</dt>
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

              <div className="moderation-note">
                <strong>Why this needs review</strong>
                <p>{item.payload.reason || "No reason was supplied."}</p>
                {item.payload.moderation_error && (
                  <p>Provider error: {item.payload.moderation_error}</p>
                )}
              </div>
            </>
          ) : (
            <>
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
            </>
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
  const [items, setItems] = useState<ModerationCase[]>([]);
  const [reviewing, setReviewing] = useState<{
    id: string;
    decision: Decision;
  } | null>(null);
  const [caseErrors, setCaseErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkError, setBulkError] = useState("");

  const loadQueue = useCallback(async () => {
    setQueueState("loading");

    try {
      const response = await fetch("/api/admin/moderation/cases?type=all", {
        cache: "no-store",
      });

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

  async function reviewCase(item: ModerationCase, decision: Decision) {
    setReviewing({ id: item.id, decision });
    setCaseErrors((current) => ({ ...current, [item.id]: "" }));
    setNotice("");

    const decisionPath =
      item.case_type === "artwork_photo"
        ? `artwork-photo/${item.payload.photo_id}`
        : `artwork-status-report/${item.payload.report_id}`;

    try {
      const response = await fetch(
        `/api/admin/moderation/cases/${decisionPath}/decision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not review this case.");
      }

      setItems((current) => current.filter((entry) => entry.id !== item.id));

      if (item.case_type === "artwork_photo") {
        setNotice(
          decision === "approved"
            ? `${getArtworkTitle(item)}’s image is approved and now public.`
            : `${getArtworkTitle(item)}’s image was rejected and remains private.`,
        );
      } else {
        setNotice(
          decision === "approved"
            ? `${getArtworkTitle(item)} was approved and its public status is now ${formatStatusLabel(item.payload.report_type).toLowerCase()}.`
            : `${getArtworkTitle(item)} was rejected. Its public status was not changed.`,
        );
      }
    } catch (error) {
      setCaseErrors((current) => ({
        ...current,
        [item.id]:
          error instanceof Error
            ? error.message
            : "Could not review this case.",
      }));
    } finally {
      setReviewing(null);
    }
  }

  const imageCases = items.filter(
    (item): item is ArtworkPhotoModerationCase =>
      item.case_type === "artwork_photo",
  );

  async function bulkApproveImages() {
    const photoIds = imageCases.map((item) => item.payload.photo_id);

    if (
      photoIds.length === 0 ||
      !window.confirm(
        `Approve all ${photoIds.length} image${photoIds.length === 1 ? "" : "s"} currently waiting for review?`,
      )
    ) {
      return;
    }

    setBulkApproving(true);
    setBulkError("");
    setNotice("");

    try {
      const response = await fetch(
        "/api/admin/moderation/cases/artwork-photo/bulk-approve",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ photo_ids: photoIds }),
        },
      );
      const data = (await response.json()) as BulkApprovalResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Could not approve the image queue.");
      }

      const processedIds = new Set([
        ...(data.approved ?? []),
        ...(data.skipped ?? []),
      ]);
      setItems((current) =>
        current.filter(
          (item) =>
            item.case_type !== "artwork_photo" ||
            !processedIds.has(item.payload.photo_id),
        ),
      );

      const approvedCount = data.approved?.length ?? 0;
      const skippedCount = data.skipped?.length ?? 0;
      const failedCount = data.failed?.length ?? 0;
      setNotice(
        `${approvedCount} image${approvedCount === 1 ? "" : "s"} approved and published.${
          skippedCount
            ? ` ${skippedCount} already-reviewed image${skippedCount === 1 ? " was" : "s were"} skipped.`
            : ""
        }`,
      );

      if (failedCount) {
        setBulkError(
          `${failedCount} image${failedCount === 1 ? "" : "s"} could not be approved and remain in the queue.`,
        );
      }
    } catch (error) {
      setBulkError(
        error instanceof Error
          ? error.message
          : "Could not approve the image queue.",
      );
    } finally {
      setBulkApproving(false);
    }
  }

  if (queueState === "signed_out") {
    return (
      <main className="page-main moderation-page">
        <section className="page-panel moderation-access-panel">
          <span className="eyebrow">CONTENT REVIEW</span>
          <h1>Sign in to continue</h1>
          <p>Moderator access is required to review content.</p>
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
            Review community reports and uncertain uploads before they can
            affect public artwork pages.
          </p>
        </div>
        <div className="moderation-queue-count" aria-live="polite">
          <strong>{items.length}</strong>
          <span>{items.length === 1 ? "open case" : "open cases"}</span>
        </div>
      </section>

      {notice && (
        <p className="moderation-notice" role="status">
          {notice}
        </p>
      )}

      {queueState === "ready" && imageCases.length > 0 && (
        <section className="moderation-bulk-actions" aria-label="Image queue actions">
          <div>
            <span className="eyebrow">IMAGE QUEUE</span>
            <strong>
              {imageCases.length} image{imageCases.length === 1 ? "" : "s"} waiting
            </strong>
            <p>Approve this current set of quarantined images in one action.</p>
          </div>
          <button
            type="button"
            className="moderation-approve-button moderation-bulk-approve"
            disabled={bulkApproving || reviewing !== null}
            onClick={() => void bulkApproveImages()}
          >
            {bulkApproving
              ? "Approving images…"
              : `Approve all images (${imageCases.length})`}
          </button>
        </section>
      )}

      {bulkError && (
        <p className="moderation-bulk-error" role="alert">
          {bulkError}
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
          <p>There are no reports or images waiting for review.</p>
        </section>
      )}

      {queueState === "ready" && items.length > 0 && (
        <section className="moderation-case-list" aria-label="Open cases">
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
