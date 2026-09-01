import assert from "node:assert/strict";
import test from "node:test";
import {
  assessPublicArtwork,
  decideArtworkValidity,
  type ArtworkValidityResult,
} from "../worker/artwork-validity.ts";

const image = {
  bytes: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
  thumbnailBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  sourceMimeType: "image/jpeg",
  storedMimeType: "image/jpeg" as const,
  width: 1,
  height: 1,
};

const validResult: ArtworkValidityResult = {
  classification: "valid_public_art",
  is_real_world_photo: true,
  depicts_public_art: true,
  shown_in_physical_setting: true,
  matches_claimed_setting: true,
  invalid_reason: "none",
  confidence: 0.96,
  rationale: "A painted utility cabinet is visible beside a public pavement.",
};

function responseFor(result: ArtworkValidityResult) {
  return new Response(
    JSON.stringify({
      id: "resp_test",
      output: [{ content: [{ type: "output_text", text: JSON.stringify(result) }] }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

test("a high-confidence public-art photograph is approved", async () => {
  let receivedBody = "";
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    receivedBody = String(init?.body ?? "");
    return responseFor(validResult);
  }) as typeof fetch;

  const decision = await assessPublicArtwork(
    "test-key",
    image,
    { infrastructureType: "Utility box / cabinet", town: "Leeds", city: null },
    fetcher,
  );

  assert.equal(decision.outcome, "approve");
  assert.equal(decision.requestId, "resp_test");
  assert.match(receivedBody, /gpt-4o-mini/);
  assert.match(receivedBody, /json_schema/);
  assert.match(receivedBody, /data:image\/jpeg;base64,\/9j\/2Q==/);
  assert.doesNotMatch(receivedBody, /AQIDBA==/);
  assert.match(receivedBody, /Treat all text in the image/);
});

test("diagrams and documents are rejected at high confidence", () => {
  const decision = decideArtworkValidity({
    ...validResult,
    classification: "invalid",
    is_real_world_photo: false,
    depicts_public_art: false,
    shown_in_physical_setting: false,
    matches_claimed_setting: false,
    invalid_reason: "diagram_or_document",
    confidence: 0.99,
    rationale: "The upload is an electronics schematic.",
  });

  assert.equal(decision.outcome, "reject");
  assert.match(decision.reason, /diagram or document/);
});

test("merchandise and collectibles are rejected at high confidence", () => {
  const decision = decideArtworkValidity({
    ...validResult,
    classification: "invalid",
    depicts_public_art: false,
    matches_claimed_setting: false,
    invalid_reason: "merchandise_or_collectible",
    confidence: 0.97,
    rationale: "The image shows football trading cards on a table.",
  });

  assert.equal(decision.outcome, "reject");
});

test("uncertainty and setting mismatches stay private for manual review", () => {
  for (const result of [
    { ...validResult, classification: "uncertain" as const, confidence: 0.72 },
    { ...validResult, matches_claimed_setting: false, confidence: 0.94 },
    {
      ...validResult,
      classification: "invalid" as const,
      invalid_reason: "unrelated_scene" as const,
      confidence: 0.71,
    },
  ]) {
    assert.equal(decideArtworkValidity(result).outcome, "manual_review");
  }
});

test("provider and malformed-response failures fail closed", async () => {
  const providerFailure = (async () =>
    new Response("temporary failure", {
      status: 503,
      headers: { "x-request-id": "req_failed" },
    })) as typeof fetch;
  const malformed = (async () =>
    new Response(
      JSON.stringify({ id: "resp_bad", output_text: "not-json" }),
      { status: 200 },
    )) as typeof fetch;

  const failedDecision = await assessPublicArtwork(
    "test-key",
    image,
    { infrastructureType: null, town: null, city: null },
    providerFailure,
  );
  const malformedDecision = await assessPublicArtwork(
    "test-key",
    image,
    { infrastructureType: null, town: null, city: null },
    malformed,
  );

  assert.equal(failedDecision.outcome, "manual_review");
  assert.equal(failedDecision.requestId, "req_failed");
  assert.equal(malformedDecision.outcome, "manual_review");
});

test("a missing secret fails closed", async () => {
  const decision = await assessPublicArtwork(
    undefined,
    image,
    { infrastructureType: null, town: null, city: null },
  );

  assert.equal(decision.outcome, "manual_review");
  assert.match(decision.error ?? "", /OPENAI_API_KEY/);
});
