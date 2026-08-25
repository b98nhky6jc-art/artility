export function normaliseArtistName(value: unknown) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  return name || null;
}

export function normaliseArtistNameKey(value: unknown) {
  return normaliseArtistName(value)?.toLocaleLowerCase("en-GB") ?? null;
}

export function normaliseInstagramHandle(value: unknown) {
  const handle = String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .trim()
    .toLocaleLowerCase("en-GB");

  return handle || null;
}

export function isUnknownArtistName(value: unknown) {
  const key = normaliseArtistNameKey(value);
  return key === "artist unknown" || key === "unknown artist";
}

export function isValidInstagramHandle(value: string | null) {
  return value === null || /^[a-z0-9._]{1,30}$/.test(value);
}
