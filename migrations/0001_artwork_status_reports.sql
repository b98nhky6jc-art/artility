CREATE TABLE artwork_status_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artwork_id INTEGER NOT NULL,
  report_type TEXT NOT NULL CHECK (
    report_type IN (
      'no_longer_there',
      'changed_replaced',
      'damaged',
      'defaced'
    )
  ),
  date_observed TEXT NOT NULL,
  note TEXT CHECK (note IS NULL OR length(note) <= 1000),
  photo_storage_key TEXT,
  reporting_user_id TEXT NOT NULL,
  replacement_artwork_id INTEGER,
  moderation_state TEXT NOT NULL DEFAULT 'pending' CHECK (
    moderation_state IN ('pending', 'approved', 'rejected')
  ),
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE,
  FOREIGN KEY (replacement_artwork_id) REFERENCES artworks(id) ON DELETE SET NULL
);

CREATE INDEX artwork_status_reports_public_history_idx
  ON artwork_status_reports (
    artwork_id,
    moderation_state,
    date_observed DESC,
    created_at DESC
  );

CREATE INDEX artwork_status_reports_reporter_idx
  ON artwork_status_reports (reporting_user_id, created_at DESC);

CREATE INDEX artwork_status_reports_replacement_idx
  ON artwork_status_reports (replacement_artwork_id)
  WHERE replacement_artwork_id IS NOT NULL;
