/**
 * lib/website-embeds.ts
 *
 * Server-side resolvers for live embed blocks (Phase 3 Task 3.2).
 *
 * Implements tenant-scoped, status-gated, safely-projected data fetching for:
 *  - events_embed      : Scoped to events.organizer_id = tenantId
 *  - products_embed    : Scoped via businesses.organizer_id = tenantId -> products.business_id (or owner fallback)
 *  - fundraiser_embed  : Scoped to fundraisers.organizer_id = tenantId
 *
 * Security Properties:
 *  1. Tenant isolation: tenantId is NEVER accepted from untrusted block JSON;
 *     it is injected strictly by server-side page context (tenant_websites.tenant_id).
 *  2. Publication gating: Public visitors (isTeamMember = false) ONLY see published/active records.
 *  3. Bounded queries: ordinary embeds clamp to 1..12 (default 6); the Store template's public product browse is capped at 200.
 *  4. Minimal projection: Internal fields (Stripe keys, attendee lists, buyer emails, notes) are excluded.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import Stripe from "stripe";
import { fromMinorUnits } from "@/lib/money";
import { resolveBasePrice, isPromotionActive } from "@/lib/menu-promotions";
import { loadMenuPromotions } from "@/lib/menu-promotion-data";
import { resolveItemOptionGroups, type NormalizedOptionAssignmentRow, type ResolvedOptionGroup } from "@/lib/menu-pricing";
import type { MenuPromotion } from "@/lib/menu-promotions";
import { isMissingMenuOptionSchema, warnMissingMenuOptionSchemaOnce } from "@/lib/menu-option-schema";
import type {
  EventsEmbedBlock,
  ProductsEmbedBlock,
  FundraiserEmbedBlock,
  ServicesEmbedBlock,
  MenuEmbedBlock,
} from "./website-blocks";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResolvedEventItem {
  id: string;
  title: string;
  slug: string;
  event_date: string;
  end_date: string | null;
  cover_image: string | null;
  venue_name: string | null;
  city: string | null;
  ticket_price_min: number | null;
  currency: string | null;
  status: string;
  isDraft: boolean;
}

export interface ResolvedProductItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  images: string[];
  price_type: string;
  stock_quantity: number | null;
  status: string;
  isDraft: boolean;
  category: string | null;
  tags: string[];
  stripe_price_id: string | null;
  /** ISO timestamp for newest-first sorting; null when unknown. */
  created_at?: string | null;
}

export interface ResolvedFundraiserItem {
  id: string;
  title: string;
  slug: string;
  image_url: string | null;
  goal_amount: number;
  raised: number;
  currency: string;
  is_active: boolean;
  status: string | null;
  isDraft: boolean;
}

export interface ResolvedServiceItem {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  price: number;
  duration_minutes: number | null;
  image_url: string | null;
  is_active: boolean;
  isDraft: boolean;
}

export interface ResolvedMenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  promo_price?: number | null;
  effective_price?: number;
  original_price?: number;
  discount_per_unit?: number;
  applied_promotion?: MenuPromotion | null;
  promotions?: MenuPromotion[];
  is_sold_out?: boolean;
  image_url: string | null;
  dietary_tags: string[];
  allergens: string[];
  modifiers: { name: string; price_delta: number }[];
  option_groups?: ResolvedOptionGroup[];
  is_active: boolean;
  is_featured: boolean;
  isDraft: boolean;
}

export interface ResolvedMenuSection {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  isDraft: boolean;
  items: ResolvedMenuItem[];
  hasMoreItems?: boolean;
  hasMoreItemsOverall?: boolean;
}

export const EMBED_LIMIT_MAX = 12;
export const EMBED_LIMIT_DEFAULT = 6;
export const EMBED_LIMIT_MIN = 1;
export const MENU_ITEMS_PER_SECTION_LIMIT = 100;
export const MENU_ITEMS_OVERALL_LIMIT = 500;

export function clampLimit(limit?: number): number {
  if (typeof limit !== "number" || Number.isNaN(limit)) {
    return EMBED_LIMIT_DEFAULT;
  }
  return Math.min(Math.max(EMBED_LIMIT_MIN, Math.floor(limit)), EMBED_LIMIT_MAX);
}

/**
 * Resolves events feed scoped to website's organizer_id.
 */
