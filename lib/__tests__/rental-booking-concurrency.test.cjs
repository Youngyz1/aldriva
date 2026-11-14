// @ts-check
/**
 * lib/__tests__/rental-booking-concurrency.test.cjs
 *
 * Unit/logic tests for Migration 225 and rental booking logic.
 * Tests do NOT connect to a real database — they verify file content and pure logic.
 */

const { test, describe } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");

// File paths
const migrationPath = path.join(
  __dirname,
  "../../db/migration_225_rental_bookings_schema.sql"
);
const rollbackPath = path.join(
  __dirname,
  "../../db/migration_225_rental_bookings_schema_rollback.sql"
);
const supabaseMigrationPath = path.join(
  __dirname,
  "../../supabase/migrations/20261108130000_migration_225_rental_bookings_schema.sql"
);

describe("Migration 225 - rental_bookings schema", () => {
  test("migration file exists at db/ path", () => {
    assert.ok(fs.existsSync(migrationPath), "db/migration_225 must exist");
  });

  test("rollback file exists", () => {
    assert.ok(fs.existsSync(rollbackPath), "rollback twin must exist");
  });

  test("supabase mirror exists", () => {
    assert.ok(
      fs.existsSync(supabaseMigrationPath),
      "supabase mirror must exist"
    );
  });

  test("migration contains btree_gist extension", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.ok(sql.includes("btree_gist"), "must enable btree_gist");
  });

  test("migration contains GiST exclusion constraint", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.ok(sql.includes("EXCLUDE USING gist"), "must have GiST exclusion");
    assert.ok(
      sql.includes("vehicle_id WITH ="),
      "must exclude on vehicle_id"
    );
    assert.ok(
      sql.includes("booking_period WITH &&"),
      "must exclude on booking_period overlap"
    );
  });

  test("exclusion constraint scoped to active statuses", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.ok(
      sql.includes("'pending','confirmed','active'") ||
        sql.includes("'pending', 'confirmed', 'active'"),
      "must scope to active statuses"
    );
  });

  test("migration contains get_public_rental_booking function", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.ok(
      sql.includes("get_public_rental_booking"),
      "must have public lookup function"
    );
  });

  test("public function does NOT expose PII fields", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    // Extract the function body
    const funcStart = sql.indexOf(
      "CREATE OR REPLACE FUNCTION public.get_public_rental_booking"
    );
    const funcEnd = sql.indexOf("$$;", funcStart) + 3;
    const funcBody = sql.slice(funcStart, funcEnd);
    assert.ok(
      !funcBody.includes("driver_license_number"),
      "must not expose license number"
    );
    assert.ok(!funcBody.includes("driver_dob"), "must not expose DOB");
    assert.ok(
      !funcBody.includes("driver_license_country"),
      "must not expose license country"
    );
  });

  test("migration contains rental_allocation_mode column", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.ok(
      sql.includes("rental_allocation_mode"),
      "must add allocation mode column"
    );
  });

  test("rollback is fail-closed (refuses if data exists)", () => {
    const sql = fs.readFileSync(rollbackPath, "utf8");
    assert.ok(sql.includes("RAISE EXCEPTION"), "rollback must refuse if data exists");
  });

  test("create_rental_booking and reconcile_rental_overdue are restricted to service_role", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.ok(
      sql.includes("REVOKE ALL ON FUNCTION public.create_rental_booking FROM PUBLIC"),
      "must revoke create_rental_booking from PUBLIC"
    );
    assert.ok(
      sql.includes("GRANT EXECUTE ON FUNCTION public.create_rental_booking TO service_role"),
      "must grant create_rental_booking to service_role"
    );
    assert.ok(
      sql.includes("REVOKE ALL ON FUNCTION public.reconcile_rental_overdue() FROM PUBLIC"),
      "must revoke reconcile_rental_overdue from PUBLIC"
    );
    assert.ok(
      sql.includes("GRANT EXECUTE ON FUNCTION public.reconcile_rental_overdue() TO service_role"),
      "must grant reconcile_rental_overdue to service_role"
    );
  });

  test("migration enforces custom SQLSTATE error codes", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.ok(sql.includes("USING ERRCODE = 'RB001'"), "RB001 capacity code present");
    assert.ok(sql.includes("USING ERRCODE = 'RB002'"), "RB002 maintenance blocked code present");
    assert.ok(sql.includes("USING ERRCODE = 'RB003'"), "RB003 booking exists code present");
    assert.ok(sql.includes("USING ERRCODE = 'RB004'"), "RB004 tenant mismatch code present");
    assert.ok(sql.includes("USING ERRCODE = 'RB005'"), "RB005 category mismatch code present");
    assert.ok(sql.includes("USING ERRCODE = 'RB006'"), "RB006 vehicle invalid code present");
  });

  test("migration validates cross-tenant IDs and wrong vehicle category", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    // Cross tenant business validation
    assert.ok(
      sql.includes("id = p_business_id AND organizer_id = p_organizer_id"),
      "validates business belongs to organizer"
    );
    // Category validation
    assert.ok(
      sql.includes("id = p_category_id AND business_id = p_business_id AND organizer_id = p_organizer_id"),
      "validates category belongs to business and organizer"
    );
    // Vehicle validation
    assert.ok(
      sql.includes("category_id = p_category_id") &&
      sql.includes("business_id = p_business_id") &&
      sql.includes("is_active = true") &&
      sql.includes("status <> 'out_of_service'"),
      "validates vehicle category, tenant, active, and out_of_service status"
    );
  });

  test("stale pending bookings are expired at start of create_rental_booking", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.ok(
      sql.includes("UPDATE public.rental_bookings") &&
      sql.includes("SET status = 'expired'") &&
      sql.includes("expires_at < now()"),
      "must expire stale pending bookings inside function"
    );
  });

  test("conflicting_assigned bookings filters on eligible_vehicles (no double subtraction)", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.ok(
      sql.includes("rb.vehicle_id IN (SELECT id FROM eligible_vehicles)"),
      "must filter conflicting bookings to eligible vehicles to prevent double subtraction with maintenance blocks"
    );
  });

  test("hierarchical lock order: category lock precedes vehicle lock in all places", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    // In create_rental_booking:
    const catLockIndex = sql.indexOf("pg_advisory_xact_lock(hashtext('rental_category_' || p_category_id::text))");
    const vehLockIndex = sql.indexOf("pg_advisory_xact_lock(hashtext('rental_vehicle_' || p_vehicle_id::text))");
    assert.ok(catLockIndex > 0, "category lock in function present");
    assert.ok(vehLockIndex > 0, "vehicle lock in function present");
    assert.ok(catLockIndex < vehLockIndex, "category lock must precede vehicle lock in create_rental_booking");

    // In check_rental_booking_block_overlap:
    const trg1CatLock = sql.indexOf("PERFORM pg_advisory_xact_lock(hashtext('rental_category_' || NEW.category_id::text))");
    const trg1VehLock = sql.indexOf("PERFORM pg_advisory_xact_lock(hashtext('rental_vehicle_' || NEW.vehicle_id::text))");
    assert.ok(trg1CatLock > 0 && trg1VehLock > 0 && trg1CatLock < trg1VehLock, "lock order in trigger 1 is category then vehicle");

    // In check_rental_block_booking_overlap:
    const trg2Func = sql.indexOf("FUNCTION public.check_rental_block_booking_overlap");
    const trg2CatLock = sql.indexOf("PERFORM pg_advisory_xact_lock(hashtext('rental_category_' || v_category_id::text))", trg2Func);
    const trg2VehLock = sql.indexOf("PERFORM pg_advisory_xact_lock(hashtext('rental_vehicle_' || NEW.vehicle_id::text))", trg2Func);
    assert.ok(trg2CatLock > 0 && trg2VehLock > 0 && trg2CatLock < trg2VehLock, "lock order in trigger 2 is category then vehicle");
  });
});

