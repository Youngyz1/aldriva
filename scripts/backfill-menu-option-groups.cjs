#!/usr/bin/env node

// Explicitly opt in with --apply before this script writes normalized rows.
// --verify reads a JSON export/fixture only unless --remote is supplied.

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const PAGE_SIZE = 500;
const WRITE_BATCH_SIZE = 100;
const MAX_GROUPS = 8;
const MAX_OPTIONS = 20;
const MAX_PRICE = 999999.99;

function stableUuid(key) {
  const bytes = createHash("sha256").update(`aldriva-menu-options:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizeLegacyItem(item) {
  const groups = item && Array.isArray(item.option_groups) ? item.option_groups : [];
  if (groups.length === 0) return { groups: [], error: null };
  if (groups.length > MAX_GROUPS) return { groups: [], error: `more than ${MAX_GROUPS} groups` };
  const normalized = [];
  const groupIds = new Set();
  for (const [groupIndex, group] of groups.entries()) {
    if (!group || typeof group !== "object" || typeof group.id !== "string" || !group.id.trim()) {
      return { groups: [], error: `group ${groupIndex + 1} has no string ID` };
    }
    if (groupIds.has(group.id)) return { groups: [], error: `duplicate group ID ${group.id}` };
    groupIds.add(group.id);
    if (typeof group.name !== "string" || !group.name.trim() || group.name.trim().length > 80) {
      return { groups: [], error: `group ${group.id} has an invalid name` };
    }
    if (typeof group.required !== "boolean" || !Number.isInteger(group.min) || !Number.isInteger(group.max)) {
      return { groups: [], error: `group ${group.id} has invalid selection rules` };
    }
    if (group.min < 0 || group.max < 1 || group.max < group.min || group.max > (group.options || []).length) {
      return { groups: [], error: `group ${group.id} has unsupported min/max values` };
    }
    if (group.required && group.min < 1) return { groups: [], error: `required group ${group.id} has min below 1` };
    if (!Array.isArray(group.options) || group.options.length > MAX_OPTIONS) {
      return { groups: [], error: `group ${group.id} has an invalid option list` };
    }
    const optionIds = new Set();
    const options = [];
    for (const [optionIndex, option] of group.options.entries()) {
      if (!option || typeof option !== "object" || typeof option.id !== "string" || !option.id.trim()) {
        return { groups: [], error: `option ${optionIndex + 1} in ${group.id} has no string ID` };
      }
      if (optionIds.has(option.id)) return { groups: [], error: `duplicate option ID ${option.id} in ${group.id}` };
      optionIds.add(option.id);
      if (typeof option.name !== "string" || !option.name.trim() || option.name.trim().length > 80) {
        return { groups: [], error: `option ${option.id} in ${group.id} has an invalid name` };
      }
      const price = Number(option.price_delta);
      if (!Number.isFinite(price) || price < -10000 || price > 10000) {
        return { groups: [], error: `option ${option.id} in ${group.id} has an invalid legacy price_delta` };
      }
      if (price < 0) return { groups: [], error: `negative legacy price_delta in ${group.id}` };
      if (price > MAX_PRICE) return { groups: [], error: `option ${option.id} exceeds the normalized price limit` };
      options.push({ legacy: option, price });
    }
    normalized.push({ legacy: group, groupIndex, options });
  }
  return { groups: normalized, error: null };
}

function buildBackfillPlan(menuItems) {
  const plan = { groups: [], options: [], assignments: [], skipped: [] };
  for (const item of Array.isArray(menuItems) ? menuItems : []) {
    const sourceGroups = item && Array.isArray(item.option_groups) ? item.option_groups : [];
    if (sourceGroups.length === 0) continue;
    const normalized = normalizeLegacyItem(item);
    if (normalized.error) {
      plan.skipped.push({ itemId: item.id, reason: normalized.error });
      continue;
    }
    for (const { legacy: group, groupIndex, options } of normalized.groups) {
      const groupId = stableUuid(`group:${item.id}:${group.id}`);
      plan.groups.push({
        id: groupId,
        organizer_id: item.organizer_id,
        name: group.name.trim(),
        kind: "addon",
        min_select: group.min,
        max_select: group.max,
        is_required: group.required,
        position: groupIndex,
        is_active: true,
        legacy_source_item_id: item.id,
        legacy_group_id: group.id,
      });
      for (const [optionIndex, { legacy: option, price }] of options.entries()) {
        plan.options.push({
          id: stableUuid(`option:${item.id}:${group.id}:${option.id}`),
          group_id: groupId,
          organizer_id: item.organizer_id,
          name: option.name.trim(),
          description: null,
          price,
          image_url: null,
          is_default: false,
          max_qty: 1,
          is_available: true,
          allergens: [],
          position: optionIndex,
          legacy_option_id: option.id,
        });
      }
      plan.assignments.push({
        id: stableUuid(`assignment:${item.id}:${group.id}`),
        organizer_id: item.organizer_id,
        item_id: item.id,
        group_id: groupId,
        position: groupIndex,
        hidden_option_ids: [],
        price_overrides: {},
      });
    }
  }
  return plan;
}

function verifyNormalizedGraph(dataset) {
  const issues = [];
  const items = new Map((dataset.menuItems || []).map((row) => [row.id, row]));
  const groups = new Map((dataset.groups || []).map((row) => [row.id, row]));
  const optionsByGroup = new Map();
  for (const option of dataset.options || []) {
    const list = optionsByGroup.get(option.group_id) || [];
    list.push(option);
    optionsByGroup.set(option.group_id, list);
    const group = groups.get(option.group_id);
    if (!group) issues.push(`option ${option.id} refers to a missing group`);
    else if (option.organizer_id !== group.organizer_id) issues.push(`option ${option.id} has a tenant mismatch`);
  }
  const assignmentCounts = new Map();
  const variantCounts = new Map();
  for (const assignment of dataset.assignments || []) {
    const item = items.get(assignment.item_id);
    const group = groups.get(assignment.group_id);
    if (!item) issues.push(`assignment ${assignment.id} refers to a missing item`);
    if (!group) issues.push(`assignment ${assignment.id} refers to a missing group`);
    if (item && group && (item.organizer_id !== group.organizer_id || assignment.organizer_id !== item.organizer_id)) {
      issues.push(`assignment ${assignment.id} has a tenant mismatch`);
    }
    assignmentCounts.set(assignment.item_id, (assignmentCounts.get(assignment.item_id) || 0) + 1);
    if (group && group.kind === "variant") variantCounts.set(assignment.item_id, (variantCounts.get(assignment.item_id) || 0) + 1);
    if (group) {
      const options = optionsByGroup.get(group.id) || [];
      if (options.length > MAX_OPTIONS) issues.push(`group ${group.id} has more than ${MAX_OPTIONS} options`);
      const optionIds = new Set(options.map((option) => option.id));
      for (const optionId of assignment.hidden_option_ids || []) {
        if (!optionIds.has(optionId)) issues.push(`assignment ${assignment.id} hides an option outside its group`);
      }
      for (const optionId of Object.keys(assignment.price_overrides || {})) {
        if (!optionIds.has(optionId)) issues.push(`assignment ${assignment.id} overrides an option outside its group`);
      }
      if (group.kind === "variant" && (group.min_select !== 1 || group.max_select !== 1 || group.is_required !== true)) {
        issues.push(`variant group ${group.id} has invalid selection rules`);
      }
    }
  }
  for (const [itemId, count] of assignmentCounts) if (count > MAX_GROUPS) issues.push(`item ${itemId} has more than ${MAX_GROUPS} assigned groups`);
  for (const [itemId, count] of variantCounts) if (count > 1) issues.push(`item ${itemId} has more than one assigned variant group`);
  return issues;
}

function verifyBackfill(dataset) {
  const menuItems = Array.isArray(dataset.menuItems) ? dataset.menuItems : [];
  const groups = Array.isArray(dataset.groups) ? dataset.groups : [];
  const options = Array.isArray(dataset.options) ? dataset.options : [];
  const assignments = Array.isArray(dataset.assignments) ? dataset.assignments : [];
  const issues = verifyNormalizedGraph({ menuItems, groups, options, assignments });
  const plan = buildBackfillPlan(menuItems);
  let verifiedBackfillItems = 0;
  let legacyFallbackItems = 0;
  const groupsBySource = new Map();
  for (const group of groups) {
    if (!group.legacy_source_item_id) continue;
    const list = groupsBySource.get(group.legacy_source_item_id) || [];
    list.push(group);
    groupsBySource.set(group.legacy_source_item_id, list);
  }
  const assignmentByItem = new Map();
  for (const assignment of assignments) {
    const list = assignmentByItem.get(assignment.item_id) || [];
    list.push(assignment);
    assignmentByItem.set(assignment.item_id, list);
  }
  for (const item of menuItems) {
    if (!Array.isArray(item.option_groups) || item.option_groups.length === 0) continue;
    const itemGroups = groupsBySource.get(item.id) || [];
    if (itemGroups.length === 0) {
      if ((assignmentByItem.get(item.id) || []).length === 0) legacyFallbackItems++;
      continue;
    }
    const expectedGroups = plan.groups.filter((row) => row.legacy_source_item_id === item.id);
    const expectedOptions = plan.options.filter((row) => expectedGroups.some((group) => group.id === row.group_id));
    const expectedAssignments = plan.assignments.filter((row) => row.item_id === item.id);
    const actualOptions = options.filter((row) => expectedGroups.some((group) => group.id === row.group_id));
    const actualAssignments = assignments.filter((row) => expectedGroups.some((group) => group.id === row.group_id));
    if (expectedGroups.length !== itemGroups.length || expectedOptions.length !== actualOptions.length || expectedAssignments.length !== actualAssignments.length) {
      issues.push(`backfill row count mismatch for item ${item.id}`);
      continue;
    }
    const normalizedValue = (value) => {
      if (Array.isArray(value)) return value.map(normalizedValue);
      if (value && typeof value === "object") {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizedValue(value[key])]));
      }
      return value;
    };
    const sameValue = (actual, expected, field) => {
      if (field === "price") return Number(actual) === Number(expected);
      return JSON.stringify(normalizedValue(actual)) === JSON.stringify(normalizedValue(expected));
    };
    const compareFields = (actualRows, expectedRows, fields, label) => {
      const actualById = new Map(actualRows.map((row) => [row.id, row]));
      for (const expected of expectedRows) {
        const actual = actualById.get(expected.id);
        if (!actual || fields.some((field) => !sameValue(actual[field], expected[field], field))) {
          issues.push(`${label} mismatch for ${expected.id}`);
        }
      }
    };
    compareFields(itemGroups, expectedGroups, ["organizer_id", "name", "kind", "min_select", "max_select", "is_required", "position", "legacy_group_id"], "group");
    compareFields(actualOptions, expectedOptions, ["organizer_id", "group_id", "name", "price", "position", "legacy_option_id", "max_qty"], "option");
    compareFields(actualAssignments, expectedAssignments, ["organizer_id", "item_id", "group_id", "position", "hidden_option_ids", "price_overrides"], "assignment");
    verifiedBackfillItems++;
  }
  return {
    ok: issues.length === 0,
    issues,
    verifiedBackfillItems,
    legacyFallbackItems,
    skipped: plan.skipped,
    plannedGroups: plan.groups.length,
    plannedOptions: plan.options.length,
    plannedAssignments: plan.assignments.length,
  };
}

function chunk(values, size) {
  const result = [];
  for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size));
  return result;
}

async function fetchRemoteDataset(admin) {
  const menuItems = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await admin.from("menu_items").select("id, organizer_id, option_groups").range(start, start + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to read menu_items: ${error.message}`);
    menuItems.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  const assignments = [];
  for (const itemBatch of chunk(menuItems.map((item) => item.id), 100)) {
    if (itemBatch.length === 0) continue;
    const { data, error } = await admin.from("menu_item_option_groups")
      .select("id, organizer_id, item_id, group_id, position, hidden_option_ids, price_overrides")
      .in("item_id", itemBatch);
    if (error) throw new Error(`Failed to read menu_item_option_groups: ${error.message}`);
    assignments.push(...(data || []));
  }
  const groupIds = [...new Set(assignments.map((row) => row.group_id))];
  const groups = [];
  const options = [];
  for (const idBatch of chunk(groupIds, 100)) {
    if (idBatch.length === 0) continue;
    const groupResult = await admin.from("menu_option_groups").select("*").in("id", idBatch);
    if (groupResult.error) throw new Error(`Failed to read menu_option_groups: ${groupResult.error.message}`);
    groups.push(...(groupResult.data || []));
    const optionResult = await admin.from("menu_options").select("*").in("group_id", idBatch);
    if (optionResult.error) throw new Error(`Failed to read menu_options: ${optionResult.error.message}`);
    options.push(...(optionResult.data || []));
  }
  return { menuItems, assignments, groups, options };
}

