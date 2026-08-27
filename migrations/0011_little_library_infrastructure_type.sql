DROP TRIGGER IF EXISTS artworks_validate_infrastructure_type_insert;
DROP TRIGGER IF EXISTS artworks_validate_infrastructure_type_update;

CREATE TRIGGER artworks_validate_infrastructure_type_insert
BEFORE INSERT ON artworks
WHEN NEW.infrastructure_type NOT IN (
  'Utility box / cabinet',
  'Wall / mural',
  'Bollard / post',
  'Door / shutter',
  'Bench / street furniture',
  'Little library',
  'Tree / natural feature',
  'Bridge / underpass',
  'Sign / panel',
  'Sculpture / installation',
  'Other'
)
BEGIN
  SELECT RAISE(ABORT, 'invalid artwork infrastructure type');
END;

CREATE TRIGGER artworks_validate_infrastructure_type_update
BEFORE UPDATE OF infrastructure_type ON artworks
WHEN NEW.infrastructure_type NOT IN (
  'Utility box / cabinet',
  'Wall / mural',
  'Bollard / post',
  'Door / shutter',
  'Bench / street furniture',
  'Little library',
  'Tree / natural feature',
  'Bridge / underpass',
  'Sign / panel',
  'Sculpture / installation',
  'Other'
)
BEGIN
  SELECT RAISE(ABORT, 'invalid artwork infrastructure type');
END;
