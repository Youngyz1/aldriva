/**
 * lib/__tests__/website-builder-hj.test.cjs
 * H+J — Controlled Layout Consistency + Section Reordering Hardening (J section)
 * Verifies stable-id selection, envelope preservation, history, persistence, public order.
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
if (!require.extensions[".tsx"]) require.extensions[".tsx"] = require.extensions[".ts"];

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key";

const blocksMod = require("../website-blocks.ts");
const normalizeBlocks = blocksMod.normalizeBlocks;
const validateBlock = blocksMod.validateBlock;

const builderReducerMod = require("../../components/dashboard/website/builder/builderReducer.ts");
const builderReducer = builderReducerMod.builderReducer;

function makeHero(overrides = {}) {
  return normalizeBlocks([Object.assign({ type: "hero", heading: "Hero" }, overrides)])[0];
}
function makeFeatures(overrides = {}) {
  return normalizeBlocks([Object.assign({ type: "features", heading: "Features", items: [{ title: "A" }, { title: "B" }] }, overrides)])[0];
}
function makeAbout(overrides = {}) {
  return normalizeBlocks([Object.assign({ type: "about", heading: "About", story: "Story" }, overrides)])[0];
}
function makeGallery(overrides = {}) {
  return normalizeBlocks([Object.assign({ type: "gallery", heading: "Gallery", images: [{ src: "https://example.com/a.jpg" }] }, overrides)])[0];
}
function baseState(blocks, selIdx = 0) {
  const block = blocks[selIdx];
  const blockId = block?.id ?? null;
  return {
    past: [], present: blocks, future: [],
    selectedBlockIndex: blocks.length ? selIdx : null,
    selection: blockId ? { type: "block", pageId: "p", blockId } : null,
    device: "desktop", sidebarTab: "add",
    isDirty: false, saveStatus: "idle", publishStatus: "idle", version: 0, lastSavedAt: null, hasDraft: false,
    validation: null, errorMessage: null, successMessage: null,
    pageId: "p", websiteId: "wid", pageSlug: "home", pageTitle: "Home", pageStatus: "draft",
    tenantId: "tid", websiteSlug: "test", canPublish: true, userRole: "owner", availableEmbedOptions: { events: [], products: [], fundraisers: [] },
    isDiscardModalOpen: false,
  };
}

// J2 — preserves
test("J2 preserves block ID/type/content/element IDs after MOVE_BLOCK", () => {
  const hero = makeHero({ heading: "HeroOne" });
  const feats = makeFeatures();
  const about = makeAbout();
  const featItemId = feats.items[0].id;
  const s0 = baseState([hero, feats, about], 1);
  // add envelope to hero to verify preservation
  const sEnvelope = builderReducer(s0, { type: "UPDATE_SECTION", blockId: hero.id, patch: { visible: false, spacing: "roomy", hiddenOnMobile: true, background: { color: "#fff7ed" } } });
  const s1 = builderReducer(sEnvelope, { type: "MOVE_BLOCK", fromIndex: 1, toIndex: 0 });
  // order: feats, heroWithEnv, about
  assert.equal(s1.present[0].id, feats.id, "features id preserved and moved to 0");
  assert.equal(s1.present[1].id, hero.id);
  assert.equal(s1.present[1].type, "hero");
  assert.equal(s1.present[1].heading, "HeroOne");
  assert.equal(s1.present[1].visible, false, "envelope visible preserved");
  assert.equal(s1.present[1].spacing, "roomy");
  assert.equal(s1.present[1].hiddenOnMobile, true);
  assert.equal(s1.present[1].background.color, "#fff7ed");
  assert.equal(s1.present[0].items[0].id, featItemId, "element ID preserved");
});

test("J2 preserves envelope background overlay/image", () => {
  const gal = makeGallery();
  const s0 = baseState([makeHero(), gal]);
  const s1 = builderReducer(s0, { type: "UPDATE_SECTION", blockId: gal.id, patch: { background: { color: "#fafafa", image: "https://project.supabase.co/bg.jpg", overlay: 0.5 } } });
  const s2 = builderReducer(s1, { type: "MOVE_BLOCK", fromIndex: 1, toIndex: 0 });
  assert.equal(s2.present[0].id, gal.id);
  assert.equal(s2.present[0].background.image, "https://project.supabase.co/bg.jpg");
  assert.equal(s2.present[0].background.overlay, 0.5);
  assert.equal(s2.present[0].background.color, "#fafafa");
});

test("J2 updates array order only", () => {
  const a = makeHero({ heading: "A" });
  const b = makeFeatures();
  const c = makeAbout();
  const s0 = baseState([a, b, c]);
  // Hero, Features, About -> Hero, About, Features
  const s1 = builderReducer(s0, { type: "MOVE_BLOCK", fromIndex: 2, toIndex: 1 });
  assert.deepEqual(s1.present.map(x => x.id), [a.id, c.id, b.id]);
  assert.deepEqual(s1.present.map(x => x.type), ["hero", "about", "features"]);
});

// selection preservation
test("J2 selected block remains selected by ID after move", () => {
  const a = makeHero({ heading: "A" });
  const b = makeFeatures();
  const c = makeGallery();
  const s0 = baseState([a, b, c], 1); // select b
  assert.equal(s0.selection.blockId, b.id);
  // move selected b down
  const s1 = builderReducer(s0, { type: "MOVE_BLOCK", fromIndex: 1, toIndex: 2 });
  assert.equal(s1.selection.blockId, b.id, "selection follows id");
  assert.equal(s1.selectedBlockIndex, 2);
  // move another block (a up past? a at 0 to 1)
  const s2 = builderReducer(s1, { type: "MOVE_BLOCK", fromIndex: 0, toIndex: 1 });
  // b should now be at 2 still or shift? Let's verify it stays selected
  assert.equal(s2.selection.blockId, b.id);
  assert.equal(s2.present.findIndex(x => x.id === b.id), 2);
});

test("J2 selected element remains associated with same block after reorder", () => {
  const feats = makeFeatures();
  const itemId = feats.items[0].id;
  const hero = makeHero();
  const state = baseState([hero, feats], 1);
  const selElem = builderReducer(state, { type: "SELECT_ELEMENT", blockId: feats.id, path: `items[${itemId}].title` });
  assert.equal(selElem.selection.type, "element");
  // move feats up to 0
  const moved = builderReducer(selElem, { type: "MOVE_BLOCK", fromIndex: 1, toIndex: 0 });
  assert.equal(moved.selection.type, "element");
  assert.equal(moved.selection.blockId, feats.id);
  assert.equal(moved.selection.path, `items[${itemId}].title`);
  assert.equal(moved.selectedBlockIndex, 0);
});

// history
test("J2 MOVE_BLOCK creates one history entry, undo/redo restores, redo cleared after new mutation", () => {
  const a = makeHero({ heading: "A" });
  const b = makeFeatures();
  const s0 = baseState([a, b]);
  const s1 = builderReducer(s0, { type: "MOVE_BLOCK", fromIndex: 1, toIndex: 0 });
  assert.equal(s1.past.length, 1, "one entry per move");
  assert.equal(s1.future.length, 0);
  assert.equal(s1.isDirty, true);
  const sUndo = builderReducer(s1, { type: "UNDO" });
  assert.deepEqual(sUndo.present.map(x => x.id), [a.id, b.id], "undo restores order");
  assert.equal(sUndo.present[1].type, "features");
  const sRedo = builderReducer(sUndo, { type: "REDO" });
  assert.deepEqual(sRedo.present.map(x => x.id), [b.id, a.id], "redo restores moved order");
  // redo cleared after new mutation
  const sNew = builderReducer(sUndo, { type: "UPDATE_SECTION", blockId: a.id, patch: { spacing: "roomy" } });
  assert.equal(sNew.future.length, 0, "future cleared after new mutation");
  assert.equal(sNew.past.length, 1); // sUndo had past 0, new push 1
});

// dirty and autosave receives updated array
test("J2 dirty true after move, autosave would receive reordered array", () => {
  const a = makeHero();
  const b = makeAbout();
  const s0 = baseState([a, b]);
  assert.equal(s0.isDirty, false);
  const s1 = builderReducer(s0, { type: "MOVE_BLOCK", fromIndex: 0, toIndex: 1 });
  assert.equal(s1.isDirty, true);
  assert.equal(s1.saveStatus, "idle");
  assert.deepEqual(s1.present.map(x => x.id), [b.id, a.id]);
});

// edge cases: first/last, duplicate then reorder, remove then reorder
test("J2 edge: move first/last/middle, duplicate then reorder, remove then reorder", () => {
  const a = makeHero({ heading: "A" });
  const b = makeFeatures();
  const c = makeGallery();
  let s = baseState([a, b, c]);
  // move first to last
  s = builderReducer(s, { type: "MOVE_BLOCK", fromIndex: 0, toIndex: 2 });
  assert.deepEqual(s.present.map(x => x.id), [b.id, c.id, a.id]);
  // move middle (c) to first
  s = builderReducer(s, { type: "MOVE_BLOCK", fromIndex: 1, toIndex: 0 });
  assert.deepEqual(s.present.map(x => x.id), [c.id, b.id, a.id]);
  // duplicate b (now at 1)
  s = builderReducer(s, { type: "DUPLICATE_BLOCK", index: 1 });
  const dup = s.present[2]; // duplicate of b at 2
  assert.notEqual(dup.id, b.id);
  assert.equal(dup.type, b.type);
  // reorder duplicate
  s = builderReducer(s, { type: "MOVE_BLOCK", fromIndex: 2, toIndex: 0 });
  assert.equal(s.present[0].id, dup.id);
  // remove first (dup) then reorder remainder
  s = builderReducer(s, { type: "REMOVE_BLOCK", index: 0 });
  assert.equal(s.present.length, 3);
  s = builderReducer(s, { type: "MOVE_BLOCK", fromIndex: 1, toIndex: 0 });
  assert.equal(s.present[0].id, b.id);
});

// J1 stable-id selection in BlockPalette
test("J1 BlockPalette selection uses stable blockId, key stable", () => {
  const src = fs.readFileSync(path.join(ROOT, "components/dashboard/website/builder/BlockPalette.tsx"), "utf8");
  assert.ok(src.includes("state.selection?.blockId === blockIdStable"), "Palette must compare via stable blockId");
  assert.ok(src.includes("blockIdStable ? `${block.type}-${blockIdStable}`"), "Palette key must be stable id");
  assert.ok(src.includes('aria-label={`Move section'), "move buttons must have aria-label");
  const wrapperSrc = fs.readFileSync(path.join(ROOT, "components/dashboard/website/builder/canvas/CanvasBlockWrapper.tsx"), "utf8");
  assert.ok(wrapperSrc.includes('aria-label={`Move'), "Canvas wrapper move buttons must have aria-label");
});

// J3 persistence order preserved, no sorting, no migration
test("J3 persistence: order preserved through normalize/validate, no sort_order, no migration", () => {
  const blocks = [makeHero({ heading: "A" }), makeAbout(), makeFeatures()];
  const reordered = [blocks[2], blocks[0], blocks[1]];
  const norm = normalizeBlocks(reordered);
  assert.deepEqual(norm.map(x => x.id), reordered.map(x => x.id), "normalizeBlocks preserves order");
  const vblocks = reordered.map(b => validateBlock(b).data);
  assert.deepEqual(vblocks.map(x => x.id), reordered.map(x => x.id), "validateBlock preserves order");
  // public rendering maps in order
  const pubSrc = fs.readFileSync(path.join(ROOT, "app/site/[slug]/[[...page]]/page.tsx"), "utf8");
  assert.ok(pubSrc.includes("blocks.map((block, idx) =>"), "public page must map blocks in array order");
  assert.equal(pubSrc.includes("sort("), false, "must not sort blocks");
  // no migration for section controls (business taxonomy 132 allowed)
  const has132 = fs.existsSync(path.join(ROOT, "db/migration_132_section_controls.sql"));
  const hasM132Supa = fs.existsSync(path.join(ROOT, "supabase/migrations")) && fs.readdirSync(path.join(ROOT, "supabase/migrations")).some(f => f.includes("132_section_controls"));
  assert.equal(has132, false);
  assert.equal(hasM132Supa, false);
  // H buttons: BlockRenderer should use buttonVariants for consistency
  const rendererSrc = fs.readFileSync(path.join(ROOT, "components/site/blocks/BlockRenderer.tsx"), "utf8");
  assert.ok(rendererSrc.includes("buttonVariants"), "BlockRenderer should reuse buttonVariants for H4");
  assert.ok(rendererSrc.includes('cn(buttonVariants'), "should use cn + buttonVariants");
});

// H checks (light)
test("H preservation: H1-H6 controls remain, no arbitrary CSS, no new schema", () => {
  const blockSrc = fs.readFileSync(path.join(ROOT, "lib/website-blocks.ts"), "utf8");
  assert.ok(blockSrc.includes('type: "hero"'), "hero still defined");
  assert.ok(blockSrc.includes('SectionEnvelope'), "envelope preserved");
  // section-helpers exists
  const helperSrc = fs.readFileSync(path.join(ROOT, "lib/section-helpers.ts"), "utf8");
  assert.ok(helperSrc.includes("getSpacingClass"));
  // SectionInspector has controlled presets, no arbitrary hex picker v2
  const secSrc = fs.readFileSync(path.join(ROOT, "components/dashboard/website/builder/inspectors/SectionInspector.tsx"), "utf8");
  assert.ok(secSrc.includes("Background Color") && secSrc.includes("Controlled presets"), "H5 controlled presets");
  assert.equal(secSrc.includes('type="color"'), false, "must not have arbitrary color picker");
  // responsive hardening
  const paletteSrc = fs.readFileSync(path.join(ROOT, "components/dashboard/website/builder/BlockPalette.tsx"), "utf8");
  assert.ok(paletteSrc.includes("w-[min(20rem,85vw)]"), "H7 palette responsive");
  const clientSrc = fs.readFileSync(path.join(ROOT, "components/dashboard/website/builder/WebsiteBuilderClient.tsx"), "utf8");
  assert.ok(clientSrc.includes("w-[min(24rem,90vw)]"), "H7 inspector responsive");
});
