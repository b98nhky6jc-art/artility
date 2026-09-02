import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  describeGeolocationError,
  getCurrentPositionWithRetry,
  getLocationEnablementGuidance,
  getLocationRecoveryGuidance,
  isTransientGeolocationError,
  isValidLocation,
  requestApproximateLocation,
} from "../src/location.ts";
import { approximateLocationFromRequestMetadata } from "../worker/approximate-location.ts";
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

test("transient location failures retry once with a fresh accurate reading", async () => {
  const attempts: PositionOptions[] = [];
  const expectedPosition = {
    coords: { latitude: 53.8, longitude: -1.55 },
  } as GeolocationPosition;
  const geolocation = {
    getCurrentPosition(
      success: PositionCallback,
      failure: PositionErrorCallback,
      options?: PositionOptions,
    ) {
      attempts.push(options ?? {});

      if (attempts.length === 1) {
        failure({ code: 2 } as GeolocationPositionError);
        return;
      }

      success(expectedPosition);
    },
  };

  const position = await getCurrentPositionWithRetry(
    geolocation,
    { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
  );

  assert.equal(position, expectedPosition);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[1]?.enableHighAccuracy, true);
  assert.equal(attempts[1]?.maximumAge, 0);
});

test("a desktop location timeout also receives the longer retry", async () => {
  let attempts = 0;
  const expectedPosition = {
    coords: { latitude: 53.8, longitude: -1.55 },
  } as GeolocationPosition;
  const geolocation = {
    getCurrentPosition(
      success: PositionCallback,
      failure: PositionErrorCallback,
    ) {
      attempts += 1;

      if (attempts === 1) {
        failure({ code: 3 } as GeolocationPositionError);
        return;
      }

      success(expectedPosition);
    },
  };

  const position = await getCurrentPositionWithRetry(
    geolocation,
    { timeout: 10_000 },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
  );

  assert.equal(position, expectedPosition);
  assert.equal(attempts, 2);
});

test("permission denial is not retried", async () => {
  let attempts = 0;
  const geolocation = {
    getCurrentPosition(
      _success: PositionCallback,
      failure: PositionErrorCallback,
    ) {
      attempts += 1;
      failure({ code: 1 } as GeolocationPositionError);
    },
  };

  await assert.rejects(
    getCurrentPositionWithRetry(geolocation, {}, { enableHighAccuracy: true }),
  );
  assert.equal(attempts, 1);
});

test("only unavailable and timed-out readings permit an approximate fallback", () => {
  assert.equal(isTransientGeolocationError({ code: 2 }), true);
  assert.equal(isTransientGeolocationError({ code: 3 }), true);
  assert.equal(isTransientGeolocationError({ code: 1 }), false);
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

test("position recovery guidance points desktop browsers to device settings", () => {
  assert.match(
    getLocationRecoveryGuidance("Mozilla Macintosh Mac OS X Safari"),
    /System Settings.*Location Services/,
  );
  assert.match(
    getLocationRecoveryGuidance("Mozilla Windows Chrome/140"),
    /Windows Settings.*Location/,
  );
});

test("request metadata provides a labelled approximate fallback", () => {
  assert.deepEqual(
    approximateLocationFromRequestMetadata({
      latitude: "53.7974",
      longitude: "-1.5438",
      city: "Leeds",
      region: "England",
    }),
    { latitude: 53.7974, longitude: -1.5438, name: "Leeds" },
  );
  assert.equal(
    approximateLocationFromRequestMetadata({
      latitude: "",
      longitude: "-1.5438",
      city: "Leeds",
    }),
    null,
  );
});

test("the browser accepts only a valid approximate location response", async () => {
  const location = await requestApproximateLocation(async () =>
    Response.json({
      location: {
        latitude: 53.7974,
        longitude: -1.5438,
        name: "Leeds",
      },
    }),
  );

  assert.deepEqual(location, {
    latitude: 53.7974,
    longitude: -1.5438,
    name: "Leeds",
  });

  const invalid = await requestApproximateLocation(async () =>
    Response.json({
      location: { latitude: 200, longitude: -1.5438, name: "Leeds" },
    }),
  );
  assert.equal(invalid, null);
});

test("the privacy policy explains the limited approximate fallback", async () => {
  const privacy = await readFile(
    new URL("../src/Privacy.tsx", import.meta.url),
    "utf8",
  );

  assert.match(privacy, /city-level location inferred from your network connection/);
  assert.match(privacy, /does not use it for check-ins or placing artwork/);
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
