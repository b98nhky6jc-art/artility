import assert from "node:assert/strict";
import test from "node:test";
import { getDistanceInMetres } from "../src/artworkDiscovery.ts";
import { getArtworkDisplayTitle } from "../src/artworkDisplay.ts";
import { getArtworkLocality } from "../shared/artwork-location.ts";
import {
  refreshArtworkLocationMetadata,
  reverseGeocodeArtworkLocation,
} from "../worker/location-metadata.ts";

function geocoderResponse(address: Record<string, string>) {
  return async () =>
    new Response(JSON.stringify({ address }), {
      headers: { "content-type": "application/json" },
    });
}

test("an artwork in Leeds displays Leeds", () => {
  const label = getArtworkDisplayTitle({
    title: null,
    infrastructure_type: "Utility box / cabinet",
    town: "Leeds",
    city: "Leeds",
  });

  assert.equal(label, "Utility box / cabinet in Leeds");
});

test("an artwork outside Leeds does not inherit Leeds", async () => {
  const metadata = await reverseGeocodeArtworkLocation(52.6369, -1.1398, {
    fetcher: geocoderResponse({ city: "Leicester" }),
  });

  assert.deepEqual(metadata, { town: null, city: "Leicester" });
  assert.equal(getArtworkLocality(metadata), "Leicester");
  assert.equal(
    getArtworkDisplayTitle({
      title: null,
      infrastructure_type: "Utility box / cabinet",
      ...metadata,
    }),
    "Utility box / cabinet in Leicester",
  );
});

test("metadata cleanup preserves correct coordinates while refreshing locality", async () => {
  const original = {
    latitude: 53.8008,
    longitude: -1.5491,
    town: "Leeds",
    city: "Leeds",
  };
  const coordinates = { latitude: 52.6369, longitude: -1.1398 };
  const metadata = await reverseGeocodeArtworkLocation(
    coordinates.latitude,
    coordinates.longitude,
    { fetcher: geocoderResponse({ city: "Leicester" }) },
  );
  const refreshed = refreshArtworkLocationMetadata(
    { ...original, ...coordinates },
    metadata,
  );

  assert.deepEqual(
    { latitude: refreshed.latitude, longitude: refreshed.longitude },
    coordinates,
  );
  assert.deepEqual(
    { town: refreshed.town, city: refreshed.city },
    { town: null, city: "Leicester" },
  );
});

test("a failed reverse lookup clears stale place metadata instead of inserting Leeds", async () => {
  const metadata = await reverseGeocodeArtworkLocation(52.6369, -1.1398, {
    fetcher: async () => new Response("Unavailable", { status: 503 }),
  });

  assert.deepEqual(metadata, { town: null, city: null });
});

test("distance and 100 m check-in eligibility continue to use coordinates", () => {
  const distance = getDistanceInMetres(
    { latitude: 53.8008, longitude: -1.5491 },
    { id: 1, latitude: 53.80125, longitude: -1.5491 },
  );

  assert.ok(distance !== null);
  assert.ok(distance < 100);
});
