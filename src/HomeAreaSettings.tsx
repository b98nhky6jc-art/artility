import { useEffect, useState } from "react";
export type HomeArea = { town: string; city: string; latitude: number; longitude: number };
export const homeAreaKey = (userId: string) => `artility-home-area:${userId}`;
export default function HomeAreaSettings({ userId }: { userId: string }) {
  const [place, setPlace] = useState(""); const [point, setPoint] = useState<{ latitude: number; longitude: number } | null>(null); const [message, setMessage] = useState("");
  useEffect(() => { const saved = localStorage.getItem(homeAreaKey(userId)); if (saved) { const area = JSON.parse(saved) as HomeArea; setPlace(area.town || area.city); setPoint(area); } }, [userId]);
  function locate() { navigator.geolocation?.getCurrentPosition((p) => { setPoint({ latitude: Math.round(p.coords.latitude * 100) / 100, longitude: Math.round(p.coords.longitude * 100) / 100 }); setMessage("Approximate map point selected."); }, () => setMessage("Location was unavailable."), { enableHighAccuracy: false }); }
  function save(e: React.FormEvent) { e.preventDefault(); if (!point) return setMessage("Use your current location first."); localStorage.setItem(homeAreaKey(userId), JSON.stringify({ town: place, city: place, ...point })); setMessage(`Home area saved: ${place}.`); }
  return <section className="home-area-settings"><span className="eyebrow">HOME AREA</span><h2>Explore starting point</h2><p className="home-area-intro">Used as your default Explore starting point. Saved only on this device.</p><form onSubmit={save}><div className="home-area-fields"><label>Town or city<input value={place} onChange={(e) => setPlace(e.target.value)} required /></label></div><div className="home-area-actions"><button type="button" className="secondary-button home-location-button" onClick={locate}>Use current location</button><button className="primary-button">Save home area</button></div></form>{message && <p className="home-area-message" role="status">{message}</p>}</section>;
}