export async function resolveEventsEmbed(
  block: EventsEmbedBlock,
  tenantId: string,
  isTeamMember: boolean,
  client?: SupabaseClient
): Promise<ResolvedEventItem[]> {
  if (!tenantId || typeof tenantId !== "string") return [];

  const supabase = client ?? createSupabaseAdmin();
  const limit = clampLimit(block.limit);

  let query = supabase
    .from("events")
    .select(
      "id, title, slug, event_date, end_date, cover_image, venue_name, city, ticket_price_min, currency, status"
    )
    .eq("organizer_id", tenantId);

  // Status gate: public visitors only see published events (invitation-kind
  // events are never publicly listed, even to other tenants' visitors)
  if (!isTeamMember) {
    query = query.eq("status", "published").eq("kind", "public");
  }

  // Selected event IDs filter if specified
  if (block.selectedEventIds && block.selectedEventIds.length > 0) {
    query = query.in("id", block.selectedEventIds);
  }

  query = query.order("event_date", { ascending: true }).limit(limit);

  const { data, error } = await query;
  if (error || !Array.isArray(data)) {
    return [];
  }

  return data.map((item) => ({
    id: item.id,
    title: item.title,
    slug: item.slug,
    event_date: item.event_date,
    end_date: item.end_date ?? null,
    cover_image: item.cover_image ?? null,
    venue_name: item.venue_name ?? null,
    city: item.city ?? null,
    ticket_price_min:
      item.ticket_price_min != null ? Number(item.ticket_price_min) : null,
    currency: item.currency ?? "USD",
    status: item.status,
    isDraft: item.status !== "published",
  }));
}

/**
 * Resolves products feed scoped to website's organizer via businesses join path.
 */
export async function resolveProductsEmbed(
  block: ProductsEmbedBlock,
  tenantId: string,
  isTeamMember: boolean,
  client?: SupabaseClient
): Promise<ResolvedProductItem[]> {
  if (!tenantId || typeof tenantId !== "string") return [];

  const supabase = client ?? createSupabaseAdmin();
  const limit = block.allowLargeCatalog
    ? Math.min(200, Math.max(1, Math.floor(typeof block.limit === "number" && Number.isFinite(block.limit) ? block.limit : EMBED_LIMIT_DEFAULT)))
    : clampLimit(block.limit);

  // Step 1: Resolve business ID(s) strictly linked to this organizer entity
  const { data: businesses, error: bizError } = await supabase
    .from("businesses")
    .select("id")
    .eq("organizer_id", tenantId);

  if (bizError || !Array.isArray(businesses) || businesses.length === 0) {
    return [];
  }

  const businessIds = businesses.map((b) => b.id);

  // Step 2: Query products scoped strictly to this tenant's business entity
  let query = supabase
    .from("products")
    .select(
      "id, name, slug, description, images, price_type, stock_quantity, status, category, tags, stripe_price_id, created_at"
    )
    .in("business_id", businessIds);

  // Public Store listings retain sold-out products for their detail state;
  // legacy product embeds continue to show active products only.
  if (!isTeamMember) {
    query = block.siteLocalProductDetails
      ? query.in("status", ["active", "out_of_stock"])
      : query.eq("status", "active");
  }

  // Selected product IDs filter if specified
  if (block.selectedProductIds && block.selectedProductIds.length > 0) {
    query = query.in("id", block.selectedProductIds);
  }

  query = query.order("created_at", { ascending: false }).limit(limit);

  const { data, error } = await query;
  if (error || !Array.isArray(data)) {
    return [];
  }

  return data.map((item) => ({
    id: item.id,
    name: item.name,
    slug: item.slug,
    description: item.description,
    images: Array.isArray(item.images) ? item.images : [],
    price_type: item.price_type,
    stock_quantity:
      item.stock_quantity != null ? Number(item.stock_quantity) : null,
    status: item.status,
    isDraft: item.status !== "active",
    category:
      typeof item.category === "string" && item.category.trim() !== ""
        ? item.category.trim()
        : null,
    tags: Array.isArray(item.tags)
      ? item.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim() !== "")
      : [],
    stripe_price_id:
      typeof item.stripe_price_id === "string" && item.stripe_price_id.trim() !== ""
        ? item.stripe_price_id.trim()
        : null,
    created_at: typeof item.created_at === "string" ? item.created_at : null,
  }));
}

/**
 * Resolves fundraisers feed scoped to website's organizer_id.
 */
