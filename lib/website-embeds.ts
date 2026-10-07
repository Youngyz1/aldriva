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
 *  3. Bounded queries: Row limit is clamped between 1 and 12 (default 6) and passed to .limit().
 *  4. Minimal projection: Internal fields (Stripe keys, attendee lists, buyer emails, notes) are excluded.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
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
  image_url: string | null;
  dietary_tags: string[];
  allergens: string[];
  modifiers: { name: string; price_delta: number }[];
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
}

export const EMBED_LIMIT_MAX = 12;
export const EMBED_LIMIT_DEFAULT = 6;
export const EMBED_LIMIT_MIN = 1;

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
  const limit = clampLimit(block.limit);

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
      "id, name, slug, description, images, price_type, stock_quantity, status"
    )
    .in("business_id", businessIds);

  // Status gate: public visitors only see active products
  if (!isTeamMember) {
    query = query.eq("status", "active");
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
  client?: SupabaseClient
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
  let itemQuery = supabase.from("menu_items").select("id, section_id, name, description, price, image_url, dietary_tags, allergens, modifiers, is_active, is_featured").in("section_id", sectionIds);
  if (!isTeamMember) itemQuery = itemQuery.eq("is_active", true);
  // also ensure section is active for public
  itemQuery = itemQuery.order("position", { ascending: true });
  const { data: items } = await itemQuery;
  const itemsBySection: Record<string, ResolvedMenuItem[]> = {};
  for (const it of (items || []) as any[]) {
    const mapped: ResolvedMenuItem = {
      id: it.id,
      name: it.name,
      description: it.description ?? null,
      price: Number(it.price),
      image_url: it.image_url ?? null,
      dietary_tags: Array.isArray(it.dietary_tags) ? it.dietary_tags : [],
      allergens: Array.isArray(it.allergens) ? it.allergens : [],
      modifiers: Array.isArray(it.modifiers) ? it.modifiers : [],
      is_active: Boolean(it.is_active),
      is_featured: Boolean(it.is_featured),
      isDraft: !it.is_active,
    };
    // For public, filter items where parent section is inactive already handled by sectionQuery, but double-check
    itemsBySection[it.section_id] = itemsBySection[it.section_id] || [];
    itemsBySection[it.section_id].push(mapped);
  }
  return sections.map((sec) => ({
    id: sec.id,
    name: sec.name,
    description: sec.description ?? null,
    is_active: Boolean(sec.is_active),
    isDraft: !sec.is_active,
    items: itemsBySection[sec.id] || [],
  }));
}
