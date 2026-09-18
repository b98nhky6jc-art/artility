CREATE TABLE artwork_tags (
  artwork_id INTEGER NOT NULL,
  tag TEXT NOT NULL CHECK (
    tag IN (
      'Abstract',
      'Animals',
      'Botanical',
      'Community',
      'Geometric',
      'Heritage',
      'Portrait',
      'Typography',
      'Whimsical'
    )
  ),
  added_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (artwork_id, tag),
  FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE
);

CREATE INDEX artwork_tags_tag_idx
  ON artwork_tags (tag, artwork_id);
