CREATE TRIGGER IF NOT EXISTS photos_limit_per_artwork
BEFORE INSERT ON photos
WHEN (SELECT COUNT(*) FROM photos WHERE artwork_id = NEW.artwork_id) >= 5
BEGIN
  SELECT RAISE(ABORT, 'artwork photo limit reached');
END;
