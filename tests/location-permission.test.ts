import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  describeGeolocationError,
  getLocationEnablementGuidance,
  isValidLocation,
} from "../src/location.ts";
import {
  parsePlaceSearchResults,
  searchPlaces,
} from "../worker/place-search.ts";

test("geolocation failures have distinct, friendly messages", () => {
  assert.deepEqual(describeGeolocationError({ code: 1 }), {
    code: "permission-denied",
    message: "Location access is turned off for Artility.",
  });
  assert.equal(describeGeolocationError({ code: 2 }).code, "position-unavailable");
  assert.match(describeGeolocationError({ code: 3 }).message, /took too long/i);
});

test("coordinates are validated independently from permission", () => {
  assert.equal(isValidLocation({ latitude: 53.8, longitude: -1.55 }), true);
  assert.equal(isValidLocation({ latitude: 91, longitude: -1.55 }), false);
  assert.equal(isValidLocation({ latitude: 53.8, longitude: Number.NaN }), false);
});

test("enablement guidance covers Apple mobile, Safari and Chromium", () => {
  assert.match(getLocationEnablementGuidance("Mozilla iPhone Safari"), /Settings/);
  assert.match(getLocationEnablementGuidance("Mozilla Mac OS Safari"), /Safari/);
  assert.match(getLocationEnablementGuidance("Mozilla Chrome/140"), /address bar/);
});

test("place results discard invalid coordinates", () => {
  const places = parsePlaceSearchResults([
    {
      place_id: 42,
      display_name: "Leeds, West Yorkshire, England",
      lat: "53.7974",
      lon: "-1.5438",
    },
    {
      place_id: 43,
      display_name: "Impossible place",
      lat: "200",
      lon: "0",
    },
  ]);

  assert.deepEqual(places, [
    {
      id: "42",
      name: "Leeds, West Yorkshire, England",
      latitude: 53.7974,
      longitude: -1.5438,
    },
  ]);
});

test("place search normalises the query and limits results at the provider", async () => {
  let requestedUrl = "";
  const fetcher: typeof fetch = async (input) => {
    requestedUrl = input.toString();
    return Response.json([]);
  };

  const places = await searchPlaces("  Leeds   station  ", {
    endpoint: "https://example.test/search",
    fetcher,
  });

  const url = new URL(requestedUrl);
  assert.deepEqual(places, []);
  assert.equal(url.searchParams.get("q"), "Leeds station");
  assert.equal(url.searchParams.get("limit"), "5");
});

test("upload review renders location validation errors", async () => {
  const source = await readFile(
    new URL("../src/AddArtwork.tsx", import.meta.url),
    "utf8",
  );
  const reviewStage = source.split(
    'canContribute && stage === "review"',
  )[1] ?? "";

  assert.match(
    reviewStage,
    /error && \(\s*<p className="form-error" role="alert">\s*\{error\}/,
  );
});
