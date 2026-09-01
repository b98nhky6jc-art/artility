export const INFRASTRUCTURE_TYPES = [
  "Utility box / cabinet",
  "Wall / mural",
  "Bollard / post",
  "Door / shutter",
  "Bench / street furniture",
  "Little library",
  "Tree / natural feature",
  "Bridge / underpass",
  "Sign / panel",
  "Sculpture / installation",
  "Other",
] as const;

export type InfrastructureType = (typeof INFRASTRUCTURE_TYPES)[number];

const CANONICAL_TYPES = new Map(
  INFRASTRUCTURE_TYPES.map((value) => [value.toLowerCase(), value]),
);

const LEGACY_TYPES: Record<string, InfrastructureType> = {
  "utility cabinet": "Utility box / cabinet",
  "street cabinet": "Utility box / cabinet",
  "telecom cabinet": "Utility box / cabinet",
  "utility box": "Utility box / cabinet",
  cabinet: "Utility box / cabinet",
  wall: "Wall / mural",
  mural: "Wall / mural",
  bollard: "Bollard / post",
  post: "Bollard / post",
  door: "Door / shutter",
  shutter: "Door / shutter",
  bench: "Bench / street furniture",
  "street furniture": "Bench / street furniture",
  tree: "Tree / natural feature",
  "natural feature": "Tree / natural feature",
  bridge: "Bridge / underpass",
  underpass: "Bridge / underpass",
  sign: "Sign / panel",
  panel: "Sign / panel",
  sculpture: "Sculpture / installation",
  installation: "Sculpture / installation",
  other: "Other",
};

export function normaliseInfrastructureType(
  value: unknown,
): InfrastructureType | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalised = value.trim().toLowerCase();

  if (!normalised) {
    return null;
  }

  return CANONICAL_TYPES.get(normalised) ?? LEGACY_TYPES[normalised] ?? null;
}

export function formatInfrastructureType(value: unknown) {
  return normaliseInfrastructureType(value) ?? "Other";
}
