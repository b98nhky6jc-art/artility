export const MIN_ART_WALK_STOPS = 2;
export const MAX_ART_WALK_STOPS = 6;

export function normalizeArtWalkSelection(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value.filter(
        (id): id is number => Number.isInteger(id) && Number(id) > 0,
      ),
    ),
  ].slice(0, MAX_ART_WALK_STOPS);
}

export function addToArtWalkSelection(selection: number[], artworkId: number) {
  if (selection.includes(artworkId)) {
    return { selection, added: true };
  }

  if (selection.length >= MAX_ART_WALK_STOPS) {
    return { selection, added: false };
  }

  return { selection: [...selection, artworkId], added: true };
}

export function removeFromArtWalkSelection(
  selection: number[],
  artworkId: number,
) {
  return selection.filter((id) => id !== artworkId);
}
