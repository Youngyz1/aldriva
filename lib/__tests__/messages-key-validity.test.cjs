/**
 * lib/__tests__/messages-key-validity.test.cjs
 *
 * next-intl rejects message keys containing ".". This test guards against
 * re-introducing dotted keys and enforces that the en and fr message files
 * share an identical key set under the Bookings namespace.
 * Source-level only: no DB, no render, no network.
 */

const assert = require("node:assert/strict");
const { test, describe } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

// Walk every depth and collect fully-qualified paths of every key whose own
// name contains "." (next-intl treats any key segment with "." as invalid).
function collectDottedKeys(obj, prefix = "") {
  const found = [];
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return found;
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof key === "string" && key.includes(".")) {
      found.push(full);
    }
    found.push(...collectDottedKeys(value, full));
  }
  return found;
}

// Collect every fully-qualified key path under a namespace (leaves and
// intermediate namespace paths), so any structural or key-set drift is caught.
function allKeyPaths(obj, prefix = "") {
  const set = new Set();
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return set;
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    set.add(full);
    for (const p of allKeyPaths(value, full)) set.add(p);
  }
  return set;
}

describe("messages key validity", () => {
  test("en.json has no dotted message keys at any depth", () => {
    const en = readJson("messages/en.json");
    const offenders = collectDottedKeys(en);
    assert.equal(
      offenders.length,
      0,
      `dotted keys found in en.json: ${offenders.join(", ")}`
    );
  });

  test("fr.json has no dotted message keys at any depth", () => {
    const fr = readJson("messages/fr.json");
    const offenders = collectDottedKeys(fr);
    assert.equal(
      offenders.length,
      0,
      `dotted keys found in fr.json: ${offenders.join(", ")}`
    );
  });

  test("en and fr have identical key sets under the Bookings namespace", () => {
    const en = readJson("messages/en.json");
    const fr = readJson("messages/fr.json");
    assert.ok(en.Bookings, "en missing Bookings namespace");
    assert.ok(fr.Bookings, "fr missing Bookings namespace");
    const enKeys = allKeyPaths(en.Bookings, "Bookings");
    const frKeys = allKeyPaths(fr.Bookings, "Bookings");
    const missingInFr = [...enKeys].filter((k) => !frKeys.has(k));
    const missingInEn = [...frKeys].filter((k) => !enKeys.has(k));
    assert.equal(
      missingInFr.length,
      0,
      `Bookings keys in en but missing in fr: ${missingInFr.join(", ")}`
    );
    assert.equal(
      missingInEn.length,
      0,
      `Bookings keys in fr but missing in en: ${missingInEn.join(", ")}`
    );
  });

  // OrgDashboardSidebar.tsx looks up Organizer.<label.toLowerCase()> for
  // every nav item label (see app/dashboard/org/[id]/OrgDashboardSidebar.tsx);
  // a key missing from either file renders the literal "Organizer.<key>"
  // dotted path in the sidebar instead of real text.
  test("en and fr have identical key sets under the Organizer namespace", () => {
    const en = readJson("messages/en.json");
    const fr = readJson("messages/fr.json");
    assert.ok(en.Organizer, "en missing Organizer namespace");
    assert.ok(fr.Organizer, "fr missing Organizer namespace");
    const enKeys = allKeyPaths(en.Organizer, "Organizer");
    const frKeys = allKeyPaths(fr.Organizer, "Organizer");
    const missingInFr = [...enKeys].filter((k) => !frKeys.has(k));
    const missingInEn = [...frKeys].filter((k) => !enKeys.has(k));
    assert.equal(
      missingInFr.length,
      0,
      `Organizer keys in en but missing in fr: ${missingInFr.join(", ")}`
    );
    assert.equal(
      missingInEn.length,
      0,
      `Organizer keys in fr but missing in en: ${missingInEn.join(", ")}`
    );
  });

  test("Organizer.branches and Organizer.staff exist and are real translations, not placeholders", () => {
    const en = readJson("messages/en.json");
    const fr = readJson("messages/fr.json");
    assert.equal(en.Organizer.branches, "Branches");
    assert.equal(en.Organizer.staff, "Staff");
    assert.equal(fr.Organizer.branches, "Succursales");
    assert.equal(fr.Organizer.staff, "Personnel");
    assert.notEqual(en.Organizer.branches, fr.Organizer.branches);
    assert.notEqual(en.Organizer.staff, fr.Organizer.staff);
  });

  test("Organizer.workforce exists and is a real translation, not a placeholder", () => {
    const en = readJson("messages/en.json");
    const fr = readJson("messages/fr.json");
    assert.equal(en.Organizer.workforce, "Workforce");
    assert.equal(fr.Organizer.workforce, "Effectifs");
    assert.notEqual(en.Organizer.workforce, fr.Organizer.workforce);
  });

  test("en and fr have identical key sets under the Workforce namespace", () => {
    const en = readJson("messages/en.json");
    const fr = readJson("messages/fr.json");
    assert.ok(en.Workforce, "en missing Workforce namespace");
    assert.ok(fr.Workforce, "fr missing Workforce namespace");
    const enKeys = allKeyPaths(en.Workforce, "Workforce");
    const frKeys = allKeyPaths(fr.Workforce, "Workforce");
    const missingInFr = [...enKeys].filter((k) => !frKeys.has(k));
    const missingInEn = [...frKeys].filter((k) => !enKeys.has(k));
    assert.equal(missingInFr.length, 0, `Workforce keys in en but missing in fr: ${missingInFr.join(", ")}`);
    assert.equal(missingInEn.length, 0, `Workforce keys in fr but missing in en: ${missingInEn.join(", ")}`);
  });

  // Every stable error code returned by lib/staff/errors.ts,
  // lib/staff/phone-validation.ts, lib/staff/photo-validation.ts,
  // lib/branches/rules.ts, lib/actions/staff-members.ts, and
  // lib/actions/business-branches.ts must have real en and fr text under
  // Workforce, keyed by the exact code string (so the UI's translateByCode
  // helper can do a direct t(code) lookup with no mapping table).
  test("every stable error code has en and fr text under Workforce", () => {
    const en = readJson("messages/en.json");
    const fr = readJson("messages/fr.json");
    const codes = [
      "name_length",
      "email_invalid",
      "phone_invalid",
      "employment_type_invalid",
      "status_invalid",
      "self_edit_only",
      "privileged_role_denied",
      "duplicate_login",
      "branch_mismatch",
      "not_allowed",
      "not_found_or_denied",
      "generic_error",
      "label_length",
      "branch_not_found",
      "branch_main_required",
      "branch_archive_main_denied",
      "branch_activate_required",
      "duplicate_main",
      "photo_invalid",
    ];
    for (const code of codes) {
      assert.ok(typeof en.Workforce[code] === "string" && en.Workforce[code].length > 0, `en missing Workforce.${code}`);
      assert.ok(typeof fr.Workforce[code] === "string" && fr.Workforce[code].length > 0, `fr missing Workforce.${code}`);
      assert.notEqual(en.Workforce[code], fr.Workforce[code], `Workforce.${code} is identical in en and fr (likely untranslated)`);
    }
  });

  test("not_found_or_denied keeps the 'no longer exists' meaning in both languages", () => {
    const en = readJson("messages/en.json");
    const fr = readJson("messages/fr.json");
    assert.ok(/no longer exists/i.test(en.Workforce.not_found_or_denied));
    assert.ok(/n'existe plus/i.test(fr.Workforce.not_found_or_denied));
  });

  test("not_allowed and not_found_or_denied are two distinct, non-empty translations in both languages", () => {
    const en = readJson("messages/en.json");
    const fr = readJson("messages/fr.json");
    assert.notEqual(en.Workforce.not_allowed, en.Workforce.not_found_or_denied);
    assert.notEqual(fr.Workforce.not_allowed, fr.Workforce.not_found_or_denied);
  });

  // Staff profile page (app/dashboard/org/[id]/staff/[staffId]/page.tsx)
  // strings, keyed sp* to match the existing st*/br*/sf* grouping convention.
  test("every staff-profile-page key has real en and fr text under Workforce", () => {
    const en = readJson("messages/en.json");
    const fr = readJson("messages/fr.json");
    const keys = [
      "spBackToStaff",
      "spBranchLabel",
      "spEmploymentTypeLabel",
      "spDepartmentLabel",
      "spPhoneLabel",
      "spEmailLabel",
      "spNotProvided",
    ];
    for (const key of keys) {
      assert.ok(typeof en.Workforce[key] === "string" && en.Workforce[key].length > 0, `en missing Workforce.${key}`);
      assert.ok(typeof fr.Workforce[key] === "string" && fr.Workforce[key].length > 0, `fr missing Workforce.${key}`);
      assert.notEqual(en.Workforce[key], fr.Workforce[key], `Workforce.${key} is identical in en and fr (likely untranslated)`);
    }
  });
});
