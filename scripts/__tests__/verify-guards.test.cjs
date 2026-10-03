/**
 * Hermetic unit tests for scripts/verify-staging-db.cjs GUARDS ONLY.
 *
 * Never connects to a database. Asserts: refuses unset URL, refuses the
 * production ref, and never echoes the URL (or markers inside it) in any
 * refusal message.
 */
const assert = require("node:assert/strict");
const test = require("node:test");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { refusalReason, PROD_REF } = require("../verify-staging-db.cjs");

test("refuses unset URL", () => {
  assert.ok(refusalReason(undefined), "unset must refuse");
  assert.ok(refusalReason(""), "empty must refuse");
});

test("refuses the production ref", () => {
  assert.ok(
    refusalReason(`postgresql://user:pw@db.${PROD_REF}.supabase.co:5432/postgres`),
    "prod ref must refuse"
  );
});

test("accepts a staging-shaped URL", () => {
  assert.equal(refusalReason("postgresql://user:pw@db.stagingref.supabase.co:5432/postgres"), null);
});

test("refusal messages never echo the URL", () => {
  const marker = "MARKER-never-echo-zzz";
  const msg = refusalReason(`postgresql://user:${marker}@db.${PROD_REF}.supabase.co:5432/postgres`);
  assert.ok(msg, "must refuse");
  assert.ok(!msg.includes(marker), "refusal must not echo credential material");
  assert.ok(!msg.includes(PROD_REF), "refusal must not echo the URL");
});

test("script exits non-zero with no connection and prints no URL", () => {
  const script = path.resolve(__dirname, "..", "verify-staging-db.cjs");
  let out = "";
  try {
    execFileSync("node", [script], {
      env: { ...process.env, STAGING_DATABASE_URL: `postgresql://u:p@${PROD_REF}:5432/db` },
      encoding: "utf8",
    });
    assert.fail("must exit non-zero on refusal");
  } catch (e) {
    assert.notEqual(e.status, 0, "non-zero exit on refusal");
    out = String(e.stdout ?? "") + String(e.stderr ?? "");
    assert.ok(!out.includes(PROD_REF), "output must not echo the URL");
    assert.ok(/REFUSED/i.test(out), "refusal must be printed");
  }
});
