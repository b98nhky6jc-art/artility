import assert from "node:assert/strict";
import test from "node:test";
import {
  formatInfrastructureType,
  INFRASTRUCTURE_TYPES,
  normaliseInfrastructureType,
} from "../shared/infrastructure-types.ts";

test("the public-art category list is controlled and complete", () => {
  assert.deepEqual(INFRASTRUCTURE_TYPES, [
    "Utility box / cabinet",
    "Wall / mural",
    "Bollard / post",
    "Door / shutter",
    "Bench / street furniture",
    "Little library",
    "Tree / natural feature",
    "Bridge / underpass",
    "Sign / panel",
    "Sculpture / installation",
    "Other",
  ]);
});

test("legacy infrastructure values map to the new categories", () => {
  assert.equal(
    normaliseInfrastructureType("utility cabinet"),
    "Utility box / cabinet",
  );
  assert.equal(
    normaliseInfrastructureType("street cabinet"),
    "Utility box / cabinet",
  );
  assert.equal(
    normaliseInfrastructureType("telecom cabinet"),
    "Utility box / cabinet",
  );
  assert.equal(normaliseInfrastructureType("bollard"), "Bollard / post");
  assert.equal(normaliseInfrastructureType("little library"), "Little library");
  assert.equal(normaliseInfrastructureType("other"), "Other");
});

test("canonical values are case-insensitive and unknown values are rejected", () => {
  assert.equal(
    normaliseInfrastructureType("  WALL / MURAL "),
    "Wall / mural",
  );
  assert.equal(
    normaliseInfrastructureType("  LITTLE LIBRARY  "),
    "Little library",
  );
  assert.equal(normaliseInfrastructureType("bus stop"), null);
  assert.equal(formatInfrastructureType("bus stop"), "Other");
});
