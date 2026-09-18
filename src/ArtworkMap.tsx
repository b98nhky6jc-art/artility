import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getArtworkDisplayTitle } from "./artworkDisplay";

type Artwork = {
  id: number;
  title: string | null;
  latitude: number;
  longitude: number;
  artist_name: string | null;
};

type Props = {
  artworks: Artwork[];
  numberedStops?: boolean;
  routeGeometry?: RouteLineString | null;
  userLocation?: { latitude: number; longitude: number } | null;
  focusLocation?: { latitude: number; longitude: number } | null;
  preserveUserLocation?: boolean;
};

export type RouteLineString = {
  type: "LineString";
  coordinates: number[][];
};

const ROUTE_SOURCE_ID = "art-walk-route";
const ROUTE_LAYER_ID = "art-walk-route-line";
const LAST_MAP_VIEWPORT_KEY = "artility:last-map-viewport";

type MapViewport = {
  center: [number, number];
  zoom: number;
};

function readLastMapViewport(): MapViewport | null {
  try {
    const stored = window.localStorage.getItem(LAST_MAP_VIEWPORT_KEY);
    const viewport = stored ? (JSON.parse(stored) as Partial<MapViewport>) : null;
    const longitude = viewport?.center?.[0];
    const latitude = viewport?.center?.[1];

    if (
      !viewport ||
      typeof longitude !== "number" ||
      typeof latitude !== "number" ||
      typeof viewport.zoom !== "number" ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(viewport.zoom)
    ) {
      return null;
    }

    return {
      center: [longitude, latitude],
      zoom: viewport.zoom,
    };
  } catch {
    return null;
  }
}

function saveLastMapViewport(center: [number, number], zoom: number) {
  try {
    window.localStorage.setItem(
      LAST_MAP_VIEWPORT_KEY,
      JSON.stringify({ center, zoom }),
    );
  } catch {
    // The map remains usable when local storage is unavailable.
  }
}

export default function ArtworkMap({
  artworks,
  numberedStops = false,
  routeGeometry = null,
  userLocation = null,
  focusLocation = null,
  preserveUserLocation = false,
}: Props) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) {
      return;
    }

    const savedViewport = readLastMapViewport();
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: savedViewport?.center ?? [-1.54, 53.83],
      zoom: savedViewport?.zoom ?? 12,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("moveend", () => {
      const center = map.getCenter();
      saveLastMapViewport([center.lng, center.lat], map.getZoom());
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;

      map.remove();
      mapRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (mapRef.current && focusLocation) {
      mapRef.current.jumpTo({
        center: [focusLocation.longitude, focusLocation.latitude],
        zoom: 13,
      });
    }
  }, [focusLocation]);

  useEffect(() => {
    userMarkerRef.current?.remove();
    userMarkerRef.current = null;

    if (!mapRef.current || !userLocation) {
      return;
    }

    const markerElement = document.createElement("div");
    markerElement.className = "artility-user-location-marker";
    markerElement.setAttribute("aria-label", "Your approximate location");

    userMarkerRef.current = new maplibregl.Marker({ element: markerElement })
      .setLngLat([userLocation.longitude, userLocation.latitude])
      .addTo(mapRef.current);
  }, [userLocation]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    if (artworks.length === 0) {
      return;
    }

    const bounds = new maplibregl.LngLatBounds();

    artworks.forEach((artwork) => {
      const longitude = Number(artwork.longitude);
      const latitude = Number(artwork.latitude);

      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        return;
      }

      bounds.extend([longitude, latitude]);

      const popupContent = document.createElement("div");
      popupContent.className = "artwork-map-popup";

      const popupTitle = document.createElement("strong");
      popupTitle.textContent = getArtworkDisplayTitle(artwork);

      const popupArtist = document.createElement("span");
      popupArtist.textContent =
        artwork.artist_name ?? "Artist unknown";

      popupContent.append(popupTitle, popupArtist);

      const popup = new maplibregl.Popup({
        offset: 24,
        className: "artwork-popup",
      }).setDOMContent(popupContent);

      const markerOptions: maplibregl.MarkerOptions = numberedStops
        ? {
            element: Object.assign(document.createElement("div"), {
              className: "art-walk-map-marker",
              textContent: String(artworks.indexOf(artwork) + 1),
            }),
          }
        : { color: "var(--yellow)" };
      const marker = new maplibregl.Marker(markerOptions)
        .setLngLat([longitude, latitude])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });

    if (!bounds.isEmpty() && !preserveUserLocation) {
      if (artworks.length === 1) {
        const artwork = artworks[0];

        map.flyTo({
          center: [Number(artwork.longitude), Number(artwork.latitude)],
          zoom: 15,
        });
      } else {
        map.fitBounds(bounds, {
          padding: 60,
          maxZoom: 15,
          duration: 800,
        });
      }
    }
  }, [artworks, focusLocation, numberedStops, preserveUserLocation]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    function syncRoute() {
      const routeData: {
        type: "FeatureCollection";
        features: Array<{
          type: "Feature";
          properties: Record<string, never>;
          geometry: RouteLineString;
        }>;
      } = {
        type: "FeatureCollection",
        features: routeGeometry
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: routeGeometry,
              },
            ]
          : [],
      };
      const existingSource = map?.getSource(
        ROUTE_SOURCE_ID,
      ) as maplibregl.GeoJSONSource | undefined;

      if (existingSource) {
        existingSource.setData(routeData);
      } else {
        map?.addSource(ROUTE_SOURCE_ID, {
          type: "geojson",
          data: routeData,
        });
        map?.addLayer({
          id: ROUTE_LAYER_ID,
          type: "line",
          source: ROUTE_SOURCE_ID,
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": "#DD5341",
            "line-width": 6,
            "line-opacity": 0.9,
          },
        });
      }

      if (routeGeometry?.coordinates.length) {
        const bounds = new maplibregl.LngLatBounds();

        routeGeometry.coordinates.forEach((coordinate) => {
          if (coordinate.length >= 2) {
            bounds.extend([coordinate[0], coordinate[1]]);
          }
        });

        if (!bounds.isEmpty()) {
          map?.fitBounds(bounds, {
            padding: 55,
            maxZoom: 16,
            duration: 800,
          });
        }
      }
    }

    if (map.isStyleLoaded()) {
      syncRoute();
      return;
    }

    map.once("load", syncRoute);
    return () => {
      map.off("load", syncRoute);
    };
  }, [routeGeometry]);

  return <div ref={mapContainer} className="real-map" />;
}
