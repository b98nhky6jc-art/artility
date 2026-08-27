import { useState, type FormEvent } from "react";
import { homeAreaKey, readHomeArea } from "./homeAreaStorage";

type Point = {
  latitude: number;
  longitude: number;
};

export default function HomeAreaSettings({ userId }: { userId: string }) {
  const [savedArea] = useState(() => readHomeArea(userId));
  const [place, setPlace] = useState(savedArea?.town || savedArea?.city || "");
  const [point, setPoint] = useState<Point | null>(savedArea);
  const [message, setMessage] = useState("");

  function locate() {
    navigator.geolocation?.getCurrentPosition(
      (position) => {
        setPoint({
          latitude: Math.round(position.coords.latitude * 100) / 100,
          longitude: Math.round(position.coords.longitude * 100) / 100,
        });
        setMessage("Approximate location selected.");
      },
      () => setMessage("Location was unavailable."),
      { enableHighAccuracy: false },
    );
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!point) {
      setMessage("Use your current location first.");
      return;
    }

    localStorage.setItem(
      homeAreaKey(userId),
      JSON.stringify({ town: place, city: place, ...point }),
    );
    window.dispatchEvent(new Event("artility-home-area-updated"));
    setMessage(`Starting point saved: ${place}.`);
  }

  return (
    <section className="home-area-settings" aria-labelledby="starting-point-heading">
      <div className="home-area-heading">
        <h2 id="starting-point-heading">Explore starting point</h2>
        <p>Used as your default explore starting point. Saved only on this device.</p>
      </div>

      <form onSubmit={save}>
        <label className="home-area-field">
          <span>Town or city</span>
          <input
            value={place}
            onChange={(event) => setPlace(event.target.value)}
            required
          />
        </label>

        <div className="home-area-actions">
          <button
            type="button"
            className="secondary-button home-location-button"
            onClick={locate}
          >
            Use current location
          </button>
          <button className="primary-button">Save starting point</button>
        </div>
      </form>

      {message && (
        <p className="home-area-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
