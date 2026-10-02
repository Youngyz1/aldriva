/**
 * Regression pins for components/admin/table/AdminTable.tsx row actions.
 * The menu/primary branches are JSX (no DOM under node --test), so like
 * p2-admin-page-gates these tests assert on source structure plus the pure
 * strings module: the ⋯ menu renders only for rows with menu items, the
 * trigger is never hover-only, and an href primary renders a Link on the
 * desktop, mobile-expansion, and sheet paths.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tableStrings } from "./strings.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "AdminTable.tsx"), "utf8");

test("actions column header reads Actions, not the screen-reader label", () => {
  assert.equal(tableStrings.actionsHeader, "Actions");
  assert.ok(src.includes("{s.actionsHeader}"), "header uses s.actionsHeader");
  assert.ok(
    src.includes("aria-label={s.moreActions}"),
    "trigger keeps the moreActions aria-label"
  );
});

test("desktop renders the menu only for rows that have menu items", () => {
  assert.ok(
    src.includes("{menu.length > 0 && <RowMenu items={menu} />}"),
    "desktop menu is conditional on menu items"
  );
});

test("row menu renders on desktop and mobile expansion, nowhere else", () => {
  const hits = src.split("<RowMenu items={menu} />").length - 1;
  assert.equal(hits, 2, "exactly desktop + mobile-expansion menus");
});

test("menu trigger is always visible, never hover-only", () => {
  assert.ok(!src.includes("opacity-0"), "no hover-only trigger");
  assert.ok(
    !src.includes("group-hover:opacity-100"),
    "no hover-reveal trigger"
  );
});

test("href primary renders a Link on desktop and mobile expansion", () => {
  const hits = src.split("(primary.href ? (").length - 1;
  assert.equal(hits, 2, "desktop + mobile-expansion href branches");
});

test("href primary renders a Link on the sheet path", () => {
  assert.ok(
    src.includes("sheetRow.actions.primary.href ? ("),
    "sheet href branch exists"
  );
});

test("mobile action row renders only with a menu or detail link", () => {
  assert.ok(
    src.includes("{(menu.length > 0 || row.detailHref) && ("),
    "mobile action row is gated"
  );
});
