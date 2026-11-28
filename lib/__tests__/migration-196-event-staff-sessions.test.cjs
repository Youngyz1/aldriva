const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.resolve(ROOT, rel), "utf8");
const migration195 = read("db/migration_195_event_team_invitations_phone.sql");
const migration196 = read("db/migration_196_event_staff_sessions.sql");
const rollback196 = read("db/migration_196_event_staff_sessions_rollback.sql");
const rollback195 = read("db/migration_195_event_team_invitations_phone_rollback.sql");

test("migration 195 keeps account invitations compatible and requires a phone for account-less invitations", () => {
  assert.match(migration195, /is_accountless boolean NOT NULL DEFAULT false/);
  assert.match(migration195, /phone text/);
  assert.match(migration195, /failed_attempts integer NOT NULL DEFAULT 0/);
  assert.ok(migration195.includes("phone ~ '^\\+[1-9][0-9]{1,14}$') NOT VALID"));
  assert.match(migration195, /CHECK \(NOT is_accountless OR phone IS NOT NULL\) NOT VALID/);
  assert.match(migration195, /failed_attempts BETWEEN 0 AND 5\) NOT VALID/);
});

test("migration 195 rollback locks invitations before its data guard and DDL", () => {
  assert.match(rollback195, /BEGIN;[\s\S]*?LOCK TABLE public\.event_team_invitations IN ACCESS EXCLUSIVE MODE[\s\S]*?phone data still exists[\s\S]*?ALTER TABLE/);
  assert.match(rollback195, /COMMIT;/);
});

test("migration 196 keeps session identities event-scoped, expiring, revocable, and private", () => {
  assert.match(migration196, /event_staff_sessions \([\s\S]*?staff_member_id uuid NOT NULL[\s\S]*?invitation_id uuid NOT NULL/);
  assert.match(migration196, /token_hash text NOT NULL UNIQUE CHECK \(token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(migration196, /hard_expires_at timestamptz NOT NULL/);
  assert.match(migration196, /revoked_at timestamptz/);
  assert.match(migration196, /FOREIGN KEY \(event_id, staff_member_id\)/);
  assert.match(migration196, /FOREIGN KEY \(event_id, invitation_id\)/);
  assert.match(migration196, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration196, /REVOKE ALL ON TABLE public\.event_staff_sessions FROM PUBLIC, anon, authenticated/);
  assert.match(migration196, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.event_staff_sessions TO service_role/);
  assert.doesNotMatch(migration196, /GRANT EXECUTE ON FUNCTION[^;]*TO public/i);
});

test("invitation consumption is volatile, row-locked, phone-verified, expiring, and one-time", () => {
  const start = migration196.indexOf("CREATE FUNCTION public.consume_event_invitation_atomic");
  const end = migration196.indexOf("CREATE FUNCTION public.validate_and_renew_event_staff_session", start);
  const fn = migration196.slice(start, end);
  assert.match(fn, /LANGUAGE plpgsql\s+VOLATILE\s+SECURITY DEFINER/);
  assert.match(fn, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(fn, /FOR UPDATE/);
  assert.match(fn, /v_invitation\.is_accountless IS DISTINCT FROM true/);
  assert.match(fn, /v_invitation\.expires_at <= v_now/);
  assert.match(fn, /p_phone_last4 !~ '\^\[0-9\]\{4\}\$'/);
  assert.match(fn, /failed_attempts = LEAST\(COALESCE\(i\.failed_attempts, 0\) \+ 1, 5\)/);
  assert.match(fn, /THEN 'locked' ELSE i\.status END/);
  assert.match(fn, /token_consumed_at = v_now[\s\S]*?status = 'accepted'/);
  assert.match(fn, /ON CONFLICT \(event_id, invitation_id\) WHERE user_id IS NULL AND invitation_id IS NOT NULL/);
  assert.match(fn, /event_staff_sessions[\s\S]*?p_session_token_hash/);
  assert.match(fn, /out_session_hard_expires_at timestamptz/);
  assert.match(fn, /v_hard_expires_at := v_now \+ interval '90 days'/);
  assert.match(fn, /v_invitation\.entrance_id, v_expires_at, v_hard_expires_at/);
});

test("session validation checks current member and invitation state and enforces hard expiry", () => {
  const start = migration196.indexOf("CREATE FUNCTION public.validate_and_renew_event_staff_session");
  const end = migration196.indexOf("CREATE OR REPLACE FUNCTION public.revoke_event_staff_session_on_member_removal", start);
  const fn = migration196.slice(start, end);
  assert.match(fn, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(fn, /s\.event_id = p_event_id/);
  assert.match(fn, /s\.revoked_at IS NULL/);
  assert.match(fn, /s\.expires_at > v_now/);
  assert.match(fn, /s\.hard_expires_at > v_now/);
  assert.match(fn, /m\.status = 'active'/);
  assert.match(fn, /i\.status = 'accepted'/);
  assert.match(fn, /i\.revoked_at IS NULL/);
  assert.match(fn, /LEAST\(v_now \+ interval '30 days', v_hard_expires_at\)/);
});

test("extended check-in uses the existing ticket instance and audit tables with an atomic event gate", () => {
  const start = migration196.indexOf("CREATE FUNCTION public.check_in_ticket(");
  const end = migration196.indexOf("REVOKE ALL ON FUNCTION public.consume_event_invitation_atomic", start);
  const fn = migration196.slice(start, end);
  assert.match(fn, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(fn, /s\.event_id = p_event_id/);
  assert.match(fn, /m\.status = 'active'/);
  assert.match(fn, /WHERE ti\.id = p_ticket_instance_id[\s\S]*?AND ti\.event_id = p_event_id[\s\S]*?AND ti\.status = 'valid'/);
  assert.match(fn, /INSERT INTO public\.ticket_checkins/);
  assert.match(fn, /scanned_by_staff_member_id/);
  assert.match(fn, /RAISE EXCEPTION 'ALREADY_CHECKED_IN'/);
  assert.doesNotMatch(fn, /INSERT INTO public\.event_staff_checkins/);
  assert.match(migration196, /GRANT EXECUTE ON FUNCTION public\.check_in_ticket\([^;]+TO service_role/);
});

test("rollback refuses to discard live sessions or account-less audit data", () => {
  assert.match(rollback196, /MIGRATION_196_ROLLBACK_BLOCKED/);
  assert.match(rollback196, /LOCK TABLE public\.event_staff_sessions[\s\S]*?IN ACCESS EXCLUSIVE MODE/);
  assert.match(rollback196, /public\.event_staff_sessions LIMIT 1/);
  assert.match(rollback196, /scanned_by_staff_member_id IS NOT NULL/);
  assert.match(rollback196, /DROP FUNCTION IF EXISTS public\.check_in_ticket\(uuid, uuid, uuid, uuid, uuid/);
  assert.match(rollback196, /COMMIT;/);
  assert.doesNotMatch(rollback196, /ROLLBACK;/);
});

test("canonical migrations and Supabase mirrors are byte-identical", () => {
  assert.equal(
    read("db/migration_195_event_team_invitations_phone.sql"),
    read("supabase/migrations/20261024020001_migration_195_event_team_invitations_phone.sql")
  );
  assert.equal(
    read("db/migration_196_event_staff_sessions.sql"),
    read("supabase/migrations/20261024020002_migration_196_event_staff_sessions.sql")
  );
});
