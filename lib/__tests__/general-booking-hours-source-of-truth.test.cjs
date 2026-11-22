/**
 * lib/__tests__/general-booking-hours-source-of-truth.test.cjs
 *
 * Pure, source-level tests for the booking-hours single source of truth fix.
 * PRODUCT RULE: hours come only from what the owner saved. Never invent
 * opening hours — a business with no saved hours has no bookable times.
 *
 * Both the public form (page.tsx reservation config) and the submit action
 * (lib/actions/general-booking.ts) call resolveBookingHours on the same
 * website_content.content.hours row, so the server never validates a
 * client-offered slot against a different hours object than the one used to
 * generate the slot picker. Zero DB, zero network.
 */

const assert = require("node:assert/strict");
const { test, describe } = require("node:test");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const fs = require("node:fs");

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

const { resolveBookingHours } = require("@/lib/website-content");
const {
  validateReservationStartsAt,
  getReservationSlotsForDate,
  zonedTimeToUtc,
} = require("@/lib/reservation-slots");

// Saved-hours shape: owner enters Mon-Fri 09:00-17:30 in the dashboard settings.
const savedHours = {
  mon: { open: "09:00", close: "17:30" },
  tue: { open: "09:00", close: "17:30" },
  wed: { open: "09:00", close: "17:30" },
  thu: { open: "09:00", close: "17:30" },
  fri: { open: "09:00", close: "17:30" },
};

const settings = {
  enabled: true,
  slot_minutes: 30,
  min_lead_minutes: 60,
  max_days_ahead: 30,
  default_stay_minutes: 60,
};
const NOW = new Date("2026-11-07T08:00:00Z"); // Saturday, far before test dates

function startsAtFor(dateYmd, slot, timeZone = "UTC") {
  const utc = zonedTimeToUtc(dateYmd, slot, timeZone);
  assert.ok(utc !== null, `zonedTimeToUtc must resolve ${dateYmd} ${slot} in ${timeZone}`);
  return new Date(utc).toISOString();
}

