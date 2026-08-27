import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import ArtworkMap from "./ArtworkMap";
import "./App.css";
import { getArtworkDisplayTitle } from "./artworkDisplay";
import ArtistAttribution from "./ArtistAttribution";
import { authClient } from "./lib/auth-client";
import EmailVerificationNotice from "./EmailVerificationNotice";
import { canUserContribute } from "./emailVerification";
import ArtistAutocomplete from "./ArtistAutocomplete";
import { useAdminAccess } from "./useModeratorAccess";
import AddToWalkButton from "./AddToWalkButton";
import {
  formatInfrastructureType,
  INFRASTRUCTURE_TYPES,
  normaliseInfrastructureType,
  type InfrastructureType,
} from "../shared/infrastructure-types";


type Artwork = {
  id: number;
  title: string | null;
  description: string | null;
  latitude: number;
  longitude: number;
  town: string | null;
  city: string | null;
  infrastructure_type: string;
  status: string;
  created_at: string;
  checkin_count: number;
  last_checkin_at: string | null;
  artist_name: string | null;
  instagram_handle: string | null;
  primary_photo: string | null;
  photo_added_at: string | null;
};
type ArtworkPhoto = {
  id: number;
  storage_key: string;
  is_primary: number;
  created_at: string;
};

type ArtworkDetailResponse = {
  artwork: Artwork;
  photos: ArtworkPhoto[];
};

type ArtworkStatusEvent = {
  id: number;
  report_type: string;
  date_observed: string;
  note: string | null;
  photo_storage_key: string | null;
  replacement_artwork_id: number | null;
  created_at: string;
};

type ArtworkStatusHistoryResponse = {
  current_status: {
    type: string;
    date_observed: string;
    source: "artwork" | "approved_report";
  };
  history: ArtworkStatusEvent[];
};

const STATUS_REPORT_OPTIONS = [
  { value: "no_longer_there", label: "No longer there" },
  { value: "changed_replaced", label: "Changed / replaced" },
  { value: "damaged", label: "Damaged" },
  { value: "defaced", label: "Defaced" },
] as const;

const CHECKIN_RADIUS_METRES = 100;
const MAX_STATUS_PHOTO_SIZE_BYTES = 8 * 1024 * 1024;
const TODAY = new Date().toISOString().slice(0, 10);

function formatStatusLabel(value: string) {
  const knownStatus = STATUS_REPORT_OPTIONS.find(
    (option) => option.value === value,
  );

  if (knownStatus) {
    return knownStatus.label;
  }

  return value.replaceAll("_", " ").replace(/^./, (letter) =>
    letter.toUpperCase(),
  );
}

