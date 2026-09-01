import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import "./App.css";
import { getArtworkDisplayTitle } from "./artworkDisplay";
import { formatInfrastructureType } from "../shared/infrastructure-types";
import AddToWalkButton from "./AddToWalkButton";

type Artist = {
  id: number;
  name: string;
  instagram_handle: string | null;
  website_url: string | null;
  bio: string | null;
  created_at: string;
};

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
  primary_photo: string | null;
};

type ArtistResponse = {
  artist: Artist;
  artworks: Artwork[];
};

export default function ArtistDetail() {
  const { id } = useParams();

  const [data, setData] = useState<ArtistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadArtist() {
      try {
        const response = await fetch(`/api/artists/${id}`);

        if (!response.ok) {
          throw new Error(
            response.status === 404
              ? "Artist not found."
              : `API returned ${response.status}`,
          );
        }

        const result =
          (await response.json()) as ArtistResponse;

        setData(result);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load artist.",
        );
      } finally {
        setLoading(false);
      }
    }

    loadArtist();
  }, [id]);

  if (loading) {
    return (
      <div className="detail-shell">
        <main className="detail-main">
          <p>Loading artist…</p>
        </main>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="detail-shell">
        <header className="detail-header">
          <Link to="/artists" className="back-link">
            ← Artists
          </Link>
        </header>

        <main className="detail-main">
          <p className="form-error">
            {error || "Artist not found."}
          </p>
        </main>
      </div>
    );
  }

  const { artist, artworks } = data;

  return (
    <div className="detail-shell">
      <header className="detail-header">
        <Link to="/artists" className="back-link">
          ← Artists
        </Link>
      </header>

      <main className="detail-main">
        <section className="artist-profile">
          <span className="eyebrow">ARTIST</span>

          <h1>{artist.name}</h1>

          {artist.instagram_handle && (
            <a
              href={`https://www.instagram.com/${artist.instagram_handle.replace(
                /^@/,
                "",
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="artist-profile-link"
            >
              @{artist.instagram_handle.replace(/^@/, "")}
            </a>
          )}

          {artist.bio && (
            <p className="artist-profile-bio">
              {artist.bio}
            </p>
          )}

          {artist.website_url && (
            <a
              href={artist.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="artist-profile-link"
            >
              Visit website ↗
            </a>
          )}
        </section>

        <section className="artist-artworks">
          <span className="eyebrow">FOUND WORK</span>

          <div className="artist-artwork-grid">
            {artworks.map((artwork) => (
              <article className="artist-artwork-card-wrap" key={artwork.id}>
                <Link
                  to={`/artwork/${artwork.id}`}
                  className="artist-artwork-card"
                >
                  {artwork.primary_photo ? (
                    <img
                      src={`/api/images/${artwork.primary_photo}`}
                      alt=""
                    />
                  ) : (
                    <div className="artist-card-placeholder">
                      ARTWORK
                    </div>
                  )}

                  <div className="artist-artwork-copy">
                    <h2>{getArtworkDisplayTitle(artwork)}</h2>

                    <p>
                      {artwork.town ||
                        artwork.city ||
                        formatInfrastructureType(artwork.infrastructure_type)}
                    </p>
                  </div>
                </Link>
                <AddToWalkButton artworkId={artwork.id} />
              </article>
            ))}
          </div>

          {artworks.length === 0 && (
            <p>No attributed artwork yet.</p>
          )}
        </section>
      </main>
    </div>
  );
}
