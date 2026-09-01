import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("secondary buttons use readable text and borders on light surfaces", async () => {
  const css = await readFile(new URL("../src/App.css", import.meta.url), "utf8");
  const rule = [...css.matchAll(/\.secondary-button\s*\{([^}]*)\}/g)]
    .map((match) => match[1])
    .find((body) => body.includes("background: transparent")) ?? "";

  assert.match(rule, /color:\s*var\(--ink\)/);
  assert.match(rule, /border:\s*1px solid var\(--line\)/);
  assert.doesNotMatch(rule, /var\(--on-dark\)/);
});
