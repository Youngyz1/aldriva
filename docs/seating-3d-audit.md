# Seating 3D Audit — Aldriva

> Mode: AUDIT AND PROPOSE ONLY (read-only). No source file was modified for this report.
> The only file created/edited is this one: `docs/seating-3d-audit.md`.
> Rule followed throughout: repo wins over the brief; every claim cites `path:line` or an exact command + output; anything not verifiable is marked UNVERIFIED.

## Step 0: file map (updated — candidate FOUND)

### 0a. Orientation (real output)

- `pwd` → `C:/Users/Youngyz/aldriva-staging`; toplevel same; branch `integration/full-recovery`; working tree dirty (~33 modified storefront/website files, no seating files modified); 4 stash entries.
- `ls components/ui` → 38 entries; candidate now present (was absent at first check, added by owner mid-task).
- `package.json` → app `aldriva` v0.1.0, single-package Next.js 16.3.4 app (no workspaces key in head read). Tailwind v4 (`tailwindcss: ^4`, `@tailwindcss/postcss: ^4`), TypeScript ^5, ESLint ^9 + `eslint-config-next: 16.3.4`. `npm test` = explicit `node --test` file list (must append new test files or they never run). Scripts: `dev/build/start/lint/test`, `supabase`, `verify:staging-db`, `check:client-secrets`.

### 0b. CANDIDATE file: FOUND (after owner paste)

- Path: `components/ui/venue-seat-picker-3d.tsx` — `Test-Path` → **True**, **1420 lines** (`(Get-Content … | Measure-Object -Line).Lines`).
- First 40 lines: `"use client"` canvas picker, zero-dep (React + Tailwind), 2D↔3D morph, center-based coords (`x right, y down`, `Every x/y is the CENTER of the object` — lines 21–23).
- Exports confirmed by grep: `VenueSeat` (:30), `VenueTable` (:44), `VenueStage` (:56), `VenueGaZone` (:67), `VenuePlan` (:85), `VenueSeatPicker3DProps` (:106), `createSampleVenue` (:262), `VenueSeatPicker3D` (:364). Also `VenueLabel` (:79), `GaSelection` (:93), `SeatOrder` (:100), `SeatStatus` (:26), `SeatCategory` (:27), `ViewMode` (:28).
- Earlier NOT-FOUND searches (exact paths False, `VenuePlan` no matches, `components/ui` listing without it) are superseded; the file arrived after Step 0.

### 0c. EXISTING files (paths from commands run, one line each)

**Organizer builder — Seating Manager & Venue Builder (`/dashboard/events/[id]/seating`):**

- `app/dashboard/events/[id]/seating/page.tsx` — server page loading event/layout/seats/invitations.
- `app/dashboard/events/[id]/seating/SeatingManagerClient.tsx:438-511` — four tabs (`Visual SVG Builder` :454, `Manual Builder` :471, `Table & Guest Roster` :488, `AI Assistant` :502) + "One plan — Manual, AI & Visual save through the same pipeline." (:511); shared stats via `summarizeSeatingPlan` (:248); layout load `:186`, meta save `:395`.
- `app/dashboard/events/[id]/seating/VenueBuilder.tsx:1-50,306-365,1680,2124` — 2D SVG canvas editor; saves via `op: save_layout` PATCH.
- `app/dashboard/events/[id]/seating/ManualBuilder.tsx:39-160,318-382,490` — form builder (`ManualSectionFormItem`); saves via `op: save_layout`; AI handoff cue `:423`.
- `app/dashboard/events/[id]/seating/AiAssistantPanel.tsx:157,207,266` — NL → `ManualSectionFormItem[]` via `onApplyConfig`; POSTs `…/seating/ai-assistant`.
- `lib/seating.ts:1-1069` — engine: `VenueObject` (:19), `SeatGeometry` (:53), `TicketTypeSummary` (:88), `FullVenueLayout` (:96), pricing precedence (:277), grid/table generators (:335/:421), canonical plan + validation (:737/:612), protection/combine helpers (:970/:994).
- `lib/seating-server.ts:1-135` — server-only mutations: `reserveSeatsAtomic` (:9, RPC + non-atomic fallback), `assignSeatToInvitationAtomic` (:75, RPC + fallback).
- `lib/seating-summary.ts:1-76` — `summarizeSeatingPlan` (available excludes assigned + active-reserved; expired holds not reserved but not available — test 6E-F).
- `app/api/events/[id]/seating/route.ts:25,76,137-383,385+` — GET full layout+seats+invitations; PATCH `save_layout` (layout meta → deletes → updates → inserts → reload) + `bulk_create_seats` etc.
- `app/api/events/[id]/seating/ai-assistant/route.ts:49,147-181,197-328` — topology-only AI endpoint, rate-limited + screened.
- `docs/events/seating.md:1-99` — builder user doc (1200×800 grid, elements, inspector, state colors, draft vs published).
- `components/VenueMap.tsx` + `components/VenueMapClient.tsx` — venue display components (exact mount point not traced; nearest organizer-side display).
- `app/dashboard/events/[id]/layout.tsx:21`, `app/dashboard/events/[id]/overview/page.tsx:43`, `app/dashboard/events/[id]/operations/OperationsDashboardClient.tsx:64-377`, `app/create-event/CreateEventForm.tsx:412,743`, `app/api/dev-login/route.ts:30` — nav/links/overview-metrics/create-flow/dev-login touchpoints.

**Attendee booking / seat selection (the view the 3D picker would replace):**

- `app/events/[slug]/page.tsx:195-284` — public page; **invitation-kind gate `:203-207`** (`isInvitationEvent → notFound()`); private-visibility gate `:213-219`; related-events queries filter `kind=public` (`:253,:273`).
- `app/events/[slug]/TicketCheckout.tsx:1-120,120-419,700-939` — `tickets → seats → review` steps; `SeatMap` dynamic `ssr:false` (`:10`); `GET /api/seats?event_id=` on mount (`:92-105`); seat step gated on `seatMapAvailable` (`:420,714`); hold-then-intent in `preparePayment` (`:185-253`); crypto path (`:255-325`); free path (`:363-414` via `/api/checkout`).
- `components/SeatMap.tsx:1-610` — EXISTING seat view: auto-fit SVG, no zoom/pan by design (`:155-162`); statuses `available|reserved|sold|selected|unavailable` (`:7`); click-toggle, `maxSelectable=10` (`:86,212`); legend+tooltip+summary; renders `stage|table|ga_area|label` (`:267-404`).
- `app/api/seats/route.ts:1-111` — GET layout+tickets+seats with `effective_price` (`:55-67`); POST atomic hold via `reserveSeatsAtomic`, 409 + `unavailableIds` (`:76-111`).
- `app/api/create-payment-intent/route.ts:1-354` — intent creation; server-side price re-resolution (`:100-215`); held seats accepted (`:145-152`); `seats_json` + `items_json` metadata (`:313-332`).
- `app/api/checkout/route.ts:1-212` — free (DB-total-zero only, `:68`) + legacy Stripe-session branch; single `seatId` only; free branch inserts `ticket_orders` directly with NO `ticket_instances` row (`:88-102`) and flips seat to `sold` (`:112-118`); paid branch reserves 30-min hold (`:192-202`, conditional on `status=available`).
- `app/api/crypto/create-payment/route.ts:47-49,105-111,233-291` — crypto path supports multi-seat; **check-then-update without `FOR UPDATE`** (`:241-267`) — TOCTOU vs the atomic RPC.
- `app/api/webhooks/stripe/route.ts:414-606,818-1098` — PI-succeeded + session-completed handlers → `record_ticket_and_credit` RPC (`:516-533,:1010-1027`) with `is_new` idempotency gate (`:556-559,:1052-1055`); seats→`sold` redundant re-flip after RPC (`:565-578,:1059-1072`); `SEAT_ALREADY_ASSIGNED` failures land in `payment_reconciliation_failures` + email alert (`:539-554`); ticket email via Resend through `/api/send-ticket` (`:370-410`); organizer notification (`:102-232,596-603`).
- `app/api/tickets/order-lookup/route.ts:16,58,113,130-209` — post-checkout resolver (order + instances + seat join; no order_id/qr input by design `:24`).
- `app/api/verify-ticket/route.ts:43-234`, `app/api/send-ticket/route.ts:1-330` — QR verification preferring instances; per-instance ticket cards (`:187-234`), tier names hydrated from `ticket_instances.ticket_id` (`:140-158`), entitlement-checked resend (`:124-127`).

**Migrations (seating-relevant):**

