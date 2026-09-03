import type { UserLocation } from "./location";
import {
  getArtworkLocationLabel,
  type ArtworkLocation,
} from "../shared/artwork-location.ts";

export type { UserLocation } from "./location";

export type ArtworkCoordinates = {
  id: number;
  latitude: number;
  longitude: number;
};

export type ArtworkSort =
  | "closest"
  | "furthest"
  | "newest"
  | "oldest"
  | "artist-az"
  | "artist-za";

export type SortableArtwork = ArtworkCoordinates & {
  created_at: string | null;
  artist_name: string | null;
};

export const ARTWORK_PAGE_SIZE = 9;

const EARTH_RADIUS_METRES = 6_371_000;

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

export function formatArtworkProximity(
  artwork: ArtworkLocation,
  distanceInMetres?: number,
) {
  const distance =
    typeof distanceInMetres === "number" && Number.isFinite(distanceInMetres)
    ? formatDistance(distanceInMetres)
    : null;
  const location = getArtworkLocationLabel(artwork);

  return [distance, location].filter(Boolean).join(", ") || null;
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

function timestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareArtists(
  left: SortableArtwork,
  right: SortableArtwork,
  direction: "asc" | "desc",
) {
  const leftName = left.artist_name?.trim() || null;
  const rightName = right.artist_name?.trim() || null;

  // Unattributed work is always grouped after named artists in both directions.
  if (!leftName || !rightName) {
    if (!leftName && !rightName) {
      return left.id - right.id;
    }

    return leftName ? -1 : 1;
  }

  const difference = leftName.localeCompare(rightName, undefined, {
    sensitivity: "base",
  });

  return (direction === "asc" ? difference : -difference) || left.id - right.id;
}

export function sortArtworks<T extends SortableArtwork>(
  artworks: T[],
  userLocation: UserLocation | null,
  requestedSort: ArtworkSort,
) {
  const { artworkDistances } = rankArtworksByDistance(artworks, userLocation);
  const sort =
    !userLocation &&
    (requestedSort === "closest" || requestedSort === "furthest")
      ? "newest"
      : requestedSort;

  const sortedArtworks = artworks
    .map((artwork, index) => ({ artwork, index }))
    .sort((leftEntry, rightEntry) => {
      const left = leftEntry.artwork;
      const right = rightEntry.artwork;

      if (sort === "artist-az" || sort === "artist-za") {
        return compareArtists(
          left,
          right,
          sort === "artist-az" ? "asc" : "desc",
        );
      }

      if (sort === "closest" || sort === "furthest") {
        const leftDistance = artworkDistances.get(left.id);
        const rightDistance = artworkDistances.get(right.id);

        if (leftDistance === undefined || rightDistance === undefined) {
          if (leftDistance === undefined && rightDistance === undefined) {
            return leftEntry.index - rightEntry.index;
          }

          return leftDistance === undefined ? 1 : -1;
        }

        const difference =
          sort === "closest"
            ? leftDistance - rightDistance
            : rightDistance - leftDistance;

        return difference || leftEntry.index - rightEntry.index;
      }

      const leftTimestamp = timestamp(left.created_at);
      const rightTimestamp = timestamp(right.created_at);

      if (leftTimestamp === null || rightTimestamp === null) {
        if (leftTimestamp === null && rightTimestamp === null) {
          return leftEntry.index - rightEntry.index;
        }

        return leftTimestamp === null ? 1 : -1;
      }

      const difference =
        sort === "newest"
          ? rightTimestamp - leftTimestamp
          : leftTimestamp - rightTimestamp;

      return difference || leftEntry.index - rightEntry.index;
    })
    .map(({ artwork }) => artwork);

  return { sortedArtworks, artworkDistances };
}
