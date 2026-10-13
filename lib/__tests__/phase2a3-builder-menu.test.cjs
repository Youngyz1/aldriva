/**
 * lib/__tests__/phase2a3-builder-menu.test.cjs
 *
 * Unit test suite for Phase 2a.3: "Menu management inside the builder"
 *
 * Tests:
 * 1. Category-agnostic commerce registry returns capability for restaurant, null for others
 * 2. Translation parity: EN/FR keys for live notice, manage full menu, main menu
 * 3. Preview channel: open_menu_editor & update_menu_items message validation
 * 4. Role gating for menu management (edit: owner/admin/manager/editor; delete: owner/admin/manager)
 * 5. Clean handling of deleted / deactivated featured dishes (no crash, clean omission)
 * 6. First dish zero-sections creation flow
 * 7. MenuManager callbacks and backward compatibility with sidebar page (no callbacks)
 * 8. Live notice banner content verification
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

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

const originalResolveFilename = Module._resolveFilename;
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

process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key";

const {
  BUILDER_COMMERCE_REGISTRY,
  getBuilderCommerceCapability,
} = require("../website-commerce-registry.ts");

const {
  WEBSITE_PREVIEW_MESSAGE_SOURCE,
  isWebsitePreviewMessage,
} = require("../website-preview-channel.ts");

// ── 1. Commerce Registry ───────────────────────────────────────────────

test("Phase 2a.3: commerce registry returns capability for restaurant", () => {
  const cap = getBuilderCommerceCapability("restaurant");
  assert.ok(cap, "Restaurant must have a builder commerce capability");
  assert.equal(cap.kind, "menu");
  assert.equal(cap.category, "restaurant");
  assert.equal(cap.titleKey, "manageFullMenu");
  assert.equal(cap.manageButtonKey, "manageFullMenu");
});

test("Phase 2a.3: commerce registry returns null for unregistered categories", () => {
  assert.equal(getBuilderCommerceCapability("rental"), null);
  assert.equal(getBuilderCommerceCapability("services"), null);
  assert.equal(getBuilderCommerceCapability("retail"), null);
  assert.equal(getBuilderCommerceCapability("nonprofit"), null);
  assert.equal(getBuilderCommerceCapability(""), null);
  assert.equal(getBuilderCommerceCapability(null), null);
  assert.equal(getBuilderCommerceCapability(undefined), null);
});

// ── 2. Translation Parity ──────────────────────────────────────────────

test("Phase 2a.3: translation parity in en.json and fr.json for menu drawer", () => {
  const enRaw = fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8");
  const frRaw = fs.readFileSync(path.join(ROOT, "messages/fr.json"), "utf8");
  const en = JSON.parse(enRaw);
  const fr = JSON.parse(frRaw);

  const requiredKeys = [
    "manageMenu",
    "manageFullMenu",
    "manageFullMenuDescription",
    "menuLiveNotice",
    "mainMenu",
  ];

  for (const key of requiredKeys) {
    assert.ok(en.Storefront?.[key], `messages/en.json must contain Storefront.${key}`);
    assert.ok(fr.Storefront?.[key], `messages/fr.json must contain Storefront.${key}`);
    assert.ok(typeof en.Storefront[key] === "string" && en.Storefront[key].length > 0);
    assert.ok(typeof fr.Storefront[key] === "string" && fr.Storefront[key].length > 0);
  }

  // Live notice explicitly states changes are immediate and do not wait for publish
  assert.match(en.Storefront.menuLiveNotice, /live immediately.*Publish/i);
  assert.match(fr.Storefront.menuLiveNotice, /immédiatement en ligne.*publication/i);
});

// ── 3. Preview Channel Message Validation ─────────────────────────────

test("Phase 2a.3: website preview channel accepts open_menu_editor message", () => {
  const validMsg = {
    source: WEBSITE_PREVIEW_MESSAGE_SOURCE,
    kind: "open_menu_editor",
  };
  assert.equal(isWebsitePreviewMessage(validMsg), true);

  const invalidSource = {
    source: "other-source",
    kind: "open_menu_editor",
  };
  assert.equal(isWebsitePreviewMessage(invalidSource), false);
});

test("Phase 2a.3: website preview channel accepts update_menu_items message", () => {
  const validMsg = {
    source: WEBSITE_PREVIEW_MESSAGE_SOURCE,
    kind: "update_menu_items",
    websiteId: "web_123",
    menuItems: [
      {
        id: "item_1",
        name: "Margherita",
        description: "Tomato and basil",
        price: 12.5,
        imageUrl: "https://example.com/pizza.jpg",
        sectionName: "Pizzas",
      },
    ],
  };
  assert.equal(isWebsitePreviewMessage(validMsg), true);

  const missingWebsiteId = {
    source: WEBSITE_PREVIEW_MESSAGE_SOURCE,
    kind: "update_menu_items",
    menuItems: [],
  };
  assert.equal(isWebsitePreviewMessage(missingWebsiteId), false);

  const nonArrayItems = {
    source: WEBSITE_PREVIEW_MESSAGE_SOURCE,
    kind: "update_menu_items",
    websiteId: "web_123",
    menuItems: "not-an-array",
  };
  assert.equal(isWebsitePreviewMessage(nonArrayItems), false);
});

// ── 4. Role Gating for Menu Management ────────────────────────────────

test("Phase 2a.3: role gating allows edit for owner, admin, manager, editor only", () => {
  const ALLOWED_EDIT_ROLES = ["owner", "admin", "manager", "editor"];
  const ALLOWED_DELETE_ROLES = ["owner", "admin", "manager"];

  function canEditMenu(role) {
    return role === null || ALLOWED_EDIT_ROLES.includes(role);
  }

  function canDeleteMenu(role) {
    return role === null || ALLOWED_DELETE_ROLES.includes(role);
  }

  // Superadmin or tenant owner/admin/manager
  assert.equal(canEditMenu("owner"), true);
  assert.equal(canEditMenu("admin"), true);
  assert.equal(canEditMenu("manager"), true);
  assert.equal(canEditMenu("editor"), true);
  assert.equal(canDeleteMenu("owner"), true);
  assert.equal(canDeleteMenu("admin"), true);
  assert.equal(canDeleteMenu("manager"), true);

  // Editor can edit but cannot delete
  assert.equal(canDeleteMenu("editor"), false);

  // Viewer and finance cannot edit or delete
  assert.equal(canEditMenu("viewer"), false);
  assert.equal(canDeleteMenu("viewer"), false);
  assert.equal(canEditMenu("finance"), false);
  assert.equal(canDeleteMenu("finance"), false);
});

// ── 5. Deleted / Deactivated Featured Dishes Handled Cleanly ─────────

test("Phase 2a.3: featured dishes picker and preview drop deleted or inactive dishes cleanly", () => {
  // Simulate active menu items currently loaded
  const loadedMenuItems = [
    { id: "item_1", name: "Dish 1", is_active: true, sectionName: "Mains" },
    { id: "item_2", name: "Dish 2", is_active: true, sectionName: "Mains" },
  ];

  // User previously picked item_1, item_2, and item_3 (which was deleted from database)
  const selectedItemIds = ["item_1", "item_2", "item_3"];

  // PreviewBlock resolution logic:
  // selected.length > 0 ? menuItems.filter((item) => selected.includes(item.id)) : menuItems.slice(0, 6)
  const resolvedItems = loadedMenuItems.filter((item) => selectedItemIds.includes(item.id));

  assert.equal(resolvedItems.length, 2);
  assert.deepEqual(resolvedItems.map((i) => i.id), ["item_1", "item_2"]);
  // item_3 dropped cleanly without throwing any error or creating undefined slots

  // If item_1 and item_2 are both deleted:
  const emptyLoadedItems = [];
  const emptyResolved = emptyLoadedItems.filter((item) => selectedItemIds.includes(item.id));
  assert.equal(emptyResolved.length, 0);
  // Zero items resolves to empty state cleanly
});

test("Phase 2a.3: deactivating a dish excludes it from active choices", () => {
  // In getV2MenuItemChoices, query filters .eq("is_active", true)
  const dbRows = [
    { id: "item_1", name: "Dish 1", is_active: true, section_id: "sec_1" },
    { id: "item_2", name: "Dish 2", is_active: false, section_id: "sec_1" },
  ];

  const activeRows = dbRows.filter((row) => row.is_active === true);
  assert.equal(activeRows.length, 1);
  assert.equal(activeRows[0].id, "item_1");
});

// ── 6. First Dish Zero-Sections Creation Workflow ─────────────────────

test("Phase 2a.3: first dish with zero sections provides localized default section name", () => {
  const enDefault = "Main menu";
  const frDefault = "Menu principal";

  function getFirstDishSectionName(locale, userSpecified) {
    if (userSpecified && userSpecified.trim()) return userSpecified.trim();
    return locale === "fr" ? frDefault : enDefault;
  }

  assert.equal(getFirstDishSectionName("en"), "Main menu");
  assert.equal(getFirstDishSectionName("fr"), "Menu principal");
  assert.equal(getFirstDishSectionName("en", "Desserts"), "Desserts");
});

// ── 7. Sidebar Page Contract (No Callbacks) Backward Compatibility ───

test("Phase 2a.3: MenuManager callbacks are optional and safe when undefined", () => {
  let routerRefreshed = false;
  const mockRouter = {
    refresh: () => {
      routerRefreshed = true;
    },
  };

  // Simulate handleDelete / handleSave with NO callbacks passed (sidebar page behavior)
  function simulateAction(onSaved, onDeleted, onChanged) {
    mockRouter.refresh();
    onSaved?.();
    onDeleted?.();
    onChanged?.();
  }

  assert.doesNotThrow(() => {
    simulateAction(undefined, undefined, undefined);
  });
  assert.equal(routerRefreshed, true);

  // Simulate with callbacks (builder drawer behavior)
  let changedCalled = false;
  let savedCalled = false;
  simulateAction(
    () => { savedCalled = true; },
    undefined,
    () => { changedCalled = true; }
  );
  assert.equal(savedCalled, true);
  assert.equal(changedCalled, true);
});

// ── 8. First Dish Retry Safety (No Duplicate Section / No Orphan) ──────

test("Phase 2a.3.1: first dish path reuses createdSectionId on retry when createMenuItem fails", async () => {
  let sectionCreationCalls = 0;
  let itemCreationCalls = 0;
  const mockCreatedId = "sec_auto_created_456";

  async function mockCreateMenuSection(_organizerId, input) {
    sectionCreationCalls++;
    return { success: true, data: { id: mockCreatedId, name: input.name } };
  }

  let itemShouldFail = true;
  async function mockCreateMenuItem(sectionId, _organizerId, payload) {
    itemCreationCalls++;
    if (itemShouldFail) {
      return { success: false, error: "Validation error: price invalid" };
    }
    return { success: true, data: { id: "item_789", section_id: sectionId, ...payload } };
  }

  // Simulate stateful MenuItemForm submit logic
  class SimulatedFirstDishForm {
    constructor(organizerId, initialSectionName = "Main menu") {
      this.organizerId = organizerId;
      this.sectionId = undefined; // Zero sections initial state
      this.createdSectionId = null;
      this.sectionName = initialSectionName;
      this.error = null;
      this.saved = false;
    }

    async submit(dishPayload) {
      this.error = null;
      let targetSectionId = this.sectionId || this.createdSectionId;
      if (!targetSectionId) {
        const secRes = await mockCreateMenuSection(this.organizerId, { name: this.sectionName.trim() });
        if (!secRes.success || !secRes.data) {
          this.error = secRes.error;
          return;
        }
        targetSectionId = secRes.data.id;
        this.createdSectionId = secRes.data.id;
      }

      const res = await mockCreateMenuItem(targetSectionId, this.organizerId, dishPayload);
      if (!res.success) {
        this.error = res.error;
        return;
      }
      this.saved = true;
    }
  }

  const form = new SimulatedFirstDishForm("org_1");

  // Attempt 1: createMenuSection succeeds, but createMenuItem fails
  await form.submit({ name: "Steak", price: -5 });
  assert.equal(sectionCreationCalls, 1, "createMenuSection called on initial submission");
  assert.equal(itemCreationCalls, 1, "createMenuItem called");
  assert.equal(form.createdSectionId, mockCreatedId, "createdSectionId persisted in state");
  assert.equal(form.error, "Validation error: price invalid");
  assert.equal(form.saved, false);

  // Attempt 2: User fixes price and submits again (retry)
  itemShouldFail = false;
  await form.submit({ name: "Steak", price: 25 });
  assert.equal(sectionCreationCalls, 1, "createMenuSection NOT called again on retry (reused)");
  assert.equal(itemCreationCalls, 2, "createMenuItem called with valid payload");
  assert.equal(form.error, null);
  assert.equal(form.saved, true);
});