- `db/migration_93_extended_seating.sql:1-60` — tables/VIP/invitation assignment (`table_number/name/capacity`, `is_vip`, `assigned_invitation_id` + event-isolation FK + one-seat-per-invitation unique).
- `db/migration_98_svg_seating_engine.sql:1-208` — spatial engine: `venue_layouts` version/publish/canvas/`venue_objects` (`:6-12`); seats x/y/w/h/rotation/`object_type`/`is_accessible`/`ticket_type_id` (`:14-22`); `unavailable` status (`:24-33`); spatial indexes (`:35-38`); legacy geometry backfill (`:40-87`); `reserve_seats_atomic` FOR UPDATE RPC (`:89-159`); `assign_seat_to_invitation_atomic` (`:161-208+`); EXECUTE grants — RPC open to `anon, authenticated, service_role` (`:278-279`).
- `db/migration_79_ticket_instances.sql:1-250` — `ticket_instances` table+indexes (`:6-24`), legacy backfill (`:31-59`, pending excluded), `check_in_ticket` + `refund_ticket_instance` RPCs (service_role-only `:136-137,:206-207`), cascade trigger (`:139-163`), buyer/organizer/team/admin SELECT policy (`:209-246`).
- `db/migration_80*_multi_ticket_instances.sql`, `migration_80c_multi_tier_instances.sql` — per-instance QR + multi-tier issuance.
- `db/migration_118_multi_seat_instances.sql:1-335` — 14-param `record_ticket_and_credit` with `p_seats_json`, per-seat instances, `SEAT_ALREADY_ASSIGNED` guard (`:173-187`), seats→sold (`:208-223`), ledger credit (`:287-320`), service_role-only (`:325-331`).
- `db/migration_119_event_ticket_template*`, `migration_122_offline_scanner_support*`, `migration_124_offline_sync_and_conflicts.sql:22`, `db/migration_164_event_staff_labels_badges.sql:31` (explicitly NOT touching instances).
- `db/schema.sql:134-147,649-1710` — snapshot: `release_expired_seat_reservations()` def, `seats`/`venue_layouts` DDL + unique `(layout_id, section, row_label, seat_number)`, RLS enabled, **GRANT ALL on both tables to `anon, authenticated, service_role`** (`:1558-1560,:1690-1710`).
- `db/ticket_orders_and_seats_schema.sql:1-68` — early sketch + expiry function.
- Most recent migration numbers: `db/` tail shows up to `migration_99` in the listed window but numbered files reach 174 (`db/migration_174_order_timing.sql`, header: "Files only; NOT yet applied"); `supabase/migrations` tail ends at `20261014000000_migration_174_order_timing.sql`. Staging-applied state per `docs/CURRENT-STATE.md`: invitation 154–168 applied on staging by owner; 169–174 written, NOT applied. **Live-DB applied state for seating migrations is UNVERIFIED** (no prod/staging connection; `supabase/migrations` treated as source of truth per owner instruction).
- No 8-step spec doc in repo: `grep "8-step|ticket_instances.*locked|Seating and Invitations"` in `docs/` → no matches. Phase 1 item 12 therefore reports migration-truth + inconsistencies instead (per owner answer 2).

---

## Phase 1 findings

### 1. Inventory

Grouped by layer (DB / API / builder UI / attendee UI / checkout). Full path list is in Step 0c above; this section adds the semantics.

- **DB layer.** Tables: `venue_layouts` (layout meta + `sections`/`venue_objects` JSONB + canvas + version/publish), `seats` (one row per physical seat incl. table seats; statuses `available|reserved|sold|unavailable`), `tickets` (tiers), `ticket_orders` (one summary row per checkout), `ticket_instances` (one row per seat/tier unit, each with own QR), `ticket_checkins`, `event_invitations` (guest roster + seat assignment FK). Functions/RPCs: `reserve_seats_atomic` (hold with `FOR UPDATE`), `assign_seat_to_invitation_atomic`, `record_ticket_and_credit` (issuance + ledger), `check_in_ticket`, `refund_ticket_instance`, `cascade_ticket_order_status` trigger, `release_expired_seat_reservations()` (exists in `db/schema.sql:134` but **no caller found in `lib/`** — only a type stub at `lib/database.types.ts:1641`; expiry enforcement is lazy via `reserved_until` comparisons).
- **API layer.** Organizer: `PATCH /api/events/[id]/seating` (`save_layout`, `bulk_create_seats`, seat meta/assign ops), `POST …/seating/ai-assistant`. Attendee: `GET/POST /api/seats`, `POST /api/create-payment-intent`, `POST /api/checkout` (free + legacy session), `POST /api/crypto/create-payment`, `POST /api/webhooks/stripe`, `GET /api/tickets/order-lookup`, `POST /api/send-ticket`, `GET /api/verify-ticket`.
- **Builder UI.** `SeatingManagerClient` (tabs + one-plan pipeline) → `VenueBuilder` (SVG) + `ManualBuilder` (forms) + roster view + `AiAssistantPanel` (→ Manual, never direct-save).
- **Attendee UI.** `TicketCheckout` seats step + `SeatMap` SVG.
- **Checkout.** `preparePayment` (hold → intent → PaymentElement) / crypto redirect / free direct-insert; webhook → RPC → instances → email.

### 2. Saved plan format

