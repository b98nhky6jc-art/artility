type ArtistAttributionProps = {
  artistName?: string | null;
  instagramHandle?: string | null;
};

export default function ArtistAttribution({
  artistName,
  instagramHandle,
}: ArtistAttributionProps) {
  const cleanHandle = instagramHandle?.trim().replace(/^@/, "");
  const cleanName = artistName?.trim();

  if (!cleanName && !cleanHandle) {
    return <span className="artist-attribution">Artist unknown</span>;
  }

  return (
    <span className="artist-attribution">
      {cleanName && <span>{cleanName}</span>}

      {cleanHandle && (
        <a
          className="instagram-attribution"
          href={`https://www.instagram.com/${cleanHandle}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open @${cleanHandle} on Instagram`}
          onClick={(event) => event.stopPropagation()}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="instagram-icon"
          >
            <rect
              x="3"
              y="3"
              width="18"
              height="18"
              rx="5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle
              cx="12"
              cy="12"
              r="4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle cx="17.4" cy="6.7" r="1.2" fill="currentColor" />
          </svg>

          <span>@{cleanHandle}</span>
        </a>
      )}
    </span>
  );
}