/**
 * Stage 16 (B1f) — every Workforce page calls requireAdmin() BEFORE any data
 * access. Extends the p2-admin-page-gates inventory (which pins presence)
 * with ordering: the auth gate must precede createSupabaseServer() and the
 * first data fetch or select call. Static source evidence — hermetic.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const WORKFORCE = path.join(ROOT, "app", "admin", "workforce");

function pages(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) pages(full, out);
    else if (entry.name === "page.tsx") out.push(full);
  }
  return out;
}

test("requireAdmin() precedes all data access on every Workforce page", () => {
  const files = pages(WORKFORCE);
  assert.ok(files.length >= 12, `expected 12+ workforce pages, found ${files.length}`);
  for (const f of files) {
    const rel = path.relative(ROOT, f).split(path.sep).join("/");
    const src = fs.readFileSync(f, "utf8");
    if (/^"use client"/m.test(src)) continue; // client pages: enforcement in called routes
    const gate = src.indexOf("await requireAdmin()");
    assert.ok(gate !== -1, `${rel} must call requireAdmin()`);
    const clientAt = src.indexOf("createSupabaseServer()");
    if (clientAt !== -1) {
      assert.ok(gate < clientAt, `${rel}: requireAdmin() must precede createSupabaseServer()`);
    }
    // First data access: fetch* call or .from( — must come after the gate.
    const fetchAt = [...src.matchAll(/\bawait (fetch\w+)\(/g)].map((m) => m.index ?? -1).filter((i) => i >= 0);
    const fromAt = [...src.matchAll(/\.from\(/g)].map((m) => m.index ?? -1);
    const firstData = Math.min(...[...fetchAt, ...fromAt].filter((i) => i >= 0), Infinity);
    if (firstData !== Infinity) {
      assert.ok(gate < firstData, `${rel}: requireAdmin() must precede first data access`);
    }
  }
});
