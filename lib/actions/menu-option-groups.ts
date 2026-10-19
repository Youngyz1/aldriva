"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import { requireTenantContext } from "@/lib/tenant-context";
import { safeImageSrc } from "@/lib/image-url";

const MAX_NAME = 80;
const MAX_PRICE = 999999.99;
const MAX_GROUPS = 8;
const MAX_OPTIONS = 20;
const ALLOWED_ALLERGENS = ["nuts", "dairy", "gluten", "soy", "eggs", "shellfish"] as const;

type WriteRole = "owner" | "admin" | "manager" | "editor";
type DeleteRole = "owner" | "admin" | "manager" | "editor";

interface GroupInput {
  name?: unknown;
  kind?: unknown;
  min_select?: unknown;
  max_select?: unknown;
  is_required?: unknown;
  position?: unknown;
  is_active?: unknown;
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
}

interface AssignmentInput {
  hidden_option_ids?: unknown;
  price_overrides?: unknown;
  position?: unknown;
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
  if (!Number.isInteger(group.min_select) || group.min_select < 0) return "Minimum selections must be an integer of at least 0";
  if (!Number.isInteger(group.max_select) || group.max_select < 1 || group.max_select < group.min_select || group.max_select > MAX_OPTIONS) {
    return `Maximum selections must be between 1 and ${MAX_OPTIONS} and at least the minimum`;
  }
  if (typeof group.is_required !== "boolean") return "Required must be a boolean";
  if (group.is_required && group.min_select < 1) return "Required groups need a minimum of at least 1";
  if (group.kind === "variant" && (group.min_select !== 1 || group.max_select !== 1 || !group.is_required)) {
    return "Variant groups must be required and allow exactly one selection";
  }
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
    return { error: "Forbidden" as const };
  }
  return { admin: createSupabaseAdmin() };
}

function revalidateMenu(organizerId: string) {
  revalidatePath(`/dashboard/org/${organizerId}/menu`);
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
  return { success: true as const, data: { groups: groups || [], options: options || [] } };
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
  const updates: Record<string, unknown> = {};
  for (const key of ["name", "kind", "min_select", "max_select", "is_required", "position", "is_active"] as const) {
    if (input[key] !== undefined) updates[key] = key === "name" && typeof input[key] === "string" ? input[key].trim() : input[key];
  }
  const { data, error } = await auth.admin.from("menu_option_groups").update(updates)
    .eq("id", groupId).eq("organizer_id", organizerId).select("*").single();
  if (error) return fail("Failed to update option group");
  revalidateMenu(organizerId);
  return { success: true as const, data };
}

export async function deleteMenuOptionGroup(groupId: string, organizerId: string) {
  const auth = await authorize(organizerId, ["owner", "admin", "manager", "editor"]);
  if ("error" in auth && auth.error) return fail(auth.error);
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
  const updates: Record<string, unknown> = {};
  for (const key of ["name", "description", "price", "image_url", "is_default", "max_qty", "is_available", "allergens", "position"] as const) {
    if (input[key] !== undefined) updates[key] = key === "name" && typeof input[key] === "string" ? input[key].trim() : input[key];
  }
  const { data, error } = await auth.admin.from("menu_options").update(updates)
    .eq("id", optionId).eq("group_id", groupId).eq("organizer_id", organizerId).select("*").single();
  if (error) return fail("Failed to update menu option");
  revalidateMenu(organizerId);
  return { success: true as const, data };
}

export async function deleteMenuOption(optionId: string, groupId: string, organizerId: string) {
  const auth = await authorize(organizerId, ["owner", "admin", "manager", "editor"]);
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
    .select("group_id").eq("item_id", itemId);
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
  const { data, error } = await auth.admin.from("menu_item_option_groups").update(payload)
    .eq("id", assignmentId).eq("organizer_id", organizerId).select("*").single();
  if (error) return fail("Failed to update menu item option group assignment");
  revalidateMenu(organizerId);
  return { success: true as const, data };
}

export async function unassignMenuOptionGroup(assignmentId: string, organizerId: string) {
  const auth = await authorize(organizerId, ["owner", "admin", "manager", "editor"]);
  if ("error" in auth && auth.error) return fail(auth.error);
  const { error } = await auth.admin.from("menu_item_option_groups").delete()
    .eq("id", assignmentId).eq("organizer_id", organizerId);
  if (error) return fail("Failed to remove option group from menu item");
  revalidateMenu(organizerId);
  return { success: true as const };
}
