export type ArtworkLocation = {
  town?: string | null;
  city?: string | null;
};

function normaliseLocationPart(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

/** Returns the single most useful locality for a compact artwork label. */
export function getArtworkLocality(location: ArtworkLocation) {
  const town = normaliseLocationPart(location.town);
  const city = normaliseLocationPart(location.city);

  if (
    town &&
    city &&
    town.localeCompare(city, undefined, { sensitivity: "accent" }) === 0
  ) {
    return city;
  }

  return town || city;
}
