import assert from "node:assert/strict";
import test from "node:test";
import {
  ARTWORK_PAGE_SIZE,
  sortArtworks,
  type SortableArtwork,
} from "../src/artworkDiscovery.ts";

const artworks: SortableArtwork[] = [
  {
    id: 1,
    latitude: 53.8,
    longitude: -1.55,
    created_at: "2026-08-20T10:00:00Z",
    artist_name: "Banksy",
  },
  {
    id: 2,
    latitude: 53.81,
    longitude: -1.55,
    created_at: "2026-08-24T10:00:00Z",
    artist_name: null,
  },
  {
    id: 3,
    latitude: 53.82,
    longitude: -1.55,
    created_at: "2026-08-22T10:00:00Z",
    artist_name: "Zabou",
  },
];

test("artwork discovery page size remains nine", () => {
  assert.equal(ARTWORK_PAGE_SIZE, 9);
});

test("distance sorting supports closest and furthest", () => {
  const location = { latitude: 53.8001, longitude: -1.55 };

  assert.deepEqual(
    sortArtworks(artworks, location, "closest").sortedArtworks.map(
      (artwork) => artwork.id,
    ),
    [1, 2, 3],
  );
  assert.deepEqual(
    sortArtworks(artworks, location, "furthest").sortedArtworks.map(
      (artwork) => artwork.id,
    ),
    [3, 2, 1],
  );
});

test("distance sorting falls back to newest without geolocation", () => {
  assert.deepEqual(
    sortArtworks(artworks, null, "closest").sortedArtworks.map(
      (artwork) => artwork.id,
    ),
    [2, 3, 1],
  );
});

test("newest and oldest use artwork creation time", () => {
  assert.deepEqual(
    sortArtworks(artworks, null, "newest").sortedArtworks.map(
      (artwork) => artwork.id,
    ),
    [2, 3, 1],
  );
  assert.deepEqual(
    sortArtworks(artworks, null, "oldest").sortedArtworks.map(
      (artwork) => artwork.id,
    ),
    [1, 3, 2],
  );
});

test("unknown artists stay after named artists in both directions", () => {
  assert.deepEqual(
    sortArtworks(artworks, null, "artist-az").sortedArtworks.map(
      (artwork) => artwork.id,
    ),
    [1, 3, 2],
  );
  assert.deepEqual(
    sortArtworks(artworks, null, "artist-za").sortedArtworks.map(
      (artwork) => artwork.id,
    ),
    [3, 1, 2],
  );
});
