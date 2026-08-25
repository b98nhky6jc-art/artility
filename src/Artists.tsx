import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import "./App.css";

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

type ArtistSort = "az" | "newest" | "oldest" | "nearest";

type UserLocation = {
  latitude: number;
  longitude: number;
};

function compareNames(a: Artist, b: Artist) {
  return a.name.localeCompare(b.name, undefined, {
    sensitivity: "base",
  });
}

function createdAtTimestamp(artist: Artist) {
  if (!artist.created_at) {
    return null;
  }

  const timestamp = Date.parse(artist.created_at);

  return Number.isFinite(timestamp) ? timestamp : null;
}

function distanceBetween(
  origin: UserLocation,
  destination: UserLocation,
) {
  const earthRadius = 6371000;
  const toRadians = (degrees: number) =>
    (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(
    destination.latitude - origin.latitude,
  );
  const longitudeDelta = toRadians(
    destination.longitude - origin.longitude,
  );
  const originLatitude = toRadians(origin.latitude);
  const destinationLatitude = toRadians(destination.latitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    earthRadius *
    2 *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  );
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
      distanceBetween(userLocation, location),
    ),
  );
}

export default function Artists() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ArtistSort>("az");
  const [userLocation, setUserLocation] =
    useState<UserLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "requesting" | "ready" | "unavailable"
  >("idle");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

      if (sort === "nearest" && userLocation) {
        const distanceDifference =
          nearestArtworkDistance(a, userLocation) -
          nearestArtworkDistance(b, userLocation);

        return distanceDifference || compareNames(a, b);
      }

      return compareNames(a, b);
    });
  }, [artists, search, sort, userLocation]);

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("unavailable");
      return;
    }

    setLocationStatus("requesting");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationStatus("ready");
      },
      () => setLocationStatus("unavailable"),
      {
        enableHighAccuracy: false,
        maximumAge: 300000,
        timeout: 10000,
      },
    );
  }

  function handleSortChange(
    event: React.ChangeEvent<HTMLSelectElement>,
  ) {
    const nextSort = event.target.value as ArtistSort;

    setSort(nextSort);

    if (
      nextSort === "nearest" &&
      !userLocation &&
      locationStatus !== "requesting"
    ) {
      requestLocation();
    }
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
                <option value="az">A–Z</option>
                <option value="newest">Most recently added</option>
                <option value="oldest">Oldest added</option>
                <option value="nearest">Closest to me</option>
              </select>
            </div>

            {sort === "nearest" && (
              <p className="artist-sort-status" aria-live="polite">
                {locationStatus === "requesting" &&
                  "Getting your location…"}
                {locationStatus === "ready" &&
                  "Showing artists with nearby work first."}
                {locationStatus === "unavailable" && (
                  <>
                    Location is unavailable. Check your browser permission or{" "}
                    <button type="button" onClick={requestLocation}>
                      try again
                    </button>
                    .
                  </>
                )}
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
