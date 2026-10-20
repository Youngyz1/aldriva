"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/auth";
import { requireTenantContext } from "@/lib/tenant-context";
import { safeImageSrc } from "@/lib/image-url";
import { isMissingMenuOptionSchema, warnMissingMenuOptionSchemaOnce } from "@/lib/menu-option-schema";
import {
  PROMOTION_DELETE_ROLES,
  PROMOTION_READ_ROLES,
  PROMOTION_WRITE_ROLES,
  type PromotionPermission,
} from "@/lib/menu-promotion-authorization";

const MAX_NAME = 80;
const MAX_PRICE = 999999.99;
const MAX_TARGETS = 50;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONFLICT = "This promotion changed by someone else. Reload and try again.";

export interface PromotionTargetInput {
  item_id?: unknown;
  section_id?: unknown;
}

export interface PromotionInput {
  name?: unknown;
  headline?: unknown;
  description?: unknown;
  image_url?: unknown;
  offer_type?: unknown;
  percent_off?: unknown;
  special_price?: unknown;
  apply_to_variants?: unknown;
  code?: unknown;
  min_order_amount?: unknown;
  status?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  priority?: unknown;
  layout?: unknown;
  cta_label?: unknown;
  destination_type?: unknown;
  destination_item_id?: unknown;
  destination_section_id?: unknown;
  destination_url?: unknown;
  targets?: unknown;
  updated_at?: unknown;
}

type PromotionActionResult<T = unknown> = { success: true; data?: T } | { success: false; error: string };
type AuthorizationResult = { ok: true; admin: ReturnType<typeof createSupabaseAdmin> } | { ok: false; error: string };
type PromotionRecordResult =
  | { ok: true; admin: ReturnType<typeof createSupabaseAdmin>; record: any }
  | { ok: false; error: string };

function fail(error: string): PromotionActionResult<never> {
  return { success: false, error };
}

async function authorize(organizerId: string, permission: PromotionPermission): Promise<AuthorizationResult> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };
  const roles = permission === "read" ? PROMOTION_READ_ROLES : permission === "write" ? PROMOTION_WRITE_ROLES : PROMOTION_DELETE_ROLES;
  try {
    await requireTenantContext(user.id, organizerId, [...roles] as any);
  } catch {
    try {
      if (!(await isAdmin())) return { ok: false, error: "Forbidden" };
    } catch {
      return { ok: false, error: "Forbidden" };
    }
  }
  return { ok: true, admin: createSupabaseAdmin() };
}

function normalizeText(value: unknown, max: number, field: string, required = false): { value: string | null; error: string | null } {
  if (value === undefined) return { value: null, error: required ? `${field} is required.` : null };
  if (value === null || value === "") return { value: null, error: required ? `${field} is required.` : null };
  if (typeof value !== "string") return { value: null, error: `${field} must be text.` };
  const clean = value.trim();
  if (required && clean.length < 1) return { value: null, error: `${field} is required.` };
  if (clean.length > max) return { value: null, error: `${field} must be ${max} characters or fewer.` };
  return { value: clean || null, error: null };
}

function optionalAmount(value: unknown, field: string, max = 9999999999.99): { value: number | null; error: string | null } {
  if (value === undefined || value === null || value === "") return { value: null, error: null };
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > max) return { value: null, error: `${field} must be between 0 and ${max}.` };
  return { value: Math.round(amount * 100) / 100, error: null };
}

function optionalDate(value: unknown, field: string): { value: string | null; error: string | null } {
  if (value === undefined || value === null || value === "") return { value: null, error: null };
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return { value: null, error: `${field} must be a valid date.` };
  return { value: new Date(value).toISOString(), error: null };
}

