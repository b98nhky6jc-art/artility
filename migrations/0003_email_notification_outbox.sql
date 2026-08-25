CREATE TABLE IF NOT EXISTS email_notification_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('new_registration', 'artwork_status_report')
  ),
  entity_id TEXT NOT NULL,
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
  UNIQUE (event_type, entity_id)
);

CREATE INDEX IF NOT EXISTS email_notification_outbox_delivery_idx
  ON email_notification_outbox (
    state,
    next_attempt_at,
    created_at
  );

-- Pick up events created after registration alerts were introduced, including
-- events that happened before the durable outbox was deployed.
INSERT OR IGNORE INTO email_notification_outbox (event_type, entity_id)
SELECT 'new_registration', id
FROM "user"
WHERE createdAt >= '2026-08-25T12:39:23.000Z';

INSERT OR IGNORE INTO email_notification_outbox (event_type, entity_id)
SELECT 'artwork_status_report', CAST(id AS TEXT)
FROM artwork_status_reports
WHERE moderation_state = 'pending';
