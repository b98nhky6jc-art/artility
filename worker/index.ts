import {
  continueEmailNotificationDelivery,
  createAuth,
  queueArtworkStatusReportAlert,
  queueImageModerationReviewAlert,
} from "./auth.js";
import {
  ImageUploadError,
  prepareImageUpload,
  type PreparedImage,
} from "./image-processing.js";
import {
  moderateImage,
  type ImageModerationDecision,
} from "./image-moderation.js";
import { normaliseInfrastructureType } from "../shared/infrastructure-types.js";
import {
  isUnknownArtistName,
  isValidInstagramHandle,
  normaliseArtistName,
  normaliseArtistNameKey,
  normaliseInstagramHandle,
} from "../shared/artist-identity.js";
import {
  requestOpenRouteServiceWalkingRoute,
  RoutingError,
  validateRoutePlanInput,
} from "./routing.js";

type ArtilityEnv = Env & {
  OPENROUTESERVICE_API_KEY?: string;
};

const MAX_PHOTOS_PER_ARTWORK = 3;
const MAX_AUTOMATED_MODERATION_ATTEMPTS = 3;
const MODERATION_RETRY_BATCH_SIZE = 5;
const MAX_STATUS_REPORT_NOTE_LENGTH = 1000;
const STATUS_REPORT_TYPES = new Set([
  "no_longer_there",
  "changed_replaced",
  "damaged",
  "defaced",
]);
const EMAIL_VERIFICATION_CUTOFF = Date.parse(
  "2026-08-24T22:10:00.000Z",
);
type ArtworkPhotoModerationState =
  | "pending"
  | "approved"
  | "rejected"
  | "manual_review";

function storedModerationState(
  outcome: ImageModerationDecision["outcome"],
): ArtworkPhotoModerationState {
  if (outcome === "reject") {
    return "rejected";
  }

  if (outcome === "manual_review") {
    return "manual_review";
  }

  // Approved photos are published in a separate fail-closed step. Retryable
  // provider failures remain quarantined as pending in the meantime.
  return "pending";
}

type ResolvedArtist = {
  id: number;
  name: string;
  instagram_handle: string | null;
};

class ArtistIdentityError extends Error {}