async function applyPlan(admin, dataset) {
  const items = dataset.menuItems || [];
  const groupsById = new Map((dataset.groups || []).map((row) => [row.id, row]));
  const manualAssignedItemIds = new Set((dataset.assignments || [])
    .filter((row) => {
      const group = groupsById.get(row.group_id);
      return !group || group.legacy_source_item_id !== row.item_id;
    })
    .map((row) => row.item_id));
  const eligibleItems = items.filter((item) => !manualAssignedItemIds.has(item.id));
  const plan = buildBackfillPlan(eligibleItems);
  for (const rows of chunk(plan.groups, WRITE_BATCH_SIZE)) {
    const { error } = await admin.from("menu_option_groups").upsert(rows, { onConflict: "id" });
    if (error) throw new Error(`Failed to upsert menu_option_groups: ${error.message}`);
  }
  for (const rows of chunk(plan.options, WRITE_BATCH_SIZE)) {
    const { error } = await admin.from("menu_options").upsert(rows, { onConflict: "id" });
    if (error) throw new Error(`Failed to upsert menu_options: ${error.message}`);
  }
  for (const rows of chunk(plan.assignments, WRITE_BATCH_SIZE)) {
    const { error } = await admin.from("menu_item_option_groups").upsert(rows, { onConflict: "item_id,group_id" });
    if (error) throw new Error(`Failed to upsert menu_item_option_groups: ${error.message}`);
  }
  return plan;
}