function formatArtworkDate(value: string) {
  const dateValue = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00.000Z`
    : value.includes("T")
      ? value
      : value.replace(" ", "T") + "Z";

  return new Date(dateValue).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function calculateDistanceMetres(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const earthRadius = 6371000;

  const toRadians = (value: number) => (value * Math.PI) / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadius * c;
}

export default function ArtworkDetail() {
  const location = useLocation();
  const navigate = useNavigate();
  const uploadModeration = (
    location.state as {
      uploadModeration?: "review" | "rejected" | null;
    } | null
  )?.uploadModeration;

  const { id } = useParams();
  const [photos, setPhotos] = useState<ArtworkPhoto[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);


  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [currentApprovedStatus, setCurrentApprovedStatus] = useState<
    ArtworkStatusHistoryResponse["current_status"] | null
  >(null);
  const [statusHistory, setStatusHistory] = useState<ArtworkStatusEvent[]>([]);
  const [statusHistoryError, setStatusHistoryError] = useState("");

  const [loading, setLoading] = useState(true);

  const [checkedIn, setCheckedIn] = useState(false);

  const [checkingIn, setCheckingIn] = useState(false);

  const [distanceMetres, setDistanceMetres] = useState<number | null>(null);

  const [locationError, setLocationError] = useState(() =>
    navigator.geolocation
      ? ""
      : "Location is not supported by this browser.",
  );
  const { data: session } = authClient.useSession();
  const { isAdmin } = useAdminAccess(session?.user.id);
  const canContribute = canUserContribute(session?.user);

  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [deletingArtwork, setDeletingArtwork] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [editTitle, setEditTitle] = useState("");
  const [editArtistName, setEditArtistName] = useState("");
  const [editInstagramHandle, setEditInstagramHandle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editInfrastructureType, setEditInfrastructureType] =
    useState<InfrastructureType>("Utility box / cabinet");

  const [reportingOpen, setReportingOpen] = useState(false);
  const [reportType, setReportType] = useState("");
  const [dateObserved, setDateObserved] = useState(TODAY);
  const [reportNote, setReportNote] = useState("");
  const [reportPhoto, setReportPhoto] = useState<File | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportSuccess, setReportSuccess] = useState("");

  function startEditing() {
    if (!artwork) {
      return;
    }

    setEditTitle(artwork.title ?? "");
    setEditArtistName(artwork.artist_name ?? "");
    setEditInstagramHandle(artwork.instagram_handle ?? "");
    setEditDescription(artwork.description ?? "");
    setEditInfrastructureType(
      normaliseInfrastructureType(artwork.infrastructure_type) ?? "Other",
    );

    setEditError("");
    setEditing(true);
  }

  async function deleteArtwork() {
    if (
      !artwork ||
      !window.confirm(
        `Permanently delete ${getArtworkDisplayTitle(artwork)} and all of its photos, check-ins, reports and history? This cannot be undone.`,
      )
    ) {
      return;
    }

    setDeletingArtwork(true);
    setDeleteError("");

    try {
      const response = await fetch(`/api/admin/artworks/${artwork.id}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not delete this artwork.");
      }

      navigate("/", { replace: true });
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Could not delete this artwork.",
      );
      setDeletingArtwork(false);
    }
  }

  async function saveEdits(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!artwork) {
      return;
    }

    setSavingEdit(true);
    setEditError("");

    try {
      const response = await fetch(`/api/artworks/${artwork.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: editTitle,
          artist_name: editArtistName,
          instagram_handle: editInstagramHandle,
          description: editDescription,
          infrastructure_type: editInfrastructureType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Could not update artwork.");
      }

      if (data.unchanged) {
        setEditing(false);
        return;
      }

      setArtwork((current) =>
        current
          ? {
            ...current,
            title: data.artwork?.title ?? null,
            description: data.artwork?.description ?? null,
            infrastructure_type:
              data.artwork?.infrastructure_type ??
              current.infrastructure_type,
            artist_name: data.artwork?.artist_name ?? null,
            instagram_handle:
              data.artwork?.instagram_handle ?? null,
          }
          : current,
      );

      setEditing(false);
    } catch (error) {
      setEditError(
        error instanceof Error
          ? error.message
          : "Could not update artwork.",
      );
    } finally {
      setSavingEdit(false);
    }
  }

  async function submitStatusReport(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!artwork || !canContribute) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData();

    formData.set("report_type", reportType);
    formData.set("date_observed", dateObserved);
    formData.set("note", reportNote);

    if (reportPhoto) {
      formData.set("supporting_photo", reportPhoto);
    }

    setSubmittingReport(true);
    setReportError("");
    setReportSuccess("");

    try {
      const response = await fetch(
        `/api/artworks/${artwork.id}/status-reports`,
        {
          method: "POST",
          body: formData,
        },
      );
      const data = (await response.json()) as {
        error?: string;
        report?: { moderation_state?: string };
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not submit status report.");
      }

      setReportSuccess(
        "Report submitted for review. The public artwork status has not changed.",
      );
      setReportType("");
      setDateObserved(TODAY);
      setReportNote("");
      setReportPhoto(null);
      form.reset();
    } catch (error) {
      setReportError(
        error instanceof Error
          ? error.message
          : "Could not submit status report.",
      );
    } finally {
      setSubmittingReport(false);
    }
  }

  useEffect(() => {
    async function loadArtwork() {
      try {
        const [response, statusResponse] = await Promise.all([
          fetch(`/api/artworks/${id}`),
          fetch(`/api/artworks/${id}/status-reports`),
        ]);

        if (!response.ok) {
          setArtwork(null);
          return;
        }

        const data = (await response.json()) as ArtworkDetailResponse;

        setArtwork(data.artwork);
        setPhotos(data.photos ?? []);
        setCurrentPhotoIndex(0);

        if (statusResponse.ok) {
          const statusData =
            (await statusResponse.json()) as ArtworkStatusHistoryResponse;

          setCurrentApprovedStatus(statusData.current_status);
          setStatusHistory(statusData.history ?? []);
          setStatusHistoryError("");
        } else {
          setCurrentApprovedStatus(null);
          setStatusHistory([]);
          setStatusHistoryError("Status history is temporarily unavailable.");
        }

        const checkinResponse = await fetch(
          `/api/artworks/${data.artwork.id}/checkin`,
        );

        if (checkinResponse.ok) {
          const checkinData = await checkinResponse.json();
          setCheckedIn(Boolean(checkinData.checked_in));
        }
      } finally {
        setLoading(false);
      }
    }

    loadArtwork();
  }, [id]);

  useEffect(() => {
    photos.forEach((photo) => {
      const image = new Image();
      image.src = `/api/images/${photo.storage_key}`;
    });
  }, [photos]);

  useEffect(() => {
    if (!artwork) {
      return;
    }

    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const distance = calculateDistanceMetres(
          position.coords.latitude,
          position.coords.longitude,
          artwork.latitude,
          artwork.longitude,
        );

        setDistanceMetres(Math.round(distance));
        setLocationError("");
      },
      () => {
        setLocationError("Location unavailable");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    );
  }, [artwork]);

  const isLocalhost = window.location.hostname === "localhost";

  const withinCheckinRadius =
    distanceMetres !== null && distanceMetres <= CHECKIN_RADIUS_METRES;

  const proximityStatus =
    distanceMetres === null
      ? "unknown"
      : withinCheckinRadius
        ? "near"
        : distanceMetres <= 500
          ? "close"
          : "far";

  const canCheckIn =
    canContribute &&
    !checkedIn &&
    !checkingIn &&
    (withinCheckinRadius || isLocalhost);
  const approvedStatusType = currentApprovedStatus?.type ?? artwork?.status ?? "present";

  async function handleCheckin() {
    if (!artwork || !canCheckIn) {
      return;
    }

    setCheckingIn(true);

    try {
      const response = await fetch(`/api/artworks/${artwork.id}/checkin`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`Check-in failed: ${response.status}`);
      }

      const data = await response.json();

      setCheckedIn(Boolean(data.checked_in));
    } catch (error) {
      console.error(error);
      alert("Couldn't check in. Try again.");
    } finally {
      setCheckingIn(false);
    }
  }

  async function handleResetCheckin() {
    if (!artwork) {
      return;
    }

    const response = await fetch(`/api/artworks/${artwork.id}/checkin`, {
      method: "DELETE",
    });

    if (response.ok) {
      setCheckedIn(false);
    }
  }

  if (loading) {
    return <div className="detail-shell">Loading artwork…</div>;
  }

  if (!artwork) {
    return (
      <div className="detail-shell">
        <header className="detail-header">
          <Link to="/" className="back-link">
            ← Back to map
          </Link>
        </header>

        <main className="detail-main">
          <h1>Artwork not found</h1>
        </main>
      </div>
    );
  }

  return (
    <div className="detail-shell">
      <header className="detail-header">
        <Link to="/" className="back-link">
          ← Back to map
        </Link>
      </header>

      <main className="detail-main">
        {uploadModeration === "review" && (
          <p className="status-report-success upload-moderation-notice" role="status">
            Your artwork details are saved. One or more images are private
            while a moderator reviews them.
          </p>
        )}
        {uploadModeration === "rejected" && (
          <p className="status-report-requirement upload-moderation-notice" role="status">
            Your artwork details are saved, but an image was not published
            because it did not pass the upload safety check.
          </p>
        )}

        <section className="detail-hero">
          <div className="detail-photo-wrap">
            {photos.length > 0 && (
              <div className="detail-gallery">
                <img
                  src={`/api/images/${photos[currentPhotoIndex].storage_key}`}
                  alt={getArtworkDisplayTitle(artwork)}
                  className="detail-photo"
                />

                {photos.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="gallery-button gallery-button-prev"
                      aria-label="Previous photo"
                      onClick={() =>
                        setCurrentPhotoIndex((current) =>
                          current === 0 ? photos.length - 1 : current - 1,
                        )

                      }
                    >
                      ‹
                    </button>

                    <button
                      type="button"
                      className="gallery-button gallery-button-next"
                      aria-label="Next photo"
                      onClick={() =>
                        setCurrentPhotoIndex((current) =>
                          current === photos.length - 1 ? 0 : current + 1,
                        )
                      }
                    >
                      ›
                    </button>

                    <div className="gallery-count">
                      {currentPhotoIndex + 1} / {photos.length}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="detail-info">
            <div className="current-artwork-status">
              <span>Current approved status</span>
              <strong>{formatStatusLabel(approvedStatusType)}</strong>
              {currentApprovedStatus?.source === "approved_report" && (
                <small>
                  Observed {formatArtworkDate(currentApprovedStatus.date_observed)}
                </small>
              )}
            </div>

            <h1>{getArtworkDisplayTitle(artwork)}</h1>

            <ArtistAttribution
              artistName={artwork.artist_name}
              instagramHandle={artwork.instagram_handle}
            />

            <p className="detail-meta">
              {formatInfrastructureType(artwork.infrastructure_type)}
              {artwork.city ? ` · ${artwork.city}` : ""}
            </p>
            {session?.user && !canContribute && (
              <EmailVerificationNotice email={session.user.email} compact />
            )}

            <AddToWalkButton artworkId={artwork.id} />

            {!editing && (canContribute || isAdmin) && (
              <div className="detail-management-actions">
                {canContribute && (
                  <button
                    type="button"
                    className="edit-details-button"
                    onClick={startEditing}
                  >
                    Edit details
                  </button>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    className="delete-artwork-button"
                    disabled={deletingArtwork}
                    onClick={() => void deleteArtwork()}
                  >
                    {deletingArtwork ? "Deleting…" : "Delete artwork"}
                  </button>
                )}
              </div>
            )}

            {deleteError && (
              <p className="form-error" role="alert">
                {deleteError}
              </p>
            )}

            {editing && (
              <form className="edit-details-form" onSubmit={saveEdits}>
                <div className="edit-details-heading">
                  <strong>Edit artwork details</strong>

                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setEditing(false);
                      setEditError("");
                    }}
                  >
                    Cancel
                  </button>
                </div>

                <label>
                  Title
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                    placeholder="Optional"
                    maxLength={200}
                  />
                </label>

                <ArtistAutocomplete
                  artistName={editArtistName}
                  instagramHandle={editInstagramHandle}
                  onArtistNameChange={setEditArtistName}
                  onInstagramHandleChange={setEditInstagramHandle}
                  namePlaceholder="Artist unknown"
                  handlePlaceholder="@artist"
                />

                <label>
                  Artwork setting
                  <select
                    required
                    value={editInfrastructureType}
                    onChange={(event) =>
                      setEditInfrastructureType(
                        event.target.value as InfrastructureType,
                      )
                    }
                  >
                    {INFRASTRUCTURE_TYPES.map((type) => (
                      <option value={type} key={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Description
                  <textarea
                    rows={4}
                    maxLength={2000}
                    value={editDescription}
                    onChange={(event) =>
                      setEditDescription(event.target.value)
                    }
                    placeholder="Optional details about the artwork"
                  />
                </label>

                {editError && (
                  <p className="form-error">{editError}</p>
                )}

                <button
                  type="submit"
                  className="checkin-button"
                  disabled={savingEdit}
                >
                  {savingEdit ? "Saving…" : "Save changes"}
                </button>
                <button type="button" className="text-button edit-cancel-button" disabled={savingEdit} onClick={() => { setEditing(false); setEditError(""); }}>
                  Cancel
                </button>
              </form>
            )}

            <div className="artwork-activity">
              <p>
                <strong>Photo added</strong>{" "}
                {artwork.photo_added_at
                  ? formatArtworkDate(artwork.photo_added_at)
                  : formatArtworkDate(artwork.created_at)}
              </p>

              {artwork.checkin_count > 0 ? (
                <>
                  <p>
                    <strong>
                      {artwork.checkin_count}{" "}
                      {artwork.checkin_count === 1
                        ? "person has"
                        : "people have"}{" "}
                      checked in here
                    </strong>
                  </p>

                  {artwork.last_checkin_at && (
                    <p>
                      Last check-in {formatArtworkDate(artwork.last_checkin_at)}
                    </p>
                  )}
                </>
              ) : (
                <p>
                  <strong>No check-ins yet</strong>
                </p>
              )}
            </div>

            {distanceMetres !== null && (
              <div
                className={`proximity proximity-${checkedIn ? "near" : proximityStatus
                  }`}
              >
                <strong>
                  📍{" "}
                  {distanceMetres < 1000
                    ? `${distanceMetres} metres away`
                    : `${(distanceMetres / 1000).toFixed(1)} km away`}
                </strong>

                {checkedIn ? (
                  <span>You’ve checked in at this artwork.</span>
                ) : withinCheckinRadius ? (
                  <span>
                    You’re within {CHECKIN_RADIUS_METRES} m — check in now.
                  </span>
                ) : distanceMetres <= 500 ? (
                  <span>
                    Get within {CHECKIN_RADIUS_METRES} m to unlock check-in.
                  </span>
                ) : (
                  <span>
                    Check-in unlocks when you’re within{" "}
                    {CHECKIN_RADIUS_METRES} m.
                  </span>
                )}
              </div>
            )}

            {locationError && (
              <div className="proximity proximity-far">
                <strong>📍 Location unavailable</strong>
                <span>{locationError}</span>
              </div>
            )}

            {artwork.description && (
              <p className="detail-description">{artwork.description}</p>
            )}

            <button
              className={`checkin-button detail-checkin-button ${checkedIn ? "is-checked-in" : ""
                }`}
              onClick={handleCheckin}
              disabled={!canCheckIn}
            >
              {checkingIn
                ? "Checking in…"
                : checkedIn
                  ? "✓ You checked in"
                  : !session?.user
                    ? "🔒 Sign in to check in"
                    : !canContribute
                      ? "Verify email to check in"
                      : withinCheckinRadius
                        ? "Check in here"
                        : isLocalhost
                          ? "Check in here (dev)"
                          : "🔒 Get closer to check in"}
            </button>

            {checkedIn && (
              <p className="checkin-note">
                This artwork is now in your finds.
              </p>
            )}

            {checkedIn && isLocalhost && (
              <button
                type="button"
                className="dev-reset-button"
                onClick={handleResetCheckin}
              >
                Reset check-in (dev)
              </button>
            )}
          </div>
        </section>

        <section className="status-report-section">
          <div className="status-history-panel">
            <span className="eyebrow">STATUS HISTORY</span>
            <h2>What’s happened here</h2>
            <p className="status-section-intro">
              Only reviewed and approved reports appear in this public history.
            </p>

            {statusHistoryError ? (
              <p className="status-history-empty">{statusHistoryError}</p>
            ) : statusHistory.length > 0 ? (
              <ol className="status-timeline">
                {statusHistory.map((event) => (
                  <li key={event.id}>
                    <div className="status-timeline-marker" aria-hidden="true" />
                    <div className="status-timeline-content">
                      <time dateTime={event.date_observed}>
                        {formatArtworkDate(event.date_observed)}
                      </time>
                      <h3>{formatStatusLabel(event.report_type)}</h3>

                      {event.note && <p>{event.note}</p>}

                      {event.photo_storage_key && (
                        <img
                          src={`/api/images/${event.photo_storage_key}`}
                          alt={`Supporting evidence for ${formatStatusLabel(event.report_type).toLowerCase()}`}
                          loading="lazy"
                          decoding="async"
                        />
                      )}

                      {event.replacement_artwork_id && (
                        <Link to={`/artwork/${event.replacement_artwork_id}`}>
                          View replacement artwork →
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="status-history-empty">
                No approved status changes have been reported yet.
              </p>
            )}
          </div>

          <div className="report-status-panel">
            <span className="eyebrow">KEEP IT CURRENT</span>
            <h2>Seen a change?</h2>
            <p className="status-section-intro">
              Submit what you observed. Reports stay pending until they’ve been
              reviewed and never change the public status immediately.
            </p>

            {!session?.user ? (
              <Link to="/login" className="report-signin-link">
                Sign in to report a change
              </Link>
            ) : !canContribute ? (
              <p className="status-report-requirement">
                Verify your email before submitting a status report.
              </p>
            ) : !reportingOpen ? (
              <button
                type="button"
                className="report-status-button"
                onClick={() => {
                  setReportingOpen(true);
                  setReportError("");
                  setReportSuccess("");
                }}
              >
                Report artwork status
              </button>
            ) : (
              <form className="status-report-form" onSubmit={submitStatusReport}>
                <label>
                  What did you observe?
                  <select
                    required
                    value={reportType}
                    onChange={(event) => setReportType(event.target.value)}
                  >
                    <option value="">Choose a status</option>
                    {STATUS_REPORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Date observed
                  <input
                    type="date"
                    required
                    max={TODAY}
                    value={dateObserved}
                    onChange={(event) => setDateObserved(event.target.value)}
                  />
                </label>

                <label>
                  Note <span>Optional</span>
                  <textarea
                    rows={4}
                    maxLength={1000}
                    value={reportNote}
                    onChange={(event) => setReportNote(event.target.value)}
                    placeholder="Add useful context for the reviewer"
                  />
                </label>

                <label>
                  Supporting photo <span>Optional · JPEG, PNG or WebP</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;

                      if (file && file.size > MAX_STATUS_PHOTO_SIZE_BYTES) {
                        setReportPhoto(null);
                        setReportError("Supporting photos must be smaller than 8 MB.");
                        event.target.value = "";
                        return;
                      }

                      setReportPhoto(file);
                      setReportError("");
                    }}
                  />
                </label>

                {reportPhoto && (
                  <p className="selected-report-photo">
                    Selected: {reportPhoto.name}
                  </p>
                )}

                {reportError && (
                  <p className="form-error" role="alert">
                    {reportError}
                  </p>
                )}

                {reportSuccess && (
                  <p className="status-report-success" role="status">
                    {reportSuccess}
                  </p>
                )}

                <div className="status-report-actions">
                  <button
                    type="submit"
                    className="report-status-button"
                    disabled={submittingReport}
                  >
                    {submittingReport ? "Submitting…" : "Submit for review"}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setReportingOpen(false);
                      setReportError("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {reportSuccess && !reportingOpen && (
              <p className="status-report-success" role="status">
                {reportSuccess}
              </p>
            )}
          </div>
        </section>

        <section className="detail-map-section">
          <div>
            <span className="eyebrow">LOCATION</span>
            <h2>Find it</h2>
          </div>

          <div className="detail-map">
            <ArtworkMap artworks={[artwork]} />
          </div>
        </section>
      </main>
    </div>
  );
}
