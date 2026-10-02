/**
 * Unit tests for components/admin/page-strings.ts.
 * Run via the package.json test list (node --test, type-stripping).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { adminPageCopy, buildStats } from "./page-strings.ts";

test("buildStats returns no items while stats are loading", () => {
  const defs = [{ key: "total", label: "Total" }];
  assert.deepEqual(buildStats(defs, null), []);
  assert.deepEqual(buildStats(defs, undefined), []);
});

test("buildStats maps keys in order and reads missing keys as 0", () => {
  const defs = [
    { key: "total", label: "Total" },
    { key: "missing", label: "Missing" },
    { key: "nil", label: "Nil" },
  ];
  assert.deepEqual(
    buildStats(defs, { total: 7, nil: null }),
    [
      { label: "Total", value: 7, accent: undefined },
      { label: "Missing", value: 0, accent: undefined },
      { label: "Nil", value: 0, accent: undefined },
    ]
  );
});

test("buildStats passes state accents through untouched", () => {
  const items = buildStats(
    [{ key: "flagged", label: "Flagged", accent: "text-red-700" }],
    { flagged: 2 }
  );
  assert.equal(items[0].accent, "text-red-700");
  assert.equal(items[0].value, 2);
});

test("every admin page has header copy and unique stat keys", () => {
  for (const [page, copy] of Object.entries(adminPageCopy)) {
    assert.ok(copy.eyebrow.length > 0, `${page} eyebrow`);
    assert.ok(copy.title.length > 0, `${page} title`);
    assert.ok(copy.description.length > 0, `${page} description`);
    assert.ok(copy.empty.length > 0, `${page} empty message`);
    assert.ok(copy.stats.length > 0, `${page} stats`);
    const keys = copy.stats.map((s) => s.key);
    assert.equal(new Set(keys).size, keys.length, `${page} stat keys unique`);
  }
});

test("tab values are unique per page and include the all tab", () => {
  for (const [page, copy] of Object.entries(adminPageCopy)) {
    if (!copy.tabs) continue;
    const values = copy.tabs.map((t) => t.value);
    assert.equal(new Set(values).size, values.length, `${page} tab values unique`);
    assert.ok(values.includes("all"), `${page} has an all tab`);
  }
});
