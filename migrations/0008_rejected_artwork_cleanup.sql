CREATE INDEX IF NOT EXISTS photos_rejected_cleanup_idx
  ON photos (
    moderation_state,
    reviewed_at,
    created_at,
    artwork_id
  )
  WHERE moderation_state = 'rejected';
