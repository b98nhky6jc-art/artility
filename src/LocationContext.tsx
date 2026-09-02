import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import LocationPrompt, { type LocationFeature } from "./LocationPrompt";
import {
  describeGeolocationError,
  getCurrentPositionWithRetry,
  isValidLocation,
  type LocationError,
  type LocationPermissionState,
  type UserLocation,
} from "./location";

export type ManualPlace = UserLocation & {
  name: string;
};

type LocationDialogRequest = {
  feature: LocationFeature;
  onLocated?: (location: UserLocation) => void;
  onSearchInstead?: () => void;
};

type LocationContextValue = {
  permissionState: LocationPermissionState;
  deviceLocation: UserLocation | null;
  manualPlace: ManualPlace | null;
  activeMode: "device" | "manual" | null;
  activeLocation: UserLocation | null;
  error: LocationError | null;
  beginLocationFlow: (request: LocationDialogRequest) => void;
  requestDeviceLocation: (
    onLocated?: (location: UserLocation) => void,
    feature?: LocationFeature,
  ) => Promise<UserLocation | null>;
  selectManualPlace: (place: ManualPlace) => void;
  clearManualPlace: () => void;
};

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [permissionState, setPermissionState] =
    useState<LocationPermissionState>(() => {
      if (typeof navigator === "undefined") {
        return "unknown";
      }

      if (!navigator.geolocation) {
        return "unavailable";
      }

      const permissions = (
        navigator as Navigator & { permissions?: Permissions }
      ).permissions;
      return permissions ? "checking" : "prompt";
    });
  const [deviceLocation, setDeviceLocation] = useState<UserLocation | null>(null);
  const [manualPlace, setManualPlace] = useState<ManualPlace | null>(null);
  const [activeMode, setActiveMode] = useState<"device" | "manual" | null>(null);
  const [error, setError] = useState<LocationError | null>(() =>
    typeof navigator !== "undefined" && !navigator.geolocation
      ? {
          code: "unsupported",
          message:
            "Location isn’t available in this browser. You can still search and explore manually.",
        }
      : null,
  );
  const [dialogRequest, setDialogRequest] =
    useState<LocationDialogRequest | null>(null);
  const pendingRequest = useRef<Promise<UserLocation | null> | null>(null);

  useEffect(() => {
    let permissionStatus: PermissionStatus | null = null;
    let handlePermissionChange: (() => void) | null = null;
    let cancelled = false;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }

    const permissions = (
      navigator as Navigator & { permissions?: Permissions }
    ).permissions;

    if (!permissions) {
      return;
    }

    void permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (cancelled) {
          return;
        }

        permissionStatus = status;

        const applyPermissionState = () => {
          const nextState = status.state;
          setPermissionState(nextState);

          if (nextState === "denied") {
            setDeviceLocation(null);
            setActiveMode((mode) => (mode === "device" ? null : mode));
            setError({
              code: "permission-denied",
              message: "Location access is turned off for Artility.",
            });
          } else {
            setError((current) =>
              current?.code === "permission-denied" ? null : current,
            );
          }
        };

        handlePermissionChange = applyPermissionState;
        applyPermissionState();
        status.addEventListener("change", applyPermissionState);
      })
      .catch(() => {
        if (!cancelled) {
          setPermissionState("prompt");
        }
      });

    return () => {
      cancelled = true;
      if (permissionStatus && handlePermissionChange) {
        permissionStatus.removeEventListener("change", handlePermissionChange);
      }
    };
  }, []);

  const requestDeviceLocation = useCallback(
    (
      onLocated?: (location: UserLocation) => void,
      feature: LocationFeature = "explore",
    ) => {
      if (permissionState === "denied") {
        setError({
          code: "permission-denied",
          message: "Location access is turned off for Artility.",
        });
        return Promise.resolve(null);
      }

      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setPermissionState("unavailable");
        setError({
          code: "unsupported",
          message:
            "Location isn’t available in this browser. You can still search and explore manually.",
        });
        return Promise.resolve(null);
      }

      if (pendingRequest.current) {
        return pendingRequest.current;
      }

      setPermissionState("requesting");
      setError(null);

      const needsPreciseLocation = feature === "checkin" || feature === "upload";
      const firstAttempt: PositionOptions = {
        enableHighAccuracy: needsPreciseLocation,
        maximumAge: needsPreciseLocation ? 0 : 5 * 60 * 1000,
        timeout: 10_000,
      };
      const retryAttempt: PositionOptions = {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15_000,
      };

      pendingRequest.current = getCurrentPositionWithRetry(
        navigator.geolocation,
        firstAttempt,
        retryAttempt,
      )
        .then(
          (position) => {
            const location = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };

            if (!isValidLocation(location)) {
              setPermissionState("error");
              setError({
                code: "position-unavailable",
                message:
                  "Your browser allowed location access, but your device didn’t return a position.",
              });
              return null;
            }

            setDeviceLocation(location);
            setManualPlace(null);
            setActiveMode("device");
            setPermissionState("granted");
            setError(null);
            onLocated?.(location);
            return location;
          },
          (geolocationError) => {
            const friendlyError = describeGeolocationError(
              geolocationError as Pick<GeolocationPositionError, "code">,
            );
            const nextState =
              friendlyError.code === "permission-denied" ? "denied" : "error";
            setPermissionState(nextState);
            setError(friendlyError);
            return null;
          },
        )
        .finally(() => {
          pendingRequest.current = null;
        });

      return pendingRequest.current;
    },
    [permissionState],
  );

  const beginLocationFlow = useCallback(
    (request: LocationDialogRequest) => {
      if (permissionState === "granted" && deviceLocation) {
        void requestDeviceLocation(request.onLocated, request.feature);
        return;
      }

      setDialogRequest(request);
    },
    [deviceLocation, permissionState, requestDeviceLocation],
  );

  const selectManualPlace = useCallback((place: ManualPlace) => {
    setManualPlace(place);
    setActiveMode("manual");
  }, []);

  const clearManualPlace = useCallback(() => {
    setManualPlace(null);
    setActiveMode((mode) => (mode === "manual" ? null : mode));
  }, []);

  const value = useMemo<LocationContextValue>(
    () => ({
      permissionState,
      deviceLocation,
      manualPlace,
      activeMode,
      activeLocation:
        activeMode === "device"
          ? deviceLocation
          : activeMode === "manual"
            ? manualPlace
            : null,
      error,
      beginLocationFlow,
      requestDeviceLocation,
      selectManualPlace,
      clearManualPlace,
    }),
    [
      activeMode,
      beginLocationFlow,
      clearManualPlace,
      deviceLocation,
      error,
      manualPlace,
      permissionState,
      requestDeviceLocation,
      selectManualPlace,
    ],
  );

  return (
    <LocationContext.Provider value={value}>
      {children}
      {dialogRequest && (
        <LocationPrompt
          feature={dialogRequest.feature}
          state={permissionState}
          error={error}
          onClose={() => setDialogRequest(null)}
          onSearchInstead={dialogRequest.onSearchInstead}
          onRequest={() => {
            void requestDeviceLocation(
              dialogRequest.onLocated,
              dialogRequest.feature,
            ).then(
              (location) => {
                if (location) {
                  setDialogRequest(null);
                }
              },
            );
          }}
        />
      )}
    </LocationContext.Provider>
  );
}

// Hooks share this module with the provider so consumers use one context.
// eslint-disable-next-line react-refresh/only-export-components
export function useArtilityLocation() {
  const context = useContext(LocationContext);

  if (!context) {
    throw new Error("useArtilityLocation must be used within LocationProvider");
  }

  return context;
}