async function resolveArtworkArtist(
  env: Env,
  rawName: unknown,
  rawInstagramHandle: unknown,
): Promise<ResolvedArtist | null> {
  const artistName = normaliseArtistName(rawName);
  const instagramHandle = normaliseInstagramHandle(rawInstagramHandle);

  if (isUnknownArtistName(artistName)) {
    return null;
  }

  if (!isValidInstagramHandle(instagramHandle)) {
    throw new ArtistIdentityError("Instagram handle is not valid");
  }

  const normalizedName = normaliseArtistNameKey(artistName);

  if (!normalizedName && !instagramHandle) {
    return null;
  }

  const existingArtist = await env.DB.prepare(`
    SELECT id, name, instagram_handle
    FROM artists
    WHERE (? IS NOT NULL AND normalized_instagram_handle = ?)
       OR (? IS NOT NULL AND normalized_name = ?)
    ORDER BY
      CASE WHEN normalized_instagram_handle = ? THEN 0 ELSE 1 END,
      id ASC
    LIMIT 1
  `)
    .bind(
      instagramHandle,
      instagramHandle,
      normalizedName,
      normalizedName,
      instagramHandle,
    )
    .first<ResolvedArtist>();

  if (existingArtist) {
    if (!existingArtist.instagram_handle && instagramHandle) {
      await env.DB.prepare(`
        UPDATE artists
        SET instagram_handle = ?,
            normalized_instagram_handle = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
        .bind(instagramHandle, instagramHandle, existingArtist.id)
        .run();

      return { ...existingArtist, instagram_handle: instagramHandle };
    }

    // The canonical record owns its preferred display casing.
    return existingArtist;
  }

  const displayName = artistName ?? `@${instagramHandle}`;
  const insert = await env.DB.prepare(`
    INSERT INTO artists (
      name,
      normalized_name,
      instagram_handle,
      normalized_instagram_handle
    )
    VALUES (?, ?, ?, ?)
  `)
    .bind(
      displayName,
      normaliseArtistNameKey(displayName),
      instagramHandle,
      instagramHandle,
    )
    .run();

  return {
    id: Number(insert.meta.last_row_id),
    name: displayName,
    instagram_handle: instagramHandle,
  };
}

async function enforceImageUploadRateLimit(
  env: Env,
  userId: string,
  requestedCount: number,
) {
  const usage = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(CASE
        WHEN created_at >= datetime('now', '-1 hour') THEN image_count
        ELSE 0
      END), 0) AS hour_count,
      COALESCE(SUM(image_count), 0) AS day_count
    FROM image_upload_events
    WHERE user_id = ?
      AND created_at >= datetime('now', '-1 day')
  `)
    .bind(userId)
    .first<{ hour_count: number; day_count: number }>();
  const hourCount = Number(usage?.hour_count ?? 0);
  const dayCount = Number(usage?.day_count ?? 0);

  if (hourCount + requestedCount > 12 || dayCount + requestedCount > 30) {
    throw new ImageUploadError(
      "Upload limit reached. Please wait before adding more images.",
      429,
    );
  }

  await env.DB.prepare(`
    INSERT INTO image_upload_events (user_id, image_count)
    VALUES (?, ?)
  `)
    .bind(userId, requestedCount)
    .run();
}

async function ensureApprovedPrimaryPhoto(env: Env, artworkId: number) {
  const primary = await env.DB.prepare(`
    SELECT id
    FROM photos
    WHERE artwork_id = ?
      AND moderation_state = 'approved'
      AND is_primary = 1
    LIMIT 1
  `)
    .bind(artworkId)
    .first();

  if (primary) {
    return;
  }

  const fallback = await env.DB.prepare(`
    SELECT id
    FROM photos
    WHERE artwork_id = ?
      AND moderation_state = 'approved'
    ORDER BY id ASC
    LIMIT 1
  `)
    .bind(artworkId)
    .first<{ id: number }>();

  if (fallback) {
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE photos SET is_primary = 0 WHERE artwork_id = ?
      `).bind(artworkId),
      env.DB.prepare(`
        UPDATE photos SET is_primary = 1 WHERE id = ?
      `).bind(fallback.id),
    ]);
  }
}

async function publishArtworkPhoto(
  env: Env,
  photoId: number,
  reviewedBy: string | null = null,
) {
  const photo = await env.DB.prepare(`
    SELECT id, artwork_id, storage_key, thumbnail_key, moderation_state
    FROM photos
    WHERE id = ?
    LIMIT 1
  `)
    .bind(photoId)
    .first<{
      id: number;
      artwork_id: number;
      storage_key: string;
      thumbnail_key: string | null;
      moderation_state: ArtworkPhotoModerationState;
    }>();

  if (!photo) {
    throw new Error("Artwork photo was not found");
  }

  if (photo.moderation_state === "approved") {
    return photo;
  }

  const source = await env.IMAGES.get(photo.storage_key);
  const sourceThumbnail = photo.thumbnail_key
    ? await env.IMAGES.get(photo.thumbnail_key)
    : null;

  if (!source || !sourceThumbnail) {
    throw new Error("Quarantined image data is unavailable");
  }

  const publicKey = `artworks/${photo.artwork_id}/photo-${photo.id}.jpg`;
  const publicThumbnailKey =
    `artworks/${photo.artwork_id}/photo-${photo.id}-thumb.jpg`;

  await Promise.all([
    env.IMAGES.put(publicKey, await source.arrayBuffer(), {
      httpMetadata: { contentType: "image/jpeg" },
    }),
    env.IMAGES.put(publicThumbnailKey, await sourceThumbnail.arrayBuffer(), {
      httpMetadata: { contentType: "image/jpeg" },
    }),
  ]);

  const update = await env.DB.prepare(`
    UPDATE photos
    SET storage_key = ?,
        thumbnail_key = ?,
        moderation_state = 'approved',
        reviewed_by = COALESCE(?, reviewed_by),
        reviewed_at = CASE WHEN ? IS NULL THEN reviewed_at ELSE CURRENT_TIMESTAMP END,
        published_at = CURRENT_TIMESTAMP,
        moderation_last_error = NULL
    WHERE id = ?
      AND moderation_state IN ('pending', 'manual_review')
  `)
    .bind(publicKey, publicThumbnailKey, reviewedBy, reviewedBy, photoId)
    .run();

  if (Number(update.meta.changes ?? 0) !== 1) {
    await Promise.all([
      env.IMAGES.delete(publicKey),
      env.IMAGES.delete(publicThumbnailKey),
    ]);
    throw new Error("This image was reviewed by someone else");
  }

  await Promise.all([
    env.IMAGES.delete(photo.storage_key),
    photo.thumbnail_key
      ? env.IMAGES.delete(photo.thumbnail_key)
      : Promise.resolve(),
  ]);
  await ensureApprovedPrimaryPhoto(env, photo.artwork_id);

  return { ...photo, storage_key: publicKey, thumbnail_key: publicThumbnailKey };
}

async function applyImageModerationDecision(
  env: Env,
  photoId: number,
  decision: ImageModerationDecision,
  previousAttemptCount: number,
) {
  const attemptCount = previousAttemptCount + 1;
  const finalDecision: ImageModerationDecision =
    decision.outcome === "retry" &&
    attemptCount >= MAX_AUTOMATED_MODERATION_ATTEMPTS
      ? {
          ...decision,
          outcome: "manual_review",
          reason:
            "The automated safety check remained unavailable after scheduled retries; moderator review is required.",
        }
      : decision;
  const state = storedModerationState(finalDecision.outcome);
  const update = await env.DB.prepare(`
    UPDATE photos
    SET moderation_state = ?,
        moderation_provider = ?,
        moderation_model = ?,
        moderation_request_id = ?,
        moderation_reason = ?,
        moderation_categories = ?,
        moderation_scores = ?,
        moderation_attempt_count = moderation_attempt_count + 1,
        moderation_last_error = ?
    WHERE id = ?
      AND moderation_state = 'pending'
  `)
    .bind(
      state,
      finalDecision.provider,
      finalDecision.model,
      finalDecision.requestId,
      finalDecision.reason,
      JSON.stringify(finalDecision.categories),
      JSON.stringify(finalDecision.scores),
      finalDecision.error,
      photoId,
    )
    .run();

  if (Number(update.meta.changes ?? 0) !== 1) {
    throw new Error("This image changed state during automated moderation");
  }

  if (finalDecision.outcome !== "approve") {
    return {
      id: photoId,
      state,
      providerRetry: decision.outcome === "retry",
    };
  }

  try {
    await publishArtworkPhoto(env, photoId);
    return {
      id: photoId,
      state: "approved" as const,
      providerRetry: false,
    };
  } catch (error) {
    await env.DB.prepare(`
      UPDATE photos
      SET moderation_state = 'manual_review',
          moderation_reason = 'Publishing failed after automated approval.',
          moderation_last_error = ?
      WHERE id = ?
        AND moderation_state = 'pending'
    `)
      .bind(
        error instanceof Error ? error.message : "Unknown publish error",
        photoId,
      )
      .run();
    return {
      id: photoId,
      state: "manual_review" as const,
      providerRetry: false,
    };
  }
}

async function quarantineAndModerateArtworkPhoto(
  env: Env,
  artworkId: number,
  userId: string,
  file: File,
  isPrimary: boolean,
  preparedImage?: PreparedImage,
) {
  const image = preparedImage ?? (await prepareImageUpload(file));
  const uploadId = crypto.randomUUID();
  const quarantineKey = `quarantine/artworks/${artworkId}/${uploadId}.jpg`;
  const quarantineThumbnailKey =
    `quarantine/artworks/${artworkId}/${uploadId}-thumb.jpg`;

  await Promise.all([
    env.IMAGES.put(quarantineKey, image.bytes, {
      httpMetadata: { contentType: image.storedMimeType },
    }),
    env.IMAGES.put(quarantineThumbnailKey, image.thumbnailBytes, {
      httpMetadata: { contentType: image.storedMimeType },
    }),
  ]);

  let photoId: number;

  try {
    const inserted = await env.DB.prepare(`
      INSERT INTO photos (
        artwork_id,
        storage_key,
        thumbnail_key,
        is_primary,
        uploaded_by,
        moderation_state,
        source_mime_type,
        stored_mime_type,
        width,
        height,
        byte_size
      )
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
    `)
      .bind(
        artworkId,
        quarantineKey,
        quarantineThumbnailKey,
        isPrimary ? 1 : 0,
        userId,
        image.sourceMimeType,
        image.storedMimeType,
        image.width,
        image.height,
        image.bytes.byteLength,
      )
      .run();
    photoId = Number(inserted.meta.last_row_id);
  } catch (error) {
    await Promise.all([
      env.IMAGES.delete(quarantineKey),
      env.IMAGES.delete(quarantineThumbnailKey),
    ]);
    throw error;
  }

  const decision = await moderateImage(env.OPENAI_API_KEY, image);

  return applyImageModerationDecision(env, photoId, decision, 0);
}

export async function retryPendingImageModeration(env: Env) {
  const candidates = await env.DB.prepare(`
    SELECT
      id,
      storage_key,
      thumbnail_key,
      moderation_state,
      moderation_attempt_count,
      stored_mime_type,
      width,
      height
    FROM photos
    WHERE (
      moderation_state = 'pending'
      AND moderation_attempt_count < ?
      AND (
        (
          moderation_attempt_count <= 1
          AND created_at <= datetime('now', '-10 minutes')
        )
        OR (
          moderation_attempt_count = 2
          AND created_at <= datetime('now', '-30 minutes')
        )
      )
    )
    OR (
      moderation_state = 'manual_review'
      AND reviewed_at IS NULL
      AND moderation_last_error LIKE 'OpenAI returned 429:%'
    )
    ORDER BY created_at ASC, id ASC
    LIMIT ?
  `)
    .bind(MAX_AUTOMATED_MODERATION_ATTEMPTS, MODERATION_RETRY_BATCH_SIZE)
    .all<{
      id: number;
      storage_key: string;
      thumbnail_key: string | null;
      moderation_state: ArtworkPhotoModerationState;
      moderation_attempt_count: number;
      stored_mime_type: string | null;
      width: number | null;
      height: number | null;
    }>();
  const result = {
    checked: 0,
    approved: 0,
    rejected: 0,
    deferred: 0,
    manualReviewPhotoIds: [] as number[],
  };

  for (const candidate of candidates.results) {
    if (candidate.moderation_state === "manual_review") {
      const restored = await env.DB.prepare(`
        UPDATE photos
        SET moderation_state = 'pending',
            moderation_reason =
              'A previous provider throttle is being retried automatically while the image remains private.'
        WHERE id = ?
          AND moderation_state = 'manual_review'
          AND reviewed_at IS NULL
          AND moderation_last_error LIKE 'OpenAI returned 429:%'
      `)
        .bind(candidate.id)
        .run();

      if (Number(restored.meta.changes ?? 0) !== 1) {
        continue;
      }
    }

    result.checked += 1;
    let thumbnail: R2ObjectBody | null = null;
    let decision: ImageModerationDecision | null = null;

    try {
      thumbnail = candidate.thumbnail_key
        ? await env.IMAGES.get(candidate.thumbnail_key)
        : null;
    } catch (error) {
      decision = {
        outcome: "retry",
        provider: "openai",
        model: "omni-moderation-latest",
        requestId: null,
        reason:
          "The quarantined image could not be read temporarily and will retry while it remains private.",
        categories: {},
        scores: {},
        error:
          error instanceof Error
            ? `R2 read failed: ${error.message}`
            : "R2 read failed",
      };
    }

    if (!decision && thumbnail === null) {
      decision = {
        outcome: "manual_review",
        provider: "openai",
        model: "omni-moderation-latest",
        requestId: null,
        reason:
          "The quarantined moderation preview is unavailable; moderator review is required.",
        categories: {},
        scores: {},
        error: "Quarantined thumbnail is missing from R2",
      };
    } else if (!decision && thumbnail) {
      const thumbnailBytes = new Uint8Array(await thumbnail.arrayBuffer());
      const retryImage: PreparedImage = {
        bytes: thumbnailBytes,
        thumbnailBytes,
        sourceMimeType: "image/jpeg",
        storedMimeType: "image/jpeg",
        width: candidate.width ?? 1,
        height: candidate.height ?? 1,
      };

      decision = await moderateImage(env.OPENAI_API_KEY, retryImage);
    }

    if (!decision) {
      throw new Error("The moderation retry did not produce a decision");
    }

    const applied = await applyImageModerationDecision(
      env,
      candidate.id,
      decision,
      candidate.moderation_attempt_count,
    );

    if (applied.state === "approved") {
      result.approved += 1;
    } else if (applied.state === "rejected") {
      result.rejected += 1;
    } else if (applied.state === "manual_review") {
      result.manualReviewPhotoIds.push(candidate.id);
    } else {
      result.deferred += 1;
    }

    // Once the provider says it is throttled/unavailable, do not burn through
    // the rest of the queue in the same scheduled invocation.
    if (applied.providerRetry) {
      break;
    }
  }

  return result;
}

function isValidObservedDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value &&
    value <= new Date().toISOString().slice(0, 10)
  );
}

export async function purgeExpiredRejectedArtworks(env: Env) {
  const candidates = await env.DB.prepare(`
    SELECT artworks.id
    FROM artworks
    WHERE EXISTS (
      SELECT 1
      FROM photos
      WHERE photos.artwork_id = artworks.id
        AND photos.moderation_state = 'rejected'
    )
      AND NOT EXISTS (
        SELECT 1
        FROM photos
        WHERE photos.artwork_id = artworks.id
          AND (
            photos.moderation_state <> 'rejected'
            OR COALESCE(photos.reviewed_at, photos.created_at) > datetime('now', '-24 hours')
          )
      )
    ORDER BY artworks.id ASC
    LIMIT 50
  `).all<{ id: number }>();

  let purged = 0;

  for (const candidate of candidates.results) {
    try {
      const assets = await env.DB.prepare(`
        SELECT storage_key, thumbnail_key
        FROM photos
        WHERE artwork_id = ?
          AND moderation_state = 'rejected'
          AND COALESCE(reviewed_at, created_at) <= datetime('now', '-24 hours')
        UNION ALL
        SELECT photo_storage_key AS storage_key, NULL AS thumbnail_key
        FROM artwork_status_reports
        WHERE artwork_id = ?
          AND photo_storage_key IS NOT NULL
      `)
        .bind(candidate.id, candidate.id)
        .all<{ storage_key: string; thumbnail_key: string | null }>();
      const keys = [
        ...new Set(
          assets.results.flatMap((asset) =>
            [asset.storage_key, asset.thumbnail_key].filter(
              (key): key is string => Boolean(key),
            ),
          ),
        ),
      ];

      if (keys.length > 0) {
        await env.IMAGES.delete(keys);
      }

      const eligibleArtwork = `
        artwork_id = ?
        AND EXISTS (
          SELECT 1
          FROM photos AS rejected_photo
          WHERE rejected_photo.artwork_id = ?
            AND rejected_photo.moderation_state = 'rejected'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM photos AS retained_photo
          WHERE retained_photo.artwork_id = ?
            AND (
              retained_photo.moderation_state <> 'rejected'
              OR COALESCE(retained_photo.reviewed_at, retained_photo.created_at) > datetime('now', '-24 hours')
            )
        )
      `;
      const eligibilityBindings = [
        candidate.id,
        candidate.id,
        candidate.id,
      ];
      const results = await env.DB.batch([
        env.DB.prepare(`
          DELETE FROM image_moderation_alert_outbox
          WHERE photo_id IN (
            SELECT id
            FROM photos
            WHERE artwork_id = ?
              AND moderation_state = 'rejected'
              AND COALESCE(reviewed_at, created_at) <= datetime('now', '-24 hours')
          )
        `).bind(candidate.id),
        env.DB.prepare(`
          DELETE FROM email_notification_outbox
          WHERE event_type = 'artwork_status_report'
            AND entity_id IN (
              SELECT CAST(id AS TEXT)
              FROM artwork_status_reports
              WHERE ${eligibleArtwork}
            )
        `).bind(...eligibilityBindings),
        env.DB.prepare(`
          DELETE FROM checkins
          WHERE ${eligibleArtwork}
        `).bind(...eligibilityBindings),
        env.DB.prepare(`
          DELETE FROM artwork_revisions
          WHERE ${eligibleArtwork}
        `).bind(...eligibilityBindings),
        env.DB.prepare(`
          DELETE FROM artwork_status_reports
          WHERE ${eligibleArtwork}
        `).bind(...eligibilityBindings),
        env.DB.prepare(`
          UPDATE artwork_status_reports
          SET replacement_artwork_id = NULL
          WHERE replacement_artwork_id = ?
            AND EXISTS (
              SELECT 1
              FROM photos AS rejected_photo
              WHERE rejected_photo.artwork_id = ?
                AND rejected_photo.moderation_state = 'rejected'
            )
            AND NOT EXISTS (
              SELECT 1
              FROM photos AS retained_photo
              WHERE retained_photo.artwork_id = ?
                AND (
                  retained_photo.moderation_state <> 'rejected'
                  OR COALESCE(retained_photo.reviewed_at, retained_photo.created_at) > datetime('now', '-24 hours')
                )
            )
        `).bind(candidate.id, candidate.id, candidate.id),
        env.DB.prepare(`
          DELETE FROM photos
          WHERE artwork_id = ?
            AND moderation_state = 'rejected'
            AND COALESCE(reviewed_at, created_at) <= datetime('now', '-24 hours')
        `).bind(candidate.id),
        env.DB.prepare(`
          DELETE FROM artworks
          WHERE id = ?
            AND NOT EXISTS (
              SELECT 1
              FROM photos
              WHERE photos.artwork_id = artworks.id
            )
        `).bind(candidate.id),
      ]);

      if (Number(results.at(-1)?.meta.changes ?? 0) === 1) {
        purged += 1;
      }
    } catch (error) {
      console.error(
        `Rejected artwork cleanup failed for artwork ${candidate.id}:`,
        error,
      );
    }
  }

  return { candidates: candidates.results.length, purged };
}

export async function deleteArtworkAndAssets(env: Env, artworkId: number) {
  const artwork = await env.DB.prepare(`
    SELECT id
    FROM artworks
    WHERE id = ?
    LIMIT 1
  `)
    .bind(artworkId)
    .first<{ id: number }>();

  if (!artwork) {
    return { deleted: false, assetCount: 0 };
  }

  const assets = await env.DB.prepare(`
    SELECT storage_key, thumbnail_key
    FROM photos
    WHERE artwork_id = ?
    UNION ALL
    SELECT photo_storage_key AS storage_key, NULL AS thumbnail_key
    FROM artwork_status_reports
    WHERE artwork_id = ?
      AND photo_storage_key IS NOT NULL
  `)
    .bind(artworkId, artworkId)
    .all<{ storage_key: string; thumbnail_key: string | null }>();
  const assetKeys = [
    ...new Set(
      assets.results.flatMap((asset) =>
        [asset.storage_key, asset.thumbnail_key].filter(
          (key): key is string => Boolean(key),
        ),
      ),
    ),
  ];

  const results = await env.DB.batch([
    env.DB.prepare(`
      DELETE FROM image_moderation_alert_outbox
      WHERE photo_id IN (
        SELECT id FROM photos WHERE artwork_id = ?
      )
    `).bind(artworkId),
    env.DB.prepare(`
      DELETE FROM email_notification_outbox
      WHERE event_type = 'artwork_status_report'
        AND entity_id IN (
          SELECT CAST(id AS TEXT)
          FROM artwork_status_reports
          WHERE artwork_id = ?
        )
    `).bind(artworkId),
    env.DB.prepare(`DELETE FROM checkins WHERE artwork_id = ?`).bind(
      artworkId,
    ),
    env.DB.prepare(`DELETE FROM artwork_revisions WHERE artwork_id = ?`).bind(
      artworkId,
    ),
    env.DB.prepare(`
      UPDATE artwork_status_reports
      SET replacement_artwork_id = NULL
      WHERE replacement_artwork_id = ?
    `).bind(artworkId),
    env.DB.prepare(`DELETE FROM artwork_status_reports WHERE artwork_id = ?`).bind(
      artworkId,
    ),
    env.DB.prepare(`DELETE FROM photos WHERE artwork_id = ?`).bind(artworkId),
    env.DB.prepare(`DELETE FROM artworks WHERE id = ?`).bind(artworkId),
  ]);

  const deleted = Number(results.at(-1)?.meta.changes ?? 0) === 1;

  if (deleted && assetKeys.length > 0) {
    try {
      await env.IMAGES.delete(assetKeys);
    } catch (error) {
      // The database no longer exposes the artwork or its images. Retain a log
      // so an orphaned R2 object can be cleaned up without restoring access.
      console.error("Artwork R2 cleanup failed", { artworkId, error });
    }
  }

  return { deleted, assetCount: assetKeys.length };
}

function createVerificationLandingResponse(
  authResponse: Response,
  requestUrl: URL,
  errorCode: string | null,
) {
  const destination = new URL("/verify-email", requestUrl);

  if (errorCode) {
    destination.searchParams.set("error", errorCode);
  } else {
    destination.searchParams.set("verified", "1");
  }

  const destinationUrl = destination.toString();
  const escapedDestination = destinationUrl
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;");
  const title = errorCode ? "Verification link problem" : "Email verified";
  const message = errorCode
    ? "We could not verify this link. Returning to Artility so you can request a new one."
    : "Your email has been verified. Returning to Artility…";
  const headers = new Headers(authResponse.headers);

  headers.delete("content-length");
  headers.delete("location");
  headers.set("cache-control", "no-store");
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set(
    "content-security-policy",
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  );

  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="0;url=${escapedDestination}">
    <title>${title} · Artility</title>
    <style>
      :root { color-scheme: light; font-family: "Century Gothic", "Trebuchet MS", sans-serif; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: #f3ead5; color: #082b50; }
      main { width: min(520px, calc(100% - 40px)); padding: 32px; border: 1px solid #d99a2b; border-radius: 24px; background: #fff8e8; text-align: center; }
      h1 { margin: 0 0 12px; font-size: clamp(32px, 7vw, 48px); }
      p { margin: 0; color: #5f584a; line-height: 1.6; }
      a { display: inline-block; margin-top: 22px; color: #082b50; font-weight: 800; }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${message}</p>
      <a href="${escapedDestination}">Continue to Artility</a>
    </main>
  </body>
</html>`,
    { status: 200, headers },
  );
}

export default {
  async fetch(
    request: Request,
    env: ArtilityEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    continueEmailNotificationDelivery(env, ctx);

    const auth = createAuth(env, ctx);

    async function getCurrentUserId() {
      const session = await auth.api.getSession({
        headers: request.headers,
      });

      return session?.user?.id ?? null;
    }

    async function requireVerifiedUser(): Promise<
      | { ok: true; userId: string }
      | { ok: false; response: Response }
    > {
      const session = await auth.api.getSession({
        headers: request.headers,
      });

      if (!session?.user) {
        return {
          ok: false,
          response: Response.json(
            { error: "Not signed in", code: "NOT_SIGNED_IN" },
            { status: 401 },
          ),
        };
      }

      const createdAt = new Date(session.user.createdAt).getTime();
      const isExistingUser =
        Number.isFinite(createdAt) &&
        createdAt < EMAIL_VERIFICATION_CUTOFF;

      if (!session.user.emailVerified && !isExistingUser) {
        return {
          ok: false,
          response: Response.json(
            {
              error:
                "Verify your email to upload artwork, edit details, or check in.",
              code: "EMAIL_VERIFICATION_REQUIRED",
            },
            { status: 403 },
          ),
        };
      }

      return { ok: true, userId: session.user.id };
    }

    async function requireAdmin(): Promise<
      | { ok: true; userId: string; role: "admin" }
      | { ok: false; response: Response }
    > {
      const session = await auth.api.getSession({
        headers: request.headers,
      });

      if (!session?.user) {
        return {
          ok: false,
          response: Response.json(
            { error: "Not signed in", code: "NOT_SIGNED_IN" },
            { status: 401 },
          ),
        };
      }

      const role = await env.DB.prepare(`
        SELECT role
        FROM user_roles
        WHERE user_id = ?
          AND role = 'admin'
        LIMIT 1
      `)
        .bind(session.user.id)
        .first<{ role: "admin" }>();

      if (!role) {
        return {
          ok: false,
          response: Response.json(
            { error: "Administrator access required", code: "FORBIDDEN" },
            { status: 403 },
          ),
        };
      }

      return {
        ok: true,
        userId: session.user.id,
        role: role.role,
      };
    }

    if (
      url.pathname === "/api/auth/verify-email" &&
      request.method === "GET"
    ) {
      const authResponse = await auth.handler(request);
      const redirectLocation = authResponse.headers.get("location");
      let errorCode: string | null = null;

      if (redirectLocation) {
        const redirectUrl = new URL(redirectLocation, request.url);
        errorCode = redirectUrl.searchParams.get("error");
      } else if (!authResponse.ok) {
        try {
          const errorBody = (await authResponse.clone().json()) as {
            code?: string;
          };
          errorCode = errorBody.code ?? "VERIFICATION_FAILED";
        } catch {
          errorCode = "VERIFICATION_FAILED";
        }
      }

      const safeErrorCode = errorCode
        ? errorCode.replace(/[^a-z0-9_-]/gi, "").slice(0, 80) ||
          "VERIFICATION_FAILED"
        : null;

      return createVerificationLandingResponse(
        authResponse,
        url,
        safeErrorCode,
      );
    }

    if (url.pathname.startsWith("/api/auth/")) {
      return auth.handler(request);
    }

    if (url.pathname === "/api/routes/plan" && request.method === "POST") {
      const contentLength = Number(request.headers.get("content-length") ?? 0);

      if (contentLength > 8_192) {
        return Response.json(
          { error: "Route request is too large", code: "INVALID_ROUTE_REQUEST" },
          { status: 413 },
        );
      }

      try {
        const input = validateRoutePlanInput(await request.json());
        const placeholders = input.artwork_ids.map(() => "?").join(", ");
        const result = await env.DB.prepare(`
          SELECT
            artworks.id,
            artworks.title,
            artworks.latitude,
            artworks.longitude,
            artworks.town,
            artworks.city,
            artists.name AS artist_name
          FROM artworks
          LEFT JOIN artists ON artists.id = artworks.artist_id
          WHERE artworks.id IN (${placeholders})
            AND EXISTS (
              SELECT 1
              FROM photos AS publishable_photo
              WHERE publishable_photo.artwork_id = artworks.id
                AND publishable_photo.moderation_state = 'approved'
            )
        `)
          .bind(...input.artwork_ids)
          .all<{
            id: number;
            title: string | null;
            latitude: number;
            longitude: number;
            town: string | null;
            city: string | null;
            artist_name: string | null;
          }>();
        const artworkById = new Map(
          result.results.map((artwork) => [artwork.id, artwork]),
        );
        const orderedStops = input.artwork_ids
          .map((id) => artworkById.get(id))
          .filter((artwork): artwork is NonNullable<typeof artwork> => Boolean(artwork));

        if (orderedStops.length !== input.artwork_ids.length) {
          return Response.json(
            {
              error: "One or more selected artworks are unavailable",
              code: "ROUTE_STOP_NOT_FOUND",
            },
            { status: 404 },
          );
        }

        const stopCoordinates = orderedStops.map((artwork) => [
          Number(artwork.longitude),
          Number(artwork.latitude),
        ]);
        const firstStop = stopCoordinates[0];
        const startsAtFirstStop =
          Math.abs(firstStop[0] - input.start.longitude) < 0.000001 &&
          Math.abs(firstStop[1] - input.start.latitude) < 0.000001;
        const coordinates = startsAtFirstStop
          ? stopCoordinates
          : [[input.start.longitude, input.start.latitude], ...stopCoordinates];
        const route = await requestOpenRouteServiceWalkingRoute(
          env.OPENROUTESERVICE_API_KEY ?? "",
          coordinates,
        );

        return Response.json(
          {
            mode: "walking",
            stops: orderedStops,
            total_distance_metres: route.distanceMetres,
            estimated_duration_seconds: route.durationSeconds,
            geometry: route.geometry,
          },
          { headers: { "cache-control": "no-store" } },
        );
      } catch (error) {
        if (error instanceof RoutingError) {
          const headers = error.retryAfter
            ? { "retry-after": error.retryAfter }
            : undefined;

          return Response.json(
            { error: error.message, code: error.code },
            { status: error.status, headers },
          );
        }

        if (error instanceof SyntaxError) {
          return Response.json(
            { error: "Route request must be valid JSON", code: "INVALID_ROUTE_REQUEST" },
            { status: 400 },
          );
        }

        console.error("Walking route planning failed", error);
        return Response.json(
          { error: "Could not generate this walk", code: "ROUTE_PLAN_FAILED" },
          { status: 500 },
        );
      }
    }

    if (
      url.pathname === "/api/admin/moderation/access" &&
      request.method === "GET"
    ) {
      const access = await requireAdmin();

      if (!access.ok) {
        return access.response;
      }

      return Response.json({
        is_admin: true,
        role: access.role,
      });
    }

    if (
      url.pathname === "/api/admin/profile-stats" &&
      request.method === "GET"
    ) {
      const access = await requireAdmin();

      if (!access.ok) {
        return access.response;
      }

      const [userSummary, artworkSummary] = await Promise.all([
        env.DB.prepare(`
          SELECT
            COUNT(*) AS registered_user_count,
            MAX(createdAt) AS latest_user_registered_at
          FROM "user"
        `).first<{
          registered_user_count: number;
          latest_user_registered_at: string | null;
        }>(),
        env.DB.prepare(`
          SELECT MAX(created_at) AS latest_artwork_added_at
          FROM artworks
        `).first<{ latest_artwork_added_at: string | null }>(),
      ]);

      return Response.json(
        {
          registered_user_count: Number(
            userSummary?.registered_user_count ?? 0,
          ),
          latest_user_registered_at:
            userSummary?.latest_user_registered_at ?? null,
          latest_artwork_added_at:
            artworkSummary?.latest_artwork_added_at ?? null,
        },
        { headers: { "cache-control": "no-store" } },
      );
    }

    const adminArtworkMatch = url.pathname.match(
      /^\/api\/admin\/artworks\/(\d+)$/,
    );

    if (adminArtworkMatch && request.method === "DELETE") {
      const access = await requireAdmin();

      if (!access.ok) {
        return access.response;
      }

      const artworkId = Number(adminArtworkMatch[1]);
      const result = await deleteArtworkAndAssets(env, artworkId);

      if (!result.deleted) {
        return Response.json({ error: "Artwork not found" }, { status: 404 });
      }

      console.info("Administrator deleted artwork", {
        artworkId,
        administratorId: access.userId,
        removedAssetCount: result.assetCount,
      });

      return Response.json({ success: true, artwork_id: artworkId });
    }

    const privateModerationImageMatch = url.pathname.match(
      /^\/api\/admin\/moderation\/images\/(artwork-photo|artwork-status-report)\/(\d+)$/,
    );

    if (privateModerationImageMatch && request.method === "GET") {
      const access = await requireAdmin();

      if (!access.ok) {
        return access.response;
      }

      const caseType = privateModerationImageMatch[1];
      const recordId = Number(privateModerationImageMatch[2]);
      const record =
        caseType === "artwork-photo"
          ? await env.DB.prepare(`
              SELECT storage_key
              FROM photos
              WHERE id = ?
                AND moderation_state = 'manual_review'
              LIMIT 1
            `)
              .bind(recordId)
              .first<{ storage_key: string }>()
          : await env.DB.prepare(`
              SELECT photo_storage_key AS storage_key
              FROM artwork_status_reports
              WHERE id = ?
                AND moderation_state = 'pending'
                AND photo_storage_key IS NOT NULL
              LIMIT 1
            `)
              .bind(recordId)
              .first<{ storage_key: string }>();

      if (!record) {
        return new Response("Image not found", { status: 404 });
      }

      const object = await env.IMAGES.get(record.storage_key);

      if (!object) {
        return new Response("Image not found", { status: 404 });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("cache-control", "private, no-store");
      headers.set("x-content-type-options", "nosniff");

      return new Response(object.body, { headers });
    }

    if (
      url.pathname === "/api/admin/moderation/cases" &&
      request.method === "GET"
    ) {
      const access = await requireAdmin();

      if (!access.ok) {
        return access.response;
      }

      const requestedType = url.searchParams.get("type") ?? "all";
      const supportedTypes = new Set([
        "all",
        "artwork_status_report",
        "artwork_photo",
      ]);

      if (!supportedTypes.has(requestedType)) {
        return Response.json(
          { error: "Unknown moderation case type" },
          { status: 400 },
        );
      }

      const items: Array<Record<string, unknown>> = [];

      if (
        requestedType === "all" ||
        requestedType === "artwork_status_report"
      ) {
        const reports = await env.DB.prepare(`
        SELECT
          reports.id,
          reports.artwork_id,
          reports.report_type,
          reports.date_observed,
          reports.note,
          reports.photo_storage_key,
          reports.reporting_user_id,
          reports.replacement_artwork_id,
          reports.moderation_state,
          reports.created_at,
          artworks.title AS artwork_title,
          artworks.town AS artwork_town,
          artworks.city AS artwork_city,
          effective_status.status AS artwork_current_status,
          reporter.name AS reporter_name,
          reporter.email AS reporter_email
        FROM artwork_status_reports AS reports
        INNER JOIN artworks
          ON artworks.id = reports.artwork_id
        INNER JOIN artwork_effective_statuses AS effective_status
          ON effective_status.artwork_id = artworks.id
        LEFT JOIN "user" AS reporter
          ON reporter.id = reports.reporting_user_id
        WHERE reports.moderation_state = 'pending'
        ORDER BY reports.created_at ASC, reports.id ASC
        `).all<{
        id: number;
        artwork_id: number;
        report_type: string;
        date_observed: string;
        note: string | null;
        photo_storage_key: string | null;
        reporting_user_id: string;
        replacement_artwork_id: number | null;
        moderation_state: "pending";
        created_at: string;
        artwork_title: string | null;
        artwork_town: string | null;
        artwork_city: string | null;
        artwork_current_status: string;
        reporter_name: string | null;
        reporter_email: string | null;
        }>();

        items.push(
          ...reports.results.map((report) => ({
            id: `artwork_status_report:${report.id}`,
            case_type: "artwork_status_report",
            state: report.moderation_state,
            created_at: report.created_at,
            subject: {
              type: "artwork",
              id: report.artwork_id,
              title: report.artwork_title,
              town: report.artwork_town,
              city: report.artwork_city,
              current_status: report.artwork_current_status,
            },
            reporter: {
              id: report.reporting_user_id,
              name: report.reporter_name,
              email: report.reporter_email,
            },
            payload: {
              report_id: report.id,
              report_type: report.report_type,
              date_observed: report.date_observed,
              note: report.note,
              photo_storage_key: report.photo_storage_key,
              replacement_artwork_id: report.replacement_artwork_id,
            },
          })),
        );
      }

      if (requestedType === "all" || requestedType === "artwork_photo") {
        const photos = await env.DB.prepare(`
          SELECT
            photos.id,
            photos.artwork_id,
            photos.uploaded_by,
            photos.moderation_state,
            photos.moderation_provider,
            photos.moderation_model,
            photos.moderation_reason,
            photos.moderation_categories,
            photos.moderation_scores,
            photos.moderation_last_error,
            photos.source_mime_type,
            photos.stored_mime_type,
            photos.width,
            photos.height,
            photos.byte_size,
            photos.created_at,
            artworks.title AS artwork_title,
            artworks.town AS artwork_town,
            artworks.city AS artwork_city,
            effective_status.status AS artwork_current_status,
            uploader.name AS reporter_name,
            uploader.email AS reporter_email
          FROM photos
          INNER JOIN artworks
            ON artworks.id = photos.artwork_id
          INNER JOIN artwork_effective_statuses AS effective_status
            ON effective_status.artwork_id = artworks.id
          LEFT JOIN "user" AS uploader
            ON uploader.id = photos.uploaded_by
          WHERE photos.moderation_state = 'manual_review'
          ORDER BY photos.created_at ASC, photos.id ASC
        `).all<{
          id: number;
          artwork_id: number;
          uploaded_by: string | null;
          moderation_state: "manual_review";
          moderation_provider: string | null;
          moderation_model: string | null;
          moderation_reason: string | null;
          moderation_categories: string | null;
          moderation_scores: string | null;
          moderation_last_error: string | null;
          source_mime_type: string | null;
          stored_mime_type: string | null;
          width: number | null;
          height: number | null;
          byte_size: number | null;
          created_at: string;
          artwork_title: string | null;
          artwork_town: string | null;
          artwork_city: string | null;
          artwork_current_status: string;
          reporter_name: string | null;
          reporter_email: string | null;
        }>();

        items.push(
          ...photos.results.map((photo) => ({
            id: `artwork_photo:${photo.id}`,
            case_type: "artwork_photo",
            state: photo.moderation_state,
            created_at: photo.created_at,
            subject: {
              type: "artwork",
              id: photo.artwork_id,
              title: photo.artwork_title,
              town: photo.artwork_town,
              city: photo.artwork_city,
              current_status: photo.artwork_current_status,
            },
            reporter: {
              id: photo.uploaded_by,
              name: photo.reporter_name,
              email: photo.reporter_email,
            },
            payload: {
              photo_id: photo.id,
              reason: photo.moderation_reason,
              provider: photo.moderation_provider,
              model: photo.moderation_model,
              categories: photo.moderation_categories,
              scores: photo.moderation_scores,
              moderation_error: photo.moderation_last_error,
              source_mime_type: photo.source_mime_type,
              stored_mime_type: photo.stored_mime_type,
              width: photo.width,
              height: photo.height,
              byte_size: photo.byte_size,
            },
          })),
        );
      }

      items.sort((left, right) =>
        String(left.created_at).localeCompare(String(right.created_at)),
      );

      return Response.json({
        items,
        state: "open",
        type: requestedType,
      });
    }

    const moderationDecisionMatch = url.pathname.match(
      /^\/api\/admin\/moderation\/cases\/artwork-status-report\/(\d+)\/decision$/,
    );

    if (moderationDecisionMatch && request.method === "POST") {
      const access = await requireAdmin();

      if (!access.ok) {
        return access.response;
      }

      let body: { decision?: unknown };

      try {
        body = (await request.json()) as { decision?: unknown };
      } catch {
        return Response.json(
          { error: "Decision must be valid JSON" },
          { status: 400 },
        );
      }

      const decision = body.decision;

      if (decision !== "approved" && decision !== "rejected") {
        return Response.json(
          { error: "Decision must be approved or rejected" },
          { status: 400 },
        );
      }

      const reportId = Number(moderationDecisionMatch[1]);
      const report = await env.DB.prepare(`
        SELECT id, artwork_id, moderation_state
        FROM artwork_status_reports
        WHERE id = ?
        LIMIT 1
      `)
        .bind(reportId)
        .first<{
          id: number;
          artwork_id: number;
          moderation_state: "pending" | "approved" | "rejected";
        }>();

      if (!report) {
        return Response.json(
          { error: "Moderation case not found" },
          { status: 404 },
        );
      }

      if (report.moderation_state !== "pending") {
        return Response.json(
          {
            error: `This report has already been ${report.moderation_state}`,
            code: "ALREADY_REVIEWED",
          },
          { status: 409 },
        );
      }

      const update = await env.DB.prepare(`
        UPDATE artwork_status_reports
        SET moderation_state = ?,
            reviewed_by = ?,
            reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND moderation_state = 'pending'
      `)
        .bind(decision, access.userId, reportId)
        .run();

      if (Number(update.meta.changes ?? 0) !== 1) {
        return Response.json(
          {
            error: "This report was reviewed by someone else",
            code: "ALREADY_REVIEWED",
          },
          { status: 409 },
        );
      }

      const effectiveStatus = await env.DB.prepare(`
        SELECT status, date_observed, source_report_id
        FROM artwork_effective_statuses
        WHERE artwork_id = ?
        LIMIT 1
      `)
        .bind(report.artwork_id)
        .first<{
          status: string;
          date_observed: string;
          source_report_id: number | null;
        }>();

      return Response.json({
        success: true,
        case: {
          id: `artwork_status_report:${report.id}`,
          case_type: "artwork_status_report",
          state: decision,
          artwork_id: report.artwork_id,
        },
        effective_status: effectiveStatus,
      });
    }

    if (
      url.pathname ===
        "/api/admin/moderation/cases/artwork-photo/bulk-approve" &&
      request.method === "POST"
    ) {
      const access = await requireAdmin();

      if (!access.ok) {
        return access.response;
      }

      let body: { photo_ids?: unknown };

      try {
        body = (await request.json()) as { photo_ids?: unknown };
      } catch {
        return Response.json(
          { error: "Photo IDs must be valid JSON" },
          { status: 400 },
        );
      }

      if (
        !Array.isArray(body.photo_ids) ||
        body.photo_ids.length === 0 ||
        body.photo_ids.length > 50 ||
        body.photo_ids.some(
          (photoId) => !Number.isInteger(photoId) || Number(photoId) <= 0,
        )
      ) {
        return Response.json(
          {
            error:
              "Provide between 1 and 50 unique, positive integer photo IDs",
          },
          { status: 400 },
        );
      }

      const photoIds = [...new Set(body.photo_ids as number[])];
      const approved: number[] = [];
      const skipped: number[] = [];
      const failed: Array<{ id: number; error: string }> = [];

      for (const photoId of photoIds) {
        const photo = await env.DB.prepare(`
          SELECT moderation_state
          FROM photos
          WHERE id = ?
          LIMIT 1
        `)
          .bind(photoId)
          .first<{ moderation_state: ArtworkPhotoModerationState }>();

        if (!photo || photo.moderation_state !== "manual_review") {
          skipped.push(photoId);
          continue;
        }

        try {
          await publishArtworkPhoto(env, photoId, access.userId);
          approved.push(photoId);
        } catch (error) {
          console.error("Bulk image approval failed", {
            photoId,
            error: error instanceof Error ? error.message : String(error),
          });
          failed.push({
            id: photoId,
            error:
              error instanceof Error
                ? error.message
                : "Could not publish this image",
          });
        }
      }

      return Response.json({ approved, skipped, failed });
    }

    const imageModerationDecisionMatch = url.pathname.match(
      /^\/api\/admin\/moderation\/cases\/artwork-photo\/(\d+)\/decision$/,
    );

    if (imageModerationDecisionMatch && request.method === "POST") {
      const access = await requireAdmin();

      if (!access.ok) {
        return access.response;
      }

      let body: { decision?: unknown };

      try {
        body = (await request.json()) as { decision?: unknown };
      } catch {
        return Response.json(
          { error: "Decision must be valid JSON" },
          { status: 400 },
        );
      }

      if (body.decision !== "approved" && body.decision !== "rejected") {
        return Response.json(
          { error: "Decision must be approved or rejected" },
          { status: 400 },
        );
      }

      const photoId = Number(imageModerationDecisionMatch[1]);
      const photo = await env.DB.prepare(`
        SELECT id, artwork_id, moderation_state
        FROM photos
        WHERE id = ?
        LIMIT 1
      `)
        .bind(photoId)
        .first<{
          id: number;
          artwork_id: number;
          moderation_state: ArtworkPhotoModerationState;
        }>();

      if (!photo) {
        return Response.json(
          { error: "Moderation case not found" },
          { status: 404 },
        );
      }

      if (photo.moderation_state !== "manual_review") {
        return Response.json(
          {
            error: `This image is already ${photo.moderation_state}`,
            code: "ALREADY_REVIEWED",
          },
          { status: 409 },
        );
      }

      if (body.decision === "approved") {
        await publishArtworkPhoto(env, photoId, access.userId);
      } else {
        const update = await env.DB.prepare(`
          UPDATE photos
          SET moderation_state = 'rejected',
              reviewed_by = ?,
              reviewed_at = CURRENT_TIMESTAMP,
              moderation_reason = COALESCE(
                moderation_reason || ' ',
                ''
              ) || 'Rejected by an administrator.'
          WHERE id = ?
            AND moderation_state = 'manual_review'
        `)
          .bind(access.userId, photoId)
          .run();

        if (Number(update.meta.changes ?? 0) !== 1) {
          return Response.json(
            {
              error: "This image was reviewed by someone else",
              code: "ALREADY_REVIEWED",
            },
            { status: 409 },
          );
        }

        await ensureApprovedPrimaryPhoto(env, photo.artwork_id);
      }

      return Response.json({
        success: true,
        case: {
          id: `artwork_photo:${photo.id}`,
          case_type: "artwork_photo",
          state: body.decision,
          artwork_id: photo.artwork_id,
        },
      });
    }

    if (url.pathname === "/api/artworks" && request.method === "POST") {
      try {

        const access = await requireVerifiedUser();

        if (!access.ok) {
          return access.response;
        }

        const userId = access.userId;
        const formData = await request.formData();

        const title =
          String(formData.get("title") ?? "").trim() || null;

        const artistName = normaliseArtistName(
          formData.get("artist_name"),
        );

        const instagramHandle = normaliseInstagramHandle(
          formData.get("instagram_handle"),
        );

        const description = String(
          formData.get("description") ?? "",
        ).trim();

        const infrastructureType = normaliseInfrastructureType(
          formData.get("infrastructure_type") ?? "",
        );

        const latitude = Number(formData.get("latitude"));
        const longitude = Number(formData.get("longitude"));

        const town = String(formData.get("town") ?? "").trim();
        const city = String(formData.get("city") ?? "").trim();

        const photos = formData
          .getAll("photos")
          .filter((value): value is File => value instanceof File);

        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude)
        ) {
          return Response.json(
            { error: "Valid location is required" },
            { status: 400 },
          );
        }

        if (!infrastructureType) {
          return Response.json(
            { error: "Choose a valid artwork setting" },
            { status: 400 },
          );
        }

        if (photos.length === 0) {
          return Response.json(
            { error: "At least one photo is required" },
            { status: 400 },
          );
        }

        if (photos.length > MAX_PHOTOS_PER_ARTWORK) {
          return Response.json(
            {
              error: `You can upload a maximum of ${MAX_PHOTOS_PER_ARTWORK} photos per artwork.`,
            },
            { status: 400 },
          );
        }
        await enforceImageUploadRateLimit(env, userId, photos.length);
        const preparedPhotos = await Promise.all(
          photos.map((photo) => prepareImageUpload(photo)),
        );

        const resolvedArtist = await resolveArtworkArtist(
          env,
          artistName,
          instagramHandle,
        );
        const artistId = resolvedArtist?.id ?? null;

        const artworkInsert = await env.DB.prepare(`
      INSERT INTO artworks (
        title,
        description,
        latitude,
        longitude,
        town,
        city,
        infrastructure_type,
        artist_id,
        status,
        added_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'present', ?)
    `)
          .bind(
            title,
            description || null,
            latitude,
            longitude,
            town || null,
            city || null,
            infrastructureType,
            artistId,
            userId
          )
          .run();

        const artworkId = Number(
          artworkInsert.meta.last_row_id
        );

        const moderation = [];

        for (let index = 0; index < photos.length; index++) {
          const result = await quarantineAndModerateArtworkPhoto(
            env,
            artworkId,
            userId,
            photos[index],
            index === 0,
            preparedPhotos[index],
          );
          moderation.push(result);

          if (result.state === "manual_review") {
            queueImageModerationReviewAlert(env, ctx, result.id);
          }
        }

        return Response.json(
          {
            id: artworkId,
            image_moderation: moderation,
          },
          {
            status: 201,
          }
        );
      } catch (error) {
        console.error("Artwork upload failed:", error);

        if (error instanceof ImageUploadError) {
          return Response.json(
            { error: error.message },
            {
              status: error.status,
              headers:
                error.status === 429 ? { "retry-after": "3600" } : undefined,
            },
          );
        }

        if (error instanceof ArtistIdentityError) {
          return Response.json({ error: error.message }, { status: 400 });
        }

        return Response.json(
          {
            error: "Could not create artwork",
          },
          {
            status: 500,
          }
        );
      }
    }

    if (
      url.pathname === "/api/artworks/nearby" &&
      request.method === "GET"
    ) {
      const latitude = Number(
        url.searchParams.get("latitude")
      );

      const longitude = Number(
        url.searchParams.get("longitude")
      );

      const radiusMetres = Number(
        url.searchParams.get("radius") ?? "40"
      );

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        return Response.json(
          { error: "Valid latitude and longitude are required" },
          { status: 400 }
        );
      }

      const latitudeDelta = radiusMetres / 111320;

      const longitudeDelta =
        radiusMetres /
        (111320 * Math.cos((latitude * Math.PI) / 180));

      const result = await env.DB.prepare(`
  SELECT
    artworks.id,
    artworks.title,
    artworks.latitude,
    artworks.longitude,
    artworks.infrastructure_type,
    artworks.city,
    effective_status.status AS status,

    (
      SELECT COUNT(*)
      FROM photos AS artwork_photos
      WHERE artwork_photos.artwork_id = artworks.id
        AND artwork_photos.moderation_state = 'approved'
    ) AS photo_count,

    artists.name AS artist_name,
    photos.storage_key AS primary_photo
  FROM artworks
  INNER JOIN artwork_effective_statuses AS effective_status
    ON effective_status.artwork_id = artworks.id
  LEFT JOIN artists
    ON artworks.artist_id = artists.id
  LEFT JOIN photos
    ON photos.artwork_id = artworks.id
    AND photos.is_primary = 1
    AND photos.moderation_state = 'approved'
  WHERE artworks.latitude BETWEEN ? AND ?
    AND artworks.longitude BETWEEN ? AND ?
    AND EXISTS (
      SELECT 1
      FROM photos AS publishable_photo
      WHERE publishable_photo.artwork_id = artworks.id
        AND publishable_photo.moderation_state = 'approved'
    )
  `)
        .bind(
          latitude - latitudeDelta,
          latitude + latitudeDelta,
          longitude - longitudeDelta,
          longitude + longitudeDelta
        )
        .all();

      function distanceBetween(
        lat1: number,
        lon1: number,
        lat2: number,
        lon2: number
      ) {
        const earthRadius = 6371000;

        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;

        const Δφ =
          ((lat2 - lat1) * Math.PI) / 180;

        const Δλ =
          ((lon2 - lon1) * Math.PI) / 180;

        const a =
          Math.sin(Δφ / 2) ** 2 +
          Math.cos(φ1) *
          Math.cos(φ2) *
          Math.sin(Δλ / 2) ** 2;

        const c =
          2 *
          Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
          );

        return earthRadius * c;
      }

      const nearby = result.results
        .map((artwork) => {
          const distanceMetres = Math.round(
            distanceBetween(
              latitude,
              longitude,
              Number(artwork.latitude),
              Number(artwork.longitude)
            )
          );

          return {
            ...artwork,
            distance_metres: distanceMetres,
          };
        })
        .filter(
          (artwork) =>
            artwork.distance_metres <= radiusMetres
        )
        .sort(
          (a, b) =>
            a.distance_metres - b.distance_metres
        );

      return Response.json(nearby);
    }
    if (
      url.pathname === "/api/artists/suggestions" &&
      request.method === "GET"
    ) {
      const nameQuery = normaliseArtistNameKey(url.searchParams.get("name"));
      const instagramQuery = normaliseInstagramHandle(
        url.searchParams.get("instagram"),
      );

      if (
        (nameQuery?.length ?? 0) < 2 &&
        (instagramQuery?.length ?? 0) < 2
      ) {
        return Response.json({ items: [] });
      }

      const result = await env.DB.prepare(`
        SELECT id, name, instagram_handle
        FROM artists
        WHERE normalized_name NOT IN ('artist unknown', 'unknown artist')
          AND (
            (? IS NOT NULL AND instr(normalized_name, ?) > 0)
            OR (? IS NOT NULL AND instr(normalized_instagram_handle, ?) > 0)
          )
        ORDER BY
          CASE
            WHEN normalized_instagram_handle = ? THEN 0
            WHEN normalized_name = ? THEN 1
            ELSE 2
          END,
          name COLLATE NOCASE,
          id
        LIMIT 8
      `)
        .bind(
          nameQuery,
          nameQuery,
          instagramQuery,
          instagramQuery,
          instagramQuery,
          nameQuery,
        )
        .all<{
          id: number;
          name: string;
          instagram_handle: string | null;
        }>();

      return Response.json({ items: result.results });
    }

    if (url.pathname === "/api/artists" && request.method === "GET") {
      const result = await env.DB.prepare(`
    SELECT
      artists.id,
      artists.name,
      artists.instagram_handle,
      artists.website_url,
      artists.bio,
      artists.created_at,
      COUNT(artworks.id) AS artwork_count,
      (
        SELECT photos.storage_key
        FROM artworks AS representative_artwork
        LEFT JOIN photos
          ON photos.artwork_id = representative_artwork.id
          AND photos.is_primary = 1
          AND photos.moderation_state = 'approved'
        WHERE representative_artwork.artist_id = artists.id
          AND photos.storage_key IS NOT NULL
        ORDER BY representative_artwork.created_at DESC
        LIMIT 1
      ) AS primary_photo
    FROM artists
    LEFT JOIN artworks
      ON artworks.artist_id = artists.id
      AND EXISTS (
        SELECT 1
        FROM photos AS publishable_photo
        WHERE publishable_photo.artwork_id = artworks.id
          AND publishable_photo.moderation_state = 'approved'
      )
    GROUP BY artists.id
    HAVING COUNT(artworks.id) > 0
    ORDER BY artists.name COLLATE NOCASE
  `).all<{
        id: number;
        name: string;
        instagram_handle: string | null;
        website_url: string | null;
        bio: string | null;
        created_at: string;
        artwork_count: number;
        primary_photo: string | null;
      }>();

      const unknownResult = await env.DB.prepare(`
    SELECT
      COUNT(artworks.id) AS artwork_count,
      (
        SELECT photos.storage_key
        FROM artworks AS representative_artwork
        LEFT JOIN photos
          ON photos.artwork_id = representative_artwork.id
          AND photos.is_primary = 1
          AND photos.moderation_state = 'approved'
        WHERE representative_artwork.artist_id IS NULL
          AND photos.storage_key IS NOT NULL
        ORDER BY representative_artwork.created_at DESC
        LIMIT 1
      ) AS primary_photo
    FROM artworks
    WHERE artworks.artist_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM photos AS publishable_photo
        WHERE publishable_photo.artwork_id = artworks.id
          AND publishable_photo.moderation_state = 'approved'
      )
  `).first<{
        artwork_count: number;
        primary_photo: string | null;
      }>();

      const locationResult = await env.DB.prepare(`
    SELECT
      artist_id,
      latitude,
      longitude
    FROM artworks
    WHERE latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM photos AS publishable_photo
        WHERE publishable_photo.artwork_id = artworks.id
          AND publishable_photo.moderation_state = 'approved'
      )
  `).all<{
        artist_id: number | null;
        latitude: number;
        longitude: number;
      }>();

      const locationsByArtist = new Map<
        string,
        Array<{ latitude: number; longitude: number }>
      >();

      for (const location of locationResult.results) {
        const key =
          location.artist_id === null
            ? "unknown"
            : String(location.artist_id);
        const locations = locationsByArtist.get(key) ?? [];

        locations.push({
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
        });
        locationsByArtist.set(key, locations);
      }

      const artists: Array<{
        id: number | "unknown";
        name: string;
        instagram_handle: string | null;
        website_url: string | null;
        bio: string | null;
        created_at: string | null;
        artwork_count: number;
        primary_photo: string | null;
        artwork_locations: Array<{
          latitude: number;
          longitude: number;
        }>;
      }> = result.results.map((artist) => ({
        ...artist,
        artwork_locations:
          locationsByArtist.get(String(artist.id)) ?? [],
      }));

      if (Number(unknownResult?.artwork_count ?? 0) > 0) {
        artists.unshift({
          id: "unknown",
          name: "Artist unknown",
          instagram_handle: null,
          website_url: null,
          bio: null,
          created_at: null,
          artwork_count: Number(unknownResult?.artwork_count ?? 0),
          primary_photo: unknownResult?.primary_photo ?? null,
          artwork_locations: locationsByArtist.get("unknown") ?? [],
        });
      }

      return Response.json(artists);
    }

    const artistDetailMatch = url.pathname.match(
      /^\/api\/artists\/([^/]+)$/,
    );

    if (artistDetailMatch && request.method === "GET") {
      const artistId = artistDetailMatch[1];

      if (artistId === "unknown") {
        const artworks = await env.DB.prepare(`
      SELECT
        artworks.id,
        artworks.title,
        artworks.description,
        artworks.latitude,
        artworks.longitude,
        artworks.town,
        artworks.city,
        artworks.infrastructure_type,
        effective_status.status AS status,
        artworks.artist_id,
        artworks.created_at,
        photos.storage_key AS primary_photo
      FROM artworks
      INNER JOIN artwork_effective_statuses AS effective_status
        ON effective_status.artwork_id = artworks.id
      LEFT JOIN photos
        ON photos.artwork_id = artworks.id
        AND photos.is_primary = 1
        AND photos.moderation_state = 'approved'
      WHERE artworks.artist_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM photos AS publishable_photo
          WHERE publishable_photo.artwork_id = artworks.id
            AND publishable_photo.moderation_state = 'approved'
        )
      ORDER BY artworks.created_at DESC
    `).all();

        return Response.json({
          artist: {
            id: "unknown",
            name: "Artist unknown",
            instagram_handle: null,
            website_url: null,
            bio: null,
            created_at: null,
          },
          artworks: artworks.results,
        });
      }

      const numericArtistId = Number(artistId);
      const artist = await env.DB.prepare(`
  SELECT
    id,
    name,
    instagram_handle,
    website_url,
    bio,
    created_at
  FROM artists
  WHERE id = ?
`)
        .bind(numericArtistId)
        .first();

      if (!artist) {
        return new Response("Artist not found", {
          status: 404,
        });
      }

      const artworks = await env.DB.prepare(`
        SELECT
          artworks.id,
          artworks.title,
          artworks.description,
          artworks.latitude,
          artworks.longitude,
          artworks.town,
          artworks.city,
          artworks.infrastructure_type,
effective_status.status AS status,
artworks.artist_id,
artworks.created_at,
          photos.storage_key AS primary_photo
        FROM artworks
        INNER JOIN artwork_effective_statuses AS effective_status
          ON effective_status.artwork_id = artworks.id
        LEFT JOIN photos
          ON photos.artwork_id = artworks.id
          AND photos.is_primary = 1
          AND photos.moderation_state = 'approved'
        WHERE artworks.artist_id = ?
          AND EXISTS (
            SELECT 1
            FROM photos AS publishable_photo
            WHERE publishable_photo.artwork_id = artworks.id
              AND publishable_photo.moderation_state = 'approved'
          )
        ORDER BY artworks.created_at DESC
      `)
        .bind(numericArtistId)
        .all();

      return Response.json({
        artist,
        artworks: artworks.results,
      });
    }
    if (url.pathname === "/api/artworks" && request.method === "GET") {
      const result = await env.DB.prepare(`
        SELECT
          artworks.id,
          artworks.title,
          artworks.description,
          artworks.latitude,
          artworks.longitude,
          artworks.town,
          artworks.city,
          artworks.infrastructure_type,
          effective_status.status AS status,
artworks.created_at,

(
  SELECT COUNT(DISTINCT checkins.user_id)
  FROM checkins
  WHERE checkins.artwork_id = artworks.id
) AS checkin_count,

(
  SELECT MAX(checkins.checked_in_at)
  FROM checkins
  WHERE checkins.artwork_id = artworks.id
) AS last_checkin_at,

artists.name AS artist_name,
artists.instagram_handle,
photos.storage_key AS primary_photo,
photos.created_at AS photo_added_at
        FROM artworks
        INNER JOIN artwork_effective_statuses AS effective_status
          ON effective_status.artwork_id = artworks.id
        LEFT JOIN artists
          ON artworks.artist_id = artists.id
        LEFT JOIN photos
          ON photos.artwork_id = artworks.id
          AND photos.is_primary = 1
          AND photos.moderation_state = 'approved'
        WHERE EXISTS (
          SELECT 1
          FROM photos AS publishable_photo
          WHERE publishable_photo.artwork_id = artworks.id
            AND publishable_photo.moderation_state = 'approved'
        )
        ORDER BY artworks.created_at DESC
      `).all();

      return Response.json(result.results);
    }

    const artworkStatusReportsMatch = url.pathname.match(
      /^\/api\/artworks\/(\d+)\/status-reports$/,
    );

    if (artworkStatusReportsMatch && request.method === "GET") {
      const artworkId = Number(artworkStatusReportsMatch[1]);
      const artwork = await env.DB.prepare(`
        SELECT id, status, created_at
        FROM artworks
        WHERE id = ?
          AND EXISTS (
            SELECT 1
            FROM photos AS publishable_photo
            WHERE publishable_photo.artwork_id = artworks.id
              AND publishable_photo.moderation_state = 'approved'
          )
        LIMIT 1
      `)
        .bind(artworkId)
        .first<{
          id: number;
          status: string;
          created_at: string;
        }>();

      if (!artwork) {
        return Response.json(
          { error: "Artwork not found" },
          { status: 404 },
        );
      }

      const approvedHistory = await env.DB.prepare(`
        SELECT
          id,
          report_type,
          date_observed,
          note,
          photo_storage_key,
          replacement_artwork_id,
          created_at
        FROM artwork_status_reports
        WHERE artwork_id = ?
          AND moderation_state = 'approved'
        ORDER BY date_observed DESC, created_at DESC, id DESC
      `)
        .bind(artworkId)
        .all<{
          id: number;
          report_type: string;
          date_observed: string;
          note: string | null;
          photo_storage_key: string | null;
          replacement_artwork_id: number | null;
          created_at: string;
        }>();

      const history = approvedHistory.results;
      const latestApprovedReport = history[0] ?? null;

      return Response.json({
        current_status: latestApprovedReport
          ? {
              type: latestApprovedReport.report_type,
              date_observed: latestApprovedReport.date_observed,
              source: "approved_report",
            }
          : {
              type: artwork.status,
              date_observed: artwork.created_at.slice(0, 10),
              source: "artwork",
            },
        history,
      });
    }

    if (artworkStatusReportsMatch && request.method === "POST") {
      const access = await requireVerifiedUser();

      if (!access.ok) {
        return access.response;
      }

      const artworkId = Number(artworkStatusReportsMatch[1]);
      const artwork = await env.DB.prepare(`
        SELECT id
        FROM artworks
        WHERE id = ?
          AND EXISTS (
            SELECT 1
            FROM photos AS publishable_photo
            WHERE publishable_photo.artwork_id = artworks.id
              AND publishable_photo.moderation_state = 'approved'
          )
        LIMIT 1
      `)
        .bind(artworkId)
        .first();

      if (!artwork) {
        return Response.json(
          { error: "Artwork not found" },
          { status: 404 },
        );
      }

      let formData: FormData;

      try {
        formData = await request.formData();
      } catch {
        return Response.json(
          { error: "Status reports must use form data" },
          { status: 400 },
        );
      }

      const reportType = String(
        formData.get("report_type") ?? "",
      ).trim();
      const dateObserved = String(
        formData.get("date_observed") ?? "",
      ).trim();
      const note = String(formData.get("note") ?? "").trim() || null;
      const supportingPhotoValue = formData.get("supporting_photo");
      const supportingPhoto =
        supportingPhotoValue instanceof File && supportingPhotoValue.size > 0
          ? supportingPhotoValue
          : null;

      if (!STATUS_REPORT_TYPES.has(reportType)) {
        return Response.json(
          { error: "Choose a valid artwork status" },
          { status: 400 },
        );
      }

      if (!isValidObservedDate(dateObserved)) {
        return Response.json(
          { error: "Choose a valid observed date that is not in the future" },
          { status: 400 },
        );
      }

      if (note && note.length > MAX_STATUS_REPORT_NOTE_LENGTH) {
        return Response.json(
          {
            error: `Notes must be ${MAX_STATUS_REPORT_NOTE_LENGTH} characters or fewer`,
          },
          { status: 400 },
        );
      }

      let preparedSupportingPhoto: PreparedImage | null = null;

      if (supportingPhoto) {
        try {
          await enforceImageUploadRateLimit(env, access.userId, 1);
          preparedSupportingPhoto = await prepareImageUpload(supportingPhoto);
        } catch (error) {
          if (error instanceof ImageUploadError) {
            return Response.json(
              { error: error.message },
              {
                status: error.status,
                headers:
                  error.status === 429
                    ? { "retry-after": "3600" }
                    : undefined,
              },
            );
          }

          throw error;
        }
      }

      const photoStorageKey = preparedSupportingPhoto
        ? `quarantine/artworks/${artworkId}/status-reports/${crypto.randomUUID()}.jpg`
        : null;

      try {
        if (preparedSupportingPhoto && photoStorageKey) {
          await env.IMAGES.put(photoStorageKey, preparedSupportingPhoto.bytes, {
            httpMetadata: {
              contentType: preparedSupportingPhoto.storedMimeType,
            },
          });
        }

        const inserted = await env.DB.prepare(`
          INSERT INTO artwork_status_reports (
            artwork_id,
            report_type,
            date_observed,
            note,
            photo_storage_key,
            reporting_user_id,
            replacement_artwork_id,
            moderation_state
          )
          VALUES (?, ?, ?, ?, ?, ?, NULL, 'pending')
        `)
          .bind(
            artworkId,
            reportType,
            dateObserved,
            note,
            photoStorageKey,
            access.userId,
          )
          .run();

        const reportId = Number(inserted.meta.last_row_id);
        queueArtworkStatusReportAlert(env, ctx, reportId);

        return Response.json(
          {
            success: true,
            report: {
              id: reportId,
              artwork_id: artworkId,
              report_type: reportType,
              date_observed: dateObserved,
              note,
              photo_storage_key: photoStorageKey,
              reporting_user_id: access.userId,
              replacement_artwork_id: null,
              moderation_state: "pending",
              created_at: new Date().toISOString(),
            },
          },
          { status: 201 },
        );
      } catch (error) {
        if (photoStorageKey) {
          await env.IMAGES.delete(photoStorageKey).catch(() => undefined);
        }

        console.error("Artwork status report failed:", error);

        return Response.json(
          { error: "Could not submit status report" },
          { status: 500 },
        );
      }
    }

    const artworkDetailMatch = url.pathname.match(
  /^\/api\/artworks\/(\d+)$/,
);

if (artworkDetailMatch && request.method === "GET") {
  const artworkId = Number(artworkDetailMatch[1]);

  const artwork = await env.DB.prepare(`
    SELECT
      artworks.id,
      artworks.title,
      artworks.description,
      artworks.latitude,
      artworks.longitude,
      artworks.town,
      artworks.city,
      artworks.infrastructure_type,
      effective_status.status AS status,
      artworks.artist_id,
      artworks.created_at,

      (
        SELECT COUNT(DISTINCT checkins.user_id)
        FROM checkins
        WHERE checkins.artwork_id = artworks.id
      ) AS checkin_count,

      (
        SELECT MAX(checkins.checked_in_at)
        FROM checkins
        WHERE checkins.artwork_id = artworks.id
      ) AS last_checkin_at,

      artists.name AS artist_name,
      artists.instagram_handle

    FROM artworks
    INNER JOIN artwork_effective_statuses AS effective_status
      ON effective_status.artwork_id = artworks.id
    LEFT JOIN artists
      ON artworks.artist_id = artists.id
    WHERE artworks.id = ?
      AND EXISTS (
        SELECT 1
        FROM photos AS publishable_photo
        WHERE publishable_photo.artwork_id = artworks.id
          AND publishable_photo.moderation_state = 'approved'
      )
    LIMIT 1
  `)
    .bind(artworkId)
    .first();

  if (!artwork) {
    return Response.json(
      { error: "Artwork not found" },
      { status: 404 },
    );
  }

  const photos = await env.DB.prepare(`
    SELECT
      id,
      storage_key,
      is_primary,
      created_at
    FROM photos
    WHERE artwork_id = ?
      AND moderation_state = 'approved'
    ORDER BY is_primary DESC, id ASC
  `)
    .bind(artworkId)
    .all();

  return Response.json({
    artwork,
    photos: photos.results,
  });
}

    const artworkEditMatch = url.pathname.match(
      /^\/api\/artworks\/(\d+)$/,
    );

    if (artworkEditMatch && request.method === "PATCH") {
      try {
        const access = await requireVerifiedUser();

        if (!access.ok) {
          return access.response;
        }

        const userId = access.userId;

        const artworkId = Number(artworkEditMatch[1]);

        const current = await env.DB.prepare(`
          SELECT
            artworks.id,
            artworks.title,
            artworks.description,
            artworks.infrastructure_type,
            artworks.artist_id,
            artists.name AS artist_name,
            artists.instagram_handle
          FROM artworks
          LEFT JOIN artists
            ON artworks.artist_id = artists.id
          WHERE artworks.id = ?
          LIMIT 1
        `)
          .bind(artworkId)
          .first<{
            id: number;
            title: string | null;
            description: string | null;
            infrastructure_type: string;
            artist_id: number | null;
            artist_name: string | null;
            instagram_handle: string | null;
          }>();

        if (!current) {
          return Response.json(
            { error: "Artwork not found" },
            { status: 404 },
          );
        }

        const body = (await request.json()) as Record<string, unknown>;

        const allowedFields = new Set([
          "title",
          "description",
          "infrastructure_type",
          "artist_name",
          "instagram_handle",
        ]);

        for (const key of Object.keys(body)) {
          if (!allowedFields.has(key)) {
            return Response.json(
              { error: `Field "${key}" cannot be edited` },
              { status: 400 },
            );
          }

          const value = body[key];

          if (value !== null && typeof value !== "string") {
            return Response.json(
              { error: `Field "${key}" must be text` },
              { status: 400 },
            );
          }
        }

        function readText(
          key: string,
          currentValue: string | null,
        ): string | null {
          if (!Object.prototype.hasOwnProperty.call(body, key)) {
            return currentValue;
          }

          const value = body[key];

          if (value === null) {
            return null;
          }

          return String(value).trim() || null;
        }

        const title = readText("title", current.title);

        const description = readText(
          "description",
          current.description,
        );

        const infrastructureType = normaliseInfrastructureType(
          readText(
            "infrastructure_type",
            current.infrastructure_type,
          ),
        );

        if (!infrastructureType) {
          return Response.json(
            { error: "Choose a valid artwork setting" },
            { status: 400 },
          );
        }

        if (title && title.length > 200) {
          return Response.json(
            { error: "Title is too long" },
            { status: 400 },
          );
        }

        if (description && description.length > 2000) {
          return Response.json(
            { error: "Description is too long" },
            { status: 400 },
          );
        }

        const artistFieldsTouched =
          Object.prototype.hasOwnProperty.call(body, "artist_name") ||
          Object.prototype.hasOwnProperty.call(
            body,
            "instagram_handle",
          );

        let artistId = current.artist_id;
        let finalArtistName = current.artist_name;
        let finalInstagramHandle = current.instagram_handle;

        if (artistFieldsTouched) {
          const artistName = readText(
            "artist_name",
            current.artist_name,
          );

          const instagramHandleValue = readText(
            "instagram_handle",
            current.instagram_handle,
          );

          const resolvedArtist = await resolveArtworkArtist(
            env,
            artistName,
            instagramHandleValue,
          );

          if (!resolvedArtist) {
            artistId = null;
            finalArtistName = null;
            finalInstagramHandle = null;
          } else {
            artistId = resolvedArtist.id;
            finalArtistName = resolvedArtist.name;
            finalInstagramHandle = resolvedArtist.instagram_handle;
          }
        }

        const before = {
          title: current.title,
          description: current.description,
          infrastructure_type: current.infrastructure_type,
          artist_id: current.artist_id,
          artist_name: current.artist_name,
          instagram_handle: current.instagram_handle,
        };

        const after = {
          title,
          description,
          infrastructure_type: infrastructureType,
          artist_id: artistId,
          artist_name: finalArtistName,
          instagram_handle: finalInstagramHandle,
        };

        if (JSON.stringify(before) === JSON.stringify(after)) {
          return Response.json({
            success: true,
            unchanged: true,
            artwork_id: artworkId,
          });
        }

        await env.DB.batch([
          env.DB.prepare(`
            UPDATE artworks
            SET title = ?,
                description = ?,
                infrastructure_type = ?,
                artist_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(
            title,
            description,
            infrastructureType,
            artistId,
            artworkId,
          ),

          env.DB.prepare(`
            INSERT INTO artwork_revisions (
              artwork_id,
              edited_by,
              before_json,
              after_json
            )
            VALUES (?, ?, ?, ?)
          `).bind(
            artworkId,
            userId,
            JSON.stringify(before),
            JSON.stringify(after),
          ),
        ]);

        return Response.json({
          success: true,
          artwork_id: artworkId,
          artwork: after,
        });
      } catch (error) {
        console.error("Artwork edit failed:", error);

        if (error instanceof ArtistIdentityError) {
          return Response.json({ error: error.message }, { status: 400 });
        }

        return Response.json(
          { error: "Could not update artwork" },
          { status: 500 },
        );
      }
    }
    if (url.pathname === "/api/my-finds" && request.method === "GET") {
      const userId = await getCurrentUserId();



      if (!userId) {
        return Response.json(
          { error: "Not signed in" },
          { status: 401 }
        );
      }

      const result = await env.DB.prepare(`
        SELECT
          artworks.id,
          artworks.title,
          artworks.description,
          artworks.latitude,
          artworks.longitude,
          artworks.town,
          artworks.city,
         artworks.infrastructure_type,
effective_status.status AS status,
artworks.artist_id,
artists.name AS artist_name,
          artists.instagram_handle,
          photos.storage_key AS primary_photo,
          checkins.checked_in_at
        FROM checkins
        INNER JOIN artworks
          ON artworks.id = checkins.artwork_id
        INNER JOIN artwork_effective_statuses AS effective_status
          ON effective_status.artwork_id = artworks.id
        LEFT JOIN artists
          ON artworks.artist_id = artists.id
        LEFT JOIN photos
          ON photos.artwork_id = artworks.id
          AND photos.is_primary = 1
          AND photos.moderation_state = 'approved'
        WHERE checkins.user_id = ?
          AND EXISTS (
            SELECT 1
            FROM photos AS publishable_photo
            WHERE publishable_photo.artwork_id = artworks.id
              AND publishable_photo.moderation_state = 'approved'
          )
        ORDER BY checkins.checked_in_at DESC
      `)
        .bind(userId)
        .all();

      return Response.json(result.results);
    }

    const checkinMatch = url.pathname.match(
      /^\/api\/artworks\/(\d+)\/checkin$/
    );

    if (checkinMatch && request.method === "GET") {
      const artworkId = Number(checkinMatch[1]);
      const userId = await getCurrentUserId();

      if (!userId) {
        return Response.json(
          { error: "Not signed in" },
          { status: 401 }
        );
      }

      const checkin = await env.DB.prepare(`
    SELECT id, checked_in_at
    FROM checkins
    WHERE artwork_id = ?
      AND user_id = ?
    LIMIT 1
  `)
        .bind(artworkId, userId)
        .first();

      return Response.json({
        checked_in: Boolean(checkin),
        checkin,
      });
    }

    const artworkPhotosMatch = url.pathname.match(
      /^\/api\/artworks\/(\d+)\/photos$/
    );

    if (artworkPhotosMatch && request.method === "POST") {
      try {
        const access = await requireVerifiedUser();

        if (!access.ok) {
          return access.response;
        }

        const userId = access.userId;

        const artworkId = Number(artworkPhotosMatch[1]);

        const artwork = await env.DB.prepare(`
      SELECT id
      FROM artworks
      WHERE id = ?
      LIMIT 1
    `)
          .bind(artworkId)
          .first();

        if (!artwork) {
          return Response.json(
            { error: "Artwork not found" },
            { status: 404 }
          );
        }

        const formData = await request.formData();

        const photos = formData
          .getAll("photos")
          .filter((value): value is File => value instanceof File);

        if (photos.length === 0) {
          return Response.json(
            { error: "At least one photo is required" },
            { status: 400 }
          );
        }

        const existingPhotoCount = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM photos
      WHERE artwork_id = ?
    `)
          .bind(artworkId)
          .first<{ count: number }>();

        const existingCount = Number(existingPhotoCount?.count ?? 0);

        if (existingCount + photos.length > MAX_PHOTOS_PER_ARTWORK) {
          const remaining = Math.max(
            0,
            MAX_PHOTOS_PER_ARTWORK - existingCount,
          );

          return Response.json(
            {
              error:
                remaining === 0
                  ? `This artwork already has the maximum of ${MAX_PHOTOS_PER_ARTWORK} photos.`
                  : `You can only add ${remaining} more ${remaining === 1 ? "photo" : "photos"
                  } to this artwork.`,
            },
            { status: 400 },
          );
        }

        await enforceImageUploadRateLimit(env, userId, photos.length);
        const preparedPhotos = await Promise.all(
          photos.map((photo) => prepareImageUpload(photo)),
        );
        const moderation = [];

        for (let index = 0; index < photos.length; index++) {
          const result = await quarantineAndModerateArtworkPhoto(
            env,
            artworkId,
            userId,
            photos[index],
            false,
            preparedPhotos[index],
          );
          moderation.push(result);

          if (result.state === "manual_review") {
            queueImageModerationReviewAlert(env, ctx, result.id);
          }
        }

        return Response.json({
          success: true,
          artwork_id: artworkId,
          added: photos.length,
          image_moderation: moderation,
        });
      } catch (error) {
        console.error("Photo append failed:", error);

        if (error instanceof ImageUploadError) {
          return Response.json(
            { error: error.message },
            {
              status: error.status,
              headers:
                error.status === 429 ? { "retry-after": "3600" } : undefined,
            },
          );
        }

        return Response.json(
          { error: "Could not add photos" },
          { status: 500 }
        );
      }
    }
    if (checkinMatch && request.method === "POST") {
      const artworkId = Number(checkinMatch[1]);
      const access = await requireVerifiedUser();

      if (!access.ok) {
        return access.response;
      }

      const userId = access.userId;

      const artwork = await env.DB.prepare(`
        SELECT id
        FROM artworks
        WHERE id = ?
          AND EXISTS (
            SELECT 1
            FROM photos AS publishable_photo
            WHERE publishable_photo.artwork_id = artworks.id
              AND publishable_photo.moderation_state = 'approved'
          )
        LIMIT 1
      `)
        .bind(artworkId)
        .first();

      if (!artwork) {
        return Response.json(
          { error: "Artwork not found" },
          { status: 404 }
        );
      }

      await env.DB.prepare(`
        INSERT OR IGNORE INTO checkins (
          artwork_id,
          user_id
        )
        VALUES (?, ?)
      `)
        .bind(artworkId, userId)
        .run();

      return Response.json({
        checked_in: true,
      });
    }

    // DEV ONLY: remove our test check-in
    if (checkinMatch && request.method === "DELETE") {
      if (
        url.hostname !== "localhost" &&
        url.hostname !== "127.0.0.1"
      ) {
        return Response.json(
          { error: "Dev reset unavailable" },
          { status: 403 }
        );
      }

      const artworkId = Number(checkinMatch[1]);
      const access = await requireVerifiedUser();

      if (!access.ok) {
        return access.response;
      }

      const userId = access.userId;

      await env.DB.prepare(`
        DELETE FROM checkins
        WHERE artwork_id = ?
          AND user_id = ?
      `)
        .bind(artworkId, userId)
        .run();

      return Response.json({
        checked_in: false,
      });
    }

    if (
      url.pathname.startsWith("/api/images/") &&
      request.method === "GET"
    ) {
      const key = decodeURIComponent(
        url.pathname.replace("/api/images/", "")
      );

      const publicReference = await env.DB.prepare(`
        SELECT storage_key
        FROM photos
        WHERE moderation_state = 'approved'
          AND (storage_key = ? OR thumbnail_key = ?)
        UNION ALL
        SELECT photo_storage_key AS storage_key
        FROM artwork_status_reports
        WHERE moderation_state = 'approved'
          AND photo_storage_key = ?
        LIMIT 1
      `)
        .bind(key, key, key)
        .first();

      if (!publicReference) {
        return new Response("Image not found", { status: 404 });
      }

      const object = await env.IMAGES.get(key);

      if (!object) {
        return new Response("Image not found", {
          status: 404,
        });
      }

      const headers = new Headers();

      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      headers.set(
        "cache-control",
        "public, max-age=31536000, immutable",
      );
      headers.set("x-content-type-options", "nosniff");

      return new Response(object.body, {
        headers,
      });
    }

    return new Response("Not found", {
      status: 404,
    });
  },

  scheduled(
    _controller: ScheduledController,
    env: ArtilityEnv,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(
      Promise.all([
        purgeExpiredRejectedArtworks(env).then((result) => {
          console.log(
            `Rejected artwork cleanup checked ${result.candidates} and purged ${result.purged}.`,
          );
        }),
        retryPendingImageModeration(env).then((result) => {
          for (const photoId of result.manualReviewPhotoIds) {
            queueImageModerationReviewAlert(env, ctx, photoId);
          }

          console.log(
            "Image moderation retry run",
            JSON.stringify({
              checked: result.checked,
              approved: result.approved,
              rejected: result.rejected,
              deferred: result.deferred,
              manualReview: result.manualReviewPhotoIds.length,
            }),
          );
        }),
      ]).then(() => undefined),
    );
  },
} satisfies ExportedHandler<ArtilityEnv>;
