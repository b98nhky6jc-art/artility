import assert from "node:assert/strict";
import test from "node:test";
import {
  ARTWORK_TAGS,
  getArtworkTagBySlug,
  MAX_ARTWORK_TAGS,
  normaliseArtworkTags,
  slugifyDiscoveryValue,
} from "../shared/artwork-tags.ts";

test("artwork tags are controlled, stable and limited", () => {
  assert.equal(ARTWORK_TAGS.length, 9);
  assert.equal(MAX_ARTWORK_TAGS, 5);
  assert.equal(getArtworkTagBySlug("street-art"), null);
  assert.equal(getArtworkTagBySlug("botanical"), "Botanical");
  assert.equal(slugifyDiscoveryValue("St. John's"), "st-john-s");
});

test("tag input rejects arbitrary values and removes duplicates", () => {
  assert.deepEqual(normaliseArtworkTags(["abstract", "Abstract", "Portrait"]), [
    "Abstract",
    "Portrait",
  ]);
  assert.equal(normaliseArtworkTags(["Unmoderated tag"]), null);
  assert.equal(normaliseArtworkTags(new Array(6).fill("Abstract")), null);
});
