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
      message: "We couldn’t work out your location just now.",
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
