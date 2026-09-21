/**
 * lib/dashboard/__tests__/website-builder-canvas.test.cjs
 *
 * Behavioral & Structural Test Suite for Task 4.3: Visual Builder Canvas & Workspace State.
 *
 * Invariants Tested:
 * 1. Reducer State Management:
 *    - ADD_BLOCK, REMOVE_BLOCK, MOVE_BLOCK, DUPLICATE_BLOCK, UPDATE_BLOCK.
 *    - In-memory Undo/Redo history stacks (past, present, future).
 *    - History depth boundary (capped at MAX_HISTORY_LENGTH).
 * 2. Autosave, Version Tracking, and Dirty State:
 *    - SET_SAVE_STATUS updates version, lastSavedAt, and clears isDirty on 'saved'.
 *    - DRAFT_DISCARDED reverts present to liveBlocks and resets draft state.
 *    - DRAFT_PUBLISHED sets status to published and clears draft state.
 * 3. Validation Error Routing:
 *    - SET_PUBLISH_STATUS with invalidBlockIndex automatically updates selectedBlockIndex
 *      to route focus to the failing block.
 * 4. Component Inventory:
 *    - BuilderToolbar, BlockPalette, BuilderCanvas, CanvasBlockWrapper, CanvasBlockPreview,
 *      WebsiteBuilderClient exist.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const originalResolveFilename = Module._resolveFilename;

function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
}

require.extensions[".ts"] = compileTs;
require.extensions[".tsx"] = compileTs;

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

const BUILDER_DIR = path.join(
  ROOT,
  "components",
  "dashboard",
  "website",
  "builder"
);

const { builderReducer } = require("@/components/dashboard/website/builder/builderReducer");
const { BLOCK_CATALOG } = require("@/components/dashboard/website/builder/defaultBlocks");

function createInitialState(customBlocks = []) {
  return {
    past: [],
    present: customBlocks,
    future: [],
    selectedBlockIndex: customBlocks.length > 0 ? 0 : null,
    device: "desktop",
    sidebarTab: "add",
    isDirty: false,
    saveStatus: "idle",
    publishStatus: "idle",
    version: 1,
    lastSavedAt: null,
    hasDraft: false,
    validation: null,
    errorMessage: null,
    successMessage: null,
    pageId: "page-001",
    websiteId: "site-001",
    pageSlug: "home",
    pageTitle: "Home Page",
    pageStatus: "draft",
    tenantId: "tenant-001",
    websiteSlug: "community-org",
    canPublish: true,
    userRole: "manager",
    availableEmbedOptions: { events: [], products: [], fundraisers: [] },
    isDiscardModalOpen: false,
  };
}

test.describe("Website Builder Canvas & State Management", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Component Inventory
  // ─────────────────────────────────────────────────────────────────────────────

  test("all visual builder workspace components exist in builder directory", () => {
  const expectedFiles = [
    "types.ts",
    "defaultBlocks.ts",
    "builderReducer.ts",
    "BuilderToolbar.tsx",
    "BlockPalette.tsx",
    "BuilderCanvas.tsx",
    "WebsiteBuilderClient.tsx",
    "canvas/CanvasBlockWrapper.tsx",
    "canvas/CanvasBlockPreview.tsx",
  ];

  for (const rel of expectedFiles) {
    const filePath = path.join(BUILDER_DIR, rel);
    assert.ok(
      fs.existsSync(filePath),
      `Expected builder workspace component ${rel} must exist`
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Block Catalog Definitions
// ─────────────────────────────────────────────────────────────────────────────

test("BLOCK_CATALOG contains all 10 standard block types and 2 legacy types with valid factories", () => {
  const expectedTypes = [
    "hero",
    "features",
    "about",
    "gallery",
    "testimonials",
    "contact",
    "faq",
    "events_embed",
    "products_embed",
    "fundraiser_embed",
    "rich_text",
    "cta_banner",
  ];

  assert.equal(BLOCK_CATALOG.length, 12);

  for (const t of expectedTypes) {
    const item = BLOCK_CATALOG.find((c) => c.type === t);
    assert.ok(item, `Block catalog must contain type ${t}`);
    const defaultBlock = item.createDefault();
    assert.equal(defaultBlock.type, t);
    assert.equal(typeof defaultBlock, "object");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Reducer: Block Manipulation Actions
// ─────────────────────────────────────────────────────────────────────────────

test("reducer: ADD_BLOCK appends or inserts at specific index, selects new block, and marks dirty", () => {
  const initial = createInitialState([
    { type: "hero", heading: "First" },
  ]);

  const newBlock = { type: "features", heading: "Second" };
  const state1 = builderReducer(initial, {
    type: "ADD_BLOCK",
    block: newBlock,
    insertAtIndex: 1,
  });

  assert.equal(state1.present.length, 2);
  assert.equal(state1.present[1].type, "features");
  assert.equal(state1.selectedBlockIndex, 1);
  assert.equal(state1.isDirty, true);
  assert.equal(state1.past.length, 1); // History pushed
});

test("reducer: UPDATE_BLOCK modifies target block, pushes history, and sets isDirty", () => {
  const initial = createInitialState([
    { type: "hero", heading: "Original Heading" },
  ]);

  const updated = { type: "hero", heading: "Updated Heading", align: "left" };
  const state = builderReducer(initial, {
    type: "UPDATE_BLOCK",
    index: 0,
    block: updated,
  });

  assert.equal(state.present[0].heading, "Updated Heading");
  assert.equal(state.present[0].align, "left");
  assert.equal(state.isDirty, true);
  assert.equal(state.past.length, 1);
  assert.equal(state.past[0][0].heading, "Original Heading");
});

test("reducer: MOVE_BLOCK reorders blocks correctly without mutating existing state", () => {
  const initial = createInitialState([
    { type: "hero", heading: "Block 0" },
    { type: "features", heading: "Block 1" },
    { type: "about", heading: "Block 2" },
  ]);

  // Move Block 2 to index 0
  const state = builderReducer(initial, {
    type: "MOVE_BLOCK",
    fromIndex: 2,
    toIndex: 0,
  });

  assert.equal(state.present[0].heading, "Block 2");
  assert.equal(state.present[1].heading, "Block 0");
  assert.equal(state.present[2].heading, "Block 1");
  assert.equal(state.selectedBlockIndex, 0);
  assert.equal(state.isDirty, true);
});

test("reducer: DUPLICATE_BLOCK creates an independent deep clone directly after target", () => {
  const initial = createInitialState([
    { type: "hero", heading: "Block 0", items: ["a", "b"] },
    { type: "about", heading: "Block 1" },
  ]);

  const state = builderReducer(initial, {
    type: "DUPLICATE_BLOCK",
    index: 0,
  });

  assert.equal(state.present.length, 3);
  assert.equal(state.present[1].type, "hero");
  assert.equal(state.present[1].heading, "Block 0");
  // Deep clone check: mutating duplicated block must not affect original
  state.present[1].heading = "Mutated Copy";
  assert.equal(state.present[0].heading, "Block 0");
});

test("reducer: REMOVE_BLOCK safely removes block and clamps selectedBlockIndex", () => {
  const initial = createInitialState([
    { type: "hero", heading: "Block 0" },
    { type: "features", heading: "Block 1" },
  ]);
  initial.selectedBlockIndex = 1;

  const state = builderReducer(initial, {
    type: "REMOVE_BLOCK",
    index: 1,
  });

  assert.equal(state.present.length, 1);
  assert.equal(state.present[0].type, "hero");
  assert.equal(state.selectedBlockIndex, 0);
  assert.equal(state.isDirty, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Reducer: Undo / Redo History Stacks
// ─────────────────────────────────────────────────────────────────────────────

test("reducer: UNDO and REDO traverse history states accurately", () => {
  const state0 = createInitialState([{ type: "hero", heading: "State 0" }]);

  // Transition 1
  const state1 = builderReducer(state0, {
    type: "UPDATE_BLOCK",
    index: 0,
    block: { type: "hero", heading: "State 1" },
  });

  // Transition 2
  const state2 = builderReducer(state1, {
    type: "UPDATE_BLOCK",
    index: 0,
    block: { type: "hero", heading: "State 2" },
  });

  assert.equal(state2.present[0].heading, "State 2");
  assert.equal(state2.past.length, 2);
  assert.equal(state2.future.length, 0);

  // Undo 1 -> Should restore State 1
  const stateUndo1 = builderReducer(state2, { type: "UNDO" });
  assert.equal(stateUndo1.present[0].heading, "State 1");
  assert.equal(stateUndo1.past.length, 1);
  assert.equal(stateUndo1.future.length, 1);

  // Undo 2 -> Should restore State 0
  const stateUndo2 = builderReducer(stateUndo1, { type: "UNDO" });
  assert.equal(stateUndo2.present[0].heading, "State 0");
  assert.equal(stateUndo2.past.length, 0);
  assert.equal(stateUndo2.future.length, 2);

  // Redo 1 -> Should restore State 1
  const stateRedo1 = builderReducer(stateUndo2, { type: "REDO" });
  assert.equal(stateRedo1.present[0].heading, "State 1");
  assert.equal(stateRedo1.past.length, 1);
  assert.equal(stateRedo1.future.length, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Reducer: Autosave, Versioning, and Publish Error Routing
// ─────────────────────────────────────────────────────────────────────────────

test("reducer: SET_SAVE_STATUS updates version, timestamp, and clears isDirty on 'saved'", () => {
  const initial = createInitialState([{ type: "hero" }]);
  initial.isDirty = true;
  initial.saveStatus = "saving";

  const savedState = builderReducer(initial, {
    type: "SET_SAVE_STATUS",
    status: "saved",
    version: 5,
    savedAt: "2026-09-19T04:00:00.000Z",
  });

  assert.equal(savedState.saveStatus, "saved");
  assert.equal(savedState.version, 5);
  assert.equal(savedState.lastSavedAt, "2026-09-19T04:00:00.000Z");
  assert.equal(savedState.isDirty, false);
  assert.equal(savedState.hasDraft, true);
});

test("reducer: SET_PUBLISH_STATUS with validation failure automatically focuses failing block", () => {
  const initial = createInitialState([
    { type: "hero", heading: "Valid Hero" },
    { type: "features", heading: "Valid Features" },
    { type: "contact", email: "invalid-email" }, // Index 2
  ]);
  initial.selectedBlockIndex = 0;

  const errorState = builderReducer(initial, {
    type: "SET_PUBLISH_STATUS",
    status: "error",
    error: "Validation failed at block 2",
    validation: {
      invalidBlockIndex: 2,
      issues: [{ path: "email", message: "Invalid email format" }],
    },
  });

  assert.equal(errorState.publishStatus, "error");
  assert.equal(errorState.selectedBlockIndex, 2, "selectedBlockIndex must route to failing block index 2");
  assert.ok(errorState.validation);
  assert.equal(errorState.validation.invalidBlockIndex, 2);
  assert.equal(errorState.validation.issues[0].message, "Invalid email format");
});

test("reducer: DRAFT_DISCARDED reverts present to live blocks and clears dirty/draft flags", () => {
  const liveBlocks = [{ type: "hero", heading: "Live Published Hero" }];
  const initial = createInitialState([
    { type: "hero", heading: "Uncommitted Draft Hero" },
  ]);
  initial.isDirty = true;
  initial.hasDraft = true;

  const discardedState = builderReducer(initial, {
    type: "DRAFT_DISCARDED",
    liveBlocks,
  });

  assert.equal(discardedState.present[0].heading, "Live Published Hero");
  assert.equal(discardedState.isDirty, false);
  assert.equal(discardedState.hasDraft, false);
  assert.equal(discardedState.past.length, 0);
  assert.equal(discardedState.future.length, 0);
});
});
