CREATE TABLE IF NOT EXISTS photo_validity_assessments (
  photo_id INTEGER PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('approved', 'manual_review', 'rejected')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  request_id TEXT,
  reason TEXT NOT NULL,
  result_json TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  assessed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_photo_validity_assessments_state
ON photo_validity_assessments(state, assessed_at);
