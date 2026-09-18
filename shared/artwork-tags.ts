export type ArtworkTag = string;
export const MAX_ARTWORK_TAGS = 5;

export const MIN_ARTWORK_TAG_LENGTH = 2;
export const MAX_ARTWORK_TAG_LENGTH = 40;

export function normaliseArtworkTag(value: unknown): ArtworkTag | null {
  if (typeof value !== "string") return null;

  const tag = value.trim().replace(/^#+/, "").replace(/\s+/g, " ");

  if (
    tag.length < MIN_ARTWORK_TAG_LENGTH ||
    tag.length > MAX_ARTWORK_TAG_LENGTH ||
    /[<>]/.test(tag) ||
    [...tag].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    }) ||
    !slugifyDiscoveryValue(tag)
  ) {
    return null;
  }

  return tag;
}

export function normaliseArtworkTags(values: unknown): ArtworkTag[] | null {
  if (!Array.isArray(values) || values.length > MAX_ARTWORK_TAGS) {
    return null;
  }

  const tags: ArtworkTag[] = [];
  const keys = new Set<string>();

  for (const value of values) {
    const tag = normaliseArtworkTag(value);

    if (!tag) {
      return null;
    }

    const key = slugifyDiscoveryValue(tag);

    if (!keys.has(key)) {
      keys.add(key);
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

export function getArtworkTagBySlug(tags: readonly string[], slug: string | null) {
  if (!slug) return null;
  return tags.find((tag) => slugifyDiscoveryValue(tag) === slug) ?? null;
}
