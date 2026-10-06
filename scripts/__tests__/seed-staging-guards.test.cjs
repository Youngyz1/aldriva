const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { validateStagingTarget, KNOWN_PROD_REFS } = require("../seed-staging-invitation.cjs");

describe("seed-staging-invitation.cjs refusal guards", () => {
  test("refuses when running in a CI environment (CI=true)", () => {
    const err = validateStagingTarget(
      "postgresql://user:pass@db.my-staging-ref-999.supabase.co:5432/postgres",
      "my-staging-ref-999",
      true // isCi = true
    );
    assert.match(err, /must not execute in automated CI environments/i);
  });

  test("refuses when STAGING_PROJECT_REF is missing", () => {
    const err = validateStagingTarget("postgresql://user:pass@db.stagingref123.supabase.co:5432/postgres", "", false);
    assert.match(err, /STAGING_PROJECT_REF environment variable must be provided/i);
  });

  test("refuses when STAGING_PROJECT_REF matches production project ref", () => {
    for (const prodRef of KNOWN_PROD_REFS) {
      const err = validateStagingTarget(`postgresql://user:pass@db.${prodRef}.supabase.co:5432/postgres`, prodRef, false);
      assert.match(err, /matches a protected production project ref/i);
    }
  });

  test("refuses when STAGING_DATABASE_URL is missing", () => {
    const err = validateStagingTarget("", "my-staging-ref-999", false);
    assert.match(err, /STAGING_DATABASE_URL is not set/i);
  });

  test("refuses when target URL contains production project ref", () => {
    for (const prodRef of KNOWN_PROD_REFS) {
      const err = validateStagingTarget(`postgresql://user:pass@db.${prodRef}.supabase.co:5432/postgres`, "valid-staging-ref", false);
      assert.match(err, /Target URL contains a protected production project ref/i);
    }
  });

  test("refuses when target URL does not match STAGING_PROJECT_REF", () => {
    const err = validateStagingTarget("postgresql://user:pass@db.other-ref-111.supabase.co:5432/postgres", "my-staging-ref-999", false);
    assert.match(err, /Target URL does not match the specified STAGING_PROJECT_REF/i);
  });

  test("passes validation when target URL matches staging project ref, no prod ref, and not CI", () => {
    const err = validateStagingTarget("postgresql://user:pass@db.my-staging-ref-999.supabase.co:5432/postgres", "my-staging-ref-999", false);
    assert.equal(err, null);
  });
});
