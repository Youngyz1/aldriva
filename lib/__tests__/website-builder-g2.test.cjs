/**
 * lib/__tests__/website-builder-g2.test.cjs
 * G2 — Section Controls (Visibility, HideOnMobile, Spacing, Background)
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: "react" },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
if (!require.extensions[".tsx"]) {
  require.extensions[".tsx"] = require.extensions[".ts"];
}

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key";

const blocksMod = require("../website-blocks.ts");
const normalizeBlocks = blocksMod.normalizeBlocks;
const cloneBlockWithNewIds = blocksMod.cloneBlockWithNewIds;
const isBlockVisible = blocksMod.isBlockVisible;
const validateBlock = blocksMod.validateBlock;

const sectionHelpers = require("../section-helpers.ts");
const getSpacingClass = sectionHelpers.getSpacingClass;
const getHiddenOnMobileClass = sectionHelpers.getHiddenOnMobileClass;
const getBackgroundStyle = sectionHelpers.getBackgroundStyle;
const isValidSpacing = sectionHelpers.isValidSpacing;

const builderReducerMod = require("../../components/dashboard/website/builder/builderReducer.ts");
const builderReducer = builderReducerMod.builderReducer;
const registryMod = require("../website-template-registry.ts");
const TEMPLATE_REGISTRY = registryMod.TEMPLATE_REGISTRY;

function makeHero(overrides = {}) {
  const base = Object.assign({ type: "hero", heading: "Hello" }, overrides);
  return normalizeBlocks([base])[0];
}
function makeFeatures() {
  return normalizeBlocks([{ type: "features", heading: "Features", items: [{ title: "A" }, { title: "B" }] }])[0];
}
function baseState(blocks) {
  const firstId = blocks[0]?.id ?? null;
  return {
    past: [], present: blocks, future: [],
    selectedBlockIndex: blocks.length ? 0 : null,
    selection: firstId ? { type: "block", pageId: "p", blockId: firstId } : null,
    device: "desktop", sidebarTab: "add",
    isDirty: false, saveStatus: "idle", publishStatus: "idle", version: 0, lastSavedAt: null, hasDraft: false,
    validation: null, errorMessage: null, successMessage: null,
    pageId: "p", websiteId: "wid", pageSlug: "home", pageTitle: "Home", pageStatus: "draft",
    tenantId: "tid", websiteSlug: "test", canPublish: true, userRole: "owner", availableEmbedOptions: { events: [], products: [], fundraisers: [] },
    isDiscardModalOpen: false,
  };
}

// ── Section visibility ──
test("G2 visibility: default visible", () => {
  const b = makeHero();
  assert.equal(isBlockVisible(b), true);
  assert.equal(b.visible, undefined);
});

test("G2 visibility: hide section remains in data, hidden not destroyed", () => {
  const b = makeHero();
  const state = baseState([b]);
  const after = builderReducer(state, { type: "UPDATE_SECTION", blockId: b.id, patch: { visible: false } });
  assert.equal(after.present[0].visible, false);
  assert.equal(isBlockVisible(after.present[0]), false);
  assert.equal(after.present.length, 1, "hidden remains in data");
  assert.equal(after.present[0].heading, "Hello");
  assert.equal(after.isDirty, true);
  assert.equal(after.past.length, 1);
});

test("G2 visibility: show again", () => {
  const b = makeHero({ visible: false });
  const state = baseState([b]);
  const after = builderReducer(state, { type: "UPDATE_SECTION", blockId: b.id, patch: { visible: true } });
  assert.equal(isBlockVisible(after.present[0]), true);
  assert.equal(after.present[0].visible, true);
});

test("G2 visibility: hidden section remains reorderable and editable (not deleted)", () => {
  const b1 = makeHero({ heading: "One" });
  const b2 = makeFeatures();
  // hide first
  const s1 = builderReducer(baseState([b1, b2]), { type: "UPDATE_SECTION", blockId: b1.id, patch: { visible: false } });
  assert.equal(s1.present[0].visible, false);
  // move hidden block
  const s2 = builderReducer(s1, { type: "MOVE_BLOCK", fromIndex: 0, toIndex: 1 });
  assert.equal(s2.present[1].id, b1.id);
  assert.equal(isBlockVisible(s2.present[1]), false);
  // still editable via element
  const s3 = builderReducer(s2, { type: "UPDATE_ELEMENT", blockId: b1.id, path: "heading", value: "Updated" });
  assert.equal(s3.present[1].heading, "Updated");
});

// ── Mobile visibility ──
test("G2 hiddenOnMobile: toggle and helper", () => {
  const b = makeHero();
  assert.equal((b.hiddenOnMobile ?? false), false);
  const s1 = builderReducer(baseState([b]), { type: "UPDATE_SECTION", blockId: b.id, patch: { hiddenOnMobile: true } });
  assert.equal(s1.present[0].hiddenOnMobile, true);
  assert.equal(getHiddenOnMobileClass(true), "hidden sm:block");
  assert.equal(getHiddenOnMobileClass(false), "");
  const s2 = builderReducer(s1, { type: "UPDATE_SECTION", blockId: b.id, patch: { hiddenOnMobile: false } });
  assert.equal(s2.present[0].hiddenOnMobile, false);
});

// ── Spacing ──
test("G2 spacing: valid values accepted", () => {
  assert.ok(isValidSpacing("compact"));
  assert.ok(isValidSpacing("default"));
  assert.ok(isValidSpacing("roomy"));
  assert.equal(isValidSpacing("large"), false);
  assert.equal(isValidSpacing(undefined), false);
  assert.equal(getSpacingClass("compact"), "py-6 sm:py-8");
  assert.equal(getSpacingClass("default"), "py-12 sm:py-16");
  assert.equal(getSpacingClass("roomy"), "py-16 sm:py-24");
  assert.equal(getSpacingClass(undefined), "py-12 sm:py-16");
});

test("G2 spacing: reducer update and invalid rejected", () => {
  const b = makeHero();
  const s1 = builderReducer(baseState([b]), { type: "UPDATE_SECTION", blockId: b.id, patch: { spacing: "roomy" } });
  assert.equal(s1.present[0].spacing, "roomy");
  const s2 = builderReducer(s1, { type: "UPDATE_SECTION", blockId: b.id, patch: { spacing: "compact" } });
  assert.equal(s2.present[0].spacing, "compact");
  // invalid spacing ignored (remains compact)
  const s3 = builderReducer(s2, { type: "UPDATE_SECTION", blockId: b.id, patch: { spacing: "huge" } });
  assert.equal(s3.present[0].spacing, "compact", "invalid spacing must be rejected");
});

// ── Background ──
test("G2 background: valid values accepted, reducer sanitizes", () => {
  const b = makeHero();
  const s1 = builderReducer(baseState([b]), { type: "UPDATE_SECTION", blockId: b.id, patch: { background: { color: "#f4f4f5" } } });
  assert.equal(s1.present[0].background.color, "#f4f4f5");
  const s2 = builderReducer(s1, { type: "UPDATE_SECTION", blockId: b.id, patch: { background: { color: "#ff0000", image: "https://project.supabase.co/bg.jpg", overlay: 0.5 } } });
  assert.equal(s2.present[0].background.color, "#ff0000");
  assert.equal(s2.present[0].background.image, "https://project.supabase.co/bg.jpg");
  assert.equal(s2.present[0].background.overlay, 0.5);
  const style = getBackgroundStyle(s2.present[0].background);
  assert.equal(style.backgroundColor, "#ff0000");
  assert.ok(String(style.backgroundImage).includes("https://project.supabase.co/bg.jpg"));
});

test("G2 background: invalid values rejected/cleared", () => {
  const b = makeHero();
  const s1 = builderReducer(baseState([b]), { type: "UPDATE_SECTION", blockId: b.id, patch: { background: { image: "javascript:alert(1)" } } });
  assert.equal(s1.present[0].background, undefined, "javascript URL must be stripped, background cleared");
  const hb = makeHero({ background: { color: "#fff" } });
  const sClear = builderReducer(baseState([hb]), { type: "UPDATE_SECTION", blockId: hb.id, patch: { background: undefined } });
  assert.equal(sClear.present[0].background, undefined);
});

// ── Selection co-existence ──
test("G2 selection: section selection works, element preserves parent", () => {
  const feat = makeFeatures();
  const itemId = feat.items[0].id;
  const state = baseState([feat]);
  const selBlock = builderReducer(state, { type: "SELECT_BLOCK_BY_ID", blockId: feat.id });
  assert.equal(selBlock.selection.type, "block");
  const selElem = builderReducer(selBlock, { type: "SELECT_ELEMENT", blockId: feat.id, path: `items[${itemId}].title` });
  assert.equal(selElem.selection.type, "element");
  assert.equal(selElem.selection.blockId, feat.id);
  assert.equal(selElem.selectedBlockIndex, 0);
});

test("G2 selection: section controls remain available when element selected", () => {
  const src = fs.readFileSync(path.join(ROOT, "components/dashboard/website/builder/inspectors/BlockInspector.tsx"), "utf8");
  assert.ok(src.includes("SectionInspector"), "BlockInspector must import SectionInspector");
  // SectionInspector rendered before element conditional, outside isElementMode branch
  const sectionIdx = src.indexOf("SectionInspector");
  const elementIdx = src.indexOf("isElementMode && fieldDef");
  assert.ok(sectionIdx !== -1 && elementIdx !== -1 && sectionIdx < elementIdx, "Section controls must be rendered before element controls and outside conditional");
  assert.ok(src.includes("onSectionChange"), "BlockInspector must accept onSectionChange");
});

// ── History ──
test("G2 history: one entry per section action, undo/redo restores", () => {
  const b = makeHero();
  const s0 = baseState([b]);
  const s1 = builderReducer(s0, { type: "UPDATE_SECTION", blockId: b.id, patch: { visible: false } });
  assert.equal(s1.past.length, 1);
  assert.equal(s1.future.length, 0);
  const s2 = builderReducer(s1, { type: "UPDATE_SECTION", blockId: b.id, patch: { spacing: "roomy" } });
  assert.equal(s2.past.length, 2);
  const sUndo = builderReducer(s2, { type: "UNDO" });
  assert.equal(sUndo.present[0].spacing, undefined);
  assert.equal(isBlockVisible(sUndo.present[0]), false);
  const sRedo = builderReducer(sUndo, { type: "REDO" });
  assert.equal(sRedo.present[0].spacing, "roomy");
  assert.equal(sRedo.present[0].visible, false);
});

// ── Persistence ──
test("G2 persistence: envelope survives normalization and validation", () => {
  const raw = { type: "hero", heading: "Test", visible: false, spacing: "roomy", hiddenOnMobile: true, background: { color: "#f4f4f5", overlay: 0.25 } };
  const norm = normalizeBlocks([raw])[0];
  assert.equal(norm.visible, false);
  assert.equal(norm.spacing, "roomy");
  assert.equal(norm.hiddenOnMobile, true);
  assert.equal(norm.background.color, "#f4f4f5");
  assert.equal(norm.background.overlay, 0.25);
  const v = validateBlock(norm);
  assert.equal(v.success, true);
  assert.equal(v.data.visible, false);
  assert.equal(v.data.spacing, "roomy");
  assert.equal(v.data.background.color, "#f4f4f5");
  // legacy without envelope must still render
  const legacy = normalizeBlocks([{ type: "about", heading: "Hi" }])[0];
  assert.equal(isBlockVisible(legacy), true);
  assert.equal(legacy.spacing, undefined);
});

test("G2 persistence: public rendering respects visible/hiddenOnMobile", () => {
  const pubSrc = fs.readFileSync(path.join(ROOT, "components/site/blocks/BlockRenderer.tsx"), "utf8");
  assert.ok(pubSrc.includes("isBlockVisible"), "BlockRenderer must check isBlockVisible");
  assert.ok(pubSrc.includes("SectionEnvelopeWrapper"), "BlockRenderer must use envelope wrapper");
  assert.ok(pubSrc.includes("getHiddenOnMobileClass") || pubSrc.includes("hiddenOnMobile"), "BlockRenderer must handle hiddenOnMobile");
  assert.ok(pubSrc.includes("getBackgroundStyle") && pubSrc.includes("getSpacingClass"), "BlockRenderer must handle spacing/background via helpers");
});

// ── Immutability ──
test("G2 immutability: canonical templates unchanged, cloning does not mutate", () => {
  const tpl = TEMPLATE_REGISTRY[0];
  const before = JSON.stringify(tpl);
  const b = tpl.pages[0].blocks[0];
  const cloned = cloneBlockWithNewIds(b);
  assert.notEqual(cloned.id, b.id);
  assert.equal(JSON.stringify(tpl), before, "template must remain immutable after clone");
  const state = baseState([cloned]);
  const after = builderReducer(state, { type: "UPDATE_SECTION", blockId: cloned.id, patch: { visible: false, spacing: "roomy" } });
  assert.equal(after.present[0].visible, false);
  assert.equal(tpl.pages[0].blocks[0].visible, undefined, "template block must not gain visible");
});

test("G2 immutability: section update does not mutate previous state", () => {
  const b = makeHero();
  const s0 = baseState([b]);
  const s1 = builderReducer(s0, { type: "UPDATE_SECTION", blockId: b.id, patch: { hiddenOnMobile: true } });
  assert.equal(s0.present[0].hiddenOnMobile, undefined, "previous state must not be mutated");
  assert.equal(s1.present[0].hiddenOnMobile, true);
});

// ── Security / rendering ──
test("G2 security: no editor metadata leaks to public", () => {
  const pubSrc = fs.readFileSync(path.join(ROOT, "components/site/blocks/BlockRenderer.tsx"), "utf8");
  assert.equal(pubSrc.includes("data-element-path"), false);
  assert.equal(pubSrc.includes("ring-brand-600"), false);
  const wrapperSrc = fs.readFileSync(path.join(ROOT, "components/dashboard/website/builder/canvas/CanvasBlockWrapper.tsx"), "utf8");
  assert.ok(wrapperSrc.includes("getSpacingClass") && wrapperSrc.includes("getBackgroundStyle"), "builder preview must use same helpers as public");
  assert.ok(wrapperSrc.includes("EyeOff") && wrapperSrc.includes("Hidden"), "builder must show hidden indicator, not hide completely");
});

test("G2 security: arbitrary background schemes rejected in reducer", () => {
  const b = makeHero();
  const after = builderReducer(baseState([b]), { type: "UPDATE_SECTION", blockId: b.id, patch: { background: { image: "data:text/html;base64,evil", color: "#fff" } } });
  // image with data:text/html should be stripped via sanitizeUrl
  const bg = after.present[0].background;
  if (bg && bg.image) assert.equal(bg.image.includes("data:text/html"), false, "dangerous image URL must be rejected");
});

test("G2 out-of-scope: no new migration, no Puck, no drag reorder added", () => {
  const pkg = fs.readFileSync(path.join(ROOT, "package.json"), "utf8");
  assert.equal(pkg.includes('"puck"'), false, "must not add Puck");
  assert.equal(pkg.includes("dnd-kit") || pkg.includes("@dnd-kit"), false, "must not add dnd-kit in G2");
  const reducerSrc = fs.readFileSync(path.join(ROOT, "components/dashboard/website/builder/builderReducer.ts"), "utf8");
  assert.ok(reducerSrc.includes("UPDATE_SECTION"), "reducer must handle UPDATE_SECTION");
  // ensure we didn't create migration 132 for section controls (business taxonomy 132 is allowed)
  const has132Section = fs.existsSync(path.join(ROOT, "db/migration_132_section_controls.sql")) || (fs.existsSync(path.join(ROOT, "supabase/migrations")) && fs.readdirSync(path.join(ROOT, "supabase/migrations")).some(f => f.includes("132_section_controls")));
  assert.equal(has132Section, false, "must not create migration 132 for section controls");
});
