# Aldriva — Current Implementation State & Living Status

## Active Worktree Update — Public Site Design System (PSD), Stage 1 Foundation (2026-10-15; working tree)

- **Status: PARTIALLY COMPLETE.** Shared public styling, category-neutral V2 creation, the live catalog adapter, gallery sample isolation, and automated verification are implemented in the working tree. Authenticated browser review and live tenant/database checks remain open.
- **Scoped design system:** `.public-site` owns public type, spacing, radius, surface, border, shadow, button, focus, and accent roles. The root variables, global body typography, and Tailwind base remain outside the public token scope. Public UI uses the already-loaded Plus Jakarta Sans body/UI font; the existing template heading choice reaches rendered block headings through the shared heading variable. Caption text is 12px minimum.
- **Branding and hero:** Six accent palettes resolve from `metadata.brand.accentId`, with manifest fallback; the public page and builder preview use the stored accent. Existing Table & Flame and DriveLine defaults preserve their terracotta and blue accents; future food/store template identifiers default to mustard/warm gold. Hero image and logo are optional; an image-less hero is text-only and the business name remains the header fallback. No Branding control was added: the existing metadata writer is timezone-specific and there is no accent-specific write path or V2 control.
- **V2 category and catalog:** Category is recommendation-only in the V2 gallery and server creation action. The V1 gallery and instantiation category check remain unchanged. The read-only catalog adapter selects live menu or product data; unsupported/empty catalog slots, pages, nav links, and primary actions are hidden. Services and fleet adapters remain unsupported and hidden.
- **Gallery isolation:** Previews use the linked owner's business name/logo and neutral EN/FR sample wording. Samples are preview-only; public rendering and owner content remain sample-free.
- **Verification:** The latest affected batch passed 266/266; the registered `npm test --script-shell=pwsh` suite passed 2,286/2,286; touched-file ESLint and `npx tsc --noEmit` exited 0. No migration or database write was performed. Desktop/mobile live-site review remains to be done by hand.

## Active Worktree Update — Phase 4.1: Unverified business 404 fix + approval gating (2026-10-13)

