import assert from "node:assert/strict";
import test from "node:test";
import {
  isUnknownArtistName,
  isValidInstagramHandle,
  normaliseArtistName,
  normaliseArtistNameKey,
  normaliseInstagramHandle,
} from "../shared/artist-identity.ts";

test("artist names compare case-insensitively with normalized whitespace", () => {
  assert.equal(normaliseArtistName("  Smoke   and\tDrips  "), "Smoke and Drips");
  assert.equal(
    normaliseArtistNameKey("  SMOKE   AND drips "),
    normaliseArtistNameKey("Smoke and Drips"),
  );
});

test("Instagram handles trim, lose leading @, and compare case-insensitively", () => {
  assert.equal(normaliseInstagramHandle("  @Me.LLYY_  "), "me.llyy_");
  assert.equal(
    normaliseInstagramHandle("@ARTILITY"),
    normaliseInstagramHandle("artility"),
  );
  assert.equal(isValidInstagramHandle("valid.handle_1"), true);
  assert.equal(isValidInstagramHandle("not valid"), false);
});

test("unknown artist labels resolve to unattributed artwork", () => {
  assert.equal(isUnknownArtistName("Artist unknown"), true);
  assert.equal(isUnknownArtistName("  UNKNOWN   ARTIST "), true);
  assert.equal(isUnknownArtistName("An Unknown Artist"), false);
});

test("case-only and spacing-only identity variants share one key", () => {
  const variants = ["Nikki Pinder", "nikki pinder", " Nikki   Pinder "];
  const keys = new Set(variants.map(normaliseArtistNameKey));

  assert.equal(keys.size, 1);
});
