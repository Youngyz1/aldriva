"use strict";

// Phase 6F — action menus, safe SVG reset, workspace integrity.
//
// Covers the actual behavior changed by 6F:
//  - permission-gated row actions (pure helper semantics)
//  - menus preserve every action incl. destructive delete + confirmations
//  - reset reuses existing protection/save paths (no second delete system)
//  - Manual/AI/SVG still share one canonical engine + persistence path
//  - de-boxing removed only the named parent frames

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const { describe, it } = require("node:test");
const ts = require("typescript");

// --- TypeScript + @/ alias resolver (mirrors ai-seating-assistant.test.cjs) ---
const ROOT = path.resolve(__dirname, "../../..");
const originalResolveFilename = Module._resolveFilename;
require.extensions[".ts"] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
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
    return originalResolveFilename.call(
      this,
      path.join(ROOT, request.slice(2)),
      parent,
      isMain,
      options
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { getDashboardEventActionIds } = require("@/lib/dashboard-event-actions.ts");

function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Phase 6F — permission-gated actions", () => {
  it("A: scanner role sees scan only", () => {
    assert.deepEqual(getDashboardEventActionIds("ticket_scanner"), ["scan"]);
  });

  it("B: owners (and unknown roles) keep full actions incl. destructive delete", () => {
    for (const role of ["owner", undefined, null]) {
      const ids = getDashboardEventActionIds(role);
      for (const a of ["checkins", "scan", "team", "edit", "delete"]) {
        assert.ok(ids.includes(a), `${role} must include ${a}`);
      }
    }
  });

  it("C: non-owner staff lose edit/delete but keep operations", () => {
    const ids = getDashboardEventActionIds("event_manager");
    assert.ok(ids.includes("checkins") && ids.includes("scan") && ids.includes("team"));
    assert.ok(!ids.includes("edit") && !ids.includes("delete"));
  });

  it("D: Events rows render one menu preserving every action + delete confirm", () => {
    const s = src("app/dashboard/events/EventsClient.tsx");
    assert.ok(s.includes("RowActionsMenu"), "rows use the shared menu");
    assert.ok(!s.includes(">Check-Ins</Link>"), "no inline Check-Ins pill");
    assert.ok(s.includes("/checkins") && s.includes("/scan") && s.includes("/team"), "ops hrefs kept");
    assert.ok(s.includes("/events/edit/"), "edit href kept");
    assert.ok(s.includes("setDeleteTarget(row)"), "delete still opens the confirm dialog");
    assert.ok(s.includes("AdminConfirmDialog"), "delete confirmation preserved");
    assert.ok(s.includes("Scan Tickets"), "scanner-only single action preserved");
  });

  it("E: platform rows use the shared menu; destructive stays separated", () => {
    for (const f of [
      "app/dashboard/fundraisers/FundraisersClient.tsx",
      "app/dashboard/products/ProductRowActions.tsx",
      "app/dashboard/businesses/BusinessRowActions.tsx",
    ]) {
      assert.ok(src(f).includes("RowActionsMenu"), `${f} uses the shared menu`);
    }
    const menu = src("components/dashboard/RowActionsMenu.tsx");
    assert.ok(menu.includes("DropdownMenuSeparator"), "destructive section separated");
    assert.ok(menu.includes("text-red-600"), "destructive styled red");
    assert.ok(menu.includes("DropdownMenuPortal") || menu.includes("Portal"), "portal avoids table clipping");
    assert.ok(menu.includes("aria-label"), "trigger labelled for keyboard/screen readers");
    assert.ok(menu.includes("modal={false}"), "non-modal so page scroll keeps working");
  });

  it("F: product/business deletes keep server action + confirm via hidden form", () => {
    for (const f of [
      "app/dashboard/products/ProductRowActions.tsx",
      "app/dashboard/businesses/BusinessRowActions.tsx",
    ]) {
      const s = src(f);
      assert.ok(s.includes("action={onDelete}"), `${f} keeps the server action`);
      assert.ok(s.includes("confirm("), `${f} keeps the confirm`);
      assert.ok(s.includes("requestSubmit"), `${f} menu triggers the hidden form`);
    }
    assert.ok(
      src("app/dashboard/products/ProductRowActions.tsx").includes("canDelete"),
      "product archive-gate preserved"
    );
  });
});

