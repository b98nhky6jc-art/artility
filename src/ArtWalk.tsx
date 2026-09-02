import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import ArtworkMap, { type RouteLineString } from "./ArtworkMap";
import { getArtworkDisplayTitle } from "./artworkDisplay";
import { getArtworkLocality } from "../shared/artwork-location";
import {
  MIN_ART_WALK_STOPS,
  useArtWalk,
} from "./ArtWalkContext";
import PlaceSearch from "./PlaceSearch";
import { useArtilityLocation } from "./LocationContext";
import {
  resolveArtWalkStart,
  type ArtWalkStartMode,
} from "./artWalkStart";

type WalkArtwork = {
  id: number;
  title: string | null;
  latitude: number;
  longitude: number;
  town: string | null;
  city: string | null;
  artist_name: string | null;
};

type RoutePlanResponse = {
  mode: "walking";
  stops: WalkArtwork[];
  total_distance_metres: number;
  estimated_duration_seconds: number;
  geometry: RouteLineString;
  error?: string;
};

function formatRouteDistance(distanceMetres: number) {
  return distanceMetres < 1000
    ? `${Math.round(distanceMetres)} m`
    : `${(distanceMetres / 1000).toFixed(1)} km`;
}

function formatRouteDuration(durationSeconds: number) {
  return `~${Math.max(1, Math.round(durationSeconds / 60))} min`;
}

