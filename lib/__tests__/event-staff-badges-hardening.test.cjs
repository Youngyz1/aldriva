/**
 * lib/__tests__/event-staff-badges-hardening.test.cjs
 *
 * STAFF ROUND Phase A, step A1b: static pins for migration 165
 * (grant + secrecy hardening for the 164 staff schema).
 *
 * - Forward + rollback twins exist in db/, the supabase mirror exists and
 *   is byte-identical, no rollback lives in supabase/migrations.
 * - Grants: table-level REVOKE INSERT/UPDATE/DELETE on all three staff
 *   tables; NO column-level REVOKE anywhere (ineffective against the
 *   table-level grants anon/authenticated hold — no DENY in Postgres).
 * - Service-role-only status quo: every app/lib/components reference to
 *   the staff tables goes through createSupabaseAdmin()/supabaseAdmin.
 * - Badge hash (SHA-256 hex) + display code replace the 164 plaintext
 *   columns, dropped behind an abort guard.
 * - staff_member_id FK becomes nullable ON DELETE SET NULL (audit
 *   survives member deletion); check-ins become SELECT-only (manager
 *   write policy dropped, SELECT kept).
 * - Isolation: no guest check-in / offline objects in executable SQL.
 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const FORWARD = path.join(ROOT, "db/migration_165_event_staff_badge_hardening.sql");
const ROLLBACK = path.join(ROOT, "db/migration_165_event_staff_badge_hardening_rollback.sql");
const MIRROR = path.join(
  ROOT,
  "supabase/migrations/20261010000001_migration_165_event_staff_badge_hardening.sql"
);

const STAFF_TABLES = ["event_team_members", "event_team_invitations", "event_staff_checkins"];

// Executable SQL only: `--` comment lines may name things the code must not.
function codeOf(file) {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("migration 165 files exist", () => {
  test("forward, rollback twin and supabase mirror are all present", () => {
    assert.ok(fs.existsSync(FORWARD), "db/migration_165_event_staff_badge_hardening.sql must exist");
    assert.ok(fs.existsSync(ROLLBACK), "db/migration_165_event_staff_badge_hardening_rollback.sql must exist");
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
      !dir.some((f) => f.includes("165") && f.includes("rollback")),
      "rollbacks never go in supabase/migrations"
    );
  });
});

describe("migration 165 table-level write REVOKEs", () => {
  test("INSERT/UPDATE/DELETE revoked on all three staff tables from anon + authenticated", () => {
    const s = codeOf(FORWARD);
    for (const table of STAFF_TABLES) {
      assert.ok(
        s.includes(`REVOKE INSERT, UPDATE, DELETE ON public.${table} FROM anon, authenticated`),
        `write REVOKE on ${table}`
      );
    }
  });

  test("no column-level REVOKE anywhere (void against table grants — no DENY in Postgres)", () => {
    const s = codeOf(FORWARD);
    for (const line of s.split("\n")) {
      if (line.trimStart().startsWith("REVOKE")) {
        assert.ok(!line.includes("("), `table-level REVOKE only, got: ${line.trim()}`);
      }
    }
  });

  test("no GRANT widening: SELECT stays as-is under RLS", () => {
    const s = codeOf(FORWARD);
    assert.ok(!s.includes("GRANT SELECT"), "no SELECT grant changes");
    assert.ok(!s.includes("GRANT INSERT") && !s.includes("GRANT UPDATE"), "no write grants");
  });

  test("RLS left enabled: no DISABLE ROW LEVEL SECURITY", () => {
    const s = codeOf(FORWARD);
    assert.ok(!s.includes("DISABLE ROW LEVEL SECURITY"), "RLS stays on");
  });
});

describe("migration 165 service-role-only status quo (addendum item 2/3 evidence)", () => {
  function sourceFiles(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__" || entry.name === "node_modules") continue;
        sourceFiles(full, out);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  }

  test("every app/lib/components touch of the staff tables uses the service-role client", () => {
    const offenders = [];
    for (const dir of ["app", "lib", "components"].map((d) => path.join(ROOT, d))) {
      for (const file of sourceFiles(dir)) {
        const src = fs.readFileSync(file, "utf8");
        const touchesStaff = STAFF_TABLES.some((t) => src.includes(t));
        if (!touchesStaff) continue;
        const viaServiceRole = src.includes("createSupabaseAdmin") || src.includes("supabaseAdmin");
        if (!viaServiceRole) offenders.push(path.relative(ROOT, file));
      }
    }
    assert.deepEqual(offenders, [], "all staff-table access must go through the service-role client");
  });

  test("no browser-session client touches the staff tables", () => {
    const offenders = [];
    for (const dir of ["app", "lib", "components"].map((d) => path.join(ROOT, d))) {
      for (const file of sourceFiles(dir)) {
        const src = fs.readFileSync(file, "utf8");
        const touchesStaff = STAFF_TABLES.some((t) => src.includes(t));
        if (!touchesStaff) continue;
        if (src.includes("@/lib/supabase\"") || src.includes("@/lib/supabase'") || src.includes("createBrowserClient")) {
          offenders.push(path.relative(ROOT, file));
        }
      }
    }
    assert.deepEqual(offenders, [], "browser client must never touch staff tables");
  });

  test("event_staff_checkins has zero app references (schema-only by design)", () => {
    const hits = [];
    for (const dir of ["app", "lib", "components"].map((d) => path.join(ROOT, d))) {
      for (const file of sourceFiles(dir)) {
        if (fs.readFileSync(file, "utf8").includes("event_staff_checkins")) {
          hits.push(path.relative(ROOT, file));
        }
      }
    }
    assert.deepEqual(hits, [], "no app code may reference the audit table before A4");
  });
});

describe("migration 165 badge hash + display code", () => {
  const sql = () => codeOf(FORWARD);

  test("hash + display columns added on members, hash snapshot on check-ins", () => {
    const s = sql();
    assert.ok(s.includes("ALTER TABLE public.event_team_members ADD COLUMN IF NOT EXISTS badge_token_hash TEXT"));
    assert.ok(s.includes("ALTER TABLE public.event_team_members ADD COLUMN IF NOT EXISTS badge_display_code TEXT"));
    assert.ok(s.includes("ALTER TABLE public.event_staff_checkins ADD COLUMN IF NOT EXISTS badge_token_hash TEXT"));
  });

  test("hash pinned to SHA-256 hex shape; display code length-bounded", () => {
    const s = sql();
    assert.ok(s.includes("event_team_members_badge_hash_format"));
    assert.ok(s.includes("CHECK (badge_token_hash IS NULL OR badge_token_hash ~ '^[0-9a-f]{64}$')"));
    assert.ok(s.includes("event_team_members_badge_display_len"));
    assert.ok(s.includes("CHECK (badge_display_code IS NULL OR char_length(badge_display_code) <= 16)"));
  });

  test("unique hash + unique display code via re-runnable indexes (NULLs never conflict)", () => {
    const s = sql();
    assert.ok(s.includes("CREATE UNIQUE INDEX IF NOT EXISTS idx_event_team_members_badge_token_hash"));
    assert.ok(s.includes("CREATE UNIQUE INDEX IF NOT EXISTS idx_event_team_members_badge_display_code"));
  });

  test("plaintext badge columns dropped behind an abort guard", () => {
    const s = sql();
    assert.ok(s.includes("MIGRATION_165_ABORTED"), "machine-readable abort reason");
    assert.ok(s.includes("WHERE badge_token IS NOT NULL"), "minted badges block the drop");
    assert.ok(s.includes("FROM public.event_staff_checkins"), "existing scan rows block the drop");
    assert.ok(s.includes("RAISE EXCEPTION"), "abort is loud");
    const guardAt = s.indexOf("MIGRATION_165_ABORTED");
    assert.ok(guardAt < s.indexOf("DROP COLUMN IF EXISTS badge_token"), "guard runs before the drop");
    assert.ok(s.includes("ALTER TABLE public.event_team_members DROP COLUMN IF EXISTS badge_token"));
    assert.ok(s.includes("ALTER TABLE public.event_staff_checkins DROP COLUMN IF EXISTS badge_token"));
    assert.ok(s.includes("DROP INDEX IF EXISTS public.idx_event_team_members_badge_token"));
  });
});

describe("migration 165 audit preservation + SELECT-only check-ins", () => {
  const sql = () => codeOf(FORWARD);

  test("member-link FK becomes nullable ON DELETE SET NULL", () => {
    const s = sql();
    assert.ok(s.includes("ALTER TABLE public.event_staff_checkins ALTER COLUMN staff_member_id DROP NOT NULL"));
    assert.ok(s.includes("DROP CONSTRAINT IF EXISTS event_staff_checkins_staff_member_id_fkey"));
    assert.ok(s.includes("FOREIGN KEY (staff_member_id) REFERENCES public.event_team_members(id) ON DELETE SET NULL"));
  });

  test("manager write policy dropped, SELECT policy kept (not dropped)", () => {
    const s = sql();
    assert.ok(s.includes('DROP POLICY IF EXISTS "Organizers manage staff checkins" ON public.event_staff_checkins'));
    assert.ok(!s.includes('DROP POLICY IF EXISTS "Users can view relevant staff checkins"'), "SELECT policy survives");
    assert.ok(!s.includes("CREATE POLICY"), "165 creates no policies");
  });

  test("wrapped in a transaction with schema reload", () => {
    const s = sql();
    assert.ok(s.includes("\nBEGIN;"));
    assert.ok(s.includes("COMMIT;"));
    assert.ok(s.includes("NOTIFY pgrst, 'reload schema';"));
  });
});

describe("migration 165 isolation", () => {
  test("never touches guest check-in, ticket, or offline objects", () => {
    const s = codeOf(FORWARD).toLowerCase();
    for (const forbidden of [
      "check_in_ticket",
      "ticket_instances",
      "ticket_checkins",
      "ticket_orders",
      "offline_scan_conflicts",
      "offline_scan_id",
      "delegating",
    ]) {
      assert.ok(!s.includes(forbidden), `must not mention ${forbidden}`);
    }
  });

  test("does not touch invitations.token (deferred to the A2 migration)", () => {
    const s = codeOf(FORWARD);
    assert.ok(!s.includes("invitations_token") && !s.includes("DROP COLUMN IF EXISTS token"), "token column untouched");
  });
});

describe("migration 165 rollback content", () => {
  const sql = () => fs.readFileSync(ROLLBACK, "utf8");

  test("aborts on orphaned history and live hashes", () => {
    const s = sql();
    assert.ok(s.includes("WHERE staff_member_id IS NULL"), "orphan guard present");
    assert.ok(s.includes("WHERE badge_token_hash IS NOT NULL"), "live-hash guard present");
    assert.ok(s.includes("ROLLBACK_ABORTED"), "machine-readable reasons");
    assert.ok(s.includes("RAISE EXCEPTION"), "abort is loud");
  });

  test("restores CASCADE link, plaintext columns, unique index, and write grants", () => {
    const s = sql();
    assert.ok(s.includes("REFERENCES public.event_team_members(id) ON DELETE CASCADE"), "CASCADE restored");
    assert.ok(s.includes("ALTER COLUMN staff_member_id SET NOT NULL"), "NOT NULL restored");
    assert.ok(s.includes("ADD COLUMN IF NOT EXISTS badge_token TEXT"), "plaintext restored");
    assert.ok(s.includes("CREATE UNIQUE INDEX IF NOT EXISTS idx_event_team_members_badge_token"), "badge uniqueness restored");
    for (const table of STAFF_TABLES) {
      assert.ok(s.includes(`GRANT INSERT, UPDATE, DELETE ON public.${table} TO anon, authenticated`), `writes re-granted on ${table}`);
    }
  });

  test("drops hash artifacts and re-creates the manager write policy", () => {
    const s = sql();
    assert.ok(s.includes("DROP COLUMN IF EXISTS badge_token_hash"), "hash columns dropped");
    assert.ok(s.includes("DROP COLUMN IF EXISTS badge_display_code"), "display code dropped");
    assert.ok(s.includes('CREATE POLICY "Organizers manage staff checkins" ON public.event_staff_checkins'), "policy restored");
  });

  test("reverses in dependency order with transaction guards", () => {
    const s = sql();
    const order = [
      'CREATE POLICY "Organizers manage staff checkins"',
      "ON DELETE CASCADE",
      "ADD COLUMN IF NOT EXISTS badge_token TEXT",
      "GRANT INSERT, UPDATE, DELETE ON public.event_team_members",
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
