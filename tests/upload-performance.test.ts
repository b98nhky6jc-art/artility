import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { bytesToMegabytes } from "../shared/upload-performance.ts";

test("upload diagnostics cover the client and server pipeline", async () => {
  const client = await readFile(
    new URL("../src/AddArtwork.tsx", import.meta.url),
    "utf8",
  );
  const worker = await readFile(
    new URL("../worker/index.ts", import.meta.url),
    "utf8",
  );
  const imageProcessing = await readFile(
    new URL("../worker/image-processing.ts", import.meta.url),
    "utf8",
  );

  for (const stage of [
    "File selection and initial processing",
    "EXIF and metadata extraction",
    "image decoding",
    "image resizing",
    "JPEG compression",
    "Artwork API and multipart upload",
    "Final refresh/navigation",
    "Total artwork submission",
  ]) {
    assert.match(client, new RegExp(stage));
  }

  for (const stage of [
    "Individual image R2 upload",
    "Artwork API/database creation",
    "Photo record creation",
    "Automatic check-in creation",
  ]) {
    assert.match(worker, new RegExp(stage));
  }

  assert.match(imageProcessing, /Server image decode/);
  assert.match(imageProcessing, /Server image resize/);
  assert.match(imageProcessing, /Server JPEG compression/);
  assert.match(client, /originalFilename/);
  assert.match(client, /originalDimensions/);
  assert.match(client, /resultingDimensions/);
  assert.match(client, /compressionProcessingDurationMs/);
  assert.match(client, /batchUploadAndApiDurationMs/);
});

test("upload diagnostics are development-only", async () => {
  const helper = await readFile(
    new URL("../shared/upload-performance.ts", import.meta.url),
    "utf8",
  );

  assert.match(helper, /import\.meta\.env\?\.DEV === true/);
  assert.equal(bytesToMegabytes(1024 * 1024), 1);
});

test("the upload UI locks synchronously and reports honest stages", async () => {
  const client = await readFile(
    new URL("../src/AddArtwork.tsx", import.meta.url),
    "utf8",
  );
  const submitStart = client.indexOf("async function handleSubmit");
  const lockClaim = client.indexOf(
    "submissionInFlightRef.current = true",
    submitStart,
  );
  const firstPreparation = client.indexOf(
    "await preparePhotosForUpload",
    submitStart,
  );

  assert.ok(submitStart >= 0);
  assert.ok(lockClaim > submitStart);
  assert.ok(firstPreparation > lockClaim);
  assert.match(client, /if \(submissionInFlightRef\.current\)/);
  assert.match(client, /disabled=\{saving\}/);
  assert.match(client, /aria-busy=\{saving\}/);
  assert.match(client, /aria-live="polite"/);
  assert.match(client, /Preparing photos…/);
  assert.match(client, /Uploading \$\{preparedPhotos\.length\}/);
  assert.match(client, /Finalising submission…/);
  assert.match(client, /setUploadStatus\("Done"\)/);
  assert.match(
    client,
    /Not individually available because all photos share one multipart request/,
  );
  assert.doesNotMatch(client, /uploadProgressPercent|Uploading \d+%/);
});

test("diagnostics preserve the existing image and upload behaviour", async () => {
  const client = await readFile(
    new URL("../src/AddArtwork.tsx", import.meta.url),
    "utf8",
  );
  const worker = await readFile(
    new URL("../worker/index.ts", import.meta.url),
    "utf8",
  );
  const imageProcessing = await readFile(
    new URL("../worker/image-processing.ts", import.meta.url),
    "utf8",
  );

  assert.match(client, /const MAX_DIMENSION = 2200/);
  assert.match(client, /const JPEG_QUALITY = 0\.88/);
  assert.match(client, /const MAX_DIMENSION = 800/);
  assert.match(client, /const JPEG_QUALITY = 0\.78/);
  assert.match(client, /formData\.append\("photos"/);
  assert.match(client, /formData\.append\("thumbnails"/);
  assert.match(imageProcessing, /published\.get_bytes_jpeg\(88\)/);
  assert.match(imageProcessing, /thumbnail\.get_bytes_jpeg\(78\)/);
  assert.match(worker, /Promise\.all\(\s*photos\.map\(\(photo\) => prepareImageUpload\(photo\)\)/);
  assert.match(worker, /for \(let index = 0; index < photos\.length; index\+\+\)/);
});
