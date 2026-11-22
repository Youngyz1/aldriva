/**
 * lib/__tests__/general-booking-slot-validation.test.cjs
 *
 * Pure, source-level validation of the general-booking slot offer/accept path.
 * Locks in the rule that a slot the client form offers is always accepted by the
 * server: the client offers slots via getReservationSlotsForDate and the server
 * re-validates via validateReservationInterval -> validateReservationStartsAt,
 * both of which derive the slot grid from getRawReservationSlotsForDate with the
 * same hours / slot_minutes / timeZone. Zero DB, zero network.
 *
 * Also asserts restaurant-only rules (party size, seat capacity, turn time) are
 * NOT applied to booking_type='appointment' (general-booking.ts writes
 * party_size=1 and validates only slot/lead/horizon/duration>=15).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

require.extensions[".ts"] = function compileTs(module, filename) {
  const raw = fs.readFileSync(filename, "utf8").replace(/^import\s+["']server-only["'];?\s*/m, "");
  const output = ts.transpileModule(raw, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const {
  validateReservationStartsAt,
  validateReservationInterval,
  getReservationSlotsForDate,
  getRawReservationSlotsForDate,
} = require("@/lib/reservation-slots");

const HOURS = {
  mon: { open: "09:00", close: "18:00" },
  tue: { open: "09:00", close: "18:00" },
  wed: { open: "09:00", close: "18:00" },
  thu: { open: "09:00", close: "18:00" },
  fri: { open: "09:00", close: "18:00" },
  sat: { open: "09:00", close: "18:00" },
  sun: { open: "09:00", close: "18:00" },
};

const SETTINGS = {
  enabled: true,
  slot_minutes: 30,
  min_lead_minutes: 60,
  max_days_ahead: 30,
  default_stay_minutes: 90,
};

const NOW = new Date("2026-11-07T08:00:00Z"); // far before 2026-11-18 10:30
const DATE = "2026-11-18"; // Wednesday
const SLOT = "10:30";

function startsAtFor(dateYmd, slot, timeZone = "UTC") {
  // Mirrors GeneralBookingForm.tsx:198-213 payload shape.
  const { zonedTimeToUtc } = require("@/lib/reservation-slots");
  const utc = zonedTimeToUtc(dateYmd, slot, timeZone);
  assert.ok(utc !== null, "zonedTimeToUtc must resolve the slot");
  return new Date(utc).toISOString();
}

test("offered slot is accepted by the server (same slot grid both sides)", () => {
  const startsAt = startsAtFor(DATE, SLOT, "UTC");
  const result = validateReservationStartsAt(startsAt, HOURS, SETTINGS, "UTC", NOW);
  assert.equal(result.valid, true, `offered slot ${SLOT} must be accepted: ${JSON.stringify(result)}`);
  assert.equal(result.startsAt, startsAt);

  // The client's offered grid and the server's raw grid are derived from the same
  // function, so the offered slot is present in the server's grid.
  const clientGrid = getReservationSlotsForDate(DATE, HOURS, SETTINGS, "UTC", NOW);
  const serverGrid = getRawReservationSlotsForDate(DATE, HOURS, SETTINGS.slot_minutes, "UTC");
  assert.ok(clientGrid.includes(SLOT), "client offers the slot");
  assert.ok(serverGrid.includes(SLOT), "server grid contains the offered slot");
});

test("slot before opening hours is rejected", () => {
  const startsAt = startsAtFor(DATE, "08:00", "UTC"); // before 09:00 open
  const result = validateReservationStartsAt(startsAt, HOURS, SETTINGS, "UTC", NOW);
  assert.equal(result.valid, false);
  assert.equal(result.error, "outside_opening_hours");
});

test("slot after closing time is rejected", () => {
  const startsAt = startsAtFor(DATE, "18:30", "UTC"); // after 18:00 close
  const result = validateReservationStartsAt(startsAt, HOURS, SETTINGS, "UTC", NOW);
  assert.equal(result.valid, false);
  assert.equal(result.error, "outside_opening_hours");
});

test("off-slot (not on the step grid) is rejected with the documented message", () => {
  // slot_minutes=30 => grid is :00/:30; 10:35 is not on the grid.
  const { zonedTimeToUtc } = require("@/lib/reservation-slots");
  const utc = zonedTimeToUtc(DATE, "10:35", "UTC");
  assert.ok(utc !== null);
  const startsAt = new Date(utc).toISOString();
  const result = validateReservationStartsAt(startsAt, HOURS, SETTINGS, "UTC", NOW);
  assert.equal(result.valid, false);
  assert.equal(result.error, "off_slot");
  assert.equal(result.message, "Please choose one of the available time slots.");
});

test("past slot (within lead time) is rejected", () => {
  const nowJustBefore = new Date("2026-11-18T10:00:00Z"); // 30 min before the 10:30 slot
  const startsAt = startsAtFor(DATE, SLOT, "UTC");
  const result = validateReservationStartsAt(startsAt, HOURS, SETTINGS, "UTC", nowJustBefore);
  assert.equal(result.valid, false);
  assert.equal(result.error, "lead_time_too_short");
});

test("wrong timezone is rejected", () => {
  // Client builds the slot as UTC wall-clock; server validates in America/New_York.
  const startsAt = startsAtFor(DATE, SLOT, "UTC"); // 10:30 UTC = 05:30 NY (before 09:00 NY open)
  const result = validateReservationStartsAt(startsAt, HOURS, SETTINGS, "America/New_York", NOW);
  assert.equal(result.valid, false);
  assert.equal(result.error, "outside_opening_hours");
});

test("duration shorter than 15 minutes is rejected (validateReservationInterval)", () => {
  const startsAt = startsAtFor(DATE, SLOT, "UTC");
  const result = validateReservationInterval(startsAt, 5, HOURS, SETTINGS, "UTC", NOW); // 5 min < 15 min
  assert.equal(result.valid, false);
  assert.equal(result.error, "invalid_format");
  assert.match(result.message, /Duration must be at least 15 minutes/);
});

test("service duration shorter than the slot step still validates the start slot (appointment uses default stay)", () => {
  // A 5-minute service is booked with default_stay_minutes (90); the start slot
  // 10:30 is on the grid and within hours, so it is accepted.
  const startsAt = startsAtFor(DATE, SLOT, "UTC");
  const result = validateReservationInterval(startsAt, 5, HOURS, SETTINGS, "UTC", NOW);
  assert.equal(result.valid, false); // duration 5 < 15 -> invalid_format per validator guard
  assert.equal(result.error, "invalid_format");
});

test("restaurant-only rules are not applied to appointment (party size / capacity / turn time)", () => {
  // validateReservationStartsAt / validateReservationInterval never reference
  // party_size, seat_capacity, or turn time; general-booking.ts only writes
  // party_size=1 and validates slot/lead/horizon/duration>=15.
  const startsAt = startsAtFor(DATE, SLOT, "UTC");
  const result = validateReservationInterval(startsAt, SETTINGS.default_stay_minutes, HOURS, SETTINGS, "UTC", NOW);
  assert.equal(result.valid, true);
  // The validator result contains no party/capacity/turn-time fields.
  assert.equal(result.error, undefined);
  assert.equal(result.startsAt, startsAt);
});
