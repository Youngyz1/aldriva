#!/usr/bin/env node
/*
 * Integration test for migrations 195/196. Use only a disposable loopback DB:
 * EVENT_STAFF_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55489/aldriva_event_staff_test_local
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

const databaseUrl = process.env.EVENT_STAFF_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Set EVENT_STAFF_TEST_DATABASE_URL to a disposable local test database.");
const parsed = new URL(databaseUrl);
if (
  !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) ||
  !parsed.pathname.slice(1).startsWith("aldriva_event_staff_test") ||
  parsed.pathname.slice(1) === "aldriva_event_staff_test"
) {
  throw new Error("Refusing non-loopback or non-test database URL; use a dedicated aldriva_event_staff_test_* database.");
}

const ROOT = path.resolve(__dirname, "..");
const migration195 = fs.readFileSync(path.resolve(ROOT, "db/migration_195_event_team_invitations_phone.sql"), "utf8");
const migration196 = fs.readFileSync(path.resolve(ROOT, "db/migration_196_event_staff_sessions.sql"), "utf8");
const existingCheckinRpc = fs.readFileSync(path.resolve(ROOT, "db/migration_79d_fix_check_in_ticket_rpc.sql"), "utf8");
const pool = new Pool({ connectionString: databaseUrl, max: 8 });

const ids = {
  user: "10000000-0000-4000-8000-000000000001",
  eventA: "20000000-0000-4000-8000-000000000001",
  eventB: "20000000-0000-4000-8000-000000000002",
  ticketOrderA: "30000000-0000-4000-8000-000000000001",
  ticketOrderB: "30000000-0000-4000-8000-000000000002",
  ticketOrderC: "30000000-0000-4000-8000-000000000003",
  ticketOrderD: "30000000-0000-4000-8000-000000000004",
  ticketA: "40000000-0000-4000-8000-000000000001",
  ticketB: "40000000-0000-4000-8000-000000000002",
  ticketC: "40000000-0000-4000-8000-000000000003",
  ticketD: "40000000-0000-4000-8000-000000000004",
};
let passed = 0;

function check(condition, message) {
  assert.ok(condition, message);
  passed++;
  process.stdout.write(`PASS ${message}\n`);
}

async function setupFixture() {
  const client = await pool.connect();
  try {
    await client.query(`
      DO $roles$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
      END
      $roles$;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
        $$ SELECT NULLIF(current_setting('request.jwt.claim.role', true), '') $$;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
      CREATE TABLE public.organizers (id uuid PRIMARY KEY, user_id uuid);
      CREATE TABLE public.events (
        id uuid PRIMARY KEY,
        user_id uuid,
        organizer_id uuid,
        title text NOT NULL
      );
      CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text, status text);
      CREATE OR REPLACE FUNCTION public.is_entity_member(p_organizer_id uuid, p_roles text[] DEFAULT NULL)
        RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
      CREATE TABLE public.event_team_invitations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
        email text NOT NULL,
        role text NOT NULL CHECK (role IN ('event_manager', 'ticket_scanner')),
        entrance_id uuid,
        invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
        token_hash text NOT NULL UNIQUE,
        status text NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'revoked')),
        expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
        accepted_at timestamptz,
        role_label text,
        position_label text,
        staff_name text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.event_team_members (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
        user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
        role text NOT NULL CHECK (role IN ('event_manager', 'ticket_scanner')),
        entrance_id uuid,
        status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
        invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
        invited_at timestamptz DEFAULT now(),
        accepted_at timestamptz,
        removed_at timestamptz,
        role_label text,
        position_label text,
        staff_name text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT event_team_members_event_user_key UNIQUE (event_id, user_id)
      );
      CREATE TABLE public.ticket_orders (
        id uuid PRIMARY KEY,
        event_id uuid NOT NULL REFERENCES public.events(id),
        status text NOT NULL DEFAULT 'valid',
        qr_code text
      );
      CREATE TABLE public.ticket_instances (
        id uuid PRIMARY KEY,
        order_id uuid NOT NULL REFERENCES public.ticket_orders(id),
        event_id uuid NOT NULL REFERENCES public.events(id),
        qr_code text NOT NULL UNIQUE,
        status text NOT NULL CHECK (status IN ('valid', 'used', 'cancelled', 'refunded')),
        checked_in_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.ticket_checkins (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_instance_id uuid REFERENCES public.ticket_instances(id) ON DELETE CASCADE,
        ticket_order_id uuid REFERENCES public.ticket_orders(id) ON DELETE CASCADE,
        event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
        scanned_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
        delegating_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
        checked_in_at timestamptz NOT NULL DEFAULT now(),
        scan_source text NOT NULL DEFAULT 'online' CHECK (scan_source IN ('online', 'offline', 'offline_sync')),
        offline_scan_id uuid UNIQUE,
        offline_scanned_at timestamptz,
        device_id text,
        entrance_id uuid
      );
      CREATE UNIQUE INDEX ticket_checkins_instance_unique
        ON public.ticket_checkins(ticket_instance_id) WHERE ticket_instance_id IS NOT NULL;
      CREATE TABLE public.offline_scan_conflicts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id uuid NOT NULL REFERENCES public.events(id),
        ticket_instance_id uuid REFERENCES public.ticket_instances(id),
        ticket_order_id uuid REFERENCES public.ticket_orders(id),
        offline_scan_id uuid NOT NULL,
        device_id text,
        entrance_id uuid,
        delegating_user_id uuid REFERENCES auth.users(id),
        scanned_by_user_id uuid REFERENCES auth.users(id),
        offline_scanned_at timestamptz NOT NULL,
        conflict_reason text NOT NULL,
        winning_checkin_id uuid REFERENCES public.ticket_checkins(id),
        raw_payload jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      GRANT USAGE ON SCHEMA public, auth TO service_role;
    `);
    await client.query(existingCheckinRpc);
    await client.query(migration195);
    await client.query(migration196);
    await client.query("SET request.jwt.claim.role = 'service_role'");
    await client.query("INSERT INTO auth.users(id,email) VALUES ($1,'manager@example.test')", [ids.user]);
    await client.query(
      "INSERT INTO public.events(id,user_id,title) VALUES ($1,$3,'Test A'),($2,$3,'Test B')",
      [ids.eventA, ids.eventB, ids.user]
    );
  } finally {
    client.release();
  }
}

async function withServiceRole(fn) {
  const client = await pool.connect();
  try {
    await client.query("SET request.jwt.claim.role = 'service_role'");
    return await fn(client);
  } finally {
    client.release();
  }
}

async function createInvite({ eventId = ids.eventA, hash, expiresAt, status = "pending", phone = "+2348012345678" }) {
  return withServiceRole(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO public.event_team_invitations
        (event_id,email,role,invited_by,token_hash,status,expires_at,staff_name,is_accountless,phone)
       VALUES ($1,'guest@example.test','ticket_scanner',$2,$3,$4,$5,'Door Staff',true,$6)
       RETURNING id`,
      [eventId, ids.user, hash, status, expiresAt || new Date(Date.now() + 86400000).toISOString(), phone]
    );
    return rows[0].id;
  });
}

async function consume(hash, phoneLast4, sessionHash) {
  return withServiceRole(async (client) => {
    const { rows } = await client.query(
      "SELECT * FROM public.consume_event_invitation_atomic($1,$2,$3)",
      [hash, phoneLast4, sessionHash]
    );
    return rows[0] || null;
  });
}

async function validate(eventId, sessionHash) {
  return withServiceRole(async (client) => {
    const { rows } = await client.query(
      "SELECT * FROM public.validate_and_renew_event_staff_session($1,$2)",
      [eventId, sessionHash]
    );
    return rows[0] || null;
  });
}

async function checkIn(values) {
  return withServiceRole(async (client) => client.query(
    `SELECT public.check_in_ticket(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
    )`, values
  ));
}

async function expectCheckInError(values, message) {
  await assert.rejects(() => checkIn(values), new RegExp(message));
  passed++;
  process.stdout.write(`PASS check-in rejects ${message}\n`);
}

async function main() {
  await setupFixture();

  const badHash = "a".repeat(64);
  await createInvite({ hash: badHash });
  for (let attempt = 1; attempt <= 5; attempt++) {
    assert.equal(await consume(badHash, "0000", `${String(attempt).padStart(2, "0")}`.repeat(32)), null);
  }
  const locked = await pool.query("SELECT status, failed_attempts FROM public.event_team_invitations WHERE token_hash=$1", [badHash]);
  check(locked.rows[0].status === "locked" && locked.rows[0].failed_attempts === 5, "five wrong phone attempts lock the invitation atomically");
  assert.equal(await consume(badHash, "5678", "b".repeat(64)), null);
  const stillLocked = await pool.query("SELECT failed_attempts FROM public.event_team_invitations WHERE token_hash=$1", [badHash]);
  check(stillLocked.rows[0].failed_attempts === 5, "locked invitation attempts do not advance further");

  const validHash = "c".repeat(64);
  await createInvite({ hash: validHash });
  const valid = await consume(validHash, "5678", "d".repeat(64));
  check(
    Boolean(valid?.out_member_id && valid?.out_session_expires_at && valid?.out_session_hard_expires_at),
    "correct phone consumes the invitation and creates a session with a hard cookie expiry"
  );
  check(
    Date.parse(valid.out_session_hard_expires_at) > Date.parse(valid.out_session_expires_at),
    "session hard expiry outlives the renewable soft expiry"
  );
  const accepted = await pool.query("SELECT status, token_consumed_at FROM public.event_team_invitations WHERE token_hash=$1", [validHash]);
  check(accepted.rows[0].status === "accepted" && accepted.rows[0].token_consumed_at, "invitation consumption and accepted status commit together");
  const replay = await consume(validHash, "5678", "e".repeat(64));
  check(replay === null, "a consumed invite cannot create a second session");
  const sessionCount = await pool.query("SELECT count(*)::int AS n FROM public.event_staff_sessions WHERE invitation_id=(SELECT id FROM public.event_team_invitations WHERE token_hash=$1)", [validHash]);
  check(sessionCount.rows[0].n === 1, "replay leaves exactly one session row");
  check(Boolean(await validate(ids.eventA, "d".repeat(64))), "valid session resolves its active staff member");
  check((await validate(ids.eventB, "d".repeat(64))) === null, "session is isolated to its invitation event");
  await pool.query("UPDATE public.event_staff_sessions SET created_at=now()-interval '2 days',last_renewed_at=now()-interval '2 days',expires_at=now()-interval '1 minute',hard_expires_at=now()-interval '1 minute' WHERE token_hash=$1", ["d".repeat(64)]);
  check((await validate(ids.eventA, "d".repeat(64))) === null, "expired session is rejected");

  const expiredHash = "f".repeat(64);
  await createInvite({ hash: expiredHash, expiresAt: new Date(Date.now() - 60000).toISOString() });
  assert.equal(await consume(expiredHash, "5678", "1".repeat(64)), null);
  const expired = await pool.query("SELECT status FROM public.event_team_invitations WHERE token_hash=$1", [expiredHash]);
  check(expired.rows[0].status === "expired", "expired invitation is rejected and marked expired");

  const revokedHash = "2".repeat(64);
  await createInvite({ hash: revokedHash, status: "revoked" });
  assert.equal(await consume(revokedHash, "5678", "3".repeat(64)), null);
  check((await validate(ids.eventA, "3".repeat(64))) === null, "revoked invitation cannot create a session");

  const concurrentHash = "4".repeat(64);
  await createInvite({ eventId: ids.eventB, hash: concurrentHash });
  const simultaneous = await Promise.all([
    consume(concurrentHash, "5678", "5".repeat(64)),
    consume(concurrentHash, "5678", "6".repeat(64)),
  ]);
  check(simultaneous.filter(Boolean).length === 1, "concurrent redemption has a single winner");
  const concurrentCount = await pool.query("SELECT count(*)::int AS n FROM public.event_staff_sessions WHERE invitation_id=(SELECT id FROM public.event_team_invitations WHERE token_hash=$1)", [concurrentHash]);
  check(concurrentCount.rows[0].n === 1, "concurrent redemption creates one session");
  const winningSessionHash = simultaneous[0] ? "5".repeat(64) : "6".repeat(64);
  await pool.query(
    "UPDATE public.event_staff_sessions SET last_renewed_at=now()-interval '48 hours',expires_at=now()+interval '5 minutes',hard_expires_at=now()+interval '1 hour' WHERE token_hash=$1",
    [winningSessionHash]
  );
  const renewed = await validate(ids.eventB, winningSessionHash);
  check(
    renewed && Date.parse(renewed.out_session_expires_at) <= Date.now() + 61 * 60 * 1000,
    "sliding renewal never extends past the hard expiry"
  );

  const scanSessionHash = "7".repeat(64);
  const scanInviteHash = "8".repeat(64);
  await createInvite({ hash: scanInviteHash });
  const scanSession = await consume(scanInviteHash, "5678", scanSessionHash);
  const scanMemberId = scanSession.out_member_id;
  await pool.query("INSERT INTO public.ticket_orders(id,event_id,status) VALUES ($1,$2,'valid'),($3,$4,'valid'),($5,$2,'valid'),($6,$2,'valid')", [ids.ticketOrderA, ids.eventA, ids.ticketOrderB, ids.eventB, ids.ticketOrderC, ids.ticketOrderD]);
  await pool.query("INSERT INTO public.ticket_instances(id,order_id,event_id,qr_code,status) VALUES ($1,$2,$3,'QR-A','valid'),($4,$5,$6,'QR-B','valid'),($7,$8,$9,'QR-C','valid'),($10,$11,$12,'QR-D','valid')", [ids.ticketA, ids.ticketOrderA, ids.eventA, ids.ticketB, ids.ticketOrderB, ids.eventB, ids.ticketC, ids.ticketOrderC, ids.eventA, ids.ticketD, ids.ticketOrderD, ids.eventA]);

  const checkinParams = (ticketId, eventId, offlineId) => [
    ticketId, eventId, null, null, scanMemberId, scanSessionHash,
    "offline_sync", offlineId, new Date().toISOString(), "device-integration", null,
  ];
  await expectCheckInError(checkinParams(ids.ticketB, ids.eventA, "90000000-0000-4000-8000-000000000001"), "WRONG_EVENT");
  await checkIn(checkinParams(ids.ticketA, ids.eventA, "90000000-0000-4000-8000-000000000002"));
  const checkin = await pool.query("SELECT scanned_by_user_id, scanned_by_staff_member_id, scan_source FROM public.ticket_checkins WHERE ticket_instance_id=$1", [ids.ticketA]);
  check(checkin.rows.length === 1 && checkin.rows[0].scanned_by_user_id === null && checkin.rows[0].scanned_by_staff_member_id === scanMemberId && checkin.rows[0].scan_source === "offline_sync", "guest check-in updates the existing ticket and attributes the staff member without an auth user id");
  await expectCheckInError(checkinParams(ids.ticketA, ids.eventA, "90000000-0000-4000-8000-000000000003"), "ALREADY_CHECKED_IN");

  const concurrentScanIdA = "90000000-0000-4000-8000-000000000004";
  const concurrentScanIdB = "90000000-0000-4000-8000-000000000005";
  const scanResults = await Promise.allSettled([
    checkIn(checkinParams(ids.ticketC, ids.eventA, concurrentScanIdA)),
    checkIn(checkinParams(ids.ticketC, ids.eventA, concurrentScanIdB)),
  ]);
  check(scanResults.filter((result) => result.status === "fulfilled").length === 1, "concurrent duplicate ticket scans have one successful check-in");
  const concurrentCheckins = await pool.query("SELECT count(*)::int AS n FROM public.ticket_checkins WHERE ticket_instance_id=$1", [ids.ticketC]);
  check(concurrentCheckins.rows[0].n === 1, "concurrent ticket scans write exactly one audit row");

  const accountCheckin = await withServiceRole((client) => client.query(
    "SELECT public.check_in_ticket($1,$2) AS ticket_id",
    [ids.ticketD, ids.user]
  ));
  const accountAudit = await pool.query("SELECT scanned_by_user_id FROM public.ticket_checkins WHERE ticket_instance_id=$1", [ids.ticketD]);
  check(accountCheckin.rows[0].ticket_id === ids.ticketD && accountAudit.rows[0].scanned_by_user_id === ids.user, "existing two-argument account check-in RPC remains intact");

  await pool.query("UPDATE public.event_team_members SET status='removed',removed_at=now() WHERE id=$1", [scanMemberId]);
  check((await validate(ids.eventA, scanSessionHash)) === null, "membership removal revokes the session immediately");
  await expectCheckInError(checkinParams("40000000-0000-4000-8000-000000000099", ids.eventA, "90000000-0000-4000-8000-000000000006"), "STAFF_SESSION_INVALID");

  const acl = await pool.query(`
    SELECT p.proname, COALESCE(bool_or(a.grantee = 0 AND a.privilege_type = 'EXECUTE'),false) AS public_execute
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      LEFT JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f',p.proowner))) a ON true
     WHERE n.nspname='public' AND p.proname IN ('consume_event_invitation_atomic','validate_and_renew_event_staff_session')
     GROUP BY p.proname`);
  check(acl.rows.length === 2 && acl.rows.every((row) => !row.public_execute), "sensitive RPCs have no PUBLIC execute grant");

  process.stdout.write(`\n${passed} PostgreSQL lifecycle checks passed.\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
