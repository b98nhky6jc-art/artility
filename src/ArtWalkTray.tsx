import { Link, useLocation } from "react-router";
import { useArtWalk } from "./ArtWalkContext";

export default function ArtWalkTray() {
  const location = useLocation();
  const { selectedArtworkIds, clearWalk } = useArtWalk();

  if (selectedArtworkIds.length === 0 || location.pathname === "/art-walk") {
    return null;
  }

  return (
    <aside className="art-walk-tray" aria-label="Current Art Walk">
      <div>
        <span className="eyebrow">ART WALK</span>
        <strong>
          {selectedArtworkIds.length} artwork
          {selectedArtworkIds.length === 1 ? "" : "s"} selected
        </strong>
      </div>
      <div className="art-walk-tray-actions">
        <Link to="/art-walk">View walk</Link>
        <button type="button" onClick={clearWalk}>
          Clear
        </button>
      </div>
    </aside>
  );
}
