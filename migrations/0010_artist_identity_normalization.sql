ALTER TABLE artists ADD COLUMN normalized_name TEXT;
ALTER TABLE artists ADD COLUMN normalized_instagram_handle TEXT;

UPDATE artists
SET normalized_name = lower(
      trim(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    replace(name, char(9), ' '),
                    char(10), ' '
                  ),
                  char(13), ' '
                ),
                '  ', ' '
              ),
              '  ', ' '
            ),
            '  ', ' '
          ),
          '  ', ' '
        )
      )
    ),
    instagram_handle = NULLIF(
      lower(ltrim(trim(instagram_handle), '@')),
      ''
    ),
    normalized_instagram_handle = NULLIF(
      lower(ltrim(trim(instagram_handle), '@')),
      ''
    );

-- "Artist unknown" is a display state, never a persisted artist identity.
UPDATE artworks
SET artist_id = NULL
WHERE artist_id IN (
  SELECT id
  FROM artists
  WHERE normalized_name IN ('artist unknown', 'unknown artist')
);

DELETE FROM artists
WHERE normalized_name IN ('artist unknown', 'unknown artist');

DROP TABLE IF EXISTS artist_identity_merge_map;
CREATE TABLE artist_identity_merge_map (
  artist_id INTEGER PRIMARY KEY,
  canonical_id INTEGER NOT NULL
);

-- Connected components cover transitive duplicates (same name OR same handle).
INSERT INTO artist_identity_merge_map (artist_id, canonical_id)
WITH RECURSIVE
  edges(source_id, target_id) AS (
    SELECT left_artist.id, right_artist.id
    FROM artists AS left_artist
    INNER JOIN artists AS right_artist
      ON left_artist.id <> right_artist.id
     AND (
       (
         left_artist.normalized_name <> ''
         AND left_artist.normalized_name = right_artist.normalized_name
       )
       OR (
         left_artist.normalized_instagram_handle IS NOT NULL
         AND left_artist.normalized_instagram_handle =
           right_artist.normalized_instagram_handle
       )
     )
  ),
  reachable(source_id, target_id) AS (
    SELECT id, id FROM artists
    UNION
    SELECT source_id, target_id FROM edges
    UNION
    SELECT reachable.source_id, edges.target_id
    FROM reachable
    INNER JOIN edges ON edges.source_id = reachable.target_id
  )
SELECT source_id, MIN(target_id)
FROM reachable
GROUP BY source_id;

-- Keep the earliest canonical record and fill only missing profile metadata.
UPDATE artists
SET instagram_handle = COALESCE(
      NULLIF(trim(instagram_handle), ''),
      (
        SELECT candidate.instagram_handle
        FROM artist_identity_merge_map AS member
        INNER JOIN artists AS candidate ON candidate.id = member.artist_id
        WHERE member.canonical_id = artists.id
          AND NULLIF(trim(candidate.instagram_handle), '') IS NOT NULL
        ORDER BY candidate.id
        LIMIT 1
      )
    ),
    website_url = COALESCE(
      NULLIF(trim(website_url), ''),
      (
        SELECT candidate.website_url
        FROM artist_identity_merge_map AS member
        INNER JOIN artists AS candidate ON candidate.id = member.artist_id
        WHERE member.canonical_id = artists.id
          AND NULLIF(trim(candidate.website_url), '') IS NOT NULL
        ORDER BY candidate.id
        LIMIT 1
      )
    ),
    bio = COALESCE(
      NULLIF(trim(bio), ''),
      (
        SELECT candidate.bio
        FROM artist_identity_merge_map AS member
        INNER JOIN artists AS candidate ON candidate.id = member.artist_id
        WHERE member.canonical_id = artists.id
          AND NULLIF(trim(candidate.bio), '') IS NOT NULL
        ORDER BY candidate.id
        LIMIT 1
      )
    )
WHERE id IN (
  SELECT canonical_id FROM artist_identity_merge_map
);

UPDATE artworks
SET artist_id = (
      SELECT canonical_id
      FROM artist_identity_merge_map
      WHERE artist_id = artworks.artist_id
    )
WHERE artist_id IN (
  SELECT artist_id
  FROM artist_identity_merge_map
  WHERE artist_id <> canonical_id
);

DELETE FROM artists
WHERE id IN (
  SELECT artist_id
  FROM artist_identity_merge_map
  WHERE artist_id <> canonical_id
);

UPDATE artists
SET normalized_name = lower(
      trim(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    replace(name, char(9), ' '),
                    char(10), ' '
                  ),
                  char(13), ' '
                ),
                '  ', ' '
              ),
              '  ', ' '
            ),
            '  ', ' '
          ),
          '  ', ' '
        )
      )
    ),
    instagram_handle = NULLIF(
      lower(ltrim(trim(instagram_handle), '@')),
      ''
    ),
    normalized_instagram_handle = NULLIF(
      lower(ltrim(trim(instagram_handle), '@')),
      ''
    );

DROP TABLE artist_identity_merge_map;

CREATE UNIQUE INDEX artists_normalized_name_unique
ON artists(normalized_name)
WHERE normalized_name IS NOT NULL AND normalized_name <> '';

CREATE UNIQUE INDEX artists_normalized_instagram_unique
ON artists(normalized_instagram_handle)
WHERE normalized_instagram_handle IS NOT NULL;

CREATE TRIGGER artists_reject_unknown_insert
BEFORE INSERT ON artists
WHEN lower(trim(NEW.name)) IN ('artist unknown', 'unknown artist')
BEGIN
  SELECT RAISE(ABORT, 'unknown artist must use a NULL artist_id');
END;

CREATE TRIGGER artists_reject_unknown_update
BEFORE UPDATE OF name ON artists
WHEN lower(trim(NEW.name)) IN ('artist unknown', 'unknown artist')
BEGIN
  SELECT RAISE(ABORT, 'unknown artist must use a NULL artist_id');
END;
