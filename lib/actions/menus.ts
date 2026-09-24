"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { requireTenantContext } from "@/lib/tenant-context";
import { sanitizeUrl } from "@/lib/sanitize-html";
import { revalidatePath } from "next/cache";

const NAME_MAX = 80;
const DESC_MAX = 500;
const PRICE_MAX = 999999.99;
const POSITION_MIN = 0;
const POSITION_MAX = 999;
const MAX_ARRAY = 12;
const DIETARY_TAGS = ["vegan", "vegetarian", "gluten_free", "halal", "kosher", "dairy_free", "nut_free"] as const;
const ALLERGENS = ["nuts", "dairy", "gluten", "soy", "eggs", "shellfish"] as const;

function validateName(v: unknown): string | null {
  if (typeof v !== "string" || v.trim().length < 1 || v.trim().length > NAME_MAX) return `Name must be 1–${NAME_MAX}`;
  return null;
}
function validateDesc(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") return "Description must be string";
  if (v.trim().length > DESC_MAX) return `Description ≤${DESC_MAX}`;
  return null;
}
function validatePrice(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return "Price is required";
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > PRICE_MAX) return `Price must be 0–${PRICE_MAX}`;
  return null;
}
function validateImageUrl(url: unknown): string | null {
  if (!url) return null;
  if (typeof url !== "string") return "Image URL must be string";
  if (url.length > 2048) return "Image URL too long";
  if (!sanitizeUrl(url)) return "Invalid image URL";
  return null;
}
function validatePosition(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < POSITION_MIN || n > POSITION_MAX) return `Position must be ${POSITION_MIN}–${POSITION_MAX}`;
  return null;
}

async function assertTenant(organizerId: string, roles: ("owner" | "admin" | "manager" | "editor")[]) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  await requireTenantContext(user.id, organizerId, roles as any);
  return user;
}

function validateTags(tags: unknown, allowed: readonly string[], label: string): string | null {
  if (!tags) return null;
  if (!Array.isArray(tags)) return `${label} must be array`;
  if (tags.length > MAX_ARRAY) return `${label} max ${MAX_ARRAY}`;
  for (const t of tags) {
    if (typeof t !== "string" || !allowed.includes(t)) return `Invalid ${label} value: ${t}`;
  }
  return null;
}

function validateModifiers(modifiers: unknown): string | null {
  if (!modifiers) return null;
  if (!Array.isArray(modifiers)) return "Modifiers must be array";
  if (modifiers.length > MAX_ARRAY) return `Modifiers max ${MAX_ARRAY}`;
  for (const m of modifiers as any[]) {
    if (!m || typeof m !== "object") return "Modifier must be object";
    if (typeof m.name !== "string" || m.name.trim().length < 1 || m.name.trim().length > 80) return "Modifier name 1–80";
    const delta = Number(m.price_delta);
    if (!Number.isFinite(delta) || delta < -10000 || delta > 10000) return "Modifier price_delta -10000..10000";
  }
  return null;
}

// ── Sections ─────────────────────────────────────────────────────────

export async function listMenuSections(organizerId: string) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };
  try {
    await requireTenantContext(user.id, organizerId, ["owner", "admin", "manager", "editor", "finance", "viewer"]);
  } catch {
    return { success: false, error: "Forbidden" };
  }
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.from("menu_sections").select("*").eq("organizer_id", organizerId).order("position", { ascending: true });
  if (error) return { success: false, error: "Failed to load sections" };
  return { success: true, data };
}

export async function createMenuSection(organizerId: string, input: { name: string; description?: string | null; position?: number; is_active?: boolean }) {
  try {
    await assertTenant(organizerId, ["owner", "admin", "manager", "editor"]);
  } catch {
    return { success: false, error: "Forbidden: insufficient entity permissions" };
  }
  const nameErr = validateName(input.name);
  if (nameErr) return { success: false, error: nameErr };
  const descErr = validateDesc(input.description);
  if (descErr) return { success: false, error: descErr };
  const posErr = validatePosition(input.position);
  if (posErr) return { success: false, error: posErr };
  const admin = createSupabaseAdmin();
  let position = input.position;
  if (position === undefined || position === null) {
    const { data: maxRow } = await admin.from("menu_sections").select("position").eq("organizer_id", organizerId).order("position", { ascending: false }).limit(1).maybeSingle();
    const maxPos = maxRow?.position ?? -1;
    position = Math.min(maxPos + 1, POSITION_MAX);
  }
  const { data, error } = await admin.from("menu_sections").insert({
    organizer_id: organizerId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    position: Number(position),
    is_active: input.is_active ?? true,
  }).select("*").single();
  if (error) return { success: false, error: "Failed to create section" };
  revalidatePath(`/dashboard/org/${organizerId}/menu`);
  return { success: true, data };
}