function parseArgs(argv) {
  const args = { mode: null, input: null, remote: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--verify" || argv[i] === "--apply" || argv[i] === "--plan") args.mode = argv[i].slice(2);
    else if (argv[i] === "--input") args.input = argv[++i];
    else if (argv[i] === "--remote") args.remote = true;
  }
  return args;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.mode) throw new Error("Use one mode: --plan, --verify, or --apply");
  if (args.mode === "apply" && !args.remote) throw new Error("--apply requires --remote; it is the only mode that writes database rows");
  if ((args.mode === "verify" || args.mode === "plan") && !args.input && !args.remote) {
    throw new Error(`${args.mode === "verify" ? "--verify" : "--plan"} requires --input <json> or --remote`);
  }
  let dataset;
  if (args.input) {
    dataset = JSON.parse(fs.readFileSync(path.resolve(args.input), "utf8"));
  } else {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for --remote");
    const { createClient } = require("@supabase/supabase-js");
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    dataset = await fetchRemoteDataset(admin);
    if (args.mode === "apply") {
      const plan = await applyPlan(admin, dataset);
      process.stdout.write(`${JSON.stringify({ mode: "apply", groups: plan.groups.length, options: plan.options.length, assignments: plan.assignments.length, skipped: plan.skipped }, null, 2)}\n`);
      return;
    }
  }
  if (args.mode === "plan") {
    process.stdout.write(`${JSON.stringify(buildBackfillPlan(dataset.menuItems || []), null, 2)}\n`);
    return;
  }
  const result = verifyBackfill(dataset);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { buildBackfillPlan, stableUuid, verifyBackfill, verifyNormalizedGraph };
