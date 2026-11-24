# Stage 7b - guest Memories gallery on the invitation page

Updated: 2026-11-10
Repo: `C:\Users\Youngyz\aldriva-staging`, branch `feat/invitation-templates-v2`
Server: dev on port 3100 only (never port 3000 / PID 6264).

## Pre-check: wrong "memories" design leftovers

No trace on disk. `git status` shows no memories files; grep for `mf_memories_photos`,
`memories_photos`, `memoriesPhotos`, a manifest `"memories"` field, `TemplateFieldsSection`
memories changes, related tests, or messages = 0 hits. The manifest `mf_*` keys are only
`mf_parent_*`, `mf_hero_photos/eyebrow`, `mf_invitation_line`, `mf_dress_code_swatches`
(`lib/invitation-template-manifests.ts:105-207`; `lib/invitation-type-fields.ts:200-202`).
**Nothing removed.**

## 1(a) Dependencies

| Dependency | Status | Evidence |
|---|---|---|
| `framer-motion` | present `^12.40.0` | `package.json:64` |
| `lucide-react` | **ABSENT** | no `package.json` match; repo uses `@tabler/icons-react ^3.49.0` (`package.json`) per DESIGN.md / AGENTS.md |

Not a STOP (only a missing `framer-motion` would be). Plan: use `@tabler/icons-react`,
not lucide-react.

## 1(b) Existing Memories feature

**Routes / surfaces**
- Dashboard: `app/dashboard/events/[id]/memories/page.tsx` + `MemoriesClient.tsx`; nav `lib/event-dashboard-navigation.ts:12,77-79`.
- Guest upload: `app/m/[token]/page.tsx` + `MemoryUploadClient.tsx` (public, no auth; short URL `/m/{token}` from `lib/invitation-url.ts:9-11`); APIs `app/api/memories/[token]/upload-url/route.ts`, `.../complete/route.ts`, `.../report/route.ts`, `app/api/memories/photo/[deleteToken]/route.ts`.
- Organizer ZIP: `app/api/events/[id]/memories/zip/route.ts:31-45` (auth + `event_manager`).

**Tables (`db/migration_162_event_memories.sql`)**
- `event_memory_settings:33-45` — `upload_token`, `is_active`, `require_approval` default `true`.
- `event_memories:52-73` — `status` CHECK `('pending','approved','rejected')` default `'pending'` (`:64-65`); `storage_provider`, `object_key`, `content_type`, `size_bytes`, `width`, `height`, `guest_label`, `delete_token_hash`, `report_count`.
- `event_memory_reports:81-89`; `event_memory_retention_notices:93-98`.

**Approval field / values**: `status` = `pending | approved | rejected`. Set by
`moderateMemory` / `bulkModerateMemories` (`lib/actions/event-memories.ts:175,191-245`).
`require_approval = false` auto-approves at upload (`app/api/memories/[token]/complete/route.ts:88`).

**R2 storage**: private R2 bucket `R2_PRIVATE_BUCKET` with `memories/` prefix
(`lib/memories/storage.ts:30,116-122`) or private Supabase `event-memories` bucket
(`storage.ts:29,124-206`). Keys `memories/{eventId}/{name}` (`storage.ts:67-69`).

**Displayable URL**: short-lived signed GET only — no public URL, no proxy route.
`signGet` default TTL 120 s (`storage.ts:107,190`); dashboard mints 300 s
(`app/dashboard/events/[id]/memories/page.tsx:15,87-89`); upload-complete returns 300 s
(`complete/route.ts:105`). `getPrivateMediaSignedGetUrl` default 120 s
(`lib/storage/private-media.ts:28-29`).

## 1(c) Guest read access + privacy

- **RLS**: only the organizer/event-manager policy on `event_memories`
  (`migration_162:184-235`), `FOR ALL TO authenticated`; `anon`/`authenticated` have
  `REVOKE ALL` (`:107-110`); no `anon` SELECT policy.
- **No public/guest route returns approved memories.** The only reads are the organizer
  dashboard page (service role, `page.tsx:55-63`) and the organizer ZIP route
  (`zip/route.ts:36-40`). The guest upload page (`app/m/[token]`) never reads photos back.
- **Approval does NOT currently mean guest-visible** — there is no guest read path at all.
  `require_approval` only decides whether an upload starts `pending` or `approved`
  (`complete/route.ts:88`); it is not a viewer setting. There is no "show in gallery" toggle.
