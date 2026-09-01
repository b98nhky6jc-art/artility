import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  addToArtWalkSelection,
  MAX_ART_WALK_STOPS,
  MIN_ART_WALK_STOPS,
  normalizeArtWalkSelection,
  removeFromArtWalkSelection,
} from "./artWalkSelection";

export { MAX_ART_WALK_STOPS, MIN_ART_WALK_STOPS };
const STORAGE_KEY = "artility:art-walk-stops";

type ArtWalkContextValue = {
  selectedArtworkIds: number[];
  addArtwork: (artworkId: number) => boolean;
  removeArtwork: (artworkId: number) => void;
  clearWalk: () => void;
  containsArtwork: (artworkId: number) => boolean;
};

const ArtWalkContext = createContext<ArtWalkContextValue | null>(null);

function loadSelectedArtworkIds() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(STORAGE_KEY) ?? "[]",
    ) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return normalizeArtWalkSelection(parsed);
  } catch {
    return [];
  }
}

export function ArtWalkProvider({ children }: { children: ReactNode }) {
  const [selectedArtworkIds, setSelectedArtworkIds] = useState<number[]>(
    loadSelectedArtworkIds,
  );

  const updateSelection = useCallback((next: number[]) => {
    setSelectedArtworkIds(next);

    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The walk remains available in memory for this page session.
    }
  }, []);

  const addArtwork = useCallback(
    (artworkId: number) => {
      const result = addToArtWalkSelection(selectedArtworkIds, artworkId);

      if (result.selection !== selectedArtworkIds) {
        updateSelection(result.selection);
      }

      return result.added;
    },
    [selectedArtworkIds, updateSelection],
  );

  const removeArtwork = useCallback(
    (artworkId: number) => {
      updateSelection(removeFromArtWalkSelection(selectedArtworkIds, artworkId));
    },
    [selectedArtworkIds, updateSelection],
  );

  const clearWalk = useCallback(() => updateSelection([]), [updateSelection]);
  const containsArtwork = useCallback(
    (artworkId: number) => selectedArtworkIds.includes(artworkId),
    [selectedArtworkIds],
  );
  const value = useMemo(
    () => ({
      selectedArtworkIds,
      addArtwork,
      removeArtwork,
      clearWalk,
      containsArtwork,
    }),
    [
      selectedArtworkIds,
      addArtwork,
      removeArtwork,
      clearWalk,
      containsArtwork,
    ],
  );

  return (
    <ArtWalkContext.Provider value={value}>{children}</ArtWalkContext.Provider>
  );
}

// Hooks share this module with the provider so consumers use one context.
// eslint-disable-next-line react-refresh/only-export-components
export function useArtWalk() {
  const context = useContext(ArtWalkContext);

  if (!context) {
    throw new Error("useArtWalk must be used inside ArtWalkProvider");
  }

  return context;
}
