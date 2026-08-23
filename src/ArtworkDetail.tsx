import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import ArtworkMap from "./ArtworkMap";
import "./App.css";
import { getArtworkDisplayTitle } from "./artworkDisplay";
import ArtistAttribution from "./ArtistAttribution";
import { authClient } from "./lib/auth-client";


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

const CHECKIN_RADIUS_METRES = 100;

function formatArtworkDate(value: string) {
  const dateValue = value.includes("T") ? value : value.replace(" ", "T") + "Z";

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

  const { id } = useParams();

  const [artwork, setArtwork] = useState<Artwork | null>(null);

  const [loading, setLoading] = useState(true);

  const [checkedIn, setCheckedIn] = useState(false);

  const [checkingIn, setCheckingIn] = useState(false);

  const [distanceMetres, setDistanceMetres] = useState<number | null>(null);

  const [locationError, setLocationError] = useState("");
  const { data: session } = authClient.useSession();

  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  const [editTitle, setEditTitle] = useState("");
  const [editArtistName, setEditArtistName] = useState("");
  const [editInstagramHandle, setEditInstagramHandle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editInfrastructureType, setEditInfrastructureType] =
    useState("");

  function startEditing() {
    if (!artwork) {
      return;
    }

    setEditTitle(artwork.title ?? "");
    setEditArtistName(artwork.artist_name ?? "");
    setEditInstagramHandle(artwork.instagram_handle ?? "");
    setEditDescription(artwork.description ?? "");
    setEditInfrastructureType(artwork.infrastructure_type ?? "");

    setEditError("");
    setEditing(true);
  }

  async function saveEdits(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!artwork) {
      return;
    }

    if (!editInfrastructureType.trim()) {
      setEditError("Infrastructure type is required.");
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

  useEffect(() => {
    async function loadArtwork() {
      try {
        const response = await fetch("/api/artworks");

        const artworks = (await response.json()) as Artwork[];

        const found = artworks.find((item) => item.id === Number(id));

        setArtwork(found ?? null);

        if (found) {
          const checkinResponse = await fetch(
            `/api/artworks/${found.id}/checkin`,
          );

          if (checkinResponse.ok) {
            const checkinData = await checkinResponse.json();

            setCheckedIn(Boolean(checkinData.checked_in));
          }
        }
      } finally {
        setLoading(false);
      }
    }

    loadArtwork();
  }, [id]);

  useEffect(() => {
    if (!artwork) {
      return;
    }

    if (!navigator.geolocation) {
      setLocationError("Location is not supported by this browser.");
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
    !checkedIn && !checkingIn && (withinCheckinRadius || isLocalhost);

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

        <span className="detail-number">Artwork #{artwork.id}</span>
      </header>

      <main className="detail-main">
        <section className="detail-hero">
          <div className="detail-photo-wrap">
            {artwork.primary_photo && (
              <img
                src={`/api/images/${artwork.primary_photo}`}
                alt={getArtworkDisplayTitle(artwork)}
                className="detail-photo"
              />
            )}
          </div>

          <div className="detail-info">
            <span className={`status status-${artwork.status}`}>
              ● {artwork.status}
            </span>

            <h1>{artwork.title?.trim() || "Utility cabinet"}</h1>

            <ArtistAttribution
              artistName={artwork.artist_name}
              instagramHandle={artwork.instagram_handle}
            />

            <p className="detail-meta">
              {artwork.infrastructure_type}
              {artwork.city ? ` · ${artwork.city}` : ""}
            </p>
            {session?.user && !editing && (
              <button
                type="button"
                className="edit-details-button"
                onClick={startEditing}
              >
                Edit details
              </button>
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

                <label>
                  Artist name
                  <input
                    type="text"
                    value={editArtistName}
                    onChange={(event) => setEditArtistName(event.target.value)}
                    placeholder="Unknown artist"
                  />
                </label>

                <label>
                  Instagram
                  <input
                    type="text"
                    value={editInstagramHandle}
                    onChange={(event) =>
                      setEditInstagramHandle(event.target.value)
                    }
                    placeholder="@artist"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </label>

                <label>
                  Infrastructure type
                  <input
                    type="text"
                    required
                    value={editInfrastructureType}
                    onChange={(event) =>
                      setEditInfrastructureType(event.target.value)
                    }
                  />
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