- **Privacy gap for this task**: showing approved photos to guests needs a NEW guest-facing
  read path (server action or route) that filters `status = 'approved'` AND `event_id`, then
  mints signed URLs server-side. Must never expose `pending`/`rejected` rows or other events'
  photos. The existing RLS/storage cannot simply be widened (`anon` has no grants; signed URLs
  are service-role only).

Per the task, since guests cannot read approved memories today, **STOP and report options
instead of widening access**:

1. Read-only server action / route scoped to the event + invitation/share token: return only
   `approved` rows for that `event_id`, mint short-TTL signed URLs, no RLS change (service role).
2. Public route keyed by the public share token (not the raw event id) so event ids are not
   enumerable; still filters `approved` only.

Decide in step 3.

## 1(d) The two "Confirm presence" buttons

File: `components/invitation/templates/minimalism-dark-blue/MinimalismDarkBluePageTemplate.tsx`

| # | Location | Action | Verdict |
|---|---|---|---|
| 1 | `:636-645`, details section, immediately below the Add-to-calendar / Google Calendar row (`:604-633`) | `onClick={() => setRsvpOpen(true)}` | **replace with Memories button** |
| 2 | `:758-766`, RSVP section, `ref={rsvpTriggerRef}` | `onClick={() => setRsvpOpen(true)}` | **keep, opens RSVP unchanged** |

RSVP dialog: `:776-809`. Reference scroll-lock pattern that restores the PREVIOUS overflow
value: `:307-319` (`previousOverflow`).

## Decision (step 3 unblocked)

**Option 2** — public read-only route keyed **only** by the invitation page's 64-hex public share
token (`event_invitation_pages.share_token`), service role on the server, **no RLS change, no
migration, no DB writes**. Slug and guest-token resolution were dropped: the route resolves a
single identifier shape, so there is no second way to reach a guest's photos.

Additional requirements accepted (A–I):

- **A. Privacy switch**: manifest boolean `mf_show_memories` in `template_data`, edited in
  `TemplateFieldsSection` like the guestbook toggle. EN/FR label "Show guest memories on this
  invitation" + helper "only photos you approved appear". When the event's
  `event_memory_settings.require_approval = false`, show a visible warning that unreviewed
  photos would appear. Absent or false = OFF. Settings toggle only — no builder upload field.
- **B. Route**: `app/api/invitation/[token]/memories` (Next.js forbids a second dynamic slug
  name at the same level as the existing `[token]` RSVP route, so the segment stays `[token]`).
  The segment accepts **only** the 64-hex public share token; a guest token or event slug is a
  404 like any other unknown token. Resolution requires `share_enabled = true`, `page_status`
  `published`/`unlisted` (never draft), a `published_snapshot`, and `mf_show_memories=true` in
  that snapshot. Only `status='approved'` with `report_count=0` for the resolved event.
  Response: `id`, signed `url`, `width`, `height`, `created_at` only. Cursor on
  `(created_at, id)`, 24/page, `Cache-Control: no-store`, public-route rate limit.
- **C. Signed URLs**: 900 s TTL for guests (dashboard TTLs unchanged). On image error refetch
  that page once; if it still fails, hide the item without breaking the grid.
- **D. Count**: server-rendered template gets only a count/boolean. Button renders only when
  the toggle is on AND the approved, non-reported count > 0. Never load photos on render.
- **E. Icons**: `@tabler/icons-react` only. No new dependencies.
- **F. Images**: reserve aspect ratio from stored `width`/`height`, lazy-load, no `layoutId`
  on thumbnails except the selected item. `MemoryUploadClient` does **not** compress or
  resize; the server pipeline (`lib/memories/photos.ts:115-118`) resizes to max 2400×2400 and
  strips metadata. No thumbnail generation added.
- **G. Tests**: real route-handler/core calls registered in `test-files.json`; pending/rejected/
  reported never returned; cross-event isolation with two events; draft returns nothing;
  toggle off returns nothing and hides the button; cursor paging no duplicates + correct last
  page; no `object_key`/event id/delete token in the response; expired-URL refetch path.
- **H. Proof**: toggle off shows no button even with approved photos; toggle on with 3
  approved + 1 pending + 1 reported shows exactly 3; a second event's approved photo never
  appears.
- **I. Reusable component**: `MemoriesGallery` takes a `loadPage` prop so the organizer
  dashboard Memories tab can adopt it later. Dashboard unchanged in this pass.

## Implementation progress