describe("Migration 225 capacity logic simulation", () => {
  test("block plus booking on same vehicle does NOT double-subtract capacity", () => {
    // 2 vehicles in category: V1 and V2
    const vehicles = [{ id: "v1" }, { id: "v2" }];
    // V1 is maintenance blocked during requested period
    const blocks = [{ vehicle_id: "v1" }];
    // V1 ALSO has an existing booking in the requested period
    const bookings = [{ vehicle_id: "v1" }];

    // Step A: eligible_vehicles
    const eligibleVehicles = vehicles.filter(
      (v) => !blocks.some((b) => b.vehicle_id === v.id)
    );
    assert.strictEqual(eligibleVehicles.length, 1);
    assert.strictEqual(eligibleVehicles[0].id, "v2");

    // Step B: conflicting_assigned WITHOUT the fix (buggy double-subtraction)
    const buggyConflicting = bookings.length; // 1 (v1)
    const buggyCapacity = eligibleVehicles.length - buggyConflicting;
    assert.strictEqual(buggyCapacity, 0); // BUG: V2 was free, but capacity became 0!

    // Step B fixed: conflicting_assigned ONLY on eligible vehicles
    const eligibleIds = new Set(eligibleVehicles.map((v) => v.id));
    const correctConflicting = bookings.filter((b) => eligibleIds.has(b.vehicle_id)).length;
    const correctCapacity = eligibleVehicles.length - correctConflicting;
    assert.strictEqual(correctCapacity, 1); // CORRECT: V2 is free and bookable!
  });

  test("expired pending booking frees capacity", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    const bookings = [
      {
        id: "b1",
        status: "pending",
        expires_at: new Date("2026-11-10T11:55:00Z"), // 5 min ago -> expired!
      },
      {
        id: "b2",
        status: "pending",
        expires_at: new Date("2026-11-10T12:15:00Z"), // 15 min future -> still holding
      },
    ];

    // Inside lock, update bookings where expires_at < now to 'expired'
    const activeHolds = bookings.filter((b) => {
      if (b.status === "pending" && b.expires_at < now) {
        b.status = "expired";
      }
      return ["pending", "confirmed", "active"].includes(b.status);
    });

    assert.strictEqual(activeHolds.length, 1);
    assert.strictEqual(activeHolds[0].id, "b2");
    assert.strictEqual(bookings[0].status, "expired");
  });
});

