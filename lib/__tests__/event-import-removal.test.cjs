/**
 * lib/__tests__/event-import-removal.test.cjs
 *
 * Round 3 COMMIT 3b: the Import Event feature is removed completely.
 * - /dashboard/events/new is exactly two options (public, invitation).
 * - Eventbrite sync page + API are gone (natural 404); /import redirects
 *   legacy event URLs to /dashboard/events/new; /api/import-url answers
 *   non-fundraiser modes with 410.
 * - No import-event strings remain in the EN/FR dictionaries.
 * - Guest CSV import (BulkImportModal, guests batch API) is untouched.
 * - Fundraiser import keeps working.
 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "../..");
function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}
function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

describe("new-event page is a two-way choice", () => {
  const NEW_PAGE = "app/dashboard/events/new/page.tsx";

  test("shows exactly two options and no import card", () => {
    const s = src(NEW_PAGE);
    assert.ok(s.includes("Create from scratch"), "public option present");
    assert.ok(s.includes("CreateInvitationCard"), "invitation option present");
    assert.ok(!s.includes("Import event"), "import card gone");
    assert.ok(!s.includes("Import Event"), "import CTA gone");
    assert.ok(!s.includes("/import"), "no link into /import remains");
  });

  test("grid has no dead third column", () => {
    const s = src(NEW_PAGE);
    assert.ok(!s.includes("lg:grid-cols-3"), "three-column layout removed");
    assert.ok(s.includes("md:grid-cols-2"), "two-column layout in place");
  });
});

describe("removed routes do not crash", () => {
  test("eventbrite sync page and API are deleted", () => {
    assert.ok(!exists("app/eventbrite-sync/page.tsx"), "sync page gone (404)");
    assert.ok(!exists("app/api/eventbrite-sync/route.ts"), "sync API gone (404)");
  });

  test("legacy event import URLs redirect to the two-way choice", () => {
    const s = src("app/import/page.tsx");
    assert.ok(s.includes('redirect("/dashboard/events/new")'), "redirect target");
    assert.ok(s.includes('mode !== "fundraisers"'), "non-fundraiser modes redirect");
    assert.ok(!s.includes('mode=events"') && !s.includes("mode=events'"), "no events-mode links left");
  });

  test("import-url API answers removed event mode with 410", () => {
    const s = src("app/api/import-url/route.ts");
    assert.ok(s.includes("410"), "gone status for event mode");
    assert.ok(s.includes('mode !== "fundraisers"'), "only fundraisers accepted");
    assert.ok(!s.includes('"events"'), "no events branch remains");
  });

  test("ticketmaster claim link no longer points at event import", () => {
    const s = src("app/external-events/ticketmaster/[id]/page.tsx");
    assert.ok(!s.includes("/import?mode=events"), "stale import deep-link gone");
    assert.ok(s.includes('href="/create-event"'), "organizers still have a path");
  });
});

describe("no import-event strings in dictionaries", () => {
  for (const dict of ["messages/en.json", "messages/fr.json"]) {
    test(`${dict} has no event-import copy`, () => {
      const raw = src(dict);
      assert.ok(!/import/i.test(raw), "no import copy at all");
      assert.ok(!/eventbrite/i.test(raw), "no eventbrite copy");
    });
  }
});

describe("guest CSV import is untouched", () => {
  test("guest batch API route still exists", () => {
    assert.ok(
      exists("app/api/events/[id]/guests/batch/route.ts"),
      "guests batch route present"
    );
  });

  test("BulkImportModal still exists and handles CSV", () => {
    const s = src("app/dashboard/events/[id]/guests/GuestsClient.tsx");
    assert.ok(s.includes("BulkImportModal"), "guest import modal present");
    assert.ok(s.includes("bulkImportModalOpen"), "guest import wiring intact");
    assert.ok(/csv/i.test(s), "guest CSV logic intact");
  });
});

describe("fundraiser import keeps working", () => {
  test("fundraiser choice page still links its import flow", () => {
    const s = src("app/dashboard/fundraisers/new/page.tsx");
    assert.ok(s.includes("/import?mode=fundraisers"), "fundraiser import link kept");
  });

  test("import client is fundraisers-only", () => {
    const s = src("app/import/ImportClient.tsx");
    assert.ok(s.includes("Import Fundraisers"), "fundraiser heading kept");
    assert.ok(s.includes('mode: "fundraisers"'), "URL preview sends fundraiser mode");
    assert.ok(!s.includes("event_date"), "no event fields remain");
    assert.ok(!s.includes("importEvents"), "no event import routine remains");
  });
});