### A. Privacy switch (done)
- Manifest: `lib/invitation-template-manifests.ts` adds `mf_show_memories` (toggle,
  `defaultValue:false`, `helper` label), `ManifestField` now supports `defaultValue`/`helper`.
- Builder UI: `TemplateFieldsSection.tsx` renders toggle helper text and, when
  `getMemorySettingsState(eventId)` reports `requireApproval === false` and the toggle is on,
  a visible amber warning ("unreviewed photos will appear…"). Toggle default now honors
  `defaultValue`/`sampleValue` (guestbook remains default-on, memories default-off).
- Schema/types: `mf_show_memories` added to `lib/invitation-template-schema.ts` template_data
  and `types/invitation-template.ts` (EvergreenEnvelopeTemplateData).

### B/C/D. Public route, signed URLs, count (done)
- Pure core: `lib/memories/public-gallery-core.ts` — `readShowMemories` (absent/false OFF),
  `shouldShowMemoriesButton`, cursor encode/decode, `filterPublicMemoryRows` (approved +
  `report_count=0` + matching event, newest-first `(created_at,id)` keyset), response shaping
  (`id,url,width,height,created_at` only), 24/page, 900 s guest TTL constant.
- Server adapter: `lib/memories/public-gallery.ts` — service-role repository whose
  `resolveTarget(segment)` accepts **only** a 64-char hex share token (`/^[a-f0-9]{64}$/i`);
  anything else returns `null`, so guest tokens and event slugs are 404s at the route with no
  extra query. A match must have `share_enabled === true`, `page_status` in
  `{published, unlisted}`, and a `published_snapshot`; `mf_show_memories` is read from
  `published_snapshot.blocks_layout.template_data`. The repository counts/lists approved
  non-reported rows with the keyset cursor, mints signed GETs via the row's storage driver at
  900 s, and `getApprovedMemoriesCount(eventId, showMemories)` serves the server render.
- Route: `app/api/invitation/[token]/memories/route.ts` — GET, `invitationMemoriesView`
  limit via `lib/memories/guest-limits.ts` (`isRateLimited` / `rateLimitedResponse`), 404 for
  invalid/off/draft/unresolvable, 400 bad cursor, `Cache-Control: no-store`, byte-identical 404
  body, never returns object keys/event ids/delete tokens. No segment config (`runtime` is
  rejected under `cacheComponents`; handlers are Node by default).
- Rate limit: `lib/rate-limit.ts` registers `invitationMemoriesView` (60/60s, share-view posture).
- Server-rendered count/token: `app/invitation/[token]/page.tsx`,
  `app/invitation/shared/[token]/page.tsx`, and `app/invitation/builder-preview/[eventId]/page.tsx`
  call `resolveMemoriesProps(shareEnabled, shareToken, eventId, showMemories, pageStatus)`
  (`lib/memories/resolve-memories-props.ts`). It returns `memoriesToken` **only** when the page is
  share-enabled, `page_status` is published/unlisted, and the token is a share token; otherwise
  `memoriesToken` is `undefined` and `memoriesCount` is 0, so the button is hidden. Counts only,
  never photos.
- Data plumbing: `types/invitation-template.ts` (`memoriesCount/Token/Sample`),
  `lib/types/invitation-page-snapshot.ts` (EventLiveFields preview hints),
  `lib/invitation-template-preview-data.ts` defaults sample memories for previews/demos,
  `app/invitations/templates/[templateId]/demo/page.tsx` enables `mf_show_memories` in demo
  layout so the sample gallery is showcased.

### E/F. Icons and images (done)
- `@tabler/icons-react` only (`IconPhoto`, `IconX`). No new dependencies.
- `components/memories/MemoriesGallery.tsx`: reserved aspect ratio from `width/height`,
  `loading="lazy"`, `decoding="async"`, masonry columns, `motion.img layoutId` only on the
  selected/expanded image (shared-element expand), drag-down dismiss, full-screen dialog
  `role="dialog" aria-modal aria-labelledby`, focus moved to close on open and returned to
  trigger on close, Escape closes lightbox then dialog, backdrop close, body/preview scroll
  lock restores previous overflow, key listener/focus trap active only while open, cursor
  pages via `loadPage` + "Load more", respects `prefers-reduced-motion`, z-index above
  template dialogs, no external image URLs. On image error: refetch the page once for fresh
  900 s URLs; if the item is gone (retention) or fails again, hide it without breaking the grid.
