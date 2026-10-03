# Phase 7: Bookings & Reservations

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
