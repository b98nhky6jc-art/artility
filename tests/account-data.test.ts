import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  ACCOUNT_DELETION_POLICY,
  confirmsAccountDeletion,
} from "../shared/account-data.ts";

test("account deletion requires the exact deliberate confirmation", () => {
  assert.equal(ACCOUNT_DELETION_CONFIRMATION, "DELETE");
  assert.equal(confirmsAccountDeletion("DELETE"), true);
  assert.equal(confirmsAccountDeletion("delete"), false);
  assert.ok(ACCOUNT_DELETION_POLICY.retainedAnonymously.includes("published artwork contributions"));
});

test("account APIs authenticate exports and anonymise retained public history", async () => {
  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");

  assert.match(worker, /url\.pathname === "\/api\/account\/export"/);
  assert.match(worker, /url\.pathname === "\/api\/account" && request\.method === "DELETE"/);
  assert.match(worker, /auth\.api\.getSession/);
  assert.match(worker, /UPDATE artworks SET added_by = NULL/);
  assert.match(worker, /UPDATE artwork_revisions SET edited_by = 'deleted-account'/);
  assert.match(worker, /DELETE FROM checkins WHERE user_id/);
  assert.ok(worker.includes('DELETE FROM \\"user\\" WHERE id'));
});

test("privacy copy and My Finds expose export and deletion behaviour", async () => {
  const [profile, privacy] = await Promise.all([
    readFile(new URL("../src/MyFinds.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/Privacy.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(profile, /Download my data/);
  assert.match(profile, /Permanently delete account/);
  assert.match(privacy, /machine-readable account export/);
  assert.match(privacy, /retained without their link to your account/);
});
