import assert from "node:assert/strict";
import test from "node:test";
import {
  decideModerationResult,
  moderateImage,
} from "../worker/image-moderation.ts";

const image = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  thumbnailBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  sourceMimeType: "image/jpeg",
  storedMimeType: "image/jpeg" as const,
  width: 1,
  height: 1,
};

function moderationResponse(
  result: {
    flagged: boolean;
    categories: Record<string, boolean>;
    category_scores: Record<string, number>;
  },
) {
  return new Response(JSON.stringify({ results: [result] }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_test",
    },
  });
}

test("a normal image is approved", async () => {
  let receivedBody = "";
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    receivedBody = String(init?.body ?? "");
    return moderationResponse({
      flagged: false,
      categories: { sexual: false, "violence/graphic": false },
      category_scores: { sexual: 0.001, "violence/graphic": 0.002 },
    });
  }) as typeof fetch;

  const decision = await moderateImage("test-key", image, fetcher);

  assert.equal(decision.outcome, "approve");
  assert.equal(decision.requestId, "req_test");
  assert.match(receivedBody, /omni-moderation-latest/);
  assert.match(receivedBody, /data:image\/jpeg;base64/);
});

test("an obvious disallowed image is rejected", async () => {
  const fetcher = (async () =>
    moderationResponse({
      flagged: true,
      categories: { "sexual/minors": true },
      category_scores: { "sexual/minors": 0.98 },
    })) as typeof fetch;

  const decision = await moderateImage("test-key", image, fetcher);

  assert.equal(decision.outcome, "reject");
  assert.match(decision.reason, /sexual\/minors/);
});

test("representative benign street-art results consistently auto-approve", () => {
  const ordinaryArtilityResults = [
    {
      name: "painted utility box",
      categories: { violence: false, harassment: false },
      scores: { violence: 0.42, harassment: 0.07 },
    },
    {
      name: "large wall mural",
      categories: { sexual: false, hate: false },
      scores: { sexual: 0.31, hate: 0.04 },
    },
    {
      name: "painted bollard",
      categories: { "violence/graphic": false },
      scores: { "violence/graphic": 0.12 },
    },
    {
      name: "abstract shutter artwork",
      categories: { harassment: false, violence: false },
      scores: { harassment: 0.38, violence: 0.21 },
    },
    {
      name: "street sculpture",
      categories: { illicit: false, sexual: false },
      scores: { illicit: 0.16, sexual: 0.08 },
    },
  ];

  for (const fixture of ordinaryArtilityResults) {
    const decision = decideModerationResult({
      flagged: false,
      categories: fixture.categories,
      category_scores: fixture.scores,
    });

    assert.equal(decision.outcome, "approve", fixture.name);
  }
});

test("a genuinely flagged borderline result is held for manual review", () => {
  const decision = decideModerationResult({
    flagged: true,
    categories: { violence: true, "violence/graphic": false },
    category_scores: { violence: 0.72, "violence/graphic": 0.18 },
  });

  assert.equal(decision.outcome, "manual_review");
  assert.equal(decision.error, null);
});

test("severe high-confidence categories auto-reject", () => {
  for (const result of [
    {
      categories: { "sexual/minors": true },
      category_scores: { "sexual/minors": 0.99 },
    },
    {
      categories: { "violence/graphic": true },
      category_scores: { "violence/graphic": 0.98 },
    },
    {
      categories: { "hate/threatening": true },
      category_scores: { "hate/threatening": 0.97 },
    },
  ]) {
    const decision = decideModerationResult({ flagged: true, ...result });

    assert.equal(decision.outcome, "reject");
  }
});

test("provider failure retries and remains non-public/manual review", async () => {
  let attempts = 0;
  const fetcher = (async () => {
    attempts += 1;
    throw new Error("provider unavailable");
  }) as typeof fetch;

  const decision = await moderateImage("test-key", image, fetcher);

  assert.equal(attempts, 2);
  assert.equal(decision.outcome, "manual_review");
  assert.match(decision.error ?? "", /provider unavailable/);
});

test("a missing secret fails closed", async () => {
  const decision = await moderateImage(undefined, image);

  assert.equal(decision.outcome, "manual_review");
  assert.match(decision.error ?? "", /OPENAI_API_KEY/);
});
