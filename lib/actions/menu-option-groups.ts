"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/auth";
import { requireTenantContext } from "@/lib/tenant-context";
import { safeImageSrc } from "@/lib/image-url";
import { MENU_ALLERGENS } from "@/lib/menu-option-taxonomy";
import { validateMenuOptionGroupRules } from "@/lib/menu-option-dashboard";

const { buildMenuOptionBackfillPlan } = require("../menu-option-backfill.cjs") as {
  buildMenuOptionBackfillPlan: (items: unknown[]) => {
    groups: unknown[];
    options: unknown[];
    assignments: unknown[];
    skipped: Array<{ itemId: string; reason: string }>;
  };
};

const MAX_NAME = 80;
const MAX_PRICE = 999999.99;
const MAX_GROUPS = 8;
const MAX_OPTIONS = 20;
const ALLOWED_ALLERGENS = MENU_ALLERGENS;

type WriteRole = "owner" | "admin" | "manager" | "editor";
type DeleteRole = "owner" | "admin" | "manager";

interface GroupInput {
  name?: unknown;
  kind?: unknown;
  min_select?: unknown;
  max_select?: unknown;
  is_required?: unknown;
  position?: unknown;
  is_active?: unknown;
  updated_at?: unknown;
}

interface OptionInput {
  name?: unknown;
  description?: unknown;
  price?: unknown;
  image_url?: unknown;
  is_default?: unknown;
  max_qty?: unknown;
  is_available?: unknown;
  allergens?: unknown;
  position?: unknown;
  updated_at?: unknown;
}

interface AssignmentInput {
  hidden_option_ids?: unknown;
  price_overrides?: unknown;
  position?: unknown;
  updated_at?: unknown;
}

function fail(error: string) {
  return { success: false as const, error };
}

function validateName(value: unknown): string | null {
  return typeof value === "string" && value.trim().length >= 1 && value.trim().length <= MAX_NAME
    ? null
    : `Name must be 1–${MAX_NAME} characters`;
}

function validatePosition(value: unknown): string | null {
  return value === undefined || value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 999)
    ? null
    : "Position must be an integer from 0 to 999";
}

function validateGroup(group: Record<string, any>): string | null {
  const nameError = validateName(group.name);
  if (nameError) return nameError;
  if (group.kind !== "variant" && group.kind !== "addon") return "Group kind must be variant or addon";
  if (typeof group.is_required !== "boolean") return "Required must be a boolean";
  const rulesError = validateMenuOptionGroupRules({
    kind: group.kind,
    is_required: group.is_required,
    min_select: group.min_select,
    max_select: group.max_select,
  }, 0);
  if (rulesError) return rulesError;
  if (group.is_active !== undefined && typeof group.is_active !== "boolean") return "Active must be a boolean";
  return validatePosition(group.position);
}

function validateOption(option: Record<string, any>): string | null {
  const nameError = validateName(option.name);
  if (nameError) return nameError;
  if (option.description !== undefined && option.description !== null && (typeof option.description !== "string" || option.description.length > 200)) {
    return "Description must be 200 characters or fewer";
  }
  const price = Number(option.price);
  if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) return `Price must be between 0 and ${MAX_PRICE}`;
  if (option.image_url !== undefined && option.image_url !== null && option.image_url !== "") {
    if (typeof option.image_url !== "string" || option.image_url.length > 2048 || !safeImageSrc(option.image_url)) return "Invalid option image URL";
  }
  if (option.is_default !== undefined && typeof option.is_default !== "boolean") return "Default must be a boolean";
  if (!Number.isInteger(option.max_qty) || option.max_qty < 1 || option.max_qty > 10) return "Option quantity limit must be an integer from 1 to 10";
  if (option.is_available !== undefined && typeof option.is_available !== "boolean") return "Availability must be a boolean";
  if (!Array.isArray(option.allergens) || option.allergens.length > 12 || option.allergens.some((value: unknown) => !ALLOWED_ALLERGENS.includes(value as typeof ALLOWED_ALLERGENS[number]))) {
    return "Option allergens contain an unsupported value";
  }
  return validatePosition(option.position);
}

