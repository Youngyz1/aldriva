/**
 * lib/__tests__/migration-211-reissue-invitation.test.cjs
 *
 * F1 (Guest Scanner Fix Round): pins the shape of
 * db/migration_211_event_staff_invitation_reissue.sql so a future edit
 * cannot silently drop the unique-constraint swap, the reissue columns, the
 * RPC's locked-down grants, or the member-removal trigger's wider revoke
 * scope. The migration is never applied by this test suite — only its text
 * is read.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const FILE = "db/migration_211_event_staff_invitation_reissue.sql";
const sql = fs.readFileSync(path.join(ROOT, FILE), "utf8");

test("drops the plain UNIQUE(invitation_id) constraint and replaces it with a partial unique index scoped to active sessions", () => {
  assert.match(sql, /DROP CONSTRAINT IF EXISTS event_staff_sessions_invitation_key/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS event_staff_sessions_invitation_active_key\s*\n\s*ON public\.event_staff_sessions\(invitation_id\)\s*\n\s*WHERE revoked_at IS NULL/);
});

test("adds reissue_count and last_reissued_at to event_team_invitations", () => {
  assert.match(sql, /ADD COLUMN IF NOT EXISTS reissue_count integer NOT NULL DEFAULT 0/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS last_reissued_at timestamptz/);
  assert.match(sql, /CHECK \(reissue_count >= 0\)/);
});

test("reissue_event_staff_invitation is SECURITY DEFINER with a fixed search_path and service_role-only execute", () => {
  const idx = sql.indexOf("CREATE OR REPLACE FUNCTION public.reissue_event_staff_invitation");
  assert.ok(idx > -1);
  const fnBlock = sql.slice(idx, sql.indexOf("$function$;", idx) + 20);
  assert.match(fnBlock, /SECURITY DEFINER/);
  assert.match(fnBlock, /SET search_path = pg_catalog, public, pg_temp/);
  assert.match(fnBlock, /is_accountless IS DISTINCT FROM true/);
  assert.match(fnBlock, /status NOT IN \('pending', 'expired', 'locked', 'declined', 'revoked', 'accepted'\)/);
  assert.match(fnBlock, /FOR UPDATE/);

  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.reissue_event_staff_invitation\(uuid, uuid, text, timestamptz\)\s*\n\s*FROM PUBLIC, anon, authenticated;/
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.reissue_event_staff_invitation\(uuid, uuid, text, timestamptz\)\s*\n\s*TO service_role;/
  );
});

test("reissue revokes every session the invitation ever minted before resetting the row to pending", () => {
  const idx = sql.indexOf("CREATE OR REPLACE FUNCTION public.reissue_event_staff_invitation");
  const fnBlock = sql.slice(idx, sql.indexOf("$function$;", idx) + 20);
  const revokeIdx = fnBlock.indexOf("UPDATE public.event_staff_sessions");
  const resetIdx = fnBlock.indexOf("UPDATE public.event_team_invitations");
  assert.ok(revokeIdx > -1 && resetIdx > revokeIdx, "sessions must be revoked BEFORE the invitation row is reset");
  assert.match(fnBlock, /WHERE invitation_id = p_invitation_id/);
  assert.match(fnBlock, /status = 'pending'/);
  assert.match(fnBlock, /token_consumed_at = NULL/);
  assert.match(fnBlock, /accepted_at = NULL/);
  assert.match(fnBlock, /revoked_at = NULL/);
  assert.match(fnBlock, /reissue_count = reissue_count \+ 1/);
  assert.match(fnBlock, /last_reissued_at = v_now/);
});

test("the member-removal trigger function now also revokes a still-pending invitation, not only an accepted one", () => {
  const idx = sql.indexOf("CREATE OR REPLACE FUNCTION public.revoke_event_staff_session_on_member_removal");
  assert.ok(idx > -1);
  const fnBlock = sql.slice(idx, sql.indexOf("$function$;", idx) + 20);
  assert.match(fnBlock, /AND status IN \('accepted', 'pending'\)/);
  assert.doesNotMatch(fnBlock, /AND status = 'accepted'\s*\n\s*END IF;/);

  assert.match(sql, /DROP TRIGGER IF EXISTS trg_revoke_event_staff_sessions_on_member_removal/);
  assert.match(sql, /CREATE TRIGGER trg_revoke_event_staff_sessions_on_member_removal/);
});

test("the migration references its rollback twin and is wrapped in a single transaction", () => {
  assert.match(sql, /Rollback: db\/migration_211_event_staff_invitation_reissue_rollback\.sql/);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
  const rollback = fs.readFileSync(path.join(ROOT, "db/migration_211_event_staff_invitation_reissue_rollback.sql"), "utf8");
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.reissue_event_staff_invitation/);
});