- **Status: IMPLEMENTED IN WORKING TREE.** Fixed bare 404s for Menu and Website links from the business shell, added business approval gating for publish and public orders.
- **Root cause fixed:** `app/dashboard/businesses/[id]/layout.tsx` now fetches `organizer_id`. Nav items for `menu` and `website` now redirect to `/dashboard/org/<organizer_id>/menu` and `/dashboard/org/<organizer_id>/website/new` — the only pages that exist. No new page files created.
- **Approval gate — pure predicate:** `lib/business-approval.ts` — pure, I/O-free. `getApprovalState(statusArray[])` → `"approved" | "pending" | "rejected" | "archived" | "none"`. `canPublish(state)` and `canTakeOrders(state)` are true for `"approved"` and `"none"` (direct organizer flow).
- **Approval gate — server helper:** `lib/server-approval.ts` — `getOrgApproval(organizerId)` queries `businesses.status` once, returns `ApprovalState`. Used by all gates.
- **Publish gating:** `publishPageDraft` ([`lib/actions/website-builder.ts`](file:///c:/Users/Youngyz/aldriva-staging/lib/actions/website-builder.ts)) and `publishContentDraft` ([`lib/actions/website-content.ts`](file:///c:/Users/Youngyz/aldriva-staging/lib/actions/website-content.ts)) both reject with a specific EN message when `canPublish(state) === false`. Saving drafts is **not** blocked.
- **Order gating:** `submitOrderRequestWithClient` ([`lib/order-submit.ts`](file:///c:/Users/Youngyz/aldriva-staging/lib/order-submit.ts)) rejects `ordering_disabled` with neutral message ("Ordering is not available yet.") that does not leak internal business status. Applied after `storefrontFeatures.ordering` check, before payment method check.
- **Approval banner:** `OrgApprovalBanner.tsx` renders a localized amber/red/zinc banner for pending/rejected/archived states. Rendered `null` for approved/none. Sidebar continues showing Menu and Website for all states — gating is via banner + server enforcement, not nav hiding.
- **Org layout:** fetches `businesses.status` alongside existing columns. Derives `approvalState` via `getApprovalState`. Renders `<OrgApprovalBanner>` in the main content area.
- **Admin approval revalidation:** `app/api/admin/businesses/[id]/route.ts` now calls `revalidatePath("/dashboard/org", "layout")` after approve/reject so the org dashboard reflects the new state on the next request.
- **Dev-mode logging:** `console.warn` before every `notFound()` in org layout, website/new page, and business shell layout — naming the cause without logging PII.
- **EN/FR strings:** `BusinessApproval` namespace added to both `messages/en.json` and `messages/fr.json` with 12 keys covering pending/rejected/archived banners, publish-blocked, orders-unavailable, and no-organizer state.
- **Tests:** `lib/__tests__/phase4-1-business-approval.test.cjs` — 36 tests: predicate matrix (all 5 states × canPublish + canTakeOrders), message leakage checks, nav routing, sidebar visibility, EN/FR parity, source-level gate presence in all 3 gated files, revalidatePath, dev logging. Registered in `package.json`.
- **Updated pre-existing test:** `lib/__tests__/org-dashboard-modules.test.cjs` line 307 updated to match new `"..., status"` column in the business query.
- **Verification:** new approval tests 36/36 ✓; targeted suite (phase4+, org-dashboard-modules, business-offerings, website-builder, website-content, order) 257/257 ✓; ESLint exit 0 ✓; `tsc --noEmit` exit 0 ✓. No commit, push, or migration changes.
- **Not done (outside scope):** already-published sites whose business becomes non-active — code paths identified (3: website proxy doesn't check status; public page renders; builder page doesn't gate). No action taken per "report only" requirement.

## Active Worktree Update — Phase 4 Addendum: "Ordering & payments" panel in website builder (2026-10-13)

- **Status: IMPLEMENTED IN WORKING TREE.** Added an "Ordering & payments" accordion panel to the v2 website editor (category-agnostic). Toggles online_ordering, pickup, delivery, online_payment — reads/writes via the existing `updateBusiness` path in `lib/actions/businesses.ts`. No new column, no new table.
- **Fulfilment rule:** `resolveStorefrontFeatures` now enforces that `ordering` is `false` unless at least one of pickup/delivery/delivery_to_customer is ticked. Panel and Edit-business form both show a warning when online_ordering is on with no fulfilment method. Existing sites with offerings unset are unchanged.
- **Live updates:** changes write immediately (no draft/publish cycle) and are communicated to the builder preview via `"update_offerings"` postMessage. An amber "Ordering works on your live site, not in this preview" banner appears when ordering is live.
- **Role gating:** owner/admin/manager can toggle; editor/viewer see read-only. Multiple linked businesses use earliest-by-created_at rule (same as website category derivation); panel says which business is shown.
- **Status lines:** each toggle shows "Live" or "Needs setup — <reason>" computed by `computeFeatureStatus`. Toggles for features not built in the active template are suppressed.
- **Panel location:** [`components/dashboard/website/v2/OrderingPaymentsPanel.tsx`](file:///c:/Users/Youngyz/aldriva-staging/components/dashboard/website/v2/OrderingPaymentsPanel.tsx); mounted in [`V2WebsiteEditor.tsx`](file:///c:/Users/Youngyz/aldriva-staging/components/dashboard/website/v2/V2WebsiteEditor.tsx). The panel calls `updateBusiness` directly — no duplicate form logic; shared with the Edit-business form via the same server action and `validateBusinessOfferings`.
- **Tests:** `lib/__tests__/phase4-ordering-payments-panel.test.cjs` (8 tests: toggle writes, unknown key rejection, role gating, status reasons, fulfilment rule, EN/FR parity, unbuilt template suppression, render). Registered in `package.json`.
- **Pre-existing fix:** `event-import-removal.test.cjs` pattern tightened from `/import/i` (too broad — caught French "Importez") to event-import-specific patterns. `org-dashboard-modules.ts` Orders nav check simplified to direct `offerings.includes("online_ordering")` (nav access ≠ storefront live state).
- **Verification:** ESLint clean, `tsc --noEmit` clean. Full `npm test --script-shell=pwsh` → 2069/2069 passing (pending confirmation of final run). Build and browser review not run.

## Active Worktree Update — Phase 3.1 Menu interaction fix (2026-10-13)

- **Status: IMPLEMENTED IN WORKING TREE.** Default-view dish cards were dead static markup (grid gated behind search/chip engagement); the mounted grid is now always interactive. Builder preview stays display-only by design. Gating rules intact.
- **Verification:** website+ 220/220, invitation 351/351, org-nav 96/96; `tsc --noEmit` and ESLint clean. Only known failure is the pre-existing `event-import-removal` fr.json check (fails on clean HEAD). Browser hand-check pending (restart dev, hard refresh, click a dish, tick offerings, republish, order as guest).

## Active Worktree Update — Phase 3 Online card payment + slug fix (2026-10-13)

- **Status: IMPLEMENTED IN WORKING TREE; migration 173 and the USD data-fix script written but NOT applied.** Slug root cause fixed for future rows (SQL trigger + shared JS helper); USD-only PaymentIntent flow with webhook source of truth, idempotent paid flip, and read-time expiry labels. Owner notified only on payment success.
- **Verification:** website+ 216/216, invitation 351/351, org-nav 96/96; `tsc --noEmit` and ESLint clean. Only known failure is the pre-existing `event-import-removal` fr.json check (fails on clean HEAD). Build, browser review, live migration/RLS, and Stripe test-mode verification not run.

## Active Worktree Update — Phase 2b-2.2 Ordering hardening (2026-10-13)

- **Status: IMPLEMENTED IN WORKING TREE; migration 172 written but NOT applied.** Notification CHECKs widened to the 44/116/171 union plus code-sent `organizer` (files only: `db/` forward + rollback restoring 171 + identical mirror). Order logic extracted to `lib/order-submit.ts` with client injection; the public action accepts serializable input only. Unknown option ids fail with `unknown_option` and surface a specific cart message. New static table-reference guard (grandfathered `guests` miss in the event overview page). `stage17` pin moved 171 → 172.
- **Verification:** website set 205/205, invitation 351/351 (14 files), org-nav 96/96 (7 files); `tsc --noEmit` and ESLint on touched files clean. Only known failure is the pre-existing `event-import-removal` fr.json check, which fails on clean HEAD (committed music copy). Build, browser review, live migration/RLS verification not run.

## Active Worktree Update — Phase 2b-2.1 Ordering reconcile and harden (2026-10-13)

- **Status: IMPLEMENTED IN WORKING TREE; migration 171 applied-state reconciled in files, live DB not re-verified here.** Supabase mirror of migration 171 is now byte-identical to `db/` (tenant_websites reference); `lib/actions/orders.ts` resolves via `tenant_websites` with an injectable admin override; pure phone validation lives in `lib/order-phone.ts`. Org Orders page excludes viewer; business Orders hidden (`routeExists: false`); org Orders nav requires resolver `ordering` (offering + capability + built block) with offerings plumbed through layout/sidebar/mobile surfaces.
- `phase2b2-cart-and-orders` now exercises mocked `submitOrderRequest` (tampered price uses DB promo, sold-out/inactive/foreign-tenant/delivery-without-offering/duplicate-idempotency/invalid-options/honeypot/rate-limited) and failing-channel dispatcher tests; Table & Flame `menu.order-buttons` real-block plus unticked-site-unchanged and CI→XOF tests added. `stage17` pin moved 168 → 171.
- **Verification:** ESLint clean, `tsc --noEmit` clean, touched suites 169/169. Full `npm test` 2015/2018 (2 failures fixed by this task; 1 pre-existing `event-import-removal` fr.json import-substring failure from invitation music copy, out of scope). Build, authenticated browser review, and live migration/RLS verification were not run.
- No stage/commit/push/checkout/stash/reset performed. No changes to `next.config.ts`, `.tmp-soundcloud-proof.cjs`, invitation files, or migration 169/170 files. `package.json` untouched (all touched tests were already registered).

## Active Worktree Update — Phase 2a Offerings, Capability Gating & Hours (2026-10-12)

- **Status: IMPLEMENTED IN WORKING TREE; database migration not applied.** This phase adds a stable-key `businesses.offerings` catalog and an additive migration 169, derives storefront feature availability from business capabilities, owner selections, and manifest-built features, and carries linked-business context through the v2 website resolver. Restaurant and rental use the same mechanism; no commerce or reservation page was added.
- Business create/edit forms persist localized offering selections. The existing features block renders selected factual offerings; v2 template navigation and CTA filtering use the shared feature resolver. Custom Business always receives the generic catalog, even under a specialized category. The restaurant ordering-off CTA says “View menu”; rental fallback copy asks about availability and links to Contact. Reservation dashboard navigation is suppressed while its route is not implemented. Website category preselection uses the earliest linked business by `created_at`.
- Website hours normalize safe 24-hour pairs and render a single localized “Today” line in the shared footer, including overnight intervals. The contact block retains the weekly schedule. `today_tag` remains owner-provided highlight text.
- Migration 169 adds `businesses.offerings text[]` with stable-key and maximum-cardinality checks; it was not executed and does not alter RLS. Orders migration numbering should move from 169 to 170.
- **Verification:** focused Phase 2a suites passed 86/86; the selected website suites passed 296/296 across 25 test files; invitation suites passed 322/322 across 14 test files; organization/navigation suites passed 47/47 across three files. `npx tsc --noEmit` passed, and ESLint passed on touched TypeScript and test files. Build, authenticated browser review, and live migration/RLS verification were not run.
- No invitation files, `next.config.ts`, or `.tmp-soundcloud-proof.cjs` were changed. All work remains unstaged and uncommitted.

## Active Worktree Update — Website V2 server-action export compliance (2026-10-11)

- Status: IMPLEMENTED IN WORKING TREE; website/invitation suites, TypeScript, and lint verified. Extracted buildInitialContentFromOrganizer from the "use server" action module into lib/website-v2-initial-content.ts. The already-registered website content action suite now checks all module-level "use server" files under lib/actions and app; 19 modules were scanned, with no other invalid runtime exports found.
- Verification: website and invitation selections passed 582/582 tests across 81 suites; tsc --noEmit passed; ESLint passed with no errors or warnings. npx next build --webpack still stops before compilation because SWC cannot canonicalize jsc.baseUrl(C:\Users\Youngyz\aldriva-staging) in this Windows sandbox (Access is denied, OS error 5). The client import scan found only intentional Next.js server-action references and no Node built-ins or server-only modules in the scanned website client dependency graph.

## Active Worktree Update — Website V2 Create Flow Stage 4B-3 (2026-10-11)

- **Status: IMPLEMENTED IN WORKING TREE; tests, TypeScript, and lint verified; production build blocked before compilation.** The organization create route now shows only the two v2 flagship templates, filters them through `isTemplateCompatibleWithCategory`, and starts the selected category from the organizer's mapped `org_type`. Existing websites still redirect to their overview; editors see disabled create buttons.
- Card previews resolve sample content through the v2 resolver, render the Home page through `BlockRenderer`, and use the v2 header/footer with locked theme tokens. Preview embeds have no tenant ID and therefore show their empty state without querying live embed data. Preview content is separate from any save action.
- The create action receives the route organizer ID and only `{ websiteCategory, creationRequestId }` as client options. The client reuses the request ID for retries of the same template/category attempt and navigates to the v2 builder after success. The legacy gallery and blank-site flow are no longer linked from this route; their files remain.
- **Verification:** the combined website/invitation selection and direct-run v2 suites passed 581/581 across 81 suites. `tsc --noEmit` passed; ESLint on changed files passed with 0 errors and 0 warnings. `npm run build` stopped before compilation because SWC failed to canonicalize `jsc.baseUrl(C:\Users\Youngyz\aldriva-staging)` with `Access is denied` (Windows OS error 5). Browser review remains unverified.

## Active Worktree Update — Website V2 Editor Stage 4B-2a (2026-10-11)

- **Status: IMPLEMENTED IN WORKING TREE; build/browser verification outstanding.** The template-first editor route now selects a form-first accordion editor for valid v2 sites while preserving the legacy builder path. The implementation adds typed slot controls, tenant-scoped menu choices, a same-origin iframe preview, and an opt-in stale-draft pause. No database access, schema change, migration, invitation file, `proxy.ts`, or `package.json` change was made for this stage.
- New hermetic coverage is in `lib/__tests__/website-v2-editor-schema.test.cjs`, `lib/__tests__/website-preview-channel-and-save-queue.test.cjs`, and `lib/security/__tests__/website-v2-menu-choices.test.cjs`. They were included in the direct run because this task prohibits `package.json` edits, so they are not registered in the repository's explicit `npm test` file list.
- **Verification:** invitation + website suites passed 573/573 across 81 suites; `tsc --noEmit` passed; ESLint on changed source and test files passed with 0 errors and 0 warnings. `npm run build` stopped before compilation when SWC could not canonicalize `jsc.baseUrl(C:\Users\Youngyz\aldriva-staging)` (Windows sandbox access denied, OS error 5). Authenticated browser parity and responsive visual review remain unverified.
- Preview blocks are resolved from the v2 resolver and use v2 header/footer components. The block preview uses an editor-side renderer; exact visual parity with the public `BlockRenderer` still needs authenticated browser review.

> **WHERE ARE WE RIGHT NOW?**  
> **Current Phase**: **Phase 5 + Business Moderation — 137 guard + screening, 138 resubmit + organizer_id guard**  
> **Prerequisites**: **migrations 130 (metadata), 131 (atomic), 132 (business_type), 133 (event subcategory), 134 (promotions), 135 (locale), 136 (services/menus), 137 (moderation guard + screening), 138 (rejected resubmit + organizer_id guard) — 136 applied live 2026-09-24 (23514 verified), 137 applied live 2026-09-24 (manual), 138 written 2026-09-24 not yet applied live (manual apply required).**  
> **Next Step**: **Verify 138 live manually, then Phase 6 (now 139 after shift)**  
> **Last Verified**: 2026-09-24 — 138 hermetic (organizer_id protected, rejected re-screen 3/24h cap, manual risk ??0), live 137 verified (valid insert + bad dietary/modifier 23514), live 138 NOT yet applied (no DB connection), RLS/trigger not non-admin tested  
> **Test Suite**: 688/688 passing (36 suites, 0 failures) — screening rejected cap + admin risk + moderation guard + organizer_id  
> **TypeScript Health**: 0 errors (`npx tsc --noEmit --skipLibCheck` verified)  
> **Build Health**: Next.js 16.3.4 production build verified (compiled successfully, Turbopack)

## Parallel Infrastructure Milestone — R2 Public Media (2026-10-08)

- **Status: PARTIALLY COMPLETE.** The public image pipeline is purpose-scoped for authenticated users (CMS remains active-admin-only), with env-configurable per-user/IP limits, atomic daily quotas, private temporary uploads, and server-side WebP processing. `HomepageCmsTabs` and event creation route through the image driver. Product assets use private R2 only in production and retain per-file Supabase/R2 download selection. Migration 160 had already been applied on staging; this task did not access a database or R2. Migration 161 adds the configurable quota RPC and remains pending, as does migration 159. See `docs/phases/phase-r2-media-storage.md` and `docs/R2-MEDIA-SETUP.md`.
- Supabase remains the non-production image driver; non-production deployments reject public R2 operations. Image display accepts same-origin paths, Supabase hosts, and the configured media host. Other remote image hosts are rejected. Video/audio and the report-only website-builder `cms-media` write-policy inconsistency remain unchanged.
- Public-image limits default to 20 requests per user per 10 minutes, 60 per IP per 10 minutes, and 40 upload reservations / 200 MiB per user per UTC day; all six values are environment-configurable. The quota applies only to the R2 driver. Temp objects need a one-day lifecycle expiration. Replacement leaves the old immutable public image in place for explicit deletion or a later orphan-cleanup pass.
- **Report-only finding:** the website-builder `MediaUploadField` uploads to `cms-media` for tenant users, but migration 117 grants writes only to active platform admins. No policy or builder change is included in this milestone.

## Parallel Security Milestone — Server-only boundaries (2026-10-08)

- **Status: COMPLETE.** Split privileged seating mutations, server overview data, server site URL generation, and invitation share URL generation away from browser-shared modules before adding boundaries. Added `server-only` to secret-reading modules and server-only helpers; standalone scripts and test fixtures remain unmarked. `proxy.ts` accepts the marker in the production build.
- Added a test-only `server-only` stub alias and `npm run check:client-secrets`, which checks credential-shaped patterns and actual secret environment values against `.next/static` (including source maps) while reporting file names only. No secret findings; no source maps were present in the current build. The `NEXT_PUBLIC_` environment-name audit found no secret-named entries.
- **Verification:** TypeScript and production build passed; the registered suite passed 1,456/1,456 tests across 109 suites; the client-secret scan passed. The suite currently registers 1,456 tests, including tests added in the working tree since the earlier R2 report.
- **Report only:** `proxy.ts` uses the service-role REST key on article, business, product, and website slug gates to check restricted/unpublished state before streaming. The existing check appears to require privileged reads; replacing this with a narrow RPC or public projection needs a separate design. See `docs/phases/phase-server-only-boundaries.md`.

## Invitation Rounds — Phase 0 baseline (2026-10-09)

- **Status: SUPERSEDED by Round 4 below (uncommitted, awaiting owner review).** Dirty overview/builder rework committed standalone as `6ee76d6` on `integration/full-recovery` (8 files, +111/−13). Owner decisions recorded as DEC-0028 (Rule-1 strip, `/m/` route, slug gate, retention, migration process).
- **Gate cleared by owner**: 154–161 verified on staging; `we-are-getting-married` reclassified to `kind='invitation'`; two public events keep unpublished draft pages (must stay unreachable).

## Invitation Round 5 — step 3 + builder UX (updated 2026-10-10; step 3 committed as 1c7dbdb, 3b committed as 09f9470, 3c committed as 1991ee0, 3d committed as c16fbbc)

- **Status: 3d committed locally as c16fbbc.** Cover pair (code-owned card + page), snapshot-only card hero with guarded 3s fetch, builder empty state, i18n. 3b adds accordion and gallery fixes; 3c adds type dropdown, page-first template picker, and candidate selection; 3d renames templates to unified display names (Aurora, Confetti, Midnight, Atelier, Cover Story) and adds the pure-CSS mobile/desktop device preview frame with responsive fit scaling. No migration (164 still reserved).
- Latest 3c visual pass puts the portrait card crop in the tile footer to keep page details visible, uses each paired card's own art (Cover alone uses the event hero), closes the type section after confirmation, and localizes the collapsed type/template names.
- **Known limitation: invitation hero images live in the public `cms-media` bucket** (unguessable `invitation-hero/{eventId}/` paths, never linked publicly, but readable by anyone with the URL — same posture as all existing invitation artwork). Revisit with private signed URLs later if guest-photo-grade privacy is ever required for heroes.
- **Latest verification (real output)**: ESLint 0 errors on touched files, `tsc --noEmit` exit 0, `npm run build` exit 0, `npm test` **1,654/1,654 pass across 146 suites**.

## Invitation Music Links + Expandable QR (2026-10-10, UNCOMMITTED working tree)

- **Status: IMPLEMENTED, uncommitted.** The builder accepts up to three validated Spotify or SoundCloud links. Uploaded audio keeps its existing play/pause behavior. The guest invitation page has one bottom pill: Spotify and SoundCloud load hidden API-controlled embeds before the tap, then the pill calls play/pause synchronously and reflects provider playback events. SDK errors/timeouts show an unavailable state and the tap opens the validated provider URL. The pill moves above the first-visit consent prompt on narrow screens. No player sheet or visible provider player is mounted. Migration 167's column is verified on the configured staging project by a real builder save/reload; CLI migration-history state and production remain unverified.
- **Music root causes verified in headless Chrome:** Spotify's iFrame API runtime from `embed-cdn.spotifycdn.com` was blocked by the old `script-src`, preventing controller initialization; the observed runtime host is now permitted, and the provider frame origins are allowed by `frame-src`. The builder preview iframe lacked `allow="autoplay"`; it now delegates autoplay and the Spotify-created iframe itself reported `allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"`. On a first visit, the invitation consent prompt could cover the bottom pill on mobile; the pill now clears the prompt without changing section layout. The SDK was already initialized on mount and the Spotify callback was defined before its script, so tap-time SDK creation/callback ordering was not the cause. The embeds are real-size and in-viewport. SoundCloud's API and media stream worked once the tap reached the control. No `connect-src` or `img-src` additions were needed.
- **QR root cause and repair:** the Black Tie template's enlarged QR used a remote `api.qrserver.com` image, but the site's `img-src` CSP does not allow that host. The blank body was an image request blocked by CSP, not a canvas ref or dialog sizing problem. All QR variants now render the exact existing payload as centered inline SVG; the QR's RSVP-section footprint is unchanged, and tapping the enlarged QR closes the overlay.
- **Removed legacy providers:** Apple Music and Audiomack are no longer selectable or accepted. Existing values are filtered on draft, preview, and published reads, and the builder shows a one-time notice. No data migration is needed; no database changes were made for provider removal.
- **Browser verification:** headless Chrome mounted the real QR component: trigger SVG 96×96, enlarged SVG 480×480 with rendered paths on a white panel, no `<img>`/`<canvas>`, zero CSP violations, and RSVP section height unchanged at 164px. Spotify and SoundCloud returned provider playback-start and pause events; `play()` calls ran with `navigator.userActivation.isActive === true`. The Spotify track and SoundCloud HLS media requests returned 200. The preview iframe reported `allow="autoplay"`; playback was verified within it. A deliberately blocked Spotify SDK produced the visible unavailable state and opened the validated track URL externally. SoundCloud's widget bundle logged `AbortError: signal is aborted without reason` as pause canceled an HLS request; its play and pause events still arrived, and no enforced CSP violation remained. Headless Chrome verifies provider playback events and stream requests, not that audio is physically audible.
- **Quality checks:** targeted ESLint exit 0; `tsc --noEmit` exit 0; `npm test` 1,798/1,798 across 184 suites; `npm run build` exit 0. No commit made.

## Invitation music persistence follow-up (2026-10-11)

- Source tracing found `music_links` in the shared builder draft, autosave payload, server-action Zod schema/upsert, draft loader, published snapshot, and preview data. Spotify `?si=` is retained. A real builder session on the configured staging project saved a Spotify track, reloaded it, and displayed the count beside the existing Apple link. The staging column is present; migration ledger state could not be checked because this checkout is not linked with the Supabase CLI. Local Supabase is stopped and Docker is unavailable.
- The confirmed reason for a saved link showing “No music” was that the collapsed Music summary only checked uploaded audio. The live builder preview also substituted sample audio when a real provider link existed, causing the pill to select sample audio; the preview now preserves link-only playback. Headless Chrome verified the Spotify pill changed to Pause only after a provider playback event. The temporary test link was removed and the invitation's original Apple Music link was restored.
- Added a save/load regression using the real server action with a mocked database boundary, explicit missing-column save/load errors, and a preview-data regression. Verification: targeted ESLint passed; `npx tsc --noEmit` passed; `npm test` passed **1,803/1,803 across 185 suites**; `npm run build` passed. No commit made.
- **2026-10-11 follow-up:** Apple Music/Audiomack support was removed; legacy records are filtered on reads and shown through a one-time builder notice without a data migration. SoundCloud remains supported; the exact `erasedtapes/olafur-arnalds-poland` URL had previously emitted Widget API play/pause events in Chrome. The builder layout, palette normalization, and story-image chapter support are updated in code; visual verification and the current quality commands are pending in this checkout.

## Staff Round — Phase A2 invites (2026-10-10)

- **Status: migrations 164, 165 and 166 APPLIED ON STAGING by owner; production has none. A2 adds labels, names and hashed invitation tokens; no badge minting or scan changes yet.**

## Staff Round — Phase A1/A1b schema (2026-10-10)

- **Status: migrations 164 and 165 APPLIED ON STAGING by owner; production has neither.** 164 (forward + rollback twin + byte-identical mirror) and 165 (forward + rollback twin + byte-identical mirror) are committed locally. **No app code changed in A1/A1b.**

## Invitation Round 5 — step 2: unified picker + atomic RPC (2026-10-09, COMMITTED as 5bff7c9)

- **Status: COMMITTED as 5bff7c9 (step 3 built on top, uncommitted).** Migration 163 (RPC + rollback + byte-identical mirror) applied on staging by owner. Unified picker in the builder template section (4 pairs, Card|Page tabs, custom-unify, publish notice); page-only dropdown + builder modal removed; 21 i18n keys en+fr. Step 1 committed as 57b10b5.
- **Verification (real output)**: ESLint 0 errors, `tsc --noEmit` exit 0, `npm run build` exit 0, `npm test` **1,613/1,613 pass**.
- **Blocked on owner**: staging picker click-through; approve step 3 (Cover).

## Invitation Round 4 — Memories + Rule-1 strip (2026-10-09, COMMITTED as a390017)

- **Status: COMMITTED as a390017; migration 162 APPLIED ON STAGING by owner.** Retention email copy APPROVED with plain-text mirror; flag stays unset everywhere. Memories confirmed for BOTH event kinds (pinned by test).
- **Verification (real output)**: ESLint 0 errors, `tsc --noEmit` exit 0, `npm run build` exit 0 (new `/m/[token]`, memory APIs, memories tab all compile — build caught and fixed one real `"use server"` violation), `npm test` **1,592/1,592 pass**.
- **Blocked on owner**: manual staging tests (walkthrough: upload → moderation → ZIP → retention dry-run); production migration decision.

---

## 1. System Implementation Classification

### A. COMPLETE (Verified Working in Code & Tests)
1. **Events & Ticketing**:
   - Multi-tier, multi-seat ticket catalog and checkout (`app/events/[slug]`, `app/api/checkout/session`).
   - SVG-based interactive venue builder & seating engine (`lib/seating*.ts`, `app/dashboard/events/[id]/seating`).
   - Anti-double-sell seat locking with automatic stale hold release (`lib/seating.ts`, `migration_118`).
   - Secure QR code generation, issuance, and verification (`lib/qr.ts`, `app/verify/[code]`).
   - Hybrid offline-capable door scanner PWA with IndexedDB local caching and batch conflict sync (`lib/offline-scanner.ts`, `migration_122`, `migration_124`).
   - Digital invitation template system, custom card designer, and RSVP lifecycle (`app/dashboard/events/[id]/invitation-design`, `migration_120`, `migration_121`).
   - Event team RBAC (`owner`, `manager`, `scanner`, `checkin`) with invitation acceptance flows (`lib/event-team.ts`, `migration_76`).
2. **Fundraising & Beneficiary Operations**:
   - Crowdfunding campaign creation, media galleries, and public goal progress (`app/fundraisers/[slug]`).
   - Beneficiary claims, dedicated beneficiary accounts, and transparent recipient ledger credits (`lib/beneficiary.ts`, `migration_50`–`56`, `migration_70`–`73`).
   - Public donor wall, private donor protection, and comment activity feeds (`app/fundraisers/[slug]/donate`, `migration_29`–`33`).
   - Automated PDF donation receipts and certificate issuance (`lib/receipt.ts`, `lib/certificate.ts`).
3. **Digital Products & Marketplace Commerce**:
   - Product catalog, flight strips, digital downloads, and inventory tracking (`app/products/page.tsx`, `app/(gated)/products/[slug]`).
   - Tokenized private asset delivery via signed URLs with ~120s TTL (`lib/digital-products.ts`, `lib/product-access.ts`, `migration_116`).
   - Dual payment processing (Stripe Checkout + NOWPayments Crypto) with idempotent webhook credit RPCs (`app/api/webhooks/stripe`, `app/api/crypto/webhook`).
4. **Articles & Editorial Publishing**:
   - TipTap WYSIWYG editor with image uploads, tags, and category taxonomies (`app/dashboard/articles/new`, `lib/actions/articles.ts`).
   - AI narration synthesis via NVIDIA FastPitch TTS with chunking and WAV concatenation (`lib/audio/*`).
   - Content moderation approval workflow (`draft` → `pending_review` → `published` / `rejected`).
5. **Multi-Tenant Architecture & Entities**:
   - Canonical entity model rooted in `organizers.id` (`migration_48`, `migration_58`).
   - Entity-level RBAC (`owner`, `admin`, `manager`, `editor`, `finance`, `viewer`) via `entity_members` (`migration_59`, `migration_62`).
   - Identity verification workflow with encrypted document storage (`migration_60`, `migration_82`–`87`).
6. **Tenant Websites & CMS Foundation (Phase 1)**:
   - Core data model for multi-page customizable business websites anchored to `organizers.id` (`db/migration_125_tenant_websites.sql`).
   - RLS privilege segregation fixing DELETE permissions so `editor` roles cannot execute destructive drops on websites, pages, or navigation trees (`db/migration_126_website_delete_rls_fix.sql`, DEC-0011).
   - Server action CRUD services with entity role authorization and navigation tree sanitization (`lib/actions/website.ts`, `lib/website-nav.ts`).
   - Tenant dashboard settings interface for themes, header/footer configuration, pages management, navigation menu builder, and SEO metadata (`app/dashboard/org/[id]/website/`).
7. **Public Website Rendering Engine (Phase 2)**:
   - Dynamic catch-all SSR public route (`app/site/[slug]/[[...page]]/page.tsx`) with standalone isolated segment layout (`app/site/[slug]/layout.tsx`).
   - Pre-stream status gate in `proxy.ts` (`checkWebsiteAccess`) ensuring unlisted/draft sites return true HTTP 404 to anonymous visitors while allowing authenticated entity preview.
   - Branded `SiteHeader` and `SiteFooter` with live navigation staleness pruning (`filterPublishedNavItems`) and draft preview banner (`DraftPreviewBanner`).
   - Structured JSON-LD metadata (`WebSite`, `Organization`, `WebPage`) and dynamic OpenGraph metadata generation (`lib/website-structured-data.ts`).
   - Reserved platform slugs validator (`RESERVED_WEBSITE_SLUGS`) in `lib/website-nav.ts` and `lib/actions/website.ts`.
   - Test suite in `lib/__tests__/website-engine.test.cjs` registered in `package.json`.
8. **Website Design System & Block Catalog (Phase 3)**:
   - Complete TypeScript block type schema for all 10 block types + 2 legacy types in `lib/website-blocks.ts`:
     - `hero` (split, center, video_bg variants), `features`, `about`, `gallery`, `testimonials`, `contact`, `faq`, `events_embed`, `products_embed`, `fundraiser_embed`, `rich_text`, `cta_banner`.
   - Write-time validation (`validateBlock`) with length bounds, array item caps (max 12), UUID format checks, and URL safety backed directly by `sanitizeUrl()` from `lib/sanitize-html.ts`. Protocol-relative (`//evil.com`) and dangerous scheme URLs are rejected at both write-time and render-time with no drift risk.
   - Fallback parser (`parseBlock` / `parseBlocks`) for resilient rendering of stored JSONB without hard failures.
   - Six responsive theme palette presets (`default`/`zinc_orange`, `dark`, `slate`, `warm_amber`, `forest`) with `resolveThemeTokens()` and `themeTokensToStyle()` CSS variable generation.
   - Live embed block server-side resolvers in `lib/website-embeds.ts`:
     - `resolveEventsEmbed`: scoped to `events.organizer_id = tenantId` with status gating and LIMIT clamp 1..12.
     - `resolveProductsEmbed`: resolved via `businesses.organizer_id = tenantId → products.business_id` (two-step join, no cross-tenant `owner_id` fallback).
     - `resolveFundraiserEmbed`: scoped to `fundraisers.organizer_id = tenantId` with `deleted_at IS NULL` guard.
   - Full 12-type visual block component library in `components/site/blocks/BlockRenderer.tsx` (async Server Component):
     - All 10 standard blocks with Aldriva design primitives (`rounded-xl`, `shadow-xs`, zinc/orange tokens).
     - Embed blocks call resolvers server-side with injected `tenantId` + `isTeamMember` gating; never exposes DB queries to client.
     - Draft badge shown to authenticated team members only.
   - Theme tokens applied via `resolveThemeTokens` + `themeTokensToStyle` in `app/site/[slug]/[[...page]]/page.tsx`, scoped to the `<div>` wrapper, isolated from dashboard/admin layouts.
   - Test suites registered in `package.json`: `website-blocks.test.cjs` (15 tests), `website-embeds.test.cjs` (9 tests).
   - **Stage A (Template Registry — 2026-09-21)**: Code-owned immutable registry in `lib/website-template-registry.ts` (6 templates, `id@1.0.0`, `category/supportedCategories/style/previewColor/theme/header/footer/pages[]+navigation`). Backward-compat shim in `lib/website-templates.ts` (legacy `WEBSITE_TEMPLATES.defaultBlocks` derived from `pages[0].blocks`). Centralized helpers `getTemplateById`, `getTemplateByIdVersion`, `getTemplatesByCategory`, `getCompatibleTemplatesForCategory`, `formatTemplateRef`.
   - **Stage B (Section Envelope & Stable IDs — 2026-09-21)**: `SectionEnvelope {id, visible, spacing, background, hiddenOnMobile}` + `WithItemId` on all repeatable items (`features.items`, `gallery.images`, `testimonials.items`, `faq.items`, `about.highlights`). `lib/website-blocks.ts` helpers `generateStableId`, `normalizeBlock(s)`, `cloneBlockWithNewIds`, `isBlockVisible`, envelope-aware `validateBlock`/`parseBlock` (preserves `id`/item ids). `components/dashboard/website/builder/defaultBlocks.ts` generates ids via `normalizeBlock`; `builderReducer.ts` normalizes on `SET_BLOCKS`/`ADD_BLOCK` and uses `cloneBlockWithNewIds` for duplication. `lib/actions/website-builder.ts` normalizes draft/live blocks on `savePageDraft`/`getPageBuilderData`.
    - **Stage C (Category Mapping — 2026-09-21)**: `lib/website-category.ts` defines `WebsiteCategory` (business/restaurant/retail/service/professional/creative/organization), `WEBSITE_CATEGORIES`, `mapOrgTypeToWebsiteCategory`, `refineWebsiteCategoryFromBusinessCategory`, `isTemplateCompatibleWithCategory`/`getCompatibleTemplates` (centralized filtering). `db/migration_130_website_category_and_metadata.sql` adds `tenant_websites.metadata JSONB` (stores `websiteCategory`, future `templateId`/`templateVersion`) + GIN index. `lib/actions/website.ts` persists `metadata`/`websiteCategory`; `app/dashboard/org/[id]/website/new/NewWebsiteClient.tsx` stores selected `websiteType` in `metadata` and uses `homePage.blocks` from registry. `components/dashboard/website/TemplateGallery.tsx` now renders from `TEMPLATE_REGISTRY` via `pages[0].blocks`.
    - **Stage E (Atomic Template Instantiation — 2026-09-24)**: `db/migration_131_website_atomic_creation.sql` creates transactional RPC `create_website_from_template` with `ON CONFLICT (tenant_id) DO NOTHING` race boundary, `creationRequestId` idempotency, pages+drafts+navigation single transaction, `SECURITY DEFINER` + `search_path=public,pg_temp` + `REVOKE PUBLIC/anon/authenticated`/`GRANT service_role`. `lib/website-hydration.ts` whitelisted hydration (`ALLOW_HYDRATION_FIELDS`, `TOKEN_MAP`). `lib/actions/website-instantiation.ts` validates auth/`requireTenantContext`/template/version/category compatibility/reserved slugs/bounded slug retry, then `cloneBlockWithNewIds`+`normalizeBlocks`+`hydrateBlocks`+`validateBlocks` before RPC. `TemplateGallery` → `NewWebsiteClient` uses `crypto.randomUUID()` creationRequestId.
    - **Stage G (Controlled Element Editing — 2026-09-24)**: `lib/website-block-edit-schema.ts` whitelisted editable paths (`isEditablePath`, `getFieldDef`, `setElementValue`) with `__proto__`/`prototype`/`constructor` rejection. `builderReducer` `SELECT_BLOCK_BY_ID`/`SELECT_ELEMENT`/`UPDATE_ELEMENT` with stable item ids, history/dirty, undo/redo. `CanvasBlockPreview` editor-only `data-element-path` + `ring-brand-600`; `BlockRenderer` has no editor overlays. `BlockInspector` section controls remain available when element selected.
    - **Stage G2 (Section Controls — 2026-09-24)**: `lib/section-helpers.ts` (`getSpacingClass`, `getHiddenOnMobileClass`, `getBackgroundStyle`, `isValidSpacing`). `SectionInspector` for `visible`/`hiddenOnMobile`/`spacing`/`background` (color/image/overlay) with `sanitizeUrl` sanitization. `builderReducer` `UPDATE_SECTION` sanitizes invalid values, clears dangerous `javascript:`/`data:text/html` images. Public `BlockRenderer` `SectionEnvelopeWrapper` respects `isBlockVisible`/`hiddenOnMobile`/`spacing`/`background`.
    - **Stage H1 (Container/Layout — 2026-09-24)**: `SectionEnvelope.container` `constrained|wide|narrow|full` (`lib/website-blocks.ts`). `lib/section-helpers.ts` `getContainerClass` (`constrained→max-w-6xl`, `narrow→max-w-3xl`, `wide→max-w-7xl`, `full→w-full`). `BlockRenderer` outer `background/style` vs inner `containerClass` separation. `CanvasBlockWrapper` shows `Container:` visual. `SectionInspector` container picker.
    - **Stage J (Stable Reordering — 2026-09-24)**: `builderReducer` `MOVE_BLOCK` via `splice(fromIndex,1)` + insert, history 1 entry, `isDirty:true`, selection reconciliation by `blockId`, envelope/item IDs preserved, array order only, first/last boundaries disabled, `aria-label` on palette/canvas buttons. No `dnd-kit`/`react-beautiful-dnd`/`puck`. Public `page.tsx` `blocks.map` order preserved (no sort).
    - **Stage K (Template Library + Preview — 2026-09-24)**: `components/dashboard/website/TemplatePreview.tsx` read-only `homePage.blocks` (no clone), respects envelope/helpers, desktop/mobile modes. `TemplateGallery` uses `isTemplateCompatibleWithCategory` + `WEBSITE_CATEGORY_LABELS` + `supportedCategories` display, `Preview` dialog + `Use this template` with `disabled/Applying` guard. `lib/website-templates.ts` shim derives `WEBSITE_TEMPLATES` from registry.
    - **Stage I (My Media — 2026-09-24)**: `lib/media/my-media.ts` tenant-scoped `cms-media/<tenant_id>/<heroes|gallery|team|avatars|blocks>` with `isValidTenantId` UUID + `isSafeTenantPath` traversal block, bounded `limit:100` `sortBy updated_at desc`, `getPublicUrl` + `sanitizeUrl`, `deleteTenantMedia` tenant-scoped `remove`. `MyMediaPicker` (loading skeleton, `No media yet`, `Couldn't load`, `Try again`/`Refresh`, `grid-cols-2 sm:grid-cols-3`, `Use`/`Delete` + `ConfirmDialog destructive`, sanitized thumbnails). `MediaUploadField` 3 tabs `Upload | My Media | Direct URL`. Wired across 5 surfaces (Hero/Gallery/About/Testimonials/Section). No `media_assets` table, no new bucket, no Connected Media (Instagram/Facebook excluded, verified).
 9. **Aldriva AI Core & Safety Architecture**:

   - Provider abstraction layer (`gemini-3.6-flash`, `openrouter`) with reasoning-token stripping (`lib/ai/providers/*`).
   - Hard-coded safe-column allowlists (`SAFE_COLUMNS`) on all 14 tools (`lib/ai/tools/*`, `lib/ai/tools/tenant/*`).
   - Application-layer output guard screening for PII, system prompt echoes, and ungrounded UUIDs (`lib/ai/output-guard.ts`, ADR-0002).
   - Rejection audit persistence and admin review panel (`/admin/ai/rejections`, `migration_89`).
   - Facebook automated publishing via Meta Graph API with Page Access Token caching (`lib/facebook.js`, `lib/facebookPublisher.js`).

10. **Visual Website Builder & Editor (Phase 4 — Complete & Verified)**:
   - Dedicated `website_page_drafts` table with tenant-isolated RLS and auto-incrementing version trigger (`migration_129_website_page_drafts_and_publishing_guard.sql`).
   - Server action suite in `lib/actions/website-builder.ts`: `savePageDraft`, `publishPageDraft` (atomic RPC with `p_expected_version` concurrency check, eliminating TOCTOU races), `discardPageDraft`, `reorderPageBlocks`, `getPageBuilderData`, `getBuilderEmbedOptions`.
   - Centralized tenant access resolution with direct organizer ownership fallback (`checkTenantAccess()` in `lib/entity-auth.ts`).
   - RPC security hardening: `publish_page_draft` revoked from `authenticated`, granted strictly to `service_role`.
    - Property Inspector components in `components/dashboard/website/builder/inspectors/`:
      - 10 modern + 2 legacy inspectors with 100% `BLOCK_LIMITS` parity, draft-tolerant editing with "Required to publish" indicators, URL safety checks, and pure tenant embed filter functions (`filterTenantEvents`, `filterTenantProducts`, `filterTenantFundraisers`).
      - Media upload integration: `MediaUploadField` targeting `cms-media` bucket under `<tenant_id>/...` with `Upload | My Media | Direct URL` tabs.
      - Main dispatcher: `BlockInspector` (now dispatches `SectionInspector` before element mode, `onSectionChange` for envelope).
      - Controlled element editing: `lib/website-block-edit-schema.ts` whitelisted paths, `builderReducer` `UPDATE_ELEMENT`/`SELECT_ELEMENT` with stable item ids, `CanvasBlockPreview` `data-element-path` overlay.
      - Section/container controls: `SectionInspector` (visible/hiddenOnMobile/spacing/background/container), `section-helpers.ts` tokens, `BlockRenderer` `SectionEnvelopeWrapper` outer/inner parity.
      - Stable reordering: `MOVE_BLOCK` splice, history/dirty, selection reconciliation, `BlockPalette`/`CanvasBlockWrapper` Move Up/Down with disabled boundaries, no drag library.
      - Template library: `TemplateGallery` (category-compatible, `supportedCategories` display) + `TemplatePreview` (read-only, desktop/mobile).
      - My Media: `MyMediaPicker` tenant-scoped `cms-media` bounded listing with `Use`/`Delete` + `ConfirmDialog`, wired across 5 surfaces.
    - Three-panel visual builder workspace at `app/dashboard/org/[id]/website/builder/page.tsx`:
      - Palette (`BlockPalette.tsx`), Canvas (`BuilderCanvas.tsx`), Inspector (`BlockInspector.tsx`), Toolbar (`BuilderToolbar.tsx`).
      - Responsive device preview (Desktop 100%, Tablet 768px, Mobile 375px), inline reorder, duplicate, remove, undo/redo reducer history, debounce autosave with publish synchronization.
    - Settings integration in `WebsiteSettingsClient.tsx` with "Edit in Builder" links for all page rows and header action.
    - Payout KYC verification gate in `lib/payouts.ts` (`requestRecipientPayout()`) ensuring funds movement is strictly blocked for unverified organizer/business identities.
      - Regression test suites registered in `package.json`: `website-builder-actions.test.cjs`, `website-builder-inspectors.test.cjs`, `website-builder-canvas.test.cjs`, `website-builder-integration.test.cjs`, `migration129-publishing-guard.test.cjs`, `payout-verification-authz.test.cjs`, `dashboard-profile-architecture.test.cjs`, `website-atomic-instantiation.test.cjs`, `website-builder-g.test.cjs`, `website-builder-g2.test.cjs`, `website-builder-h1j.test.cjs`, `website-builder-hj.test.cjs`, `website-template-library.test.cjs`, `my-media.test.cjs`, `i18n.test.cjs`, `fundraiser-donations-donors.test.cjs`. Total platform test suite: **650/650 passing across 36 suites**.

11. **Aldriva Dashboard & Profile Architecture (Personal Ownership, Privacy & Navigation)**:
    - Four clearly separated contexts:
      1. **Personal Account ("My ...")**: Items directly owned by user (`organizer_id IS NULL` for campaigns/events/businesses/articles, `business_id IS NULL` for products, purchased `ticket_orders`, and user `donations`).
      2. **Aggregate Organizer Resources**: User-managed collective resources across authorized organizers (`/dashboard/events`, `/dashboard/fundraisers`, `/dashboard/businesses`, `/dashboard/articles`, `/dashboard/products`).
      3. **Organizer Workspace**: Tenant workspace context (`/dashboard/org/[id]/overview`).
      4. **Entity Management**: Individual entity dashboards (`/dashboard/events/[id]/overview`, etc.).
    - Public User Profile (`/profile/[id]`): External visitors see only public personal items + follower/following counts. Private organizer lists and organizer-owned campaigns/events are hidden from public profile.
    - Follower & Following Privacy: Server-side authorization in `/api/profile/[id]/followers` and `/api/profile/[id]/following` strictly returns 403 Forbidden to non-owners; only profile owners can view follower/following user lists.
    - **Profile Navigation Cleanup** (final state):
      - **Global account dropdown** (`components/Navbar.tsx`): Shows **Profile** link only — no Dashboard, My Tickets, My Donations, My Library, or Log Out in dropdown. All nav lives inside Explore.
      - **Explore control** (`components/profile/ProfileSettingsModal.tsx`): Renamed from "Settings" → **Explore** (Compass icon). Starts **CLOSED** on page load. Desktop renders a compact absolute popover (`w-72`); mobile renders a bottom sheet. Organizers accordion starts collapsed. Closes on Escape, outside-click, and navigation.
      - **Content Tabs**: Dynamic tabs (Overview, Campaigns, Events, Businesses, Articles, Products) — only tabs with real content are rendered; defaults to Overview.
      - **Overview tab**: Digital summary metrics (no zero cards), collapsible Impact/Donation section (starts **closed**).
      - **Profile header**: Clean borderless section with subtle bottom divider (no heavy card wrapper). White page background.
      - **Mobile bottom nav**: 4-item bar (Home, Tickets, Dashboard, **Explore**) — no menu dumping.
      - **External viewers**: No Explore button; owner-only management navigation hidden server-side.
    - Comprehensive regression test suite `lib/__tests__/dashboard-profile-architecture.test.cjs` (20 tests) verifying ownership isolation, profile privacy, profile menu generation, Explore UX controls, dynamic tab logic, digital summary metrics, Impact/organizer collapsed defaults, mobile nav labels, and navbar minimal structure. Full platform test suite: **499/499 passing** across 27 suites.

---

### B. PARTIALLY COMPLETE (Foundations Laid / In Progress)
1. **Business Directory vs Full Business Management**:
   - *Current State*: Basic business directory listings exist (`businesses` table, `app/businesses`, `app/dashboard/businesses`), along with entity linkage to `organizers`.
   - *Missing*: Multi-page mini-website builder, custom domain routing, branch management, service bookings, and POS sync (planned for Phases 1–8, 11–12).
2. **Connected Accounts & Multi-Channel Messaging**:
   - *Current State*: Schema for `connected_accounts`, `channel_assets`, `customer_identities`, `conversations`, and `messages` deployed (`migration_108`–`115`).
   - *Missing*: OAuth redirect handlers and webhook receivers for live Instagram, WhatsApp, and TikTok channel assets.
3. **AI Growth Studio Channels**:
   - *Current State*: Meta/Facebook photo and caption auto-publishing is live and verified.
   - *Missing*: Instagram feed/reels publishing, WhatsApp direct messaging tools, and generative image/voice pipelines (fal.ai, ElevenLabs keys provisioned in env but calling code not yet written).

---

### C. NOT IMPLEMENTED / PLANNED
1. **Services & Restaurant Menu Subsystems** (Phase 5).
2. **Appointment & Reservation Engine** (Phase 7).
3. **Business Management ERP & Multi-Branch Hub** (Phase 8).
4. **Public Developer API & Webhook Dispatch System** (Phases 9–10).
5. **POS Integration Framework** (Square, Clover, Toast, Shopify) (Phase 11).
6. **Custom Domain Proxy & SSL Auto-Provisioning** (Phase 12).
7. **External AI Developer Marketplace** (Phase 14).

---

## 2. Recent Repository Activity & Git Commits

- `Business + Event Taxonomy — Full Checklist (2026-09-23)` — feat: `lib/business-taxonomy.ts` (Industry→Category→Business Type 18/40+/80+ + CAPABILITIES 30+), `lib/event-taxonomy.ts` (20 categories→subcategories + legacy alias map), migrations 132/133 **manually applied** (no duplicate creation, verified via `db/migration_132_business_type_and_branches.sql` + `db/migration_133_add_event_subcategory.sql` + `supabase/migrations/20260915000000/1`), `lib/actions/businesses.ts` canonical validation, `NewBusinessFormClient`/`EditBusinessFormClient` controlled cascades with legacy `(legacy)` fallback + `MediaUploadField`, `NewWebsiteClient` business picker + `derivedWebsiteCategory` inheritance + `metadata.business_id` persistence (both blank + template paths) + `TemplateGallery initialCategory`, `app/create-event/page.tsx` + `app/events/edit/[id]/page.tsx` Category→Subcategory cascades via `lib/event-taxonomy.ts`, `lib/business-dashboard-modules.ts` capability registry + `app/dashboard/businesses/[id]/layout.tsx` capability-filtered nav + `app/dashboard/businesses/[id]/branches` CRUD (`lib/actions/business-branches.ts` generic error messages), `ImageUploadWithCrop` close modal error reset + `MediaUploadField` value sync, `lib/event-data.ts`/`lib/events-filters.ts`/`app/events/search/EventsSearchResultsSection.tsx`/`app/admin/events/page.tsx` canonical event taxonomy filtering. Verified: `npx tsc --noEmit` 0, `npx eslint` 0 errors (1 `no-img-element` warning in `NewWebsiteClient.tsx` preserved), `npm test` 612/612, `npm run build` compiled successfully.
- `Business Taxonomy — Creation/Editing UI` — feat: controlled Industry → Category → Business Type dropdowns in `NewBusinessFormClient.tsx`/`EditBusinessFormClient.tsx` via canonical `lib/business-taxonomy.ts` (INDUSTRIES, getCategoriesForIndustry, getBusinessTypesForCategory), cascade invalidation resets, legacy record fallback `(legacy)` for Industry/Category/Business Type in EDIT only, `MediaUploadField` for business logos, wired `business_type` to `businesses.business_type` (migration_132), server validation `lib/actions/businesses.ts` remains canonical. `npx tsc --noEmit` 0 errors, `npx eslint` 0 errors for taxonomy files, no duplicate taxonomy arrays, `npm test` 612/612.
  - `Phase 3 Stages A–C` — feat: code-owned immutable template registry (`lib/website-template-registry.ts` 6 templates @1.0.0, multi-page schema, legacy shim), section envelope & stable IDs (`lib/website-blocks.ts` normalize/clone, `defaultBlocks` + `builderReducer` + `website-builder` actions), business category vs template family (`lib/website-category.ts`, `migration_130 metadata JSONB`, `NewWebsiteClient` + `TemplateGallery` centralization). Backward compatible, no DB template mirror. 478/478 tests passing.
  - `Business Mini Website Extended — Hardening & Landing (2026-09-24)` — landed atomic instantiation (migration 131 `create_website_from_template` ON CONFLICT + creationRequestId), whitelisted hydration, element editing with prototype-pollution guard, section/container controls with outer/inner rendering parity, stable MOVE_BLOCK reordering, template library read-only preview, My Media tenant-scoped picker (5 surfaces). Parallel platform updates: migrations 132–135 (business_type/branches, event subcategory, homepage promotions, profile locale/i18n), capability-driven dashboard + branches, profile navigation, donations/donors. Verified: `npx tsc --noEmit --skipLibCheck` 0, `npx eslint` 0, `npm test` 650/650 (36 suites), `npm run build` compiled successfully.
- `Phase 4` — feat: visual website builder & editor — full 3-panel workspace, 12 property inspectors with client/server validation parity, state reducer with undo/redo/autosave, settings integration, consolidated `checkTenantAccess()` authorization, atomic RPC publish with TOCTOU version checks, and comprehensive regression test suites (411/411 tests passing → 478/478 after A–C).
- `Phase 3` — feat: website design system & block catalog — 10-type block schema (lib/website-blocks.ts), live embed resolvers (lib/website-embeds.ts), full visual block component library (BlockRenderer.tsx), 6 theme palettes with CSS token generation, draft badge gating, tenant-isolated embed queries, 339/339 tests passing.
- `Phase 2` — feat: public website rendering engine at `/site/[slug]/[[...page]]`, pre-stream proxy status gate, modular block renderer, JSON-LD structured data, nav staleness filter, and reserved slugs validation.
- `Phase 1` — feat: tenant websites CMS foundation schema, RLS privilege segregation (migrations 125 & 126), server actions, and org dashboard settings.

---

## 3. Active Blockers & Explicit Non-Goals

> [!CAUTION]
> **WHAT NOT TO BUILD YET:**
> - DO NOT alter existing event ticketing, seating, or fundraising ledgers — these are verified, live subsystems.
> - DO NOT construct raw SQL tools for AI — all tool additions must adhere to ADR-0002.
> - DO NOT attempt to replace Stripe with custom escrow or Stripe Connect without an explicit architectural decision.

---

## 4. Next Actionable Milestone

**Completed Checklist (2026-09-23):** `[✓]` business taxonomy, `[✓]` event taxonomy, `[✓]` migrations 132/133 applied, `[✓]` business create/edit cascades, `[✓]` website business inheritance, `[✓]` event create/edit cascades, `[✓]` capability-driven dashboard + branches, `[✓]` ImageUploadWithCrop sync, `[✓]` event search/filter/admin taxonomy, `[✓]` verification (tsc 0, eslint 0 errors, tests 612/612, build Pass).

**Completed Checklist (2026-09-24 — Hardening & Landing):** `[✓]` atomic instantiation migration 131 + hydration + idempotency, `[✓]` element editing with prototype guard, `[✓]` section/container controls with sanitized backgrounds, `[✓]` stable MOVE_BLOCK reordering, `[✓]` template library read-only preview, `[✓]` My Media tenant-scoped picker (5 surfaces, no Connected Media), `[✓]` migrations 134/135 present (homepage promotions, profile locale/i18n), `[✓]` verification (tsc 0, eslint 0, tests 650/650, build Pass).

**Next:** **Phase 5 — Products, Services & Menus** — migration 136 `services`/`menu_sections`/`menu_items`. See `docs/phases/phase-05-products-services.md`. Do NOT start until this hardening is committed and documented (this file).