function validateAssignment(input: Record<string, any>, optionIds: Set<string>): string | null {
  if (!Array.isArray(input.hidden_option_ids) || input.hidden_option_ids.length > MAX_OPTIONS || input.hidden_option_ids.some((id: unknown) => typeof id !== "string" || !optionIds.has(id))) {
    return "Hidden options must be IDs from this group (maximum 20)";
  }
  const overrides = input.price_overrides;
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) return "Price overrides must be an object";
  for (const [id, value] of Object.entries(overrides)) {
    if (typeof value !== "number" || !Number.isFinite(value) || !optionIds.has(id) || value < 0 || value > MAX_PRICE) {
      return "Price overrides must reference this group and use valid non-negative prices";
    }
  }
  return validatePosition(input.position);
}

async function authorize(organizerId: string, roles: readonly (WriteRole | DeleteRole | "finance" | "viewer")[]) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" as const };
  try {
    await requireTenantContext(user.id, organizerId, [...roles] as any);
  } catch {
    try {
      if (!(await isAdmin())) return { error: "Forbidden" as const };
    } catch {
      return { error: "Forbidden" as const };
    }
  }
  return { admin: createSupabaseAdmin() };
}

function revalidateMenu(organizerId: string) {
  revalidatePath(`/dashboard/org/${organizerId}/menu`);
}

async function markItemsOptionsNormalized(
  admin: ReturnType<typeof createSupabaseAdmin>,
  organizerId: string,
  itemIds: readonly string[]
) {
  if (itemIds.length === 0) return true;
  const { error } = await admin.from("menu_items").update({ options_source: "normalized" })
    .eq("organizer_id", organizerId).in("id", [...new Set(itemIds)]);
  return !error;
}

export async function listMenuOptionGroups(organizerId: string) {
  const auth = await authorize(organizerId, ["owner", "admin", "manager", "editor", "finance", "viewer"]);
  if ("error" in auth && auth.error) return fail(auth.error);
  const { data: groups, error } = await auth.admin.from("menu_option_groups")
    .select("*").eq("organizer_id", organizerId).order("position", { ascending: true });
  if (error) return fail("Failed to load option groups");
  const groupIds = (groups || []).map((group: any) => group.id);
  const { data: options, error: optionsError } = groupIds.length
    ? await auth.admin.from("menu_options").select("*").in("group_id", groupIds).order("position", { ascending: true })
    : { data: [], error: null };
  if (optionsError) return fail("Failed to load menu options");
  const { data: assignments, error: assignmentsError } = groupIds.length
    ? await auth.admin.from("menu_item_option_groups").select("*").eq("organizer_id", organizerId).in("group_id", groupIds).order("position", { ascending: true })
    : { data: [], error: null };
  if (assignmentsError) return fail("Failed to load menu item option groups");
  return { success: true as const, data: { groups: groups || [], options: options || [], assignments: assignments || [] } };
}

export async function createMenuOptionGroup(organizerId: string, input: GroupInput) {
  const auth = await authorize(organizerId, ["owner", "admin", "manager", "editor"]);
  if ("error" in auth && auth.error) return fail(auth.error);
  if (!input || typeof input !== "object") return fail("Option group input is required");
  const payload = {
    name: typeof input.name === "string" ? input.name.trim() : input.name,
    kind: input.kind,
    min_select: input.min_select ?? 0,
    max_select: input.max_select ?? 1,
    is_required: input.is_required ?? false,
    position: input.position ?? 0,
    is_active: input.is_active ?? true,
  };
  const validationError = validateGroup(payload);
  if (validationError) return fail(validationError);
  const { data, error } = await auth.admin.from("menu_option_groups")
    .insert({ ...payload, organizer_id: organizerId }).select("*").single();
  if (error) return fail("Failed to create option group");
  revalidateMenu(organizerId);
  return { success: true as const, data };
}

export async function updateMenuOptionGroup(groupId: string, organizerId: string, input: GroupInput) {
  const auth = await authorize(organizerId, ["owner", "admin", "manager", "editor"]);
  if ("error" in auth && auth.error) return fail(auth.error);
  const { data: existing, error: findError } = await auth.admin.from("menu_option_groups")
    .select("*").eq("id", groupId).eq("organizer_id", organizerId).maybeSingle();
  if (findError || !existing) return fail("Option group not found");
  const payload = { ...existing, ...input };
  const validationError = validateGroup(payload);
  if (validationError) return fail(validationError);
  const { data: optionRows, error: optionError } = await auth.admin.from("menu_options").select("id").eq("group_id", groupId);
  if (optionError) return fail("Failed to check group options");
  const optionCount = (optionRows || []).length;
  const optionCountError = validateMenuOptionGroupRules(payload, optionCount);
  if (optionCountError) return fail(optionCountError);
  if (input.updated_at !== undefined && input.updated_at !== existing.updated_at) return fail("This group changed by someone else. Reload and try again.");
  const updates: Record<string, unknown> = {};
  for (const key of ["name", "kind", "min_select", "max_select", "is_required", "position", "is_active"] as const) {
    if (input[key] !== undefined) updates[key] = key === "name" && typeof input[key] === "string" ? input[key].trim() : input[key];
  }
  const { data, error } = await auth.admin.from("menu_option_groups").update(updates)
    .eq("id", groupId).eq("organizer_id", organizerId)
    .eq("updated_at", input.updated_at ?? existing.updated_at).select("*").maybeSingle();
  if (error || !data) return fail("This group changed by someone else. Reload and try again.");
  revalidateMenu(organizerId);
  return { success: true as const, data };
}