- **F report (`MemoryUploadClient`)**: `app/m/[token]/MemoryUploadClient.tsx` does **not**
  compress or resize client-side (it validates type/size and uploads the original file). Server
  finalization (`lib/memories/photos.ts:112-118`) applies EXIF orientation, strips metadata, and
  resizes to max 2400×2400 (`fit:"inside", withoutEnlargement`) before storage. No thumbnail
  generation added.

### I. Generic component + template wiring (done)
- `components/memories/MemoriesGallery.tsx` accepts `loadPage` (cursor loader) and optional
  `sampleItems` (local preview); organizer dashboard can adopt it later by supplying a loader
  (no dashboard changes now).
- `MinimalismDarkBluePageTemplate.tsx`: first button under calendar links (`:636-645` area,
  reception info) replaced by a Memories button (`IconPhoto` + `t("minimalismMemoriesTitle")`,
  FR "Souvenirs") opening the gallery. Hidden when toggle off or count 0 on real/shared pages;
  shown with sample photos in builder/demo preview when the toggle is on. Bottom RSVP button
  (`ref={rsvpTriggerRef}`) and RSVP dialog unchanged.
- Page helpers/types: `lib/memories/gallery-types.ts`, `lib/memories/gallery-pages.ts`,
  `lib/memories/sample-memories.ts` (repo demo assets only, with measured dimensions).

### G. Tests (done, registered)
- `lib/__tests__/memories-public-gallery.test.cjs` — **17 tests, 0 failed**, registered in
  `test-files.json`. Covers `mf_show_memories` absent/false OFF and the button gate;
  pending/rejected/reported and cross-event rows never returned; two-event isolation; cursor
  paging with no duplicates and a correct last page; toggle off returns nothing and count 0;
  draft/unresolvable targets return nothing; response shaped to `id,url,width,height,created_at`
  only (no `object_key`, `delete_token`, `event_id`, `guest_label`); guest signed TTL 900 s;
  3 approved + 1 pending + 1 reported → exactly 3 with the second event absent; expired-URL
  refetch keeps the fresh URL on the first retry and hides the item when it is gone/still broken;
  slug and guest token resolve to 404; `getApprovedMemoriesCount` equals the listed total;
  malformed cursor → 400.
- `lib/__tests__/memories-route-integration.test.cjs` — **13 tests, 0 failed** (`node --test`:
  `tests 13 / pass 13 / fail 0`). It loads the real `route.ts` GET handler through a `.ts`
  loader (`require.extensions[".ts"]` + `ts.transpileModule` with the `@/` alias) and drives it
  with a fake request/service: malformed cursor → 400; event slug, guest token, unknown token,
  draft page, `mf_show_memories` off, and `share_enabled=false` → 404; every 404 body is
  byte-identical; items are exactly `{id,url,width,height,created_at}` with `Cache-Control:
  no-store`; page 2 has no duplicates and is the correct last page; draft page yields no token
  and count 0 while a published page yields token + count; count equals items across all pages.
- Existing `lib/__tests__/event-memories.test.cjs` remains in the suite (covers the broader
  memories subsystem).

### H. Proof
Interactive proof is recorded in **Status** below (items a–k, with raw assertions and
screenshots in `docs/minimalism-dark-blue/renders/stage7b/`); this section keeps no budget of
its own so the two cannot drift apart.

**Item h (personalized guest link) is NOT RUN in Playwright — unit-tested only.** The dashboard
exposes no guest token, so `/invitation/<guest token>` was never opened in a browser; the
personalized path is covered by unit tests only (`memories-route-integration.test.cjs`:
"guest invitation token returns 404", "published page still yields the token and count";
`memories-public-gallery.test.cjs`: "slug and guest token return 404").

### i18n
- `messages/en.json` / `messages/fr.json`: `minimalismMemoriesTitle/Close/LoadMore/Empty/Error/Retry/Sample`,
  `manifestGroupMemories`, `manifestShowMemories`, `manifestShowMemoriesHelper`,
  `manifestShowMemoriesNoApprovalWarning`.

## Status (full proof / cleanup / verify run, 2026-11-12)

Environment: `C:\Users\Youngyz\aldriva-staging`, branch `feat/invitation-templates-v2`, dev server on
port **3100 only** (listener PID 22312). Port 3000 / PID 15508 untouched. No commits, no migrations,
no production DB writes. `tsconfig.json` and `hooks/use-pwa.ts` untouched (the `tsconfig.json` diff
pre-dates this session: `playwright-tests` + `test_templates.spec.ts` excludes).

