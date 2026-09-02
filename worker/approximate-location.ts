export type ApproximateRequestLocation = {
  latitude: number;
  longitude: number;
  name: string;
};

type RequestLocationMetadata = {
  latitude?: unknown;
  longitude?: unknown;
  city?: unknown;
  region?: unknown;
  postalCode?: unknown;
  country?: unknown;
};

function cleanLabel(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

export function approximateLocationFromRequestMetadata(
  metadata: unknown,
): ApproximateRequestLocation | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const requestLocation = metadata as RequestLocationMetadata;
  const rawLatitude = cleanLabel(requestLocation.latitude);
  const rawLongitude = cleanLabel(requestLocation.longitude);

  if (!rawLatitude || !rawLongitude) {
    return null;
  }

  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }

  const name =
    cleanLabel(requestLocation.city) ||
    cleanLabel(requestLocation.postalCode) ||
    cleanLabel(requestLocation.region) ||
    cleanLabel(requestLocation.country) ||
    "your area";

  return { latitude, longitude, name };
}