export async function duplicateMenuOptionGroup(groupId: string, organizerId: string) {
  const auth = await authorize(organizerId, ["owner", "admin", "manager", "editor"]);
  if ("error" in auth && auth.error) return fail(auth.error);
  const { data: source, error: groupError } = await auth.admin.from("menu_option_groups").select("*")
    .eq("id", groupId).eq("organizer_id", organizerId).maybeSingle();
  if (groupError || !source) return fail("Option group not found");
  const { data: sourceOptions, error: optionsError } = await auth.admin.from("menu_options").select("*")
    .eq("group_id", groupId).eq("organizer_id", organizerId).order("position", { ascending: true });
  if (optionsError) return fail("Failed to load options for duplicate");
  const sourceFields = { ...source };
  delete sourceFields.id;
  delete sourceFields.created_at;
  delete sourceFields.updated_at;
  const groupPayload = { ...sourceFields, name: `${source.name} copy`.slice(0, MAX_NAME), legacy_source_item_id: null, legacy_group_id: null };
  const { data: duplicate, error } = await auth.admin.from("menu_option_groups").insert(groupPayload).select("*").single();
  if (error || !duplicate) return fail("Failed to duplicate option group");
  if ((sourceOptions || []).length) {
    const rows = sourceOptions.map((option: Record<string, unknown>, position: number) => {
      const copy = { ...option };
      delete copy.id;
      delete copy.created_at;
      delete copy.updated_at;
      return { ...copy, group_id: duplicate.id, position };
    });
    const { error: copyError } = await auth.admin.from("menu_options").insert(rows);
    if (copyError) return fail("Group copied, but its options could not be copied. Remove the incomplete copy and retry.");
  }
  revalidateMenu(organizerId);
  return { success: true as const, data: duplicate };
}

export async function deleteMenuOptionGroup(groupId: string, organizerId: string) {
  const auth = await authorize(organizerId, ["owner", "admin", "manager"]);
  if ("error" in auth && auth.error) return fail(auth.error);
  const { data: assignments, error: assignmentError } = await auth.admin.from("menu_item_option_groups")
    .select("item_id").eq("group_id", groupId).eq("organizer_id", organizerId);
  if (assignmentError) return fail("Failed to load option group assignments");
  const itemIds = (assignments || []).map((row: { item_id: string }) => row.item_id);
  if (!(await markItemsOptionsNormalized(auth.admin, organizerId, itemIds))) {
    return fail("Failed to mark menu item options as normalized");
  }
  const { error } = await auth.admin.from("menu_option_groups").delete().eq("id", groupId).eq("organizer_id", organizerId);
  if (error) return fail("Failed to delete option group");
  revalidateMenu(organizerId);
  return { success: true as const };
}

async function getOwnedGroup(admin: ReturnType<typeof createSupabaseAdmin>, groupId: string, organizerId: string) {
  const { data, error } = await admin.from("menu_option_groups").select("id, organizer_id, kind")
    .eq("id", groupId).eq("organizer_id", organizerId).maybeSingle();
  return error ? null : data;
}

