import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import * as exifr from "exifr";
import "./App.css";
import LibRaw from "libraw-wasm";
import { getArtworkDisplayTitle } from "./artworkDisplay";
import { authClient } from "./lib/auth-client";
import CommunitySafetyNotice from "./CommunitySafetyNotice";

type Stage = "upload" | "review";
type NearbyArtwork = {
  id: number;
  title: string | null;
  latitude: number;
  longitude: number;
  infrastructure_type: string;
  city: string | null;
  artist_name: string | null;
  primary_photo: string | null;
  photo_count: number;
  distance_metres: number;
  artist_id: number | null;
};
async function normaliseImage(file: File): Promise<File> {
  const MAX_DIMENSION = 2200;
  const JPEG_QUALITY = 0.88;

  function createJpegBlob(canvas: HTMLCanvasElement) {
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error("Image conversion failed."));
          }
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    });
  }


  function calculateSize(width: number, height: number) {
    if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
      return { width, height };
    }

    const scale = Math.min(
      MAX_DIMENSION / width,
      MAX_DIMENSION / height,
    );

    return {
      width: Math.round(width * scale),
      height: Math.round(height * scale),
    };
  }

  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".dng")) {
    const raw = new LibRaw();

    try {
      const buffer = await file.arrayBuffer();

      await raw.open(new Uint8Array(buffer), {
        halfSize: true,
        outputBps: 8,
        outputColor: 1,
        useCameraWb: true,
      });

      const decoded = await raw.imageData();

      if (!decoded) {
        throw new Error("Could not decode DNG.");
      }

      const { width, height, colors, data } = decoded;

      if (colors < 3) {
        throw new Error("Decoded DNG did not contain RGB data.");
      }

      const source =
        data instanceof Uint16Array
          ? new Uint8Array(
            Array.from(data, (value) => Math.round(value / 257)),
          )
          : data;

      const rgba = new Uint8ClampedArray(width * height * 4);

      for (let pixel = 0; pixel < width * height; pixel++) {
        const sourceIndex = pixel * colors;
        const targetIndex = pixel * 4;

        rgba[targetIndex] = source[sourceIndex];
        rgba[targetIndex + 1] = source[sourceIndex + 1];
        rgba[targetIndex + 2] = source[sourceIndex + 2];
        rgba[targetIndex + 3] = 255;
      }

      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = width;
      sourceCanvas.height = height;

      const sourceContext = sourceCanvas.getContext("2d");

      if (!sourceContext) {
        throw new Error("Could not create DNG conversion canvas.");
      }

      sourceContext.putImageData(
        new ImageData(rgba, width, height),
        0,
        0,
      );

      const targetSize = calculateSize(width, height);

      const canvas = document.createElement("canvas");
      canvas.width = targetSize.width;
      canvas.height = targetSize.height;

      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Could not create output canvas.");
      }

      context.drawImage(
        sourceCanvas,
        0,
        0,
        targetSize.width,
        targetSize.height,
      );

      const blob = await createJpegBlob(canvas);
      const cleanName = file.name.replace(/\.dng$/i, ".jpg");

      return new File([blob], cleanName, {
        type: "image/jpeg",
      });
    } finally {
      raw.dispose();
    }
  }

  const bitmap = await createImageBitmap(file);

  try {
    const targetSize = calculateSize(
      bitmap.width,
      bitmap.height,
    );

    const canvas = document.createElement("canvas");
    canvas.width = targetSize.width;
    canvas.height = targetSize.height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not create image conversion canvas.");
    }

    context.drawImage(
      bitmap,
      0,
      0,
      targetSize.width,
      targetSize.height,
    );

    const blob = await createJpegBlob(canvas);

    const cleanName = file.name.replace(/\.[^.]+$/, ".jpg");

    return new File([blob], cleanName, {
      type: "image/jpeg",
    });
  } finally {
    bitmap.close();
  }
}


