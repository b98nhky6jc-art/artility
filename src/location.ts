export type LocationPermissionState =
  | "unknown"
  | "checking"
  | "prompt"
  | "requesting"
  | "granted"
  | "denied"
  | "unavailable"
  | "error";

export type UserLocation = {
  latitude: number;
  longitude: number;
};

export type LocationErrorCode =
  | "permission-denied"
  | "position-unavailable"
  | "timeout"
  | "unsupported"
  | "unknown";

export type LocationError = {
  code: LocationErrorCode;
  message: string;
};

type GeolocationRequester = Pick<Geolocation, "getCurrentPosition">;

function requestGeolocationPosition(
  geolocation: GeolocationRequester,
  options: PositionOptions,
) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    geolocation.getCurrentPosition(resolve, reject, options);
  });
}

export async function getCurrentPositionWithRetry(
  geolocation: GeolocationRequester,
  firstAttempt: PositionOptions,
  retryAttempt: PositionOptions,
) {
  try {
    return await requestGeolocationPosition(geolocation, firstAttempt);
  } catch (error) {
    const positionError = error as Partial<GeolocationPositionError> | null;

    if (positionError?.code !== 2) {
      throw error;
    }

    return requestGeolocationPosition(geolocation, retryAttempt);
  }
}

export function isValidLocation(value: unknown): value is UserLocation {
  if (!value || typeof value !== "object") {
    return false;
  }

  const location = value as Partial<UserLocation>;

  return (
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude) &&
    Math.abs(location.latitude ?? 91) <= 90 &&
    Math.abs(location.longitude ?? 181) <= 180
  );
}

export function describeGeolocationError(
  error: Pick<GeolocationPositionError, "code">,
): LocationError {
  if (error.code === 1) {
    return {
      code: "permission-denied",
      message: "Location access is turned off for Artility.",
    };
  }

  if (error.code === 2) {
    return {
      code: "position-unavailable",
      message:
        "Your browser allowed location access, but your device didn’t return a position.",
    };
  }

  if (error.code === 3) {
    return {
      code: "timeout",
      message:
        "Finding your location took too long. Try again or search for a place.",
    };
  }

  return {
    code: "unknown",
    message: "We couldn’t access your location just now.",
  };
}

export function getLocationEnablementGuidance(userAgent: string) {
  const agent = userAgent.toLowerCase();
  const isAppleMobile = /iphone|ipad|ipod/.test(agent);
  const isSafari = /safari/.test(agent) && !/chrome|crios|edg|opr/.test(agent);
  const isChromium = /chrome|crios|chromium|edg/.test(agent);

  if (isAppleMobile) {
    return "Open Settings, choose Safari, then Location, and allow access for Artility. You may also need to reload this page afterwards.";
  }

  if (isSafari) {
    return "In Safari, open Settings for This Website and set Location to Allow, then reload Artility.";
  }

  if (isChromium) {
    return "Open the site controls beside the address bar, set Location to Allow, then reload Artility.";
  }

  return "Open your browser’s site settings for Artility, allow Location, then reload this page.";
}

export function getLocationRecoveryGuidance(userAgent: string) {
  const agent = userAgent.toLowerCase();

  if (/iphone|ipad|ipod/.test(agent)) {
    return "Check that Location Services and Precise Location are on for your browser, then try again.";
  }

  if (/macintosh|mac os x/.test(agent)) {
    return "On your Mac, open System Settings → Privacy & Security → Location Services and make sure Location Services and your browser are enabled, then try again.";
  }

  if (/windows/.test(agent)) {
    return "Open Windows Settings → Privacy & security → Location, turn Location services on, then try again.";
  }

  return "Check that your device’s Location Services are on for this browser, then try again.";
}
