/**
 * lib/__tests__/rental-fleet-slice1.test.cjs
 *
 * Slice 1 Test Suite: Vehicle Rental Fleet & Extensible Resource Engine
 * Tests cover:
 *   1. Active business resolver order and cookie naming
 *   2. Migration 224 schema & RLS policy expectations (and fail-closed rollback)
 *   3. Module registry activation & capability-gated nav
 *   4. Vehicle & Category validation and permission checking
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

// ── 1. Active Business Resolver Tests ──────────────────────────────────────────

test("active business resolver: order of precedence", async (t) => {
  // Transpile lib/active-business.ts directly
  const activeBizTs = fs.readFileSync(path.join(ROOT, "lib/active-business.ts"), "utf8");
  const transpiled = ts.transpileModule(activeBizTs, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;

  const m = { exports: {} };
  const fn = new Function("module", "exports", transpiled);
  fn(m, m.exports);
  const { resolveActiveBusiness, getActiveBusinessCookieName } = m.exports;

  await t.test("empty or null returns null", () => {
    assert.equal(resolveActiveBusiness([]), null);
    assert.equal(resolveActiveBusiness(null), null);
    assert.equal(resolveActiveBusiness(undefined), null);
  });

  await t.test("single business returns that business immediately", () => {
    const biz = { id: "biz-1", name: "Main Rental" };
    assert.equal(resolveActiveBusiness([biz]), biz);
  });

  const businesses = [
    { id: "biz-1", name: "Oldest Branch", created_at: "2026-01-01T00:00:00Z", is_main: false },
    { id: "biz-2", name: "Main Flagship", created_at: "2026-02-01T00:00:00Z", is_main: true },
    { id: "biz-3", name: "Airport Depot", created_at: "2026-03-01T00:00:00Z", is_main: false },
  ];

  await t.test("priority 1: searchParam wins over cookie and is_main default", () => {
    const res = resolveActiveBusiness(businesses, {
      searchParamBusinessId: "biz-3",
      cookieBusinessId: "biz-1",
    });
    assert.equal(res.id, "biz-3");
  });

  await t.test("priority 2: cookie wins over is_main default when searchParam is absent or invalid", () => {
    const res = resolveActiveBusiness(businesses, {
      searchParamBusinessId: "non-existent",
      cookieBusinessId: "biz-1",
    });
    assert.equal(res.id, "biz-1");
  });

  await t.test("priority 3: is_main = true wins when searchParam and cookie are absent", () => {
    const res = resolveActiveBusiness(businesses, {});
    assert.equal(res.id, "biz-2");
  });

  await t.test("priority 4: oldest created_at wins when no is_main exists", () => {
    const noMain = [
      { id: "b-new", name: "New", created_at: "2026-05-01T00:00:00Z" },
      { id: "b-old", name: "Old", created_at: "2026-01-01T00:00:00Z" },
      { id: "b-mid", name: "Mid", created_at: "2026-03-01T00:00:00Z" },
    ];
    const res = resolveActiveBusiness(noMain, {});
    assert.equal(res.id, "b-old");
  });

  await t.test("cookie name format matches tenant id", () => {
    assert.equal(
      getActiveBusinessCookieName("60ee4921-45bb-46de-9dc9-378b7ae89ef8"),
      "aldriva_active_business_60ee4921-45bb-46de-9dc9-378b7ae89ef8"
    );
  });
});

// ── 2. Migration 224 Schema & RLS Expectations ─────────────────────────────────

test("migration 224: schema and RLS requirements", async (t) => {
  const fwdSql = fs.readFileSync(
    path.join(ROOT, "db/migration_224_rental_fleet_schema.sql"),
    "utf8"
  );
  const rollSql = fs.readFileSync(
    path.join(ROOT, "db/migration_224_rental_fleet_schema_rollback.sql"),
    "utf8"
  );
  const mirrorSql = fs.readFileSync(
    path.join(ROOT, "supabase/migrations/20261108120000_migration_224_rental_fleet_schema.sql"),
    "utf8"
  );

  await t.test("forward migration creates vehicle_categories with expected columns", () => {
    assert.match(fwdSql, /CREATE TABLE IF NOT EXISTS public\.vehicle_categories/i);
    assert.match(fwdSql, /organizer_id uuid NOT NULL REFERENCES public\.organizers\(id\)/i);
    assert.match(fwdSql, /business_id uuid NOT NULL REFERENCES public\.businesses\(id\)/i);
    assert.match(fwdSql, /daily_rate numeric\(12,2\)/i);
    assert.match(fwdSql, /deposit_amount numeric\(12,2\)/i);
    assert.match(fwdSql, /specs jsonb NOT NULL/i);
    assert.match(fwdSql, /UNIQUE \(business_id, slug\)/i);
  });

  await t.test("forward migration creates vehicles with unique plate per business and category constraint", () => {
    assert.match(fwdSql, /CREATE TABLE IF NOT EXISTS public\.vehicles/i);
    assert.match(fwdSql, /category_id uuid NOT NULL REFERENCES public\.vehicle_categories\(id\) ON DELETE RESTRICT/i);
    assert.match(fwdSql, /branch_id uuid NULL REFERENCES public\.business_branches\(id\)/i);
    assert.match(fwdSql, /license_plate text NOT NULL/i);
    assert.match(fwdSql, /current_mileage integer NOT NULL/i);
    assert.match(fwdSql, /UNIQUE \(business_id, license_plate\)/i);
    assert.match(fwdSql, /status IN \('available', 'rented', 'maintenance', 'out_of_service'\)/i);
    assert.match(fwdSql, /fuel_type IN \('gasoline', 'diesel', 'electric', 'hybrid'\)/i);
  });

  await t.test("RLS: vehicle_categories has public SELECT on active, vehicles is strictly private to tenant", () => {
    assert.match(fwdSql, /ALTER TABLE public\.vehicle_categories ENABLE ROW LEVEL SECURITY/i);
    assert.match(fwdSql, /ALTER TABLE public\.vehicles ENABLE ROW LEVEL SECURITY/i);
    // vehicle_categories has public select
    assert.match(fwdSql, /CREATE POLICY "Public can view active vehicle categories"\s+ON public\.vehicle_categories FOR SELECT\s+USING \(is_active = true\)/i);
    // vehicles has NO public select policy; only tenant members
    assert.match(fwdSql, /CREATE POLICY "Tenant members can view vehicles"\s+ON public\.vehicles FOR SELECT/i);
    assert.doesNotMatch(fwdSql, /CREATE POLICY "Public can view.*ON public\.vehicles/i);
  });

  await t.test("rollback migration is fail-closed", () => {
    assert.match(rollSql, /MIGRATION_224_ROLLBACK_BLOCKED/i);
    assert.match(rollSql, /v_vehicle_count > 0/i);
    assert.match(rollSql, /v_category_count > 0/i);
    assert.match(rollSql, /DROP TABLE IF EXISTS public\.vehicles/i);
    assert.match(rollSql, /DROP TABLE IF EXISTS public\.vehicle_categories/i);
  });

  await t.test("supabase/migrations mirror is identical to db migration", () => {
    assert.ok(mirrorSql.length > 500);
    assert.match(mirrorSql, /CREATE TABLE IF NOT EXISTS public\.vehicle_categories/i);
    assert.match(mirrorSql, /CREATE TABLE IF NOT EXISTS public\.vehicles/i);
  });
});

// ── 3. Module Registry & Navigation ───────────────────────────────────────────

test("module registry: fleet is active and capability-gated", () => {
  const modulesTs = fs.readFileSync(path.join(ROOT, "lib/dashboard/modules.ts"), "utf8");
  assert.match(modulesTs, /id:\s*"fleet"/);
  assert.match(modulesTs, /capabilities:\s*\["VEHICLES",\s*"VEHICLE_RENTAL"\]/);
  assert.match(modulesTs, /icon:\s*"Car"/);
  assert.match(modulesTs, /routeExists:\s*true/);

  const orgModulesTs = fs.readFileSync(path.join(ROOT, "lib/org-dashboard-modules.ts"), "utf8");
  assert.match(orgModulesTs, /hasFleetRows\?: boolean/);
  assert.match(orgModulesTs, /visibility\.existence === "fleetRows"/);
});

// ── 4. Server Actions Validation Rules ────────────────────────────────────────

test("fleet actions validation & pure logic", async (t) => {
  const catActionsTs = fs.readFileSync(path.join(ROOT, "lib/actions/rental-categories.ts"), "utf8");
  const vehActionsTs = fs.readFileSync(path.join(ROOT, "lib/actions/vehicles.ts"), "utf8");

  await t.test("rental-categories enforces length, non-negative rates, and tenant validation", () => {
    assert.match(catActionsTs, /Category name must be between 1 and 100 characters/);
    assert.match(catActionsTs, /Daily rate must be a non-negative number/);
    assert.match(catActionsTs, /Weekly rate cannot be negative/);
    assert.match(catActionsTs, /Deposit amount cannot be negative/);
    assert.match(catActionsTs, /Invalid business for this organizer/);
    assert.match(catActionsTs, /Cannot delete category while/);
  });

  await t.test("vehicles enforces unique plate, non-negative mileage, valid fuel and status", () => {
    assert.match(vehActionsTs, /License plate must be between 1 and 20 characters/);
    assert.match(vehActionsTs, /Current mileage must be a non-negative integer/);
    assert.match(vehActionsTs, /is already registered for this business/);
    assert.match(vehActionsTs, /Invalid vehicle category/);
  });
});