async function createThumbnail(file: File): Promise<File> {
  const MAX_DIMENSION = 800;
  const JPEG_QUALITY = 0.78;

  const bitmap = await createImageBitmap(file);

  try {
    const scale = Math.min(
      1,
      MAX_DIMENSION / bitmap.width,
      MAX_DIMENSION / bitmap.height,
    );

    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not create thumbnail canvas.");
    }

    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error("Thumbnail creation failed."));
          }
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    });

    const cleanName =
      file.name.replace(/\.[^.]+$/, "") + "-thumb.jpg";

    return new File([blob], cleanName, {
      type: "image/jpeg",
    });
  } finally {
    bitmap.close();
  }
}

const MAX_PHOTOS_PER_ARTWORK = 3;
export default function AddArtwork() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();


  useEffect(() => {
    if (!isPending && !session?.user) {
      navigate("/login", { replace: true });
    }
  }, [isPending, session, navigate]);

  const [stage, setStage] = useState<Stage>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [nearbyArtworks, setNearbyArtworks] = useState<NearbyArtwork[]>([]);
  const [checkingNearby, setCheckingNearby] = useState(false);
  const [primaryPhotoIndex, setPrimaryPhotoIndex] = useState(0);

  const [title, setTitle] = useState("");
  const [artistName, setArtistName] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [description, setDescription] = useState("");
  const [infrastructureType, setInfrastructureType] =
    useState("utility cabinet");

  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationSource, setLocationSource] = useState<
    "photo" | "device" | null
  >(null);

  const [readingPhoto, setReadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function checkNearbyArtworks(latitude: number, longitude: number) {
    setCheckingNearby(true);

    try {
      const response = await fetch(
        `/api/artworks/nearby?latitude=${latitude}&longitude=${longitude}&radius=100`,
      );

      if (!response.ok) {
        throw new Error(`Nearby API returned ${response.status}`);
      }

      const data = (await response.json()) as NearbyArtwork[];
      setNearbyArtworks(data);
    } catch (error) {
      console.error("Nearby artwork check failed:", error);
      setNearbyArtworks([]);
    } finally {
      setCheckingNearby(false);
    }
  }

  async function handleFiles(selectedFiles: File[]) {
    if (selectedFiles.length === 0) {
      return;
    }

    if (selectedFiles.length > MAX_PHOTOS_PER_ARTWORK) {
      setError(
        `You can upload a maximum of ${MAX_PHOTOS_PER_ARTWORK} photos per artwork.`,
      );
      return;
    }

    setReadingPhoto(true);
    setError("");
    setNearbyArtworks([]);

    previewUrls.forEach((url) => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    });

    setFiles(selectedFiles);
    const urls = await Promise.all(
      selectedFiles.map(async (selectedFile) => {
        const isDng = selectedFile.name.toLowerCase().endsWith(".dng");

        if (isDng) {
          try {
            const converted = await normaliseImage(selectedFile);

            return URL.createObjectURL(converted);
          } catch (error) {
            console.warn("Could not create DNG preview:", error);

            return "";
          }
        }

        if (selectedFile.type.startsWith("image/")) {
          return URL.createObjectURL(selectedFile);
        }

        return "";
      }),
    );

    setPreviewUrls(urls);


    const primaryFile = selectedFiles[0];

    try {
      const gps = await exifr.gps(primaryFile);

      if (
        gps &&
        typeof gps.latitude === "number" &&
        typeof gps.longitude === "number"
      ) {
        setLatitude(gps.latitude);
        setLongitude(gps.longitude);
        setLocationSource("photo");
        await checkNearbyArtworks(gps.latitude, gps.longitude);
      } else {
        setLatitude(null);
        setLongitude(null);
        setLocationSource(null);
      }

      setStage("review");
    } catch {
      setError("Could not read metadata from this photo.");
      setStage("review");
    } finally {
      setReadingPhoto(false);
    }
  }
  function removePhoto(indexToRemove: number) {
    const urlToRemove = previewUrls[indexToRemove];

    if (urlToRemove) {
      URL.revokeObjectURL(urlToRemove);
    }

    const newFiles = files.filter((_, index) => index !== indexToRemove);

    const newPreviewUrls = previewUrls.filter(
      (_, index) => index !== indexToRemove,
    );

    setFiles(newFiles);
    setPreviewUrls(newPreviewUrls);

    if (newFiles.length === 0) {
      setStage("upload");
      setLatitude(null);
      setLongitude(null);
      setLocationSource(null);
      setPrimaryPhotoIndex(0);
      return;
    }

    if (primaryPhotoIndex === indexToRemove) {
      setPrimaryPhotoIndex(0);
    } else if (primaryPhotoIndex > indexToRemove) {
      setPrimaryPhotoIndex(primaryPhotoIndex - 1);
    }
  }

  function useCurrentLocation() {
    setError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
        setLocationSource("device");
      },
      () => {
        setError("Could not get your current location.");
      },
      {
        enableHighAccuracy: true,
      },
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (files.length === 0) {
      setError("Choose at least one photo first.");
      return;
    }

    if (latitude === null || longitude === null) {
      setError("We need a location before this artwork can be added.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const formData = new FormData();

      formData.append("title", title);
      formData.append("artist_name", artistName);
      formData.append("instagram_handle", instagramHandle);
      formData.append("description", description);
      formData.append("infrastructure_type", infrastructureType);
      formData.append("latitude", latitude.toString());
      formData.append("longitude", longitude.toString());
      formData.append("town", "Leeds");
      formData.append("city", "Leeds");

      const orderedFiles = [
        files[primaryPhotoIndex],
        ...files.filter((_, index) => index !== primaryPhotoIndex),
      ];

      for (const file of orderedFiles) {
        const normalised = await normaliseImage(file);
        const thumbnail = await createThumbnail(normalised);

        formData.append("photos", normalised);
        formData.append("thumbnails", thumbnail);
      }

      const response = await fetch("/api/artworks", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const artwork = await response.json();

      navigate(`/artwork/${artwork.id}`);
    } catch (error) {
      console.error(error);
      setError("Could not add artwork.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="detail-shell">
      <header className="detail-header">
        <Link to="/" className="back-link">
          ← Back to map
        </Link>

        <span className="detail-number">New artwork</span>
      </header>

      <main className="detail-main">
        <section className="add-artwork-panel">
          {stage === "upload" && (
            <>
              <span className="eyebrow">CONTRIBUTE</span>

              <h1>Add artwork</h1>

              <p>

                Upload up to 5 photos and we’ll pull out whatever useful information we can.

              </p>

              <CommunitySafetyNotice context="upload" />

              <label
                className="photo-upload"
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();

                  const droppedFiles = Array.from(event.dataTransfer.files);

                  handleFiles(droppedFiles);
                }}
              >
                <input
                  type="file"
                  accept="image/*,.dng"
                  multiple
                  onChange={(event) => {
                    const selectedFiles = Array.from(event.target.files ?? []);

                    handleFiles(selectedFiles);
                  }}
                />

                <span className="photo-upload-icon">📷</span>

                <strong>Choose up to 5 artwork photos</strong>

                <span>Drop up to 5 photos here, or click to browse</span>
              </label>

              {readingPhoto && <p className="message">Reading photo…</p>}

              {error && <p className="form-error">{error}</p>}
            </>
          )}

          {stage === "review" && (
            <>
              <span className="eyebrow">CHECK THE DETAILS</span>

              <h1>Does this look right?</h1>

              <p>Correct anything we’ve missed, then confirm.</p>

              {files.length > 0 && (
                <div className="upload-preview-grid">
                  {files.map((selectedFile, index) => (
                    <div
                      className="upload-preview-wrap"
                      key={`${selectedFile.name}-${index}`}
                    >
                      {previewUrls[index] ? (
                        <img
                          src={previewUrls[index]}
                          alt={`Artwork preview ${index + 1}`}
                          className="upload-preview"
                        />
                      ) : (
                        <div className="raw-preview">
                          <strong>DNG photo</strong>
                          <span>{selectedFile.name}</span>
                          <span>Preview unavailable in browser</span>
                        </div>
                      )}

                      <div className="photo-preview-actions">
                        {primaryPhotoIndex === index ? (
                          <span className="primary-photo-badge">
                            Primary photo
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="make-primary-button"
                            onClick={() => setPrimaryPhotoIndex(index)}
                          >
                            Make primary
                          </button>
                        )}

                        <button
                          type="button"
                          className="remove-photo-button"
                          onClick={() => removePhoto(index)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <form className="add-artwork-form" onSubmit={handleSubmit}>
                <label>
                  Title
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Optional"
                  />
                </label>

                <label>
                  Artist name
                  <input
                    value={artistName}
                    onChange={(event) => setArtistName(event.target.value)}
                    placeholder="Optional"
                  />
                </label>

                <label>
                  Instagram handle
                  <input
                    value={instagramHandle}
                    onChange={(event) =>
                      setInstagramHandle(event.target.value.replace(/^@/, ""))
                    }
                    placeholder="Optional — without @"
                  />
                </label>

                <label>
                  Type
                  <select
                    value={infrastructureType}
                    onChange={(event) =>
                      setInfrastructureType(event.target.value)
                    }
                  >
                    <option value="utility cabinet">Utility cabinet</option>

                    <option value="street cabinet">Street cabinet</option>

                    <option value="bollard">Bollard</option>

                    <option value="other">Other</option>
                  </select>
                </label>

                <label>
                  Description
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={4}
                  />
                </label>

                <div className="location-review">
                  <div>
                    <span className="location-review-label">Location</span>

                    {latitude !== null && longitude !== null ? (
                      <>
                        <strong>📍 Location found</strong>

                        <span>
                          {locationSource === "photo"
                            ? "Taken from photo metadata"
                            : "Using your current location"}
                        </span>
                      </>
                    ) : (
                      <>
                        <strong>⚠️ No location found</strong>

                        <span>This photo doesn’t contain GPS data.</span>
                      </>
                    )}
                  </div>

                  {checkingNearby && (
                    <div className="duplicate-check">
                      Checking for nearby artwork…
                    </div>
                  )}

                  {!checkingNearby && nearbyArtworks.length > 0 && (
                    <div className="duplicate-check duplicate-check-warning">
                      <span className="eyebrow">NEARBY EXISTING LISTINGS</span>

                      <h3>This artwork may already be on the map</h3>

                      <p>
                        These are existing artworks near the location of your photo.
                        Check them before creating a new listing.
                      </p>

                      <div className="duplicate-list">
                        {[...nearbyArtworks]
                          .sort((a, b) => a.distance_metres - b.distance_metres)
                          .slice(0, 4)
                          .map((artwork, index) => (
                            <div
                              className={`duplicate-item ${index === 0 ? "duplicate-item-best-match" : ""
                                }`}
                              key={artwork.id}
                            >{index === 0 && (
                              <>
                                <span className="best-match-label">
                                  {artwork.distance_metres <= 10
                                    ? "Likely same artwork"
                                    : "Closest match"}
                                </span>

                                {artwork.distance_metres <= 10 && (
                                  <p className="likely-match-note">
                                    This is only {artwork.distance_metres} m from your photo.
                                    Check this listing before creating a new one.
                                  </p>
                                )}
                              </>
                            )}
                              {artwork.primary_photo && (
                                <img
                                  src={`/api/images/${artwork.primary_photo}`}
                                  alt={getArtworkDisplayTitle(artwork)}
                                />
                              )}

                              <div>
                                <strong>
                                  {getArtworkDisplayTitle(artwork)}
                                </strong>

                                <span>
                                  {artwork.artist_name ?? "Artist unknown"}
                                </span>

                                <span>{artwork.distance_metres} m away</span>
                                <span>
                                  {artwork.photo_count} of {MAX_PHOTOS_PER_ARTWORK} photos
                                  {artwork.photo_count < MAX_PHOTOS_PER_ARTWORK
                                    ? ` · ${MAX_PHOTOS_PER_ARTWORK - artwork.photo_count} ${MAX_PHOTOS_PER_ARTWORK - artwork.photo_count === 1
                                      ? "space"
                                      : "spaces"
                                    } left`
                                    : " · Photo limit reached"}
                                </span>
                              </div>


                              <div className="duplicate-actions">
                                <Link
                                  to={`/artwork/${artwork.id}`}
                                  className="secondary-button"
                                >
                                  View & check in
                                </Link>

                                <button
                                  type="button"
                                  className="primary-link"
                                  disabled={
                                    saving ||
                                    artwork.photo_count >= MAX_PHOTOS_PER_ARTWORK ||
                                    files.length >
                                    MAX_PHOTOS_PER_ARTWORK - artwork.photo_count
                                  }
                                  onClick={async () => {
                                    try {
                                      setSaving(true);
                                      setError("");

                                      const formData = new FormData();

                                      const orderedFiles = [
                                        files[primaryPhotoIndex],
                                        ...files.filter(
                                          (_, index) => index !== primaryPhotoIndex,
                                        ),
                                      ];

                                      for (const file of orderedFiles) {
                                        const normalised = await normaliseImage(file);
                                        const thumbnail = await createThumbnail(normalised);

                                        formData.append("photos", normalised);
                                        formData.append("thumbnails", thumbnail);
                                      }

                                      const response = await fetch(
                                        `/api/artworks/${artwork.id}/photos`,
                                        {
                                          method: "POST",
                                          body: formData,
                                        },
                                      );

                                      if (!response.ok) {
                                        const data = await response
                                          .json()
                                          .catch(() => null);

                                        throw new Error(
                                          data?.error ??
                                          `API returned ${response.status}`,
                                        );
                                      }

                                      navigate(`/artwork/${artwork.id}`);
                                    } catch (error) {
                                      console.error(error);

                                      setError(
                                        error instanceof Error
                                          ? error.message
                                          : "Could not add photos.",
                                      );
                                    } finally {
                                      setSaving(false);
                                    }
                                  }}
                                >
                                  {artwork.photo_count >= MAX_PHOTOS_PER_ARTWORK
                                    ? "Photo limit reached"
                                    : files.length >
                                      MAX_PHOTOS_PER_ARTWORK -
                                      artwork.photo_count
                                      ? `Choose up to ${MAX_PHOTOS_PER_ARTWORK -
                                      artwork.photo_count
                                      } ${MAX_PHOTOS_PER_ARTWORK -
                                        artwork.photo_count ===
                                        1
                                        ? "photo"
                                        : "photos"
                                      }`
                                      : saving
                                        ? "Adding photos…"
                                        : "Add these photos"}
                                </button>
                              </div>
                            </div>
                          ))}

                      </div>
                    </div>
                  )}

                  {latitude === null || longitude === null ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={useCurrentLocation}
                    >
                      📍 Use my current location
                    </button>
                  ) : null}
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => navigate("/")}
                  >
                    Cancel upload
                  </button>

                  {nearbyArtworks.length === 0 ? (
                    <button className="checkin-button" disabled={saving}>
                      {saving ? "Adding artwork…" : "Confirm & add artwork"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="checkin-button"
                      onClick={() => {
                        setNearbyArtworks([]);
                      }}
                    >
                      {Math.min(
                        ...nearbyArtworks.map(
                          (artwork) => artwork.distance_metres,
                        ),
                      ) <= 10
                        ? "I'm sure this is a different artwork"
                        : "This is a different artwork"}
                    </button>
                  )}
                </div>
              </form>
            </>
          )}
        </section>
      </main>
    </div >
  );
}
