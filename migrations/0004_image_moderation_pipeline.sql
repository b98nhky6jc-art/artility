-- Existing library images pre-date moderation and remain public.
-- Every new artwork photo is inserted as pending and starts under quarantine/.
ALTER TABLE photos ADD COLUMN moderation_state TEXT NOT NULL DEFAULT 'pending'
  CHECK (moderation_state IN ('pending', 'approved', 'rejected', 'manual_review'));
ALTER TABLE photos ADD COLUMN moderation_provider TEXT;
ALTER TABLE photos ADD COLUMN moderation_model TEXT;
ALTER TABLE photos ADD COLUMN moderation_request_id TEXT;
ALTER TABLE photos ADD COLUMN moderation_reason TEXT;
ALTER TABLE photos ADD COLUMN moderation_categories TEXT;
ALTER TABLE photos ADD COLUMN moderation_scores TEXT;
ALTER TABLE photos ADD COLUMN moderation_attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE photos ADD COLUMN moderation_last_error TEXT;
ALTER TABLE photos ADD COLUMN source_mime_type TEXT;
ALTER TABLE photos ADD COLUMN stored_mime_type TEXT;
ALTER TABLE photos ADD COLUMN width INTEGER;
ALTER TABLE photos ADD COLUMN height INTEGER;
ALTER TABLE photos ADD COLUMN byte_size INTEGER;
ALTER TABLE photos ADD COLUMN reviewed_by TEXT;
ALTER TABLE photos ADD COLUMN reviewed_at TEXT;
ALTER TABLE photos ADD COLUMN published_at TEXT;

UPDATE photos
SET moderation_state = 'approved',
    published_at = COALESCE(created_at, CURRENT_TIMESTAMP)
WHERE published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_photos_public_artwork
  ON photos (artwork_id, moderation_state, is_primary, id);

CREATE INDEX IF NOT EXISTS idx_photos_moderation_queue
  ON photos (moderation_state, created_at, id);

CREATE TABLE IF NOT EXISTS image_upload_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  image_count INTEGER NOT NULL CHECK (image_count > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_image_upload_events_user_created
  ON image_upload_events (user_id, created_at);
