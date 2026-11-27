# Phase 7: Bookings & Reservations

---

## STATUS (updated 2026-11-14, branch `feat/rental-handover`)

**PARTIAL.** A reservation request engine is built but hidden from navigation; the full scheduling/calendar/SMS surface is not built. Rental booking handover work has been implemented in code on this branch and its database migration (233) is applied on staging.

### Built / implemented
- **Reservations (request engine, previously verified):** `db/migration_176_reservations.sql` (+ rollback) creating `public.reservations`; server actions `lib/actions/reservations.ts` (`submitReservationRequest`/+`WithClient`, `updateReservationStatus`, `cancelReservationByToken`, `saveReservationSettings`); dashboard `app/dashboard/org/[id]/reservations/page.tsx`; public token page `app/site/[slug]/reservations/[lookup_token]/page.tsx`; tests `lib/__tests__/phase7-reservations.test.cjs` registered. (Verified in earlier pass; not re-verified in this session.)
- **Rental handover (code implemented on this branch; migration 233 applied on staging):** pickup/return inspection flow, deposit settlement recording, late-fee calculation/apply/waive, and rental agreement PDF generation/attachment. Migration `db/migration_233_rental_handover.sql` (+ rollback, `supabase/migrations/20261113000000_migration_233_rental_handover.sql` mirror) applied to staging and verified (table, three functions, late-fee checks). Key implementation files: `lib/actions/rental-handover.ts`, `lib/rental/handover-guards.ts`, `lib/rental/late-fee.ts`, `lib/rental/agreement.ts`, `components/dashboard/rentals/HandoverPanel.tsx`, inspection/agreement API routes under `app/api/rentals/`. Real-behavior tests added in `lib/__tests__/rental-handover.test.cjs` (registered). Migration 231 is the staff-management workstream (merged locally on `merge/staff-management-into-staging`, 2026-11-27, not applied); **234 is taken by staging's own unified-template migration**, so do not plan rental work against it — take the next free number from the register in `docs/HANDOFF.md` section 6 (**274** as of 2026-11-27). Pickup and return flows verified in a browser on staging data; deposit settlement, late-fee returns and photos are not yet tested.

### Partly built
- **Navigation is hidden** — `app/dashboard/org/[id]/org-nav-items.ts` has **no** reservations entry, so the built dashboard page is undiscoverable. (VERIFIED — grep returns 0 matches.)
- **Public flow is token/lookup-based**, not a real-time slot picker. (VERIFIED — route is `reservations/[lookup_token]`.)

### Not built (NOT FOUND — searched `app/`, `components/`, `lib/`)
- `booking_resources`, `availability_rules`, `time_slots` schema. (VERIFIED — no such migrations; `db/` has only `migration_176_reservations.sql`.)
- Time-slot generation / conflict-prevention engine (`lib/bookings.ts`). (VERIFIED NOT FOUND.)
- Public `components/bookings/BookingWidget.tsx`. (VERIFIED NOT FOUND.)
- Day/week/month calendar timelines; deposit payment on booking. (VERIFIED NOT FOUND.)
- Automated email/SMS confirmations and `.ics` calendar invites. (VERIFIED NOT FOUND.)

### Known bugs / risks
- Built reservations page cannot be reached from the UI (nav hidden) — dead surface until un-hidden. (VERIFIED.)
- Phase doc numbering (`migration_128_bookings_and_reservations`) is **consumed** — actual 128 is website drafts. Assign at build time from the register (`docs/HANDOFF.md` §6). (VERIFIED — `db/migration_128_website_draft_blocks_and_dec0016_status.sql`.)

### Test coverage
- `phase7-reservations.test.cjs` — registered, 46 orders-affected suite referenced in `docs/phase-4-progress.md`. (VERIFIED — registered.)

### Continue from here
1. **Un-hide navigation** (add the reservations entry in `org-nav-items.ts`) so the built page is usable — smallest high-value step, but an owner UI decision.
2. Add the scheduling schema (`booking_resources`/`availability_rules`/`time_slots`) and a conflict-prevention engine, then the public slot-picker widget.
3. Add confirmations (Resend) and `.ics` generation.
4. Renumber the planned migration via the register — do not use 128.

---

## ORIGINAL PLAN (kept below; superseded by the STATUS block above where they disagree)

## 1. Objective
Deliver an enterprise-grade appointment scheduling and reservation engine for service businesses, consultants, salons, and hospitality venues, fully integrated with tenant calendar availability and client notifications.

## 2. Scope
- Data schema for `booking_resources`, `availability_rules`, `time_slots`, and `reservations`.
- Public booking widget (`components/bookings/BookingWidget.tsx`) with timezone support.
- Tenant calendar dashboard view (`/dashboard/org/[id]/bookings`) with day/week/month timelines.
- Automated email/SMS confirmations and calendar invite (.ics) generation.

## 3. Out of Scope
- Two-way external Google Calendar OAuth sync (deferred to Phase 14).
- POS terminal table management (deferred to Phase 11).

## 4. Existing Dependencies
- Canonical tenant entity `organizers.id`.
- Services catalog (Phase 5).
- Resend transactional email integration.

## 5. Tasks
- [ ] Task 7.1: Author `db/migration_128_bookings_and_reservations.sql` (and rollback twin).
- [ ] Task 7.2: Build time-slot generation and conflict prevention engine in `lib/bookings.ts`.
- [ ] Task 7.3: Build public booking interface and deposit payment flow.
- [ ] Task 7.4: Build tenant calendar management interface.
- [ ] Task 7.5: Author automated tests in `lib/__tests__/bookings-engine.test.cjs` and append to `package.json`.

## 6. Acceptance Criteria
- [ ] Customers can select available time slots and book appointments without double-booking conflicts.
- [ ] Business managers can view and reschedule appointments from the calendar dashboard.
- [ ] All tests passing.

## 7. Current Status
**PARTIAL**

## 8. Completed Work
- Reservation request engine and related dashboard/public pages/actions/tests (see STATUS; previously verified).
- Rental handover flow implemented in code on `feat/rental-handover` with migration 233 applied to staging and targeted real-behavior tests added (see STATUS). Deposit settlement, late-fee returns and photos still need runtime verification.

## 9. Remaining Work
- Finish runtime QA for rental handover (deposit settlement, late fees, agreement PDF/email, permissions/RLS).
- Reservations: un-hide navigation (owner UI decision), scheduling schema/engine/slot-picker widget, confirmations and `.ics`.
- Tasks 7.1 through 7.5 as applicable (renumber migrations via register; do not use consumed numbers).

## 10. Known Issues
- Reservations dashboard page remains undiscoverable until navigation is un-hidden.
- Late fees cannot be marked collected (needs a new action, RPC and a new migration — **not 234**, which staging uses for the unified-template page-only change; take the next free number from `docs/HANDOFF.md` section 6 (currently 274)). Inspection photos work only in production and are untested.
- Planned migration numbers in this doc (e.g. 128) are consumed; use the register for assignment.

## 11. Verification Requirements
- `npm test` passes (compare against base for pre-existing unrelated failures).
- `npx tsc --noEmit` and `npx next build` succeed.
- Manual staging validation of handover flows, permissions/RLS, and mobile layout.

## 12. Next Step
Run runtime QA for rental handover, then continue reservations scheduling work per register-assigned migration numbers.