function parsePromotionInput(input: PromotionInput): { payload?: Record<string, unknown>; error?: string } {
  const name = normalizeText(input.name, MAX_NAME, "Name", true);
  if (name.error) return { error: name.error };
  const headline = normalizeText(input.headline, 120, "Headline");
  if (headline.error) return { error: headline.error };
  const description = normalizeText(input.description, 300, "Description");
  if (description.error) return { error: description.error };
  const ctaLabel = normalizeText(input.cta_label, 40, "CTA label");
  if (ctaLabel.error) return { error: ctaLabel.error };
  const imageUrl = normalizeText(input.image_url, 2048, "Image URL");
  if (imageUrl.error) return { error: imageUrl.error };
  if (imageUrl.value && !safeImageSrc(imageUrl.value)) return { error: "Image URL is not supported." };

  const offerType = input.offer_type;
  if (!["percent_off", "special_price", "free_delivery"].includes(String(offerType))) return { error: "Choose a supported offer type." };
  const percent = input.percent_off === undefined || input.percent_off === null || input.percent_off === "" ? null : Number(input.percent_off);
  const special = input.special_price === undefined || input.special_price === null || input.special_price === "" ? null : Number(input.special_price);
  if (offerType === "percent_off" && (!Number.isInteger(percent) || Number(percent) < 1 || Number(percent) > 90 || special !== null)) return { error: "Percent off must be 1–90, with no special price." };
  if (offerType === "special_price" && (!Number.isFinite(special) || Number(special) < 0 || Number(special) > MAX_PRICE || percent !== null)) return { error: `Special price must be 0–${MAX_PRICE}, with no percent value.` };
  if (offerType === "free_delivery" && (percent !== null || special !== null)) return { error: "Free delivery cannot include a percent or special price." };
  if (input.apply_to_variants !== undefined && typeof input.apply_to_variants !== "boolean") return { error: "Apply to variants must be true or false." };

  const codeText = normalizeText(input.code, 40, "Code");
  if (codeText.error) return { error: codeText.error };
  const code = codeText.value?.toUpperCase() ?? null;
  if (code && (code.length < 3 || !/^[A-Z0-9_-]+$/.test(code))) return { error: "Code must be 3–40 letters, numbers, underscores, or hyphens." };
  const minOrder = optionalAmount(input.min_order_amount, "Minimum order amount");
  if (minOrder.error) return { error: minOrder.error };
  const starts = optionalDate(input.starts_at, "Start date");
  if (starts.error) return { error: starts.error };
  const ends = optionalDate(input.ends_at, "End date");
  if (ends.error) return { error: ends.error };
  if (starts.value && ends.value && Date.parse(starts.value) > Date.parse(ends.value)) return { error: "Start date must be before the end date." };

  const status = input.status ?? "draft";
  if (!["draft", "active", "paused"].includes(String(status))) return { error: "Choose draft, active, or paused status." };
  const priority = input.priority ?? 0;
  if (!Number.isInteger(Number(priority)) || Number(priority) < -2147483648 || Number(priority) > 2147483647) return { error: "Priority must be a whole number." };
  const layout = input.layout ?? "banner";
  if (!["banner", "dish_card", "announcement_bar"].includes(String(layout))) return { error: "Choose a supported promotion layout." };

  const destinationType = input.destination_type ?? "none";
  if (!["item", "section", "menu", "external", "none"].includes(String(destinationType))) return { error: "Choose a supported destination type." };
  const destinationItemId = destinationType === "item" ? input.destination_item_id : null;
  const destinationSectionId = destinationType === "section" ? input.destination_section_id : null;
  if (destinationType === "item" && (typeof destinationItemId !== "string" || !UUID_SHAPE.test(destinationItemId))) return { error: "Choose a valid menu item destination." };
  if (destinationType === "section" && (typeof destinationSectionId !== "string" || !UUID_SHAPE.test(destinationSectionId))) return { error: "Choose a valid menu section destination." };
  let destinationUrl: string | null = null;
  if (destinationType === "external") {
    if (typeof input.destination_url !== "string") return { error: "Enter an HTTPS destination URL." };
    try {
      const parsed = new URL(input.destination_url.trim());
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) return { error: "External destinations must use HTTPS." };
      destinationUrl = parsed.toString();
    } catch {
      return { error: "Enter a valid HTTPS destination URL." };
    }
  }
  const payload = {
    name: name.value,
    headline: headline.value,
    description: description.value,
    image_url: imageUrl.value,
    offer_type: offerType,
    percent_off: offerType === "percent_off" ? percent : null,
    special_price: offerType === "special_price" ? special : null,
    apply_to_variants: input.apply_to_variants === true,
    code,
    min_order_amount: minOrder.value,
    status,
    starts_at: starts.value,
    ends_at: ends.value,
    priority: Number(priority),
    layout,
    cta_label: ctaLabel.value,
    destination_type: destinationType,
    destination_item_id: destinationItemId,
    destination_section_id: destinationSectionId,
    destination_url: destinationUrl,
  };
  return { payload };
}

