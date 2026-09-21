/**
 * lib/security/__tests__/dec0016-status-transitions.test.cjs
 *
 * Regression test for DEC-0016 approval policy implementation:
 * 1. Businesses, articles, and products can be published/activated without admin review.
 * 2. Crowdfunding campaigns (fundraisers) STRICTLY REQUIRE admin review — enforce_fundraiser_status_transition is NOT loosened.
 * 3. Migration 128 applies the trigger updates safely with rollback.
 * 4. createBusiness server action defaults to 'published'.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const MIGRATION_128 = path.join(
  ROOT,
  "db",
  "migration_128_website_draft_blocks_and_dec0016_status.sql"
);
const MIGRATION_128_ROLLBACK = path.join(
  ROOT,
  "db",
  "migration_128_website_draft_blocks_and_dec0016_status_rollback.sql"
);
const MIGRATION_105 = path.join(
  ROOT,
  "db",
  "migration_105_trigger_service_role_gate.sql"
);
const BUSINESS_ACTIONS = path.join(ROOT, "lib", "actions", "businesses.ts");

const sql128 = fs.readFileSync(MIGRATION_128, "utf8");
const sql128Rollback = fs.readFileSync(MIGRATION_128_ROLLBACK, "utf8");
const sql105 = fs.readFileSync(MIGRATION_105, "utf8");
const businessActionsCode = fs.readFileSync(BUSINESS_ACTIONS, "utf8");

test("migration_128 and its rollback exist in canonical db/ directory", () => {
  assert.ok(fs.existsSync(MIGRATION_128), "migration_128 must exist");
  assert.ok(fs.existsSync(MIGRATION_128_ROLLBACK), "migration_128_rollback must exist");
});

test("migration_128 allows non-admins to publish articles directly", () => {
  assert.ok(
    sql128.includes("CREATE OR REPLACE FUNCTION enforce_article_status_transition()"),
    "recreates enforce_article_status_transition"
  );
  // Extract non-admin check in enforce_article_status_transition
  const articleFn = sql128.slice(
    sql128.indexOf("FUNCTION enforce_article_status_transition()"),
    sql128.indexOf("FUNCTION enforce_business_status_transition()")
  );
  assert.ok(
    articleFn.includes("'published'"),
    "article status check must include 'published' in non-admin allowed list"
  );
});

test("migration_128 allows non-admins to publish businesses directly", () => {
  assert.ok(
    sql128.includes("CREATE OR REPLACE FUNCTION enforce_business_status_transition()"),
    "recreates enforce_business_status_transition"
  );
  const businessFn = sql128.slice(
    sql128.indexOf("FUNCTION enforce_business_status_transition()"),
    sql128.indexOf("FUNCTION enforce_product_status_transition()")
  );
  assert.ok(
    businessFn.includes("'published'"),
    "business status check must include 'published' in non-admin allowed list"
  );
});

test("migration_128 allows non-admins to activate products directly", () => {
  assert.ok(
    sql128.includes("CREATE OR REPLACE FUNCTION enforce_product_status_transition()"),
    "recreates enforce_product_status_transition"
  );
  const productFnStart = sql128.indexOf("FUNCTION enforce_product_status_transition()");
  const productFn = sql128.slice(productFnStart, productFnStart + 1000);
  assert.ok(
    productFn.includes("'active'"),
    "product status check must include 'active' in non-admin allowed list"
  );
});

test("enforce_fundraiser_status_transition is STRICTLY UNCHANGED (admin review still required)", () => {
  // migration_128 must NOT recreate or alter enforce_fundraiser_status_transition
  const codeOnly128 = sql128
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

  assert.ok(
    !codeOnly128.includes("enforce_fundraiser_status_transition"),
    "migration_128 must NOT define or alter enforce_fundraiser_status_transition"
  );

  // migration_105 definition must still enforce admin check for active fundraisers
  assert.ok(
    sql105.includes("FUNCTION enforce_fundraiser_status_transition()"),
    "migration_105 defines enforce_fundraiser_status_transition"
  );
  const fundraiserFnStart = sql105.indexOf("FUNCTION enforce_fundraiser_status_transition()");
  const fundraiserFn = sql105.slice(fundraiserFnStart, fundraiserFnStart + 1200);
  assert.ok(
    fundraiserFn.includes("IF NEW.status NOT IN ('pending_review') THEN"),
    "fundraiser status check allows only pending_review without admin"
  );
  assert.ok(
    fundraiserFn.includes("Only an admin can set fundraiser status to %"),
    "fundraiser transition to active/published raises exception for non-admins"
  );
});

test("createBusiness server action default status is 'published' per DEC-0016", () => {
  assert.ok(
    businessActionsCode.includes('status: "published"'),
    "createBusiness insert payload must specify status: 'published'"
  );
  assert.ok(
    !businessActionsCode.includes('status: "pending_review"'),
    "createBusiness must not set status: 'pending_review'"
  );
});

test("migration_128 rollback restores strict status checks", () => {
  assert.ok(
    sql128Rollback.includes("CREATE OR REPLACE FUNCTION enforce_article_status_transition()"),
    "rollback restores article trigger"
  );
  assert.ok(
    sql128Rollback.includes("CREATE OR REPLACE FUNCTION enforce_business_status_transition()"),
    "rollback restores business trigger"
  );
  assert.ok(
    sql128Rollback.includes("CREATE OR REPLACE FUNCTION enforce_product_status_transition()"),
    "rollback restores product trigger"
  );

  const rollbackBusinessFn = sql128Rollback.slice(
    sql128Rollback.indexOf("FUNCTION enforce_business_status_transition()"),
    sql128Rollback.indexOf("FUNCTION enforce_product_status_transition()")
  );
  assert.ok(
    rollbackBusinessFn.includes("IF NEW.status NOT IN ('pending_review', 'archived') THEN"),
    "rollback restores strict business check"
  );
});
