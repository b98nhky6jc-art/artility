import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import "./App.css";
import {
  getDistanceInMetres,
  requestBrowserLocation,
  type UserLocation,
} from "./artworkDiscovery";

type Artist = {
  id: number | "unknown";
  name: string;
  instagram_handle: string | null;
  website_url: string | null;
  bio: string | null;
  created_at: string | null;
  artwork_count: number;
  primary_photo: string | null;
  artwork_locations: Array<{
    latitude: number;
    longitude: number;
  }>;
};

type ArtistSort =
  | "closest"
  | "furthest"
  | "newest"
  | "oldest"
  | "artist-az"
  | "artist-za";

function compareNames(a: Artist, b: Artist, direction: "asc" | "desc" = "asc") {
  const aUnknown = a.id === "unknown";
  const bUnknown = b.id === "unknown";

  if (aUnknown || bUnknown) {
    if (aUnknown && bUnknown) {
      return 0;
    }

    return aUnknown ? 1 : -1;
  }

  const difference = a.name.localeCompare(b.name, undefined, {
    sensitivity: "base",
  });

  return direction === "asc" ? difference : -difference;
}

function createdAtTimestamp(artist: Artist) {
  if (!artist.created_at) {
    return null;
  }

  const timestamp = Date.parse(artist.created_at);

  return Number.isFinite(timestamp) ? timestamp : null;
}

function nearestArtworkDistance(
  artist: Artist,
  userLocation: UserLocation,
) {
  if (artist.artwork_locations.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.min(
    ...artist.artwork_locations.map((location) =>
      getDistanceInMetres(userLocation, { id: 0, ...location }) ??
      Number.POSITIVE_INFINITY,
    ),
  );
}

export default function Artists() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ArtistSort>("newest");
  const [userLocation, setUserLocation] =
    useState<UserLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    "requesting" | "ready" | "unavailable"
  >("requesting");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sortWasChosen = useRef(false);

  useEffect(() => {
    async function loadArtists() {
      try {
        const response = await fetch("/api/artists");

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const data = (await response.json()) as Artist[];
        setArtists(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load artists.",
        );
      } finally {
        setLoading(false);
      }
    }

    loadArtists();
  }, []);

  useEffect(() => {
    let isCurrent = true;

    void requestBrowserLocation().then((location) => {
      if (!isCurrent) {
        return;
      }

      if (location) {
        setUserLocation(location);
        setLocationStatus("ready");
        if (!sortWasChosen.current) {
          setSort("closest");
        }
      } else {
        setLocationStatus("unavailable");
      }
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  const visibleArtists = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? artists.filter((artist) => {
          const name = artist.name.toLowerCase();
          const handle =
            artist.instagram_handle?.toLowerCase() ?? "";

          return name.includes(query) || handle.includes(query);
        })
      : [...artists];

    return filtered.sort((a, b) => {
      if (sort === "newest" || sort === "oldest") {
        const aTimestamp = createdAtTimestamp(a);
        const bTimestamp = createdAtTimestamp(b);

        if (aTimestamp === null) {
          return bTimestamp === null ? compareNames(a, b) : 1;
        }

        if (bTimestamp === null) {
          return -1;
        }

        const dateDifference =
          sort === "newest"
            ? bTimestamp - aTimestamp
            : aTimestamp - bTimestamp;

        return dateDifference || compareNames(a, b);
      }

      if ((sort === "closest" || sort === "furthest") && userLocation) {
        const aDistance = nearestArtworkDistance(a, userLocation);
        const bDistance = nearestArtworkDistance(b, userLocation);

        if (!Number.isFinite(aDistance) || !Number.isFinite(bDistance)) {
          if (!Number.isFinite(aDistance) && !Number.isFinite(bDistance)) {
            return compareNames(a, b);
          }

          return Number.isFinite(aDistance) ? -1 : 1;
        }

        const distanceDifference = aDistance - bDistance;

        return (
          (sort === "closest" ? distanceDifference : -distanceDifference) ||
          compareNames(a, b)
        );
      }

      return compareNames(a, b, sort === "artist-za" ? "desc" : "asc");
    });
  }, [artists, search, sort, userLocation]);

  function handleSortChange(
    event: React.ChangeEvent<HTMLSelectElement>,
  ) {
    const nextSort = event.target.value as ArtistSort;

    sortWasChosen.current = true;
    setSort(nextSort);
  }

  return (
    <div className="detail-shell">
      <header className="detail-header">
        <Link to="/" className="back-link">
          ← Back to map
        </Link>
      </header>

      <main className="detail-main page-main">
        <div className="artists-page">
          <section className="page-panel artists-hero">
            <div className="artists-hero-copy">
              <span className="eyebrow">DISCOVER</span>

              <h1>Artists</h1>

              <p>
                Explore artists whose work has been found on Artility.
              </p>
            </div>

            <div className="artist-controls">
              <input
                className="artist-search"
                type="search"
                aria-label="Search artists"
                placeholder="Search artists or Instagram…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />

              <select
                className="artist-sort"
                aria-label="Sort artists"
                value={sort}
                onChange={handleSortChange}
              >
                {userLocation && <option value="closest">Closest</option>}
                {userLocation && <option value="furthest">Furthest</option>}
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="artist-az">Artist A–Z</option>
                <option value="artist-za">Artist Z–A</option>
              </select>
            </div>

            {locationStatus === "requesting" && (
              <p className="artist-sort-status" aria-live="polite">
                Getting your location for distance sorting…
              </p>
            )}
          </section>

          <section
            className="artist-directory-section"
            aria-labelledby="artist-directory-heading"
          >
            <div className="artist-directory-heading">
              <div>
                <span className="eyebrow">DIRECTORY</span>
                <h2 id="artist-directory-heading">Browse artists</h2>
              </div>

              <span className="artist-result-count" aria-live="polite">
                {loading
                  ? "Loading…"
                  : `${visibleArtists.length} ${
                      visibleArtists.length === 1 ? "artist" : "artists"
                    }`}
              </span>
            </div>

            {loading && <p className="message">Loading artists…</p>}

            {error && <p className="form-error">{error}</p>}

            {!loading && !error && visibleArtists.length === 0 && (
              <p className="message">No artists found.</p>
            )}

            <div className="artist-directory">
              {visibleArtists.map((artist) => (
                <Link
                  key={artist.id}
                  to={`/artist/${artist.id}`}
                  className="artist-card"
                >
                  {artist.primary_photo ? (
                    <img
                      src={`/api/images/${artist.primary_photo}`}
                      alt=""
                      className="artist-card-image"
                    />
                  ) : (
                    <div className="artist-card-placeholder">
                      ARTIST
                    </div>
                  )}

                  <div className="artist-card-copy">
                    <h2>{artist.name}</h2>

                    {artist.instagram_handle && (
                      <p>@{artist.instagram_handle}</p>
                    )}

                    <span>
                      {artist.artwork_count}{" "}
                      {Number(artist.artwork_count) === 1
                        ? "artwork"
                        : "artworks"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
