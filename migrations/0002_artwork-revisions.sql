CREATE TABLE artwork_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artwork_id INTEGER NOT NULL,
  edited_by TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artwork_id) REFERENCES artworks(id)
);

CREATE INDEX idx_artwork_revisions_artwork
ON artwork_revisions(artwork_id);

CREATE INDEX idx_artwork_revisions_created
ON artwork_revisions(created_at);
