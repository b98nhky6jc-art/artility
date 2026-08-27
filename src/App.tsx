import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import "./App.css";
import ArtworkMap from "./ArtworkMap";
import { authClient } from "./lib/auth-client";
import { getArtworkDisplayTitle } from "./artworkDisplay";
import ArtistAttribution from "./ArtistAttribution";
import EmailVerificationNotice from "./EmailVerificationNotice";
import { canUserContribute } from "./emailVerification";
import {
  ARTWORK_PAGE_SIZE,
  formatDistance,
  requestBrowserLocation,
  sortArtworks,
  type ArtworkSort,
  type UserLocation,
} from "./artworkDiscovery";
import { formatInfrastructureType } from "../shared/infrastructure-types";
import AddToWalkButton from "./AddToWalkButton";
import { homeAreaKey, type HomeArea } from "./HomeAreaSettings";


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
  artist_id: number | null;
  created_at: string | null;
};

function App() {
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [artworkSort, setArtworkSort] = useState<ArtworkSort>("newest");
  const [visibleArtworkCount, setVisibleArtworkCount] = useState(
    ARTWORK_PAGE_SIZE,
  );
  const sortWasChosen = useRef(false);
  const { data: session } = authClient.useSession();
  const [homeArea, setHomeArea] = useState<HomeArea | null>(null);
  const canContribute = canUserContribute(session?.user);

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
  useEffect(() => { if (session?.user.id) { const saved = localStorage.getItem(homeAreaKey(session.user.id)); if (saved) setHomeArea(JSON.parse(saved) as HomeArea); } }, [session?.user.id]);

  useEffect(() => {
    let isCurrent = true;

    void requestBrowserLocation().then((location) => {
      if (isCurrent && location) {
        setUserLocation(location);
        if (!sortWasChosen.current) {
          setArtworkSort("closest");
          setVisibleArtworkCount(ARTWORK_PAGE_SIZE);
        }
      }
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  const { sortedArtworks, artworkDistances } = useMemo(
    () => sortArtworks(artworks, userLocation, artworkSort),
    [artworks, artworkSort, userLocation],
  );

  const visibleArtworks = sortedArtworks.slice(0, visibleArtworkCount);
  const hasMoreArtworks = visibleArtworkCount < sortedArtworks.length;

  function handleArtworkSortChange(
    event: React.ChangeEvent<HTMLSelectElement>,
  ) {
    sortWasChosen.current = true;
    setArtworkSort(event.target.value as ArtworkSort);
    setVisibleArtworkCount(ARTWORK_PAGE_SIZE);
  }

  return (
    <div className="app">
      {session?.user && !canContribute && (
        <div className="page-verification-banner">
          <EmailVerificationNotice email={session.user.email} compact />
        </div>
      )}

      <main className="page-main home-main">
        <section className="page-panel hero" id="map">
          <div className="hero-copy">
            <span className="location-pill">📍 {homeArea?.town || homeArea?.city || "Leeds"}</span>

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
                <span aria-hidden="true">+</span>
                <span>Add artwork</span>
              </Link>
            </div>
          </div>

          <div className="map-wrapper" id="home-map">
            <ArtworkMap artworks={artworks} homeArea={homeArea} preserveHomeCenter />
          </div>
        </section>

        <section className="nearby-section" id="nearby">
          <div className="section-heading nearby-heading">
            <div>
              <span className="eyebrow">
                {userLocation ? "EXPLORE AROUND YOU" : "DISCOVER"}
              </span>
              <h3>Nearby artwork</h3>
            </div>

            <label className="discovery-sort-control">
              <span>Sort by</span>
              <select
                className="artist-sort"
                aria-label="Sort artwork"
                value={artworkSort}
                onChange={handleArtworkSortChange}
              >
                {userLocation && <option value="closest">Closest</option>}
                {userLocation && <option value="furthest">Furthest</option>}
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="artist-az">Artist A–Z</option>
                <option value="artist-za">Artist Z–A</option>
              </select>
            </label>
          </div>

          {loading && <p className="message">Loading artwork…</p>}

          {error && (
            <p className="message error">Couldn’t load artwork: {error}</p>
          )}

          <div className="artwork-grid">
            {visibleArtworks.map((artwork) => (
              <article className="artwork-card" key={artwork.id}>
                <Link
                  to={`/artwork/${artwork.id}`}
                  className="artwork-card-link"
                >
                  <div className="artwork-image-placeholder">
                    {artwork.primary_photo ? (
                      <img
                        src={`/api/images/${artwork.primary_photo}`}
                        alt={getArtworkDisplayTitle(artwork)}
                        className="artwork-photo"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="artwork-photo-unavailable">
                        Photo unavailable
                      </span>
                    )}

                    <span className="artwork-number">#{artwork.id}</span>
                  </div>

                  <div className="artwork-content">
                    <div className="artwork-topline">
                      <span className={`status status-${artwork.status}`}>
                        ● {artwork.status}
                      </span>

                      {artworkDistances.has(artwork.id) && (
                        <span className="distance">
                          {formatDistance(artworkDistances.get(artwork.id)!)}
                        </span>
                      )}
                    </div>

                    <h4>{getArtworkDisplayTitle(artwork)}</h4>

                    <p className="artist">
                      <ArtistAttribution
  artistName={artwork.artist_name}
  instagramHandle={artwork.instagram_handle}
/>
                    </p>

                    <p className="metadata">
                      {formatInfrastructureType(artwork.infrastructure_type)}
                      {artwork.city ? ` · ${artwork.city}` : ""}
                    </p>

                    {artwork.description && (
                      <p className="description">{artwork.description}</p>
                    )}

                    <span className="card-button">View artwork →</span>
                  </div>
                </Link>
                <AddToWalkButton artworkId={artwork.id} />
              </article>
            ))}
          </div>

          {sortedArtworks.length > 0 && (
            <div className="load-more-row">
              <span className="load-more-progress">
                Showing {Math.min(visibleArtworkCount, sortedArtworks.length)} of{" "}
                {sortedArtworks.length}
              </span>

              {hasMoreArtworks && (
                <button
                  type="button"
                  className="load-more-button"
                  onClick={() =>
                    setVisibleArtworkCount((count) =>
                      Math.min(count + ARTWORK_PAGE_SIZE, sortedArtworks.length),
                    )
                  }
                >
                  Load more
                </button>
              )}
            </div>
          )}
        </section>
      </main>


    </div>
  );
}

export default App;
