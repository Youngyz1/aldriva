/**
 * lib/__tests__/website-proxy-member-gate.test.cjs
 *
 * Stage S1 (W1): pins the proxy.ts draft-preview member query to the real
 * entity_members column (organizer_id, per db/migration_59_entity_members.sql:23).
 *
 * Hermetic static + pure tests per DEC-0012: no DB, no network.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function websiteGateRegion(src) {
  const start = src.indexOf("async function checkWebsiteAccess(");
  assert.ok(start !== -1, "checkWebsiteAccess helper must exist in proxy.ts");
  const end = src.indexOf("Ticketmaster existence-check helper", start);
  return end === -1 ? src.slice(start) : src.slice(start, end);
}

test("proxy website member query uses organizer_id (the real entity_members column)", () => {
  const region = websiteGateRegion(read("proxy.ts"));
  assert.ok(
    region.includes("entity_members?organizer_id=eq."),
    "member query must filter entity_members by organizer_id"
  );
});

test("proxy website member query does not use the non-existent entity_id column", () => {
  const region = websiteGateRegion(read("proxy.ts"));
  assert.ok(
    !region.includes("entity_id=eq."),
    "entity_id=eq. must not appear in the website gate (no such column)"
  );
});

test("entity_members schema actually has the organizer_id column the gate relies on", () => {
  const migration = read("db/migration_59_entity_members.sql");
  assert.ok(
    migration.includes("organizer_id UUID NOT NULL REFERENCES organizers(id)"),
    "migration_59 must define organizer_id FK to organizers(id)"
  );
  assert.ok(
    !/^.*\bentity_id UUID\b.*$/m.test(migration),
    "migration_59 must not define an entity_id column"
  );
});

test("website gate still falls back to platform-admin check after the member query", () => {
  const region = websiteGateRegion(read("proxy.ts"));
  assert.ok(
    region.includes("return isAuthorizedAdmin(userId)"),
    "admin fallback must survive the column fix"
  );
});
