import { useEffect, useState } from "react";

export type ArtistSuggestion = {
  id: number;
  name: string;
  instagram_handle: string | null;
};

type ArtistAutocompleteProps = {
  artistName: string;
  instagramHandle: string;
  onArtistNameChange: (value: string) => void;
  onInstagramHandleChange: (value: string) => void;
  namePlaceholder?: string;
  handlePlaceholder?: string;
};

export default function ArtistAutocomplete({
  artistName,
  instagramHandle,
  onArtistNameChange,
  onInstagramHandleChange,
  namePlaceholder = "Optional",
  handlePlaceholder = "Optional — without @",
}: ArtistAutocompleteProps) {
  const [activeField, setActiveField] = useState<"name" | "instagram" | null>(
    null,
  );
  const [suggestions, setSuggestions] = useState<ArtistSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = activeField === "name" ? artistName : instagramHandle;

    if (!activeField || query.trim().replace(/^@+/, "").length < 2) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);

      try {
        const params = new URLSearchParams({
          [activeField]: query,
        });
        const response = await fetch(
          `/api/artists/suggestions?${params.toString()}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error(`Artist suggestions returned ${response.status}`);
        }

        const data = (await response.json()) as {
          items?: ArtistSuggestion[];
        };
        setSuggestions(data.items ?? []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Could not load artist suggestions", error);
          setSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [activeField, artistName, instagramHandle]);

  function selectArtist(artist: ArtistSuggestion) {
    onArtistNameChange(artist.name);
    onInstagramHandleChange(artist.instagram_handle ?? "");
    setSuggestions([]);
    setActiveField(null);
  }

  const activeQuery = activeField === "name" ? artistName : instagramHandle;
  const queryIsEligible =
    activeField !== null &&
    activeQuery.trim().replace(/^@+/, "").length >= 2;
  const listVisible = queryIsEligible && (loading || suggestions.length > 0);

  return (
    <div className="artist-autocomplete">
      <label>
        Artist name
        <input
          type="text"
          value={artistName}
          onFocus={() => setActiveField("name")}
          onBlur={() => window.setTimeout(() => setActiveField(null), 150)}
          onChange={(event) => {
            const value = event.target.value;
            onArtistNameChange(value);
            setActiveField("name");
            if (value.trim().length < 2) {
              setSuggestions([]);
              setLoading(false);
            }
          }}
          placeholder={namePlaceholder}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={activeField === "name" && listVisible}
          aria-controls="artist-suggestions"
        />
      </label>

      <label>
        Instagram handle
        <input
          type="text"
          value={instagramHandle}
          onFocus={() => setActiveField("instagram")}
          onBlur={() => window.setTimeout(() => setActiveField(null), 150)}
          onChange={(event) => {
            const value = event.target.value.replace(/^@+/, "");
            onInstagramHandleChange(value);
            setActiveField("instagram");
            if (value.trim().length < 2) {
              setSuggestions([]);
              setLoading(false);
            }
          }}
          placeholder={handlePlaceholder}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={activeField === "instagram" && listVisible}
          aria-controls="artist-suggestions"
        />
      </label>

      {listVisible && (
        <div className="artist-suggestion-popover">
          {loading && suggestions.length === 0 ? (
            <span className="artist-suggestion-status">Finding artists…</span>
          ) : (
            <ul id="artist-suggestions" role="listbox">
              {suggestions.map((artist) => (
                <li key={artist.id} role="option" aria-selected="false">
                  <button type="button" onClick={() => selectArtist(artist)}>
                    <strong>{artist.name}</strong>
                    <span>
                      {artist.instagram_handle
                        ? `@${artist.instagram_handle}`
                        : "No Instagram handle"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