export async function createMenuOption(groupId: string, organizerId: string, input: OptionInput) {
  const auth = await authorize(organizerId, ["owner", "admin", "manager", "editor"]);
  if ("error" in auth && auth.error) return fail(auth.error);
  const group = await getOwnedGroup(auth.admin, groupId, organizerId);
  if (!group) return fail("Option group not found");
  const { data: existingOptions, error: existingOptionsError } = await auth.admin.from("menu_options").select("id, is_default")
    .eq("group_id", groupId).eq("organizer_id", organizerId);
  if (existingOptionsError) return fail("Failed to check existing options");
  if ((existingOptions || []).length >= MAX_OPTIONS) return fail(`A group can have at most ${MAX_OPTIONS} options`);
  if (!input || typeof input !== "object") return fail("Menu option input is required");
  const payload = {
    name: typeof input.name === "string" ? input.name.trim() : input.name,
    description: input.description ?? null,
    price: input.price,
    image_url: input.image_url ?? null,
    is_default: input.is_default ?? false,
    max_qty: input.max_qty ?? 1,
    is_available: input.is_available ?? true,
    allergens: input.allergens ?? [],
    position: input.position ?? 0,
  };
  const validationError = validateOption(payload);
  if (validationError) return fail(validationError);
  if (group.kind === "variant" && payload.is_default && (existingOptions || []).some((option: { is_default: boolean }) => option.is_default)) {
    return fail("A variant group can have at most one default option");
  }
  const { data, error } = await auth.admin.from("menu_options")
    .insert({ ...payload, group_id: groupId, organizer_id: organizerId }).select("*").single();
  if (error) return fail("Failed to create menu option");
  revalidateMenu(organizerId);
  return { success: true as const, data };
}

export async function updateMenuOption(optionId: string, groupId: string, organizerId: string, input: OptionInput) {
  const auth = await authorize(organizerId, ["owner", "admin", "manager", "editor"]);
  if ("error" in auth && auth.error) return fail(auth.error);
  const group = await getOwnedGroup(auth.admin, groupId, organizerId);
  if (!group) return fail("Option group not found");
  const { data: existing, error: findError } = await auth.admin.from("menu_options").select("*")
    .eq("id", optionId).eq("group_id", groupId).eq("organizer_id", organizerId).maybeSingle();
  if (findError || !existing) return fail("Menu option not found");
  const payload = { ...existing, ...input };
  const validationError = validateOption(payload);
  if (validationError) return fail(validationError);
  if (input.updated_at !== undefined && input.updated_at !== existing.updated_at) return fail("This option changed by someone else. Reload and try again.");
  if (group.kind === "variant" && payload.is_default) {
    const { data: defaults, error: defaultsError } = await auth.admin.from("menu_options").select("id")
      .eq("group_id", groupId).eq("is_default", true);
    if (defaultsError) return fail("Failed to check variant defaults");
    if ((defaults || []).some((option: { id: string }) => option.id !== optionId)) return fail("A variant group can have at most one default option");
  }
  const updates: Record<string, unknown> = {};
  for (const key of ["name", "description", "price", "image_url", "is_default", "max_qty", "is_available", "allergens", "position"] as const) {
    if (input[key] !== undefined) updates[key] = key === "name" && typeof input[key] === "string" ? input[key].trim() : input[key];
  }
  const { data, error } = await auth.admin.from("menu_options").update(updates)
    .eq("id", optionId).eq("group_id", groupId).eq("organizer_id", organizerId)
    .eq("updated_at", input.updated_at ?? existing.updated_at).select("*").maybeSingle();
  if (error || !data) return fail("This option changed by someone else. Reload and try again.");
  revalidateMenu(organizerId);
  return { success: true as const, data };
}

export async function deleteMenuOption(optionId: string, groupId: string, organizerId: string) {
  const auth = await authorize(organizerId, ["owner", "admin", "manager"]);
  if ("error" in auth && auth.error) return fail(auth.error);
  const { error } = await auth.admin.from("menu_options").delete()
    .eq("id", optionId).eq("group_id", groupId).eq("organizer_id", organizerId);
  if (error) return fail("Failed to delete menu option");
  revalidateMenu(organizerId);
  return { success: true as const };
}

async function getGroupOptions(admin: ReturnType<typeof createSupabaseAdmin>, groupId: string) {
  const { data, error } = await admin.from("menu_options").select("id").eq("group_id", groupId);
  return error ? null : new Set((data || []).map((option: { id: string }) => option.id));
}

