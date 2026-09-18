CREATE TABLE account_deletion_audit (
  id TEXT PRIMARY KEY,
  anonymised_artwork_count INTEGER NOT NULL DEFAULT 0,
  anonymised_photo_count INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
