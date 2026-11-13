"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { requireTenantContext } from "@/lib/tenant-context";
import { safeImageSrc } from "@/lib/image-url";
import { revalidatePath } from "next/cache";
import {
  CATEGORY_SLUG_MAX,
  clampCategoryDescription,
  clampCategoryTagline,
  clampCategoryTitle,
  normalizeSlugCandidate,
  slugCandidateForAttempt,
} from "@/lib/validation/service-catalog";

const POSITION_MIN = 0;
const POSITION_MAX = 999;

/** Mirrors the pattern in lib/actions/general-booking.ts / reservations.ts: treat a missing table or column as "feature not migrated yet", never a crash. */
function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "42P01" || code === "42703") return true;
  const message = (err as { message?: unknown }).message;
  return typeof message === "string" && (message.includes("does not exist") || message.includes("schema cache"));
}

/**
 * Phase 3 virtual-route collision guard: a category page is reachable at
 * /services/<slug>, the same path shape as an uncategorized service, so the
 * two must never share a slug for one organizer.
 */
async function findUncategorizedServiceWithSlug(
  admin: ReturnType<typeof createSupabaseAdmin>,
  organizerId: string,
  slug: string
): Promise<boolean> {
  const { data, error } = await admin
    .from("services")
    .select("id")
    .eq("organizer_id", organizerId)
    .eq("slug", slug)
    .is("category_id", null)
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
  if (!Number.isInteger(n) || n < POSITION_MIN || n > POSITION_MAX) return `Position must be ${POSITION_MIN}-${POSITION_MAX}`;
  return null;
}

export type ServiceCategoryWithCount = {
  id: string;
  organizer_id: string;
  slug: string;
  title: string;
  tagline: string | null;
  description: string | null;
  image_url: string | null;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  service_count: number;
};

/** Graceful degrade: if migration 220 hasn't run yet, categories are simply empty — no crash, no error surfaced to the owner. */
export async function listServiceCategories(organizerId: string): Promise<{ success: boolean; data: ServiceCategoryWithCount[]; migrated: boolean; error?: string }> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, data: [], migrated: false, error: "Unauthorized" };
  try {
    await requireTenantContext(user.id, organizerId, ["owner", "admin", "manager", "editor", "finance", "viewer"]);
  } catch {
    return { success: false, data: [], migrated: false, error: "Forbidden" };
  }
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("service_categories")
    .select("*")
    .eq("organizer_id", organizerId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingTableError(error)) return { success: true, data: [], migrated: false };
    return { success: false, data: [], migrated: true, error: "Failed to load categories" };
  }

  const categories = data || [];
  const { data: svcRows } = await admin.from("services").select("category_id").eq("organizer_id", organizerId);
  const counts = new Map<string, number>();
  for (const row of svcRows || []) {
    const key = (row as { category_id?: string | null }).category_id;
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return {
    success: true,
    migrated: true,
    data: categories.map((c: any) => ({ ...c, service_count: counts.get(c.id) || 0 })),
  };
}

export async function createServiceCategory(
  organizerId: string,
  input: { title: string; slug?: string; tagline?: string | null; description?: string | null; image_url?: string | null; position?: number; is_active?: boolean }
) {
  try {
    await assertTenant(organizerId, ["owner", "admin", "manager", "editor"]);
  } catch {
    return { success: false, error: "Forbidden: insufficient entity permissions" };
  }
  const title = clampCategoryTitle(input.title);
  if (!title) return { success: false, error: "Title is required" };
  const imgErr = validateImageUrl(input.image_url);
  if (imgErr) return { success: false, error: imgErr };
  const posErr = validatePosition(input.position);
  if (posErr) return { success: false, error: posErr };

  const admin = createSupabaseAdmin();
  const base = normalizeSlugCandidate(input.slug || title, "category", CATEGORY_SLUG_MAX);
  const sanitizedImage = input.image_url ? safeImageSrc(input.image_url) || null : null;

  if (await findUncategorizedServiceWithSlug(admin, organizerId, base)) {
    return { success: false, error: "Slug is already used by a service. Choose a different slug." };
  }

  let position = input.position;
  if (position === undefined || position === null) {
    const { data: maxRow, error: maxErr } = await admin
      .from("service_categories")
      .select("position")
      .eq("organizer_id", organizerId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxErr && isMissingTableError(maxErr)) return { success: false, error: "CATEGORIES_NOT_MIGRATED" };
    const maxPos = maxRow?.position ?? -1;
    position = Math.min(maxPos + 1, POSITION_MAX);
  }

  let data: any = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = attempt < 9
      ? slugCandidateForAttempt(base, attempt, CATEGORY_SLUG_MAX)
      : `${slugCandidateForAttempt(base, 0, CATEGORY_SLUG_MAX)}-${crypto.randomUUID().replace(/-/g, "").slice(0, 4)}`;
    const { data: inserted, error } = await admin
      .from("service_categories")
      .insert({
        organizer_id: organizerId,
        title,
        slug: candidate,
        tagline: clampCategoryTagline(input.tagline),
        description: clampCategoryDescription(input.description),
        image_url: sanitizedImage,
        position: Number(position),
        is_active: input.is_active ?? true,
      })
      .select("*")
      .single();

    if (!error && inserted) {
      data = inserted;
      break;
    }
    if (error && isMissingTableError(error)) return { success: false, error: "CATEGORIES_NOT_MIGRATED" };
    if (error && (error as any).code === "23505") continue;
    return { success: false, error: "Failed to create category" };
  }
  if (!data) return { success: false, error: "Slug collision: please try a different title" };
  revalidatePath(`/dashboard/org/${organizerId}/services`);
  return { success: true, data: { ...data, service_count: 0 } };
}

