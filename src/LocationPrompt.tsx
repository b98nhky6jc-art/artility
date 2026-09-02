import { useEffect, useRef, useState } from "react";
import {
  getLocationEnablementGuidance,
  getLocationRecoveryGuidance,
  type LocationError,
  type LocationPermissionState,
} from "./location";

export type LocationFeature = "explore" | "checkin" | "upload" | "walk";

type Props = {
  feature: LocationFeature;
  state: LocationPermissionState;
  error: LocationError | null;
  onClose: () => void;
  onRequest: () => void;
  onSearchInstead?: () => void;
};

const featureCopy: Record<LocationFeature, { heading: string; body: string }> = {
  explore: {
    heading: "Find art around you",
    body: "Artility uses your location to show artworks nearby, help you check in when you find one, and accurately place new discoveries.",
  },
  checkin: {
    heading: "Check in at this artwork",
    body: "Artility needs your location to confirm that you’re close enough to this artwork before checking you in.",
  },
  upload: {
    heading: "Place your discovery",
    body: "Artility uses your location to accurately place a new artwork when your photo doesn’t contain GPS information.",
  },
  walk: {
    heading: "Start from where you are",
    body: "Artility can use your location as the starting point for this walking route.",
  },
};

export default function LocationPrompt({
  feature,
  state,
  error,
  onClose,
  onRequest,
  onSearchInstead,
}: Props) {
  const [showGuidance, setShowGuidance] = useState(false);
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const denied = state === "denied";
  const unavailable = state === "unavailable";
  const retryableError = state === "error";
  const requesting = state === "requesting";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    primaryRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  const copy = featureCopy[feature];
  const canSearch = feature === "explore" || feature === "walk";

  function searchInstead() {
    onClose();
    onSearchInstead?.();
  }

  return (
    <div className="location-dialog-backdrop" onMouseDown={onClose}>
      <section
        className="location-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="location-dialog-close"
          aria-label="Close location information"
          onClick={onClose}
        >
          ×
        </button>

        <div className="location-dialog-icon" aria-hidden="true">⌖</div>

        <span className="eyebrow">LOCATION</span>
        <h2 id="location-dialog-title">
          {denied
            ? "Location is turned off"
            : unavailable
              ? "Location isn’t available"
              : retryableError
                ? "We couldn’t find you"
                : copy.heading}
        </h2>

        <p>
          {denied
            ? "Artility works best when it knows roughly where you are. Turn location on to find nearby artwork, check in and add new discoveries."
            : unavailable
              ? "This browser can’t share a device location with Artility. You can still search and explore manually."
              : retryableError
                ? error?.message
                : copy.body}
        </p>

        {!denied && !unavailable && !retryableError && (
          <p className="location-privacy-note">Your location isn’t displayed publicly.</p>
        )}

        {showGuidance && (
          <div className="location-guidance" role="status">
            {getLocationEnablementGuidance(navigator.userAgent)}
          </div>
        )}

        {retryableError && error?.code === "position-unavailable" && (
          <div className="location-guidance" role="status">
            {getLocationRecoveryGuidance(navigator.userAgent)}
          </div>
        )}

        <div className="location-dialog-actions">
          {denied ? (
            <button
              ref={primaryRef}
              type="button"
              className="primary-button"
              onClick={() => setShowGuidance((visible) => !visible)}
            >
              How to enable location
            </button>
          ) : !unavailable ? (
            <button
              ref={primaryRef}
              type="button"
              className="primary-button"
              disabled={requesting}
              onClick={onRequest}
            >
              {requesting
                ? "Finding your location…"
                : retryableError
                  ? "Try again"
                  : "Use my location"}
            </button>
          ) : null}

          {canSearch && onSearchInstead ? (
            <button
              type="button"
              className="secondary-button"
              onClick={searchInstead}
            >
              Search for a place instead
            </button>
          ) : (
            <button type="button" className="secondary-button" onClick={onClose}>
              Keep browsing
            </button>
          )}
        </div>

        <small>You can still browse Artility without sharing your location.</small>
      </section>
    </div>
  );
}
