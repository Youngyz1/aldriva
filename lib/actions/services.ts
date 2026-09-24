"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { requireTenantContext } from "@/lib/tenant-context";
import { createSlug } from "@/lib/slug";
import { sanitizeUrl } from "@/lib/sanitize-html";
import { revalidatePath } from "next/cache";

const TITLE_MAX = 120;
const DESC_MAX = 2000;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX = 120;
const DURATION_MIN = 5;
const DURATION_MAX = 1440;
const PRICE_MIN = 0;
const PRICE_MAX = 999999.99;
const POSITION_MIN = 0;
const POSITION_MAX = 999;
const TIER_NAME_MAX = 80;
const TIER_DESC_MAX = 500;

function validateTitle(title: unknown): string | null {
  if (typeof title !== "string") return "Title is required";
  const t = title.trim();
  if (t.length < 1 || t.length > TITLE_MAX) return `Title must be 1–${TITLE_MAX} characters`;
  return null;
}
function validateDesc(desc: unknown): string | null {
  if (desc === undefined || desc === null || desc === "") return null;
  if (typeof desc !== "string") return "Description must be a string";
  if (desc.trim().length > DESC_MAX) return `Description must be ≤${DESC_MAX} characters`;
  return null;
}
function validateDuration(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < DURATION_MIN || n > DURATION_MAX) return `Duration must be ${DURATION_MIN}–${DURATION_MAX} minutes`;
  return null;
}
function validatePrice(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return "Price is required";
  const n = Number(v);
  if (!Number.isFinite(n) || n < PRICE_MIN || n > PRICE_MAX) return `Price must be ${PRICE_MIN}–${PRICE_MAX}`;
  return null;
}
function validateImageUrl(url: unknown): string | null {
  if (!url) return null;
  if (typeof url !== "string") return "Image URL must be a string";
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

export async function listServices(organizerId: string) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };
  try {
    await requireTenantContext(user.id, organizerId, ["owner", "admin", "manager", "editor", "finance", "viewer"]);
  } catch {
    return { success: false, error: "Forbidden" };
  }
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.from("services").select("*").eq("organizer_id", organizerId).order("position", { ascending: true }).order("created_at", { ascending: true });
  if (error) return { success: false, error: "Failed to load services" };
  return { success: true, data };
}

export async function getServiceById(serviceId: string, organizerId: string) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };
  try {
    await requireTenantContext(user.id, organizerId, ["owner", "admin", "manager", "editor", "finance", "viewer"]);
  } catch {
    return { success: false, error: "Forbidden" };
  }
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.from("services").select("*").eq("id", serviceId).eq("organizer_id", organizerId).maybeSingle();
  if (error || !data) return { success: false, error: "Service not found" };
  const { data: tiers } = await admin.from("service_tiers").select("*").eq("service_id", serviceId).order("position", { ascending: true });
  return { success: true, data: { service: data, tiers: tiers || [] } };
}

export async function createService(organizerId: string, input: { title: string; description?: string; duration_minutes?: number | null; price: number; image_url?: string | null; position?: number; is_active?: boolean }) {
  try {
    await assertTenant(organizerId, ["owner", "admin", "manager", "editor"]);
  } catch {
    return { success: false, error: "Forbidden: insufficient entity permissions" };
  }
  const titleErr = validateTitle(input.title);
  if (titleErr) return { success: false, error: titleErr };
  const descErr = validateDesc(input.description);
  if (descErr) return { success: false, error: descErr };
  const durErr = validateDuration(input.duration_minutes);
  if (durErr) return { success: false, error: durErr };
  const priceErr = validatePrice(input.price);
  if (priceErr) return { success: false, error: priceErr };
  const imgErr = validateImageUrl(input.image_url);
  if (imgErr) return { success: false, error: imgErr };
  const posErr = validatePosition(input.position);
  if (posErr) return { success: false, error: posErr };

  const admin = createSupabaseAdmin();
  let slug = createSlug(input.title);
  if (!SLUG_REGEX.test(slug)) slug = "service";
  slug = slug.slice(0, SLUG_MAX);
  // bounded collision retry
  let candidate = slug;
  let counter = 1;
  while (counter < 10) {
    const { data: existing } = await admin.from("services").select("id").eq("organizer_id", organizerId).eq("slug", candidate).maybeSingle();
    if (!existing) break;
    candidate = `${slug}-${counter}`;
    counter++;
  }
  slug = candidate;
  if (slug.length > SLUG_MAX) slug = slug.slice(0, SLUG_MAX);
  if (!SLUG_REGEX.test(slug)) return { success: false, error: "Invalid slug" };

  const sanitizedImage = input.image_url ? sanitizeUrl(input.image_url) || null : null;

  const { data, error } = await admin.from("services").insert({
    organizer_id: organizerId,
    title: input.title.trim(),
    slug,
    description: input.description?.trim() || null,
    duration_minutes: input.duration_minutes ?? null,
    price: Number(input.price),
    image_url: sanitizedImage,
    position: input.position ?? 0,
    is_active: input.is_active ?? true,
  }).select("*").single();

  if (error) {
    if (error.code === "23505") return { success: false, error: "Service slug already exists" };
    return { success: false, error: "Failed to create service" };
  }
  revalidatePath(`/dashboard/org/${organizerId}/services`);
  return { success: true, data };
}