export async function updateServiceCategory(
  categoryId: string,
  organizerId: string,
  input: { title?: string; slug?: string; tagline?: string | null; description?: string | null; image_url?: string | null; position?: number; is_active?: boolean }
) {
  try {
    await assertTenant(organizerId, ["owner", "admin", "manager", "editor"]);
  } catch {
    return { success: false, error: "Forbidden: insufficient entity permissions" };
  }
  const admin = createSupabaseAdmin();
  const { data: existing, error: existingErr } = await admin
    .from("service_categories")
    .select("*")
    .eq("id", categoryId)
    .eq("organizer_id", organizerId)
    .maybeSingle();
  if (existingErr && isMissingTableError(existingErr)) return { success: false, error: "CATEGORIES_NOT_MIGRATED" };
  if (!existing) return { success: false, error: "Category not found" };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) {
    const title = clampCategoryTitle(input.title);
    if (!title) return { success: false, error: "Title is required" };
    updates.title = title;
  }
  if (input.slug !== undefined && input.slug) {
    updates.slug = normalizeSlugCandidate(input.slug, existing.slug, CATEGORY_SLUG_MAX);
  }
  if (input.tagline !== undefined) updates.tagline = clampCategoryTagline(input.tagline);
  if (input.description !== undefined) updates.description = clampCategoryDescription(input.description);
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

  const effectiveSlug = (updates.slug as string | undefined) ?? existing.slug;
  if (
    effectiveSlug !== existing.slug &&
    (await findUncategorizedServiceWithSlug(admin, organizerId, effectiveSlug))
  ) {
    return { success: false, error: "Slug is already used by a service. Choose a different slug." };
  }

  const { data, error } = await admin
    .from("service_categories")
    .update(updates)
    .eq("id", categoryId)
    .eq("organizer_id", organizerId)
    .select("*")
    .single();
  if (error) {
    if ((error as any).code === "23505") return { success: false, error: "Slug already in use" };
    return { success: false, error: "Failed to update category" };
  }
  revalidatePath(`/dashboard/org/${organizerId}/services`);
  return { success: true, data };
}

/**
 * Deleting a category that still has services attached is blocked unless the
 * caller supplies moveServicesTo (a category id, or null for "Uncategorized")
 * — matching the owner's "move services to another category" UX.
 */
export async function deleteServiceCategory(
  categoryId: string,
  organizerId: string,
  moveServicesTo?: string | null
) {
  try {
    await assertTenant(organizerId, ["owner", "admin", "manager"]);
  } catch {
    return { success: false, error: "Forbidden: insufficient entity permissions" };
  }
  const admin = createSupabaseAdmin();
  const { data: category, error: catErr } = await admin
    .from("service_categories")
    .select("id")
    .eq("id", categoryId)
    .eq("organizer_id", organizerId)
    .maybeSingle();
  if (catErr && isMissingTableError(catErr)) return { success: false, error: "CATEGORIES_NOT_MIGRATED" };
  if (!category) return { success: false, error: "Category not found" };

  const { data: attached, error: countErr } = await admin
    .from("services")
    .select("id")
    .eq("organizer_id", organizerId)
    .eq("category_id", categoryId);
  if (countErr) return { success: false, error: "Failed to check attached services" };
  const count = attached?.length || 0;

  if (count > 0) {
    if (moveServicesTo === undefined) {
      return { success: false, error: "CATEGORY_HAS_SERVICES", count };
    }
    if (moveServicesTo) {
      const { data: target, error: targetErr } = await admin
        .from("service_categories")
        .select("id")
        .eq("id", moveServicesTo)
        .eq("organizer_id", organizerId)
        .maybeSingle();
      if (targetErr || !target) return { success: false, error: "Target category not found" };
    }
    const { error: moveErr } = await admin
      .from("services")
      .update({ category_id: moveServicesTo, updated_at: new Date().toISOString() })
      .eq("organizer_id", organizerId)
      .eq("category_id", categoryId);
    if (moveErr) return { success: false, error: "Failed to move services" };
  }

  const { error } = await admin.from("service_categories").delete().eq("id", categoryId).eq("organizer_id", organizerId);
  if (error) return { success: false, error: "Failed to delete category" };
  revalidatePath(`/dashboard/org/${organizerId}/services`);
  return { success: true };
}

export async function reorderServiceCategories(organizerId: string, orderedIds: string[]) {
  try {
    await assertTenant(organizerId, ["owner", "admin", "manager", "editor"]);
  } catch {
    return { success: false, error: "Forbidden: insufficient entity permissions" };
  }
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return { success: false, error: "Invalid order" };
  if (orderedIds.length > 100) return { success: false, error: "Too many items" };
  if (new Set(orderedIds).size !== orderedIds.length) return { success: false, error: "Duplicate ids" };
  const admin = createSupabaseAdmin();
  const { data: existing, error: existingErr } = await admin.from("service_categories").select("id").eq("organizer_id", organizerId).in("id", orderedIds);
  if (existingErr && isMissingTableError(existingErr)) return { success: false, error: "CATEGORIES_NOT_MIGRATED" };
  if (!existing || existing.length !== orderedIds.length) return { success: false, error: "Invalid category IDs" };
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin.from("service_categories").update({ position: i, updated_at: new Date().toISOString() }).eq("id", orderedIds[i]).eq("organizer_id", organizerId);
    if (error) return { success: false, error: "Failed to reorder categories" };
  }
  revalidatePath(`/dashboard/org/${organizerId}/services`);
  return { success: true };
}
