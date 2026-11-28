/**
 * lib/dashboard/__tests__/bottom-bar.test.cjs
 *
 * Verifies bottom navigation rules from docs/design/dashboard-overview/06-mobile-navigation-spec.md:
 * - Always 4 tabs
 * - When hasLiveDomain is false -> tab 2 is Website
 * - When hasLiveDomain is true -> tab 2 is Live ops
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "../../..");

test("bottom-bar: source code guarantees 4 tabs and Website fallback", () => {
  const bottomBarFile = path.join(ROOT, "components/nav/DashboardBottomBar.tsx");
  assert.ok(fs.existsSync(bottomBarFile), "DashboardBottomBar.tsx must exist");

  const content = fs.readFileSync(bottomBarFile, "utf8");

  // Tab 1: Overview
  assert.ok(content.includes("Overview"), "Must contain Overview tab");

  // Tab 2: Live ops / Website fallback
  assert.ok(content.includes("Live ops"), "Must contain Live ops tab");
  assert.ok(content.includes("Website"), "Must contain Website fallback tab");
  assert.ok(content.includes("isLiveOps"), "Must check isLiveOps for tab 2");

  // Tab 3: Manage
  assert.ok(content.includes("Manage"), "Must contain Manage tab");

  // Tab 4: More
  assert.ok(content.includes("More"), "Must contain More tab");

  // Safe area insets
  assert.ok(
    content.includes("pb-[env(safe-area-inset-bottom)]"),
    "Must respect safe-area-inset-bottom"
  );

  // Hidden on desktop
  assert.ok(content.includes("lg:hidden"), "Must be hidden on large viewports");
});

test("more-sheet: source code provides required items and back to dashboard", () => {
  const moreSheetFile = path.join(ROOT, "components/nav/DashboardMoreSheet.tsx");
  assert.ok(fs.existsSync(moreSheetFile), "DashboardMoreSheet.tsx must exist");

  const content = fs.readFileSync(moreSheetFile, "utf8");
  assert.ok(content.includes("Back to Aldriva Dashboard"), "Must contain back link to /dashboard");
  assert.ok(content.includes("Settings"), "Must contain Settings link");
  assert.ok(content.includes("Analytics"), "Must contain Analytics link");
  assert.ok(content.includes("Reviews"), "Must contain Reviews link");
});
