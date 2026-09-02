import type { UserLocation } from "./location";

export type ArtWalkStartMode = "current" | "first" | "place";

type ArtWalkStartOptions = {
  deviceLocation: UserLocation | null;
  firstArtwork: UserLocation | null;
  manualPlace: UserLocation | null;
};

export function resolveArtWalkStart(
  mode: ArtWalkStartMode,
  options: ArtWalkStartOptions,
) {
  if (mode === "current") {
    return options.deviceLocation;
  }

  if (mode === "place") {
    return options.manualPlace;
  }

  return options.firstArtwork;
}
