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
});
