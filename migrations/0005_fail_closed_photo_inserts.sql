-- Production originally added moderation_state with an approved default so the
-- existing library remained visible. Enforce quarantine for every later insert,
-- including any future code path that forgets to set the state explicitly.
CREATE TRIGGER IF NOT EXISTS photos_require_quarantine_on_insert
BEFORE INSERT ON photos
WHEN NEW.moderation_state <> 'pending'
BEGIN
  SELECT RAISE(ABORT, 'new photos must enter quarantine as pending');
END;
