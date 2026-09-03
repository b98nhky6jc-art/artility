import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import "./App.css";
import ArtworkMap from "./ArtworkMap";
import { authClient } from "./lib/auth-client";
import EmailVerificationNotice from "./EmailVerificationNotice";
import { canUserContribute } from "./emailVerification";
import {
  ARTWORK_PAGE_SIZE,
  formatArtworkProximity,
  sortArtworks,
  type ArtworkSort,
} from "./artworkDiscovery";
import AddToWalkButton from "./AddToWalkButton";
import { useArtilityLocation } from "./LocationContext";
import PlaceSearch from "./PlaceSearch";


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

function getDiscoveryArtworkTitle(artwork: Artwork) {
  return artwork.title?.trim() || "Untitled artwork";
}

function App() {
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [artworkSort, setArtworkSort] = useState<ArtworkSort>("newest");
  const [showPlaceSearch, setShowPlaceSearch] = useState(
    () => new URLSearchParams(window.location.search).get("placeSearch") === "1",
  );
  const [visibleArtworkCount, setVisibleArtworkCount] = useState(
    ARTWORK_PAGE_SIZE,
  );
  const sortWasChosen = useRef(false);
  const { data: session } = authClient.useSession();
  const canContribute = canUserContribute(session?.user);
  const {
    activeLocation,
    activeMode,
    approximateLocation,
    deviceLocation,
    manualPlace,
    permissionState,
    error: locationError,
    beginLocationFlow,
  } = useArtilityLocation();

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
    try {
      const legacyKeys = Array.from(
        { length: window.localStorage.length },
        (_, index) => window.localStorage.key(index),
      ).filter(
        (key): key is string => key?.startsWith("artility-home-area:") ?? false,
      );

      legacyKeys.forEach((key) => window.localStorage.removeItem(key));
      window.sessionStorage.removeItem("artility:location-requested");
      window.sessionStorage.removeItem("artility:location-cache");
    } catch {
      // Storage cleanup is optional when a browser blocks local storage access.
    }
  }, []);

  const effectiveArtworkSort =
    !activeLocation &&
    (artworkSort === "closest" || artworkSort === "furthest")
      ? "newest"
      : artworkSort;

  const { sortedArtworks, artworkDistances } = useMemo(
    () => sortArtworks(artworks, activeLocation, effectiveArtworkSort),
    [activeLocation, artworks, effectiveArtworkSort],
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

  function preferClosestLocationSort() {
    if (!sortWasChosen.current) {
      setArtworkSort("closest");
      setVisibleArtworkCount(ARTWORK_PAGE_SIZE);
    }
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
            <span className="location-pill">
              📍 {activeMode === "device"
                ? "Using your location"
                : activeMode === "approximate" && approximateLocation
                  ? `Near ${approximateLocation.name} (approximate)`
                : activeMode === "manual" && manualPlace
                  ? manualPlace.name
                  : permissionState === "denied"
                    ? "Location turned off"
                    : permissionState === "unavailable"
                      ? "Location unavailable"
                      : permissionState === "granted"
                        ? "Location available"
                        : "Explore anywhere"}
            </span>

            <h2 className="hero-title">
              <span>Find local art.</span>
              <span>Explore your neighbourhood.</span>
              <span>Take the long way home.</span>
            </h2>

            <p className="hero-intro">
              Discover artists around you, head out for a walk, collect what you find, and
              add your own discoveries to help others explore too.{" "}
              <a
                className="hero-community-link"
                href="https://chat.whatsapp.com/GA0tCNKFqsRKjSaNgodPVw"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Join the Artility WhatsApp community to help shape improvements (opens in a new tab)"
              >
                Help shape Artility in our WhatsApp community ↗
              </a>
            </p>

            <div className="hero-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={permissionState === "checking" || permissionState === "requesting"}
                onClick={() =>
                  beginLocationFlow({
                    feature: "explore",
                    onLocated: preferClosestLocationSort,
                    onSearchInstead: () => setShowPlaceSearch(true),
                  })
                }
              >
                {permissionState === "requesting"
                  ? "Finding you…"
                  : permissionState === "denied"
                    ? "How to enable location"
                    : permissionState === "unavailable"
                      ? "Location unavailable"
                      : activeMode === "device"
                        ? "Refresh my location"
                        : activeMode === "approximate"
                          ? "Try precise location"
                          : "Use my location"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowPlaceSearch((visible) => !visible)}
              >
                {showPlaceSearch ? "Close place search" : "Search for a place"}
              </button>
              <Link to="/add-artwork" className="primary-button">
                <span aria-hidden="true">+</span>
                <span>Add artwork</span>
              </Link>
            </div>

            {showPlaceSearch && (
              <PlaceSearch
                autoFocus
                onSelected={() => {
                  setShowPlaceSearch(true);
                  preferClosestLocationSort();
                }}
              />
            )}

            {locationError && activeMode !== "manual" && (
              <p className="location-inline-message" role="status">
                {locationError.message}
              </p>
            )}
          </div>

          <div className="map-wrapper" id="home-map">
            <ArtworkMap
              artworks={artworks}
              userLocation={activeMode === "device" ? deviceLocation : null}
              focusLocation={activeLocation}
              preserveUserLocation={Boolean(activeLocation)}
            />
          </div>
        </section>

        <section className="nearby-section" id="nearby">
          <div className="section-heading nearby-heading">
            <div>
              <span className="eyebrow">
                {activeMode === "device"
                  ? "EXPLORE AROUND YOU"
                  : activeMode === "approximate"
                    ? `EXPLORE NEAR ${approximateLocation?.name.toUpperCase() ?? "YOU"}`
                  : activeMode === "manual"
                    ? `EXPLORE ${manualPlace?.name.toUpperCase() ?? "A PLACE"}`
                    : "DISCOVER"}
              </span>
              <h3>Nearby artwork</h3>
            </div>

            <label className="discovery-sort-control">
              <span>Sort by</span>
              <select
                className="artist-sort"
                aria-label="Sort artwork"
                value={effectiveArtworkSort}
                onChange={handleArtworkSortChange}
              >
                {activeLocation && <option value="closest">Closest</option>}
                {activeLocation && <option value="furthest">Furthest</option>}
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
            {visibleArtworks.map((artwork) => {
              const proximity = formatArtworkProximity(
                artwork,
                artworkDistances.get(artwork.id),
              );

              return (
                <article className="artwork-card" key={artwork.id}>
                <Link
                  to={`/artwork/${artwork.id}`}
                  className="artwork-card-link"
                >
                  <div className="artwork-image-placeholder">
                    {artwork.primary_photo ? (
                      <img
                        src={`/api/images/${artwork.primary_photo}`}
                        alt={getDiscoveryArtworkTitle(artwork)}
                        className="artwork-photo"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="artwork-photo-unavailable">
                        Photo unavailable
                      </span>
                    )}

                  </div>

                  <div className="artwork-content">
                    <div className="artwork-topline">
                      <span className={`status status-${artwork.status}`}>
                        ● {artwork.status}
                      </span>

                      {proximity && <span className="distance">{proximity}</span>}
                    </div>

                    <h4>{getDiscoveryArtworkTitle(artwork)}</h4>

                    <p className="artist">
                      {artwork.artist_name ?? "Artist unknown"}
                    </p>

                    <span className="card-button">View artwork →</span>
                  </div>
                </Link>
                <AddToWalkButton artworkId={artwork.id} />
              </article>
              );
            })}
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