export async function assignMenuOptionGroup(itemId: string, groupId: string, organizerId: string, input: AssignmentInput = {}) {
  const auth = await authorize(organizerId, ["owner", "admin", "manager", "editor"]);
  if ("error" in auth && auth.error) return fail(auth.error);
  const [{ data: item }, group] = await Promise.all([
    auth.admin.from("menu_items").select("id, organizer_id").eq("id", itemId).eq("organizer_id", organizerId).maybeSingle(),
    getOwnedGroup(auth.admin, groupId, organizerId),
  ]);
  if (!item || !group) return fail("Menu item or option group not found in this organizer");
  const { data: assignments, error: assignmentsError } = await auth.admin.from("menu_item_option_groups")
    .select("group_id").eq("item_id", itemId).eq("organizer_id", organizerId);
  if (assignmentsError) return fail("Failed to check existing option group assignments");
  const existingGroupIds = (assignments || []).map((assignment: { group_id: string }) => assignment.group_id);
  if (existingGroupIds.includes(groupId)) return fail("Option group is already assigned to this item");
  if (existingGroupIds.length >= MAX_GROUPS) return fail(`A menu item can have at most ${MAX_GROUPS} option groups`);
  if (group.kind === "variant" && existingGroupIds.length > 0) {
    const { data: existingGroups, error: existingGroupsError } = await auth.admin.from("menu_option_groups")
      .select("id, kind").in("id", existingGroupIds);
    if (existingGroupsError) return fail("Failed to check existing variant assignments");
    if ((existingGroups || []).some((existingGroup: { kind: string }) => existingGroup.kind === "variant")) {
      return fail("A menu item can have at most one variant group");
    }
  }
  const optionIds = await getGroupOptions(auth.admin, groupId);
  if (!optionIds) return fail("Failed to load menu options");
  const payload = {
    hidden_option_ids: input.hidden_option_ids ?? [],
    price_overrides: input.price_overrides ?? {},
    position: input.position ?? 0,
  };
  const validationError = validateAssignment(payload, optionIds);
  if (validationError) return fail(validationError);
  const { data, error } = await auth.admin.from("menu_item_option_groups")
    .insert({ ...payload, organizer_id: organizerId, item_id: itemId, group_id: groupId }).select("*").single();
  if (error) return fail("Failed to assign option group to menu item");
  if (!(await markItemsOptionsNormalized(auth.admin, organizerId, [itemId]))) {
    await auth.admin.from("menu_item_option_groups").delete().eq("id", data.id).eq("organizer_id", organizerId);
    return fail("Failed to mark menu item options as normalized");
  }
  revalidateMenu(organizerId);
  return { success: true as const, data };
}

export async function updateMenuItemOptionGroup(assignmentId: string, organizerId: string, input: AssignmentInput) {
  const auth = await authorize(organizerId, ["owner", "admin", "manager", "editor"]);
  if ("error" in auth && auth.error) return fail(auth.error);
  const { data: existing, error: findError } = await auth.admin.from("menu_item_option_groups").select("*")
    .eq("id", assignmentId).eq("organizer_id", organizerId).maybeSingle();
  if (findError || !existing) return fail("Menu item option group assignment not found");
  const optionIds = await getGroupOptions(auth.admin, existing.group_id);
  if (!optionIds) return fail("Failed to load menu options");
  const payload = {
    hidden_option_ids: input.hidden_option_ids ?? existing.hidden_option_ids ?? [],
    price_overrides: input.price_overrides ?? existing.price_overrides ?? {},
    position: input.position ?? existing.position ?? 0,
  };
  const validationError = validateAssignment(payload, optionIds);
  if (validationError) return fail(validationError);
  if (input.updated_at !== undefined && input.updated_at !== existing.updated_at) return fail("This assignment changed by someone else. Reload and try again.");
  const { data, error } = await auth.admin.from("menu_item_option_groups").update(payload)
    .eq("id", assignmentId).eq("organizer_id", organizerId)
    .eq("updated_at", input.updated_at ?? existing.updated_at).select("*").maybeSingle();
  if (error || !data) return fail("This assignment changed by someone else. Reload and try again.");
  if (!(await markItemsOptionsNormalized(auth.admin, organizerId, [existing.item_id]))) return fail("Failed to mark menu item options as normalized");
  revalidateMenu(organizerId);
  return { success: true as const, data };
}

export async function unassignMenuOptionGroup(assignmentId: string, organizerId: string) {
  const auth = await authorize(organizerId, ["owner", "admin", "manager", "editor"]);
  if ("error" in auth && auth.error) return fail(auth.error);
  const { data: assignment, error: assignmentError } = await auth.admin.from("menu_item_option_groups")
    .select("item_id").eq("id", assignmentId).eq("organizer_id", organizerId).maybeSingle();
  if (assignmentError) return fail("Failed to load menu item option group assignment");
  if (assignment && !(await markItemsOptionsNormalized(auth.admin, organizerId, [assignment.item_id]))) {
    return fail("Failed to mark menu item options as normalized");
  }
  const { error } = await auth.admin.from("menu_item_option_groups").delete()
    .eq("id", assignmentId).eq("organizer_id", organizerId);
  if (error) return fail("Failed to remove option group from menu item");
  revalidateMenu(organizerId);
  return { success: true as const };
}

