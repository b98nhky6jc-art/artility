const OPENROUTESERVICE_WALKING_URL =
  "https://api.openrouteservice.org/v2/directions/foot-walking/geojson";

export const MIN_ART_WALK_STOPS = 2;
export const MAX_ART_WALK_STOPS = 6;

export type RoutePlanInput = {
  start: { latitude: number; longitude: number };
  artwork_ids: number[];
  mode: "walking";
};

export type WalkingRoute = {
  distanceMetres: number;
  durationSeconds: number;
  geometry: {
    type: "LineString";
    coordinates: number[][];
  };
};

export class RoutingError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter?: string;

  constructor(
    message: string,
    status: number,
    code: string,
    retryAfter?: string,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function validCoordinate(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function validateRoutePlanInput(value: unknown): RoutePlanInput {
  if (!value || typeof value !== "object") {
    throw new RoutingError("Route request must be valid JSON", 400, "INVALID_ROUTE_REQUEST");
  }

  const input = value as Partial<RoutePlanInput>;
  const start = input.start;
  const artworkIds = input.artwork_ids;

  if (input.mode !== "walking") {
    throw new RoutingError("Only walking routes are supported", 400, "INVALID_ROUTE_MODE");
  }

  if (
    !start ||
    !validCoordinate(Number(start.latitude), Number(start.longitude))
  ) {
    throw new RoutingError("A valid start location is required", 400, "INVALID_ROUTE_START");
  }

  if (
    !Array.isArray(artworkIds) ||
    artworkIds.length < MIN_ART_WALK_STOPS ||
    artworkIds.length > MAX_ART_WALK_STOPS ||
    artworkIds.some((id) => !Number.isInteger(id) || id <= 0) ||
    new Set(artworkIds).size !== artworkIds.length
  ) {
    throw new RoutingError(
      `Choose ${MIN_ART_WALK_STOPS}–${MAX_ART_WALK_STOPS} unique artworks`,
      400,
      "INVALID_ROUTE_STOPS",
    );
  }

  return {
    start: {
      latitude: Number(start.latitude),
      longitude: Number(start.longitude),
    },
    artwork_ids: artworkIds,
    mode: "walking",
  };
}

export async function requestOpenRouteServiceWalkingRoute(
  apiKey: string,
  coordinates: number[][],
  fetcher: typeof fetch = fetch,
): Promise<WalkingRoute> {
  if (!apiKey) {
    throw new RoutingError(
      "Walking routes are temporarily unavailable",
      503,
      "ROUTING_NOT_CONFIGURED",
    );
  }

  let response: Response;

  try {
    response = await fetcher(OPENROUTESERVICE_WALKING_URL, {
      method: "POST",
      headers: {
        authorization: apiKey,
        "content-type": "application/json",
        accept: "application/geo+json, application/json",
      },
      body: JSON.stringify({ coordinates }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    console.error("Walking route provider request failed", error);
    throw new RoutingError(
      "The walking route service did not respond. Please try again.",
      503,
      "ROUTING_PROVIDER_UNAVAILABLE",
    );
  }

  if (!response.ok) {
    const providerRequestId = response.headers.get("x-request-id");
    const details = (await response.text()).slice(0, 500);
    console.error("Walking route provider error", {
      status: response.status,
      providerRequestId,
      details,
    });

    if (response.status === 429) {
      throw new RoutingError(
        "The walking route service is busy. Please try again shortly.",
        503,
        "ROUTING_RATE_LIMITED",
        response.headers.get("retry-after") ?? undefined,
      );
    }

    throw new RoutingError(
      "A walking route could not be generated. Please try again.",
      502,
      "ROUTING_PROVIDER_ERROR",
    );
  }

  const data = (await response.json()) as {
    features?: Array<{
      geometry?: { type?: string; coordinates?: unknown };
      properties?: { summary?: { distance?: number; duration?: number } };
    }>;
  };
  const feature = data.features?.[0];
  const summary = feature?.properties?.summary;
  const routeCoordinates = feature?.geometry?.coordinates;

  if (
    feature?.geometry?.type !== "LineString" ||
    !Array.isArray(routeCoordinates) ||
    !Number.isFinite(summary?.distance) ||
    !Number.isFinite(summary?.duration)
  ) {
    console.error("Walking route provider returned an invalid response");
    throw new RoutingError(
      "The walking route service returned an invalid route.",
      502,
      "INVALID_PROVIDER_RESPONSE",
    );
  }

  return {
    distanceMetres: Number(summary?.distance),
    durationSeconds: Number(summary?.duration),
    geometry: {
      type: "LineString",
      coordinates: routeCoordinates as number[][],
    },
  };
}
