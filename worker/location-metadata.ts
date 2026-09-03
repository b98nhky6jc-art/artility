import { getArtworkLocality } from "../shared/artwork-location.ts";

export type ArtworkLocationMetadata = {
  town: string | null;
  city: string | null;
};

export type ArtworkWithLocationMetadata = ArtworkLocationMetadata & {
  latitude: number;
  longitude: number;
};

type NominatimAddress = {
  neighbourhood?: unknown;
  suburb?: unknown;
  quarter?: unknown;
  city_district?: unknown;
  borough?: unknown;
  town?: unknown;
  city?: unknown;
  village?: unknown;
  hamlet?: unknown;
  municipality?: unknown;
  islet?: unknown;
};

type ReverseGeocodeResponse = { address?: NominatimAddress };
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export const DEFAULT_LOCATION_GEOCODER_URL =
  "https://nominatim.openstreetmap.org/reverse";

export function isValidArtworkCoordinates(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function readPlaceName(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  return value.trim() || null;
}

export function locationMetadataFromAddress(
  address: NominatimAddress | undefined,
): ArtworkLocationMetadata {
  if (!address) {
    return { town: null, city: null };
  }

  const city =
    readPlaceName(address.city) ||
    readPlaceName(address.town) ||
    readPlaceName(address.village) ||
    readPlaceName(address.hamlet) ||
    readPlaceName(address.municipality);
  const town =
    readPlaceName(address.islet) ||
    readPlaceName(address.suburb) ||
    readPlaceName(address.neighbourhood) ||
    readPlaceName(address.quarter) ||
    readPlaceName(address.city_district) ||
    readPlaceName(address.borough) ||
    readPlaceName(address.town) ||
    readPlaceName(address.village) ||
    readPlaceName(address.hamlet) ||
    readPlaceName(address.municipality);
  const locality = getArtworkLocality({ town, city });

  return { town: locality === city ? null : town, city };
}

/**
 * Older imports stored the same place name in both fields. New location
 * lookups deliberately avoid that duplication, so it is a safe marker for a
 * legacy record whose label should be refreshed from its coordinates.
 */
export function needsLocationMetadataRefresh(
  metadata: ArtworkLocationMetadata,
) {
  if (metadata.town === null && metadata.city === null) {
    return true;
  }

  return (
    metadata.town !== null &&
    metadata.city !== null &&
    metadata.town.trim().toLocaleLowerCase() ===
      metadata.city.trim().toLocaleLowerCase()
  );
}

/** Updates only place names; physical coordinates deliberately pass through. */
export function refreshArtworkLocationMetadata<T extends ArtworkWithLocationMetadata>(
  artwork: T,
  metadata: ArtworkLocationMetadata,
) {
  return {
    ...artwork,
    town: metadata.town,
    city: metadata.city,
  };
}

/**
 * Retrieves locality-level metadata only. Coordinates are never altered. A
 * failed lookup returns empty metadata so callers cannot retain a stale name.
 */
export async function reverseGeocodeArtworkLocation(
  latitude: number,
  longitude: number,
  options: { fetcher?: FetchLike; endpoint?: string } = {},
): Promise<ArtworkLocationMetadata> {
  if (!isValidArtworkCoordinates(latitude, longitude)) {
    throw new Error("Valid latitude and longitude are required");
  }

  const requestUrl = new URL(
    options.endpoint || DEFAULT_LOCATION_GEOCODER_URL,
  );
  requestUrl.searchParams.set("format", "jsonv2");
  requestUrl.searchParams.set("addressdetails", "1");
  // Building-level results retain the surrounding neighbourhood/suburb in
  // the address hierarchy. Lower zoom levels often collapse this to the city,
  // which made nearby places such as Kirkstall display only as Leeds.
  requestUrl.searchParams.set("zoom", "18");
  requestUrl.searchParams.set("lat", latitude.toString());
  requestUrl.searchParams.set("lon", longitude.toString());
  requestUrl.searchParams.set("accept-language", "en");

  try {
    const response = await (options.fetcher ?? fetch)(requestUrl, {
      headers: {
        accept: "application/json",
        "accept-language": "en",
        "user-agent": "Artility/1.0 (https://artility.co.uk)",
      },
    });

    if (!response.ok) {
      throw new Error(`Location lookup failed with ${response.status}`);
    }

    const result = (await response.json()) as ReverseGeocodeResponse;
    return locationMetadataFromAddress(result.address);
  } catch (error) {
    console.warn("Artwork location lookup failed", {
      latitude,
      longitude,
      error: error instanceof Error ? error.message : String(error),
    });
    return { town: null, city: null };
  }
}
