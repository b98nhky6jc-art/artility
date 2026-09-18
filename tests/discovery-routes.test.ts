import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("map popup titles link to canonical artwork pages", async () => {
  const map = await readFile(new URL("../src/ArtworkMap.tsx", import.meta.url), "utf8");

  assert.match(map, /document\.createElement\("a"\)/);
  assert.match(map, /popupTitle\.href = `\/artwork\/\$\{artwork\.id\}`/);
  assert.match(map, /View \$\{getArtworkDisplayTitle\(artwork\)\} artwork details/);
});

test("search, tag and place discovery are represented in navigable URLs", async () => {
  const [app, routes] = await Promise.all([
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/main.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(app, /get\("q"\)/);
  assert.match(app, /Filter artwork by tag/);
  assert.match(routes, /path="\/places\/:placeSlug"/);
  assert.match(routes, /path="\/tags\/:tagSlug"/);
});
