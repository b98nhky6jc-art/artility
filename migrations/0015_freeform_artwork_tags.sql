CREATE TABLE artwork_tags_next (
  artwork_id INTEGER NOT NULL,
  tag TEXT NOT NULL COLLATE NOCASE
    CHECK (length(tag) BETWEEN 2 AND 40),
  added_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (artwork_id, tag),
  FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE
);

INSERT INTO artwork_tags_next (artwork_id, tag, added_by, created_at)
SELECT artwork_id, tag, added_by, created_at
FROM artwork_tags;

DROP TABLE artwork_tags;
ALTER TABLE artwork_tags_next RENAME TO artwork_tags;

CREATE INDEX artwork_tags_tag_idx
  ON artwork_tags (tag COLLATE NOCASE, artwork_id);
