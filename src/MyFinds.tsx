import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import "./App.css";
import { authClient } from "./lib/auth-client";
import { getArtworkDisplayTitle } from "./artworkDisplay";
import ArtistAttribution from "./ArtistAttribution";

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
};

export default function MyFinds() {
  const [finds, setFinds] = useState<Find[]>([]);
  const [loading, setLoading] = useState(true);
  const { data: session } = authClient.useSession();

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
