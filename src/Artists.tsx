import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import "./App.css";

type Artist = {
  id: number;
  name: string;
  instagram_handle: string | null;
  website_url: string | null;
  bio: string | null;
  artwork_count: number;
  primary_photo: string | null;
};

export default function Artists() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [search, setSearch] = useState("");
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

  const filteredArtists = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return artists;
    }

    return artists.filter((artist) => {
      const name = artist.name.toLowerCase();
      const handle =
        artist.instagram_handle?.toLowerCase() ?? "";

      return name.includes(query) || handle.includes(query);
    });
  }, [artists, search]);

  return (
    <div className="detail-shell">
      <header className="detail-header">
        <Link to="/" className="back-link">
          ← Back to map
        </Link>

        <span className="detail-number">Artists</span>
      </header>

      <main className="detail-main">
        <section className="artists-header">
          <span className="eyebrow">DISCOVER</span>

          <h1>Artists</h1>

          <p>
            Explore artists whose work has been found on Artility.
          </p>

          <input
            className="artist-search"
            type="search"
            placeholder="Search artists or Instagram…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </section>

        {loading && <p>Loading artists…</p>}

        {error && <p className="form-error">{error}</p>}

        {!loading && !error && filteredArtists.length === 0 && (
          <p>No artists found.</p>
        )}

        <div className="artist-directory">
          {filteredArtists.map((artist) => (
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
      </main>
    </div>
  );
}
