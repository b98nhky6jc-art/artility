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
  homeArea?: {
    latitude: number;
    longitude: number;
  } | null;
  preserveHomeCenter?: boolean;
};

export default function ArtworkMap({
  artworks,
  homeArea,
  preserveHomeCenter = false,
}: Props) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [-1.54, 53.83],
      zoom: 12,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
      },
      trackUserLocation: true,
      showUserLocation: true,
      showAccuracyCircle: true,
    });

    map.addControl(geolocate, "top-right");

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];

      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !homeArea) {
      return;
    }

    map.jumpTo({
      center: [homeArea.longitude, homeArea.latitude],
      zoom: 12,
    });
  }, [homeArea]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || artworks.length === 0) {
      return;
    }

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

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

      const marker = new maplibregl.Marker({
        color: "var(--yellow)",
      })
        .setLngLat([longitude, latitude])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });

    if (!bounds.isEmpty() && !preserveHomeCenter) {
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
  }, [artworks, preserveHomeCenter]);

  return <div ref={mapContainer} className="real-map" />;
}