export async function updateMenuSection(sectionId: string, organizerId: string, input: { name?: string; description?: string | null; position?: number; is_active?: boolean }) {
  try {
    await assertTenant(organizerId, ["owner", "admin", "manager", "editor"]);
  } catch {
    return { success: false, error: "Forbidden: insufficient entity permissions" };
  }
  if (input.position !== undefined) {
    const e = validatePosition(input.position);
    if (e) return { success: false, error: e };
  }
  const admin = createSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) {
    const e = validateName(input.name);
    if (e) return { success: false, error: e };
    updates.name = input.name.trim();
  }
  if (input.description !== undefined) {
    const e = validateDesc(input.description);
    if (e) return { success: false, error: e };
    updates.description = input.description ? input.description.trim() : null;
  }
  if (input.position !== undefined) updates.position = Number(input.position);
  if (input.is_active !== undefined) updates.is_active = Boolean(input.is_active);
  const { data, error } = await admin.from("menu_sections").update(updates).eq("id", sectionId).eq("organizer_id", organizerId).select("*").single();
  if (error) return { success: false, error: "Failed to update section" };
  revalidatePath(`/dashboard/org/${organizerId}/menu`);
  return { success: true, data };
}

export async function deleteMenuSection(sectionId: string, organizerId: string) {
  try {
    await assertTenant(organizerId, ["owner", "admin", "manager"]);
  } catch {
    return { success: false, error: "Forbidden: insufficient entity permissions" };
  }
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("menu_sections").delete().eq("id", sectionId).eq("organizer_id", organizerId);
  if (error) return { success: false, error: "Failed to delete section" };
  revalidatePath(`/dashboard/org/${organizerId}/menu`);
  return { success: true };
}

// ── Items ────────────────────────────────────────────────────────────

export async function createMenuItem(sectionId: string, organizerId: string, input: { name: string; description?: string | null; price: number; image_url?: string | null; dietary_tags?: string[]; allergens?: string[]; modifiers?: { name: string; price_delta: number }[]; position?: number; is_active?: boolean; is_featured?: boolean }) {
  try {
    await assertTenant(organizerId, ["owner", "admin", "manager", "editor"]);
  } catch {
    return { success: false, error: "Forbidden: insufficient entity permissions" };
  }
  const nameErr = validateName(input.name);
  if (nameErr) return { success: false, error: nameErr };
  const descErr = validateDesc(input.description);
  if (descErr) return { success: false, error: descErr };
  const priceErr = validatePrice(input.price);
  if (priceErr) return { success: false, error: priceErr };
  const imgErr = validateImageUrl(input.image_url);
  if (imgErr) return { success: false, error: imgErr };
  const dtErr = validateTags(input.dietary_tags, DIETARY_TAGS, "dietary_tags");
  if (dtErr) return { success: false, error: dtErr };
  const alErr = validateTags(input.allergens, ALLERGENS, "allergens");
  if (alErr) return { success: false, error: alErr };
  const modErr = validateModifiers(input.modifiers);
  if (modErr) return { success: false, error: modErr };

  const admin = createSupabaseAdmin();
  // verify section belongs to organizer (trigger will also enforce)
  const { data: section } = await admin.from("menu_sections").select("id, organizer_id").eq("id", sectionId).eq("organizer_id", organizerId).maybeSingle();
  if (!section) return { success: false, error: "Section not found or not owned by tenant" };

  const sanitizedImage = input.image_url ? sanitizeUrl(input.image_url) || null : null;
  let position = input.position;
  if (position === undefined || position === null) {
    const { data: maxRow } = await admin.from("menu_items").select("position").eq("section_id", sectionId).order("position", { ascending: false }).limit(1).maybeSingle();
    const maxPos = maxRow?.position ?? -1;
    position = Math.min(maxPos + 1, POSITION_MAX);
  } else {
    const e = validatePosition(position);
    if (e) return { success: false, error: e };
  }
  const { data, error } = await admin.from("menu_items").insert({
    section_id: sectionId,
    organizer_id: organizerId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    price: Number(input.price),
    image_url: sanitizedImage,
    dietary_tags: input.dietary_tags || [],
    allergens: input.allergens || [],
    modifiers: input.modifiers || [],
    position: Number(position),
    is_active: input.is_active ?? true,
    is_featured: input.is_featured ?? false,
  }).select("*").single();
  if (error) return { success: false, error: "Failed to create menu item" };
  revalidatePath(`/dashboard/org/${organizerId}/menu`);
  return { success: true, data };
}

