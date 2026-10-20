const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;

require.extensions[".ts"] = function compileTs(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
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
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const {
  calculateMenuLineTotal,
  calculateOptionAdjustedUnitPrice,
  computeLineTotal,
  effectiveUnitPrice,
  isOptionGroupSelectionSatisfied,
  MAX_LINE_QUANTITY,
  MIN_ORDER_QUANTITY,
  validateSelection,
} = require(path.join(ROOT, "lib/menu-pricing.ts"));
const { DIETARY_TAGS, MENU_ALLERGENS } = require(path.join(ROOT, "lib/menu-option-taxonomy.ts"));
const { getMenuOptionTemplates, validateMenuItemGroupLimits, validateMenuOptionGroupRules } = require(path.join(ROOT, "lib/menu-option-dashboard.ts"));
const backfillConverter = require(path.join(ROOT, "lib/menu-option-backfill.cjs"));
const backfillScript = require(path.join(ROOT, "scripts/backfill-menu-option-groups.cjs"));

const storefrontSource = fs.readFileSync(path.join(ROOT, "components/site/blocks/StorefrontBrowse.tsx"), "utf8");
const orderSubmitSource = fs.readFileSync(path.join(ROOT, "lib/order-submit.ts"), "utf8");
const websiteEmbedsSource = fs.readFileSync(path.join(ROOT, "lib/website-embeds.ts"), "utf8");
const blockRendererSource = fs.readFileSync(path.join(ROOT, "components/site/blocks/BlockRenderer.tsx"), "utf8");

function optionGroup({ id = "group", required = false, min = 0, max = 2 } = {}) {
  return {
    id,
    name: id,
    required,
    min,
    max,
    options: [
      { id: `${id}-a`, name: "A", price_delta: 0 },
      { id: `${id}-b`, name: "B", price_delta: 0 },
    ],
  };
}

function clientGroupsAreSatisfied(groups, selections) {
  const selectedByGroup = new Map((selections || []).map((selection) => [selection.groupId, selection.optionIds]));
  return groups.every((group) =>
    isOptionGroupSelectionSatisfied(group, (selectedByGroup.get(group.id) || []).length)
  );
}

test("quantity controls and server validation share the 1–50 line limit", () => {
  assert.equal(MAX_LINE_QUANTITY, 50);
  assert.match(storefrontSource, /Math\.min\(MAX_LINE_QUANTITY, q \+ 1\)/);
  assert.match(storefrontSource, /disabled=\{quantity >= MAX_LINE_QUANTITY\}/);
  assert.match(storefrontSource, /disabled=\{line\.quantity >= MAX_LINE_QUANTITY\}/);
  assert.match(storefrontSource, /labels\.quantityLimit/);
  assert.match(orderSubmitSource, /line\.quantity > MAX_LINE_QUANTITY/);

  const item = { price: 100, option_groups: [] };
  for (const quantity of [1, 50, 51, 99]) {
    const clientAccepts = Number.isInteger(quantity) && quantity >= MIN_ORDER_QUANTITY && quantity <= MAX_LINE_QUANTITY;
    let serverAccepts = true;
    try {
      computeLineTotal({ item, quantity });
    } catch {
      serverAccepts = false;
    }
    assert.equal(clientAccepts, serverAccepts, `quantity ${quantity} must have matching client/server validity`);
  }
});

test("client and server agree on required, optional-minimum, and max-reached groups", () => {
  const cases = [
    { name: "required missing", groups: [optionGroup({ id: "required", required: true, min: 1, max: 1 })], selected: [] },
    { name: "optional minimum missing", groups: [optionGroup({ id: "optional-min", min: 1 })], selected: [] },
    { name: "optional minimum met", groups: [optionGroup({ id: "optional-met", min: 1 })], selected: ["optional-met-a"] },
    { name: "max reached", groups: [optionGroup({ id: "maxed", min: 0, max: 2 })], selected: ["maxed-a", "maxed-b"] },
  ];

  for (const scenario of cases) {
    const selections = scenario.selected.length
      ? [{ groupId: scenario.groups[0].id, optionIds: scenario.selected }]
      : [];
    const clientValid = clientGroupsAreSatisfied(scenario.groups, selections);
    const serverValid = validateSelection({ price: 100, option_groups: scenario.groups }, selections).valid;
    assert.equal(clientValid, serverValid, scenario.name);
  }
});

test("client preview and authoritative totals match for promo and negative deltas", () => {
  const scenarios = [
    { price: 100, promo_price: 80, delta: 20, quantity: 1 },
    { price: 50, promo_price: null, delta: -75, quantity: 1 },
    { price: 100, promo_price: 80, delta: -100, quantity: 50 },
  ];

  for (const scenario of scenarios) {
    const group = {
      id: "extras",
      name: "Extras",
      required: false,
      min: 0,
      max: 1,
      options: [{ id: "choice", name: "Choice", price_delta: scenario.delta }],
    };
    const item = { price: scenario.price, promo_price: scenario.promo_price, option_groups: [group] };
    const selection = [{ groupId: "extras", optionIds: ["choice"] }];
    const clientUnitPrice = calculateOptionAdjustedUnitPrice(effectiveUnitPrice(item), scenario.delta);
    const clientTotal = calculateMenuLineTotal(clientUnitPrice, scenario.quantity);
    const serverTotal = computeLineTotal({ item, selection, quantity: scenario.quantity }).lineTotal;
    assert.equal(clientTotal, serverTotal);
  }
});

test("embedded menu caps are bounded and truncation has a full-menu path", () => {
  assert.match(websiteEmbedsSource, /MENU_ITEMS_PER_SECTION_LIMIT = 100/);
  assert.match(websiteEmbedsSource, /MENU_ITEMS_OVERALL_LIMIT = 500/);
  assert.match(websiteEmbedsSource, /\.limit\(MENU_ITEMS_OVERALL_LIMIT \+ 1\)/);
  assert.match(blockRendererSource, /section\.hasMoreItems \|\| section\.hasMoreItemsOverall/);
  assert.match(blockRendererSource, /t\("menuItemLimitNotice"\)/);
  assert.match(blockRendererSource, /hasPublishedMenuPage \?/);
  assert.match(blockRendererSource, /href=\{`\/site\/\$\{encodeURIComponent\(siteSlug\)\}\/menu`\}/);
  assert.match(blockRendererSource, /const isPromo = !hasVariant &&/);
});

test("dashboard group validation shares the database rule boundaries", () => {
  assert.equal(validateMenuOptionGroupRules({ kind: "addon", is_required: true, min_select: 0, max_select: 1 }, 3), "Required groups need a minimum of at least 1");
  assert.equal(validateMenuOptionGroupRules({ kind: "addon", is_required: false, min_select: 2, max_select: 1 }, 3)?.includes("Maximum"), true);
  assert.equal(validateMenuOptionGroupRules({ kind: "addon", is_required: false, min_select: 0, max_select: 3 }, 2)?.includes("cannot exceed"), true);
  assert.equal(validateMenuOptionGroupRules({ kind: "variant", is_required: true, min_select: 1, max_select: 1 }, 3), null);
  assert.equal(validateMenuOptionGroupRules({ kind: "variant", is_required: false, min_select: 0, max_select: 1 }, 3)?.includes("Variant"), true);
  assert.match(validateMenuItemGroupLimits(Array(8).fill("addon"), "addon"), /at most 8/);
  assert.match(validateMenuItemGroupLimits(["variant"], "variant"), /at most one variant/);
  assert.equal(validateMenuItemGroupLimits(["variant"], "addon"), null);
});

test("starter templates have translated labels and zero-price example names", () => {
  const en = getMenuOptionTemplates("en");
  const fr = getMenuOptionTemplates("fr");
  assert.deepEqual(en.map((entry) => entry.id), ["protein", "sides", "drinks", "spice", "size", "extras"]);
  assert.equal(en.find((entry) => entry.id === "size").kind, "variant");
  assert.equal(fr.find((entry) => entry.id === "size").name, "Taille");
  assert.equal(fr.find((entry) => entry.id === "extras").options.length, 5);
  assert.match(fs.readFileSync(path.join(ROOT, "components/dashboard/menu/MenuOptionGroupsLibrary.tsx"), "utf8"), /price: 0/);
  assert.match(fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8"), /"MenuOptions"/);
  assert.match(fs.readFileSync(path.join(ROOT, "messages/fr.json"), "utf8"), /"MenuOptions"/);
});

test("shared allergen and dietary definitions stay aligned with the SQL CHECK lists", () => {
  const menuSql = fs.readFileSync(path.join(ROOT, "db/migration_136_services_and_menus.sql"), "utf8");
  const optionsSql = fs.readFileSync(path.join(ROOT, "db/migration_182_menu_option_groups.sql"), "utf8");
  function valuesFor(sql, constraint) {
    const at = sql.indexOf(constraint);
    assert.notEqual(at, -1, `constraint ${constraint} must exist`);
    const body = sql.slice(at, at + 500);
    const array = body.match(/ARRAY\[([^\]]+)\]::text\[\]/);
    assert.ok(array, `constraint ${constraint} must retain an explicit enum array`);
    return [...array[1].matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();
  }
  assert.deepEqual(valuesFor(menuSql, "menu_items_dietary_tags_enum_check"), [...DIETARY_TAGS].sort());
  assert.deepEqual(valuesFor(menuSql, "menu_items_allergens_enum_check"), [...MENU_ALLERGENS].sort());
  assert.deepEqual(valuesFor(optionsSql, "allergens text[]"), [...MENU_ALLERGENS].sort());
});

test("dashboard and backfill use the same legacy JSON conversion plan", () => {
  const item = {
    id: "fixture-item", organizer_id: "fixture-organizer", option_groups: [{
      id: "fixture-group", name: "Extras", required: false, min: 0, max: 2,
      options: [{ id: "opt-a", name: "Avocado", price_delta: 2 }, { id: "opt-b", name: "Cheese", price_delta: 1 }],
    }],
  };
  const dashboardPlan = backfillConverter.buildMenuOptionBackfillPlan([item]);
  const scriptPlan = backfillScript.buildBackfillPlan([item]);
  assert.deepEqual(dashboardPlan, scriptPlan);
  assert.equal(dashboardPlan.groups.length, 1);
  assert.equal(dashboardPlan.options.length, 2);
  assert.equal(dashboardPlan.assignments[0].item_id, item.id);
  const refused = backfillConverter.buildMenuOptionBackfillPlan([{ ...item, option_groups: [{ ...item.option_groups[0], max: 1, options: [{ id: "bad", name: "Bad", price_delta: -1 }] }] }]);
  assert.match(refused.skipped[0].reason, /negative legacy price_delta/);
});

test("option actions and migration expose matching role boundaries", () => {
  const actions = fs.readFileSync(path.join(ROOT, "lib/actions/menu-option-groups.ts"), "utf8");
  const migration = fs.readFileSync(path.join(ROOT, "db/migration_183_menu_option_assignment_cleanup.sql"), "utf8");
  const unassign = actions.match(/export async function unassignMenuOptionGroup[\s\S]*?\n}\n/)[0];
  const deleteGroup = actions.match(/export async function deleteMenuOptionGroup[\s\S]*?\n}\n/)[0];
  const deleteOption = actions.match(/export async function deleteMenuOption\([\s\S]*?\n}\n/)[0];
  assert.match(unassign, /\["owner", "admin", "manager", "editor"\]/);
  assert.match(deleteGroup, /\["owner", "admin", "manager"\]/);
  assert.match(deleteOption, /\["owner", "admin", "manager"\]/);
  assert.match(migration, /FOR DELETE[\s\S]*?is_entity_member\(organizer_id, ARRAY\['owner','admin','manager','editor'\]\)/);
  assert.match(actions, /updated_at.*Reload and try again/);
});