function normalizeTargets(value: unknown): { targets?: Array<{ item_id: string | null; section_id: string | null }>; error?: string } {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_TARGETS) return { error: `Select between 1 and ${MAX_TARGETS} promotion targets.` };
  const targets: Array<{ item_id: string | null; section_id: string | null }> = [];
  const seen = new Set<string>();
  for (const row of value as PromotionTargetInput[]) {
    const itemId = typeof row?.item_id === "string" ? row.item_id : null;
    const sectionId = typeof row?.section_id === "string" ? row.section_id : null;
    if (Boolean(itemId) === Boolean(sectionId)) return { error: "Each target must be one menu item or one menu section." };
    const id = itemId || sectionId!;
    if (!UUID_SHAPE.test(id)) return { error: "A promotion target is invalid." };
    const key = itemId ? `item:${itemId}` : `section:${sectionId}`;
    if (seen.has(key)) return { error: "Remove duplicate promotion targets." };
    seen.add(key);
    targets.push({ item_id: itemId, section_id: sectionId });
  }
  return { targets };
}

async function validateTenantReferences(admin: ReturnType<typeof createSupabaseAdmin>, organizerId: string, targets: Array<{ item_id: string | null; section_id: string | null }>, payload: Record<string, unknown>): Promise<string | null> {
  const itemIds = [...new Set([...targets.map((row) => row.item_id), payload.destination_item_id as string | null].filter((id): id is string => Boolean(id)))];
  const sectionIds = [...new Set([...targets.map((row) => row.section_id), payload.destination_section_id as string | null].filter((id): id is string => Boolean(id)))];
  if (itemIds.length) {
    const { data, error } = await admin.from("menu_items").select("id").eq("organizer_id", organizerId).in("id", itemIds);
    if (error || (data || []).length !== itemIds.length) return "One or more selected items do not belong to this restaurant.";
  }
  if (sectionIds.length) {
    const { data, error } = await admin.from("menu_sections").select("id").eq("organizer_id", organizerId).in("id", sectionIds);
    if (error || (data || []).length !== sectionIds.length) return "One or more selected sections do not belong to this restaurant.";
  }
  return null;
}

async function loadVariantItemIds(admin: ReturnType<typeof createSupabaseAdmin>, organizerId: string, targets: Array<{ item_id: string | null; section_id: string | null }>): Promise<{ ids?: Set<string>; error?: string }> {
  const directIds = targets.map((row) => row.item_id).filter((id): id is string => Boolean(id));
  const sectionIds = [...new Set(targets.map((row) => row.section_id).filter((id): id is string => Boolean(id)))];
  const rows = new Map<string, any>();
  if (directIds.length) {
    const { data, error } = await admin.from("menu_items").select("id, section_id, option_groups, options_source").eq("organizer_id", organizerId).in("id", directIds);
    if (error && isMissingMenuOptionSchema(error)) {
      warnMissingMenuOptionSchemaOnce("promotions-actions", error);
      const fallback = await admin.from("menu_items").select("id, section_id, option_groups").eq("organizer_id", organizerId).in("id", directIds);
      if (fallback.error) return { error: "Failed to inspect selected item options." };
      for (const row of fallback.data || []) rows.set(row.id, row);
    } else if (error) return { error: "Failed to inspect selected item options." };
    else for (const row of data || []) rows.set(row.id, row);
  }
  if (sectionIds.length) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.from("menu_items").select("id, section_id, option_groups, options_source")
        .eq("organizer_id", organizerId).in("section_id", sectionIds).range(offset, offset + 999);
      if (error && isMissingMenuOptionSchema(error)) {
        warnMissingMenuOptionSchemaOnce("promotions-actions", error);
        const fallback = await admin.from("menu_items").select("id, section_id, option_groups").eq("organizer_id", organizerId).in("section_id", sectionIds).range(offset, offset + 999);
        if (fallback.error) return { error: "Failed to inspect selected section options." };
        for (const row of fallback.data || []) rows.set(row.id, row);
        if ((fallback.data || []).length < 1000) break;
        continue;
      }
      if (error) return { error: "Failed to inspect selected section options." };
      for (const row of data || []) rows.set(row.id, row);
      if ((data || []).length < 1000) break;
    }
  }
  const items = [...rows.values()];
  const normalizedIds = items.filter((item) => item.options_source === "normalized").map((item) => item.id);
  const variants = new Set<string>();
  for (const item of items) {
    if (item.options_source !== "normalized" && Array.isArray(item.option_groups) && item.option_groups.some((group: any) => group?.kind === "variant")) variants.add(item.id);
  }
  if (normalizedIds.length) {
    const { data: assignments, error: assignmentError } = await admin.from("menu_item_option_groups").select("item_id, group_id").in("item_id", normalizedIds);
    if (assignmentError && isMissingMenuOptionSchema(assignmentError)) {
      warnMissingMenuOptionSchemaOnce("promotions-actions", assignmentError);
      for (const item of items.filter((candidate) => normalizedIds.includes(candidate.id))) {
        if (Array.isArray(item.option_groups) && item.option_groups.some((group: any) => group?.kind === "variant")) variants.add(item.id);
      }
    } else if (assignmentError) return { error: "Failed to inspect selected item options." };
    else {
      const groupIds = [...new Set((assignments || []).map((row: any) => row.group_id))];
      if (groupIds.length) {
        const { data: groups, error: groupsError } = await admin.from("menu_option_groups").select("id, kind").in("id", groupIds);
        if (groupsError && isMissingMenuOptionSchema(groupsError)) warnMissingMenuOptionSchemaOnce("promotions-actions", groupsError);
        else if (groupsError) return { error: "Failed to inspect selected item options." };
        else {
          const variantGroupIds = new Set((groups || []).filter((group: any) => group.kind === "variant").map((group: any) => group.id));
          for (const assignment of assignments || []) if (variantGroupIds.has((assignment as any).group_id)) variants.add((assignment as any).item_id);
        }
      }
    }
  }
  return { ids: variants };
}