- **Where it lives.** Two places, split by design: (a) `venue_layouts` row per event: `name, canvas_width (default 1200), canvas_height (default 800), version, is_published, published_at, sections JSONB (SectionDefinition[]), venue_objects JSONB (VenueObject[])` (`db/migration_98_svg_seating_engine.sql:6-12`; read back in `app/api/seats/route.ts:21-27`); (b) `seats` table, one row per seat with full geometry + commerce + assignment columns (`lib/seating.ts:53-86`; selected columns in `app/api/events/[id]/seating/route.ts:76`, `app/api/seats/route.ts:44`).
- **TypeScript types.** `SectionDefinition` (`lib/seating.ts:39-48`: name/color/ticket_type_id/default_price/rows/seatsPerRow/x/y), `VenueObject` (`:19-37`: id/type `stage|ga_area|label|table|shape|aisle|structure`, x/y/width/height/rotation, label/color/capacity, table_number/name/capacity/shape, ticket_type_id/price), `SeatGeometry` (`:53-86`, incl. `table_number`, `is_vip`, `is_accessible`, `price_override`, `ticket_type_id`, `assigned_invitation_id`, x/y/width/height/rotation, `object_type: seat|table_seat|ga_spot`).
- **Real example shapes** (from code, not invented): seat row — `generateSectionSeatsGrid` defaults `seatWidth=26, seatHeight=26, seatGap=8, rowGap=12`, rows `A–Z then 27,28…` (`lib/seating.ts:335-403`); table — round radius `max(w,h)/2+20`, seats `24px` on circle (`:445-476`); rect table perimeter placement (`:477-536`); stage/GA/label — `VenueObject` with `type` + rect geometry (`SeatMap.tsx:267-404` renders each).
- **Coordinate system and units.** Origin top-left, x right, y down, SVG user units on a 1200×800 canvas (`docs/events/seating.md:17`; `migration_98:10-11`). **Seats store TOP-LEFT x/y + width/height** (generators write top-left `:393-394,:469-470`; `SeatMap` derives center `:415-417`). Backfill for legacy NULL x/y: `x = 80+(i-1)*34`, `y = section_offset+row_offset`, 26×26 (`migration_98:40-87`); `SeatMap` has a second procedural-grid fallback (`:99-153`).
- **Rows/sections storage.** Explicit seats (one DB row each), never generated at read time. `sections` JSONB holds only names/pricing/ticket links + counts (`rows`, `seatsPerRow`), not seat coordinates. Identity key: UNIQUE `(layout_id, section, row_label, seat_number)` (`db/schema.sql:840-841`); client temp ids (`new-…`, `dup-…`) vs persisted UUIDs split by `isPersistedSeatId`/`partitionSeatSaves` (`lib/seating.ts:153-183`); save returns authoritative list so client drops temp ids (`route.ts:365-382`).
- **How the three builders write.** Manual (`ManualBuilder.tsx:357-382`) and Visual (`VenueBuilder.tsx:306-365`) both `PATCH …/seating` with `op: save_layout` (same pipeline: layout meta → protected-delete check → chunked updates (15/req, `:262`) → inserts with in-memory dup check → reload). AI never writes directly: `AiAssistantPanel` converts proposal → `ManualSectionFormItem[]` and calls `onApplyConfig` (`:157,266`); Manual remounts and the organizer saves. Canonical generation (`generateCanonicalSeatingPlan`, `combineSeatingForSave` append/replace, `checkLayoutProtection` blocking replace when sold/assigned exist) is the shared semantic.
- **Versioning/migration of old plans.** `venue_layouts.version` exists but `save_layout` writes `version: 1` unconditionally (`route.ts:192-194`) — versioning is effectively dead (no increment, no optimistic check, unlike the website builder's `p_expected_version`). Old plans migrate via the `migration_98` geometry backfill; `is_published/published_at` columns exist but the seating GET/POST paths do not gate on them (attendee `GET /api/seats` returns whatever layout exists, `:29-31`).

### 3. Seat status model

- **Representation.** DB `seats.status` ∈ `available|reserved|sold|unavailable` (CHECK `migration_98:24-33`). UI-only `selected` (client `Set`, `SeatMap.tsx:89,196-202`). Guest-assigned is NOT a status: `seats.assigned_invitation_id` FK (`migration_93:21-49`) + one-invitation-one-seat unique (`:51-54`). VIP/accessible are boolean flags (`is_vip` `migration_93:20`; `is_accessible` `migration_98:21`), surfaced as badges (`SeatMap.tsx:500-519`); candidate instead folds them into `category` (mapping needed).
- **Source of truth.** Split: geometry/flags/assignment live on `seats`; financial truth lives in `ticket_instances` (one row per sold unit, own QR). `isSeatPurchasable` requires `available + no invitation + no active hold` (`lib/seating.ts:124-134`); the organizer summary counts `sold` from seats, `guestAssigned` from the FK, `reserved` only when `reserved_until` is in the future (`lib/seating-summary.ts:36-60`).
- **Can plan and tickets disagree? Yes, three documented ways.** (a) Expired holds: row stays `reserved` with past `reserved_until`; summary test 6E-F pins that it counts as neither reserved nor available. (b) Free-checkout path writes `ticket_orders` with no `ticket_instances` row (`app/api/checkout/route.ts:88-102`) — order/instance counts diverge for free events (send-ticket falls back to a synthetic instance, `:162-164`). (c) `save_layout` updates deliberately skip `status` (`.neq("status","sold")`, `:287-293`) and inserts force `available|unavailable` (`:328`) — so a plan edit can never fix a status/ticket divergence; only the webhook/RPC moves seats to `sold`.

### 4. Current attendee view (the part to replace)

- **What renders.** `TicketCheckout` step `seats` (`:714-765`) mounting `SeatMap` (`:728-746`, `maxSelectable={10}`, price base = primary/low-ticket). Data: single `GET /api/seats?event_id=` on mount (`:92-105`); no refresh after (`UNVERIFIED` whether any re-fetch exists past line 939 — none seen through `:939`).
- **Selection.** Click toggles available seats; sold/unavailable/reserved are dead (`SeatMap.tsx:204-218`); summary box shows count + labels + total (`:579-601`); Continue → review → contact form → `preparePayment` (hold POST, then intent) or crypto/free branches.
- **States (description).** Loading spinner (`TicketCheckout:723-726`); auto-fit map with legend (Available/Selected/Reserved/Sold/Unavailable + VIP star + Accessible icon); hover tooltip (label, table name, price-or-status, VIP/Accessible chips); selected-summary bar; "up to 10 seats" caption; sold seats dimmed with slash, reserved amber with dashed ring.
- **Known bugs/TODOs in code.** (i) `SeatMap` props `sections` and `ticketTypes` are accepted but never used — ESLint `no-unused-vars` warnings `:80,:84` (per-seat `ticket_type_id` is used, but section pricing/tier names never surface). (ii) Stale-on-load: availability is a mount-time snapshot; a seat sold after load still looks available until payment-prep hold fails (`preparePayment:190-203`). (iii) Hold comes late (at payment prep, not at selection) and lasts 5 min (`POST /api/seats` default `:81`), while legacy `/api/checkout` session branch holds 30 min (`:192-202`) — inconsistent windows. (iv) `rounded-2xl` map/summary (`:253,:581`) vs the Aldriva `rounded-xl` standard. (v) No keyboard/ARIA selection path (mouse-only `onClick`/`onMouseEnter`); tooltip is mouse-only. (vi) GA zones render as labelled capacity boxes (`:342-372`) with no quantity control and no purchase path. (vii) Held-by-me seats read as `reserved` (indistinguishable from others' holds) if the buyer returns to the map mid-flow.

### 5. Holds and concurrency

- **Mechanism.** `POST /api/seats` → `reserveSeatsAtomic(seatIds, 5min)` → RPC `reserve_seats_atomic` (`migration_98:89-159`): locks rows `FOR UPDATE` in id order (`:111-118`), rejects sold/unavailable/active-reserved/invitation-assigned (`:119-127`), verifies existence (`:138-145`), then flips to `reserved` (`:147-151`). Fallback in `lib/seating-server.ts:26-65` (select-then-update, **not atomic** — TOCTOU if the RPC is missing; deployment state UNVERIFIED from repo alone).
- **What stops double-buy today.** Three layers, none airtight alone: (1) pre-intent re-read in `create-payment-intent` (`:110-152`, rejects non-available/non-held + invitation seats, 409); (2) the atomic hold (5-min window); (3) post-payment `SEAT_ALREADY_ASSIGNED` guard in `record_ticket_and_credit` (`migration_118:173-187`) → webhook raises → reconciliation row + alert email instead of silent double-sell.
- **Failure mode if two users pay for the same seat.** Both can pass the pre-intent check (note: **held seats are accepted**, `:145-151` — a hold is advisory, not exclusive, at intent time). Both Stripe charges can succeed. The first webhook to commit wins; the second RPC raises `SEAT_ALREADY_ASSIGNED`, producing **paid-money-with-no-ticket**: order row for attempt 2 is never created (the exception aborts before insert — the guard runs inside the seat loop after the `ticket_orders` insert at `:122-151`… precisely: order row IS inserted first, then the seat-loop raises, aborting the transaction, so no order persists), `payment_reconciliation_failures` row + urgent email, manual refund/follow-up. Crypto path is weaker (non-atomic check-then-reserve, `:241-267`) so its race window is larger. Free path (`/api/checkout`) does no hold at all before the direct `sold` flip (`:112-118`).

### 6. Checkout and tickets

- **Full path (paid card).** `preparePayment` → `POST /api/seats` (hold) → `POST /api/create-payment-intent` (server prices, `seats_json`+`items_json` metadata, idempotency `ticket-intent-{attemptId}`) → Stripe PaymentElement → `payment_intent.succeeded` webhook → `record_ticket_and_credit` (idempotent on PI id; creates summary order + per-seat instances with fresh QRs + ledger credit; flips seats `sold`) → redundant seats→`sold` re-update (`webhook:565-578`) → ticket email (`/api/send-ticket`, per-instance QR cards) → organizer notify. Legacy session branch mirrors this via `checkout.session.completed` (`:818-1098`). Free: `/api/checkout` direct insert (no instances — see §3c). Crypto: NOWPayments redirect; seat reservation is a plain conditional update with release-on-insert-failure (`crypto route:257-291`).
- **Where seat ids live.** `ticket_instances.seat_id` + `seat_label` per unit (`migration_79:7-19`); `ticket_orders.seat_id/seat_label` carry only the primary seat (`migration_118:95-119`); Stripe metadata `seats_json` is the cross-system handoff (`create-payment-intent:331`).
- **Failure/abandonment/refund.** Payment failure: nothing written (webhook only acts on success; free/crypto-insert failures return 500 with no seat change except crypto's release). Abandonment: hold expires lazily (no release call, no cron found in `lib/`; `release_expired_seat_reservations` uncalled — UNVERIFIED whether pg_cron/scheduler exists). Refund: per-instance `refund_ticket_instance` RPC + order-level cascade trigger (valid→refunded/cancelled, used untouched) (`migration_79:139-207`); **seats are NOT flipped back to `available` on refund** (no such update in either RPC — resale of refunded seats requires manual organizer action; inconsistency flagged for Phase 3).

### 7. Realtime

- **Today: none.** Scoped grep for `realtime|channel(|postgres_changes|polling|setInterval.*seat` in `lib/` → one unrelated hit (`workforce-approvals.ts:57`, "no polling loop"). Attendee flow is fetch-once + hold-at-pay; organizer saves are request/response. No Supabase Realtime subscription, no polling loop found for seats.
- **RLS posture.** `ticket_instances`: RLS enabled + buyer/organizer/team/admin SELECT policy (`migration_79:209-246`); RPCs service_role-only. `seats`/`venue_layouts`: RLS enabled per `schema.sql:1509,1518`, but the same file grants **ALL to `anon, authenticated, service_role`** (`:1558-1560,:1690-1710`) and no seat/layout SELECT policy was found in the migration searches — public reads currently go through service-role API routes (`GET /api/seats`, seating GET), so direct anon-table access posture is UNVERIFIED from repo alone (needs a live-policy check; do NOT probe prod). A public realtime subscription on `seats` today would expose `reserved_until`, `assigned_invitation_id`, `price_override`, `ticket_type_id` to anyone subscribed — plus allow inference of sales velocity. Guest names are NOT on seats (only `assigned_invitation_id` UUIDs; names resolve server-side via the seating GET join), so identity leak is indirect (invitation-UUID exposure), not PII-direct — still not safe to publish raw.

### 8. GA zones and tables

- **Tables: per-seat.** Table seats are real `seats` rows (`object_type=table_seat`, `table_number/name/capacity` set; round/rect geometry in generators). Sold/assigned per seat through the identical pipeline. No whole-table purchase, no table-level lock.
- **GA: display-only.** `ga_area` venue objects carry `capacity` (static number in JSONB) rendered as `Capacity: N` (`SeatMap.tsx:365-369`). No quantity selector, no GA line items in `preparePayment`, no decrement path anywhere (grep `gaZone|ga_zone|gaZones` in `lib/` → **no matches**; capacity appears only as render text). GA "availability" therefore never moves; oversell protection for standing zones does not exist in code.

### 9. Event types

- `events.kind` ∈ `public|invitation` (`lib/invitation-events.ts:15-18`, migration 155). Public slug page **404s invitation-kind events for everyone including the owner** (`app/events/[slug]/page.tsx:203-207`); related lists filter `kind=public`. Guest management APIs serve invitation-kind only (`app/api/events/[id]/guests/route.ts:30-34`, batch twin). Invitation tooling (builder, personal links, RSVP, seating assignment) works on BOTH kinds (`invitation-events.ts:10-12`); only the share link is invitation-only. **The public seat picker is public-kind-only by construction** (it lives on the slug page that 404s invitation events). Invitation guests never see a picker: they arrive via token links (`app/invitation/[token]`, `shared/[token]` gated `kind===invitation`) and get seats assigned by the organizer (`assign_seat_to_invitation_atomic`) with QR preservation. No invitation-flow change is needed for the 3D picker; the one risk is accidentally mounting it on an invitation surface (Phase 3 guard).

### 10. Scale

- Largest realistic counts: no production data accessible (by rule). In-repo fixtures: 55-seat regression topology (`2 rows×10 + 5 rows×11` per test names), 100-seat sample block + 5×5 tables in `createSampleVenue` (`:262-312`, 125 seats), mixed VIP/General/banquet fixtures in canonical tests. No 2k/10k fixture found.
- Plan JSON size (measured, command in appendix): one full seat row ≈ **392 bytes** → 2,000 seats ≈ **766 KB**, 10,000 ≈ **3.8 MB**, plus `venue_objects`/`sections` (tens–hundreds of bytes). Loading today: **full JSON on page load** — `GET /api/seats` selects all seats for the layout ordered by section/row/seat with no pagination, limit, or cache headers (`app/api/seats/route.ts:41-49,69-73`); organizer GET selects all seats the same way (`seating/route.ts:76`). At 10k seats the payload is multi-MB per buyer plus identical organizer loads; canvas render is O(n) SVG nodes in `SeatMap` (10k `<g>` subtrees — expected jank; candidate canvas is O(n) draw calls instead, strictly cheaper per frame).

### 11. Tests and tooling

- **Commands.** Lint: `npx eslint <files>` (repo `lint` script = `eslint`). Typecheck: `npx tsc --noEmit`. Tests: `npm test` (explicit file list in `package.json`; new `.test.cjs` must be appended or they silently never run).
- **Seating suites run (real output).** 10 files: `seating-count-input`, `seating-save-sync`, `canonical-seating-generator`, `manual-seating-builder`, `ai-seating-assistant`, `phase6-svg-seating-engine`, `phase2-seating-engine`, `phase3-seating-manager`, `seating-workspace-6e`, `multi-seat-checkout`. Result: **zero failure lines** (`NO_FAILURE_LINES_FOUND` for `not ok|# fail [1-9]|fail [1-9][0-9]*`); observed per-suite passes incl. phase6 engine 8/8, Phase 6E summary 8/8, AI assistant A–O, canonical rows/tables/validation/determinism/combine-protection sets. Final aggregate block printed `tests 95, suites 2, pass 95, fail 0` for the trailing chunk — the runner prints per-file tallies, so the honest total is "all observed suites pass, fail 0" rather than a single summed number (full-runner summation UNVERIFIED for this subset).
- **Typecheck (real output, background job).** `npx tsc --noEmit` → exit 1 with **8 errors, all in storefront ordering, none in seating or the candidate**: `OrderCard.tsx(5,31) Locale not exported`; `(301,59),(301,75),(472,59),(472,75)` delivery/pickup message keys; `(313,56)` translator type; `lib/actions/orders.ts(361,13)` string|null; `lib/storefront-order-payments.ts(69,25)` invalid_schedule union. **Zero errors in `venue-seat-picker-3d.tsx`, `SeatMap.tsx`, `TicketCheckout.tsx`, `lib/seating*.ts`, `app/api/seats/route.ts`.**
- **Lint (real output).** `npx eslint` on candidate + `SeatMap` + `TicketCheckout` + `lib/seating.ts` + `lib/seating-server.ts` + `app/api/seats/route.ts` → exit 1: **1 error + 10 warnings**. The error is the candidate's: `venue-seat-picker-3d.tsx:482 react-hooks/refs — cfg.current = {…} during render`. Warnings: candidate `:1286` unused eslint-disable; `SeatMap :80,:84,:126` (unused `sections`, `ticketTypes`, `secName`); `TicketCheckout` 3× unused `_` + 2× `no-location-assign` + 1× `no-img-element`.

### 12. Spec divergence (spec UNVERIFIED — migration-truth + inconsistencies instead)

Per owner instruction, no spec comparison was attempted. Treating `supabase/migrations` as truth, the inconsistencies between migrations and code are:

1. `release_expired_seat_reservations()` exists in SQL (`schema.sql:134`) but is never called from app code (only a generated type stub) — expiry is lazy; a reader expecting active reaping will be misled.
2. `venue_layouts.version` is written as constant `1` on every save (`seating/route.ts:192-194`) — column exists, versioning does not.
3. `is_published/published_at` exist (`migration_98:8-9`) but no read path gates on them — draft/published distinction in `docs/events/seating.md:95-99` is unenforced in the API.
4. Free checkout bypasses `ticket_instances` entirely (`/api/checkout:88-102`) while every paid path mints per-seat instances — order/instance parity breaks for free events.
5. Refund paths never return seats to `available` — refunded inventory is stranded until manual edit.
6. Legacy `/api/checkout` session branch reserves 30 min vs 5 min holds elsewhere; crypto path reserves non-atomically; all three coexist.
7. `ticket_orders.qr_code` was made nullable for multi-instance (`migration_79:62`) yet the legacy session flow still mints and keys on it (`webhook:948-965,1021`) — dual identity (order-QR vs instance-QRs) persists.
8. App `SeatMap` accepts `sections`/`ticketTypes` props the server already resolves prices from — dead props suggesting an older contract where the client priced seats (now server-authoritative per `create-payment-intent:100-105`).

---

## Phase 2 findings (candidate `components/ui/venue-seat-picker-3d.tsx`, 1420 lines, unmodified)

### 1. Typecheck & lint (real output)

- `npx tsc --noEmit` (full repo): 8 errors, **none in the candidate**. Candidate typechecks under our tsconfig.
- `npx eslint components/ui/venue-seat-picker-3d.tsx …`: **1 error, 1 warning** on the candidate. Error `:482` (`react-hooks/refs` — `cfg.current = {…}` assigned during render; must move into an effect or event handler). Warning `:1286` (unused `eslint-disable-next-line react-hooks/exhaustive-deps` — the `[scrollZoom]` dep array is actually complete, so the directive is stale). Both are must-fix before integration (error breaks `npm run lint` gating; the pattern also risks tearing selection state under concurrent render).
- No other lint findings on the candidate (no a11y-plugin errors — but repo has no `jsx-a11y` plugin asserting this; gaps below are manual).

### 2. Tailwind / dark mode

- Repo is Tailwind v4 (`@import "tailwindcss"`, `app/globals.css:1`) with **class-based dark mode**: `@custom-variant dark (&:where(.dark, .dark *))` (`:4`) plus a `.dark` block (`:164`); the site page toggles `dark` class (`app/site/[slug]/[[...page]]/page.tsx:438,480`). The candidate's `dark:` classes therefore work with our strategy, and its runtime detector checks `.dark` class → `data-theme` → system (`:444-461`) — compatible. Palette mismatch is stylistic, not functional: candidate uses `neutral-*` + indigo accents while the app standard is zinc + orange (`SeatMap` orange-600 selection, `STATUS_COLORS`). No Tailwind features beyond v4 core (arbitrary values like `lg:grid-cols-[minmax(0,1fr)_19rem]`, `sr-only`, `motion-reduce:` are all v4-supported). One nit: candidate focus ring is indigo (`:1358`) vs app orange/brand.

### 3. Rendering & interaction bugs

- **Hit testing.** `hitTest` (`:998-1016`) walks the painter `order` back-to-front, ellipse test for seats (12% radius padding — reasonable fat-finger compensation), quad test for GA/rect-tables, but **round tables (`kind:1`) are hittable only via their seat ellipses** (the `kind===2` branch `continue`s for stages; round tables fall to the ellipse branch using `it.rx/ry` which are 0 for tables → `Math.max(0*1.12,3)` = 3px target — effectively untappable, fine since tables aren't selectable, but the tooltip `tableSeats` detail (`:892-894`) is then nearly unreachable on touch). `it.vis`/`sx/sy` are set in `draw` (pre-`:883` region); hit tests between `build` and first `draw` use stale zeros — negligible (draw runs synchronously in `relayout`).
- **Pointer/pinch/orbit.** Single-pointer drag orbits in 3D / pans in 2D; right-button or Shift forces pan (`:1053-1056`); two-pointer pinch zooms anchored at midpoint (`:1062-1067`); 5px move threshold separates tap from drag (`:1071`); `setPointerCapture` guarded (`:1042-1046`); `pointercancel`/`pointerleave` handled (`:1124-1133`). Issues: (a) **Escape does not clear selection** despite the header comment "Esc clears" (`:18`) — it only resets kb/pinned/hovered (`:1186-1192`); doc/behavior mismatch. (b) `onMove` skips hover for touch (`:1087`) so tooltips never show on touch — pinned-tooltip-on-tap (`:1114`) compensates, acceptable. (c) Wheel handler is `passive:false` + `preventDefault` only when zooming (`:1142-1147`) — correct; otherwise page scroll passes through. (d) `contextmenu` always prevented (`:1222`) — kills long-press context menu app-wide on the canvas; acceptable for a picker but note it.
- **Resize.** `ResizeObserver` on stage → `relayout` only when width changes (`:1228-1231`); height derives from width + viewport (`:982-996`, clamped 340–640). Issues: height ignores width-only-stable cases (fine), but **observes `stage` while measuring `stage.clientWidth`** — consistent; IntersectionObserver pauses rAF offscreen (`:1232-1236`) — good. DPR capped at 2 (`:989`) — good.
- **Cleanup.** Engine effect removes all 12 listeners + observers + rAF and nulls `engine.current` (`:1267-1285`) — complete. Theme effect disconnects observer + media listener (`:457-460`) — complete. **StrictMode double-effect**: engine builds twice (build is idempotent — resets arrays, `:602-630`), `engine.current` reassigned — safe; rAF from first mount cancelled in cleanup — safe. The `:482` render-time ref assignment is the one StrictMode-hostile pattern (double-render writes twice; values identical, but the lint error stands).
- **SSR safety.** No top-level `window`/`document` (first uses at `:446` theme effect, `:506` engine effect — both effects, client-only). `createSampleVenue()` in `useMemo` (`:382`) is pure. File has `"use client"` (`:1`). Still mount via `next/dynamic … { ssr:false }` like `SeatMap` (`TicketCheckout.tsx:10`) because canvas + `matchMedia` + observers have no SSR meaning and would SSR-render an empty frame.
- **Stale-closure.** `cfg` ref carries fresh venue/selection/filter/dark/target/toggle into engine callbacks — correct pattern spoiled only by the render-time assignment (fix: assign inside the three sync effects `:1290-1296` or use `useEffect` + `useLayoutEffect`).

### 4. Performance (UNVERIFIED by measurement; analytical + one computed input)

- No headless benchmark was run (no browser harness in this sandbox; creating one outside the source tree was possible but would not reflect real devices — marked UNVERIFIED honestly).
- Frame cost structure: `draw` iterates all items once (O(n) canvas ops) + selection-animation loop iterates all seats per tick while any `hov/sel` is mid-tween (`:955-970`); depth re-sort O(n log n) only when yaw changes (`:682-687`); `kbMove` O(n) per arrow press (`:1149-1172`); `hitTest` O(n) per pointermove (mouse only).
- With seat geometry ≈ seatRadius 9 units and DPR≤2: **125 seats** (sample venue) — trivially 60fps on any modern phone. **2,000 seats** (~766 KB plan JSON, measured §10) — ~2k ellipse fills + strokes per frame ≈ low-single-digit ms on desktop, borderline on low-end mobile during the 1.1s 2D↔3D morph (`:935-937`); steady-state static (no rAF unless `moving`) so idle cost is zero — the architecture's best trait. **10,000 seats** (~3.8 MB JSON) — full-plan `build()` + first `draw()` will jank (10k canvas path ops, ~10–30ms/frame during morph), pinch/hitTest still fine (O(n) scan of 10k is sub-ms); initial JSON parse + transfer dominates. Recommendations: cap morph animation to viewport-visible seats or snap when `items.length > 4000` (uses existing `reduced` fast path), virtualize tooltip/table lookups (already Map-based), and paginate/windowing is NOT needed if idle-render stays zero — but the 3.8 MB fetch is (see Phase 3: server-computed statuses + compression, or section-level lazy load).
- Memory: `items`/`order` arrays + per-seat JS objects ≈ low MBs at 10k — fine.

### 5. Accessibility gaps

- Present: canvas `tabIndex={0}`, `role="img"`, descriptive `aria-label` with seat count + key help (`:1355-1357`); `aria-live="polite"` announcer (`:1514-1515`) fed by selection/takeaway messages (`:419-433,440,1207,1221`); view toggle is real buttons with `aria-pressed` (`:1335`); legend filter buttons with `aria-pressed` (`:1405`); zoom buttons labelled (`:1362-1368`); `prefers-reduced-motion` snaps morph/camera/filter (`:506-507,935-955`); tooltip `aria-hidden` toggled with visibility (`:922`).
- Gaps (must-have marked ★): ★ seats are not individually focusable/tab-reachable — a keyboard-only user arrows through an invisible cursor with no visible focus ring distinct from hover (kb uses same `hov` highlight path via `refreshActive`); screen-reader users get announcements but no seat list alternative — a visually-hidden listbox mirroring selection is needed for a payment flow (WCAG 2.1.1/4.1.2 risk). ★ 9-unit seats at fit-zoom on a 375px phone render well under 24px targets — preserve the 12% hit slop and add double-tap-zoom or a minimum screen-size clamp. Touch: GA +/- buttons are `h-8 w-8` (`:1309` ≈ 32px, under 44px minimum). Reduced-motion honored in engine but the view-toggle thumb (`duration-300`, `:1328`) and tooltip (`motion-reduce:transition-none` present `:1379` — ok). Color: reserved/sold are close greys in dark palette (`reserved [113,113,122]` vs `sold [48,48,54]` on `[24,24,27]` floor — low contrast pair); status is also text-announced, so not blocking.

### 6. Assumption comparison (candidate vs Phase 1 truth)

| Candidate expects | Repo provides | Verdict |
|---|---|---|
| `VenueSeat.{id,x,y,label,status,category,price,tableId}` centre coords | `seats` rows, TOP-LEFT x/y + w/h, status⊂{available,reserved,sold,unavailable}, `is_vip/is_accessible` flags, `price_override/ticket_type_id`, `table_number` (no table UUID) | Adapter must: centre-shift, map unavailable→locked, flags→category, resolve price via `resolveEffectiveSeatPrice`, join `table_number`→table id |
| `seatRadius` default 9 | Seat glyphs 26×26 (grid) / 24 (table), gaps 8/12 | 9-unit radius ≈ 18px diameter vs 26px boxes — visual parity requires radius ≈ 12–13 or scale factor; label as tuning constant |
| `VenueTable.{id,x,y,radius|width/height,label}` centre | `venue_objects` type `table` rect x/y/width/height + `table_number/name/capacity/shape` | Adapter must centre-shift + map round (`radius=min(w,h)/2`) vs rect; capacity/shape live on the object, seats join by `table_number` |
| `VenueStage.{x,y,width,height,elevation}` centre | Stage objects rect top-left, no elevation | Centre-shift; elevation = default (`R*2.2`) always (no source) |
| `VenueGaZone.{capacity,available,price}` | `ga_area` objects with static `capacity` only; no sales, no decrement | `available` has NO source (UNVERIFIED computable: no per-zone sales table); price has no source (use cheapest tier or 0 = UNVERIFIED product decision) |
| `labels[].{x,y,text}` | `label` objects `{x,y,label|name}` | Field rename; centre-vs-baseline ambiguity (SVG `<text>` x/y is baseline — adapter should offset; verify visually) |
| `onSelectionChange(seats)`, `onCheckout({seats,ga,total})`, client-side locking only | Server holds (5-min RPC), intent-time revalidation, webhook issuance | Candidate's own header admits client-side locking only — integration MUST NOT trust it (Phase 3 hold design); `onCheckout` payload prices are display-only |

---

## Phase 3 proposal (build, don't implement)

### 1. Data adapter (pseudocode against real types)

Live in `lib/seating-adapter.ts` (pure, unit-testable, beside `lib/seating.ts`; no React import so server + client can share it). Input: `FullVenueLayout` (`lib/seating.ts:96-109`) + already-enriched seats (reuse `GET /api/seats` enrichment via `resolveEffectiveSeatPrice`). Never trust client prices downstream (existing rule `create-payment-intent:100-105`).

```ts
import type { SeatGeometry, VenueObject, FullVenueLayout } from "@/lib/seating";
import type { VenuePlan, VenueSeat } from "@/components/ui/venue-seat-picker-3d";

const SEAT_R = 26, SEAT_CX = SEAT_R / 2; // repo glyph box; candidate radius prop stays 12–13

function toCategory(s: SeatGeometry) {
  if (s.is_accessible) return "accessible";
  if (s.is_vip) return "vip";
  return "standard";
}
function toStatus(s: SeatGeometry) {
  // candidate SeatStatus ⊂ {available,reserved,sold}; unavailable + invitation-held both lock
  if (s.status === "available" && !s.assigned_invitation_id) return "available";
  if (s.status === "reserved") return "reserved";   // includes expired-hold rows: list them as reserved (safe side) — see risk §8
  return "sold";                                    // sold + unavailable + invitation-assigned all render locked
}
export function adaptPlan(layout: FullVenueLayout): VenuePlan {
  const tableIdByNumber = new Map(
    layout.venue_objects.filter(o => o.type === "table" && o.table_number).map(o => [o.table_number!, o.id])
  );
  return {
    seats: layout.seats.map(s => ({
      id: s.id,
      x: s.x + (s.width ?? 26) / 2,          // top-left → centre
      y: s.y + (s.height ?? 26) / 2,
      label: s.table_number ? `Table ${s.table_number} · Seat ${s.seat_number}`
                            : `${s.section} · Row ${s.row_label} · Seat ${s.seat_number}`,
      number: s.seat_number,
      status: toStatus(s),
      category: toCategory(s),
      price: s.effective_price ?? undefined,  // enriched server-side; undefined hides price
      tableId: s.table_number ? tableIdByNumber.get(s.table_number) : undefined,
    })),
    tables: layout.venue_objects.filter(o => o.type === "table").map(o => ({
      id: o.id, x: o.x + o.width / 2, y: o.y + o.height / 2, label: o.label ?? o.name,
      ...(o.table_shape !== "rect" ? { radius: Math.min(o.width, o.height) / 2 }
                                  : { width: o.width, height: o.height }),
    })),
    stages: layout.venue_objects.filter(o => o.type === "stage").map(o => ({
      id: o.id, x: o.x + o.width / 2, y: o.y + o.height / 2,
      width: o.width, height: o.height, // elevation omitted → default R*2.2
    })),
    gaZones: layout.venue_objects.filter(o => o.type === "ga_area").map(o => ({
      id: o.id, x: o.x + o.width / 2, y: o.y + o.height / 2, width: o.width, height: o.height,
      label: o.label ?? o.name, price: o.price ?? 0,
      capacity: o.capacity ?? 0, available: o.capacity ?? 0, // AVAILABLE HAS NO SOURCE — see §5
    })),
    labels: layout.venue_objects.filter(o => o.type === "label").map(o => ({
      x: o.x, y: o.y, text: o.label ?? o.name, // baseline offset to verify visually
    })),
  };
}
```

Fields we do not have: `gaZones[].available` (no decrement source), `gaZones[].price` (no per-zone price; `VenueObject.price` exists but unused — UNVERIFIED whether builders set it), stage `elevation`, label baseline-vs-centre, table UUID linkage (joined by number string match — fragile if organizers rename tables; consider a real FK later, NOT now).

### 2. Where it plugs in

- Replace the `SeatMap` branch only: `app/events/[slug]/TicketCheckout.tsx:714-747`. Keep the `tickets → seats → review` steps, `seatMapAvailable` gating, and `maxSelectable=10` semantics. Mount: `const VenueSeatPicker3D = dynamic(() => import("@/components/ui/venue-seat-picker-3d"), { ssr: false })` (same pattern as `:10`), client-component boundary at the seats step; pass memoized `adaptPlan({…venueLayout, seats: allSeats})`, `currency="USD"`, `maxSeats={10}`, `seatRadius={13}`, `onSelectionChange` → existing `setSelectedSeats` + tier-count derivation (`:737-745`, unchanged shape after mapping back seat ids to `SeatData`), `onCheckout` → `goToReview()` (do NOT let the candidate drive payment; review + `preparePayment` stay authoritative).
- Events without a plan: today's behavior is the spec — `GET /api/seats` returns `{layout: null}` → `seatMapAvailable` stays false → tickets-only flow (`:93-105,700-711`). Keep exactly that; the candidate's `createSampleVenue()` fallback must NEVER render in production (pass `venue` always; sample is dev-only).
- Back-mapping: candidate returns `VenueSeat[]`; resolve each id through the pre-adapter `SeatData` map (by id) so `ticket_type_id/effective_price/table_number` flow into the existing `seatsPayload` (`:209-219`) untouched.

### 3. Seat holds & double-booking protection (reuse locked schema; no migration)

- **Hold on selection (new, no schema change).** Today the hold lands at payment prep. For a 3D picker with live takeaway notices, add: on `onSelectionChange` (debounced ~800ms, only deltas), `POST /api/seats { seatIds: currentSelection }` (existing atomic RPC, 5-min window). On 409, drop `unavailableIds` from selection with the candidate's existing takeaway notice path (`:436-442` — feed it from the 409 response instead of only fresh-venue diffs). Refresh: re-POST every 4 min while the seats step is mounted (holds are idempotent re-locks for still-available seats). Release on abandonment: explicit `DELETE /api/seats { seatIds }` → new handler flipping `reserved→available` only when `reserved_until` is in the future and no instance exists — needs NO new column (status + timestamp suffice). Worst case (tab closed): lazy expiry as today.
- **Checkout validation (unchanged, already correct).** `create-payment-intent` re-read (`:110-152`) + webhook `SEAT_ALREADY_ASSIGNED` guard (`migration_118:173-187`) + reconciliation alerts stay the single source of truth. Candidate prices never enter billing (already the rule `:100-105`).
- **No schema change proposed.** A holds table (owner, token, expiry) would be cleaner but the locked `ticket_instances` schema plus `seats.status/reserved_until` covers it; migration risk unjustified. The one gap to accept explicitly: holds are seat-scoped, not buyer-scoped — anyone holding blocks anyone else (by design today), and re-hold by a second buyer of YOUR held seats fails closed (good) but the UX message ("just taken") conflates holds with sales (acceptable; note in UI copy).
- **Stripe/webhook ordering.** Unchanged: intent metadata carries `seats_json` → webhook RPC is the commit point → `is_new` gate dedupes retries → email/notify only on new. Fix in passing (no migration): remove the redundant post-RPC seats→`sold` updates (`webhook:565-578,1059-1072`; RPC already flips) to halve write contention on hot events — or keep if you prefer belt-and-braces; state the choice in the phase doc.

### 4. Realtime availability

- **Proposal: short-poll, not realtime.** `GET /api/seats` every 20–30s while the seats step is mounted (If-Modified-Since/ETag later; today no cache headers — add `Cache-Control: private, max-age=15` on the GET, no migration). Feed fresh statuses into the memoized venue → candidate's takeaway effect (`:436-442`) drops taken seats with notice. Rationale: seat rows expose `reserved_until/assigned_invitation_id/price_override/ticket_type_id` — a public Realtime channel would leak exactly the fields §7 flags; a scoped view/RPC (`select id,status-category-bucket,eo-price`) + RLS policy would be the realtime prerequisite and is a bigger review surface than polling. Polling reuses the existing service-role endpoint with zero RLS change and zero new leak.
- If realtime is later demanded: create SQL view `public.seat_availability(event_id, seat_id, bucket, price)` (bucket ∈ available/held/sold; no timestamps, no invitation ids, no overrides) + SELECT policy `USING (event is public-kind AND published)` + Realtime publication on the view; organizer console keeps the full table. That is a migration + RLS review — phase it separately.

### 5. GA, tables, accessibility, currency

- **GA quantities.** Candidate supports GA cart lines (`GaSelection`, `:93-104`, +/- capped at `available`, `:1470-1474`). Our backend has NO GA sales path (§8). Options: (a) ship 3D picker with GA zones rendered read-only (tooltip only, zero quantity UI — hide `ga` cart when every zone has `price==null`) until a GA line-item migration exists; (b) sell GA as tier quantities through the existing `items` (non-seat) path with `seats_json` untouched — quantity-only, no zone accounting (oversellable). Recommend (a) now; GA decrement (per-zone sales counter table) is the future migration with real oversell risk to review.
- **Tables.** Keep per-seat sale (no whole-table SKU). Add small must-have: tapping a table body selects nothing but shows the tooltip availability summary (already computed `:892-894`) — needs the hittability fix (§2.3) or a dedicated "table info" affordance.
- **Accessibility.** purchasable-rule stays `isSeatPurchasable` (available + unassigned + unheld); accessible/VIP are merchandising flags, never purchase gates (today's semantic — do not invent accessible-only restrictions). Screen-reader listbox alternative is the must-have (Phase 2 §5).
- **Currency.** Fixed `USD` end-to-end today (`TicketCheckout formatPrice`, `OrderSummary currency="USD" :778`, intent `currency:"usd" :238`, free order `"usd" :97`). Pass `currency="USD"` explicitly; the candidate's `Intl` formatting already handles a future multi-currency switch (its `XOF` comment anticipates it — do not switch now).

### 6. Component changes (must-have vs later)

Must-have (integration blockers): (1) fix `:482` ref-during-render (move to effect); (2) remove stale eslint-disable `:1286`; (3) Escape clears selection too (or fix header comment `:18`); (4) `unavailable` status + invitation-held mapping — candidate `SeatStatus` has no `unavailable`; either extend the union or document the `→sold` collapse in the adapter (decision: extend union + grey-black swatch; 3 lines); (5) sr-only listbox mirroring seats/selection for screen readers; (6) minimum on-screen seat size clamp at fit-zoom (or document 375px acceptance shots); (7) never render `createSampleVenue()` when `venue` is provided-but-empty (today `venueProp ?? sample` treats empty plan as sample-worthy — an event with zero seats would show a fake venue; gate on `venue.seats.length`); (8) zinc/orange token pass + `rounded-xl` + orange focus ring to match the design system; (9) `maxSeats` default 8 → pass 10 explicitly (parity with today) and surface the cap copy.
Later: whole-table select, adjacent-seat finder, min/max-per-tier rules, GA quantity caps per order, pinch-zoom `touch-action` tuning, 10k-seat morph fast path, table-body tap target.

### 7. Phased plan (independently shippable; staging first, production later)

- **P0 — Candidate hygiene (no migration, no prod risk).** Touch: candidate file only (fixes §6.1–4,8). Migrate: none. Rollback: revert commit. Acceptance: `npx eslint components/ui/venue-seat-picker-3d.tsx` exit 0 (today: 1 error); `npx tsc --noEmit` shows no new errors (today: 8 pre-existing, zero in candidate); screenshot 375/768/1440 light+dark of sample venue.
- **P1 — Adapter + read-only preview (no migration).** Touch: new `lib/seating-adapter.ts` + unit test (append to `package.json` test list!) + a hidden preview route (e.g. dashboard event preview mounting the picker on real `GET /api/seats` data, organizer-only). Migrate: none. Rollback: delete route. Acceptance: preview screenshots for a row-section event + a table event + GA event; adapter tests (centre-shift, unavailable→locked, VIP flag→category, table join, empty-plan guard); `npm test` green.
- **P2 — Attendee swap behind flag (no migration).** Touch: `TicketCheckout` seats step (dynamic import, memo venue, back-map ids, `onCheckout→goToReview`); hold-on-selection debounce + 4-min refresh + `DELETE /api/seats` release handler (new op in existing route file). Migrate: none (uses `status/reserved_until`). Rollback: flag off → `SeatMap` branch. Acceptance: Stripe test-mode holds→intent→webhook→instances rows + `seats=sold`; 409 takeaway-drop video; abandonment releases within 5 min (DB row check); full `npm test` + build.
- **P3 — Polling + GA-read-only + a11y listbox (no migration).** Touch: 25s poll while mounted, `Cache-Control: private, max-age=15` on `GET /api/seats`, GA tooltip-only mode, sr listbox. Acceptance: two-browser takeaway test (seat taken elsewhere disappears with notice); axe/keyboard pass; 375px touch-target shots.
- **P4 (later, migration) — GA sales counter + realtime view + refund-to-available.** Only if product demands; each with own migration twin + rollback + RLS review; production apply after staging soak. State explicitly: P0–P3 need NO migration and touch NO production data path beyond existing tables.

### 8. Risks and open questions

- Diverged-history risk: `version`/`is_published`/expiry-reaper/free-instances/refund-resale inconsistencies (§12) mean the picker inherits silent semantics (e.g. refunded seats unsellable, expired holds displayable). P1 preview must cover a refunded-seat event and an expired-hold event.
- Prod-data risk: P0–P3 write only via existing endpoints (`save_layout` untouched; holds/intents/webhooks unchanged in logic). The only new write is hold-refresh + explicit release — both bounded to `reserved↔available` flips the RPC already performs.
- Invitation risk: picker must never mount on `app/invitation/**` or for `kind=invitation` (slug page already 404s them). Add an assertion in the seats step: `if (event.kind === 'invitation') skip picker` (defense in depth; today implicit via routing).
- Adapter fragility: table join by `table_number` string; label baseline offset; `available=capacity` placeholder for GA (any number shown is decorative until P4 — consider hiding counts and showing names only).
- Scale risk: 3.8 MB/10k-seat payload over mobile networks; P3 caching + P4 section-lazy-load are the mitigations; set a tested ceiling (e.g. verified to 2,500 seats) and gate larger venues to the 2D list view until measured.

## Evidence appendix (commands run + key outputs)

- `Test-Path "components/ui/venue-seat-picker-3d.tsx"` → `True`; line count `1420`.
- `grep VenuePlan` (early) → no matches (pre-paste); post-paste export grep → 8 hits (`:30,:44,:56,:67,:85,:106,:262,:364`).
- `npx eslint components/ui/venue-seat-picker-3d.tsx components/SeatMap.tsx "app/events/[slug]/TicketCheckout.tsx" lib/seating.ts lib/seating-server.ts "app/api/seats/route.ts"` → `11 problems (1 error, 10 warnings)`, exit 1 (candidate `:482` error + `:1286` warning; SeatMap `:80,:84,126:40`; TicketCheckout 206/280/390/433/465/1007).
- `npx tsc --noEmit` (background) → exit 1, 8 errors, all storefront ordering (`OrderCard` ×6, `actions/orders` ×1, `storefront-order-payments` ×1); zero in seating/candidate paths.
- Seating tests (10 files, foreground): zero failure lines (`NO_FAILURE_LINES_FOUND` for `not ok|# fail [1-9]|fail [1-9][0-9]*`); observed passes incl. phase6 engine 8/8, Phase 6E summary 8/8, AI assistant A–O, canonical rows/tables/validation/determinism/combine-protection sets.
- Plan-size measurement (`node -e` JSON of one full seat row): `seat_bytes=392` → `x2000_KB=766`, `x10000_KB=3828`, `layout_bytes=80`.
- Scoped greps: `realtime|channel(|postgres_changes|polling|setInterval.*seat` in `lib/` → 1 unrelated hit; `gaZone|ga_zone|gaZones` in `lib/` → no matches; `8-step|ticket_instances.*locked|Seating and Invitations` in `docs/` → no matches; `release_expired_seat_reservations` in `lib/` → type stub only.

## P0 implementation record (approved 2026-10-14; P1+ on hold)

Owner decisions locked: GA tooltip-only (`readOnly`, no quantity sales until P4); no sample venue in production (`demo` prop, tickets-only flow preserved); webhook re-flip left alone (separate contention ticket); refund-to-available is P4-only migration; acceptance gate 2,500 seats p95 <33ms orbiting on mid-range phone, flag off by default, lazy-load/cache before serving >2,000 seats.

- `components/ui/venue-seat-picker-3d.tsx`: (1) `cfg.current = {…}` moved out of render into a post-commit `React.useEffect` (declared before the engine effect, no dep array → runs first on mount, every commit after; first attempt with an aliased `useIsomorphicLayoutEffect` still tripped `react-hooks/refs` because the rule only recognises the canonical hook names — plain `useEffect` is also SSR-safe since it never runs on the server and the ref initializer holds first-render values). (2) Stale `eslint-disable-next-line react-hooks/exhaustive-deps` before `}, [scrollZoom])` removed. (3) `VenueGaZone.readOnly?: boolean` added; read-only zones render label only (no price/availability sub-line, no stepper). (4) `demo?: boolean` prop added (default false); implicit `?? createSampleVenue()` replaced with `?? (demo ? createSampleVenue() : EMPTY_VENUE)` (module-stable `{ seats: [] }`). Nothing else changed — webhook, RPCs, migrations, `SeatMap`, `TicketCheckout` untouched.
- `lib/seating-adapter.ts` (new, lib only, not wired into any page): `adaptSeatCategory` (accessible wins), `adaptSeatStatus` (available only when unheld; reserved incl. expired holds passes through; sold/unavailable/invitation-held collapse to locked `sold`), `adaptSeatLabel` (SeatMap tooltip convention), centre conversion (top-left + w/2,h/2), `SUGGESTED_SEAT_RADIUS = 13` (26 box / 2), table join by `table_number` string, stages centred (no elevation source), GA zones `readOnly: true` with `available = capacity` placeholder, labels renamed to `text`. Price passes `effective_price ?? undefined` (display-only; billing re-resolves server-side).
- `lib/__tests__/seating-adapter.test.cjs` (new, 8 tests, registered in `package.json` test list after `multi-seat-checkout`): centre conversion (26 + 24 boxes), radius derivation, category incl. conflict, table join, locked-status mapping (unavailable/invitation-held→sold, holds stay reserved), labels, stage/GA/label mapping, price passthrough. Result: **8/8 pass, fail 0**.
- `package.json`: one-line test-list append only.
- P0 verification: `npx eslint components/ui/venue-seat-picker-3d.tsx lib/seating-adapter.ts lib/__tests__/seating-adapter.test.cjs` → exit 0, no output (was: 1 error + 1 warning on the candidate). `npx tsc --noEmit` → (see output below) 8 pre-existing storefront-ordering errors, zero in `venue-seat-picker-3d.tsx`, `seating-adapter.ts`, or any seating path.

## Hold rate-limit + release design (for P2; recorded before any later phase)

- **Rate limit.** Reuse the existing `paymentIntent` limiter (`enforceRateLimit("paymentIntent", …)`, already applied on `POST /api/create-payment-intent` and `POST /api/checkout`). Apply the same bucket to `POST /api/seats` (hold) — body: `{ seatIds }` — with a tighter per-user cap (holds are cheap to retry; propose max ~30 hold attempts / 10 min / user+IP) so a script cannot churn `reserved_until` on a whole venue. 409 responses (seat taken) must NOT count as errors in alerting — they are the expected contention signal.
- **Hold refresh.** While the seats step is mounted with a non-empty selection, re-POST deltas every ~4 min (5-min window). Only send deltas (added/removed ids), not the full selection, to bound row-lock time in `reserve_seats_atomic` (locks `ORDER BY id FOR UPDATE` — keep payloads small).
- **Release on deselect.** `DELETE /api/seats { seatIds }` (new op in the existing route file, no migration): flip `reserved → available` ONLY where `reserved_until` is in the future AND no non-cancelled `ticket_instances` row references the seat (cheap `NOT EXISTS` guard; mirrors the webhook's `SEAT_ALREADY_ASSIGNED` check). Never touch `sold`/`unavailable`/invitation-held rows. Idempotent: releasing an already-available or already-sold seat returns success with `released: []`.
- **Release on page-leave.** `navigator.sendBeacon` to the same DELETE op on `pagehide`/`visibilitychange=hidden` (best-effort; failures are safe because the 5-min lazy expiry is the backstop). Do NOT release on step navigation within checkout (seats→review keeps the hold; the intent call re-validates).
- **Abuse shape.** Deselect-then-rehold loops cannot extend a hold beyond 5 min from the last refresh by design; the rate limit above bounds churn. Holds remain seat-scoped, not buyer-scoped (accepted gap: anyone's hold blocks anyone else; UX copy must say "held", not "yours", until identity-bound holds exist).

## Staging test plan: two Stripe test-mode checkouts, same seat (P2 acceptance)

Setup (staging only): seated event with ≥2 available seats (S1 target, S2 control), Stripe test keys, two buyer emails, Resend sandbox. Observer watches `seats` row for S1 + `ticket_orders`/`ticket_instances` + `payment_reconciliation_failures`.

1. Buyer A selects S1 (+S2), completes card payment (test card 4242…). Expect: webhook 200, `record_ticket_and_credit is_new=true`, 2 instances with distinct QRs, S1+S2 `sold`, buyer email received, organizer notified, ledger credited once.
2. Buyer B (second browser/profile) loads the map BEFORE A's webhook completes and selects S1; B's hold POST either 409s (A's hold active) or succeeds-then-fails: if B reaches payment, B's intent is created (held seats pass intent-time check by design), B pays, webhook RPC raises `SEAT_ALREADY_ASSIGNED`. Expect: NO second `ticket_orders` row persists (transaction abort), ONE `payment_reconciliation_failures` row (`kind=ticket`, B's PI id, raw metadata intact), urgent email to support, B gets no ticket email, S1 still `sold` under A's order, A's instances untouched.
3. Same-race control (optional, scripted): fire both `POST /api/seats { [S1] }` concurrently ×20. Expect: exactly one success per round (RPC `FOR UPDATE` serialises); loser gets 409 + `unavailableIds=[S1]`; no `sold` flips without a webhook.
4. Abandonment: A holds S1, closes tab. Expect: row stays `reserved` ≤5 min, then reads unreserved everywhere (lazy expiry — no reaper row, no cron); explicit DELETE path (once built) flips immediately.
5. Refund (documents current gap): refund A's instance via `refund_ticket_instance`. Expect TODAY: instance `refunded`, order cascade skips `used`, seat REMAINS `sold` (stranded — P4 fix). Record the stranded row as the P4 migration's acceptance fixture.
6. Free-event control: free seated event, buyer takes S1. Expect TODAY: `ticket_orders` row, NO `ticket_instances` row, S1 `sold` (known parity gap §3c/§12.4 — assert it stays visible until fixed).

## P2 implementation record (flagged swap; flag OFF by default)

- Component (`components/ui/venue-seat-picker-3d.tsx`): `VenueSeat.statusLabel?` (tooltip uses `statusLabel ?? statusText`; gating untouched); `VenueTable.capacity?`; table tooltip now `"<capacity> seats · <available> available"`; tap feedback ring on the active table + `pointer` cursor on table hover. Correction to the P1 defect-4 claim: round tables were already hittable at full ellipse size (draw sets `it.rx/ry`); the real gap was missing capacity text and no tap feedback, both fixed here.
- Adapter (`lib/seating-adapter.ts`): `AdaptOptions { myHeldIds?, now? }`; `EXPIRED_GRACE_MS = 30_000`; expired/null/unparsable holds → `available` (RPC stays the authority; 409 → takeaway notice); `myHeldIds` → `available` unless sold/unavailable/invitation-held; labels "Held for a guest" / "Unavailable" / "On hold"; table capacity prefers `venue_objects.table_capacity`, falls back to chair count; `PICKER_MAX_SEATS = 2500` + `shouldUse3DPicker({flagOn, hasPlan, seatCount, adapterOk})`.
- Booking flow (`app/events/[slug]/TicketCheckout.tsx` only): `NEXT_PUBLIC_SEATING_3D_PICKER === "1"` flag (unset → SeatMap); `myHeldIds` state persisted per event in sessionStorage (SSR-guarded, display-only); `pickerPlan` memo with try/catch → null fallback; gate = flag && plan && ≤2500 && adapterOk; picker gets `selectedIds` (controlled), `onSelectionChange` back-mapped to `SeatData` through the existing `applySeatSelection` (same `selectedSeats` → summary → `preparePayment`/`POST /api/seats` → crypto/free paths), `onCheckout` → `goToReview()`. Holds still happen at checkout only. `SeatMap` branch is byte-identical in behavior (handler extracted, same derivation).
- Tests: 6 new adapter cases (myHeldIds, expired+grace, labels, table capacity, empty plan, gate incl. 2500/2501 boundary); flag-off path covered at decision level by `shouldUse3DPicker` (no jsdom in this repo — a DOM render test is out of scope for the node:test harness).
- Constraints kept: no migrations, no RPC/webhook changes, no hold-on-selection, GA still read-only, SeatMap untouched.

## P2.1 record (own-hold 409 fix, dynamic-import confirm, stress mode)

- 409 self-dead-end: a buyer re-holding their own active holds gets 409 by design (`reserve_seats_atomic` rejects `reserved && reserved_until > NOW()`; `app/api/seats/route.ts` returns 409 + `unavailableIds`), and `preparePayment` bounced them to the seats step with "no longer available" — retrying looped until expiry. UI/flow-only fix in `preparePayment`: when every unavailable id is in `myHeldIds`, skip the failure and continue to intent creation, where the server revalidates authoritatively (sold/invitation seats still fail there). No RPC change.
- Dynamic import confirmed: `VenueSeatPicker3D` is `dynamic(..., { ssr: false })` (`TicketCheckout.tsx:13-15`) — flag-off visitors never load it. No fix needed.
- Stress mode (dev preview only): `?seats=N` (cap 5000) generates deterministic grid seats in memory (`app/dev/seating-preview/stress.ts`), bannered SYNTHETIC STRESS DATA, nothing written; page-rAF p50/p95 readout over a rolling ~5 s window (main-thread proxy, labeled as such). Test: clamp + generator→`adaptPlan` count.
- Vanished storefront tsc errors: `components/dashboard/orders/OrderCard.tsx` never existed in HEAD (whole dir untracked other-work); line 5 now imports real `formatCurrency` instead of non-exported `Locale`. The 8 errors were transient working-tree states, evolved past by parallel edits — no base fix, nothing committed about them, files untouched here.
- SeatMap-branch equivalence: HEAD~1 inline handler vs extracted `applySeatSelection` — identical derivation (`setSelectedSeats` + tier-count loop + `setSelectedQuantities`); the only addition is the `setMyHeldIds` sessionStorage mirror.

## P2.2 record (timestamped holds, safe 409-skip)

- `myHeldIds` was written at selection time (pre-hold) — quoted at `applySeatSelection`; now written ONLY after a successful hold (`rememberHolds` in `preparePayment` and the crypto path, using the API's `reservedUntil` or now+5 min). `create-payment-intent` does NOT reject others' active holds (`:145-151`: held seats pass), so the old skip was unsafe for stale ids.
- Holds are now `{id, holdUntil}` (`HoldEntry`); `parseHeldEntries` drops expired + legacy string arrays without throwing; adapter honors timestamped entries only while live; `allLiveHolds` gates the 409-skip, which now alerts "Your seats are still on hold — continuing to payment." instead of silently skipping.
- Branch proof: detached worktree at the branch tip ran `npm ci` + `tsc` + seating suite + eslint clean (see P2.2 report), then the worktree was removed.

## P2.3 record (expired-hold normalization in GET /api/seats)

- `normalizeSeatAvailability` (`lib/seating.ts`, pure, server-time injectable): `reserved` + (`reserved_until` null or >60 s past) + no invitation → `status:'available'` with `status_raw` preserved and `reserved_until` untouched. Active holds, margin holds, sold, unavailable, guest-held unchanged. Wired into the existing enrichment map in `GET /api/seats` beside `effective_price` — additive (`+status_raw`); the sole code consumer is the `TicketCheckout` mount fetch feeding both pickers. RPC stays the authority; no migration.
- Adapter's own 30 s grace is NOT redundant: it covers the organizer seating-GET path and any direct adapter caller that bypasses `/api/seats` (dev preview fixtures); the two margins compose safely (GET 60 s feeds adapter 30 s — the stricter display wins per layer). Left as is per scope.

## P3.1 record (hold-liveness skew margin)

- `HOLD_SKEW_MARGIN_MS = 30_000`: timestamped entries live only while `now < holdUntil − 30 s`, in `isMyHeld`, `allLiveHolds`, `parseHeldEntries`. Fast clocks can't stretch holds; slow clocks fail safe to server-read status with RPC arbitration on retry.
- Session-branch finding (read-only): sole `/api/checkout` caller is `handleFreeTicket` (`TicketCheckout.tsx:522`); the paid session branch is reachable only if the server total comes out >0 mid-flow, and its `.eq("status","available")` reserve silently no-ops on expired-hold rows while the Path-C webhook still completes the sale (no `SEAT_ALREADY_ASSIGNED` guard on Path C — double-sell would need manual refund). Proposed fix (not implemented): re-hold via RPC before session creation, 409 before charging.

## Open questions for me

## Separate tickets (logged, not fixed here)

- Stripe publishable key undefined errors — file and line UNVERIFIED (owner-pasted logs not present in this session; repaste the log excerpt to pin). No fix attempted.
- Two Next.js instant-navigation errors — file and line UNVERIFIED (same; repaste to pin). No fix attempted.
- Webhook seats→`sold` re-flip contention measurement on a hot event (deferred per owner decision; `app/api/webhooks/stripe/route.ts:565-578,1059-1072` left as-is).

## Fixture exporter usage (owner-run; agents must not run --list/--event)

- `node scripts/export-seating-fixture.cjs --self-test` — offline scrubber check, no network.
- `node scripts/export-seating-fixture.cjs --list --confirm-staging <ref>` — prints `event_id`, seat count, title for staging events that have a plan (id + title only, no buyer data). Pick the ~125-seat event.
- `node scripts/export-seating-fixture.cjs --event <uuid> --confirm-staging <ref> [--force]` — writes `lib/__tests__/fixtures/venue-layout.json` + `seats-response.json` (refuses to overwrite without `--force`).
- Guards: GET-only `fetch` (`apiGet` is the sole request path); `STAGING_SUPABASE_URL` + `STAGING_SUPABASE_ANON_KEY` (preferred) or `STAGING_SUPABASE_SERVICE_ROLE_KEY` from env only; `--confirm-staging` must equal the URL host's project ref; refuses when the URL matches any `.env.production*` `SUPABASE_URL` in the repo; prints host (never key); requires typing `yes`. Keys are never written or logged.
- Anon-key expectation: likely INSUFFICIENT for all four tables read (`events`, `venue_layouts`, `seats`, `tickets`) — RLS is enabled on the seating tables with no public SELECT policy found in migrations, so expect 401/403 on anon and use the staging service-role key; the script names the denied table in that case.
- After writing it prints (never file contents): paths, byte sizes, seat count by status, tables/stages/GA/labels counts, dropped unexpected columns, post-scrub result.
- Scrubber unit test: `lib/__tests__/seating-fixture-scrub.test.cjs` (synthetic data only, registered in `package.json`).

- (carried) Where should the `demo` preview live for owner review — a hidden organizer-only dashboard route (P1 as planned), or a Storybook-style scratch page outside `app/`?
- Refund-to-available P4 migration: should `used` (checked-in) instances also free their seats on refund, or stay locked as today (cascade skips `used`)?
- Hold windows: keep 5-min RPC default for picker refresh, or align everything (picker + legacy 30-min session branch) on one value?
- The 8 pre-existing `tsc` errors are untouched per scope — do you want them ticketed separately before P2 (they block a clean `tsc --noEmit` gate)?
