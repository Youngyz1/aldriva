"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { requireTenantContext } from "@/lib/tenant-context";
import { createSlug } from "@/lib/slug";
import { safeImageSrc } from "@/lib/image-url";
import { revalidatePath } from "next/cache";
import { clampSummary, sanitizeIncludes } from "@/lib/validation/service-catalog";

/** Mirrors the pattern in lib/actions/general-booking.ts: treat a missing table/column (migration 220 not yet applied) as "feature not migrated yet", never a crash. */
function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "42P01" || code === "42703") return true;
  const message = (err as { message?: unknown }).message;
  return typeof message === "string" && (message.includes("does not exist") || message.includes("schema cache"));
}

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
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < PRICE_MIN || n > PRICE_MAX) return `Price must be ${PRICE_MIN}–${PRICE_MAX}`;
  return null;
}
function validateImageUrl(url: unknown): string | null {
  if (!url) return null;
  if (typeof url !== "string") return "Image URL must be a string";
  if (url.length > 2048) return "Image URL too long";
  if (!safeImageSrc(url)) return "Invalid image URL";
  return null;
}
function validatePosition(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < POSITION_MIN || n > POSITION_MAX) return `Position must be ${POSITION_MIN}–${POSITION_MAX}`;
  return null;
}
function validateBookingMode(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (v !== "timed" && v !== "date_only") return 'Booking mode must be "timed" or "date_only"';
  return null;
}

/**
 * category_id is the one new optional field that is NOT a "clamp, never
 * reject" field: an id that doesn't resolve to this tenant's own category is
 * a tenant-isolation concern, not a cosmetic input, so it is rejected rather
 * than silently dropped. Caller must only invoke this when categoryId !==
 * undefined (i.e. the field was actually supplied).
 */
async function resolveCategoryId(
  admin: ReturnType<typeof createSupabaseAdmin>,
  organizerId: string,
  categoryId: string | null
): Promise<{ value: string | null; error?: string }> {
  if (categoryId === null || categoryId === "") return { value: null };
  const { data, error } = await admin.from("service_categories").select("id").eq("id", categoryId).eq("organizer_id", organizerId).maybeSingle();
  if (error && isMissingTableError(error)) return { value: null };
  if (!data) return { value: null, error: "Category not found" };
  return { value: categoryId };
}

/**
 * Phase 3 virtual-route collision guard: an uncategorized service's slug
 * (category_id null) is reachable at /services/<slug>, the same path shape
 * as a category page, so the two must never share a slug for one organizer.
 */
