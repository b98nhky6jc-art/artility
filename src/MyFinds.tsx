import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import "./App.css";
import { authClient } from "./lib/auth-client";
import { getArtworkDisplayTitle } from "./artworkDisplay";
import ArtistAttribution from "./ArtistAttribution";
import CommunitySafetyNotice from "./CommunitySafetyNotice";

type Find = {
  instagram_handle: string | null;
  id: number;
  title: string | null;
  description: string | null;
  city: string | null;
  infrastructure_type: string;
  status: string;
  artist_name: string | null;
  primary_photo: string | null;
  checked_in_at: string;
  artist_id: number | null;
};

type HomeArea = {
  town: string;
  city: string;
  latitude: number;
  longitude: number;
};

export default function MyFinds() {
  const [finds, setFinds] = useState<Find[]>([]);
  const [loading, setLoading] = useState(true);
  const [homeArea, setHomeArea] = useState<HomeArea | null>(null);
  const [homeTown, setHomeTown] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [homeCoordinates, setHomeCoordinates] = useState<
    Pick<HomeArea, "latitude" | "longitude"> | null
  >(null);
  const [homeAreaMessage, setHomeAreaMessage] = useState("");
  const [savingHomeArea, setSavingHomeArea] = useState(false);
  const { data: session } = authClient.useSession();
  const sessionUserId = session?.user?.id;

  useEffect(() => {
    async function loadFinds() {
      try {
        const response = await fetch("/api/my-finds");

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const data = (await response.json()) as Find[];
        setFinds(data);
      } finally {
        setLoading(false);
      }
    }

    loadFinds();
  }, []);

  useEffect(() => {
    if (!sessionUserId) return;

    async function loadHomeArea() {
      const response = await fetch("/api/profile/home-area");
      if (!response.ok) return;

      const savedHomeArea = (await response.json()) as HomeArea | null;
      if (!savedHomeArea) return;

      setHomeArea(savedHomeArea);
      setHomeTown(savedHomeArea.town);
      setHomeCity(savedHomeArea.city);
      setHomeCoordinates(savedHomeArea);
    }

    void loadHomeArea();
  }, [sessionUserId]);

  function chooseCurrentLocation() {
    setHomeAreaMessage("");

    if (!navigator.geolocation) {
      setHomeAreaMessage("Your browser cannot choose a map location.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setHomeCoordinates({
          latitude: Math.round(position.coords.latitude * 100) / 100,
          longitude: Math.round(position.coords.longitude * 100) / 100,
        });
        setHomeAreaMessage("Approximate map location chosen. Now save your home area.");
      },
      () => setHomeAreaMessage("We could not access your location. Check browser permissions and try again."),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  async function saveHomeArea(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHomeAreaMessage("");

    if (!homeCoordinates) {
      setHomeAreaMessage("Choose an approximate map location before saving.");
      return;
    }

    setSavingHomeArea(true);
    try {
      const response = await fetch("/api/profile/home-area", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          town: homeTown,
          city: homeCity,
          ...homeCoordinates,
        }),
      });
      const data = (await response.json()) as HomeArea | { error?: string };

      if (!response.ok || !("town" in data)) {
        throw new Error("error" in data ? data.error : "Could not save your home area.");
      }

      setHomeArea(data);
      setHomeAreaMessage("Home area saved. Explore will now start here.");
    } catch (error) {
      setHomeAreaMessage(error instanceof Error ? error.message : "Could not save your home area.");
    } finally {
      setSavingHomeArea(false);
    }
  }

  const cityCount = useMemo(() => {
    return new Set(
      finds
        .map((find) => find.city)
        .filter((city): city is string => Boolean(city)),
    ).size;
  }, [finds]);

  const latestFind = finds[0];

  return (
    <div className="detail-shell">
      <header className="detail-header">
        <Link to="/" className="back-link">
          ← Back to map
        </Link>

        <span className="detail-number">My collection</span>
      </header>

      <main className="detail-main">
        <section className="profile-summary">
          <div>
            <span className="eyebrow">PROFILE</span>
            <h1>My Finds</h1>
            <p>A growing collection of public art you've found in the wild.</p>
            {session?.user && (
              <div className="profile-user">
                <span>
                  Signed in as <strong>{session.user.name}</strong>
                </span>

                <Link to="/contact" className="profile-contact-link">
                  Contact
                </Link>
                <button
                  type="button"
                  className="signout-button"
                  onClick={async () => {
                    await authClient.signOut();
                    window.location.href = "/";
                  }}
                >
                  Sign out
                </button>
              </div>
            )}
            {session?.user && <CommunitySafetyNotice context="profile" />}
          </div>

          <div className="profile-stats">
            <div className="profile-stat">
              <strong>{finds.length}</strong>
              <span>Finds</span>
            </div>

            <div className="profile-stat">
              <strong>{cityCount}</strong>
              <span>Cities</span>
            </div>

            <div className="profile-stat">
              <strong>
                {latestFind
                  ? new Date(latestFind.checked_in_at).toLocaleDateString(
                    "en-GB",
                    {
                      day: "2-digit",
                      month: "short",
                    },
                  )
                  : "—"}
              </strong>
              <span>Latest find</span>
            </div>
          </div>
        </section>

        {session?.user && (
          <section className="home-area-section">
            <div>
              <span className="eyebrow">HOME AREA</span>
              <h2>Where should Explore start?</h2>
              <p>
                Save your town or city and an approximate map point. This is private and only sets your own starting view.
              </p>
            </div>

            <form className="home-area-form" onSubmit={saveHomeArea}>
              <label>
                Town
                <input value={homeTown} onChange={(event) => setHomeTown(event.target.value)} required />
              </label>
              <label>
                City
                <input value={homeCity} onChange={(event) => setHomeCity(event.target.value)} required />
              </label>
              <div className="home-area-actions">
                <button type="button" className="secondary-button" onClick={chooseCurrentLocation}>
                  {homeCoordinates ? "Update map point" : "Use my current location"}
                </button>
                <button type="submit" className="primary-button" disabled={savingHomeArea}>
                  {savingHomeArea ? "Saving…" : homeArea ? "Save changes" : "Save home area"}
                </button>
              </div>
              {homeAreaMessage && <p className="home-area-message">{homeAreaMessage}</p>}
            </form>
          </section>
        )}

        <section className="collection-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">COLLECTION</span>
              <h3>Checked in</h3>
            </div>
          </div>

          {loading && <p className="message">Loading finds…</p>}

          {!loading && finds.length === 0 && (
            <div className="empty-collection">
              <h2>No finds yet</h2>
              <p>Head back to the map and check into your first artwork.</p>

              <Link to="/" className="primary-link">
                Explore the map
              </Link>
            </div>
          )}

          <div className="artwork-grid">
            {finds.map((artwork) => (
              <article className="artwork-card" key={artwork.id}>
                <Link
                  to={`/artwork/${artwork.id}`}
                  className="artwork-card-link"
                >
                  <div className="artwork-image-placeholder">
                    {artwork.primary_photo && (
                      <img
                        src={`/api/images/${artwork.primary_photo}`}
                        alt={getArtworkDisplayTitle(artwork)}
                        className="artwork-photo"
                        loading="lazy"
                        decoding="async"
                      />
                    )}

                    <span className="artwork-number">#{artwork.id}</span>
                  </div>

                  <div className="artwork-content">
                    <div className="artwork-topline">
                      <span className={`status status-${artwork.status}`}>
                        ● {artwork.status}
                      </span>

                      <span className="distance">Found</span>
                    </div>

                    <h4>{getArtworkDisplayTitle(artwork)}</h4>

                    <p className="artist">
                      <ArtistAttribution
                        artistName={artwork.artist_name}
                        instagramHandle={artwork.instagram_handle}
                      />
                    </p>

                    <p className="metadata">
                      {artwork.infrastructure_type}
                      {artwork.city ? ` · ${artwork.city}` : ""}
                    </p>

                    <p className="find-date">
                      Checked in{" "}
                      {new Date(artwork.checked_in_at).toLocaleDateString(
                        "en-GB",
                        {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        },
                      )}
                    </p>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
