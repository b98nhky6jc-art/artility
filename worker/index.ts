import { createAuth } from "./auth.js";

const MAX_PHOTOS_PER_ARTWORK = 3;

const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    const auth = createAuth(env, ctx);

    async function getCurrentUserId() {
      const session = await auth.api.getSession({
        headers: request.headers,
      });

      return session?.user?.id ?? null;
    }

    async function requireVerifiedUser(): Promise<
      | { ok: true; userId: string }
      | { ok: false; response: Response }
    > {
      const session = await auth.api.getSession({
        headers: request.headers,
      });

      if (!session?.user) {
        return {
          ok: false,
          response: Response.json(
            { error: "Not signed in", code: "NOT_SIGNED_IN" },
            { status: 401 },
          ),
        };
      }

      if (!session.user.emailVerified) {
        return {
          ok: false,
          response: Response.json(
            {
              error:
                "Verify your email to upload artwork, edit details, or check in.",
              code: "EMAIL_VERIFICATION_REQUIRED",
            },
            { status: 403 },
          ),
        };
      }

      return { ok: true, userId: session.user.id };
    }

    if (url.pathname.startsWith("/api/auth/")) {
      return auth.handler(request);
    }

    if (url.pathname === "/api/artworks" && request.method === "POST") {
      try {

        const access = await requireVerifiedUser();

        if (!access.ok) {
          return access.response;
        }

        const userId = access.userId;
        const formData = await request.formData();

        const title =
          String(formData.get("title") ?? "").trim() || null;

        const artistName = String(
          formData.get("artist_name") ?? "",
        ).trim();

        const instagramHandle = String(
          formData.get("instagram_handle") ?? "",
        )
          .trim()
          .replace(/^@/, "")
          .toLowerCase();

        const description = String(
          formData.get("description") ?? "",
        ).trim();

        const infrastructureType = String(
          formData.get("infrastructure_type") ?? "",
        ).trim();

        const latitude = Number(formData.get("latitude"));
        const longitude = Number(formData.get("longitude"));

        const town = String(formData.get("town") ?? "").trim();
        const city = String(formData.get("city") ?? "").trim();

        const photos = formData
          .getAll("photos")
          .filter((value): value is File => value instanceof File);
        const thumbnails = formData
          .getAll("thumbnails")
          .filter((value): value is File => value instanceof File);

        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude)
        ) {
          return Response.json(
            { error: "Valid location is required" },
            { status: 400 },
          );
        }

        if (!infrastructureType) {
          return Response.json(
            { error: "Infrastructure type is required" },
            { status: 400 },
          );
        }

        if (photos.length === 0) {
          return Response.json(
            { error: "At least one photo is required" },
            { status: 400 },
          );
        }

        if (photos.length > MAX_PHOTOS_PER_ARTWORK) {
          return Response.json(
            {
              error: `You can upload a maximum of ${MAX_PHOTOS_PER_ARTWORK} photos per artwork.`,
            },
            { status: 400 },
          );
        }
        if (
          thumbnails.length > 0 &&
          thumbnails.length !== photos.length
        ) {
          return Response.json(
            { error: "Thumbnail count does not match photo count." },
            { status: 400 },
          );
        }
        for (const thumbnail of thumbnails) {
          if (thumbnail.type !== "image/jpeg") {
            return Response.json(
              { error: "Thumbnail must be a JPEG image." },
              { status: 400 },
            );
          }

          if (thumbnail.size > 2 * 1024 * 1024) {
            return Response.json(
              { error: "Thumbnail is unexpectedly large." },
              { status: 400 },
            );
          }
        }

        for (const photo of photos) {
          if (!ALLOWED_IMAGE_TYPES.has(photo.type)) {
            return Response.json(
              { error: "Unsupported image type." },
              { status: 400 },
            );
          }

          if (photo.size > MAX_IMAGE_SIZE_BYTES) {
            return Response.json(
              { error: "Each photo must be smaller than 8 MB." },
              { status: 400 },
            );
          }
        }

        let artistId: number | null = null;

        if (artistName || instagramHandle) {
          let existingArtist = null;

          if (instagramHandle) {
            existingArtist = await env.DB.prepare(`
          SELECT id
          FROM artists
          WHERE LOWER(instagram_handle) = LOWER(?)
          LIMIT 1
        `)
              .bind(instagramHandle)
              .first<{ id: number }>();
          }

          if (!existingArtist && artistName) {
            existingArtist = await env.DB.prepare(`
          SELECT id
          FROM artists
          WHERE LOWER(name) = LOWER(?)
          LIMIT 1
        `)
              .bind(artistName)
              .first<{ id: number }>();
          }

          if (existingArtist) {
            artistId = existingArtist.id;

            if (instagramHandle) {
              await env.DB.prepare(`
            UPDATE artists
            SET instagram_handle = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
              AND (
                instagram_handle IS NULL
                OR instagram_handle = ''
              )
          `)
                .bind(instagramHandle, artistId)
                .run();
            }
          } else {
            const resolvedArtistName =
              artistName ||
              (instagramHandle
                ? `@${instagramHandle}`
                : "Unknown artist");

            const artistInsert = await env.DB.prepare(`
          INSERT INTO artists (
            name,
            instagram_handle
          )
          VALUES (?, ?)
        `)
              .bind(
                resolvedArtistName,
                instagramHandle || null
              )
              .run();

            artistId = Number(
              artistInsert.meta.last_row_id
            );
          }
        }

        const artworkInsert = await env.DB.prepare(`
      INSERT INTO artworks (
        title,
        description,
        latitude,
        longitude,
        town,
        city,
        infrastructure_type,
        artist_id,
        status,
        added_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'present', ?)
    `)
          .bind(
            title,
            description || null,
            latitude,
            longitude,
            town || null,
            city || null,
            infrastructureType,
            artistId,
            userId
          )
          .run();

        const artworkId = Number(
          artworkInsert.meta.last_row_id
        );

        for (let index = 0; index < photos.length; index++) {
          const photo = photos[index];

          const extension =
            photo.name.split(".").pop()?.toLowerCase() || "jpg";

          const safeExtension =
            extension.replace(/[^a-z0-9]/g, "") || "jpg";

          const storageKey =
            `artworks/${artworkId}/photo-${index + 1}.${safeExtension}`;
          const thumbnail = thumbnails[index] ?? null;

          const thumbnailKey = thumbnail
            ? `artworks/${artworkId}/photo-${index + 1}-thumb.jpg`
            : null;
          if (thumbnail && thumbnailKey) {
            await env.IMAGES.put(
              thumbnailKey,
              thumbnail.stream(),
              {
                httpMetadata: {
                  contentType: "image/jpeg",
                },
              },
            );
          }

          await env.IMAGES.put(
            storageKey,
            photo.stream(),
            {
              httpMetadata: {
                contentType:
                  photo.type || "application/octet-stream",
              },
            }
          );

          await env.DB.prepare(`
  INSERT INTO photos (
    artwork_id,
    storage_key,
    thumbnail_key,
    is_primary,
    uploaded_by
  )
  VALUES (?, ?, ?, ?, ?)
`)
            .bind(
              artworkId,
              storageKey,
              thumbnailKey,
              index === 0 ? 1 : 0,
              userId,
            )
            .run();
        }

        return Response.json(
          {
            id: artworkId,
          },
          {
            status: 201,
          }
        );
      } catch (error) {
        console.error("Artwork upload failed:", error);

        return Response.json(
          {
            error: "Could not create artwork",
          },
          {
            status: 500,
          }
        );
      }
    }

    if (
      url.pathname === "/api/artworks/nearby" &&
      request.method === "GET"
    ) {
      const latitude = Number(
        url.searchParams.get("latitude")
      );

      const longitude = Number(
        url.searchParams.get("longitude")
      );

      const radiusMetres = Number(
        url.searchParams.get("radius") ?? "40"
      );

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        return Response.json(
          { error: "Valid latitude and longitude are required" },
          { status: 400 }
        );
      }

      const latitudeDelta = radiusMetres / 111320;

      const longitudeDelta =
        radiusMetres /
        (111320 * Math.cos((latitude * Math.PI) / 180));

      const result = await env.DB.prepare(`
  SELECT
    artworks.id,
    artworks.title,
    artworks.latitude,
    artworks.longitude,
    artworks.infrastructure_type,
    artworks.city,

    (
      SELECT COUNT(*)
      FROM photos AS artwork_photos
      WHERE artwork_photos.artwork_id = artworks.id
    ) AS photo_count,

    artists.name AS artist_name,
    photos.storage_key AS primary_photo
  FROM artworks
  LEFT JOIN artists
    ON artworks.artist_id = artists.id
  LEFT JOIN photos
    ON photos.artwork_id = artworks.id
    AND photos.is_primary = 1
  WHERE artworks.latitude BETWEEN ? AND ?
    AND artworks.longitude BETWEEN ? AND ?
  `)
        .bind(
          latitude - latitudeDelta,
          latitude + latitudeDelta,
          longitude - longitudeDelta,
          longitude + longitudeDelta
        )
        .all();

      function distanceBetween(
        lat1: number,
        lon1: number,
        lat2: number,
        lon2: number
      ) {
        const earthRadius = 6371000;

        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;

        const Δφ =
          ((lat2 - lat1) * Math.PI) / 180;

        const Δλ =
          ((lon2 - lon1) * Math.PI) / 180;

        const a =
          Math.sin(Δφ / 2) ** 2 +
          Math.cos(φ1) *
          Math.cos(φ2) *
          Math.sin(Δλ / 2) ** 2;

        const c =
          2 *
          Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
          );

        return earthRadius * c;
      }

      const nearby = result.results
        .map((artwork) => {
          const distanceMetres = Math.round(
            distanceBetween(
              latitude,
              longitude,
              Number(artwork.latitude),
              Number(artwork.longitude)
            )
          );

          return {
            ...artwork,
            distance_metres: distanceMetres,
          };
        })
        .filter(
          (artwork) =>
            artwork.distance_metres <= radiusMetres
        )
        .sort(
          (a, b) =>
            a.distance_metres - b.distance_metres
        );

      return Response.json(nearby);
    }
    if (url.pathname === "/api/artists" && request.method === "GET") {
      const result = await env.DB.prepare(`
    SELECT
      artists.id,
      artists.name,
      artists.instagram_handle,
      artists.website_url,
      artists.bio,
      artists.created_at,
      COUNT(artworks.id) AS artwork_count,
      (
        SELECT photos.storage_key
        FROM artworks AS representative_artwork
        LEFT JOIN photos
          ON photos.artwork_id = representative_artwork.id
          AND photos.is_primary = 1
        WHERE representative_artwork.artist_id = artists.id
          AND photos.storage_key IS NOT NULL
        ORDER BY representative_artwork.created_at DESC
        LIMIT 1
      ) AS primary_photo
    FROM artists
    LEFT JOIN artworks
      ON artworks.artist_id = artists.id
    GROUP BY artists.id
    HAVING COUNT(artworks.id) > 0
    ORDER BY artists.name COLLATE NOCASE
  `).all();

      const unknownResult = await env.DB.prepare(`
    SELECT
      COUNT(artworks.id) AS artwork_count,
      (
        SELECT photos.storage_key
        FROM artworks AS representative_artwork
        LEFT JOIN photos
          ON photos.artwork_id = representative_artwork.id
          AND photos.is_primary = 1
        WHERE representative_artwork.artist_id IS NULL
          AND photos.storage_key IS NOT NULL
        ORDER BY representative_artwork.created_at DESC
        LIMIT 1
      ) AS primary_photo
    FROM artworks
    WHERE artworks.artist_id IS NULL
  `).first<{
        artwork_count: number;
        primary_photo: string | null;
      }>();

      const artists = [...result.results];

      if (Number(unknownResult?.artwork_count ?? 0) > 0) {
        artists.unshift({
          id: "unknown",
          name: "Artist unknown",
          instagram_handle: null,
          website_url: null,
          bio: null,
          created_at: null,
          artwork_count: Number(unknownResult?.artwork_count ?? 0),
          primary_photo: unknownResult?.primary_photo ?? null,
        });
      }

      return Response.json(artists);
    }

    const artistDetailMatch = url.pathname.match(
      /^\/api\/artists\/([^/]+)$/,
    );

    if (artistDetailMatch && request.method === "GET") {
      const artistId = artistDetailMatch[1];

      if (artistId === "unknown") {
        const artworks = await env.DB.prepare(`
      SELECT
        artworks.id,
        artworks.title,
        artworks.description,
        artworks.latitude,
        artworks.longitude,
        artworks.town,
        artworks.city,
        artworks.infrastructure_type,
        artworks.status,
        artworks.artist_id,
        artworks.created_at,
        photos.storage_key AS primary_photo
      FROM artworks
      LEFT JOIN photos
        ON photos.artwork_id = artworks.id
        AND photos.is_primary = 1
      WHERE artworks.artist_id IS NULL
      ORDER BY artworks.created_at DESC
    `).all();

        return Response.json({
          artist: {
            id: "unknown",
            name: "Artist unknown",
            instagram_handle: null,
            website_url: null,
            bio: null,
            created_at: null,
          },
          artworks: artworks.results,
        });
      }

      const numericArtistId = Number(artistId);
      const artist = await env.DB.prepare(`
  SELECT
    id,
    name,
    instagram_handle,
    website_url,
    bio,
    created_at
  FROM artists
  WHERE id = ?
`)
        .bind(numericArtistId)
        .first();

      if (!artist) {
        return new Response("Artist not found", {
          status: 404,
        });
      }

      const artworks = await env.DB.prepare(`
        SELECT
          artworks.id,
          artworks.title,
          artworks.description,
          artworks.latitude,
          artworks.longitude,
          artworks.town,
          artworks.city,
          artworks.infrastructure_type,
artworks.status,
artworks.artist_id,
artworks.created_at,
          photos.storage_key AS primary_photo
        FROM artworks
        LEFT JOIN photos
          ON photos.artwork_id = artworks.id
          AND photos.is_primary = 1
        WHERE artworks.artist_id = ?
        ORDER BY artworks.created_at DESC
      `)
        .bind(numericArtistId)
        .all();

      return Response.json({
        artist,
        artworks: artworks.results,
      });
    }
    if (url.pathname === "/api/artworks" && request.method === "GET") {
      const result = await env.DB.prepare(`
        SELECT
          artworks.id,
          artworks.title,
          artworks.description,
          artworks.latitude,
          artworks.longitude,
          artworks.town,
          artworks.city,
          artworks.infrastructure_type,
          artworks.status,
artworks.created_at,

(
  SELECT COUNT(DISTINCT checkins.user_id)
  FROM checkins
  WHERE checkins.artwork_id = artworks.id
) AS checkin_count,

(
  SELECT MAX(checkins.checked_in_at)
  FROM checkins
  WHERE checkins.artwork_id = artworks.id
) AS last_checkin_at,

artists.name AS artist_name,
artists.instagram_handle,
photos.storage_key AS primary_photo,
photos.created_at AS photo_added_at
        FROM artworks
        LEFT JOIN artists
          ON artworks.artist_id = artists.id
        LEFT JOIN photos
          ON photos.artwork_id = artworks.id
          AND photos.is_primary = 1
        ORDER BY artworks.created_at DESC
      `).all();

      return Response.json(result.results);
    }

    const artworkDetailMatch = url.pathname.match(
  /^\/api\/artworks\/(\d+)$/,
);