export async function resolveFundraiserEmbed(
  block: FundraiserEmbedBlock,
  tenantId: string,
  isTeamMember: boolean,
  client?: SupabaseClient
): Promise<ResolvedFundraiserItem[]> {
  if (!tenantId || typeof tenantId !== "string") return [];

  const supabase = client ?? createSupabaseAdmin();
  const limit = clampLimit(block.limit);

  let query = supabase
    .from("fundraisers")
    .select(
      "id, title, slug, image_url, goal_amount, raised, currency, is_active, status"
    )
    .eq("organizer_id", tenantId)
    .is("deleted_at", null);

  // Status gate: public visitors only see active fundraisers
  if (!isTeamMember) {
    query = query.eq("is_active", true);
  }

  // Selected fundraiser IDs filter if specified
  if (block.selectedFundraiserIds && block.selectedFundraiserIds.length > 0) {
    query = query.in("id", block.selectedFundraiserIds);
  }

  query = query.order("created_at", { ascending: false }).limit(limit);

  const { data, error } = await query;
  if (error || !Array.isArray(data)) {
    return [];
  }

  return data.map((item) => ({
    id: item.id,
    title: item.title,
    slug: item.slug,
    image_url: item.image_url ?? null,
    goal_amount: Number(item.goal_amount ?? 0),
    raised: Number(item.raised ?? 0),
    currency: item.currency ?? "USD",
    is_active: Boolean(item.is_active),
    status: item.status ?? null,
    isDraft: !item.is_active,
  }));
}

export async function resolveServicesEmbed(
  block: ServicesEmbedBlock,
  tenantId: string,
  isTeamMember: boolean,
  client?: SupabaseClient
): Promise<ResolvedServiceItem[]> {
  if (!tenantId || typeof tenantId !== "string") return [];
  const supabase = client ?? createSupabaseAdmin();
  const limit = clampLimit(block.limit);
  let query = supabase.from("services").select("id, title, slug, description, price, duration_minutes, image_url, is_active").eq("organizer_id", tenantId);
  if (!isTeamMember) query = query.eq("is_active", true);
  if (block.selectedServiceIds && block.selectedServiceIds.length > 0) query = query.in("id", block.selectedServiceIds);
  query = query.order("position", { ascending: true }).order("created_at", { ascending: true }).limit(limit);
  const { data, error } = await query;
  if (error || !Array.isArray(data)) return [];
  return data.map((item) => ({
    id: item.id,
    title: item.title,
    slug: item.slug,
    description: item.description ?? null,
    price: Number(item.price),
    duration_minutes: item.duration_minutes ?? null,
    image_url: item.image_url ?? null,
    is_active: Boolean(item.is_active),
    isDraft: !item.is_active,
  }));
}

