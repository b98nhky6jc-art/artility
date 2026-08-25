CREATE TABLE IF NOT EXISTS image_moderation_alert_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_id INTEGER NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (
    state IN ('pending', 'sending', 'sent', 'failed')
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  provider_message_id TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  FOREIGN KEY (photo_id) REFERENCES photos(id)
);

CREATE INDEX IF NOT EXISTS image_moderation_alert_delivery_idx
  ON image_moderation_alert_outbox (
    state,
    next_attempt_at,
    created_at
  );

-- Pick up any image that entered review before alert delivery was added.
INSERT OR IGNORE INTO image_moderation_alert_outbox (photo_id)
SELECT id
FROM photos
WHERE moderation_state = 'manual_review';
