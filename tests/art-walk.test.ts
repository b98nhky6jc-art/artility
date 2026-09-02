import assert from "node:assert/strict";
import test from "node:test";
import {
  addToArtWalkSelection,
  MAX_ART_WALK_STOPS,
  normalizeArtWalkSelection,
  removeFromArtWalkSelection,
} from "../src/artWalkSelection.ts";
import { resolveArtWalkStart } from "../src/artWalkStart.ts";
import {
  requestOpenRouteServiceWalkingRoute,
  RoutingError,
  validateRoutePlanInput,
} from "../worker/routing.ts";

test("route input accepts two and six ordered artwork stops", () => {
  for (const artworkIds of [[10, 11], [1, 2, 3, 4, 5, 6]]) {
    const input = validateRoutePlanInput({
      start: { latitude: 53.8, longitude: -1.5 },
      artwork_ids: artworkIds,
      mode: "walking",
    });

    assert.deepEqual(input.artwork_ids, artworkIds);
  }
});

test("route input rejects duplicate, undersized and oversized stop lists", () => {
  for (const artworkIds of [[1], [1, 1], [1, 2, 3, 4, 5, 6, 7]]) {
    assert.throws(
      () =>
        validateRoutePlanInput({
          start: { latitude: 53.8, longitude: -1.5 },
          artwork_ids: artworkIds,
          mode: "walking",
        }),
      RoutingError,
    );
  }
});

test("Art Walk selection adds, removes, caps and clears predictably", () => {
  let selection: number[] = [];

  for (let id = 1; id <= MAX_ART_WALK_STOPS; id += 1) {
    selection = addToArtWalkSelection(selection, id).selection;
  }

  assert.deepEqual(selection, [1, 2, 3, 4, 5, 6]);
  assert.equal(addToArtWalkSelection(selection, 7).added, false);
  assert.deepEqual(removeFromArtWalkSelection(selection, 3), [1, 2, 4, 5, 6]);
  assert.deepEqual(normalizeArtWalkSelection([]), []);
});

test("Art Walk can start from a searched place without device location", () => {
  const firstArtwork = { latitude: 53.8, longitude: -1.55 };
  const manualPlace = { latitude: 53.795, longitude: -1.759 };

  assert.deepEqual(
    resolveArtWalkStart("place", {
      deviceLocation: null,
      firstArtwork,
      manualPlace,
    }),
    manualPlace,
  );
  assert.deepEqual(
    resolveArtWalkStart("first", {
      deviceLocation: null,
      firstArtwork,
      manualPlace,
    }),
    firstArtwork,
  );
});

test("openrouteservice response is normalized for the frontend", async () => {
  const fetcher = async () =>
    Response.json({
      features: [
        {
          geometry: {
            type: "LineString",
            coordinates: [[-1.5, 53.8], [-1.51, 53.81]],
          },
          properties: { summary: { distance: 1420, duration: 1020 } },
        },
      ],
    });
  const result = await requestOpenRouteServiceWalkingRoute(
    "test-key",
    [[-1.5, 53.8], [-1.51, 53.81]],
    fetcher,
  );

  assert.equal(result.distanceMetres, 1420);
  assert.equal(result.durationSeconds, 1020);
  assert.equal(result.geometry.type, "LineString");
});

test("openrouteservice rate limits fail gracefully", async () => {
  const fetcher = async () =>
    new Response("limited", {
      status: 429,
      headers: { "retry-after": "30" },
    });

  await assert.rejects(
    requestOpenRouteServiceWalkingRoute(
      "test-key",
      [[-1.5, 53.8], [-1.51, 53.81]],
      fetcher,
    ),
    (error: unknown) =>
      error instanceof RoutingError &&
      error.code === "ROUTING_RATE_LIMITED" &&
      error.retryAfter === "30",
  );
});