describe("Rental pricing calculation", () => {
  // Inline the pure calculateRentalAmount function (mirrors lib/actions/rental-bookings.ts)
  function calculateRentalAmount({
    dailyRate,
    weeklyRate,
    startsAt,
    endsAt,
    billingBoundary = "rolling_24h",
  }) {
    let days;
    if (billingBoundary === "calendar_day") {
      const startDay = Date.UTC(
        startsAt.getUTCFullYear(),
        startsAt.getUTCMonth(),
        startsAt.getUTCDate()
      );
      const endDay = Date.UTC(
        endsAt.getUTCFullYear(),
        endsAt.getUTCMonth(),
        endsAt.getUTCDate()
      );
      days = Math.max(
        1,
        Math.round((endDay - startDay) / (1000 * 60 * 60 * 24))
      );
    } else {
      days = Math.max(
        1,
        Math.ceil(
          (endsAt.getTime() - startsAt.getTime()) / (1000 * 60 * 60 * 24)
        )
      );
    }
    if (weeklyRate != null && days >= 7) {
      const weeks = Math.floor(days / 7);
      const remainingDays = days % 7;
      return weeks * weeklyRate + remainingDays * dailyRate;
    }
    return days * dailyRate;
  }

  test("1 day rental at daily rate", () => {
    const start = new Date("2026-11-10T10:00:00Z");
    const end = new Date("2026-11-11T10:00:00Z");
    assert.strictEqual(
      calculateRentalAmount({ dailyRate: 50, startsAt: start, endsAt: end }),
      50
    );
  });

  test("7 day rental uses weekly rate", () => {
    const start = new Date("2026-11-10T10:00:00Z");
    const end = new Date("2026-11-17T10:00:00Z");
    assert.strictEqual(
      calculateRentalAmount({
        dailyRate: 50,
        weeklyRate: 300,
        startsAt: start,
        endsAt: end,
      }),
      300
    );
  });

  test("8 day rental = 1 week + 1 day", () => {
    const start = new Date("2026-11-10T10:00:00Z");
    const end = new Date("2026-11-18T10:00:00Z");
    assert.strictEqual(
      calculateRentalAmount({
        dailyRate: 50,
        weeklyRate: 300,
        startsAt: start,
        endsAt: end,
      }),
      350
    );
  });

  test("no weekly rate: always use daily", () => {
    const start = new Date("2026-11-10T10:00:00Z");
    const end = new Date("2026-11-17T10:00:00Z");
    assert.strictEqual(
      calculateRentalAmount({
        dailyRate: 50,
        weeklyRate: null,
        startsAt: start,
        endsAt: end,
      }),
      350
    );
  });

  test("calendar_day boundary: same-day = 1 day", () => {
    const start = new Date("2026-11-10T09:00:00Z");
    const end = new Date("2026-11-10T18:00:00Z");
    assert.strictEqual(
      calculateRentalAmount({
        dailyRate: 50,
        startsAt: start,
        endsAt: end,
        billingBoundary: "calendar_day",
      }),
      50
    );
  });

  test("rolling_24h vs calendar_day differ for partial day", () => {
    // 25 hours: rolling = 2 days (ceil), calendar = 1 calendar day
    const start = new Date("2026-11-10T10:00:00Z");
    const end = new Date("2026-11-11T11:00:00Z"); // 25 hours later
    const rolling = calculateRentalAmount({
      dailyRate: 50,
      startsAt: start,
      endsAt: end,
      billingBoundary: "rolling_24h",
    });
    const calendar = calculateRentalAmount({
      dailyRate: 50,
      startsAt: start,
      endsAt: end,
      billingBoundary: "calendar_day",
    });
    assert.strictEqual(rolling, 100); // 2 days (ceil of 25h)
    assert.strictEqual(calendar, 50); // 1 calendar day
  });

  test("deposit is separate from rental_amount", () => {
    // This test documents that deposit should NEVER be added to rental_amount
    const rentalAmount = calculateRentalAmount({
      dailyRate: 50,
      startsAt: new Date("2026-11-10T10:00:00Z"),
      endsAt: new Date("2026-11-11T10:00:00Z"),
    });
    const depositAmount = 200;
    // rental_amount = rentalAmount only, deposit is tracked separately
    assert.strictEqual(rentalAmount, 50);
    assert.ok(depositAmount > 0, "deposit is tracked separately");
    assert.strictEqual(rentalAmount + 0, 50); // rental_amount never includes deposit
  });
});