export async function updateService(serviceId: string, organizerId: string, input: { title?: string; description?: string | null; duration_minutes?: number | null; price?: number; image_url?: string | null; position?: number; is_active?: boolean }) {
  try {
    await assertTenant(organizerId, ["owner", "admin", "manager", "editor"]);
  } catch {
    return { success: false, error: "Forbidden: insufficient entity permissions" };
  }
  const admin = createSupabaseAdmin();
  const { data: existing } = await admin.from("services").select("*").eq("id", serviceId).eq("organizer_id", organizerId).maybeSingle();
  if (!existing) return { success: false, error: "Service not found" };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) {
    const e = validateTitle(input.title);
    if (e) return { success: false, error: e };
    updates.title = input.title.trim();
    // keep slug stable unless explicitly changed; do not auto-regenerate to avoid breaking URLs
  }
  if (input.description !== undefined) {
    const e = validateDesc(input.description);
    if (e) return { success: false, error: e };
    updates.description = input.description ? input.description.trim() : null;
  }
  if (input.duration_minutes !== undefined) {
    const e = validateDuration(input.duration_minutes);
    if (e) return { success: false, error: e };
    updates.duration_minutes = input.duration_minutes ?? null;
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
  if (input.position !== undefined) {
    const e = validatePosition(input.position);
    if (e) return { success: false, error: e };
    updates.position = Number(input.position);
  }
  if (input.is_active !== undefined) updates.is_active = Boolean(input.is_active);

  const { data, error } = await admin.from("services").update(updates).eq("id", serviceId).eq("organizer_id", organizerId).select("*").single();
  if (error) return { success: false, error: "Failed to update service" };
  revalidatePath(`/dashboard/org/${organizerId}/services`);
  return { success: true, data };
}

export async function deleteService(serviceId: string, organizerId: string) {
  try {
    await assertTenant(organizerId, ["owner", "admin", "manager"]);
  } catch {
    return { success: false, error: "Forbidden: insufficient entity permissions" };
  }
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("services").delete().eq("id", serviceId).eq("organizer_id", organizerId);
  if (error) return { success: false, error: "Failed to delete service" };
  revalidatePath(`/dashboard/org/${organizerId}/services`);
  return { success: true };
}

export async function reorderServices(organizerId: string, orderedIds: string[]) {
  try {
    await assertTenant(organizerId, ["owner", "admin", "manager", "editor"]);
  } catch {
    return { success: false, error: "Forbidden: insufficient entity permissions" };
  }
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return { success: false, error: "Invalid order" };
  if (orderedIds.length > 100) return { success: false, error: "Too many items" };
  const admin = createSupabaseAdmin();
  // verify all belong to organizer
  const { data: existing } = await admin.from("services").select("id").eq("organizer_id", organizerId).in("id", orderedIds);
  if (!existing || existing.length !== orderedIds.length) return { success: false, error: "Invalid service IDs" };
  for (let i = 0; i < orderedIds.length; i++) {
    await admin.from("services").update({ position: i, updated_at: new Date().toISOString() }).eq("id", orderedIds[i]).eq("organizer_id", organizerId);
  }
  revalidatePath(`/dashboard/org/${organizerId}/services`);
  return { success: true };
}

// ── Service tiers ───────────────────────────────────────────────────────

