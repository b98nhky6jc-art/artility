import { useRef, useState } from "react";
import { useArtilityLocation, type ManualPlace } from "./LocationContext";

type PlaceResult = ManualPlace & {
  id: string;
};

type Props = {
  autoFocus?: boolean;
  onSelected?: () => void;
};

export default function PlaceSearch({ autoFocus = false, onSelected }: Props) {
  const { manualPlace, selectManualPlace, clearManualPlace } =
    useArtilityLocation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const activeRequest = useRef<AbortController | null>(null);

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanQuery = query.trim();

    if (cleanQuery.length < 2) {
      setError("Enter at least two characters.");
      return;
    }

    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/places/search?q=${encodeURIComponent(cleanQuery)}`,
        { signal: controller.signal },
      );

      if (!response.ok) {
        throw new Error("Search unavailable");
      }

      const data = (await response.json()) as { places: PlaceResult[] };
      setResults(data.places);
      if (data.places.length === 0) {
        setError("No matching places found. Try a broader search.");
      }
    } catch (searchError) {
      if (!(searchError instanceof DOMException && searchError.name === "AbortError")) {
        setError("We couldn’t search for that place. Try again in a moment.");
        setResults([]);
      }
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }

  function choosePlace(place: PlaceResult) {
    selectManualPlace({
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
    });
    setQuery("");
    setResults([]);
    onSelected?.();
  }

  return (
    <div className="place-search">
      <label htmlFor="place-search-input">Search by town, city, postcode or place</label>
      <form className="place-search-row" onSubmit={(event) => void search(event)}>
        <input
          id="place-search-input"
          type="search"
          autoComplete="postal-code"
          autoFocus={autoFocus}
          placeholder="e.g. Leeds or LS1"
          value={query}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            if (nextQuery.trim().length < 2) {
              setResults([]);
              setError("");
            }
          }}
        />
        <button type="submit" className="primary-button" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
        {manualPlace && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              clearManualPlace();
              setQuery("");
              setResults([]);
            }}
          >
            Clear
          </button>
        )}
      </form>

      {manualPlace && !query && (
        <div className="place-search-selected">
          <span aria-hidden="true">⌖</span>
          <strong>{manualPlace.name}</strong>
          <small>Map centre only</small>
        </div>
      )}

      {(loading || error || results.length > 0) && (
        <div className="place-search-results" aria-live="polite">
          {loading && <p>Searching places…</p>}
          {error && <p className="form-error">{error}</p>}
          {!loading &&
            results.map((place) => (
              <button
                type="button"
                key={place.id}
                onClick={() => choosePlace(place)}
              >
                <strong>{place.name}</strong>
                <span>Centre map here</span>
              </button>
            ))}
          {!loading && results.length > 0 && (
            <small className="place-search-attribution">
              Search data © OpenStreetMap contributors
            </small>
          )}
        </div>
      )}
    </div>
  );
}
