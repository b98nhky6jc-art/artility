import { useEffect, useState } from "react";
export type HomeArea = { town: string; city: string; latitude: number; longitude: number };
export const homeAreaKey = (userId: string) => `artility-home-area:${userId}`;
export default function HomeAreaSettings({ userId }: { userId: string }) {
  const [town, setTown] = useState(""); const [city, setCity] = useState(""); const [point, setPoint] = useState<{ latitude: number; longitude: number } | null>(null); const [message, setMessage] = useState("");
  useEffect(() => { const saved = localStorage.getItem(homeAreaKey(userId)); if (saved) { const area = JSON.parse(saved) as HomeArea; setTown(area.town); setCity(area.city); setPoint(area); } }, [userId]);
  function locate() { navigator.geolocation?.getCurrentPosition((p) => { setPoint({ latitude: Math.round(p.coords.latitude * 100) / 100, longitude: Math.round(p.coords.longitude * 100) / 100 }); setMessage("Approximate map point selected."); }, () => setMessage("Location was unavailable."), { enableHighAccuracy: false }); }
  function save(e: React.FormEvent) { e.preventDefault(); if (!point) return setMessage("Choose an approximate map point first."); localStorage.setItem(homeAreaKey(userId), JSON.stringify({ town, city, ...point })); setMessage("Saved. Explore will start here next time."); }
  return <section className="page-panel home-area-settings"><span className="eyebrow">HOME AREA</span><h2>Where should Explore start?</h2><p>Private to this device. The point is rounded to roughly one kilometre.</p><form onSubmit={save}><input value={town} onChange={(e) => setTown(e.target.value)} placeholder="Town" required /><input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" required /><button type="button" className="secondary-button" onClick={locate}>Use my current location</button><button className="primary-button">Save home area</button></form>{message && <p>{message}</p>}</section>;
}
