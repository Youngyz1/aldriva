/**
 * lib/__tests__/event-staff-badges-schema.test.cjs
 *
 * STAFF ROUND Phase A, step A1: static pins for migration 164
 * (event staff labels, badge tokens, staff check-in audit).
 *
 * - Forward + rollback twins exist in db/, the supabase mirror exists and
 *   is byte-identical, no rollback lives in supabase/migrations.
 * - Forward carries every required element: invitation labels, member
 *   labels + badge columns, the append-only event_staff_checkins table with
 *   NO uniqueness (decision 3: every scan is a row), the online-only pin
 *   (decision 4), RLS + service-role secrecy for badge tokens.
 * - Pending invitations never yield a badge: no badge_* column on
 *   event_team_invitations.
 * - Isolation (decision 1): the migration never mentions check_in_ticket,
 *   ticket_instances, ticket_checkins, offline_scan_conflicts, or offline
 *   scanner objects. Byte-identity of those app files is proven by the
 *   git-diff check in the A1 report (protected paths must show no diff).
 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const FORWARD = path.join(ROOT, "db/migration_164_event_staff_labels_badges.sql");
const ROLLBACK = path.join(ROOT, "db/migration_164_event_staff_labels_badges_rollback.sql");
const MIRROR = path.join(
  ROOT,
  "supabase/migrations/20261010000000_migration_164_event_staff_labels_badges.sql"
);

describe("migration 164 files exist", () => {
  test("forward, rollback twin and supabase mirror are all present", () => {
    assert.ok(fs.existsSync(FORWARD), "db/migration_164_event_staff_labels_badges.sql must exist");
    assert.ok(fs.existsSync(ROLLBACK), "db/migration_164_event_staff_labels_badges_rollback.sql must exist");
    assert.ok(fs.existsSync(MIRROR), "supabase mirror must exist");
  });

  test("mirror is byte-identical to the canonical forward file", () => {
    assert.equal(
      fs.readFileSync(MIRROR, "utf8"),
      fs.readFileSync(FORWARD, "utf8"),
      "mirror must match db/ exactly"
    );
  });

  test("no rollback file lives in supabase/migrations", () => {
    const dir = fs.readdirSync(path.join(ROOT, "supabase/migrations"));
    assert.ok(
      !dir.some((f) => f.includes("164") && f.includes("rollback")),
      "rollbacks never go in supabase/migrations"
    );
  });
});

describe("migration 164 invitation labels", () => {
  const sql = () => fs.readFileSync(FORWARD, "utf8");

  test("invitations gain role_label, position_label, staff_name (nullable text)", () => {
    const s = sql();
    assert.ok(s.includes("ALTER TABLE event_team_invitations ADD COLUMN IF NOT EXISTS role_label TEXT"));
    assert.ok(s.includes("ALTER TABLE event_team_invitations ADD COLUMN IF NOT EXISTS position_label TEXT"));
    assert.ok(s.includes("ALTER TABLE event_team_invitations ADD COLUMN IF NOT EXISTS staff_name TEXT"));
  });

  test("invitation label lengths are bounded (free text, not free-for-all)", () => {
    const s = sql();
    assert.ok(s.includes("event_team_invitations_role_label_len"));
    assert.ok(s.includes("event_team_invitations_position_label_len"));
    assert.ok(s.includes("event_team_invitations_staff_name_len"));
  });

  test("pending invitations never yield a badge: no badge column on invitations", () => {
    const s = sql();
    assert.ok(!s.includes("event_team_invitations ADD COLUMN IF NOT EXISTS badge_token"), "no badge_token on invitations");
    assert.ok(!s.includes("event_team_invitations ADD COLUMN IF NOT EXISTS badge_status"), "no badge_status on invitations");
  });
});

describe("migration 164 member labels + badge", () => {
  const sql = () => fs.readFileSync(FORWARD, "utf8");

  test("members gain labels, staff_name, and badge lifecycle columns", () => {
    const s = sql();
    for (const col of [
      "ADD COLUMN IF NOT EXISTS role_label TEXT",
      "ADD COLUMN IF NOT EXISTS position_label TEXT",
      "ADD COLUMN IF NOT EXISTS staff_name TEXT",
      "ADD COLUMN IF NOT EXISTS badge_token TEXT",
      "ADD COLUMN IF NOT EXISTS badge_status TEXT NOT NULL DEFAULT 'active'",
      "ADD COLUMN IF NOT EXISTS badge_issued_at TIMESTAMPTZ",
      "ADD COLUMN IF NOT EXISTS badge_revoked_at TIMESTAMPTZ",
    ]) {
      assert.ok(s.includes(`ALTER TABLE event_team_members ${col}`), col);
    }
  });

  test("badge_status allows exactly active + revoked (revoke/reissue lifecycle)", () => {
    const s = sql();
    assert.ok(s.includes("event_team_members_badge_status_check"));
    assert.ok(s.includes("CHECK (badge_status IN ('active', 'revoked'))"));
  });

  test("badge tokens are unique via re-runnable unique index (NULLs never conflict)", () => {
    const s = sql();
    assert.ok(s.includes("CREATE UNIQUE INDEX IF NOT EXISTS idx_event_team_members_badge_token"));
    assert.ok(s.includes("ON event_team_members(badge_token)"));
  });

  test("badge_token hidden from anon/authenticated (service-role secret, migration_76 precedent)", () => {
    const s = sql();
    assert.ok(s.includes("REVOKE SELECT (badge_token) ON event_team_members FROM anon, authenticated"));
    assert.ok(s.includes("REVOKE SELECT (badge_token) ON event_staff_checkins FROM anon, authenticated"));
  });

  test("permission level untouched: labels never widen the role CHECK", () => {
    const s = sql();
    assert.ok(!s.includes("role IN ("), "no role CHECK rewrite; authz stays on the existing enum");
  });
});

describe("migration 164 staff check-ins table", () => {
  const sql = () => fs.readFileSync(FORWARD, "utf8");

  test("event_staff_checkins created with attribution columns for self-scan block + rate limiting", () => {
    const s = sql();
    assert.ok(s.includes("CREATE TABLE IF NOT EXISTS event_staff_checkins ("));
    for (const col of [
      "event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE",
      "staff_member_id UUID NOT NULL REFERENCES event_team_members(id) ON DELETE CASCADE",
      "badge_token TEXT NOT NULL",
      "scanned_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL",
      "entrance_id UUID",
      "device_id TEXT",
      "scan_source TEXT NOT NULL DEFAULT 'online'",
      "scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()",
    ]) {
      assert.ok(s.includes(col), col);
    }
  });

  test("no uniqueness on check-ins: every scan is a row (decision 3)", () => {
    const s = sql();
    const tableBody = s.slice(s.indexOf("CREATE TABLE IF NOT EXISTS event_staff_checkins ("), s.indexOf(";", s.indexOf("CREATE TABLE IF NOT EXISTS event_staff_checkins (")));
    assert.ok(!tableBody.includes("UNIQUE"), "no UNIQUE inside the table body besides nothing");
    const afterTable = s.slice(s.indexOf("CREATE TABLE IF NOT EXISTS event_staff_checkins ("));
    assert.ok(!afterTable.includes("UNIQUE INDEX") || afterTable.includes("idx_event_team_members_badge_token"), "no unique index for check-ins (member badge index is the only UNIQUE INDEX)");
    assert.ok(!s.includes("ON CONFLICT"), "no upsert/dedupe smuggled in");
  });

  test("online-only pin: scan_source CHECK locked to 'online' (decision 4)", () => {
    const s = sql();
    assert.ok(s.includes("event_staff_checkins_source_online_check"));
    assert.ok(s.includes("CHECK (scan_source = 'online')"));
  });

  test("indexes cover first/latest-per-person reads + scanner/device counting windows", () => {
    const s = sql();
    for (const idx of [
      "idx_event_staff_checkins_event_id",
      "idx_event_staff_checkins_event_time",
      "idx_event_staff_checkins_member_time",
      "idx_event_staff_checkins_scanner",
      "idx_event_staff_checkins_device_time",
    ]) {
      assert.ok(s.includes(idx), idx);
    }
  });

  test("RLS enabled with viewer policy (incl. self branch) + manager-only writes", () => {
    const s = sql();
    assert.ok(s.includes("ALTER TABLE event_staff_checkins ENABLE ROW LEVEL SECURITY"));
    assert.ok(s.includes('"Users can view relevant staff checkins" ON event_staff_checkins'));
    assert.ok(s.includes('"Organizers manage staff checkins" ON event_staff_checkins'));
    assert.ok(s.includes("m.id = event_staff_checkins.staff_member_id"), "self branch: staff read own history");
    assert.ok(s.includes("is_event_team_member(event_id, ARRAY['event_manager'])"), "manager gate mirrored");
    assert.ok(s.includes("is_entity_member(events.organizer_id, ARRAY['owner','admin','manager'])"), "entity gate mirrored");
  });

  test("wrapped in a transaction with schema reload", () => {
    const s = sql();
    assert.ok(s.includes("\nBEGIN;"));
    assert.ok(s.includes("COMMIT;"));
    assert.ok(s.includes("NOTIFY pgrst, 'reload schema';"));
  });
});

describe("migration 164 isolation (decision 1)", () => {
  // Strip `--` comment lines: the header documents what is NOT touched,
  // so only executable SQL counts for the isolation pin.
  const code = () =>
    fs
      .readFileSync(FORWARD, "utf8")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n")
      .toLowerCase();

  test("never touches the guest check-in RPC or ticket tables", () => {
    const s = code();
    for (const forbidden of ["check_in_ticket", "ticket_instances", "ticket_checkins", "ticket_orders"]) {
      assert.ok(!s.includes(forbidden), `must not mention ${forbidden}`);
    }
  });

  test("never touches offline scanner objects", () => {
    const s = code();
    for (const forbidden of ["offline_scan_conflicts", "offline_scan_id", "scanner_cache", "scan_queue", "delegating"]) {
      assert.ok(!s.includes(forbidden), `must not mention ${forbidden}`);
    }
  });
});

describe("migration 164 rollback content", () => {
  const sql = () => fs.readFileSync(ROLLBACK, "utf8");

  test("aborts while staff check-in rows remain (audit is never dropped silently)", () => {
    const s = sql();
    assert.ok(s.includes("FROM public.event_staff_checkins"), "guard reads the audit table");
    assert.ok(s.includes("RAISE EXCEPTION"), "abort is loud");
    assert.ok(s.includes("ROLLBACK_ABORTED"), "machine-readable reason");
  });

  test("reverses in reverse order with re-runnable guards", () => {
    const s = sql();
    const order = [
      '"Organizers manage staff checkins" ON public.event_staff_checkins',
      '"Users can view relevant staff checkins" ON public.event_staff_checkins',
      "DROP TABLE IF EXISTS public.event_staff_checkins",
      "DROP INDEX IF EXISTS public.idx_event_team_members_badge_token",
      "DROP COLUMN IF EXISTS badge_token",
      "DROP COLUMN IF EXISTS role_label",
    ];
    let last = -1;
    for (const step of order) {
      const at = s.indexOf(step);
      assert.ok(at > last, `rollback order: ${step}`);
      last = at;
    }
    assert.ok(s.includes("BEGIN;") && s.includes("COMMIT;"), "transaction wrapped");
  });
});
