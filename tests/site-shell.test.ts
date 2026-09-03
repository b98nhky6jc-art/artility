import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("footer links to the Artility WhatsApp community safely", async () => {
  const footer = await readFile(
    new URL("../src/SiteFooter.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    footer,
    /https:\/\/chat\.whatsapp\.com\/GA0tCNKFqsRKjSaNgodPVw/,
  );
  assert.match(footer, /Help shape Artility on WhatsApp/);
  assert.match(footer, /target="_blank"/);
  assert.match(footer, /rel="noopener noreferrer"/);
});

test("homepage leads with the community message and WhatsApp invitation", async () => {
  const homepage = await readFile(
    new URL("../src/App.tsx", import.meta.url),
    "utf8",
  );

  assert.match(homepage, /Find local art\./);
  assert.match(homepage, /Explore your neighbourhood\./);
  assert.match(homepage, /Take the long way home\./);
  assert.match(homepage, /Help shape Artility in our WhatsApp community/);
  assert.match(
    homepage,
    /https:\/\/chat\.whatsapp\.com\/GA0tCNKFqsRKjSaNgodPVw/,
  );
  assert.match(homepage, /target="_blank"/);
  assert.match(homepage, /rel="noopener noreferrer"/);
});

test("PWA manifest uses the cache-busted Artility maskable icon", async () => {
  const viteConfig = await readFile(
    new URL("../vite.config.ts", import.meta.url),
    "utf8",
  );

  assert.match(viteConfig, /artility-maskable-512-v2\.png\?v=3/);
  assert.doesNotMatch(viteConfig, /src: "\/maskable-icon-512x512\.png"/);
});

test("browser icon fallbacks all use the current Artility mark", async () => {
  const [document, favicon] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/favicon.svg", import.meta.url), "utf8"),
  ]);

  assert.match(document, /artility-favicon-v3\.svg/);
  assert.match(document, /favicon\.ico\?v=3/);
  assert.match(document, /apple-touch-icon\.png\?v=3/);
  assert.match(favicon, /#F37D59/);
  assert.match(favicon, /#68C7C1/);
  assert.doesNotMatch(favicon, /#863bff/i);
});