export async function resolveMenuEmbed(
  block: MenuEmbedBlock,
  tenantId: string,
  isTeamMember: boolean,
  client?: SupabaseClient,
  currency = "USD"
): Promise<ResolvedMenuSection[]> {
  if (!tenantId || typeof tenantId !== "string") return [];
  const supabase = client ?? createSupabaseAdmin();
  const limit = clampLimit(block.limit);
  let sectionQuery = supabase.from("menu_sections").select("id, name, description, is_active").eq("organizer_id", tenantId);
  if (!isTeamMember) sectionQuery = sectionQuery.eq("is_active", true);
  if (block.selectedSectionIds && block.selectedSectionIds.length > 0) sectionQuery = sectionQuery.in("id", block.selectedSectionIds);
  sectionQuery = sectionQuery.order("position", { ascending: true }).limit(limit);
  const { data: sections, error: secErr } = await sectionQuery;
  if (secErr || !Array.isArray(sections) || sections.length === 0) return [];
  const sectionIds = sections.map((s) => s.id);
  // Picked IDs are still constrained by the tenant's own section IDs below.
  const pickedItemIds = Array.isArray(block.selectedItemIds)
    ? block.selectedItemIds.filter((id) => typeof id === "string" && id.length > 0)
    : [];
  const buildItemQuery = (includeOptionsSource: boolean) => {
    let query = supabase.from("menu_items").select(`id, section_id, name, description, price, promo_price, is_sold_out, option_groups, image_url, dietary_tags, allergens, modifiers, is_active, is_featured${includeOptionsSource ? ", options_source" : ""}`).in("section_id", sectionIds);
    if (!isTeamMember) query = query.eq("is_active", true);
    if (pickedItemIds.length > 0) query = query.in("id", pickedItemIds);
    return query.order("position", { ascending: true }).limit(MENU_ITEMS_OVERALL_LIMIT + 1);
  };
  let normalizedSchemaAvailable = true;
  let itemResult = await buildItemQuery(true);
  if (itemResult.error && isMissingMenuOptionSchema(itemResult.error)) {
    warnMissingMenuOptionSchemaOnce("resolveMenuEmbed", itemResult.error);
    normalizedSchemaAvailable = false;
    itemResult = await buildItemQuery(false) as typeof itemResult;
  }
  const items = itemResult.data;
  const itemsBySection: Record<string, ResolvedMenuItem[]> = {};
  const sectionsWithMoreItems = new Set<string>();
  const queriedItems = (items || []) as any[];
  const hasMoreItemsOverall = queriedItems.length > MENU_ITEMS_OVERALL_LIMIT;
  const returnedItems = queriedItems.slice(0, MENU_ITEMS_OVERALL_LIMIT);
  const returnedItemIds = returnedItems.map((item) => item.id);
  const promotionLoad = returnedItemIds.length > 0
    ? await loadMenuPromotions(supabase, tenantId, { includeCodes: false, status: "active", context: "resolveMenuEmbed" })
    : { promotions: [], error: null, missingSchema: false };
  const promotionNow = new Date();
  const publicPromotions = promotionLoad.promotions.filter((promotion) => isPromotionActive(promotion, promotionNow));
  let assignments: any[] = [];
  if (normalizedSchemaAvailable && returnedItemIds.length > 0) {
    const { data, error } = await supabase
      .from("menu_item_option_groups")
      .select("id, organizer_id, item_id, group_id, position, hidden_option_ids, price_overrides")
      .in("item_id", returnedItemIds);
    if (error && isMissingMenuOptionSchema(error)) {
      warnMissingMenuOptionSchemaOnce("resolveMenuEmbed", error);
      normalizedSchemaAvailable = false;
    } else if (!error && Array.isArray(data)) assignments = data;
  }
  const groupIds = [...new Set(assignments.map((row) => row.group_id).filter(Boolean))];
  const groupsById = new Map<string, any>();
  const optionsByGroupId = new Map<string, any[]>();
  if (groupIds.length > 0) {
    let groupQuery = supabase.from("menu_option_groups")
      .select("id, organizer_id, name, kind, min_select, max_select, is_required, position, is_active")
      .in("id", groupIds);
    let optionQuery = supabase.from("menu_options")
      .select("id, group_id, organizer_id, name, description, price, image_url, is_default, max_qty, is_available, allergens, position")
      .in("group_id", groupIds);
    if (!isTeamMember) {
      groupQuery = groupQuery.eq("is_active", true);
      optionQuery = optionQuery.eq("is_available", true);
    }
    const [groupResult, optionResult] = await Promise.all([groupQuery, optionQuery]);
    const missingSchemaError = [groupResult.error, optionResult.error].find(isMissingMenuOptionSchema);
    if (missingSchemaError) {
      warnMissingMenuOptionSchemaOnce("resolveMenuEmbed", missingSchemaError);
      normalizedSchemaAvailable = false;
      assignments = [];
    } else {
      for (const group of groupResult.data || []) groupsById.set(group.id, group);
      for (const option of optionResult.data || []) {
        const optionRows = optionsByGroupId.get(option.group_id) || [];
        optionRows.push(option);
        optionsByGroupId.set(option.group_id, optionRows);
      }
    }
  }
  const assignmentsByItem = new Map<string, NormalizedOptionAssignmentRow[]>();
  for (const assignment of assignments) {
    const group = groupsById.get(assignment.group_id);
    const list = assignmentsByItem.get(assignment.item_id) || [];
    list.push({
      ...assignment,
      group: group ? { ...group, options: optionsByGroupId.get(group.id) || [] } : null,
    });
    assignmentsByItem.set(assignment.item_id, list);
  }
  for (const it of returnedItems) {
    const sectionItems = itemsBySection[it.section_id] || [];
    if (sectionItems.length >= MENU_ITEMS_PER_SECTION_LIMIT) {
      sectionsWithMoreItems.add(it.section_id);
      continue;
    }
    const optionGroups = resolveItemOptionGroups(
      { id: it.id, price: Number(it.price), promo_price: it.promo_price != null ? Number(it.promo_price) : null, options_source: normalizedSchemaAvailable ? it.options_source : "json", option_groups: Array.isArray(it.option_groups) ? it.option_groups : [] },
      normalizedSchemaAvailable ? assignmentsByItem.get(it.id) || [] : []
    );
    const itemPromotions = publicPromotions.filter((promotion) =>
      promotion.organizer_id === tenantId && (promotion.targets || []).some((target) => target.item_id === it.id || target.section_id === it.section_id)
    );
    const variantGroup = optionGroups.find((group) => group.kind === "variant");
    const selectedVariant = variantGroup?.options.find((option) => option.is_default === true && option.is_available !== false)
      ?? variantGroup?.options.find((option) => option.is_available !== false);
    const resolvedPrice = resolveBasePrice({
      id: it.id,
      organizer_id: tenantId,
      section_id: it.section_id,
      price: Number(it.price),
      promo_price: it.promo_price != null ? Number(it.promo_price) : null,
      is_active: Boolean(it.is_active),
      is_sold_out: Boolean(it.is_sold_out),
      option_groups: optionGroups,
    }, itemPromotions, { now: promotionNow, subtotal: 0, currency, variantPrice: selectedVariant ? Number(selectedVariant.price) : undefined });
    const mapped: ResolvedMenuItem = {
      id: it.id,
      name: it.name,
      description: it.description ?? null,
      price: Number(it.price),
      promo_price: it.promo_price != null ? Number(it.promo_price) : null,
      effective_price: resolvedPrice.basePrice,
      original_price: resolvedPrice.originalPrice,
      discount_per_unit: resolvedPrice.discountPerUnit,
      applied_promotion: resolvedPrice.appliedPromotion,
      promotions: itemPromotions,
      is_sold_out: Boolean(it.is_sold_out),
      image_url: it.image_url ?? null,
      dietary_tags: Array.isArray(it.dietary_tags) ? it.dietary_tags : [],
      allergens: Array.isArray(it.allergens) ? it.allergens : [],
      modifiers: Array.isArray(it.modifiers) ? it.modifiers : [],
      option_groups: optionGroups,
      is_active: Boolean(it.is_active),
      is_featured: Boolean(it.is_featured),
      isDraft: !it.is_active,
    };
    // For public, filter items where parent section is inactive already handled by sectionQuery, but double-check
    sectionItems.push(mapped);
    itemsBySection[it.section_id] = sectionItems;
  }
  // Item-pick mode shows only sections that actually contain a picked item;
  // the default (no picks) keeps every section, even empty ones, as before.
  const pickedMode = Array.isArray(block.selectedItemIds) && block.selectedItemIds.length > 0;
  const visibleSections = pickedMode ? sections.filter((sec) => (itemsBySection[sec.id] || []).length > 0) : sections;
  return visibleSections.map((sec) => ({
    id: sec.id,
    name: sec.name,
    description: sec.description ?? null,
    is_active: Boolean(sec.is_active),
    isDraft: !sec.is_active,
    items: itemsBySection[sec.id] || [],
    hasMoreItems: sectionsWithMoreItems.has(sec.id),
    hasMoreItemsOverall,
  }));
}

/**
 * Resolves display prices for shop items from Stripe. Products store no local
 * price (stripe_price_id is the source of truth, migration_116), so grid
 * prices require one lookup per priced item.
 *
 * Per-item try/catch: a failed lookup omits that price while the card still
 * links to the detail page (which resolves its own price). No key configured
 * → empty map, never throws. Callers should keep grids small (block limit).
 */
export async function resolveShopPrices(
  items: Array<{ id: string; stripe_price_id: string | null }>
): Promise<Map<string, { amount: number; currency: string }>> {
  const out = new Map<string, { amount: number; currency: string }>();
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return out;
  const stripe = new Stripe(secret);
  await Promise.all(
    items
      .filter((item) => typeof item.stripe_price_id === "string" && item.stripe_price_id !== "")
      .map(async (item) => {
        try {
          const price = await stripe.prices.retrieve(item.stripe_price_id as string);
          if (price.active && typeof price.unit_amount === "number") {
            out.set(item.id, {
              amount: fromMinorUnits(price.unit_amount, price.currency || "usd"),
              currency: (price.currency || "usd").toUpperCase(),
            });
          }
        } catch {
          // Omit this price; the card still links to the detail page.
        }
      })
  );
  return out;
}
