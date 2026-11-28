/**
 * lib/__tests__/scanner-dataset-401-access-ended.test.cjs
 *
 * Track G follow-up: scanner-dataset's 401 for a guest (manual "Download /
 * Refresh" in ScannerPreparePanel) was never wired to guestAccessEndedRef -
 * only scanner-sync and verify-ticket were. A guest with a revoked session
 * clicking that button got a generic "Failed to download ticket dataset."
 * error instead of the same "ACCESS ENDED" message used everywhere else.
 *
 * ScannerPreparePanel and ScannerClient are heavy client components (live
 * fetch calls, next-intl, IndexedDB); following the existing convention
 * (see invitation-delivery-source-assertions.test.cjs), this is verified
 * with source assertions.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const PANEL = "components/scanner/ScannerPreparePanel.tsx";
const CLIENT = "app/dashboard/events/[id]/scan/ScannerClient.tsx";

test("ScannerPreparePanel: a guest 401 on dataset download calls onGuestAccessEnded instead of throwing the generic error", () => {
  const s = src(PANEL);
  assert.match(s, /guestSession\?\: boolean/);
  assert.match(s, /onGuestAccessEnded\?\: \(\) => void/);
  const idx = s.indexOf("if (!datasetRes.ok)");
  const block = s.slice(idx, idx + 350);
  assert.match(block, /if \(guestSession && datasetRes\.status === 401\)/);
  assert.match(block, /onGuestAccessEnded\?\.\(\)/);
  assert.match(block, /return;/);
  // The generic throw must come AFTER the guest-401 short-circuit, so a
  // guest's revoked session never surfaces the generic download error.
  const guestCheckIdx = block.indexOf("guestSession && datasetRes.status === 401");
  const genericThrowIdx = block.indexOf("Failed to download ticket dataset");
  assert.ok(guestCheckIdx > -1 && genericThrowIdx > guestCheckIdx);
});

test("ScannerClient: passes guestSession and an onGuestAccessEnded callback into ScannerPreparePanel that calls the same shared access-ended handler as everywhere else", () => {
  const s = src(CLIENT);
  const idx = s.indexOf("<ScannerPreparePanel");
  const block = s.slice(idx, idx + 400);
  assert.match(block, /guestSession=\{guestSession\}/);
  assert.match(block, /onGuestAccessEnded=\{\(\) => \{/);
  assert.match(block, /void handleGuestAccessEnded\(\);/);
});