describe("general-booking hours source of truth", () => {
  test("resolveBookingHours returns null when no saved hours (never invents times)", () => {
    assert.equal(resolveBookingHours(undefined), null);
    assert.equal(resolveBookingHours(null), null);
    assert.equal(resolveBookingHours({}), null);
    // { mon: { closed: true } } IS valid saved hours (owner explicitly closed
    // that day) — it produces no bookable slots but is not "no hours saved".
    const closedOnly = resolveBookingHours({ mon: { closed: true } });
    assert.deepEqual(closedOnly, { mon: { closed: true } });
  });

  test("resolveBookingHours returns normalized saved hours when present and non-empty", () => {
    const resolved = resolveBookingHours(savedHours);
    assert.deepEqual(resolved.mon, { open: "09:00", close: "17:30" });
    assert.deepEqual(resolved.tue, { open: "09:00", close: "17:30" });
  });

  test("no saved hours: client offers no slots and server rejects every slot", () => {
    const dateYmd = "2026-11-18"; // Wednesday

    // Client side: with null hours the picker returns no slots.
    const clientSlots = getReservationSlotsForDate(dateYmd, null, settings, "UTC", NOW);
    assert.deepEqual(clientSlots, [], "client offers no slots when hours are not saved");

    // Server side: with null hours the validator rejects every slot.
    const payload = startsAtFor(dateYmd, "09:00", "UTC");
    const serverResult = validateReservationStartsAt(payload, null, settings, "UTC", NOW);
    assert.equal(serverResult.valid, false, "server rejects slot when hours are not saved");
    assert.equal(serverResult.error, "off_slot");
    assert.equal(serverResult.message, "Please choose one of the available time slots.");
  });

  test("saved hours: client and server agree (single source of truth)", () => {
    const dateYmd = "2026-11-18"; // Wednesday
    const slot = "10:30";

    const clientSlots = getReservationSlotsForDate(dateYmd, savedHours, settings, "UTC", NOW);
    assert.ok(clientSlots.includes(slot), `client offers ${slot}: ${JSON.stringify(clientSlots)}`);

    const payload = startsAtFor(dateYmd, slot, "UTC");
    const serverResult = validateReservationStartsAt(payload, savedHours, settings, "UTC", NOW);
    assert.equal(serverResult.valid, true, `server accepts client-offered slot: ${JSON.stringify(serverResult)}`);
  });

  test("slot before opening hours is rejected", () => {
    const dateYmd = "2026-11-18";
    const payload = startsAtFor(dateYmd, "08:00", "UTC"); // before 09:00 open
    const result = validateReservationStartsAt(payload, savedHours, settings, "UTC", NOW);
    assert.equal(result.valid, false);
    assert.equal(result.error, "outside_opening_hours");
  });

  test("slot after closing time is rejected", () => {
    const dateYmd = "2026-11-18";
    const payload = startsAtFor(dateYmd, "18:00", "UTC"); // at 18:00 close (exclusive)
    const result = validateReservationStartsAt(payload, savedHours, settings, "UTC", NOW);
    assert.equal(result.valid, false);
    assert.equal(result.error, "outside_opening_hours");
  });

  test("past slot (within lead time) is rejected", () => {
    const dateYmd = "2026-11-18";
    const payload = startsAtFor(dateYmd, "09:00", "UTC");
    const nowJustBefore = new Date("2026-11-18T08:05:00Z"); // 55 min before slot < 60 min lead
    const result = validateReservationStartsAt(payload, savedHours, settings, "UTC", nowJustBefore);
    assert.equal(result.valid, false);
    assert.equal(result.error, "lead_time_too_short");
  });

  test("slot beyond horizon is rejected", () => {
    const dateYmd = "2026-12-09"; // 32 days after 2026-11-07 > max_days_ahead 30
    const payload = startsAtFor(dateYmd, "09:00", "UTC");
    const result = validateReservationStartsAt(payload, savedHours, settings, "UTC", NOW);
    assert.equal(result.valid, false);
    assert.equal(result.error, "horizon_exceeded");
  });

  test("off-slot (not on the step grid) is rejected", () => {
    const dateYmd = "2026-11-18";
    const utc = zonedTimeToUtc(dateYmd, "10:35", "UTC"); // :35 not on :00/:30 grid
    assert.ok(utc !== null);
    const payload = new Date(utc).toISOString();
    const result = validateReservationStartsAt(payload, savedHours, settings, "UTC", NOW);
    assert.equal(result.valid, false);
    assert.equal(result.error, "off_slot");
    assert.equal(result.message, "Please choose one of the available time slots.");
  });

  test("default date skips closed days", () => {
    // Sunday 2026-11-08 has no saved hours -> closed -> no slots.
    const nowSunday = new Date("2026-11-08T10:00:00Z"); // Sunday in UTC
    const sunSlots = getReservationSlotsForDate("2026-11-08", savedHours, settings, "UTC", nowSunday);
    assert.deepEqual(sunSlots, [], "Sunday (not in saved hours) has no slots");

    // Monday 2026-11-09 is in saved hours -> has slots -> first available date.
    const monSlots = getReservationSlotsForDate("2026-11-09", savedHours, settings, "UTC", nowSunday);
    assert.ok(monSlots.length > 0, "Monday (in saved hours) has slots");
  });

  test("when hours exist but no slot falls in horizon, no-slots-in-horizon case applies", () => {
    const tightSettings = { ...settings, max_days_ahead: 0 }; // horizon = today only
    const now = new Date("2026-11-18T23:00:00Z"); // late on 2026-11-18 (Wednesday)
    const slots = getReservationSlotsForDate("2026-11-18", savedHours, tightSettings, "UTC", now);
    // 23:00 is after 17:30 close, and horizon is 0 days, so no future slots today.
    assert.deepEqual(slots, [], "no slots remain on the last horizon day after close");
  });
});
