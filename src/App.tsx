import { useEffect, useState } from "react";
import { Link } from "react-router";
import "./App.css";
import ArtworkMap from "./ArtworkMap";
import { authClient } from "./lib/auth-client";
import { getArtworkDisplayTitle } from "./artworkDisplay";
import ArtistAttribution from "./ArtistAttribution";


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
  artist_name: string | null;
  instagram_handle: string | null;
  primary_photo: string | null;
  photo_count: number;
  artist_id: number | null;
};

type HomeArea = {
  town: string;
  city: string;
  latitude: number;
  longitude: number;
};

function App() {
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [homeArea, setHomeArea] = useState<HomeArea | null>(null);
  const { data: session } = authClient.useSession();
  const sessionUserId = session?.user?.id;

  useEffect(() => {
    async function loadArtworks() {
      try {
        const response = await fetch("/api/artworks");

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const data = (await response.json()) as Artwork[];
        setArtworks(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    loadArtworks();
  }, []);

  useEffect(() => {
    if (!sessionUserId) return;

    async function loadHomeArea() {
      const response = await fetch("/api/profile/home-area");

      if (response.ok) {
        setHomeArea((await response.json()) as HomeArea | null);
      }
    }

    void loadHomeArea();
  }, [sessionUserId]);

  const homeLabel = homeArea?.town || homeArea?.city || "Leeds";

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand-lockup">
          <span className="eyebrow">ART HIDING IN PLAIN SIGHT</span>
          <div className="brand-row">
            <span className="brand-name">Artility</span>
            <span className="beta-badge">BETA</span>
          </div>
        </Link>

        <nav className="desktop-nav" aria-label="Primary navigation">
          <a href="#nearby" className="nav-link">
            Explore
          </a>

          <Link to="/artists" className="nav-link">
            Artists
          </Link>

          <Link to="/contact" className="nav-link">
            Contact
          </Link>
          <Link to="/add-artwork" className="nav-link">
            Add artwork
          </Link>

          {session?.user ? (
            <Link
              to="/my-finds"
              className="profile-button"
              aria-label="My finds"
            >
              {session.user.name
                ? session.user.name.charAt(0).toUpperCase()
                : "◎"}
            </Link>
          ) : (
            <Link
              to="/login"
              className="profile-button"
              aria-label="Sign in"
            >
              ◎
            </Link>
          )}
        </nav>
      </header>

      <main>
        <section className="hero" id="map">
          <div className="hero-copy">
            <span className="location-pill">📍 {homeLabel}</span>

            <h2>
              Find the art
              <br />
              around you.
            </h2>

            <p>
              Discover artists around you, head out for a walk, collect what you find, and
  add your own discoveries to help others explore too.
            </p>

            <div className="hero-actions">
              <Link to="/add-artwork" className="primary-button">
                ＋ Add artwork
              </Link>
            </div>
          </div>

          <div className="map-wrapper" id="home-map">
            <ArtworkMap
              artworks={artworks}
              homeArea={homeArea}
              preserveHomeCenter
            />
          </div>
        </section>

        <section className="nearby-section" id="nearby">
          <div className="section-heading nearby-heading">
            <span className="eyebrow">DISCOVER</span>
            <h3>Nearby artwork</h3>
          </div>

          {loading && <p className="message">Loading artwork…</p>}

          {error && (
            <p className="message error">Couldn’t load artwork: {error}</p>
          )}

          <div className="artwork-grid">
            {artworks.map((artwork) => (
              <article className="artwork-card" key={artwork.id}>
                <Link
                  to={`/artwork/${artwork.id}`}
                  className="artwork-card-link"
                >
                  <div className="artwork-image-placeholder">
                    <img
                      src={
                        artwork.primary_photo
                          ? `/api/images/${artwork.primary_photo}`
                          : "/artworks/duck-box-local-backup.jpg"

                      }
                      alt={getArtworkDisplayTitle(artwork)}
                      className="artwork-photo"
                      loading="lazy"
                      decoding="async"
                    />

                    <span className="artwork-number">#{artwork.id}</span>
                  </div>

                  <div className="artwork-content">
                    <div className="artwork-topline">
                      <span className={`status status-${artwork.status}`}>
                        ● {artwork.status}
                      </span>

                      <span className="distance">Artwork #{artwork.id}</span>
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

                    <p className="photo-count">{artwork.photo_count} of 5 photos</p>

                    {artwork.description && (
                      <p className="description">{artwork.description}</p>
                    )}

                    <span className="card-button">View artwork →</span>
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

export default App;
