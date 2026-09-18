import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import "./App.css";
import { slugifyDiscoveryValue } from "../shared/artwork-tags";
import { usePageMetadata } from "./pageMetadata";

type Artwork = {
  id: number;
  town: string | null;
  city: string | null;
  primary_photo: string | null;
  tags: string[];
};

type DirectoryEntry = {
  name: string;
  slug: string;
  count: number;
  photo: string | null;
};

function DirectoryImage({ entry, label }: { entry: DirectoryEntry; label: string }) {
  const [failed, setFailed] = useState(false);

  if (!entry.photo || failed) {
    return (
      <div className="artist-card-placeholder category-card-placeholder">
        <span aria-hidden="true">◇</span>
        <span>{entry.name}</span>
      </div>
    );
  }

  return (
    <img
      src={`/api/images/${entry.photo}`}
      alt=""
      className="artist-card-image"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      aria-label={`Representative artwork for ${label} ${entry.name}`}
    />
  );
}

export default function DiscoveryDirectory({ type }: { type: "places" | "tags" }) {
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isPlaces = type === "places";
  const title = isPlaces ? "Places" : "Tags";
  const singular = isPlaces ? "place" : "tag";

  usePageMetadata(
    title,
    isPlaces
      ? "Browse public artwork by town and city on Artility."
      : "Browse public artwork using tags added by Artility contributors.",
  );

  useEffect(() => {
    fetch("/api/artworks")
      .then((response) => {
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        return response.json() as Promise<Artwork[]>;
      })
      .then(setArtworks)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load directory."))
      .finally(() => setLoading(false));
  }, []);

  const entries = useMemo<DirectoryEntry[]>(() => {
    const names = isPlaces
      ? [...new Set(artworks.flatMap((artwork) => [artwork.town, artwork.city]).filter((value): value is string => Boolean(value?.trim())))]
      : [...new Map(
        artworks
          .flatMap((artwork) => artwork.tags ?? [])
          .map((tag) => [slugifyDiscoveryValue(tag), tag] as const),
      ).values()];

    return names
      .map((name) => {
        const matches = artworks.filter((artwork) =>
          isPlaces
            ? [artwork.town, artwork.city].some((place) => place?.localeCompare(name, undefined, { sensitivity: "base" }) === 0)
            : artwork.tags?.some(
              (tag) => slugifyDiscoveryValue(tag) === slugifyDiscoveryValue(name),
            ),
        );

        return {
          name,
          slug: slugifyDiscoveryValue(name),
          count: matches.length,
          photo: matches.find((artwork) => artwork.primary_photo)?.primary_photo ?? null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [artworks, isPlaces]);

  return (
    <div className="detail-shell">
      <header className="detail-header"><Link to="/" className="back-link">← Back to map</Link></header>
      <main className="detail-main page-main">
        <div className="artists-page">
          <section className="page-panel artists-hero">
            <div className="artists-hero-copy">
              <span className="eyebrow">DISCOVER</span>
              <h1>{title}</h1>
              <p>{isPlaces ? "Explore artwork found across towns and cities." : "Explore artwork by its themes and visual character."}</p>
            </div>
          </section>
          <section className="artist-directory-section" aria-labelledby="discovery-directory-heading">
            <div className="artist-directory-heading">
              <div><span className="eyebrow">DIRECTORY</span><h2 id="discovery-directory-heading">Browse {type}</h2></div>
              <span className="artist-result-count">{loading ? "Loading…" : `${entries.length} ${type}`}</span>
            </div>
            {loading && <p className="message">Loading {type}…</p>}
            {error && <p className="form-error">Couldn’t load {type}: {error}</p>}
            {!loading && !error && entries.length === 0 && <p className="message">No {type} are available yet.</p>}
            {!loading && (
              <div className="artist-directory category-directory">
                {entries.map((entry) => (
                  <Link key={entry.slug} to={`/${type}/${entry.slug}`} className="artist-card category-card">
                    <DirectoryImage entry={entry} label={singular} />
                    <div className="artist-card-copy">
                      <h2>{entry.name}</h2>
                      <span>{entry.count} {entry.count === 1 ? "artwork" : "artworks"}</span>
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
