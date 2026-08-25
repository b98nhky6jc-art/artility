CREATE INDEX IF NOT EXISTS idx_photos_public_storage_key
  ON photos (storage_key, moderation_state);

CREATE INDEX IF NOT EXISTS idx_photos_public_thumbnail_key
  ON photos (thumbnail_key, moderation_state);

CREATE INDEX IF NOT EXISTS idx_status_report_public_photo_key
  ON artwork_status_reports (photo_storage_key, moderation_state);