### Build state

- `tasklist` node processes: 6 live (`10940 24752 25056 15508 25120 26436`); `.next/lock` absent.
- `npm run build > .stage7b/build.out` (background, polled): `✓ Compiled successfully in 2.0min`,
  TypeScript finished in 42s, 394 static pages generated, `ƒ Proxy (Middleware)`, `BUILD_EXIT=0`.
- Dev server: `npx next dev -p 3100` → `✓ Ready in 2.9s`, port 3100 LISTENING PID 22312.

### Fixtures used

Reused QA event `77456a7f-8cd1-4685-97a1-e443ab89e9be` ("Youngyz & JoyBaby"): published, Minimalism
Dark Blue, share link **already enabled before this task** (left enabled), guest uploads enabled,
"Require approval" turned off so uploads auto-approve, `mf_show_memories` on and republished.
25 photos uploaded through the real guest flow `/m/mem_kTZn4SpNueoyJS8p0LG5Ch8iOPZw6YIH`.

### Proof results (guest page `/invitation/shared/db1d1bfe…2578`)

| # | Check | Result | Raw evidence |
|---|---|---|---|
| a | Toggle OFF with approved photos present ⇒ no button | PASS (390 + 1440) | second visit `TOGGLE_BEFORE=false`; `MEMORIES_BUTTON=0` at 390 and 1440 |
| b | Escape closes, 3 consecutive runs | PASS 3/3 | `RUN_1 OPEN_BEFORE=1 OPEN_AFTER_ESC=0`, `RUN_2 …=1 …=0`, `RUN_3 …=1 …=0` |
| c | Backdrop click closes at 1440 | PASS | element at (24,500) is the backdrop root; `OPEN_AFTER_BACKDROP_CLICK=0` |
| d | Close button at 1440 | PASS | `CLOSE_BUTTON_ARIA_LABEL="Close"`, selector `button[aria-label="Close"]`; `OPEN_AFTER_CLOSE_BUTTON=0` |
| e | Scroll lock with a scrollbar present | PASS | BEFORE `bodyInline=""` `HAS_SCROLLBAR=true`; DURING `bodyInline="hidden"`; AFTER `bodyInline=""` |
| f | Load more with 25 photos | PASS | `FIRST_BATCH=24`; Load more → `25`; `UNIQUE_URLS=25`; `DUPLICATES=0`; button gone |
| g | Event with no memories ⇒ no button | PASS | `MEMORIES_BUTTON=0` at 390 and 1440, no "memories" text in body; API `STATUS=200 ITEMS=0` |
| h | Personalized `/invitation/<guest token>` | **NOT RUN in Playwright — unit-tested only** | dashboard exposes no guest token: `/dashboard/events/<id>/guests` has no `[0-9a-f]{64}` in the DOM (`HEX64_IN_HTML=[]`), guest-list links only `/dashboard/events/<id>/invitation-page`, clicking the guest opens no drawer (only the cookie banner dialog matches); the one QA guest has no email. Would need a direct DB read or sending a real invitation email. |
| i | Builder preview, no photos ⇒ button + 3 samples badged "Sample" | PASS | `PREVIEW_TRIGGER=1`; gallery `IMG_COUNT=3` (`gallery-01/03/05`), `THUMB_LABELS=["Close","Memories","Memories","Memories"]`, `SAMPLE_BADGES=1` in the h2 |
| i | Builder preview, real photos ⇒ real photos, no samples | PASS | `PREVIEW_PHOTOS=24`, `TITLE="MEMORIES"`, `SAMPLE_BADGE=false` |
| j | Expired signed URL ⇒ one refetch + recovery | PASS | blocked `…/memories/77456a7f-…/f5e36798008ede274de5b2e6f873226b.jpg` once; `API_CALLS=2`; after scroll `{total:24,loaded:24,failed:0}` |
| k | Reduced motion + FR | PASS | `TITLE="SOUVENIRS"`, `CLOSE_ARIA="Fermer"`, `LOADMORE_FR=1`, `REDUCED_MOTION_MATCHES=true`, `ANIMATIONS_RUNNING=0` |

