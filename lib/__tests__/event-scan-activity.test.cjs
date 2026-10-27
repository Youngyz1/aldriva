const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const migration = read("db/migration_197_event_ticket_scan_attempts.sql");
const api = read("app/api/events/[id]/scan-activity/route.ts");
const onlineCheckin = read("app/api/verify-ticket/route.ts");
const offlineSync = read("app/api/events/[id]/scanner-sync/route.ts");

test("migration adds a rejected-attempt audit without duplicating admissions", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.event_ticket_scan_attempts/);
  assert.match(migration, /outcome text NOT NULL DEFAULT 'rejected' CHECK \(outcome = 'rejected'\)/);
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS idx_event_ticket_scan_attempts_offline_id/);
  assert.match(migration, /1::bigint AS successful_count[\s\S]*?FROM public\.ticket_checkins AS tc/);
  assert.match(migration, /0::bigint,[\s\S]*?1::bigint,[\s\S]*?attempt\.attempted_at[\s\S]*?FROM public\.event_ticket_scan_attempts AS attempt/);
  assert.match(migration, /INSERT INTO public\.event_ticket_scan_attempts[\s\S]*?FROM public\.offline_scan_conflicts/);
  assert.match(migration, /p_limit integer,[\s\S]*?LIMIT greatest\(1, least\(COALESCE\(p_limit, 25\), 100\)\)/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /GRANT SELECT, INSERT ON TABLE public\.event_ticket_scan_attempts TO service_role/);
  const tableDefinition = migration.slice(
    migration.indexOf("CREATE TABLE IF NOT EXISTS public.event_ticket_scan_attempts"),
    migration.indexOf("CREATE UNIQUE INDEX IF NOT EXISTS idx_event_ticket_scan_attempts_offline_id"),
  );
  assert.doesNotMatch(tableDefinition, /raw_payload|qr_code|phone|session_token|invitation_token/i);
});

test("forward migration, rollback, and timestamped mirror are present and consistent", () => {
  const mirror = read("supabase/migrations/20261027010000_migration_197_event_ticket_scan_attempts.sql");
  assert.equal(mirror, migration);
  const rollback = read("db/migration_197_event_ticket_scan_attempts_rollback.sql");
  assert.match(rollback, /archive them before rollback/);
  assert.match(rollback, /BEGIN;[\s\S]*?LOCK TABLE public\.event_ticket_scan_attempts IN ACCESS EXCLUSIVE MODE[\s\S]*?COMMIT;/);
  assert.match(rollback, /DROP TABLE IF EXISTS public\.event_ticket_scan_attempts/);
});

test("activity API verifies event staff scope and bounds history pagination", () => {
  assert.match(api, /validateEventStaffSession\(eventId, guestToken\)/);
  assert.match(api, /hasEventOrOrganizerAccess\(userId, eventId, \["event_manager"\]\)/);
  assert.match(api, /hasEventOrOrganizerAccess\(userId, eventId, \["event_manager", "ticket_scanner"\]\)/);
  assert.match(api, /!canManage && ownMembership\?\.id !== requestedStaffId/);
  assert.match(api, /Math\.min\(pageValue, 1000\)/);
  assert.match(api, /get_event_staff_scan_history/);
  assert.match(api, /Cache-Control.*no-store, private/);
});

test("organizer successful total counts the authoritative check-in ledger", () => {
  assert.match(api, /admin\.from\("ticket_checkins"\)[\s\S]*?select\("id", \{ count: "exact", head: true \}\)[\s\S]*?\.eq\("event_id", eventId\)/);
  assert.doesNotMatch(api, /admissionsResult[\s\S]*?from\("ticket_instances"\)/);
});

test("Navbar logout clears the authenticated session before navigation", () => {
  const navbar = read("components/Navbar.tsx");
  assert.match(navbar, /async function handleLogout\(\)[\s\S]*?supabase\.auth\.signOut\(\)[\s\S]*?router\.push\("\/login"\)/);
  assert.match(navbar, /onClick=\{\(\) => void handleLogout\(\)\}/);
});

test("online and offline validation record controlled rejection reasons without storing ticket credentials", () => {
  assert.match(onlineCheckin, /recordRejectedTicketScan\(supabaseAdmin/);
  assert.match(onlineCheckin, /"already_checked_in"/);
  assert.match(onlineCheckin, /"unauthorized_entrance"/);
  assert.match(onlineCheckin, /p_session_token_hash: guestSessionToken \? hashEventStaffSessionToken/);
  assert.doesNotMatch(onlineCheckin, /console\.(?:log|error)\([^\n]*\b(?:code|token|phone|cookie)\s*:/i);
  assert.match(offlineSync, /recordRejectedTicketScan\(admin/);
  assert.match(offlineSync, /admin\.rpc\("check_in_ticket"/);
  assert.match(offlineSync, /ticketInstanceId: expectedConflict === "WRONG_EVENT" \? null/);
});

test("offline synchronization returns unavailable on database errors instead of inventing rejection reasons", () => {
  for (const stage of [
    "idempotency_check",
    "conflict_lookup",
    "ticket_instance_lookup",
    "ticket_code_lookup",
    "winning_checkin_lookup",
    "existing_checkin_lookup",
  ]) {
    assert.match(offlineSync, new RegExp(`databaseUnavailable\\("${stage}"`));
  }
  assert.match(offlineSync, /conflictInsertError && conflictInsertError\.code !== "23505"/);
  assert.match(offlineSync, /status: 503[\s\S]*?x-request-id/);
});

test("scanner and organizer activity are connected to localized real data", () => {
  const scanner = read("app/dashboard/events/[id]/scan/ScannerClient.tsx");
  const team = read("app/dashboard/events/[id]/team/TeamClient.tsx");
  assert.match(scanner, /scan-activity/);
  assert.match(scanner, /getPendingScanCountStrict\(eventId\)/);
  assert.match(scanner, /aria-live="polite"/);
  assert.match(team, /scan-activity/);
  assert.match(team, /staff_id=/);
  assert.match(team, /historyHasMore/);
  for (const locale of ["en", "fr"]) {
    const events = JSON.parse(read(`messages/${locale}.json`)).Events;
    for (const key of [
      "scannerActivityTitle", "successfulCheckIns", "rejectedAttempts", "scanAttempts",
      "pendingOfflineScans", "staffActivity", "activityHistory", "reasonAlreadyCheckedIn",
      "unauthorizedEntranceMessage", "onlineScan", "offlineSync",
    ]) {
      assert.equal(typeof events[key], "string", `${locale}.Events.${key} must be translated`);
    }
  }
});
