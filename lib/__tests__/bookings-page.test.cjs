/**
 * lib/__tests__/bookings-page.test.cjs
 *
 * Source-level checks (no DB, no render) for the Bookings dashboard page and
 * its client components: organizer scoping, the booking_type='appointment'
 * discriminator, the off/on checklist-vs-list switch, and that no
 * table/party-size field leaks into the UI (that's Reservations' domain).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

test("bookings/page.tsx: queries reservations scoped by organizer_id AND booking_type='appointment'", () => {
  const src = read("app/dashboard/org/[id]/bookings/page.tsx");
  const start = src.indexOf('.from("reservations")');
  const end = src.indexOf(".limit(200)", start);
  const body = src.slice(start, end);
  assert.ok(body.includes('.eq("organizer_id", organizerId)'));
  assert.ok(body.includes('.eq("booking_type", "appointment")'), "must never read booking_type='table' rows");
});

test("bookings/page.tsx: never selects party_size (Reservations-only field)", () => {
  const src = read("app/dashboard/org/[id]/bookings/page.tsx");
  assert.ok(!src.includes("party_size"), "bookings must not surface the table-reservation party_size column");
});

test("bookings/page.tsx: tenant-role gated the same way as reservations/page.tsx (owner/admin/manager/editor/finance read, manage subset)", () => {
  const src = read("app/dashboard/org/[id]/bookings/page.tsx");
  assert.match(src, /ALLOWED_ROLES = \["owner", "admin", "manager", "editor", "finance"\]/);
  assert.match(src, /MANAGE_ROLES: EntityRole\[\] = \["owner", "admin", "manager"\]/);
  assert.match(src, /checkTenantAccess\(user\.id, organizerId,/);
});

test("bookings/page.tsx: never imports lib/actions/reservations.ts", () => {
  const src = read("app/dashboard/org/[id]/bookings/page.tsx");
  assert.ok(!src.includes("lib/actions/reservations"), "the bookings page must not import the restaurant reservations action file");
});

test("BookingsClient.tsx: shows the checklist when booking is off, the list when on", () => {
  const src = read("components/dashboard/bookings/BookingsClient.tsx");
  assert.match(src, /!enabled \? \(/, "checklist branch is gated on !enabled");
  assert.match(src, /checklistTitle/);
  assert.match(src, /bookings\.length === 0/, "empty state is distinct from the off-state checklist");
});

test("BookingsClient.tsx: the switch calls setBookingsEnabled from lib/actions/bookings, never reservations.ts", () => {
  const src = read("components/dashboard/bookings/BookingsClient.tsx");
  assert.match(src, /from "@\/lib\/actions\/bookings"/);
  assert.ok(!src.includes("lib/actions/reservations"), "must reuse the Bookings-domain action, not import reservations.ts directly");
  assert.match(src, /setBookingsEnabled\(organizerId, websiteId, next\)/);
});

test("BookingsClient.tsx: checklist has exactly the three required steps with the right completion signals", () => {
  const src = read("components/dashboard/bookings/BookingsClient.tsx");
  assert.match(src, /key: "turnOn", done: enabled/);
  assert.match(src, /key: "hours", done: hoursConfigured/);
  assert.match(src, /key: "services", done: hasActiveService/);
});

test("BookingCard.tsx: no party_size or table field, only service/time/status/contact fields", () => {
  const src = read("components/dashboard/bookings/BookingCard.tsx");
  assert.ok(!src.includes("party_size"), "BookingCard must not show party size");
  assert.ok(!/\btable\b/i.test(src.replace(/variable|variants/gi, "")), "BookingCard must not reference a restaurant table concept");
});

test("BookingCard.tsx: confirm/decline/cancel call lib/actions/bookings, never reservations.ts", () => {
  const src = read("components/dashboard/bookings/BookingCard.tsx");
  assert.match(src, /from "@\/lib\/actions\/bookings"/);
  assert.ok(!src.includes("lib/actions/reservations"));
  assert.match(src, /confirmBooking\(booking\.id, organizerId\)/);
  assert.match(src, /declineBooking\(booking\.id, organizerId,/);
  assert.match(src, /cancelBooking\(booking\.id, organizerId, booking\.status,/);
});

test("BookingCard.tsx: shows service duration for timed bookings and 'Time to be confirmed' for date_only", () => {
  const src = read("components/dashboard/bookings/BookingCard.tsx");
  assert.ok(src.includes("booking.duration_minutes"), "BookingCard surfaces the service duration");
  assert.ok(src.includes("booking.booking_mode === \"date_only\""), "BookingCard branches on booking_mode");
  assert.ok(src.includes('t("timeToBeConfirmed")'), "BookingCard shows Time to be confirmed for date_only");
});

test("test-files.json registers the bookings test files", () => {
  const list = JSON.parse(read("test-files.json"));
  for (const file of [
    "lib/__tests__/bookings-actions.test.cjs",
    "lib/__tests__/bookings-page.test.cjs",
  ]) {
    assert.ok(list.includes(file), `${file} must be registered`);
  }
});
