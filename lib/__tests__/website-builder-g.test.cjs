/**
 * lib/__tests__/website-builder-g.test.cjs
 * Batch G — Controlled Element Selection & Editing
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
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key";

const editSchema = require("../website-block-edit-schema.ts");
const isEditablePath = editSchema.isEditablePath;
const getFieldDef = editSchema.getFieldDef;
const setElementValue = editSchema.setElementValue;
const blocksMod = require("../website-blocks.ts");
const normalizeBlocks = blocksMod.normalizeBlocks;
const cloneBlockWithNewIds = blocksMod.cloneBlockWithNewIds;
const generateStableId = blocksMod.generateStableId;
const validateBlock = blocksMod.validateBlock;
const builderReducerMod = require("../../components/dashboard/website/builder/builderReducer.ts");
const builderReducer = builderReducerMod.builderReducer;
const registryMod = require("../website-template-registry.ts");
const TEMPLATE_REGISTRY = registryMod.TEMPLATE_REGISTRY;

function makeHero(overrides) {
  const base = Object.assign({ type: "hero", heading: "Hello", subheading: "World", ctaLabel: "Click", ctaHref: "/contact" }, overrides);
  const normalized = normalizeBlocks([base])[0];
  return normalized;
}

function makeFeatures() {
  return normalizeBlocks([{
    type: "features", heading: "Features", items: [
      { title: "A", description: "Desc A" },
      { title: "B", description: "Desc B" },
    ]
  }])[0];
}

test("selection: block selection via stable blockId", () => {
  const b1 = makeHero({ heading: "One" });
  const b2 = makeHero({ heading: "Two" });
  const state = {
    past: [], present: [b1, b2], future: [],
    selectedBlockIndex: null, selection: null,
    device: "desktop", sidebarTab: "add",
    isDirty: false, saveStatus: "idle", publishStatus: "idle", version: 0, lastSavedAt: null, hasDraft: false,
    validation: null, errorMessage: null, successMessage: null,
    pageId: "page-1", websiteId: "wid", pageSlug: "home", pageTitle: "Home", pageStatus: "draft",
    tenantId: "tid", websiteSlug: "test", canPublish: true, userRole: "owner", availableEmbedOptions: { events: [], products: [], fundraisers: [] },
    isDiscardModalOpen: false,
  };
  const after = builderReducer(state, { type: "SELECT_BLOCK_BY_ID", blockId: b2.id });
  assert.equal(after.selection.blockId, b2.id);
  assert.equal(after.selection.type, "block");
  assert.equal(after.selectedBlockIndex, 1);
});

test("selection: element selection via stable item id", () => {
  const feat = makeFeatures();
  const itemId = feat.items[0].id;
  assert.ok(itemId, "item should have stable id");
  const path = "items[" + itemId + "].title";
  assert.ok(isEditablePath("features", path), "path should be editable");
  const state = {
    past: [], present: [feat], future: [],
    selectedBlockIndex: 0, selection: { type: "block", pageId: "p", blockId: feat.id },
    device: "desktop", sidebarTab: "add",
    isDirty: false, saveStatus: "idle", publishStatus: "idle", version: 0, lastSavedAt: null, hasDraft: false,
    validation: null, errorMessage: null, successMessage: null,
    pageId: "p", websiteId: "wid", pageSlug: "home", pageTitle: "Home", pageStatus: "draft",
    tenantId: "tid", websiteSlug: "test", canPublish: true, userRole: "owner", availableEmbedOptions: { events: [], products: [], fundraisers: [] },
    isDiscardModalOpen: false,
  };
  const after = builderReducer(state, { type: "SELECT_ELEMENT", blockId: feat.id, path: path });
  assert.equal(after.selection.type, "element");
  assert.equal(after.selection.path, path);
  assert.equal(after.selection.blockId, feat.id);
});

test("selection: clear selection", () => {
  const b = makeHero();
  const state = {
    past: [], present: [b], future: [],
    selectedBlockIndex: 0, selection: { type: "block", pageId: "p", blockId: b.id },
    device: "desktop", sidebarTab: "add",
    isDirty: false, saveStatus: "idle", publishStatus: "idle", version: 0, lastSavedAt: null, hasDraft: false,
    validation: null, errorMessage: null, successMessage: null,
    pageId: "p", websiteId: "wid", pageSlug: "home", pageTitle: "Home", pageStatus: "draft",
    tenantId: "tid", websiteSlug: "test", canPublish: true, userRole: "owner", availableEmbedOptions: { events: [], products: [], fundraisers: [] },
    isDiscardModalOpen: false,
  };
  const after = builderReducer(state, { type: "CLEAR_SELECTION" });
  assert.equal(after.selection, null);
  assert.equal(after.selectedBlockIndex, null);
});

test("selection: invalid blockId clears selection", () => {
  const b = makeHero();
  const state = {
    past: [], present: [b], future: [],
    selectedBlockIndex: 0, selection: { type: "block", pageId: "p", blockId: b.id },
    device: "desktop", sidebarTab: "add",
    isDirty: false, saveStatus: "idle", publishStatus: "idle", version: 0, lastSavedAt: null, hasDraft: false,
    validation: null, errorMessage: null, successMessage: null,
    pageId: "p", websiteId: "wid", pageSlug: "home", pageTitle: "Home", pageStatus: "draft",
    tenantId: "tid", websiteSlug: "test", canPublish: true, userRole: "owner", availableEmbedOptions: { events: [], products: [], fundraisers: [] },
    isDiscardModalOpen: false,
  };
  const after = builderReducer(state, { type: "SELECT_BLOCK_BY_ID", blockId: "non-existent-id" });
  assert.equal(after.selection, null);
});

test("selection: stable IDs survive duplicate", () => {
  const feat = makeFeatures();
  const origItemId = feat.items[0].id;
  const dup = cloneBlockWithNewIds(feat);
  assert.notEqual(dup.id, feat.id);
  assert.notEqual(dup.items[0].id, origItemId);
  assert.equal(feat.items[0].id, origItemId);
});

test("editable registry: whitelisted paths are editable", () => {
  assert.ok(isEditablePath("hero", "heading"));
  assert.ok(isEditablePath("hero", "subheading"));
  assert.ok(isEditablePath("hero", "ctaLabel"));
  assert.ok(isEditablePath("hero", "backgroundImage"));
  assert.ok(isEditablePath("features", "heading"));
  const id = generateStableId();
  assert.ok(isEditablePath("features", "items[" + id + "].title"));
  assert.ok(isEditablePath("features", "items[" + id + "].description"));
  assert.ok(isEditablePath("gallery", "images[" + id + "].src"));
  assert.ok(isEditablePath("gallery", "images[" + id + "].alt"));
});

test("editable registry: unsupported paths rejected", () => {
  assert.equal(isEditablePath("hero", "unknownField"), false);
  assert.equal(isEditablePath("hero", "heading.foo"), false);
  assert.equal(isEditablePath("features", "items"), false);
  assert.equal(isEditablePath("hero", "__proto__"), false);
  assert.equal(isEditablePath("hero", "constructor"), false);
});

test("safe path: __proto__ and prototype rejected", () => {
  const b = makeHero();
  assert.equal(isEditablePath("hero", "__proto__"), false);
  assert.equal(isEditablePath("hero", "prototype"), false);
  assert.equal(isEditablePath("hero", "constructor"), false);
  assert.equal(isEditablePath("hero", "heading.__proto__"), false);
  const before = JSON.stringify(b);
  const after = setElementValue(b, "__proto__.polluted", "evil");
  assert.equal(after, b);
  assert.equal(JSON.stringify(b), before);
  assert.equal(({}).polluted, undefined);
});

test("safe path: arbitrary property path rejected", () => {
  const b = makeHero();
  const after = setElementValue(b, "nonexistentField", "value");
  assert.equal(after, b);
});

test("getFieldDef returns correct type", () => {
  assert.equal(getFieldDef("hero", "heading").type, "text");
  assert.equal(getFieldDef("hero", "subheading").type, "textarea");
  assert.equal(getFieldDef("hero", "backgroundImage").type, "image");
  assert.equal(getFieldDef("hero", "ctaHref").type, "action");
});

test("editing: heading update via UPDATE_ELEMENT", () => {
  const b = makeHero({ heading: "Old" });
  const state = {
    past: [], present: [b], future: [],
    selectedBlockIndex: 0, selection: { type: "block", pageId: "p", blockId: b.id },
    device: "desktop", sidebarTab: "add",
    isDirty: false, saveStatus: "idle", publishStatus: "idle", version: 0, lastSavedAt: null, hasDraft: false,
    validation: null, errorMessage: null, successMessage: null,
    pageId: "p", websiteId: "wid", pageSlug: "home", pageTitle: "Home", pageStatus: "draft",
    tenantId: "tid", websiteSlug: "test", canPublish: true, userRole: "owner", availableEmbedOptions: { events: [], products: [], fundraisers: [] },
    isDiscardModalOpen: false,
  };
  const after = builderReducer(state, { type: "UPDATE_ELEMENT", blockId: b.id, path: "heading", value: "New Heading" });
  assert.equal(after.present[0].heading, "New Heading");
  assert.equal(after.isDirty, true);
  assert.equal(after.past.length, 1);
});

test("editing: repeatable item title via stable id", () => {
  const feat = makeFeatures();
  const itemId = feat.items[0].id;
  const state = {
    past: [], present: [feat], future: [],
    selectedBlockIndex: 0, selection: { type: "element", pageId: "p", blockId: feat.id, path: "items[" + itemId + "].title" },
    device: "desktop", sidebarTab: "add",
    isDirty: false, saveStatus: "idle", publishStatus: "idle", version: 0, lastSavedAt: null, hasDraft: false,
    validation: null, errorMessage: null, successMessage: null,
    pageId: "p", websiteId: "wid", pageSlug: "home", pageTitle: "Home", pageStatus: "draft",
    tenantId: "tid", websiteSlug: "test", canPublish: true, userRole: "owner", availableEmbedOptions: { events: [], products: [], fundraisers: [] },
    isDiscardModalOpen: false,
  };
  const after = builderReducer(state, { type: "UPDATE_ELEMENT", blockId: feat.id, path: "items[" + itemId + "].title", value: "Updated Title" });
  assert.equal(after.present[0].items[0].title, "Updated Title");
  assert.equal(after.present[0].items[1].title, feat.items[1].title);
});

test("editing: CTA action update", () => {
  const b = makeHero({ ctaLabel: "Old", ctaHref: "/old" });
  const state = {
    past: [], present: [b], future: [],
    selectedBlockIndex: 0, selection: { type: "block", pageId: "p", blockId: b.id },
    device: "desktop", sidebarTab: "add",
    isDirty: false, saveStatus: "idle", publishStatus: "idle", version: 0, lastSavedAt: null, hasDraft: false,
    validation: null, errorMessage: null, successMessage: null,
    pageId: "p", websiteId: "wid", pageSlug: "home", pageTitle: "Home", pageStatus: "draft",
    tenantId: "tid", websiteSlug: "test", canPublish: true, userRole: "owner", availableEmbedOptions: { events: [], products: [], fundraisers: [] },
    isDiscardModalOpen: false,
  };
  const after1 = builderReducer(state, { type: "UPDATE_ELEMENT", blockId: b.id, path: "ctaLabel", value: "Book Now" });
  assert.equal(after1.present[0].ctaLabel, "Book Now");
  const after2 = builderReducer(after1, { type: "UPDATE_ELEMENT", blockId: b.id, path: "ctaHref", value: "/contact" });
  assert.equal(after2.present[0].ctaHref, "/contact");
});

test("editing: image src update", () => {
  const gal = normalizeBlocks([{ type: "gallery", heading: "G", images: [{ src: "https://example.com/a.jpg", alt: "A" }] }])[0];
  const imgId = gal.images[0].id;
  const state = {
    past: [], present: [gal], future: [],
    selectedBlockIndex: 0, selection: { type: "element", pageId: "p", blockId: gal.id, path: "images[" + imgId + "].src" },
    device: "desktop", sidebarTab: "add",
    isDirty: false, saveStatus: "idle", publishStatus: "idle", version: 0, lastSavedAt: null, hasDraft: false,
    validation: null, errorMessage: null, successMessage: null,
    pageId: "p", websiteId: "wid", pageSlug: "home", pageTitle: "Home", pageStatus: "draft",
    tenantId: "tid", websiteSlug: "test", canPublish: true, userRole: "owner", availableEmbedOptions: { events: [], products: [], fundraisers: [] },
    isDiscardModalOpen: false,
  };
  const after = builderReducer(state, { type: "UPDATE_ELEMENT", blockId: gal.id, path: "images[" + imgId + "].src", value: "https://example.com/b.jpg" });
  assert.equal(after.present[0].images[0].src, "https://example.com/b.jpg");
});

test("editing: unsupported property cannot be edited", () => {
  const b = makeHero();
  const state = {
    past: [], present: [b], future: [],
    selectedBlockIndex: 0, selection: { type: "block", pageId: "p", blockId: b.id },
    device: "desktop", sidebarTab: "add",
    isDirty: false, saveStatus: "idle", publishStatus: "idle", version: 0, lastSavedAt: null, hasDraft: false,
    validation: null, errorMessage: null, successMessage: null,
    pageId: "p", websiteId: "wid", pageSlug: "home", pageTitle: "Home", pageStatus: "draft",
    tenantId: "tid", websiteSlug: "test", canPublish: true, userRole: "owner", availableEmbedOptions: { events: [], products: [], fundraisers: [] },
    isDiscardModalOpen: false,
  };
  const before = JSON.stringify(state.present[0]);
  const after = builderReducer(state, { type: "UPDATE_ELEMENT", blockId: b.id, path: "nonexistent", value: "evil" });
  assert.equal(JSON.stringify(after.present[0]), before);
  assert.equal(after.isDirty, false);
});

test("stability: undo/redo preserves stable IDs", () => {
  const b = makeHero({ heading: "A" });
  const s0 = {
    past: [], present: [b], future: [],
    selectedBlockIndex: 0, selection: { type: "block", pageId: "p", blockId: b.id },
    device: "desktop", sidebarTab: "add",
    isDirty: false, saveStatus: "idle", publishStatus: "idle", version: 0, lastSavedAt: null, hasDraft: false,
    validation: null, errorMessage: null, successMessage: null,
    pageId: "p", websiteId: "wid", pageSlug: "home", pageTitle: "Home", pageStatus: "draft",
    tenantId: "tid", websiteSlug: "test", canPublish: true, userRole: "owner", availableEmbedOptions: { events: [], products: [], fundraisers: [] },
    isDiscardModalOpen: false,
  };
  const s1 = builderReducer(s0, { type: "UPDATE_ELEMENT", blockId: b.id, path: "heading", value: "B" });
  assert.equal(s1.present[0].id, b.id);
  const s2 = builderReducer(s1, { type: "UNDO" });
  assert.equal(s2.present[0].heading, "A");
  assert.equal(s2.present[0].id, b.id);
  const s3 = builderReducer(s2, { type: "REDO" });
  assert.equal(s3.present[0].heading, "B");
  assert.equal(s3.present[0].id, b.id);
});

test("stability: normalize preserves existing ids", () => {
  const b = makeHero();
  const origId = b.id;
  const feat = makeFeatures();
  const fid = feat.id;
  const iid = feat.items[0].id;
  const normalized = normalizeBlocks([b, feat]);
  assert.equal(normalized[0].id, origId);
  assert.equal(normalized[1].id, fid);
  assert.equal(normalized[1].items[0].id, iid);
});

test("stability: autosave dirty flag set on element edit", () => {
  const b = makeHero();
  const state = {
    past: [], present: [b], future: [],
    selectedBlockIndex: 0, selection: { type: "block", pageId: "p", blockId: b.id },
    device: "desktop", sidebarTab: "add",
    isDirty: false, saveStatus: "idle", publishStatus: "idle", version: 0, lastSavedAt: null, hasDraft: false,
    validation: null, errorMessage: null, successMessage: null,
    pageId: "p", websiteId: "wid", pageSlug: "home", pageTitle: "Home", pageStatus: "draft",
    tenantId: "tid", websiteSlug: "test", canPublish: true, userRole: "owner", availableEmbedOptions: { events: [], products: [], fundraisers: [] },
    isDiscardModalOpen: false,
  };
  const after = builderReducer(state, { type: "UPDATE_ELEMENT", blockId: b.id, path: "heading", value: "X" });
  assert.equal(after.isDirty, true);
  assert.equal(after.saveStatus, "idle");
});

test("canonical template cannot be modified via editing snapshot", () => {
  const template = TEMPLATE_REGISTRY[0];
  const originalTitle = template.pages[0].blocks[0].heading;
  const snapshotBlocks = template.pages[0].blocks.map((b) => cloneBlockWithNewIds(b));
  const snapId = snapshotBlocks[0].id;
  const edited = setElementValue(snapshotBlocks[0], "heading", "Hacked");
  assert.equal(edited.heading, "Hacked");
  assert.equal(template.pages[0].blocks[0].heading, originalTitle);
  assert.notEqual(snapId, template.pages[0].blocks[0].id);
});

test("tenant isolation: server validation remains authoritative (no client trust)", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/actions/website-instantiation.ts"), "utf8");
  assert.ok(src.includes("requireTenantContext"), "must still enforce tenant access server-side");
  assert.ok(src.includes("validateBlocks"), "must still validate blocks server-side");
  const builderSrc = fs.readFileSync(path.join(ROOT, "lib/actions/website-builder.ts"), "utf8");
  assert.ok(builderSrc.includes("resolveAndAuthorizePage"), "builder actions must still authorize page/tenant");
});

test("editor overlays do not appear in public BlockRenderer", () => {
  const pubSrc = fs.readFileSync(path.join(ROOT, "components/site/blocks/BlockRenderer.tsx"), "utf8");
  assert.equal(pubSrc.includes("data-element-path"), false, "public renderer must not contain editor data-element-path");
  assert.equal(pubSrc.includes("ring-brand-600"), false, "public renderer must not contain editor selection ring");
  const previewSrc = fs.readFileSync(path.join(ROOT, "components/dashboard/website/builder/canvas/CanvasBlockPreview.tsx"), "utf8");
  assert.ok(previewSrc.includes("data-element-path"), "editor preview must contain data-element-path");
  assert.ok(previewSrc.includes("ring-brand-600"), "editor preview must have selection ring");
});

test("edited snapshot still validates and renders", () => {
  const b = makeHero({ heading: "Old" });
  const edited = setElementValue(b, "heading", "New Valid Heading");
  const res = validateBlock(edited);
  assert.equal(res.success, true);
});

test("cleanup FIX2: hero phantom fields cta/image no longer editable, valid fields remain", () => {
  assert.equal(isEditablePath("hero", "cta"), false, "hero.cta phantom must be removed");
  assert.equal(isEditablePath("hero", "image"), false, "hero.image phantom must be removed");
  assert.equal(getFieldDef("hero", "cta"), null);
  assert.equal(getFieldDef("hero", "image"), null);
  // Valid hero fields must still be editable
  assert.ok(isEditablePath("hero", "ctaLabel"), "ctaLabel must remain editable");
  assert.ok(isEditablePath("hero", "ctaHref"), "ctaHref must remain editable");
  assert.ok(isEditablePath("hero", "backgroundImage"), "backgroundImage must remain editable");
  assert.ok(isEditablePath("hero", "heading"), "heading must remain editable");
  assert.equal(getFieldDef("hero", "ctaLabel").type, "text");
  assert.equal(getFieldDef("hero", "ctaHref").type, "action");
  assert.equal(getFieldDef("hero", "backgroundImage").type, "image");
  // setElementValue for phantom must be no-op
  const b = makeHero();
  const before = JSON.stringify(b);
  const afterCta = setElementValue(b, "cta", "evil");
  const afterImg = setElementValue(b, "image", "evil");
  assert.equal(afterCta, b, "phantom cta edit must return original block");
  assert.equal(afterImg, b, "phantom image edit must return original block");
  assert.equal(JSON.stringify(b), before);
});

test("cleanup FIX2: reducer rejects phantom hero paths", () => {
  const b = makeHero({ heading: "A" });
  const state = {
    past: [], present: [b], future: [],
    selectedBlockIndex: 0, selection: { type: "block", pageId: "p", blockId: b.id },
    device: "desktop", sidebarTab: "add",
    isDirty: false, saveStatus: "idle", publishStatus: "idle", version: 0, lastSavedAt: null, hasDraft: false,
    validation: null, errorMessage: null, successMessage: null,
    pageId: "p", websiteId: "wid", pageSlug: "home", pageTitle: "Home", pageStatus: "draft",
    tenantId: "tid", websiteSlug: "test", canPublish: true, userRole: "owner", availableEmbedOptions: { events: [], products: [], fundraisers: [] },
    isDiscardModalOpen: false,
  };
  const after = builderReducer(state, { type: "UPDATE_ELEMENT", blockId: b.id, path: "cta", value: "hack" });
  assert.equal(after.isDirty, false, "phantom path must not mark dirty");
  assert.equal(after.past.length, 0, "phantom path must not push history");
});

test("cleanup FIX1: rich_text editor preview is sanitized with sanitizeArticleHtml", () => {
  const previewSrc = fs.readFileSync(path.join(ROOT, "components/dashboard/website/builder/canvas/CanvasBlockPreview.tsx"), "utf8");
  assert.ok(previewSrc.includes('from "@/lib/sanitize-html"'), "preview must import sanitizeArticleHtml");
  assert.ok(previewSrc.includes("sanitizeArticleHtml"), "preview must use sanitizeArticleHtml");
  // Must use sanitizer for rich_text html (not raw b.html)
  assert.ok(previewSrc.includes("sanitizeArticleHtml(b.html)"), "rich_text preview must sanitize b.html");
  assert.equal(previewSrc.includes("dangerouslySetInnerHTML") && previewSrc.includes("sanitizeArticleHtml(b.html)"), true);
  // Public renderer must still sanitize (unchanged)
  const pubSrc = fs.readFileSync(path.join(ROOT, "components/site/blocks/BlockRenderer.tsx"), "utf8");
  assert.ok(pubSrc.includes("sanitizeArticleHtml"), "public BlockRenderer must still sanitize");
  // Verify sanitizer actually strips script
  const sanitizeMod = require("../sanitize-html.ts");
  const clean = sanitizeMod.sanitizeArticleHtml('<p>Hello</p><script>alert(1)</script><p>World</p>');
  assert.equal(clean.includes("<script"), false, "sanitizer must strip script");
  assert.ok(clean.includes("Hello") && clean.includes("World"), "sanitizer must keep safe content");
});