Screenshots: `docs/minimalism-dark-blue/renders/stage7b/` — `a-toggle-off-no-button-{390,1440}.png`,
`b-escape-1440.png`, `cd-open-1440.png`, `c-backdrop-closed-1440.png`, `d-close-button-1440.png`,
`e-scrolllock-open-390.png`, `f-loadmore-1440-{first24,after25}.png`, `g-no-memories-no-button-{390,1440}.png`,
`i-builder-preview-samples-1440.png`, `i-builder-preview-real-photos-1440.png`,
`j-expired-url-recovered-1440.png`, `k-fr-reduced-motion-1440.png`.

### Code changes required by failed proof steps (minimal)

1. `app/api/invitation/[token]/memories/route.ts` — removed `export const runtime = "nodejs"`
   (500: `Route segment config "runtime" is not compatible with nextConfig.cacheComponents`).
2. `components/memories/MemoriesGallery.tsx` — backdrop overlay child swallowed `pointerdown`;
   added `pointer-events-none` to the decorative `aria-hidden` overlay so the dialog's own
   backdrop handler fires.
3. `lib/actions/event-memories.ts` — `getOrCreateMemorySettings` returned the existing inactive row
   without reactivating it, so "Enable photo uploads" was a no-op after a disable. It now
   `update({ is_active: true, revoked_at: null })` and revalidates.
4. `app/invitation/builder-preview/[eventId]/page.tsx` — preview passed no memories props, so the
   builder frame could never show real photos. Added `readShowMemories` + `resolveMemoriesProps` and
   passes `memoriesSample` / `memoriesCount` / `memoriesToken` into the preview event.
5. `lib/memories/sample-memories.ts` — sample set trimmed from 6 assets to **3**, matching the
   acceptance criterion and the "3 samples" badge state; three also fill one desktop row.
6. `lib/__tests__/invitation-template-manifest.test.cjs` — allow-listed the three assembly-provided
   reads (`memoriesSample`, `memoriesCount`, `memoriesToken`); assertions unchanged. Diff:

```
@@ -111,6 +111,8 @@
       "scrollPrompt","ticketInstance","sampleFields",
+      // provided by lib/memories/resolve-memories-props (guest gallery assembly)
+      "memoriesSample","memoriesCount","memoriesToken",
     ]);
```

### Cleanup (done)

- All 25 uploaded photos deleted via the dashboard Memories tab (`Delete photo` → storage object then
  row): `COUNTS=[Pending (0), Approved (0), Rejected (0)]`, `DELETE_BUTTONS_LEFT=0`;
  `GET /api/invitation/<share>/memories` → `ITEMS=0`.
- "Require approval" restored ON (prior state): `APPROVAL_CHECKED_AT_START=false` → `APPROVAL_NOW=true`.
- Guest uploads disabled: `UPLOADS_OFF_TEXT=true`, `ENABLE_BTN_VISIBLE=1`, `QR_PRESENT=false`.
- `mf_show_memories` unchecked and republished: `TOGGLE_AFTER_UNCHECK=false`,
  `TOGGLE_PERSISTED_OFF=true` on reload.
- Post-cleanup route evidence: `API_MEMORIES_STATUS=404` (`{"error":"Not found."}`),
  `SHARED_PAGE_STATUS=200`, `SHARED_PAGE_HAS_MEMORIES_BUTTON=false`.
- Share link was enabled before this task and was left enabled.
- `.stage7b/` and `.stage7a-dev.out` removed; dev server on 3100 stopped; port 3000 untouched.

### Verification

- `npx eslint` on `components/memories lib/memories app/api/invitation/[token]/memories
  app/invitation/{builder-preview,shared}/[token|eventId] app/invitation/[token]/page.tsx
  components/invitation/templates/minimalism-dark-blue lib/actions/event-memories.ts
  lib/invitation-template-preview-data.ts …/TemplateFieldsSection.tsx` → **exit 0**.
- `npx tsc --noEmit` → **exit 0**, no output.
- `npm test` → `Files: 277 / Tests: 3352 / Passed: 3349 / Failed: 3 / Batch errors: 0`.
  Failures are exactly the known baseline: 2 × `event-scan-activity`
  (`lib/__tests__/event-scan-activity.test.cjs:60`, `:71`) and 1 × `stage17-pass-one`
  (`lib/workforce/__tests__/stage17-pass-one.test.cjs:285`). **Delta vs known 3 = 0** (the
  `invitation-template-manifest` failure is gone).
- `npm run build` → `BUILD_EXIT=0` (see Build state).
- Final re-build after the `sample-memories.ts` trim (the only change made after the first build):
  `✓ Compiled successfully in 53s`, `BUILD_EXIT=0`, route table printed, `.next/lock` absent.
