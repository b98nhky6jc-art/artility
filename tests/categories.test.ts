import assert from "node:assert/strict";
import test from "node:test";
import {
  artworkBelongsToCategory,
  DISCOVERY_CATEGORIES,
  getDiscoveryCategoryBySlug,
} from "../src/categories.ts";

test("category discovery uses the requested controlled directory and stable slugs", () => {
  assert.deepEqual(DISCOVERY_CATEGORIES, [
    { name: "Utility box / cabinet", slug: "utility-box-cabinet" },
    { name: "Wall / mural", slug: "wall-mural" },
    { name: "Bollard / post", slug: "bollard-post" },
    { name: "Door / shutter", slug: "door-shutter" },
    { name: "Bench / street furniture", slug: "bench-street-furniture" },
    { name: "Tree / natural feature", slug: "tree-natural-feature" },
    { name: "Bridge / underpass", slug: "bridge-underpass" },
    { name: "Sign / panel", slug: "sign-panel" },
    { name: "Sculpture / installation", slug: "sculpture-installation" },
    { name: "Other", slug: "other" },
  ]);
});

test("category slugs resolve and legacy artwork values match canonical categories", () => {
  const utilityBox = getDiscoveryCategoryBySlug("utility-box-cabinet");

  assert.ok(utilityBox);
  assert.equal(artworkBelongsToCategory("street cabinet", utilityBox), true);
  assert.equal(artworkBelongsToCategory("wall", utilityBox), false);
  assert.equal(getDiscoveryCategoryBySlug("invented"), null);
});

test("unknown database category text is displayed under Other", () => {
  const other = getDiscoveryCategoryBySlug("other");

  assert.ok(other);
  assert.equal(artworkBelongsToCategory("bus stop", other), true);
  assert.equal(artworkBelongsToCategory(null, other), true);
});
