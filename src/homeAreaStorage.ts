export type HomeArea = {
  town: string;
  city: string;
  latitude: number;
  longitude: number;
};

export const homeAreaKey = (userId: string) => `artility-home-area:${userId}`;

export function readHomeArea(userId: string): HomeArea | null {
  const saved = localStorage.getItem(homeAreaKey(userId));

  if (!saved) {
    return null;
  }

  try {
    return JSON.parse(saved) as HomeArea;
  } catch {
    return null;
  }
}
