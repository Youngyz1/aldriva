/**
 * lib/__tests__/guest-scanner-page-and-client.test.cjs
 *
 * ScannerClient and the guest staff-scanner page are heavy client/server
 * components with a large dependency surface (next-intl, jsQR, tabler
 * icons, next/headers, live fetch calls, IndexedDB). Following the existing
 * convention in lib/__tests__/invitation-delivery-source-assertions.test.cjs,
 * their logic is verified with source assertions rather than a full render
 * harness - what these prove is that the exact code pattern is present, not
 * runtime DOM/camera behavior.
 *
 * What they verify:
 *  - staff-scanner/page.tsx is gated by isGuestScannerEnabled(); without a
 *    valid session it shows a generic "open your invitation link again"
 *    message and never queries event data first.
 *  - ScannerClient no longer treats a guest 401 as "fine, go offline"; a
 *    401 carrying code: "staff_session_invalid" shows the access-ended
 *    message and returns before the offline-fallback branch, and before
 *    the auto-reset timer that would otherwise clear it.
 *  - The sync loop and verifyTicketCode both refuse to run once a guest's
 *    access has ended, until the page is reloaded (a fresh module load
 *    resets the ref).
 *  - lib/offline-scanner-db.ts's syncOfflineScans never deletes a queued
 *    scan on failure and reports a 401 distinctly via `authError`.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const PAGE = "app/events/[slug]/staff-scanner/page.tsx";
const CLIENT = "app/dashboard/events/[id]/scan/ScannerClient.tsx";
const OFFLINE_DB = "lib/offline-scanner-db.ts";

test("staff-scanner page: gated by isGuestScannerEnabled, keeps the existing off-flag message", () => {
  const s = src(PAGE);
  assert.match(s, /if \(!isGuestScannerEnabled\(\)\)/);
  assert.match(s, /Guest scanning is not available yet/);
});

test("staff-scanner page: without a valid session, shows a generic re-invite message and reveals nothing about the event", () => {
  const s = src(PAGE);
  const sessionCheck = s.indexOf("const session = token ? await validateEventStaffSession");
  const noSessionReturn = s.indexOf("if (!session) {", sessionCheck);
  const eventFetch = s.indexOf('admin.from("events")');
  assert.ok(sessionCheck > -1 && noSessionReturn > sessionCheck, "session validated before anything else");
  assert.ok(eventFetch > noSessionReturn, "the event is only ever fetched AFTER the session is confirmed valid");
  assert.match(s, /t\("staffScannerNoSessionHeading"\)/);
  assert.match(s, /t\("staffScannerNoSessionBody"\)/);
  const noSessionBlock = s.slice(noSessionReturn, eventFetch);
  assert.ok(!noSessionBlock.includes("event.title"), "no event detail is ever rendered on the no-session branch");
});

test("staff-scanner page: the no-session message keys exist in both locales and reveal nothing about the event", () => {
  const en = JSON.parse(src("messages/en.json"));
  const fr = JSON.parse(src("messages/fr.json"));
  assert.equal(en.Events.staffScannerNoSessionHeading, "This scanner isn't open on this device");
  assert.match(en.Events.staffScannerNoSessionBody, /Staff access works only in the browser/);
  assert.equal(fr.Events.staffScannerNoSessionHeading, "Ce scanner n'est pas ouvert sur cet appareil");
  assert.match(fr.Events.staffScannerNoSessionBody, /L'accès du personnel ne fonctionne que dans le navigateur/);
});

test("staff-scanner page: a valid session renders ScannerClient with guestSession and the session's own entrance/role", () => {
  const s = src(PAGE);
  assert.match(s, /staffMemberId=\{session\.staffMemberId\}/);
  assert.match(s, /staffRole=\{session\.role\}/);
  assert.match(s, /assignedEntrance=\{session\.entranceId\}/);
  assert.match(s, /guestSession/);
});

test("ScannerClient: the old (guestSession && res.status === 401) special case is gone", () => {
  const s = src(CLIENT);
  assert.ok(!s.includes('(guestSession && res.status === 401)'), "guest 401 must no longer be folded into the success-like branch");
});

test("ScannerClient: a 401 with code staff_session_invalid calls the shared access-ended handler and returns before the offline fallback", () => {
  const s = src(CLIENT);
  assert.match(s, /body\?\.code === "staff_session_invalid"/);
  const idx = s.indexOf('body?.code === "staff_session_invalid"');
  const block = s.slice(idx, idx + 300);
  assert.match(block, /await handleGuestAccessEnded\(\);/);
  assert.match(block, /return;/);
  // This branch's `return` must come before the offline-fallback branch
  // later in the function, so a terminated guest never gets queued offline.
  const offlineFallbackIdx = s.indexOf("Fallback to Local Offline Validation");
  assert.ok(idx < offlineFallbackIdx, "the access-ended branch must appear (and return) before the offline-fallback code");
});

test("ScannerClient: the dead expired_session scaffold branch was removed, not left half-wired", () => {
  const s = src(CLIENT);
  assert.ok(!s.includes('"expired_session"'), "no code path ever produced this status, so the branch must be gone, not dead");
  assert.ok(!s.includes("STAFF ACCESS EXPIRED"));
});

test("ScannerClient: verifyTicketCode and triggerSync both refuse to run once guestAccessEndedRef is set", () => {
  const s = src(CLIENT);
  assert.match(s, /const guestAccessEndedRef = useRef<boolean>\(false\)/);

  const verifyStart = s.indexOf("const verifyTicketCode = useCallback(");
  const verifyGuardWindow = s.slice(verifyStart, verifyStart + 400);
  assert.match(verifyGuardWindow, /if \(guestSession && guestAccessEndedRef\.current\) return;/);

  const syncStart = s.indexOf("const triggerSync = useCallback(");
  const syncGuardWindow = s.slice(syncStart, syncStart + 400);
  assert.match(syncGuardWindow, /if \(guestSession && guestAccessEndedRef\.current\) return;/);
});

test("ScannerClient: the sync loop stops (not deletes) on a guest auth error and calls the same shared access-ended handler", () => {
  const s = src(CLIENT);
  const idx = s.indexOf("if (guestSession && syncRes.authError)");
  assert.ok(idx > -1, "triggerSync must branch on the new authError flag");
  const block = s.slice(idx, idx + 400);
  assert.match(block, /await handleGuestAccessEnded\(\);/);
});

test("ScannerClient: handleGuestAccessEnded wipes the offline dataset (never the scan queue) and builds the message with the unsynced scan count", () => {
  const s = src(CLIENT);
  assert.match(s, /import \{ buildGuestAccessEndedMessage \} from "@\/lib\/staff\/guest-access-ended-message"/);
  assert.match(s, /clearOfflineDataset,/);
  const idx = s.indexOf("const handleGuestAccessEnded = useCallback(");
  assert.ok(idx > -1);
  const block = s.slice(idx, idx + 500);
  assert.match(block, /guestAccessEndedRef\.current = true;/);
  const countIdx = block.indexOf("getPendingScanCountStrict(eventId)");
  const clearIdx = block.indexOf("clearOfflineDataset(eventId)");
  assert.ok(countIdx > -1 && clearIdx > -1, "the unsynced count must be read and the dataset cleared");
  assert.match(block, /buildGuestAccessEndedMessage\(unsyncedCount\)/);
  // All three guest-401 sites (live scan, sync, manual dataset download)
  // must route through this ONE function, so the dataset wipe and the
  // message text can never drift between them.
  const callSites = [...s.matchAll(/handleGuestAccessEnded\(\);/g)];
  assert.equal(callSites.length, 3, `expected exactly 3 call sites, found ${callSites.length}`);
});

test("offline-scanner-db: syncOfflineScans reports a 401 via authError and never deletes a queued scan on any failure path", () => {
  const s = src(OFFLINE_DB);
  assert.match(s, /authError: res\.status === 401/);
  assert.ok(!s.includes("db.delete(QUEUE_STORE"), "QUEUE_STORE (scan_queue_v1) must never be deleted from - only the dataset cache is");
  assert.match(s, /await updateScanStatus\(scan\.scanId, "failed", \{ syncError: errorMsg \}\)/);
});
