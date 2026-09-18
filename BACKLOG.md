# Artility product backlog

Last audited: **18 September 2026**  
Repository revision: `958adbf`  
Master tracker: [#11](https://github.com/b98nhky6jc-art/artility/issues/11)

## Product north star

Help people discover local artists and artwork, get outside and explore their community on foot, collect what they find, and contribute useful discoveries so other people can find them too.

Artility is a community map and evolving archive of public art hiding in plain sight—not a generic social feed.

## How this backlog works

| Status | Meaning |
|---|---|
| **Done** | Present in the current repository and supported by direct code/test evidence. |
| **Partial** | A useful implementation exists, but the agreed capability is incomplete. |
| **Defect** | Implemented behaviour is broken or unsafe in a verified scenario. |
| **Not started** | No implementation was found in the audited revision. |
| **Later** | Deliberately lower-priority direction rather than current committed scope. |

GitHub Issues contain actionable remaining work. This file retains the full capability record so completed work does not fall back into the backlog.

## Current priorities

| Priority | Work | Status | Tracking |
|---|---|---|---|
| P0 | Graceful map fallback when WebGL is unavailable | Defect | [#1](https://github.com/b98nhky6jc-art/artility/issues/1) |
| P0 | Map pin/pop-up links to canonical artwork page | Not started | [#2](https://github.com/b98nhky6jc-art/artility/issues/2) |
| P1 | Initial bundle and map scalability | Partial | [#3](https://github.com/b98nhky6jc-art/artility/issues/3) |
| P1 | Artwork search, tags and shareable discovery pages | Partial | [#4](https://github.com/b98nhky6jc-art/artility/issues/4) |
| P1 | Favourites and complete personal collection | Partial | [#5](https://github.com/b98nhky6jc-art/artility/issues/5) |
| P1 | Multi-artist attribution, claiming and merge tools | Partial | [#6](https://github.com/b98nhky6jc-art/artility/issues/6) |
| P1 | Account export and deletion | Not started | [#7](https://github.com/b98nhky6jc-art/artility/issues/7) |
| P2 | About, Terms and legal-navigation completion | Partial | [#8](https://github.com/b98nhky6jc-art/artility/issues/8) |
| P2 | Generated distance/time Art Walks | Partial | [#9](https://github.com/b98nhky6jc-art/artility/issues/9) |
| P2 | Moderation and contributor-control hardening | Partial | [#10](https://github.com/b98nhky6jc-art/artility/issues/10) |

## Audited capability matrix

### Product, homepage and navigation

| Capability | Status | Evidence / remaining work |
|---|---|---|
| North-star homepage messaging | **Done** | `src/App.tsx` leads with local art, walking, collecting and contributing. |
| Responsive desktop navigation | **Done** | `src/SiteHeader.tsx`. |
| Installed/mobile navigation including Artists | **Done** | `src/MobileNav.tsx`. |
| Categories navigation | **Done** | `src/Categories.tsx`; controlled categories in `src/categories.ts`. |
| Remove legacy Home Area concept | **Done** | Legacy storage is removed in `src/App.tsx`; manual place search replaces it. |
| Consistent shared header/footer | **Done** | `SiteHeader`, `SiteFooter` wrap routed pages. |
| Homepage cards stay visually led | **Done** | Cards expose concise discovery information and link to details. |
| Theme/layout consistency | **Done** | Centralised styling in `src/App.css`; regression tests cover key contrast/layout rules. |
| Full accessibility review | **Partial** | Semantic controls exist, but no complete keyboard/screen-reader audit is recorded. |

### Location and discovery

| Capability | Status | Evidence / remaining work |
|---|---|---|
| Explain why location is useful | **Done** | `LocationPrompt.tsx`, `LocationContext.tsx`. |
| Detect denied/unavailable location | **Done** | Permission state and recovery guidance implemented and tested. |
| Browser/device-specific enablement help | **Done** | Safari, Apple mobile, Chromium and device-setting guidance in `src/location.ts`. |
| Manual place/town/postcode search | **Done** | `PlaceSearch.tsx`, `/api/places/search`. |
| Approximate non-check-in fallback | **Done** | `/api/location/approximate`; explicitly limited in Privacy policy. |
| Nearby distance sorting | **Done** | Closest/furthest/newest/oldest/artist sorting in `artworkDiscovery.ts`. |
| Browse by category | **Done** | Includes Little Library as a first-class category. |
| Search/browse artists | **Done** | `Artists.tsx` and artist API. |
| Search artwork/title/town/city | **Not started** | Covered by [#4](https://github.com/b98nhky6jc-art/artility/issues/4). |
| Tags and tag discovery | **Not started** | Covered by [#4](https://github.com/b98nhky6jc-art/artility/issues/4). |
| Persist map viewport when returning | **Done** | `artility:last-map-viewport` in `ArtworkMap.tsx`. |
| Map marker clustering/scalable marker rendering | **Not started** | Individual DOM marker per artwork; covered by [#3](https://github.com/b98nhky6jc-art/artility/issues/3). |
| Graceful map failure/fallback | **Defect** | WebGL failure can blank the app; [#1](https://github.com/b98nhky6jc-art/artility/issues/1). |
| Map pin to artwork page | **Not started** | Popup has text only; [#2](https://github.com/b98nhky6jc-art/artility/issues/2). |

### Artwork records and pages

| Capability | Status | Evidence / remaining work |
|---|---|---|
| Canonical artwork page | **Done** | `/artwork/:id`, `ArtworkDetail.tsx`. |
| Multiple photos/gallery | **Done** | Approved-photo gallery with primary ordering. |
| Five-photo limit | **Done** | UI, API and database enforcement. |
| Neutral missing-title fallback | **Done** | `getArtworkDisplayTitle` / “Untitled artwork”. |
| Artist attribution and unknown artist | **Done** | Shared attribution component and null-artist handling. |
| Setting/category, locality and description | **Done** | Returned by artwork APIs and rendered on detail/discovery pages. |
| Date first added | **Done** | `created_at` is returned and rendered. |
| Check-in count and last check-in | **Done** | Calculated by artwork APIs and rendered. |
| Current status and history | **Done** | Effective statuses and approved-report history. |
| Contributor editing | **Done** | Verified users can edit allowed fields; revisions recorded. |
| Coordinate editing restriction | **Done** | Location coordinate changes require admin access. |
| Artwork revision audit | **Done** | `artwork_revisions` and before/after JSON. |
| Artwork duplicate warning | **Done** | 100 m nearby check before creation and route to add photos to an existing record. |
| Moderator duplicate merge | **Not started** | Covered by [#10](https://github.com/b98nhky6jc-art/artility/issues/10). |

### Uploads, images and safety

| Capability | Status | Evidence / remaining work |
|---|---|---|
| Multi-photo upload and primary selection | **Done** | `AddArtwork.tsx`. |
| Remove/cancel selected photo | **Done** | Per-photo removal returns to upload state when empty. |
| Upload stage/progress feedback | **Done** | Preparation/upload status and synchronous submission locking. |
| Client compression and thumbnails | **Done** | Browser normalisation and thumbnail generation. |
| Server re-encode and thumbnails | **Done** | `worker/image-processing.ts`. |
| MIME and magic-byte validation | **Done** | JPEG/PNG/WebP sniffing and declared-type comparison. |
| File-size/dimension/pixel limits | **Done** | 8 MB, 6000×6000 and 32 MP server limits. |
| Metadata/EXIF removal from published image | **Done** | Decode/resize/JPEG re-encode; GPS is read client-side only for placement. |
| Upload rate limiting | **Done** | Per-user image-upload rate limit is enforced. |
| AI safety moderation | **Done** | Approval/rejection/manual-review decisions with fail-closed behaviour. |
| Public-art validity screening | **Done** | Rejects non-public-art/document/collectible submissions or holds uncertainty. |
| Quarantine and manual review | **Done** | Private moderation states and admin review interface. |
| Malware scanning decision/control | **Partial** | Strict image decode/re-encode reduces risk; threat-model decision remains in [#10](https://github.com/b98nhky6jc-art/artility/issues/10). |
| Account quotas/reputation/restriction tools | **Not started** | Covered by [#10](https://github.com/b98nhky6jc-art/artility/issues/10). |
| Upload performance | **Partial** | Instrumentation and dual-stage optimisation exist; initial bundle remains large and real-device measurements should continue under [#3](https://github.com/b98nhky6jc-art/artility/issues/3). |

### Check-ins and My Finds

| Capability | Status | Evidence / remaining work |
|---|---|---|
| Proximity-based check-in | **Done** | Precise device location and 100 m eligibility checks. |
| Friendly too-far/location errors | **Done** | Client and tested location-error handling. |
| Prevent repeat check-ins | **Done** | Unique `artwork_id,user_id` and insert-or-ignore behaviour. |
| Automatic check-in when contributing at location | **Done** | Server creates an eligible check-in during contribution flows. |
| My Finds visited-artwork list | **Done** | `MyFinds.tsx`, `/api/my-finds`. |
| Basic discovery statistics | **Done** | Find and city counts plus latest find. |
| Favourites/bookmarks | **Not started** | [#5](https://github.com/b98nhky6jc-art/artility/issues/5). |
| Collected-artist view | **Not started** | [#5](https://github.com/b98nhky6jc-art/artility/issues/5). |
| Contribution history | **Not started** | [#5](https://github.com/b98nhky6jc-art/artility/issues/5). |
| Public achievements/leaderboards | **Later** | Not required for the core product loop. |

### Artists

| Capability | Status | Evidence / remaining work |
|---|---|---|
| Artist index and search | **Done** | `Artists.tsx`. |
| Artist detail and attributed artwork | **Done** | `ArtistDetail.tsx`, `/api/artists/:id`. |
| Instagram attribution | **Done** | Normalised handles and safe profile link. |
| Autocomplete while contributing/editing | **Done** | `ArtistAutocomplete.tsx`. |
| Unknown artist can be attributed later | **Done** | Artwork edit supports artist fields. |
| Historical duplicate normalisation | **Done** | Migration `0010_artist_identity_normalization.sql`. |
| Ongoing artist merge tool | **Not started** | [#6](https://github.com/b98nhky6jc-art/artility/issues/6). |
| Multiple artists per artwork | **Not started** | Current schema has one `artist_id`; [#6](https://github.com/b98nhky6jc-art/artility/issues/6). |
| Artist claiming/verification | **Not started** | [#6](https://github.com/b98nhky6jc-art/artility/issues/6). |

### Status reporting and moderation

| Capability | Status | Evidence / remaining work |
|---|---|---|
| Report removed/changed/damaged work | **Done** | Status-report form and API. |
| Supporting report photo and note | **Done** | Stored privately pending moderation. |
| Reports do not immediately change public status | **Done** | Effective status changes only after approval. |
| Moderator case queue | **Done** | Image and artwork-status cases in `Moderation.tsx`. |
| Approve/reject decisions | **Done** | Admin endpoints with conflict protection. |
| Admin artwork deletion and asset cleanup | **Done** | Deletes dependent photos/check-ins/reports/history safely. |
| Review alert emails | **Done** | Durable outbox and retry handling. |
| Contributor suspension/appeal workflow | **Not started** | [#10](https://github.com/b98nhky6jc-art/artility/issues/10). |
| Complete moderator-action audit | **Partial** | Artwork edits/reports are attributable; broader review remains in [#10](https://github.com/b98nhky6jc-art/artility/issues/10). |

### Art Walks

| Capability | Status | Evidence / remaining work |
|---|---|---|
| Select artworks for a walk | **Done** | Add/remove/clear, persisted selection, 2–6 stops. |
| Start at current location, first artwork or searched place | **Done** | `ArtWalk.tsx`, `artWalkStart.ts`. |
| Real walking route | **Done** | Routing API normalises provider geometry/distance/duration. |
| Route displayed on map | **Done** | Numbered stops and route line. |
| Provider/rate-limit failure handling | **Done** | Tested graceful error response. |
| Automatically generate 2/5/10 km routes | **Not started** | [#9](https://github.com/b98nhky6jc-art/artility/issues/9). |
| Generate by walking time | **Not started** | [#9](https://github.com/b98nhky6jc-art/artility/issues/9). |
| Save/share walks | **Not started** | Later part of [#9](https://github.com/b98nhky6jc-art/artility/issues/9). |

### Accounts, privacy and legal

| Capability | Status | Evidence / remaining work |
|---|---|---|
| Email/username sign-up and sign-in | **Done** | Better Auth integration and UI. |
| Email verification before contribution | **Done** | UI guard plus server enforcement. |
| Password reset/account emails | **Done** | Auth email delivery implementation. |
| Google sign-in | **Done** | Configured and reflected in Privacy policy. |
| Browse without an account | **Done** | Public artwork/artist/category access. |
| Privacy policy | **Done** | `Privacy.tsx`. |
| Copyright/photo policy | **Done** | `Copyright.tsx`; upload safety notices. |
| FAQ | **Done** | `Faq.tsx`. |
| Contact route | **Done** | `Contact.tsx`. |
| About page | **Not started** | [#8](https://github.com/b98nhky6jc-art/artility/issues/8). |
| Terms page | **Not started** | [#8](https://github.com/b98nhky6jc-art/artility/issues/8). |
| Account data export | **Not started** | [#7](https://github.com/b98nhky6jc-art/artility/issues/7). |
| Self-service account deletion | **Not started** | [#7](https://github.com/b98nhky6jc-art/artility/issues/7). |

### Platform, reliability and growth

| Capability | Status | Evidence / remaining work |
|---|---|---|
| Installable PWA | **Done** | Manifest, service worker and current icons. |
| Cloudflare Worker/D1/R2 architecture | **Done** | Current production architecture. |
| Automated deployment workflow | **Done** | `.github/workflows/deploy.yml`. |
| Worker observability/source maps | **Done** | Enabled in `wrangler.jsonc`. |
| Automated test suite | **Done** | 74 tests passed during this audit. |
| Production build | **Done** | TypeScript and Vite build passed during this audit. |
| Route-level code splitting | **Not started** | [#3](https://github.com/b98nhky6jc-art/artility/issues/3). |
| SEO/share metadata per public route | **Not started** | [#4](https://github.com/b98nhky6jc-art/artility/issues/4). |
| City/town index pages | **Not started** | [#4](https://github.com/b98nhky6jc-art/artility/issues/4). |
| Native iOS/Android clients | **Later** | PWA remains the current delivery model. |
| Push notifications | **Later** | No current core-product requirement. |
| Subscriptions/paid features | **Later** | No current core-product requirement. |
| Comments/social feed | **Later** | Avoid unless it clearly supports discovery and useful contributions. |
| Advanced visual duplicate recognition | **Later** | Proximity duplicate prevention exists; evaluate only when scale justifies it. |

## Verification record

Audit evidence used:

- Repository source and database migrations at revision `958adbf`.
- `npm test -- --run`: **74 passed, 0 failed**.
- `npm run build`: completed successfully.
- Production bundle observation: main client JavaScript approximately **1.49 MB / 417 KB gzip**.
- Public deployment check reproduced the WebGL blank-page failure.
