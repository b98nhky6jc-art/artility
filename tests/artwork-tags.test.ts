import assert from "node:assert/strict";
import test from "node:test";
import {
  getArtworkTagBySlug,
  MAX_ARTWORK_TAGS,
  normaliseArtworkTag,
  normaliseArtworkTags,
  slugifyDiscoveryValue,
} from "../shared/artwork-tags.ts";

test("artwork tags are user-defined, URL-safe and limited", () => {
  assert.equal(MAX_ARTWORK_TAGS, 5);
  assert.equal(
    getArtworkTagBySlug(["Street art", "Local history"], "street-art"),
    "Street art",
  );
  assert.equal(getArtworkTagBySlug(["Street art"], "botanical"), null);
  assert.equal(slugifyDiscoveryValue("St. John's"), "st-john-s");
});

test("tag input accepts contributor tags and removes equivalent duplicates", () => {
  assert.deepEqual(
    normaliseArtworkTags(["  abstract ", "Abstract", "Local   history"]),
    ["abstract", "Local history"],
  );
  assert.equal(normaliseArtworkTag("#murals"), "murals");
  assert.deepEqual(normaliseArtworkTags(["Contributor chosen"]), ["Contributor chosen"]);
  assert.equal(normaliseArtworkTags(["<script>"]), null);
  assert.equal(normaliseArtworkTags(new Array(6).fill("Abstract")), null);
});
