export const ARTWORK_TAGS = [
  "Abstract",
  "Animals",
  "Botanical",
  "Community",
  "Geometric",
  "Heritage",
  "Portrait",
  "Typography",
  "Whimsical",
] as const;

export type ArtworkTag = (typeof ARTWORK_TAGS)[number];
export const MAX_ARTWORK_TAGS = 5;

const TAG_BY_KEY = new Map(
  ARTWORK_TAGS.map((tag) => [tag.toLocaleLowerCase("en"), tag]),
);

export function normaliseArtworkTag(value: unknown): ArtworkTag | null {
  if (typeof value !== "string") {
    return null;
  }

  return TAG_BY_KEY.get(value.trim().toLocaleLowerCase("en")) ?? null;
}

export function normaliseArtworkTags(values: unknown): ArtworkTag[] | null {
  if (!Array.isArray(values) || values.length > MAX_ARTWORK_TAGS) {
    return null;
  }

  const tags: ArtworkTag[] = [];

  for (const value of values) {
    const tag = normaliseArtworkTag(value);

    if (!tag) {
      return null;
    }

    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  }

  return tags;
}

export function slugifyDiscoveryValue(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getArtworkTagBySlug(slug: string | null) {
  return ARTWORK_TAGS.find((tag) => slugifyDiscoveryValue(tag) === slug) ?? null;
}