async function validateSpecialPriceTargets(admin: ReturnType<typeof createSupabaseAdmin>, organizerId: string, payload: Record<string, unknown>, targets: Array<{ item_id: string | null; section_id: string | null }>): Promise<string | null> {
  if (payload.offer_type !== "special_price") return null;
  const result = await loadVariantItemIds(admin, organizerId, targets);
  if (result.error) return result.error;
  if (result.ids?.size) return "Special-price promotions cannot target variant items. Use percent off and enable ‘Apply to variants’ instead.";
  return null;
}

async function getTargets(admin: ReturnType<typeof createSupabaseAdmin>, organizerId: string, promotionId: string) {
  const { data, error } = await admin.from("promotion_targets").select("item_id, section_id")
    .eq("organizer_id", organizerId).eq("promotion_id", promotionId);
  return { data: data || [], error };
}

async function replaceTargetRows(admin: ReturnType<typeof createSupabaseAdmin>, organizerId: string, promotionId: string, targets: Array<{ item_id: string | null; section_id: string | null }>, restore?: Array<{ item_id: string | null; section_id: string | null }>): Promise<string | null> {
  const { error: deleteError } = await admin.from("promotion_targets").delete().eq("organizer_id", organizerId).eq("promotion_id", promotionId);
  if (deleteError) return "Failed to update promotion targets.";
  const { error: insertError } = await admin.from("promotion_targets").insert(targets.map((target) => ({ ...target, organizer_id: organizerId, promotion_id: promotionId })));
  if (insertError) {
    if (restore?.length) await admin.from("promotion_targets").insert(restore.map((target) => ({ ...target, organizer_id: organizerId, promotion_id: promotionId })));
    return "Failed to update promotion targets.";
  }
  return null;
}

function revalidatePromotions(organizerId: string) {
  revalidatePath(`/dashboard/org/${organizerId}/promotions`);
  revalidatePath(`/dashboard/org/${organizerId}/menu`);
}

export async function listPromotions(organizerId: string): Promise<PromotionActionResult<{ promotions: any[] }>> {
  const auth = await authorize(organizerId, "read");
  if (!auth.ok) return fail(auth.error);
  const { data, error } = await auth.admin.from("promotions").select("*").eq("organizer_id", organizerId)
    .order("priority", { ascending: false }).order("created_at", { ascending: false });
  if (error) return fail("Failed to load promotions.");
  const rows = data || [];
  if (!rows.length) return { success: true, data: { promotions: [] } };
  const { data: targets, error: targetError } = await auth.admin.from("promotion_targets").select("id, promotion_id, item_id, section_id")
    .eq("organizer_id", organizerId).in("promotion_id", rows.map((row: any) => row.id));
  if (targetError) return fail("Failed to load promotion targets.");
  const byPromotion = new Map<string, any[]>();
  for (const target of targets || []) {
    const list = byPromotion.get(target.promotion_id) || [];
    list.push(target);
    byPromotion.set(target.promotion_id, list);
  }
  return { success: true, data: { promotions: rows.map((row: any) => ({ ...row, targets: byPromotion.get(row.id) || [] })) } };
}

