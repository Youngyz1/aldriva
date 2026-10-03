/**
 * Unit tests for components/admin/table/logic.ts.
 * Run via the package.json test list (node --test, type-stripping).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  expandedReducer,
  lineForRole,
  pageRange,
  pluralize,
  rowToggleAria,
  selectIdentityActions,
  sortMenuActions,
  visibilityClass,
} from "./logic.ts";
import type { RowAction } from "./types.ts";

test("role mapping places columns on the right mobile line", () => {
  assert.equal(lineForRole("title"), "line1-left");
  assert.equal(lineForRole("value"), "line1-right");
  assert.equal(lineForRole("meta"), "line2");
  assert.equal(lineForRole("detail"), "expanded");
});

test("menu sort keeps order stable and moves destructive items last", () => {
  const menu: RowAction[] = [
    { key: "suspend", label: "Suspend", destructive: true },
    { key: "view", label: "View" },
    { key: "reject", label: "Reject Identity", destructive: true },
    { key: "promote", label: "Promote" },
  ];
  const sorted = sortMenuActions(menu);
  assert.deepEqual(
    sorted.map((a) => a.key),
    ["view", "promote", "suspend", "reject"]
  );
});

test("menu sort with no destructive items preserves order", () => {
  const menu: RowAction[] = [
    { key: "a", label: "A" },
    { key: "b", label: "B" },
  ];
  assert.deepEqual(
    sortMenuActions(menu).map((a) => a.key),
    ["a", "b"]
  );
});

test("expansion opens one row at a time", () => {
  assert.equal(expandedReducer(null, { type: "toggle", id: "a" }), "a");
  assert.equal(expandedReducer("a", { type: "toggle", id: "b" }), "b");
  assert.equal(expandedReducer("a", { type: "toggle", id: "a" }), null);
  assert.equal(expandedReducer("a", { type: "close" }), null);
  assert.equal(expandedReducer(null, { type: "close" }), null);
});

test("row toggle aria wires button to its panel", () => {
  assert.deepEqual(rowToggleAria(true, "row-1"), {
    "aria-expanded": true,
    "aria-controls": "row-details-row-1",
  });
  assert.deepEqual(rowToggleAria(false, "row-1"), {
    "aria-expanded": false,
    "aria-controls": "row-details-row-1",
  });
});

test("identity actions follow verification state", () => {
  assert.deepEqual(selectIdentityActions("pending"), [
    "identity_verify",
    "identity_reject",
  ]);
  assert.deepEqual(selectIdentityActions("verified"), ["identity_reject"]);
  assert.deepEqual(selectIdentityActions("rejected"), ["identity_verify"]);
  assert.deepEqual(selectIdentityActions("unknown"), []);
  assert.deepEqual(selectIdentityActions(""), []);
});

test("pluralization uses the singular form only for exactly one", () => {
  assert.equal(pluralize(1, "org", "orgs"), "1 org");
  assert.equal(pluralize(2, "org", "orgs"), "2 orgs");
  assert.equal(pluralize(0, "org", "orgs"), "0 orgs");
});

test("column priority maps to container-query visibility classes", () => {
  assert.equal(visibilityClass(), "");
  assert.equal(visibilityClass(undefined), "");
  assert.equal(visibilityClass("md"), "hidden @[800px]:table-cell");
  assert.equal(visibilityClass("lg"), "hidden @[1024px]:table-cell");
});

test("footer range math is 1-based over the rows actually shown", () => {
  assert.deepEqual(pageRange(1, 25, 23, 23), { start: 1, end: 23 });
  assert.deepEqual(pageRange(2, 25, 60, 25), { start: 26, end: 50 });
  assert.deepEqual(pageRange(3, 25, 60, 10), { start: 51, end: 60 });
  assert.deepEqual(pageRange(1, 25, 0, 0), { start: 0, end: 0 });
  assert.deepEqual(pageRange(1, 25, 7, 0), { start: 0, end: 0 });
});
