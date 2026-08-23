type ArtworkDisplayInfo = {
  id?: number;
  title: string | null;
  infrastructure_type?: string | null;
  city?: string | null;
  town?: string | null;
};

function capitalise(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function getArtworkDisplayTitle(
  artwork: ArtworkDisplayInfo,
) {
  const realTitle = artwork.title?.trim();

  if (realTitle) {
    return realTitle;
  }

  const type = artwork.infrastructure_type?.trim();
  const place = artwork.city?.trim() || artwork.town?.trim();

  if (type && place) {
    return `${capitalise(type)} in ${place}`;
  }

  if (type) {
    return capitalise(type);
  }

  if (place) {
    return `Artwork in ${place}`;
  }

  if (artwork.id) {
    return `Artwork #${artwork.id}`;
  }

  return "Untitled artwork";
}