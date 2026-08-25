import { useState } from "react";
import { MAX_ART_WALK_STOPS, useArtWalk } from "./ArtWalkContext";

export default function AddToWalkButton({ artworkId }: { artworkId: number }) {
  const { addArtwork, removeArtwork, containsArtwork } = useArtWalk();
  const [message, setMessage] = useState("");
  const selected = containsArtwork(artworkId);

  function toggleArtwork() {
    setMessage("");

    if (selected) {
      removeArtwork(artworkId);
      return;
    }

    if (!addArtwork(artworkId)) {
      setMessage(`An Art Walk can include up to ${MAX_ART_WALK_STOPS} artworks.`);
    }
  }

  return (
    <div className="add-to-walk-control">
      <button
        type="button"
        className={`add-to-walk-button ${selected ? "is-selected" : ""}`}
        aria-pressed={selected}
        onClick={toggleArtwork}
      >
        {selected ? "✓ Added to walk" : "＋ Add to walk"}
      </button>
      {message && (
        <small className="add-to-walk-message" role="status">
          {message}
        </small>
      )}
    </div>
  );
}