test("option dashboard UI includes the library, normalized picker, overrides, accessibility fallbacks and upgrade banner", () => {
  const library = fs.readFileSync(path.join(ROOT, "components/dashboard/menu/MenuOptionGroupsLibrary.tsx"), "utf8");
  const assignments = fs.readFileSync(path.join(ROOT, "components/dashboard/menu/MenuItemOptionsPanel.tsx"), "utf8");
  const itemForm = fs.readFileSync(path.join(ROOT, "components/dashboard/menu/MenuItemForm.tsx"), "utf8");
  assert.match(library, /folderSubpath="menu-options"/);
  assert.match(library, /draggable=\{canEdit\}/);
  assert.match(library, /aria-label=\{`\$\{t\("moveUp"\)\}/);
  assert.match(library, /t\("paidDefaultWarning"\)/);
  assert.match(library, /t\("markUnavailable"\)/);
  assert.match(assignments, /t\("searchGroups"\)/);
  assert.match(assignments, /price_overrides/);
  assert.match(assignments, /t\("unassign"\)/);
  assert.match(assignments, /min-h-11/);
  assert.match(itemForm, /upgradeMenuItemOptions/);
  assert.match(itemForm, /usesNormalizedOptions/);
  assert.match(itemForm, /legacyModifiersNote/);
  assert.match(itemForm, /!usesNormalizedOptions \? \{ option_groups: optionGroups \}/);
});

test("Phase 2 migration is transactional, cleans deleted option IDs and upgrades JSON atomically", () => {
  const migration = fs.readFileSync(path.join(ROOT, "db/migration_183_menu_option_assignment_cleanup.sql"), "utf8");
  const rollback = fs.readFileSync(path.join(ROOT, "db/migration_183_menu_option_assignment_cleanup_rollback.sql"), "utf8");
  const supabaseCopy = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261020000000_migration_183_menu_option_assignment_cleanup.sql"), "utf8");
  assert.equal(supabaseCopy, migration);
  assert.match(migration, /^--[\s\S]*?\nBEGIN;/);
  assert.match(migration, /\nCOMMIT;\nNOTIFY pgrst, 'reload schema';\n?$/);
  assert.match(migration, /array_remove\(hidden_option_ids, OLD\.id\)/);
  assert.match(migration, /price_overrides = price_overrides - OLD\.id::text/);
  assert.match(migration, /upgrade_menu_item_option_groups/);
  assert.match(migration, /UPDATE public\.menu_items SET options_source = 'normalized'/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.upgrade_menu_item_option_groups/);
  assert.match(rollback, /DROP COLUMN IF EXISTS updated_at/);
});

test("option action role checks allow editor detach and retain manager-only deletes", async () => {
  const actionPath = path.join(ROOT, "lib/actions/menu-option-groups.ts");
  const tablePath = (rel) => path.join(ROOT, rel);
  const checks = [];
  const assignment = { item_id: "item-a" };
  const db = {
    item: { id: "item-a", organizer_id: "org-a", options_source: "json", option_groups: [{ id: "legacy-a", name: "Extras", required: false, min: 0, max: 1, options: [{ id: "extra-a", name: "Avocado", price_delta: 0 }] }] },
    group: { id: "group-a", organizer_id: "org-a", name: "Extras", kind: "addon", min_select: 0, max_select: 1, is_required: false, is_active: true, position: 0, updated_at: "fresh" },
    updates: [],
    rpcCalls: [],
    from(table) {
      const query = {
        select() { return this; }, eq() { return this; }, in() { return this; }, update(patch) { this.patch = patch; return this; }, delete() { return this; },
        maybeSingle() { return Promise.resolve({ data: this.table === "menu_items" ? db.item : this.table === "menu_option_groups" ? db.group : assignment, error: null }); },
        then(resolve) { if (this.patch) db.updates.push({ table: this.table, patch: this.patch }); resolve({ data: [], error: null }); },
      };
      query.table = table;
      return query;
    },
    rpc(name, params) { db.rpcCalls.push({ name, params }); return Promise.resolve({ error: null }); },
  };
  require.cache[tablePath("lib/supabase-admin.ts")] = { exports: { createSupabaseAdmin: () => db } };
  require.cache[tablePath("lib/supabase-server.ts")] = { exports: { createSupabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "user-a" } } }) } }) } };
  require.cache[tablePath("lib/auth.ts")] = { exports: { isAdmin: async () => false } };
  require.cache[tablePath("lib/tenant-context.ts")] = { exports: { requireTenantContext: async (_userId, organizerId, roles) => {
    checks.push({ organizerId, roles });
    if (organizerId !== "org-a" || !roles.includes(globalThis.__menuTestRole)) throw new Error("forbidden");
  } } };
  require.cache[tablePath("lib/image-url.ts")] = { exports: { safeImageSrc: () => true } };
  require.cache[require.resolve("next/cache")] = { exports: { revalidatePath() {} } };
  delete require.cache[actionPath];
  const actions = require(actionPath);

  globalThis.__menuTestRole = "editor";
  const detached = await actions.unassignMenuOptionGroup("assignment-a", "org-a");
  assert.equal(detached.success, true);
  assert.ok(checks.at(-1).roles.includes("editor"));
  assert.ok(db.updates.some((entry) => entry.table === "menu_items" && entry.patch.options_source === "normalized"));

  const upgraded = await actions.upgradeMenuItemOptions("item-a", "org-a");
  assert.equal(upgraded.success, true);
  assert.equal(db.rpcCalls[0].name, "upgrade_menu_item_option_groups");
  assert.equal(db.rpcCalls[0].params.p_groups.length, 1);
  assert.equal(db.rpcCalls[0].params.p_options.length, 1);
  db.item = { ...db.item, option_groups: [{ id: "legacy-negative", name: "Bad", required: false, min: 0, max: 1, options: [{ id: "negative", name: "Bad", price_delta: -2 }] }] };
  assert.match((await actions.upgradeMenuItemOptions("item-a", "org-a")).error, /negative legacy price_delta/);
  assert.equal(db.rpcCalls.length, 1, "invalid legacy options must remain in JSON and never call the atomic upgrade");

  const editorDeleteGroup = await actions.deleteMenuOptionGroup("group-a", "org-a");
  assert.equal(editorDeleteGroup.success, false);
  assert.equal(editorDeleteGroup.error, "Forbidden");
  assert.equal(checks.at(-1).roles.includes("editor"), false);
  const staleEdit = await actions.updateMenuOptionGroup("group-a", "org-a", { name: "Overwritten", updated_at: "stale" });
  assert.match(staleEdit.error, /changed by someone else/);

  globalThis.__menuTestRole = "manager";
  assert.equal((await actions.deleteMenuOptionGroup("group-a", "org-a")).success, true);
  assert.ok(checks.at(-1).roles.includes("manager"));

  globalThis.__menuTestRole = "finance";
  assert.equal((await actions.unassignMenuOptionGroup("assignment-a", "org-a")).success, false);
  globalThis.__menuTestRole = "viewer";
  assert.equal((await actions.unassignMenuOptionGroup("assignment-a", "org-a")).success, false);
  globalThis.__menuTestRole = "editor";
  assert.equal((await actions.unassignMenuOptionGroup("assignment-a", "org-b")).success, false);
  delete globalThis.__menuTestRole;
});
