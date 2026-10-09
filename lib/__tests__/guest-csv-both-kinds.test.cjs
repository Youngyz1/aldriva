/**
 * lib/__tests__/guest-csv-both-kinds.test.cjs
 *
 * Round 3 COMMIT 4: guest CSV import verify-and-report.
 * Round 4 Rule 1 update: guest management (including the batch API that
 * fronts CSV import) serves invitation-kind events only — the route now
 * rejects kind='public' with 404. The import ENGINE (lib/guest-import.ts)
 * stays kind-agnostic by design: kind is enforced at the route boundary,
 * not in the shared writer. These tests pin that split.
 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.join(__dirname, "../..");
function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("guest CSV import serves invitation-kind events (Round 4 Rule 1)", () => {
  const BATCH = "app/api/events/[id]/guests/batch/route.ts";

  test("batch API gates on ownership AND invitation kind", () => {
    const s = src(BATCH);
    assert.ok(s.includes("canManage"), "ownership gate present");
    assert.ok(s.includes("isInvitationEvent"), "single-source kind gate present");
    assert.ok(s.includes("Guest management is available only for invitation events"), "clear 404 copy");
    assert.ok(!s.includes("invitation-home"), "no home routing inside the API");
  });

  test("import engine writes the shared invitations table with no kind gate", () => {
    const s = src("lib/guest-import.ts");
    assert.ok(s.includes("executeAtomicBatchImport"), "atomic engine present");
    assert.ok(s.includes('from("event_invitations")'), "writes shared invitations");
    assert.ok(!s.includes("EVENT_KIND"), "no kind branching in the engine");
  });

  test("guests UI renders the CSV importer with no kind gate", () => {
    const s = src("app/dashboard/events/[id]/guests/GuestsClient.tsx");
    assert.ok(s.includes("BulkImportModal"), "CSV modal wired");
    assert.ok(!s.includes("kind ===") && !s.includes("kind !=="), "no kind branching");
  });

  test("invitation home Send reaches the same guests page", () => {
    const s = src("app/dashboard/events/[id]/invitation-home/InvitationHomeClient.tsx");
    assert.ok(s.includes("/guests"), "Send leads to the shared guests page");
  });
});