async function findCategoryWithSlug(
  admin: ReturnType<typeof createSupabaseAdmin>,
  organizerId: string,
  slug: string
): Promise<boolean> {
  const { data, error } = await admin
    .from("service_categories")
    .select("id")
    .eq("organizer_id", organizerId)
    .eq("slug", slug)
    .maybeSingle();
  if (error) return false; // migration 220 not applied, or other error: no collision possible
  return Boolean(data);
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

export async function createService(organizerId: string, input: { title: string; slug?: string; description?: string; duration_minutes?: number | null; price?: number | null; image_url?: string | null; position?: number; is_active?: boolean; category_id?: string | null; summary?: string | null; includes?: unknown; hero_image_url?: string | null; booking_mode?: "timed" | "date_only" | null }) {
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
  const heroErr = validateImageUrl(input.hero_image_url);
  if (heroErr) return { success: false, error: heroErr };
  const modeErr = validateBookingMode(input.booking_mode);
  if (modeErr) return { success: false, error: modeErr };

  const admin = createSupabaseAdmin();

  let categoryId: string | null = null;
  if (input.category_id !== undefined) {
    const resolved = await resolveCategoryId(admin, organizerId, input.category_id);
    if (resolved.error) return { success: false, error: resolved.error };
    categoryId = resolved.value;
  }
  const summary = clampSummary(input.summary);
  const includes = sanitizeIncludes(input.includes);
  const sanitizedHeroImage = input.hero_image_url ? safeImageSrc(input.hero_image_url) || null : null;

  let base = createSlug((input.slug && input.slug.trim()) || input.title);
  if (!SLUG_REGEX.test(base)) base = "service";
  base = base.slice(0, SLUG_MAX - 6).replace(/-+$/, "");
  if (!base) base = "service";

  if (categoryId === null && (await findCategoryWithSlug(admin, organizerId, base))) {
    return { success: false, error: "Slug is already used by a service category. Choose a different slug." };
  }

  const sanitizedImage = input.image_url ? safeImageSrc(input.image_url) || null : null;

  // default position: max+1 within organizer scope, capped at POSITION_MAX
  let position = input.position;
  if (position === undefined || position === null) {
    const { data: maxRow } = await admin.from("services").select("position").eq("organizer_id", organizerId).order("position", { ascending: false }).limit(1).maybeSingle();
    const maxPos = maxRow?.position ?? -1;
    position = Math.min(maxPos + 1, POSITION_MAX);
  }
  // booking_mode belongs to migration 222; it is spread into the primary
  // insert only so the fallback retry below (pre-222 columns) never crashes
  // when the column is absent.
  const modePayload = { booking_mode: input.booking_mode ?? "timed" };

  let data: any = null;
  let lastError: any = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    let candidate: string;
    if (attempt === 0) candidate = base;
    else if (attempt < 9) candidate = `${base}-${attempt + 1}`;
    else {
      const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 4);
      candidate = `${base}-${suffix}`;
    }
    // candidate already <= SLUG_MAX and matches SLUG_REGEX by construction
    const basePayload = {
      organizer_id: organizerId,
      title: input.title.trim(),
      slug: candidate,
      description: input.description?.trim() || null,
      duration_minutes: input.duration_minutes ?? null,
      price: input.price === null || input.price === undefined ? null : Number(input.price),
      image_url: sanitizedImage,
      position: Number(position),
      is_active: input.is_active ?? true,
    };
    let { data: inserted, error } = await admin.from("services").insert({
      ...basePayload,
      ...modePayload,
      category_id: categoryId,
      summary,
      includes,
      hero_image_url: sanitizedHeroImage,
    }).select("*").single();

    if (error && isMissingTableError(error)) {
      // migration 222 not applied yet: booking_mode column absent; fall back to
      // the pre-222 column set so core service CRUD keeps working unchanged.
      ({ data: inserted, error } = await admin.from("services").insert(basePayload).select("*").single());
    }

    if (!error && inserted) {
      data = inserted;
      lastError = null;
      break;
    }
    if (error && (error as any).code === "23505") {
      lastError = error;
      continue;
    }
    return { success: false, error: "Failed to create service" };
  }
  if (!data) {
    if (lastError && (lastError as any).code === "23505") {
      return { success: false, error: "Slug collision: please try a different title" };
    }
    return { success: false, error: "Slug collision: please try a different title" };
  }
  revalidatePath(`/dashboard/org/${organizerId}/services`);
  return { success: true, data };
}