export async function createServiceTier(serviceId: string, organizerId: string, input: { name: string; description?: string | null; duration_minutes?: number | null; price: number; position?: number; is_active?: boolean }) {
  try {
    await assertTenant(organizerId, ["owner", "admin", "manager", "editor"]);
  } catch {
    return { success: false, error: "Forbidden: insufficient entity permissions" };
  }
  if (typeof input.name !== "string" || input.name.trim().length < 1 || input.name.trim().length > TIER_NAME_MAX) return { success: false, error: `Tier name must be 1–${TIER_NAME_MAX}` };
  if (input.description && input.description.trim().length > TIER_DESC_MAX) return { success: false, error: `Tier description ≤${TIER_DESC_MAX}` };
  const durErr = validateDuration(input.duration_minutes);
  if (durErr) return { success: false, error: durErr };
  const priceErr = validatePrice(input.price);
  if (priceErr) return { success: false, error: priceErr };
  const posErr = validatePosition(input.position);
  if (posErr) return { success: false, error: posErr };

  const admin = createSupabaseAdmin();
  const { data: service } = await admin.from("services").select("id, organizer_id").eq("id", serviceId).eq("organizer_id", organizerId).maybeSingle();
  if (!service) return { success: false, error: "Service not found or not owned by tenant" };

  const { data, error } = await admin.from("service_tiers").insert({
    service_id: serviceId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    duration_minutes: input.duration_minutes ?? null,
    price: Number(input.price),
    position: input.position ?? 0,
    is_active: input.is_active ?? true,
  }).select("*").single();
  if (error) return { success: false, error: "Failed to create tier" };
  revalidatePath(`/dashboard/org/${organizerId}/services`);
  return { success: true, data };
}

export async function updateServiceTier(tierId: string, serviceId: string, organizerId: string, input: { name?: string; description?: string | null; duration_minutes?: number | null; price?: number; position?: number; is_active?: boolean }) {
  try {
    await assertTenant(organizerId, ["owner", "admin", "manager", "editor"]);
  } catch {
    return { success: false, error: "Forbidden: insufficient entity permissions" };
  }
  const admin = createSupabaseAdmin();
  // verify tier belongs to service and service belongs to organizer
  const { data: tier } = await admin.from("service_tiers").select("id, service_id").eq("id", tierId).eq("service_id", serviceId).maybeSingle();
  if (!tier) return { success: false, error: "Tier not found" };
  const { data: service } = await admin.from("services").select("id").eq("id", serviceId).eq("organizer_id", organizerId).maybeSingle();
  if (!service) return { success: false, error: "Service not found or not owned by tenant" };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) {
    if (typeof input.name !== "string" || input.name.trim().length < 1 || input.name.trim().length > TIER_NAME_MAX) return { success: false, error: `Tier name must be 1–${TIER_NAME_MAX}` };
    updates.name = input.name.trim();
  }
  if (input.description !== undefined) {
    if (input.description && input.description.trim().length > TIER_DESC_MAX) return { success: false, error: `Tier description ≤${TIER_DESC_MAX}` };
    updates.description = input.description ? input.description.trim() : null;
  }
  if (input.duration_minutes !== undefined) {
    const e = validateDuration(input.duration_minutes);
    if (e) return { success: false, error: e };
    updates.duration_minutes = input.duration_minutes ?? null;
  }
  if (input.price !== undefined) {
    const e = validatePrice(input.price);
    if (e) return { success: false, error: e };
    updates.price = Number(input.price);
  }
  if (input.position !== undefined) {
    const e = validatePosition(input.position);
    if (e) return { success: false, error: e };
    updates.position = Number(input.position);
  }
  if (input.is_active !== undefined) updates.is_active = Boolean(input.is_active);

  const { data, error } = await admin.from("service_tiers").update(updates).eq("id", tierId).select("*").single();
  if (error) return { success: false, error: "Failed to update tier" };
  revalidatePath(`/dashboard/org/${organizerId}/services`);
  return { success: true, data };
}

export async function deleteServiceTier(tierId: string, serviceId: string, organizerId: string) {
  try {
    await assertTenant(organizerId, ["owner", "admin", "manager"]);
  } catch {
    return { success: false, error: "Forbidden: insufficient entity permissions" };
  }
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("service_tiers").delete().eq("id", tierId).eq("service_id", serviceId);
  if (error) return { success: false, error: "Failed to delete tier" };
  // Verify service still belongs to organizer (prevent cross-tenant attachment via direct tier id guess)
  const { data: service } = await admin.from("services").select("id").eq("id", serviceId).eq("organizer_id", organizerId).maybeSingle();
  if (!service) return { success: false, error: "Service not found or not owned by tenant" };
  revalidatePath(`/dashboard/org/${organizerId}/services`);
  return { success: true };
}