export async function reorderMenuItemOptionGroups(itemId: string, organizerId: string, rows: Array<{ id: string; updated_at: string }>) {
  const auth = await authorize(organizerId, ["owner", "admin", "manager", "editor"]);
  if ("error" in auth && auth.error) return fail(auth.error);
  if (!Array.isArray(rows) || rows.length > MAX_GROUPS || rows.some((row) => !row || typeof row.id !== "string" || typeof row.updated_at !== "string") || new Set(rows.map((row) => row.id)).size !== rows.length) return fail("Invalid option group order");
  const { data: current, error } = await auth.admin.from("menu_item_option_groups").select("id, updated_at")
    .eq("organizer_id", organizerId).eq("item_id", itemId);
  if (error) return fail("Failed to load item option groups");
  if ((current || []).length !== rows.length || rows.some((row) => !(current || []).some((entry: { id: string; updated_at: string }) => entry.id === row.id && entry.updated_at === row.updated_at))) {
    return fail("These option groups changed by someone else. Reload and try again.");
  }
  for (const [position, row] of rows.entries()) {
    const { data, error: updateError } = await auth.admin.from("menu_item_option_groups").update({ position })
      .eq("id", row.id).eq("organizer_id", organizerId).eq("updated_at", row.updated_at).select("id").maybeSingle();
    if (updateError || !data) return fail("These option groups changed by someone else. Reload and try again.");
  }
  if (!(await markItemsOptionsNormalized(auth.admin, organizerId, [itemId]))) return fail("Failed to mark menu item options as normalized");
  revalidateMenu(organizerId);
  return { success: true as const };
}

export async function reorderMenuOptions(groupId: string, organizerId: string, rows: Array<{ id: string; updated_at: string }>) {
  const auth = await authorize(organizerId, ["owner", "admin", "manager", "editor"]);
  if ("error" in auth && auth.error) return fail(auth.error);
  if (!Array.isArray(rows) || rows.length > MAX_OPTIONS || rows.some((row) => !row || typeof row.id !== "string" || typeof row.updated_at !== "string") || new Set(rows.map((row) => row.id)).size !== rows.length) return fail("Invalid option order");
  const { data: current, error } = await auth.admin.from("menu_options").select("id, updated_at")
    .eq("organizer_id", organizerId).eq("group_id", groupId);
  if (error) return fail("Failed to load menu options");
  if ((current || []).length !== rows.length || rows.some((row) => !(current || []).some((entry: { id: string; updated_at: string }) => entry.id === row.id && entry.updated_at === row.updated_at))) {
    return fail("These options changed by someone else. Reload and try again.");
  }
  for (const [position, row] of rows.entries()) {
    const { data, error: updateError } = await auth.admin.from("menu_options").update({ position })
      .eq("id", row.id).eq("group_id", groupId).eq("organizer_id", organizerId).eq("updated_at", row.updated_at).select("id").maybeSingle();
    if (updateError || !data) return fail("These options changed by someone else. Reload and try again.");
  }
  revalidateMenu(organizerId);
  return { success: true as const };
}

export async function upgradeMenuItemOptions(itemId: string, organizerId: string) {
  const auth = await authorize(organizerId, ["owner", "admin", "manager", "editor"]);
  if ("error" in auth && auth.error) return fail(auth.error);
  const { data: item, error: itemError } = await auth.admin.from("menu_items")
    .select("id, organizer_id, option_groups, options_source").eq("id", itemId).eq("organizer_id", organizerId).maybeSingle();
  if (itemError || !item) return fail("Menu item not found");
  if (item.options_source === "normalized") return fail("This item already uses reusable option groups");
  const plan = buildMenuOptionBackfillPlan([item]);
  if (plan.skipped.length) return fail(`This item cannot be upgraded: ${plan.skipped[0].reason}`);
  if (!plan.groups.length) return fail("This item has no valid JSON option groups to upgrade");
  const { error } = await auth.admin.rpc("upgrade_menu_item_option_groups", {
    p_item_id: itemId,
    p_organizer_id: organizerId,
    p_groups: plan.groups,
    p_options: plan.options,
    p_assignments: plan.assignments,
  });
  if (error) return fail(error.message || "Failed to upgrade item options");
  revalidateMenu(organizerId);
  return { success: true as const, data: { groups: plan.groups.length, options: plan.options.length } };
}
