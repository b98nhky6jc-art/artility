import {
  normaliseInfrastructureType,
  type InfrastructureType,
} from "../shared/infrastructure-types.ts";

export type DiscoveryCategory = {
  name: InfrastructureType;
  slug: string;
};

export const DISCOVERY_CATEGORIES: readonly DiscoveryCategory[] = [
  { name: "Utility box / cabinet", slug: "utility-box-cabinet" },
  { name: "Wall / mural", slug: "wall-mural" },
  { name: "Bollard / post", slug: "bollard-post" },
  { name: "Door / shutter", slug: "door-shutter" },
  { name: "Bench / street furniture", slug: "bench-street-furniture" },
  { name: "Tree / natural feature", slug: "tree-natural-feature" },
  { name: "Bridge / underpass", slug: "bridge-underpass" },
  { name: "Sign / panel", slug: "sign-panel" },
  { name: "Sculpture / installation", slug: "sculpture-installation" },
  { name: "Other", slug: "other" },
] as const;

export function getDiscoveryCategoryBySlug(slug: string | null) {
  return DISCOVERY_CATEGORIES.find((category) => category.slug === slug) ?? null;
}

export function artworkBelongsToCategory(
  infrastructureType: unknown,
  category: DiscoveryCategory,
) {
  const normalised = normaliseInfrastructureType(infrastructureType);

  if (category.name === "Other") {
    return normalised === null || normalised === "Other";
  }

  return normalised === category.name;
}