export async function updateService(serviceId: string, organizerId: string, input: { title?: string; slug?: string; description?: string | null; duration_minutes?: number | null; price?: number | null; image_url?: string | null; position?: number; is_active?: boolean; category_id?: string | null; summary?: string | null; includes?: unknown; hero_image_url?: string | null; booking_mode?: "timed" | "date_only" | null }) {
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
  if (input.slug !== undefined && input.slug.trim()) {
    let candidate = createSlug(input.slug);
    if (!SLUG_REGEX.test(candidate)) candidate = existing.slug;
    candidate = candidate.slice(0, SLUG_MAX).replace(/-+$/, "") || existing.slug;
    updates.slug = candidate;
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
    updates.price = input.price === null || input.price === undefined ? null : Number(input.price);
  }
  if (input.image_url !== undefined) {
    const e = validateImageUrl(input.image_url);
    if (e) return { success: false, error: e };
    updates.image_url = input.image_url ? safeImageSrc(input.image_url) || null : null;
  }
  if (input.position !== undefined) {
    const e = validatePosition(input.position);
    if (e) return { success: false, error: e };
    updates.position = Number(input.position);
  }
  if (input.is_active !== undefined) updates.is_active = Boolean(input.is_active);

  const newFieldUpdates: Record<string, unknown> = {};
  if (input.category_id !== undefined) {
    const resolved = await resolveCategoryId(admin, organizerId, input.category_id);
    if (resolved.error) return { success: false, error: resolved.error };
    newFieldUpdates.category_id = resolved.value;
  }
  if (input.summary !== undefined) newFieldUpdates.summary = clampSummary(input.summary);
  if (input.includes !== undefined) newFieldUpdates.includes = sanitizeIncludes(input.includes);
  if (input.hero_image_url !== undefined) {
    const e = validateImageUrl(input.hero_image_url);
    if (e) return { success: false, error: e };
    newFieldUpdates.hero_image_url = input.hero_image_url ? safeImageSrc(input.hero_image_url) || null : null;
  }
  if (input.booking_mode !== undefined) {
    const e = validateBookingMode(input.booking_mode);
    if (e) return { success: false, error: e };
    newFieldUpdates.booking_mode = input.booking_mode ?? "timed";
  }

  const effectiveCategoryId = "category_id" in newFieldUpdates ? (newFieldUpdates.category_id as string | null) : (existing.category_id ?? null);
  const effectiveSlug = (updates.slug as string | undefined) ?? existing.slug;
  if (effectiveCategoryId === null && (await findCategoryWithSlug(admin, organizerId, effectiveSlug))) {
    return { success: false, error: "Slug is already used by a service category. Choose a different slug." };
  }

  let { data, error } = await admin.from("services").update({ ...updates, ...newFieldUpdates }).eq("id", serviceId).eq("organizer_id", organizerId).select("*").single();
  if (error && isMissingTableError(error) && Object.keys(newFieldUpdates).length > 0) {
    // migration 220 not applied yet: retry without the new optional columns
    // so core service CRUD keeps working unchanged.
    ({ data, error } = await admin.from("services").update(updates).eq("id", serviceId).eq("organizer_id", organizerId).select("*").single());
  }
  if (error) {
    if ((error as any).code === "23505") return { success: false, error: "Slug already in use" };
    return { success: false, error: "Failed to update service" };
  }
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
    const { error } = await admin.from("services").update({ position: i, updated_at: new Date().toISOString() }).eq("id", orderedIds[i]).eq("organizer_id", organizerId);
    if (error) return { success: false, error: "Failed to reorder services" };
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

  let position = input.position;
  if (position === undefined || position === null) {
    const { data: maxRow } = await admin.from("service_tiers").select("position").eq("service_id", serviceId).order("position", { ascending: false }).limit(1).maybeSingle();
    const maxPos = maxRow?.position ?? -1;
    position = Math.min(maxPos + 1, POSITION_MAX);
  }

  const { data, error } = await admin.from("service_tiers").insert({
    service_id: serviceId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    duration_minutes: input.duration_minutes ?? null,
    price: Number(input.price),
    position: Number(position),
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
  const { data: service } = await admin.from("services").select("id").eq("id", serviceId).eq("organizer_id", organizerId).maybeSingle();
  if (!service) return { success: false, error: "Service not found or not owned by tenant" };
  const { data: tier } = await admin.from("service_tiers").select("id, service_id").eq("id", tierId).eq("service_id", serviceId).maybeSingle();
  if (!tier) return { success: false, error: "Tier not found" };

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
    updates.price = input.price === null || input.price === undefined ? null : Number(input.price);
  }
  if (input.position !== undefined) {
    const e = validatePosition(input.position);
    if (e) return { success: false, error: e };
    updates.position = Number(input.position);
  }
  if (input.is_active !== undefined) updates.is_active = Boolean(input.is_active);

  const { data, error } = await admin.from("service_tiers").update(updates).eq("id", tierId).eq("service_id", serviceId).select("*").single();
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
  // Verify ownership BEFORE delete (service-role bypasses RLS, so check must precede write)
  const { data: service } = await admin.from("services").select("id").eq("id", serviceId).eq("organizer_id", organizerId).maybeSingle();
  if (!service) return { success: false, error: "Service not found or not owned by tenant" };
  const { data: tier } = await admin.from("service_tiers").select("id").eq("id", tierId).eq("service_id", serviceId).maybeSingle();
  if (!tier) return { success: false, error: "Tier not found" };
  const { error } = await admin.from("service_tiers").delete().eq("id", tierId).eq("service_id", serviceId);
  if (error) return { success: false, error: "Failed to delete tier" };
  revalidatePath(`/dashboard/org/${organizerId}/services`);
  return { success: true };
}

export async function reorderServiceTiers(serviceId: string, organizerId: string, orderedIds: string[]) {
  try {
    await assertTenant(organizerId, ["owner", "admin", "manager", "editor"]);
  } catch {
    return { success: false, error: "Forbidden: insufficient entity permissions" };
  }
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return { success: false, error: "Invalid order" };
  if (orderedIds.length > 100) return { success: false, error: "Too many items" };
  if (new Set(orderedIds).size !== orderedIds.length) return { success: false, error: "Duplicate ids" };
  const admin = createSupabaseAdmin();
  const { data: service } = await admin.from("services").select("id").eq("id", serviceId).eq("organizer_id", organizerId).maybeSingle();
  if (!service) return { success: false, error: "Service not found or not owned by tenant" };
  const { data: existing } = await admin.from("service_tiers").select("id").eq("service_id", serviceId).in("id", orderedIds);
  if (!existing || existing.length !== orderedIds.length) return { success: false, error: "Invalid tier IDs" };
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin.from("service_tiers").update({ position: i, updated_at: new Date().toISOString() }).eq("id", orderedIds[i]).eq("service_id", serviceId);
    if (error) return { success: false, error: "Failed to reorder tiers" };
  }
  revalidatePath(`/dashboard/org/${organizerId}/services`);
  return { success: true };
}
