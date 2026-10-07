/**
 * lib/__tests__/migration-155-event-kind.test.cjs
 *
 * Static pins for migration 155 (first-class invitation events):
 * forward + rollback twins exist in db/, the supabase mirror exists and is
 * byte-identical, the forward SQL carries every required element, the
 * rollback reverses in reverse order with abort guards, and share-link
 * columns are NOT smuggled into 155 (they belong to migration 156).
 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const FORWARD = path.join(ROOT, "db/migration_155_event_kind.sql");
const ROLLBACK = path.join(ROOT, "db/migration_155_event_kind_rollback.sql");
const MIRROR = path.join(
  ROOT,
  "supabase/migrations/20261007000001_migration_155_event_kind.sql"
);

describe("migration 155 files exist", () => {
  test("forward, rollback twin and supabase mirror are all present", () => {
    assert.ok(fs.existsSync(FORWARD), "db/migration_155_event_kind.sql must exist");
    assert.ok(fs.existsSync(ROLLBACK), "db/migration_155_event_kind_rollback.sql must exist");
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
      !dir.some((f) => f.includes("155") && f.includes("rollback")),
      "rollbacks never go in supabase/migrations"
    );
  });
});

describe("migration 155 forward content", () => {
  const sql = () => fs.readFileSync(FORWARD, "utf8");

  test("kind column: NOT NULL DEFAULT public (existing rows stay public)", () => {
    const s = sql();
    assert.ok(s.includes("ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'public'"));
  });

  test("kind CHECK allows exactly public + invitation", () => {
    const s = sql();
    assert.ok(s.includes("events_kind_check"));
    assert.ok(s.includes("CHECK (kind IN ('public', 'invitation'))"));
  });

  test("status CHECK is relaxed to include draft", () => {
    const s = sql();
    assert.ok(s.includes("CHECK (status IN ('pending', 'approved', 'rejected', 'draft'))"));
  });

  test("invitation kind forces private visibility", () => {
    const s = sql();
    assert.ok(s.includes("events_invitation_private_check"));
    assert.ok(s.includes("CHECK (kind <> 'invitation' OR visibility = 'private')"));
  });

  test("kind index exists for routing and list filters", () => {
    const s = sql();
    assert.ok(s.includes("CREATE INDEX IF NOT EXISTS idx_events_kind"));
  });

  test("wrapped in a transaction with schema reload", () => {
    const s = sql();
    assert.ok(s.trimStart().includes("BEGIN;") || s.includes("\nBEGIN;"));
    assert.ok(s.includes("COMMIT;"));
    assert.ok(s.includes("NOTIFY pgrst, 'reload schema';"));
  });

  test("share-link columns are NOT in 155 (reserved for 156)", () => {
    const s = sql().toLowerCase();
    assert.ok(!s.includes("add column if not exists share"), "no share column added");
    assert.ok(!s.includes("share_token text"), "no share token column");
    assert.ok(!s.includes("share_enabled"), "no share enabled flag");
  });
});

describe("migration 155 rollback content", () => {
  const sql = () => fs.readFileSync(ROLLBACK, "utf8");

  test("aborts when invitation rows remain (never leave one looking public)", () => {
    const s = sql();
    assert.ok(s.includes("WHERE kind = 'invitation'"), "invitation guard present");
    assert.ok(s.includes("RAISE EXCEPTION"), "abort is loud");
    assert.ok(s.includes("never look public"), "reason is reviewable");
  });

  test("aborts when draft-status rows remain", () => {
    const s = sql();
    assert.ok(s.includes("WHERE status = 'draft'"), "draft guard present");
  });

  test("reverses in reverse order with re-runnable guards", () => {
    const s = sql();
    const order = [
      "DROP INDEX IF EXISTS public.idx_events_kind",
      "DROP CONSTRAINT IF EXISTS events_invitation_private_check",
      "CHECK (status IN ('pending', 'approved', 'rejected'))",
      "DROP CONSTRAINT IF EXISTS events_kind_check",
      "DROP COLUMN IF EXISTS kind",
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