if (artworkDetailMatch && request.method === "GET") {
  const artworkId = Number(artworkDetailMatch[1]);

  const artwork = await env.DB.prepare(`
    SELECT
      artworks.id,
      artworks.title,
      artworks.description,
      artworks.latitude,
      artworks.longitude,
      artworks.town,
      artworks.city,
      artworks.infrastructure_type,
      artworks.status,
      artworks.artist_id,
      artworks.created_at,

      (
        SELECT COUNT(DISTINCT checkins.user_id)
        FROM checkins
        WHERE checkins.artwork_id = artworks.id
      ) AS checkin_count,

      (
        SELECT MAX(checkins.checked_in_at)
        FROM checkins
        WHERE checkins.artwork_id = artworks.id
      ) AS last_checkin_at,

      artists.name AS artist_name,
      artists.instagram_handle

    FROM artworks
    LEFT JOIN artists
      ON artworks.artist_id = artists.id
    WHERE artworks.id = ?
    LIMIT 1
  `)
    .bind(artworkId)
    .first();

  if (!artwork) {
    return Response.json(
      { error: "Artwork not found" },
      { status: 404 },
    );
  }

  const photos = await env.DB.prepare(`
    SELECT
      id,
      storage_key,
      is_primary,
      created_at
    FROM photos
    WHERE artwork_id = ?
    ORDER BY is_primary DESC, id ASC
  `)
    .bind(artworkId)
    .all();

  return Response.json({
    artwork,
    photos: photos.results,
  });
}

    const artworkEditMatch = url.pathname.match(
      /^\/api\/artworks\/(\d+)$/,
    );

    if (artworkEditMatch && request.method === "PATCH") {
      try {
        const access = await requireVerifiedUser();

        if (!access.ok) {
          return access.response;
        }

        const userId = access.userId;

        const artworkId = Number(artworkEditMatch[1]);

        const current = await env.DB.prepare(`
          SELECT
            artworks.id,
            artworks.title,
            artworks.description,
            artworks.infrastructure_type,
            artworks.artist_id,
            artists.name AS artist_name,
            artists.instagram_handle
          FROM artworks
          LEFT JOIN artists
            ON artworks.artist_id = artists.id
          WHERE artworks.id = ?
          LIMIT 1
        `)
          .bind(artworkId)
          .first<{
            id: number;
            title: string | null;
            description: string | null;
            infrastructure_type: string;
            artist_id: number | null;
            artist_name: string | null;
            instagram_handle: string | null;
          }>();

        if (!current) {
          return Response.json(
            { error: "Artwork not found" },
            { status: 404 },
          );
        }

        const body = (await request.json()) as Record<string, unknown>;

        const allowedFields = new Set([
          "title",
          "description",
          "infrastructure_type",
          "artist_name",
          "instagram_handle",
        ]);

        for (const key of Object.keys(body)) {
          if (!allowedFields.has(key)) {
            return Response.json(
              { error: `Field "${key}" cannot be edited` },
              { status: 400 },
            );
          }

          const value = body[key];

          if (value !== null && typeof value !== "string") {
            return Response.json(
              { error: `Field "${key}" must be text` },
              { status: 400 },
            );
          }
        }

        function readText(
          key: string,
          currentValue: string | null,
        ): string | null {
          if (!Object.prototype.hasOwnProperty.call(body, key)) {
            return currentValue;
          }

          const value = body[key];

          if (value === null) {
            return null;
          }

          return String(value).trim() || null;
        }

        const title = readText("title", current.title);

        const description = readText(
          "description",
          current.description,
        );

        const infrastructureType = readText(
          "infrastructure_type",
          current.infrastructure_type,
        );

        if (!infrastructureType) {
          return Response.json(
            { error: "Infrastructure type is required" },
            { status: 400 },
          );
        }

        if (title && title.length > 200) {
          return Response.json(
            { error: "Title is too long" },
            { status: 400 },
          );
        }

        if (description && description.length > 2000) {
          return Response.json(
            { error: "Description is too long" },
            { status: 400 },
          );
        }

        const artistFieldsTouched =
          Object.prototype.hasOwnProperty.call(body, "artist_name") ||
          Object.prototype.hasOwnProperty.call(
            body,
            "instagram_handle",
          );

        let artistId = current.artist_id;
        let finalArtistName = current.artist_name;
        let finalInstagramHandle = current.instagram_handle;

        if (artistFieldsTouched) {
          const artistName = readText(
            "artist_name",
            current.artist_name,
          );

          const instagramHandleValue = readText(
            "instagram_handle",
            current.instagram_handle,
          );

          const instagramHandle =
            instagramHandleValue
              ?.replace(/^@/, "")
              .toLowerCase() || null;

          if (
            instagramHandle &&
            !/^[A-Za-z0-9._]{1,30}$/.test(instagramHandle)
          ) {
            return Response.json(
              { error: "Instagram handle is not valid" },
              { status: 400 },
            );
          }

          if (!artistName && !instagramHandle) {
            artistId = null;
            finalArtistName = null;
            finalInstagramHandle = null;
          } else {
            let existingArtist:
              | {
                id: number;
                name: string;
                instagram_handle: string | null;
              }
              | null = null;

            if (instagramHandle) {
              existingArtist = await env.DB.prepare(`
                SELECT id, name, instagram_handle
                FROM artists
                WHERE LOWER(instagram_handle) = LOWER(?)
                LIMIT 1
              `)
                .bind(instagramHandle)
                .first<{
                  id: number;
                  name: string;
                  instagram_handle: string | null;
                }>();
            }

            if (!existingArtist && artistName) {
              existingArtist = await env.DB.prepare(`
                SELECT id, name, instagram_handle
                FROM artists
                WHERE LOWER(name) = LOWER(?)
                LIMIT 1
              `)
                .bind(artistName)
                .first<{
                  id: number;
                  name: string;
                  instagram_handle: string | null;
                }>();
            }

            if (existingArtist) {
              artistId = existingArtist.id;

              finalArtistName =
                artistName ||
                existingArtist.name ||
                (instagramHandle
                  ? `@${instagramHandle}`
                  : "Unknown artist");

              finalInstagramHandle = instagramHandle;

              await env.DB.prepare(`
                UPDATE artists
                SET name = ?,
                    instagram_handle = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `)
                .bind(
                  finalArtistName,
                  finalInstagramHandle,
                  artistId,
                )
                .run();
            } else {
              finalArtistName =
                artistName ||
                (instagramHandle
                  ? `@${instagramHandle}`
                  : "Unknown artist");

              finalInstagramHandle = instagramHandle;

              const artistInsert = await env.DB.prepare(`
                INSERT INTO artists (
                  name,
                  instagram_handle
                )
                VALUES (?, ?)
              `)
                .bind(
                  finalArtistName,
                  finalInstagramHandle,
                )
                .run();

              artistId = Number(
                artistInsert.meta.last_row_id,
              );
            }
          }
        }

        const before = {
          title: current.title,
          description: current.description,
          infrastructure_type: current.infrastructure_type,
          artist_id: current.artist_id,
          artist_name: current.artist_name,
          instagram_handle: current.instagram_handle,
        };

        const after = {
          title,
          description,
          infrastructure_type: infrastructureType,
          artist_id: artistId,
          artist_name: finalArtistName,
          instagram_handle: finalInstagramHandle,
        };

        if (JSON.stringify(before) === JSON.stringify(after)) {
          return Response.json({
            success: true,
            unchanged: true,
            artwork_id: artworkId,
          });
        }

        await env.DB.batch([
          env.DB.prepare(`
            UPDATE artworks
            SET title = ?,
                description = ?,
                infrastructure_type = ?,
                artist_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(
            title,
            description,
            infrastructureType,
            artistId,
            artworkId,
          ),

          env.DB.prepare(`
            INSERT INTO artwork_revisions (
              artwork_id,
              edited_by,
              before_json,
              after_json
            )
            VALUES (?, ?, ?, ?)
          `).bind(
            artworkId,
            userId,
            JSON.stringify(before),
            JSON.stringify(after),
          ),
        ]);

        return Response.json({
          success: true,
          artwork_id: artworkId,
          artwork: after,
        });
      } catch (error) {
        console.error("Artwork edit failed:", error);

        return Response.json(
          { error: "Could not update artwork" },
          { status: 500 },
        );
      }
    }
    if (url.pathname === "/api/my-finds" && request.method === "GET") {
      const userId = await getCurrentUserId();



      if (!userId) {
        return Response.json(
          { error: "Not signed in" },
          { status: 401 }
        );
      }

      const result = await env.DB.prepare(`
        SELECT
          artworks.id,
          artworks.title,
          artworks.description,
          artworks.latitude,
          artworks.longitude,
          artworks.town,
          artworks.city,
         artworks.infrastructure_type,
artworks.status,
artworks.artist_id,
artists.name AS artist_name,
          artists.instagram_handle,
          photos.storage_key AS primary_photo,
          checkins.checked_in_at
        FROM checkins
        INNER JOIN artworks
          ON artworks.id = checkins.artwork_id
        LEFT JOIN artists
          ON artworks.artist_id = artists.id
        LEFT JOIN photos
          ON photos.artwork_id = artworks.id
          AND photos.is_primary = 1
        WHERE checkins.user_id = ?
        ORDER BY checkins.checked_in_at DESC
      `)
        .bind(userId)
        .all();

      return Response.json(result.results);
    }

    const checkinMatch = url.pathname.match(
      /^\/api\/artworks\/(\d+)\/checkin$/
    );

    if (checkinMatch && request.method === "GET") {
      const artworkId = Number(checkinMatch[1]);
      const userId = await getCurrentUserId();

      if (!userId) {
        return Response.json(
          { error: "Not signed in" },
          { status: 401 }
        );
      }

      const checkin = await env.DB.prepare(`
    SELECT id, checked_in_at
    FROM checkins
    WHERE artwork_id = ?
      AND user_id = ?
    LIMIT 1
  `)
        .bind(artworkId, userId)
        .first();

      return Response.json({
        checked_in: Boolean(checkin),
        checkin,
      });
    }

    const artworkPhotosMatch = url.pathname.match(
      /^\/api\/artworks\/(\d+)\/photos$/
    );

    if (artworkPhotosMatch && request.method === "POST") {
      try {
        const access = await requireVerifiedUser();

        if (!access.ok) {
          return access.response;
        }

        const userId = access.userId;

        const artworkId = Number(artworkPhotosMatch[1]);

        const artwork = await env.DB.prepare(`
      SELECT id
      FROM artworks
      WHERE id = ?
      LIMIT 1
    `)
          .bind(artworkId)
          .first();

        if (!artwork) {
          return Response.json(
            { error: "Artwork not found" },
            { status: 404 }
          );
        }

        const formData = await request.formData();

        const photos = formData
          .getAll("photos")
          .filter((value): value is File => value instanceof File);
        const thumbnails = formData
          .getAll("thumbnails")
          .filter((value): value is File => value instanceof File);
        if (
          thumbnails.length > 0 &&
          thumbnails.length !== photos.length
        ) {
          return Response.json(
            { error: "Thumbnail count does not match photo count." },
            { status: 400 },
          );
        }

        for (const thumbnail of thumbnails) {
          if (thumbnail.type !== "image/jpeg") {
            return Response.json(
              { error: "Thumbnail must be a JPEG image." },
              { status: 400 },
            );
          }

          if (thumbnail.size > 2 * 1024 * 1024) {
            return Response.json(
              { error: "Thumbnail is unexpectedly large." },
              { status: 400 },
            );
          }
        }

        if (photos.length === 0) {
          return Response.json(
            { error: "At least one photo is required" },
            { status: 400 }
          );
        }

        const existingPhotoCount = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM photos
      WHERE artwork_id = ?
    `)
          .bind(artworkId)
          .first<{ count: number }>();

        const existingCount = Number(existingPhotoCount?.count ?? 0);

        if (existingCount + photos.length > MAX_PHOTOS_PER_ARTWORK) {
          const remaining = Math.max(
            0,
            MAX_PHOTOS_PER_ARTWORK - existingCount,
          );

          return Response.json(
            {
              error:
                remaining === 0
                  ? `This artwork already has the maximum of ${MAX_PHOTOS_PER_ARTWORK} photos.`
                  : `You can only add ${remaining} more ${remaining === 1 ? "photo" : "photos"
                  } to this artwork.`,
            },
            { status: 400 },
          );
        }

        let nextPhotoNumber = existingCount + 1;
        for (const photo of photos) {
          if (!ALLOWED_IMAGE_TYPES.has(photo.type)) {
            return Response.json(
              { error: "Unsupported image type." },
              { status: 400 },
            );
          }

          if (photo.size > MAX_IMAGE_SIZE_BYTES) {
            return Response.json(
              { error: "Each photo must be smaller than 8 MB." },
              { status: 400 },
            );
          }
        }


        for (let index = 0; index < photos.length; index++) {
          const photo = photos[index];

          const extension =
            photo.name.split(".").pop()?.toLowerCase() || "jpg";

          const safeExtension =
            extension.replace(/[^a-z0-9]/g, "") || "jpg";

          const storageKey =
            `artworks/${artworkId}/photo-${nextPhotoNumber}.${safeExtension}`;

          const thumbnail = thumbnails[index] ?? null;

          const thumbnailKey = thumbnail
            ? `artworks/${artworkId}/photo-${nextPhotoNumber}-thumb.jpg`
            : null;

          await env.IMAGES.put(
            storageKey,
            photo.stream(),
            {
              httpMetadata: {
                contentType:
                  photo.type || "application/octet-stream",
              },
            },
          );

          if (thumbnail && thumbnailKey) {
            await env.IMAGES.put(
              thumbnailKey,
              thumbnail.stream(),
              {
                httpMetadata: {
                  contentType: "image/jpeg",
                },
              },
            );
          }

          await env.DB.prepare(`
    INSERT INTO photos (
      artwork_id,
      storage_key,
      thumbnail_key,
      is_primary,
      uploaded_by
    )
    VALUES (?, ?, ?, 0, ?)
  `)
            .bind(
              artworkId,
              storageKey,
              thumbnailKey,
              userId,
            )
            .run();

          nextPhotoNumber++;
        }

        return Response.json({
          success: true,
          artwork_id: artworkId,
          added: photos.length,
        });
      } catch (error) {
        console.error("Photo append failed:", error);

        return Response.json(
          { error: "Could not add photos" },
          { status: 500 }
        );
      }
    }
    if (checkinMatch && request.method === "POST") {
      const artworkId = Number(checkinMatch[1]);
      const access = await requireVerifiedUser();

      if (!access.ok) {
        return access.response;
      }

      const userId = access.userId;

      const artwork = await env.DB.prepare(`
        SELECT id
        FROM artworks
        WHERE id = ?
      `)
        .bind(artworkId)
        .first();

      if (!artwork) {
        return Response.json(
          { error: "Artwork not found" },
          { status: 404 }
        );
      }

      await env.DB.prepare(`
        INSERT OR IGNORE INTO checkins (
          artwork_id,
          user_id
        )
        VALUES (?, ?)
      `)
        .bind(artworkId, userId)
        .run();

      return Response.json({
        checked_in: true,
      });
    }

    // DEV ONLY: remove our test check-in
    if (checkinMatch && request.method === "DELETE") {
      if (
        url.hostname !== "localhost" &&
        url.hostname !== "127.0.0.1"
      ) {
        return Response.json(
          { error: "Dev reset unavailable" },
          { status: 403 }
        );
      }

      const artworkId = Number(checkinMatch[1]);
      const access = await requireVerifiedUser();

      if (!access.ok) {
        return access.response;
      }

      const userId = access.userId;

      await env.DB.prepare(`
        DELETE FROM checkins
        WHERE artwork_id = ?
          AND user_id = ?
      `)
        .bind(artworkId, userId)
        .run();

      return Response.json({
        checked_in: false,
      });
    }

    if (
      url.pathname.startsWith("/api/images/") &&
      request.method === "GET"
    ) {
      const key = decodeURIComponent(
        url.pathname.replace("/api/images/", "")
      );

      const object = await env.IMAGES.get(key);

      if (!object) {
        return new Response("Image not found", {
          status: 404,
        });
      }

      const headers = new Headers();

      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      headers.set(
        "cache-control",
        "public, max-age=31536000, immutable",
      );

      return new Response(object.body, {
        headers,
      });
    }

    return new Response("Not found", {
      status: 404,
    });
  },
} satisfies ExportedHandler<Env>;
