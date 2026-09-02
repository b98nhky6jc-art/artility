export type PlaceSearchResult = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

type NominatimPlace = {
  place_id?: unknown;
  display_name?: unknown;
  lat?: unknown;
  lon?: unknown;
};

const DEFAULT_PLACE_SEARCH_ENDPOINT =
  "https://nominatim.openstreetmap.org/search";

export function parsePlaceSearchResults(value: unknown): PlaceSearchResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((candidate: NominatimPlace) => {
    const latitude = Number(candidate.lat);
    const longitude = Number(candidate.lon);
    const name =
      typeof candidate.display_name === "string"
        ? candidate.display_name.trim()
        : "";

    if (
      !name ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      return [];
    }

    return [
      {
        id: String(candidate.place_id ?? `${latitude},${longitude}`),
        name,
        latitude,
        longitude,
      },
    ];
  });
}

export async function searchPlaces(
  query: string,
  options: {
    endpoint?: string;
    fetcher?: typeof fetch;
  } = {},
) {
  const cleanQuery = query.trim().replace(/\s+/g, " ").slice(0, 120);

  if (cleanQuery.length < 2) {
    return [];
  }

  const requestUrl = new URL(
    options.endpoint ?? DEFAULT_PLACE_SEARCH_ENDPOINT,
  );
  requestUrl.searchParams.set("format", "jsonv2");
  requestUrl.searchParams.set("addressdetails", "1");
  requestUrl.searchParams.set("limit", "5");
  requestUrl.searchParams.set("accept-language", "en");
  requestUrl.searchParams.set("q", cleanQuery);

  const response = await (options.fetcher ?? fetch)(requestUrl, {
    headers: {
      accept: "application/json",
      "user-agent": "Artility/1.0 (+https://artility.co.uk)",
    },
  });

  if (!response.ok) {
    throw new Error(`Place search failed with ${response.status}`);
  }

  return parsePlaceSearchResults(await response.json());
}
