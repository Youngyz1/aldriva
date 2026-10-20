# Phase 7: Bookings & Reservations

---

## STATUS (verified 2026-10-20)

A reservation **request engine** is built but hidden from navigation; the scheduling/calendar/SMS surface is not built. The phase doc previously read "PLANNED" — that was stale.

### Built
- `db/migration_176_reservations.sql` (+ rollback) creating `public.reservations`. (VERIFIED — file exists; `CREATE TABLE public.reservations` present.)
- Server actions `lib/actions/reservations.ts` — `submitReservationRequest` (+`WithClient`), `updateReservationStatus`, `cancelReservationByToken`, `saveReservationSettings`. (VERIFIED — lines 112, 123, 444, 459, 667, 674, 801, 816.)
- Dashboard `app/dashboard/org/[id]/reservations/page.tsx`; public token page `app/site/[slug]/reservations/[lookup_token]/page.tsx`. (VERIFIED — files exist.)
- Tests `lib/__tests__/phase7-reservations.test.cjs` (registered in `package.json`). (VERIFIED.)

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
**PLANNED**

## 8. Completed Work
- None.

## 9. Remaining Work
- Tasks 7.1 through 7.5.

## 10. Known Issues
- None.

## 11. Verification Requirements
- `npm test` passes 100%.

## 12. Next Step
Execute after Phase 6 completion.
