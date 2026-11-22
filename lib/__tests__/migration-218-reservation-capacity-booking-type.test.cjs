/**
 * Migration 218: source-level assertions that both capacity RPCs filter
 * booking_type = 'table' and skip the capacity check for non-table rows.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS_DIR = path.join(ROOT, "db");
const SUPABASE_MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");

const FWD = path.join(MIGRATIONS_DIR, "migration_218_reservation_capacity_booking_type_filter.sql");
const ROLLBACK = path.join(MIGRATIONS_DIR, "migration_218_reservation_capacity_booking_type_filter_rollback.sql");

// Find the supabase mirror (timestamp-prefixed copy of the forward file)
const supabaseEntries = fs.readdirSync(SUPABASE_MIGRATIONS_DIR).filter((f) =>
  f.includes("migration_218_reservation_capacity_booking_type_filter")
);
const MIRROR = path.join(SUPABASE_MIGRATIONS_DIR, supabaseEntries[0]);

const fwdContent = fs.readFileSync(FWD, "utf8");
const rollContent = fs.readFileSync(ROLLBACK, "utf8");
const mirrorContent = fs.readFileSync(MIRROR, "utf8");

test("migration 218: forward file exists", () => {
  assert.ok(fs.existsSync(FWD), "db forward migration 218 must exist");
});

test("migration 218: rollback file exists", () => {
  assert.ok(fs.existsSync(ROLLBACK), "db rollback migration 218 must exist");
});

test("migration 218: supabase mirror exists and is byte-identical to forward", () => {
  assert.ok(supabaseEntries.length === 1, "exactly one supabase mirror for migration 218");
  assert.equal(fwdContent, mirrorContent, "forward migration and supabase mirror must be byte-identical");
});

test("migration 218: confirm_reservation_with_capacity adds booking_type to initial SELECT", () => {
  const createIdx = fwdContent.indexOf("CREATE OR REPLACE FUNCTION public.confirm_reservation_with_capacity");
  const nextCreate = fwdContent.indexOf("CREATE OR REPLACE FUNCTION", createIdx + 1);
  const body = nextCreate === -1 ? fwdContent.slice(createIdx) : fwdContent.slice(createIdx, nextCreate);
  assert.ok(body.includes("status, status_history, booking_type"),
    "confirm_reservation_with_capacity must select booking_type");
});

test("migration 218: confirm_reservation_with_capacity skips capacity check for non-table rows", () => {
  const createIdx = fwdContent.indexOf("CREATE OR REPLACE FUNCTION public.confirm_reservation_with_capacity");
  const nextCreate = fwdContent.indexOf("CREATE OR REPLACE FUNCTION", createIdx + 1);
  const body = nextCreate === -1 ? fwdContent.slice(createIdx) : fwdContent.slice(createIdx, nextCreate);
  assert.ok(body.includes("v_seat_capacity IS NOT NULL AND v_res.booking_type = 'table'"),
    "confirm_reservation_with_capacity must skip capacity check when booking_type <> 'table'");
});

test("migration 218: confirm_reservation_with_capacity covers SUM filters booking_type = 'table'", () => {
  const createIdx = fwdContent.indexOf("CREATE OR REPLACE FUNCTION public.confirm_reservation_with_capacity");
  const nextCreate = fwdContent.indexOf("CREATE OR REPLACE FUNCTION", createIdx + 1);
  const body = nextCreate === -1 ? fwdContent.slice(createIdx) : fwdContent.slice(createIdx, nextCreate);
  assert.ok(body.includes("AND id <> v_res.id\n      AND booking_type = 'table'"),
    "confirm_reservation_with_capacity covers SUM must add AND booking_type = 'table'");
});

test("migration 218: approve_reservation_change_with_capacity skips capacity check for non-table rows", () => {
  const createIdx = fwdContent.indexOf("CREATE OR REPLACE FUNCTION public.approve_reservation_change_with_capacity");
  const body = fwdContent.slice(createIdx);
  assert.ok(body.includes("v_reservation.booking_type = 'table'"),
    "approve_reservation_change_with_capacity must skip capacity check when booking_type <> 'table'");
});

test("migration 218: approve_reservation_change_with_capacity covers SUM filters booking_type = 'table'", () => {
  const createIdx = fwdContent.indexOf("CREATE OR REPLACE FUNCTION public.approve_reservation_change_with_capacity");
  const body = fwdContent.slice(createIdx);
  assert.ok(body.includes("AND r.ends_at   > v_new_starts_at\n      AND r.booking_type = 'table'"),
    "approve_reservation_change_with_capacity covers SUM must add AND r.booking_type = 'table'");
});

test("migration 218: both functions are SECURITY DEFINER with pinned search_path", () => {
  const confirmCount = (fwdContent.match(/SECURITY DEFINER/g) || []).length;
  assert.equal(confirmCount, 2, "both functions must be SECURITY DEFINER");
  const searchPathCount = (fwdContent.match(/SET search_path = public, pg_temp/g) || []).length;
  assert.equal(searchPathCount, 2, "both functions must pin search_path");
});

test("migration 218: rollback restores original definitions (no booking_type filter)", () => {
  assert.ok(rollContent.includes("CREATE OR REPLACE FUNCTION public.confirm_reservation_with_capacity"),
    "rollback must restore confirm_reservation_with_capacity");
  assert.ok(rollContent.includes("CREATE OR REPLACE FUNCTION public.approve_reservation_change_with_capacity"),
    "rollback must restore approve_reservation_change_with_capacity");
  // Rollback should NOT contain the booking_type filter (it restores pre-218 behavior)
  const rollConfirmIdx = rollContent.indexOf("CREATE OR REPLACE FUNCTION public.confirm_reservation_with_capacity");
  const rollNextCreate = rollContent.indexOf("CREATE OR REPLACE FUNCTION", rollConfirmIdx + 1);
  const rollConfirmBody = rollNextCreate === -1 ? rollContent.slice(rollConfirmIdx) : rollContent.slice(rollConfirmIdx, rollNextCreate);
  assert.ok(!rollConfirmBody.includes("booking_type = 'table'"),
    "rollback confirm_reservation_with_capacity must not contain booking_type filter");
});

test("migration 218: header warns about migration 216 ordering", () => {
  assert.ok(fwdContent.includes("migration 216"),
    "migration 218 header must reference migration 216 ordering");
  assert.ok(fwdContent.includes("MUST be applied AFTER or merged into any revision of migration 216"),
    "migration 218 header must warn about migration 216 redefining the functions");
});
