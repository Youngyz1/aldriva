const { createHash } = require("node:crypto");

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
    if (!group || typeof group !== "object" || typeof group.id !== "string" || !group.id.trim()) return { groups: [], error: `group ${groupIndex + 1} has no string ID` };
    if (groupIds.has(group.id)) return { groups: [], error: `duplicate group ID ${group.id}` };
    groupIds.add(group.id);
    if (typeof group.name !== "string" || !group.name.trim() || group.name.trim().length > 80) return { groups: [], error: `group ${group.id} has an invalid name` };
    if (typeof group.required !== "boolean" || !Number.isInteger(group.min) || !Number.isInteger(group.max)) return { groups: [], error: `group ${group.id} has invalid selection rules` };
    if (!Array.isArray(group.options) || group.options.length > MAX_OPTIONS) return { groups: [], error: `group ${group.id} has an invalid option list` };
    if (group.min < 0 || group.max < 1 || group.max < group.min || group.max > group.options.length) return { groups: [], error: `group ${group.id} has unsupported min/max values` };
    if (group.required && group.min < 1) return { groups: [], error: `required group ${group.id} has min below 1` };
    const optionIds = new Set();
    const options = [];
    for (const [optionIndex, option] of group.options.entries()) {
      if (!option || typeof option !== "object" || typeof option.id !== "string" || !option.id.trim()) return { groups: [], error: `option ${optionIndex + 1} in ${group.id} has no string ID` };
      if (optionIds.has(option.id)) return { groups: [], error: `duplicate option ID ${option.id} in ${group.id}` };
      optionIds.add(option.id);
      if (typeof option.name !== "string" || !option.name.trim() || option.name.trim().length > 80) return { groups: [], error: `option ${option.id} in ${group.id} has an invalid name` };
      const price = Number(option.price_delta);
      if (!Number.isFinite(price) || price < -10000 || price > 10000) return { groups: [], error: `option ${option.id} in ${group.id} has an invalid legacy price_delta` };
      if (price < 0) return { groups: [], error: `negative legacy price_delta in ${group.id}` };
      if (price > MAX_PRICE) return { groups: [], error: `option ${option.id} exceeds the normalized price limit` };
      options.push({ legacy: option, price });
    }
    normalized.push({ legacy: group, groupIndex, options });
  }
  return { groups: normalized, error: null };
}

function buildMenuOptionBackfillPlan(menuItems) {
  const plan = { groups: [], options: [], assignments: [], skipped: [] };
  for (const item of Array.isArray(menuItems) ? menuItems : []) {
    const sourceGroups = item && Array.isArray(item.option_groups) ? item.option_groups : [];
    if (sourceGroups.length === 0) continue;
    const normalized = normalizeLegacyItem(item);
    if (normalized.error) { plan.skipped.push({ itemId: item.id, reason: normalized.error }); continue; }
    for (const { legacy: group, groupIndex, options } of normalized.groups) {
      const groupId = stableUuid(`group:${item.id}:${group.id}`);
      plan.groups.push({ id: groupId, organizer_id: item.organizer_id, name: group.name.trim(), kind: "addon", min_select: group.min, max_select: group.max, is_required: group.required, position: groupIndex, is_active: true, legacy_source_item_id: item.id, legacy_group_id: group.id });
      for (const [optionIndex, { legacy: option, price }] of options.entries()) {
        plan.options.push({ id: stableUuid(`option:${item.id}:${group.id}:${option.id}`), group_id: groupId, organizer_id: item.organizer_id, name: option.name.trim(), description: null, price, image_url: null, is_default: false, max_qty: 1, is_available: true, allergens: [], position: optionIndex, legacy_option_id: option.id });
      }
      plan.assignments.push({ id: stableUuid(`assignment:${item.id}:${group.id}`), organizer_id: item.organizer_id, item_id: item.id, group_id: groupId, position: groupIndex, hidden_option_ids: [], price_overrides: {} });
    }
  }
  return plan;
}

module.exports = { buildMenuOptionBackfillPlan, normalizeLegacyItem, stableUuid };