export async function updateMenuItem(itemId: string, sectionId: string, organizerId: string, input: { name?: string; description?: string | null; price?: number; image_url?: string | null; dietary_tags?: string[]; allergens?: string[]; modifiers?: { name: string; price_delta: number }[]; position?: number; is_active?: boolean; is_featured?: boolean }) {
  try {
    await assertTenant(organizerId, ["owner", "admin", "manager", "editor"]);
  } catch {
    return { success: false, error: "Forbidden: insufficient entity permissions" };
  }
  const admin = createSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) {
    const e = validateName(input.name);
    if (e) return { success: false, error: e };
    updates.name = input.name.trim();
  }
  if (input.description !== undefined) {
    const e = validateDesc(input.description);
    if (e) return { success: false, error: e };
    updates.description = input.description ? input.description.trim() : null;
  }
  if (input.price !== undefined) {
    const e = validatePrice(input.price);
    if (e) return { success: false, error: e };
    updates.price = Number(input.price);
  }
  if (input.image_url !== undefined) {
    const e = validateImageUrl(input.image_url);
    if (e) return { success: false, error: e };
    updates.image_url = input.image_url ? sanitizeUrl(input.image_url) || null : null;
  }
  if (input.dietary_tags !== undefined) {
    const e = validateTags(input.dietary_tags, DIETARY_TAGS, "dietary_tags");
    if (e) return { success: false, error: e };
    updates.dietary_tags = input.dietary_tags;
  }
  if (input.allergens !== undefined) {
    const e = validateTags(input.allergens, ALLERGENS, "allergens");
    if (e) return { success: false, error: e };
    updates.allergens = input.allergens;
  }
  if (input.modifiers !== undefined) {
    const e = validateModifiers(input.modifiers);
    if (e) return { success: false, error: e };
    updates.modifiers = input.modifiers;
  }
  if (input.position !== undefined) {
    const e = validatePosition(input.position);
    if (e) return { success: false, error: e };
    updates.position = Number(input.position);
  }
  if (input.is_active !== undefined) updates.is_active = Boolean(input.is_active);
  if (input.is_featured !== undefined) updates.is_featured = Boolean(input.is_featured);

  const { data, error } = await admin.from("menu_items").update(updates).eq("id", itemId).eq("section_id", sectionId).eq("organizer_id", organizerId).select("*").single();
  if (error) return { success: false, error: "Failed to update menu item" };
  revalidatePath(`/dashboard/org/${organizerId}/menu`);
  return { success: true, data };
}

export async function deleteMenuItem(itemId: string, sectionId: string, organizerId: string) {
  try {
    await assertTenant(organizerId, ["owner", "admin", "manager"]);
  } catch {
    return { success: false, error: "Forbidden: insufficient entity permissions" };
  }
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("menu_items").delete().eq("id", itemId).eq("section_id", sectionId).eq("organizer_id", organizerId);
  if (error) return { success: false, error: "Failed to delete menu item" };
  revalidatePath(`/dashboard/org/${organizerId}/menu`);
  return { success: true };
}

export async function reorderMenuSections(organizerId: string, orderedIds: string[]) {
  try {
    await assertTenant(organizerId, ["owner", "admin", "manager", "editor"]);
  } catch {
    return { success: false, error: "Forbidden: insufficient entity permissions" };
  }
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return { success: false, error: "Invalid order" };
  if (orderedIds.length > 100) return { success: false, error: "Too many items" };
  if (new Set(orderedIds).size !== orderedIds.length) return { success: false, error: "Duplicate ids" };
  const admin = createSupabaseAdmin();
  const { data: existing } = await admin.from("menu_sections").select("id").eq("organizer_id", organizerId).in("id", orderedIds);
  if (!existing || existing.length !== orderedIds.length) return { success: false, error: "Invalid section IDs" };
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin.from("menu_sections").update({ position: i, updated_at: new Date().toISOString() }).eq("id", orderedIds[i]).eq("organizer_id", organizerId);
    if (error) return { success: false, error: "Failed to reorder sections" };
  }
  revalidatePath(`/dashboard/org/${organizerId}/menu`);
  return { success: true };
}

export async function reorderMenuItems(sectionId: string, organizerId: string, orderedIds: string[]) {
  try {
    await assertTenant(organizerId, ["owner", "admin", "manager", "editor"]);
  } catch {
    return { success: false, error: "Forbidden: insufficient entity permissions" };
  }
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return { success: false, error: "Invalid order" };
  if (orderedIds.length > 100) return { success: false, error: "Too many items" };
  if (new Set(orderedIds).size !== orderedIds.length) return { success: false, error: "Duplicate ids" };
  const admin = createSupabaseAdmin();
  const { data: section } = await admin.from("menu_sections").select("id").eq("id", sectionId).eq("organizer_id", organizerId).maybeSingle();
  if (!section) return { success: false, error: "Section not found or not owned by tenant" };
  const { data: existing } = await admin.from("menu_items").select("id").eq("section_id", sectionId).eq("organizer_id", organizerId).in("id", orderedIds);
  if (!existing || existing.length !== orderedIds.length) return { success: false, error: "Invalid menu item IDs" };
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin.from("menu_items").update({ position: i, updated_at: new Date().toISOString() }).eq("id", orderedIds[i]).eq("section_id", sectionId).eq("organizer_id", organizerId);
    if (error) return { success: false, error: "Failed to reorder items" };
  }
  revalidatePath(`/dashboard/org/${organizerId}/menu`);
  return { success: true };
}
