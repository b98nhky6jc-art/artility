export type UserLocation = {
  latitude: number;
  longitude: number;
};

export type ArtworkCoordinates = {
  id: number;
  latitude: number;
  longitude: number;
};

export const ARTWORK_PAGE_SIZE = 9;

const LOCATION_REQUESTED_KEY = "artility:location-requested";
const LOCATION_CACHE_KEY = "artility:location-cache";
const EARTH_RADIUS_METRES = 6_371_000;

let locationRequestedInMemory = false;
let cachedLocationInMemory: UserLocation | null = null;
let pendingLocationRequest: Promise<UserLocation | null> | null = null;

function isValidLocation(value: unknown): value is UserLocation {
  if (!value || typeof value !== "object") {
    return false;
  }

  const location = value as Partial<UserLocation>;

  return (
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude) &&
    Math.abs(location.latitude ?? 91) <= 90 &&
    Math.abs(location.longitude ?? 181) <= 180
  );
}

function readCachedLocation() {
  if (cachedLocationInMemory) {
    return cachedLocationInMemory;
  }

  if (typeof window === "undefined") {
    return null;
  }

  try {
    const cached = window.sessionStorage.getItem(LOCATION_CACHE_KEY);
    const parsed = cached ? (JSON.parse(cached) as unknown) : null;

    return isValidLocation(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function hasRequestedLocation() {
  if (locationRequestedInMemory) {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(LOCATION_REQUESTED_KEY) === "true";
  } catch {
    return false;
  }
}

function markLocationRequested() {
  locationRequestedInMemory = true;

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(LOCATION_REQUESTED_KEY, "true");
  } catch {
    // The in-memory guard still prevents repeat prompts in this app session.
  }
}

function cacheLocation(location: UserLocation) {
  cachedLocationInMemory = location;

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      LOCATION_CACHE_KEY,
      JSON.stringify(location),
    );
  } catch {
    // Location remains available for the current app session without storage.
  }
}

export function requestBrowserLocation() {
  const cachedLocation = readCachedLocation();

  if (cachedLocation) {
    return Promise.resolve(cachedLocation);
  }

  if (pendingLocationRequest) {
    return pendingLocationRequest;
  }

  const geolocation =
    typeof navigator === "undefined" ? undefined : navigator.geolocation;

  if (hasRequestedLocation() || !geolocation) {
    return Promise.resolve(null);
  }

  markLocationRequested();

  pendingLocationRequest = new Promise<UserLocation | null>((resolve) => {
    geolocation.getCurrentPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        if (!isValidLocation(location)) {
          resolve(null);
          return;
        }

        cacheLocation(location);
        resolve(location);
      },
      () => resolve(null),
      {
        enableHighAccuracy: false,
        maximumAge: 5 * 60 * 1000,
        timeout: 10_000,
      },
    );
  }).finally(() => {
    pendingLocationRequest = null;
  });

  return pendingLocationRequest;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function getDistanceInMetres(
  from: UserLocation,
  artwork: ArtworkCoordinates,
) {
  if (
    !Number.isFinite(artwork.latitude) ||
    !Number.isFinite(artwork.longitude)
  ) {
    return null;
  }

  const latitudeDelta = toRadians(artwork.latitude - from.latitude);
  const longitudeDelta = toRadians(artwork.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const artworkLatitude = toRadians(artwork.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(artworkLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    EARTH_RADIUS_METRES *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

export function formatDistance(distanceInMetres: number) {
  if (distanceInMetres < 1000) {
    return `${Math.max(1, Math.round(distanceInMetres))} m away`;
  }

  const distanceInKilometres = distanceInMetres / 1000;

  return `${distanceInKilometres < 10 ? distanceInKilometres.toFixed(1) : Math.round(distanceInKilometres)} km away`;
}

export function rankArtworksByDistance<T extends ArtworkCoordinates>(
  artworks: T[],
  userLocation: UserLocation | null,
) {
  const distances = new Map<number, number>();

  if (!userLocation) {
    return {
      sortedArtworks: artworks,
      artworkDistances: distances,
    };
  }

  artworks.forEach((artwork) => {
    const distance = getDistanceInMetres(userLocation, artwork);

    if (distance !== null) {
      distances.set(artwork.id, distance);
    }
  });

  const sortedArtworks = artworks
    .map((artwork, index) => ({ artwork, index }))
    .sort((left, right) => {
      const leftDistance = distances.get(left.artwork.id);
      const rightDistance = distances.get(right.artwork.id);

      if (leftDistance === undefined && rightDistance === undefined) {
        return left.index - right.index;
      }

      if (leftDistance === undefined) {
        return 1;
      }

      if (rightDistance === undefined) {
        return -1;
      }

      return leftDistance - rightDistance || left.index - right.index;
    })
    .map(({ artwork }) => artwork);

  return { sortedArtworks, artworkDistances: distances };
}
