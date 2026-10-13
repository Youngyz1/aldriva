/**
 * lib/__tests__/db-table-references.test.cjs
 *
 * Static guard (Phase 2b-2.2): every `.from("table")` name used under lib/
 * and app/ must exist as a CREATE TABLE (or known view) in db/ migrations.
 * Storage-bucket access (`*.storage.from("bucket")`) is excluded by shape,
 * not by name.
 *
 * Pinned known miss (pre-existing, outside ordering scope):
 * - "guests" (`app/dashboard/events/[id]/overview/page.tsx` counts a table
 *   no db/ migration creates). If it is fixed, remove it from the allowlist
 *   below — the stale-pin assertion will tell you.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");

function listFiles(dir, exts) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop();
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (exts.some((ext) => entry.name.endsWith(ext))) {
        out.push(full);
      }
    }
  }
  return out;
}

// Table/bucket names referenced via `.from("name")`, excluding
// storage-bucket access (`something.storage.from("bucket")`, possibly split
// across lines) and test files themselves.
function collectFromNames() {
  const names = new Map();
  for (const dir of [path.join(ROOT, "lib"), path.join(ROOT, "app")]) {
    for (const file of listFiles(dir, [".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs"])) {
      if (file.includes("__tests__") || /\.test\.[cm]?[jt]sx?$/.test(file)) continue;
      const src = fs.readFileSync(file, "utf8");
      const re = /\.from\(\s*["']([^"']+)["']\s*\)/g;
      let m;
      while ((m = re.exec(src)) !== null) {
        // `x.storage.from("bucket")`, possibly split across lines: the token
        // before `.from` (modulo whitespace) is `storage`. The `.` belongs
        // to the `.from` match itself, so look only for a trailing `storage`.
        const before = src.slice(Math.max(0, m.index - 120), m.index);
        if (/storage\s*$/.test(before)) continue;
        if (!names.has(m[1])) names.set(m[1], []);
        names.get(m[1]).push(path.relative(ROOT, file));
      }
    }
  }
  return names;
}

// Tables and views created by db/ forward migrations (rollbacks excluded).
// Handles `public.name`, `"public"."name"` and bare `name` spellings.
function collectDefinedRelations() {
  const tables = new Set();
  const views = new Set();
  for (const file of listFiles(path.join(ROOT, "db"), [".sql"])) {
    if (file.includes("rollback")) continue;
    const src = fs.readFileSync(file, "utf8");
    const tableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\s*\.\s*)?"?([A-Za-z_][A-Za-z0-9_]*)"?/gi;
    let m;
    while ((m = tableRe.exec(src)) !== null) tables.add(m[1]);
    const viewRe = /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:"?public"?\s*\.\s*)?"?([A-Za-z_][A-Za-z0-9_]*)"?/gi;
    while ((m = viewRe.exec(src)) !== null) views.add(m[1]);
  }
  return { tables, views };
}

// Pre-existing misses grandfathered with a reason. Never add ordering tables here.
const KNOWN_MISSING_TABLES = new Map([
  [
    "guests",
    "app/dashboard/events/[id]/overview/page.tsx counts a guests table no db/ migration creates",
  ],
]);

test("every code table reference resolves to a migrated table or known view", () => {
  const fromNames = collectFromNames();
  const { tables, views } = collectDefinedRelations();
  assert.ok(tables.size > 50, `expected a full schema parse, got ${tables.size} tables`);

  const missing = [...fromNames.keys()].filter((name) => !tables.has(name) && !views.has(name));
  const unexpected = missing.filter((name) => !KNOWN_MISSING_TABLES.has(name));
  assert.deepEqual(
    unexpected,
    [],
    unexpected
      .map((name) => `"${name}" referenced by ${(fromNames.get(name) || []).join(", ")} has no CREATE TABLE/VIEW in db/`)
      .join("\n")
  );

  const stale = [...KNOWN_MISSING_TABLES.keys()].filter((name) => !missing.includes(name));
  assert.deepEqual(stale, [], `pinned miss resolved — remove from KNOWN_MISSING_TABLES: ${stale.join(", ")}`);
});

test("ordering tables resolve (orders, tenant_websites, website_content, menu_items)", () => {
  const { tables } = collectDefinedRelations();
  for (const name of ["orders", "tenant_websites", "website_content", "website_content_drafts", "menu_items"]) {
    assert.ok(tables.has(name), `db/ must create table "${name}"`);
  }
});
