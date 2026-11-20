/**
 * lib/staff/__tests__/errors.test.cjs
 *
 * Pure unit tests for mapStaffError: no I/O, no network, no DB. Verifies
 * the mapper against the real RAISE text and SQLSTATEs from
 * db/migration_231_staff_management.sql (see lib/staff/errors.ts's header
 * comment for exact line references), that no raw DB text ever leaks
 * through to the returned message, and that every case carries a stable
 * code for the UI to translate by.
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const originalResolveFilename = Module._resolveFilename;

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { mapStaffError, NOT_FOUND_OR_DENIED } = require("@/lib/staff/errors.ts");

describe("mapStaffError", () => {
  test("self-edit guard (staff_members_guard_self_edit, 42501) maps to code self_edit_only", () => {
    const result = mapStaffError({
      code: "42501",
      message: "Staff can only update their own phone, email and photo",
    });
    assert.equal(result.code, "self_edit_only");
    assert.equal(result.message, "You can only update your own phone, email and photo.");
  });

  test("the same self-edit message also covers 'branch manager moves self to another branch' (no separate RAISE exists for it)", () => {
    const result = mapStaffError({
      code: "42501",
      message: "Staff can only update their own phone, email and photo",
    });
    assert.equal(result.code, "self_edit_only");
  });

  test("each machine-readable hint maps to its code and exact English message", () => {
    const cases = [
      ["privileged_role_denied", "Your role isn't senior enough to assign that role."],
      ["permission_escalation_denied", "You can't grant a permission you don't have yourself."],
      ["all_branches_change_denied", "You don't have permission to change a staff member's all-branches access."],
      ["primary_branch_scope_delete_denied", "A staff member's home branch can't be removed from their branch access."],
      ["last_owner_removal_denied", "At least one owner must remain."],
      ["invitation_invalid", "This invitation isn't valid for this account, or it has expired."],
    ];
    for (const [hint, message] of cases) {
      const result = mapStaffError({ code: "42501", message: "some raw db text", hint });
      assert.equal(result.code, hint);
      assert.equal(result.message, message);
    }
  });

  test("hint wins over the message text", () => {
    const result = mapStaffError({
      code: "42501",
      message: "Staff can only update their own phone, email and photo",
      hint: "permission_escalation_denied",
    });
    assert.equal(result.code, "permission_escalation_denied");
    assert.equal(result.message, "You can't grant a permission you don't have yourself.");
  });

  test("invitation_invalid hint (247, SQLSTATE 42501) maps to its own code, not not_allowed, and leaks no raw text", () => {
    const raw = "invitation is not valid";
    const result = mapStaffError({ code: "42501", message: raw, hint: "invitation_invalid" });
    assert.equal(result.code, "invitation_invalid");
    assert.notEqual(result.code, "not_allowed");
    assert.notEqual(result.message, raw);
  });

  test("message fallbacks when no hint is present (240 rank guard, escalation guard)", () => {
    const senior = mapStaffError({
      code: "42501",
      message: "Only a sufficiently senior role can assign the admin role",
    });
    assert.equal(senior.code, "privileged_role_denied");
    assert.equal(senior.message, "Your role isn't senior enough to assign that role.");

    const escalation = mapStaffError({
      code: "42501",
      message: "Cannot grant a permission you do not hold yourself: orders.update",
    });
    assert.equal(escalation.code, "permission_escalation_denied");
    assert.equal(escalation.message, "You can't grant a permission you don't have yourself.");
  });

  test("unknown hint falls through to the SQLSTATE mapping", () => {
    const result = mapStaffError({ code: "42501", message: "anything", hint: "something_else" });
    assert.equal(result.code, "not_allowed");
  });

  test("the retired head-office text no longer maps to privileged_role_denied", () => {
    const result = mapStaffError({ code: "42501", message: "Only head office can assign the manager role" });
    assert.equal(result.code, "not_allowed");
  });

  test("duplicate login link (uq_staff_members_business_auth_user, 23505) maps to code duplicate_login", () => {
    const result = mapStaffError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "uq_staff_members_business_auth_user"',
    });
    assert.equal(result.code, "duplicate_login");
    assert.equal(result.message, "This login is already linked to another staff member in this business.");
  });

  test("composite branch FK violation (staff_members_branch_business_fk, 23503) maps to code branch_mismatch", () => {
    const result = mapStaffError({
      code: "23503",
      message:
        'insert or update on table "staff_members" violates foreign key constraint "staff_members_branch_business_fk"',
    });
    assert.equal(result.code, "branch_mismatch");
    assert.equal(result.message, "That branch doesn't belong to this business.");
  });

  test("plain RLS violation with no matching custom RAISE text falls back to code not_allowed", () => {
    const result = mapStaffError({
      code: "42501",
      message: 'new row violates row-level security policy for table "staff_members"',
    });
    assert.equal(result.code, "not_allowed");
    assert.equal(result.message, "You don't have permission to do that.");
  });

  test("this not_allowed fallback is exactly what covers: branch manager sees/edits only own branch, cannot create staff with no branch, cannot touch another branch -- none of those have custom RAISE text", () => {
    const result = mapStaffError({
      code: "42501",
      message: 'new row violates row-level security policy for table "staff_members"',
    });
    assert.equal(result.code, "not_allowed");
  });

  test("unknown error code/message falls back to code generic_error", () => {
    const result = mapStaffError({ code: "XXYYY", message: "some unexpected internal detail" });
    assert.equal(result.code, "generic_error");
    assert.equal(result.message, "Something went wrong. Please try again.");
  });

  test("missing code and message falls back to code generic_error", () => {
    const result = mapStaffError({});
    assert.equal(result.code, "generic_error");
    assert.equal(result.message, "Something went wrong. Please try again.");
  });

  test("never returns raw DB text verbatim for any mapped case", () => {
    const cases = [
      { code: "42501", message: "Staff can only update their own phone, email and photo" },
      { code: "42501", message: "Only head office can assign the owner role" },
      { code: "23505", message: 'duplicate key value violates unique constraint "uq_staff_members_business_auth_user"' },
      { code: "23503", message: 'violates foreign key constraint "staff_members_branch_business_fk"' },
      { code: "42501", message: 'new row violates row-level security policy for table "staff_members"' },
    ];
    for (const c of cases) {
      const result = mapStaffError(c);
      assert.notEqual(result.message, c.message, `mapStaffError leaked raw DB text for: ${c.message}`);
    }
  });

  test("every mapStaffError code is a non-empty string distinct from the raw SQLSTATE", () => {
    const cases = [
      { code: "42501", message: "Staff can only update their own phone, email and photo" },
      { code: "42501", message: "Only head office can assign the manager role" },
      { code: "23505", message: "duplicate key" },
      { code: "23503", message: "fk violation" },
      { code: "42501", message: "new row violates row-level security policy" },
      { code: "unknown", message: "??" },
    ];
    for (const c of cases) {
      const result = mapStaffError(c);
      assert.ok(typeof result.code === "string" && result.code.length > 0);
      assert.notEqual(result.code, c.code);
    }
  });

  test("NOT_FOUND_OR_DENIED carries its own distinct code and keeps the 'or no longer exists' meaning", () => {
    assert.equal(NOT_FOUND_OR_DENIED.code, "not_found_or_denied");
    assert.ok(NOT_FOUND_OR_DENIED.message.toLowerCase().includes("no longer exists"));
  });

  test("not_allowed and not_found_or_denied are two distinct codes, not one and not three", () => {
    const rlsResult = mapStaffError({ code: "42501", message: "new row violates row-level security policy" });
    assert.equal(rlsResult.code, "not_allowed");
    assert.equal(NOT_FOUND_OR_DENIED.code, "not_found_or_denied");
    assert.notEqual(rlsResult.code, NOT_FOUND_OR_DENIED.code);
  });
});