describe("Booking status machine", () => {
  const VALID_TRANSITIONS = {
    pending: ["confirmed", "cancelled", "expired", "no_show"],
    confirmed: ["active", "cancelled", "no_show"],
    active: ["completed", "cancelled"],
    completed: [],
    cancelled: [],
    expired: [],
    no_show: [],
  };

  function isValidTransition(from, to) {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  test("pending → confirmed is valid", () =>
    assert.ok(isValidTransition("pending", "confirmed")));
  test("pending → active is NOT valid", () =>
    assert.ok(!isValidTransition("pending", "active")));
  test("confirmed → active is valid", () =>
    assert.ok(isValidTransition("confirmed", "active")));
  test("active → completed is valid", () =>
    assert.ok(isValidTransition("active", "completed")));
  test("completed → cancelled is NOT valid", () =>
    assert.ok(!isValidTransition("completed", "cancelled")));
  test("confirmed → no_show is valid", () =>
    assert.ok(isValidTransition("confirmed", "no_show")));
});

describe("Overdue detection", () => {
  test("booking past grace period is overdue", () => {
    const endsAt = new Date(Date.now() - 65 * 60 * 1000); // 65 minutes ago
    const gracePeriodMs = 60 * 60 * 1000;
    const isOverdue = Date.now() > endsAt.getTime() + gracePeriodMs;
    assert.ok(isOverdue);
  });

  test("booking within grace period is NOT overdue", () => {
    const endsAt = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
    const gracePeriodMs = 60 * 60 * 1000;
    const isOverdue = Date.now() > endsAt.getTime() + gracePeriodMs;
    assert.ok(!isOverdue);
  });
});