export default function ArtWalk() {
  const { selectedArtworkIds, removeArtwork, clearWalk } = useArtWalk();
  const [artworks, setArtworks] = useState<WalkArtwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const {
    deviceLocation: userLocation,
    manualPlace,
    permissionState,
    error: locationError,
    beginLocationFlow,
  } = useArtilityLocation();
  const [startMode, setStartMode] = useState<ArtWalkStartMode>("first");
  const [showPlaceSearch, setShowPlaceSearch] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [route, setRoute] = useState<RoutePlanResponse | null>(null);
  const [routeError, setRouteError] = useState("");

  function chooseStartMode(mode: ArtWalkStartMode) {
    setStartMode(mode);
    setRoute(null);
    setRouteError("");
  }

  useEffect(() => {
    let current = true;

    void (async () => {
      setRoute(null);
      setRouteError("");

      if (selectedArtworkIds.length === 0) {
        setArtworks([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError("");

      try {
        const loadedArtworks = await Promise.all(
          selectedArtworkIds.map(async (artworkId) => {
            const response = await fetch(`/api/artworks/${artworkId}`);

            if (!response.ok) {
              throw new Error(`Artwork #${artworkId} is no longer available.`);
            }

            const data = (await response.json()) as { artwork: WalkArtwork };
            return data.artwork;
          }),
        );

        if (current) {
          setArtworks(loadedArtworks);
        }
      } catch (error) {
        if (current) {
          setLoadError(
            error instanceof Error ? error.message : "Could not load this walk.",
          );
        }
      } finally {
        if (current) {
          setLoading(false);
        }
      }
    })();

    return () => {
      current = false;
    };
  }, [selectedArtworkIds]);

  const orderedArtworks = useMemo(() => {
    const byId = new Map(artworks.map((artwork) => [artwork.id, artwork]));
    return selectedArtworkIds
      .map((artworkId) => byId.get(artworkId))
      .filter((artwork): artwork is WalkArtwork => Boolean(artwork));
  }, [artworks, selectedArtworkIds]);

  async function planRoute() {
    if (orderedArtworks.length < MIN_ART_WALK_STOPS) {
      setRouteError(`Choose at least ${MIN_ART_WALK_STOPS} artworks to plan a walk.`);
      return;
    }

    const firstArtwork = orderedArtworks[0] ?? null;
    const start = resolveArtWalkStart(startMode, {
      deviceLocation: userLocation,
      manualPlace,
      firstArtwork,
    });

    if (!start) {
      setRouteError(
        startMode === "place"
          ? "Choose a town, city, postcode or place before planning your walk."
          : "Your current location is unavailable. Start at the first artwork instead.",
      );
      return;
    }

    setPlanning(true);
    setRouteError("");

    try {
      const response = await fetch("/api/routes/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          start: {
            latitude: start.latitude,
            longitude: start.longitude,
          },
          artwork_ids: selectedArtworkIds,
          mode: "walking",
        }),
      });
      const data = (await response.json()) as RoutePlanResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Could not generate this walk.");
      }

      setRoute(data);
    } catch (error) {
      setRoute(null);
      setRouteError(
        error instanceof Error ? error.message : "Could not generate this walk.",
      );
    } finally {
      setPlanning(false);
    }
  }

  return (
    <main className="page-main art-walk-page">
      <section className="page-panel art-walk-hero">
        <div>
          <span className="eyebrow">PLAN YOUR ROUTE</span>
          <h1>Art Walk</h1>
          <p>Choose up to six artworks and turn them into a real walking route.</p>
        </div>
        <div className="art-walk-count">
          <strong>{selectedArtworkIds.length}</strong>
          <span>selected</span>
        </div>
      </section>

      {selectedArtworkIds.length === 0 ? (
        <section className="page-panel art-walk-empty">
          <h2>Start with nearby artwork</h2>
          <p>Add between two and six artworks from Explore or an artwork page.</p>
          <Link to="/#nearby" className="primary-button">
            Explore artwork
          </Link>
        </section>
      ) : (
        <section className="art-walk-layout">
          <div className="page-panel art-walk-stops-panel">
            <div className="art-walk-section-heading">
              <div>
                <span className="eyebrow">YOUR STOPS</span>
                <h2>Walk order</h2>
              </div>
              <button type="button" className="text-button" onClick={clearWalk}>
                Clear walk
              </button>
            </div>

            {loading && <p className="message">Loading your stops…</p>}
            {loadError && <p className="form-error">{loadError}</p>}

            <ol className="art-walk-stop-list">
              {orderedArtworks.map((artwork, index) => (
                <li key={artwork.id}>
                  <span className="art-walk-stop-number">{index + 1}</span>
                  <div>
                    <Link to={`/artwork/${artwork.id}`}>
                      {getArtworkDisplayTitle(artwork)}
                    </Link>
                    <small>
                      {artwork.artist_name ?? "Artist unknown"}
                      {getArtworkLocality(artwork)
                        ? ` · ${getArtworkLocality(artwork)}`
                        : ""}
                    </small>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${getArtworkDisplayTitle(artwork)} from walk`}
                    onClick={() => removeArtwork(artwork.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ol>

            <fieldset className="art-walk-start-options">
              <legend>Start walk from</legend>
              <label>
                <input
                  type="radio"
                  name="walk-start"
                  value="current"
                  checked={startMode === "current"}
                  disabled={!userLocation}
                  onChange={() => chooseStartMode("current")}
                />
                Current location
              </label>
              <label>
                <input
                  type="radio"
                  name="walk-start"
                  value="first"
                  checked={startMode === "first"}
                  onChange={() => chooseStartMode("first")}
                />
                First selected artwork
              </label>
              <label>
                <input
                  type="radio"
                  name="walk-start"
                  value="place"
                  checked={startMode === "place"}
                  disabled={!manualPlace}
                  onChange={() => chooseStartMode("place")}
                />
                {manualPlace
                  ? `Selected place: ${manualPlace.name}`
                  : "Town, city, postcode or place"}
              </label>
              <button
                type="button"
                className="location-inline-action"
                aria-expanded={showPlaceSearch}
                onClick={() => setShowPlaceSearch((visible) => !visible)}
              >
                {showPlaceSearch
                  ? "Close place search"
                  : manualPlace
                    ? "Change starting place"
                    : "Choose a starting place"}
              </button>
              {showPlaceSearch && (
                <PlaceSearch
                  autoFocus
                  className="art-walk-place-search"
                  label="Start from a town, city, postcode or place"
                  resultAction="Start walk here"
                  selectedHint="Walk starting point"
                  onCleared={() => chooseStartMode("first")}
                  onSelected={() => {
                    chooseStartMode("place");
                    setShowPlaceSearch(false);
                  }}
                />
              )}
              {!userLocation && (
                <button
                  type="button"
                  className="location-inline-action"
                  disabled={permissionState === "checking" || permissionState === "requesting"}
                  onClick={() =>
                    beginLocationFlow({
                      feature: "walk",
                      onLocated: () => chooseStartMode("current"),
                      onSearchInstead: () => setShowPlaceSearch(true),
                    })
                  }
                >
                  {permissionState === "requesting"
                    ? "Finding your location…"
                    : "Use my location as the start"}
                </button>
              )}
              {!userLocation && locationError && (
                <small>
                  {locationError.message} Your walk can still start at stop 1 or
                  a place you search for.
                </small>
              )}
            </fieldset>

            {routeError && (
              <p className="form-error" role="alert">
                {routeError}
              </p>
            )}

            <button
              type="button"
              className="primary-button art-walk-plan-button"
              disabled={
                planning || loading || orderedArtworks.length < MIN_ART_WALK_STOPS
              }
              onClick={() => void planRoute()}
            >
              {planning
                ? "Planning walk…"
                : route
                  ? "Recalculate route"
                  : "Generate walking route"}
            </button>
          </div>

          <div className="page-panel art-walk-map-panel">
            <div className="art-walk-map-heading">
              <div>
                <span className="eyebrow">WALKING ROUTE</span>
                <h2>{route ? "Your route" : "Route preview"}</h2>
              </div>
              {route && (
                <strong className="art-walk-summary">
                  {route.stops.length} artworks · {formatRouteDistance(route.total_distance_metres)} · {formatRouteDuration(route.estimated_duration_seconds)}
                </strong>
              )}
            </div>
            <div className="art-walk-map">
              <ArtworkMap
                artworks={orderedArtworks}
                numberedStops
                routeGeometry={route?.geometry ?? null}
              />
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
