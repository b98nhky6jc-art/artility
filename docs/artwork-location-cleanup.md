# Artwork location metadata cleanup

Artwork coordinates are the source of truth. This administrator-only, paged
operation refreshes `town` and `city` from each artwork's existing latitude and
longitude. It never changes coordinates.

## Before running it

The Worker uses a Nominatim-compatible reverse-geocoding endpoint. By default
it calls OpenStreetMap Nominatim for ordinary, low-volume artwork creation and
admin corrections. For a production cleanup, configure a provider suitable for
batch use by adding `LOCATION_GEOCODER_URL` as a Cloudflare Worker secret or
variable. The endpoint must accept standard Nominatim reverse parameters and
return an `address` object.

## Run safely

As an authenticated administrator, call:

```text
POST /api/admin/artwork-location-metadata/cleanup
{ "after_id": 0, "limit": 10, "dry_run": true }
```

The response lists every proposed change, including the untouched coordinates,
and returns `next_after_id` when another page remains. Review each dry run.

To apply a reviewed page, send the same request with `"dry_run": false`.
Continue using `next_after_id` until it is `null`. The operation is safe to
repeat: it only writes place names that differ from the current values and logs
each batch to the Worker logs.

Direct SQL imports deliberately leave `town` and `city` empty. Run this cleanup
after importing so locality labels are derived from the imported coordinates,
rather than manually copied into the SQL file.

If reverse geocoding is unavailable for a coordinate update, new or moved
artwork has no locality label rather than retaining a potentially incorrect
one. The cleanup endpoint's dry-run response makes those cases visible before
any write is made.
