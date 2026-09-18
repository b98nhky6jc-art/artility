import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import "./App.css";
import {
  artworkBelongsToCategory,
  DISCOVERY_CATEGORIES,
  type DiscoveryCategory,
} from "./categories";
import { usePageMetadata } from "./pageMetadata";

type Artwork = {
  id: number;
  infrastructure_type: string | null;
  primary_photo: string | null;
};

function CategoryImage({ category, photo }: {
  category: DiscoveryCategory;
  photo: string | null;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  if (!photo || imageFailed) {
    return (
      <div className="artist-card-placeholder category-card-placeholder">
        <span aria-hidden="true">◇</span>
        <span>{category.name}</span>
      </div>
    );
  }

  return (
    <img
      src={`/api/images/${photo}`}
      alt=""
      className="artist-card-image"
      loading="lazy"
      decoding="async"
      onError={() => setImageFailed(true)}
    />
  );
}

export default function Categories() {
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  usePageMetadata(
    "Categories",
    "Explore public artwork by the places and objects it lives on.",
  );

  useEffect(() => {
    async function loadArtworks() {
      try {
        const response = await fetch("/api/artworks");

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        setArtworks((await response.json()) as Artwork[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load categories.");
      } finally {
        setLoading(false);
      }
    }

    loadArtworks();
  }, []);

  const categoryCards = useMemo(
    () => DISCOVERY_CATEGORIES.map((category) => {
      const matchingArtworks = artworks.filter((artwork) =>
        artworkBelongsToCategory(artwork.infrastructure_type, category),
      );

      return {
        ...category,
        artworkCount: matchingArtworks.length,
        primaryPhoto:
          matchingArtworks.find((artwork) => artwork.primary_photo)?.primary_photo ?? null,
      };
    }),
    [artworks],
  );

  return (
    <div className="detail-shell">
      <header className="detail-header">
        <Link to="/" className="back-link">← Back to map</Link>
      </header>

      <main className="detail-main page-main">
        <div className="artists-page">
          <section className="page-panel artists-hero">
            <div className="artists-hero-copy">
              <span className="eyebrow">DISCOVER</span>
              <h1>Categories</h1>
              <p>Explore artwork by the places and objects it lives on.</p>
            </div>
          </section>

          <section className="artist-directory-section" aria-labelledby="category-directory-heading">
            <div className="artist-directory-heading">
              <div>
                <span className="eyebrow">DIRECTORY</span>
                <h2 id="category-directory-heading">Browse categories</h2>
              </div>

              <span className="artist-result-count" aria-live="polite">
                {loading ? "Loading…" : `${categoryCards.length} categories`}
              </span>
            </div>

            {loading && <p className="message">Loading categories…</p>}
            {error && <p className="form-error">Couldn’t load category counts: {error}</p>}

            {!loading && (
              <div className="artist-directory category-directory">
                {categoryCards.map((category) => (
                  <Link
                    key={category.slug}
                    to={`/?category=${category.slug}#nearby`}
                    className="artist-card category-card"
                  >
                    <CategoryImage category={category} photo={category.primaryPhoto} />
                    <div className="artist-card-copy">
                      <h2>{category.name}</h2>
                      <span>
                        {category.artworkCount} {category.artworkCount === 1 ? "artwork" : "artworks"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