export async function createPromotion(organizerId: string, input: PromotionInput): Promise<PromotionActionResult> {
  const auth = await authorize(organizerId, "write");
  if (!auth.ok) return fail(auth.error);
  if (!input || typeof input !== "object") return fail("Promotion input is required.");
  const parsed = parsePromotionInput(input);
  if (parsed.error) return fail(parsed.error);
  if (!parsed.payload) return fail("Promotion details are incomplete.");
  const normalized = normalizeTargets(input.targets);
  if (normalized.error || !normalized.targets) return fail(normalized.error || "Select promotion targets.");
  const referencesError = await validateTenantReferences(auth.admin, organizerId, normalized.targets, parsed.payload!);
  if (referencesError) return fail(referencesError);
  const variantError = await validateSpecialPriceTargets(auth.admin, organizerId, parsed.payload!, normalized.targets);
  if (variantError) return fail(variantError);
  const { data: promotion, error } = await auth.admin.from("promotions").insert({ ...parsed.payload, organizer_id: organizerId }).select("*").single();
  if (error || !promotion) return fail(error?.code === "23505" ? "This promo code is already used by this restaurant." : "Failed to create promotion.");
  const targetError = await replaceTargetRows(auth.admin, organizerId, promotion.id, normalized.targets);
  if (targetError) {
    await auth.admin.from("promotions").delete().eq("id", promotion.id).eq("organizer_id", organizerId);
    return fail(targetError);
  }
  revalidatePromotions(organizerId);
  return { success: true, data: promotion };
}

export async function updatePromotion(promotionId: string, organizerId: string, input: PromotionInput): Promise<PromotionActionResult> {
  const auth = await authorize(organizerId, "write");
  if (!auth.ok) return fail(auth.error);
  if (!input || typeof input.updated_at !== "string") return fail("Reload this promotion before saving.");
  const { data: existing, error: fetchError } = await auth.admin.from("promotions").select("*")
    .eq("id", promotionId).eq("organizer_id", organizerId).maybeSingle();
  if (fetchError || !existing) return fail("Promotion not found.");
  if (input.updated_at !== existing.updated_at) return fail(CONFLICT);
  const parsed = parsePromotionInput({ ...existing, ...input });
  if (parsed.error) return fail(parsed.error);
  if (!parsed.payload) return fail("Promotion details are incomplete.");
  const currentTargetResult = await getTargets(auth.admin, organizerId, promotionId);
  if (currentTargetResult.error) return fail("Failed to load promotion targets.");
  const targetsChanged = input.targets !== undefined;
  const normalized: ReturnType<typeof normalizeTargets> = targetsChanged
    ? normalizeTargets(input.targets)
    : { targets: currentTargetResult.data.map((row: any) => ({ item_id: row.item_id ?? null, section_id: row.section_id ?? null })) };
  if (normalized.error || !normalized.targets) return fail(normalized.error || "Select promotion targets.");
  const referencesError = await validateTenantReferences(auth.admin, organizerId, normalized.targets, parsed.payload!);
  if (referencesError) return fail(referencesError);
  const variantError = await validateSpecialPriceTargets(auth.admin, organizerId, parsed.payload!, normalized.targets);
  if (variantError) return fail(variantError);
  const { data, error } = await auth.admin.from("promotions").update(parsed.payload)
    .eq("id", promotionId).eq("organizer_id", organizerId).eq("updated_at", input.updated_at).select("*").maybeSingle();
  if (error || !data) return fail(error?.code === "23505" ? "This promo code is already used by this restaurant." : CONFLICT);
  if (targetsChanged) {
    const targetError = await replaceTargetRows(auth.admin, organizerId, promotionId, normalized.targets, currentTargetResult.data);
    if (targetError) return fail(targetError);
  }
  revalidatePromotions(organizerId);
  return { success: true, data };
}

