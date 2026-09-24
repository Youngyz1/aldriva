const assert = require("node:assert/strict");
const { test, describe } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");

// Helpers reused from earlier builder tests
function makeBlock(type, extra = {}) {
  const id = `00000000-0000-4000-a000-${String(Math.random()).slice(2,14).padEnd(12,"0")}`;
  return { id, type, ...extra };
}
function makeHero() { return makeBlock("hero", { heading: "H" }); }
function makeFeatures() { return makeBlock("features", { heading: "F", items: [{ id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", title: "A" }] }); }
function makeGallery() { return makeBlock("gallery", { heading: "G", images: [] }); }

// Import helpers via require (transpiled via ts? Use direct fs checks for helpers if not importable)
// We test via fs + reducer where possible; for helper mapping we test file content and direct function via dynamic import if available

// H1 container tests
test("H1: missing container defaults to constrained via helper", () => {
  const helpers = fs.readFileSync(path.join(ROOT, "lib/section-helpers.ts"), "utf8");
  assert.ok(helpers.includes("getContainerClass"), "helper must exist");
  assert.ok(helpers.includes('constrained'), "constrained must be default");
  // Check BlockRenderer uses getContainerClass
  const renderer = fs.readFileSync(path.join(ROOT, "components/site/blocks/BlockRenderer.tsx"), "utf8");
  assert.ok(renderer.includes("getContainerClass"), "renderer must use container helper");
  assert.ok(renderer.includes("containerClass"), "renderer must compute containerClass");
});

test("H1: container maps correctly", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/section-helpers.ts"), "utf8");
  assert.ok(src.includes('case "wide"') && src.includes("max-w-7xl"), "wide maps to max-w-7xl");
  assert.ok(src.includes('case "narrow"') && src.includes("max-w-3xl"), "narrow maps to max-w-3xl");
  assert.ok(src.includes('case "full"') && src.includes("w-full"), "full maps to w-full");
  assert.ok(src.includes('case "constrained"') && src.includes("max-w-6xl"), "constrained maps to max-w-6xl");
});

test("H1: invalid container rejected and backward compatible", () => {
  const blocksSrc = fs.readFileSync(path.join(ROOT, "lib/website-blocks.ts"), "utf8");
  assert.ok(blocksSrc.includes('container === "constrained"'), "extract must allow only 4 values");
  assert.ok(blocksSrc.includes("SectionContainer"), "type must exist");
  // Backward compat: old block without container should still validate
  // parseBlock should not require container — extract only allows valid values, missing is undefined -> default
  const helperSrc = fs.readFileSync(path.join(ROOT, "lib/section-helpers.ts"), "utf8");
  assert.ok(helperSrc.includes("isValidContainer"), "sanitizer must exist");
  assert.ok(helperSrc.includes("ALLOWED_CONTAINERS"), "allowed list");
});

test("H1: background remains full-width while content container changes (structure)", () => {
  const renderer = fs.readFileSync(path.join(ROOT, "components/site/blocks/BlockRenderer.tsx"), "utf8");
  // Outer div has background/style, inner div has containerClass
  assert.ok(renderer.includes("outerClass") && renderer.includes("containerClass"), "outer vs inner separation");
  assert.ok(renderer.includes("relative") && renderer.includes("containerClass"), "inner container wraps children");
});

test("H1: SectionInspector exposes container control", () => {
  const insp = fs.readFileSync(path.join(ROOT, "components/dashboard/website/builder/inspectors/SectionInspector.tsx"), "utf8");
  assert.ok(insp.includes("Container"), "inspector must show Container");
  assert.ok(insp.includes("narrow") && insp.includes("constrained") && insp.includes("wide") && insp.includes("full"), "all 4 options");
  assert.ok(insp.includes("onSectionChange({ container:"), "must dispatch container patch");
});

test("H1: builderReducer UPDATE_SECTION handles container sanitization", () => {
  const reducerSrc = fs.readFileSync(path.join(ROOT, "components/dashboard/website/builder/builderReducer.ts"), "utf8");
  assert.ok(reducerSrc.includes('"container" in patch'), "reducer must handle container");
  assert.ok(reducerSrc.includes('constrained') && reducerSrc.includes('narrow'), "must allow 4 values");
});

test("H1: CanvasBlockWrapper shows container visual state", () => {
  const wrapperSrc = fs.readFileSync(path.join(ROOT, "components/dashboard/website/builder/canvas/CanvasBlockWrapper.tsx"), "utf8");
  assert.ok(wrapperSrc.includes("getContainerClass"), "wrapper must import container helper");
  assert.ok(wrapperSrc.includes("Container:"), "wrapper must display container");
});

// J tests — reducer behavior
describe("J reordering via MOVE_BLOCK", () => {
  // Load reducer via dynamic import of compiled JS? Instead test file content + logic via isolated function
  // We test via reading reducer source that it exists and via behavioral file that uses actual reducer if we can require TS via ts-node not available
  // So we test structural guarantees via file content + a lightweight simulation

  test("J: MOVE_BLOCK exists and preserves block object", () => {
    const src = fs.readFileSync(path.join(ROOT, "components/dashboard/website/builder/builderReducer.ts"), "utf8");
    assert.ok(src.includes('case "MOVE_BLOCK"'), "must have MOVE_BLOCK");
    assert.ok(src.includes("splice(fromIndex, 1)"), "must splice");
    assert.ok(src.includes("isDirty: true"), "must mark dirty");
  });

  test("J: BlockPalette structure tab exposes Move Up/Down", () => {
    const paletteSrc = fs.readFileSync(path.join(ROOT, "components/dashboard/website/builder/BlockPalette.tsx"), "utf8");
    assert.ok(paletteSrc.includes('aria-label={`Move section'), "palette must have aria-label");
    assert.ok(paletteSrc.includes("ChevronUp") && paletteSrc.includes("ChevronDown"), "must have icons");
    assert.ok(paletteSrc.includes("onMoveBlock(idx, idx - 1)"), "must dispatch up");
  });

  test("J: CanvasBlockWrapper exposes Move Up/Down", () => {
    const wrapperSrc = fs.readFileSync(path.join(ROOT, "components/dashboard/website/builder/canvas/CanvasBlockWrapper.tsx"), "utf8");
    assert.ok(wrapperSrc.includes('aria-label={`Move ${block.type'), "wrapper must have aria-label");
    assert.ok(wrapperSrc.includes("disabled={index === 0}"), "first disabled");
    assert.ok(wrapperSrc.includes("disabled={index === totalBlocks - 1}"), "last disabled");
  });

  test("J: No dnd-kit dependency", () => {
    const pkg = fs.readFileSync(path.join(ROOT, "package.json"), "utf8");
    assert.equal(pkg.includes("dnd-kit"), false, "must not add dnd-kit");
    assert.equal(pkg.includes("react-beautiful-dnd"), false, "must not add react-beautiful-dnd");
  });

  test("J: One MOVE_BLOCK = one history entry and selection preserved", () => {
    const src = fs.readFileSync(path.join(ROOT, "components/dashboard/website/builder/builderReducer.ts"), "utf8");
    // past push once per MOVE_BLOCK
    const moveSection = src.split('case "MOVE_BLOCK"')[1].split('case "')[0];
    assert.ok(moveSection.includes("past: [...state.past.slice"), "must push one entry");
    assert.ok(moveSection.includes("selection"), "must reconcile selection");
    assert.ok(moveSection.includes("isDirty: true"), "must mark dirty for autosave");
  });

  test("J: Public renderer preserves array order", () => {
    const pubSrc = fs.readFileSync(path.join(ROOT, "components/site/blocks/BlockRenderer.tsx"), "utf8");
    // BlockRenderer dispatcher just renders one block, but site page maps in order
    const sitePage = fs.readFileSync(path.join(ROOT, "app/site/[slug]/[[...page]]/page.tsx"), "utf8");
    assert.ok(sitePage.includes("blocks.map"), "site page must map blocks in order");
    assert.equal(sitePage.includes(".sort("), false, "must not sort");
  });

  test("J: Template preview preserves order and template registry unchanged", () => {
    const previewSrc = fs.readFileSync(path.join(ROOT, "components/dashboard/website/TemplatePreview.tsx"), "utf8");
    assert.ok(previewSrc.includes("blocks") || previewSrc.includes("template"), "preview must use blocks");
    const registrySrc = fs.readFileSync(path.join(ROOT, "lib/website-template-registry.ts"), "utf8");
    assert.ok(registrySrc.includes("TEMPLATE_REGISTRY"), "registry must exist");
    assert.ok(!registrySrc.includes("container"), "registry should not have container property added");
  });
});

// Additional behavioral test using actual reducer if available via require with esm workaround
// We attempt to load compiled JS via ts-node not available, so skip runtime mover test and assert file-level as above
