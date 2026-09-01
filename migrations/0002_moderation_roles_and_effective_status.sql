CREATE TABLE user_roles (
  user_id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin', 'moderator')),
  granted_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX user_roles_role_idx
  ON user_roles (role, created_at);

INSERT OR IGNORE INTO user_roles (user_id, role)
SELECT id, 'admin'
FROM "user"
WHERE lower(email) IN (
  'hello@artility.co.uk',
  'temorris@me.com'
);

CREATE VIEW artwork_effective_statuses AS
SELECT
  artworks.id AS artwork_id,
  COALESCE(
    (
      SELECT reports.report_type
      FROM artwork_status_reports AS reports
      WHERE reports.artwork_id = artworks.id
        AND reports.moderation_state = 'approved'
      ORDER BY
        reports.date_observed DESC,
        reports.created_at DESC,
        reports.id DESC
      LIMIT 1
    ),
    artworks.status
  ) AS status,
  COALESCE(
    (
      SELECT reports.date_observed
      FROM artwork_status_reports AS reports
      WHERE reports.artwork_id = artworks.id
        AND reports.moderation_state = 'approved'
      ORDER BY
        reports.date_observed DESC,
        reports.created_at DESC,
        reports.id DESC
      LIMIT 1
    ),
    substr(artworks.created_at, 1, 10)
  ) AS date_observed,
  (
    SELECT reports.id
    FROM artwork_status_reports AS reports
    WHERE reports.artwork_id = artworks.id
      AND reports.moderation_state = 'approved'
    ORDER BY
      reports.date_observed DESC,
      reports.created_at DESC,
      reports.id DESC
    LIMIT 1
  ) AS source_report_id
FROM artworks;