export async function setPromotionTargets(promotionId: string, organizerId: string, updatedAt: string, targetInput: unknown): Promise<PromotionActionResult> {
  const loaded = await listPromotionRecord(promotionId, organizerId, "write");
  if (!loaded.ok) return fail(loaded.error);
  if (updatedAt !== loaded.record.updated_at) return fail(CONFLICT);
  const normalized = normalizeTargets(targetInput);
  if (normalized.error || !normalized.targets) return fail(normalized.error || "Select promotion targets.");
  const referencesError = await validateTenantReferences(loaded.admin, organizerId, normalized.targets, loaded.record);
  if (referencesError) return fail(referencesError);
  const variantError = await validateSpecialPriceTargets(loaded.admin, organizerId, loaded.record, normalized.targets);
  if (variantError) return fail(variantError);
  const existingTargets = await getTargets(loaded.admin, organizerId, promotionId);
  if (existingTargets.error) return fail("Failed to load promotion targets.");
  const { data, error } = await loaded.admin.from("promotions").update({ updated_at: new Date().toISOString() })
    .eq("id", promotionId).eq("organizer_id", organizerId).eq("updated_at", updatedAt).select("id, updated_at").maybeSingle();
  if (error || !data) return fail(CONFLICT);
  const targetError = await replaceTargetRows(loaded.admin, organizerId, promotionId, normalized.targets, existingTargets.data);
  if (targetError) return fail(targetError);
  revalidatePromotions(organizerId);
  return { success: true, data };
}

async function listPromotionRecord(promotionId: string, organizerId: string, permission: PromotionPermission): Promise<PromotionRecordResult> {
  const auth = await authorize(organizerId, permission);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { data: record, error } = await auth.admin.from("promotions").select("*").eq("id", promotionId).eq("organizer_id", organizerId).maybeSingle();
  if (error || !record) return { ok: false, error: "Promotion not found." };
  return { ok: true, admin: auth.admin, record };
}

export async function pausePromotion(promotionId: string, organizerId: string, updatedAt: string) {
  const loaded = await listPromotionRecord(promotionId, organizerId, "write");
  if (!loaded.ok) return fail(loaded.error);
  if (updatedAt !== loaded.record.updated_at) return fail(CONFLICT);
  return updatePromotion(promotionId, organizerId, { ...loaded.record, status: "paused", updated_at: updatedAt });
}

export async function resumePromotion(promotionId: string, organizerId: string, updatedAt: string) {
  const loaded = await listPromotionRecord(promotionId, organizerId, "write");
  if (!loaded.ok) return fail(loaded.error);
  if (updatedAt !== loaded.record.updated_at) return fail(CONFLICT);
  return updatePromotion(promotionId, organizerId, { ...loaded.record, status: "active", updated_at: updatedAt });
}

export async function duplicatePromotion(promotionId: string, organizerId: string, updatedAt: string): Promise<PromotionActionResult> {
  const loaded = await listPromotionRecord(promotionId, organizerId, "write");
  if (!loaded.ok) return fail(loaded.error);
  if (updatedAt !== loaded.record.updated_at) return fail(CONFLICT);
  const targetsResult = await getTargets(loaded.admin, organizerId, promotionId);
  if (targetsResult.error) return fail("Failed to load promotion targets.");
  const source = { ...loaded.record };
  delete source.id;
  delete source.organizer_id;
  delete source.created_at;
  delete source.updated_at;
  delete source.code;
  const result = await createPromotion(organizerId, {
    ...source,
    name: `${loaded.record.name} copy`.slice(0, MAX_NAME),
    status: "draft",
    code: null,
    targets: targetsResult.data,
  });
  return result;
}

export async function deletePromotion(promotionId: string, organizerId: string, updatedAt: string): Promise<PromotionActionResult> {
  const auth = await authorize(organizerId, "delete");
  if (!auth.ok) return fail(auth.error);
  const { data: existing, error: findError } = await auth.admin.from("promotions").select("id, updated_at")
    .eq("id", promotionId).eq("organizer_id", organizerId).maybeSingle();
  if (findError || !existing) return fail("Promotion not found.");
  if (updatedAt !== existing.updated_at) return fail(CONFLICT);
  const { data, error } = await auth.admin.from("promotions").delete().eq("id", promotionId).eq("organizer_id", organizerId).eq("updated_at", updatedAt).select("id").maybeSingle();
  if (error || !data) return fail(CONFLICT);
  revalidatePromotions(organizerId);
  return { success: true };
}
