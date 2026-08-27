UPDATE artworks
SET infrastructure_type = CASE lower(trim(infrastructure_type))
  WHEN 'utility box / cabinet' THEN 'Utility box / cabinet'
  WHEN 'utility cabinet' THEN 'Utility box / cabinet'
  WHEN 'street cabinet' THEN 'Utility box / cabinet'
  WHEN 'telecom cabinet' THEN 'Utility box / cabinet'
  WHEN 'utility box' THEN 'Utility box / cabinet'
  WHEN 'cabinet' THEN 'Utility box / cabinet'
  WHEN 'wall / mural' THEN 'Wall / mural'
  WHEN 'wall' THEN 'Wall / mural'
  WHEN 'mural' THEN 'Wall / mural'
  WHEN 'bollard / post' THEN 'Bollard / post'
  WHEN 'bollard' THEN 'Bollard / post'
  WHEN 'post' THEN 'Bollard / post'
  WHEN 'door / shutter' THEN 'Door / shutter'
  WHEN 'door' THEN 'Door / shutter'
  WHEN 'shutter' THEN 'Door / shutter'
  WHEN 'bench / street furniture' THEN 'Bench / street furniture'
  WHEN 'bench' THEN 'Bench / street furniture'
  WHEN 'street furniture' THEN 'Bench / street furniture'
  WHEN 'little library' THEN 'Little library'
  WHEN 'tree / natural feature' THEN 'Tree / natural feature'
  WHEN 'tree' THEN 'Tree / natural feature'
  WHEN 'natural feature' THEN 'Tree / natural feature'
  WHEN 'bridge / underpass' THEN 'Bridge / underpass'
  WHEN 'bridge' THEN 'Bridge / underpass'
  WHEN 'underpass' THEN 'Bridge / underpass'
  WHEN 'sign / panel' THEN 'Sign / panel'
  WHEN 'sign' THEN 'Sign / panel'
  WHEN 'panel' THEN 'Sign / panel'
  WHEN 'sculpture / installation' THEN 'Sculpture / installation'
  WHEN 'sculpture' THEN 'Sculpture / installation'
  WHEN 'installation' THEN 'Sculpture / installation'
  ELSE 'Other'
END;

CREATE TRIGGER IF NOT EXISTS artworks_validate_infrastructure_type_insert
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

CREATE TRIGGER IF NOT EXISTS artworks_validate_infrastructure_type_update
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