describe("Phase 6F — safe SVG reset", () => {
  it("G: reset exists, confirms, and reuses protection (no second delete system)", () => {
    const s = src("app/dashboard/events/[id]/seating/VenueBuilder.tsx");
    assert.ok(s.includes("handleResetLayout"), "reset handler exists");
    assert.ok(s.includes('aria-label="Reset layout"'), "reset is labelled");
    assert.ok(s.includes("window.confirm"), "reset confirms (workspace convention)");
    assert.ok(s.includes("checkLayoutProtection"), "reset reuses existing protection");
    assert.ok(s.includes("sold/assigned"), "confirm names the protected state");
    assert.ok(s.includes("Nothing is deleted until you save"), "confirm states save semantics");
    assert.ok(s.includes("setHasUnsavedChanges(true)"), "reset marks workspace dirty");
  });

  it("H: reset clears workspace state only; persistence stays on the old path", () => {
    const s = src("app/dashboard/events/[id]/seating/VenueBuilder.tsx");
    assert.ok(s.includes("setSeats((prev) => prev.filter"), "reset filters local seats");
    assert.ok(s.includes("setVenueObjects([])"), "reset clears venue objects");
    assert.ok(s.includes("setSections([])"), "reset clears section defs");
    assert.ok(!s.includes('op: "reset"'), "no new reset API op");
    assert.ok(!s.includes("/seating/reset"), "no new reset endpoint");
    assert.ok(s.includes('op: "save_layout"'), "save still uses the existing pipeline");
    assert.ok(s.includes("deleteIds"), "cleared seats flow through existing deleteIds");
  });

  it("I: protected seats survive reset (sold/assigned kept locally)", () => {
    const s = src("app/dashboard/events/[id]/seating/VenueBuilder.tsx");
    assert.ok(s.includes("protection.protectedSeats"), "kept set comes from protection");
    assert.ok(s.includes("keptIds.has(s.id)"), "only protected ids survive the filter");
  });
});

describe("Phase 6F — one seating system + de-boxing", () => {
  it("J: Manual/AI/SVG still share the canonical engine and persistence", () => {
    const manual = src("app/dashboard/events/[id]/seating/ManualBuilder.tsx");
    assert.ok(manual.includes("generateCanonicalSeatingPlan"), "manual uses canonical engine");
    assert.ok(manual.includes("combineSeatingForSave"), "manual uses existing save combine");
    const panel = src("app/dashboard/events/[id]/seating/AiAssistantPanel.tsx");
    assert.ok(panel.includes("onApplyConfig"), "AI still hands off to Manual Builder");
    const route = src("app/api/events/[id]/seating/ai-assistant/route.ts");
    assert.ok(!route.includes("createSupabaseAdmin"), "AI route still cannot touch the DB");
    assert.ok(!route.includes(".from("), "AI route still has no queries");
  });

  it("K: only the named parent frames were removed; real boundaries kept", () => {
    const scanner = src("app/dashboard/events/[id]/scan/ScannerClient.tsx");
    assert.ok(
      !scanner.includes("rounded-2xl border border-zinc-200/80 bg-white overflow-hidden shadow-sm"),
      "scanner page frame removed"
    );
    assert.ok(scanner.includes("aspect-square"), "camera surface kept");
    assert.ok(scanner.includes("border-emerald-300"), "result status card kept");
    const manual = src("app/dashboard/events/[id]/seating/ManualBuilder.tsx");
    assert.ok(
      !manual.includes("flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-xs"),
      "manual header card flattened"
    );
    assert.ok(manual.includes("Save Seating Plan"), "manual controls intact");
  });
});
