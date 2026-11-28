/**
 * lib/services-public-data.ts
 *
 * Public (non-dashboard) reads for the services catalogue, feeding the
 * /services virtual route tree. Organizer-scoped, active-only for public
 * visitors (team members previewing see everything, same convention as
 * resolveServicesEmbed in lib/website-embeds.ts).
 *
 * Graceful degrade: migration 220 (service_categories, services.category_id/
 * summary/includes/hero_image_url) may not be applied yet. On a missing
 * table/column error, categories come back empty and services fall back to
 * the pre-220 column set — /services keeps working exactly as it does today.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import type { ServiceRouteCategory, ServiceRouteService } from "@/lib/services-route-resolver";

function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "42P01" || code === "42703") return true;
  const message = (err as { message?: unknown }).message;
  return typeof message === "string" && (message.includes("does not exist") || message.includes("schema cache"));
}

export interface PublicServiceCategory extends ServiceRouteCategory {
  title: string;
  tagline: string | null;
  description: string | null;
  image_url: string | null;
  position: number;
}

export interface PublicServiceItem extends ServiceRouteService {
  title: string;
  summary: string | null;
  description: string | null;
  includes: string[];
  price: number | null;
  duration_minutes: number | null;
  image_url: string | null;
  hero_image_url: string | null;
  position: number;
}

export interface PublicServicesCatalog {
  categories: PublicServiceCategory[];
  services: PublicServiceItem[];
  categoriesMigrated: boolean;
}

/** Organizer-scoped catalog for the public /services route tree. */
export async function getPublicServicesCatalog(
  organizerId: string,
  isTeamMember: boolean
): Promise<PublicServicesCatalog> {
  const admin = createSupabaseAdmin();

  let categoriesMigrated = true;
  let categories: PublicServiceCategory[] = [];
  {
    let query = admin
      .from("service_categories")
      .select("id, slug, title, tagline, description, image_url, position, is_active")
      .eq("organizer_id", organizerId);
    if (!isTeamMember) query = query.eq("is_active", true);
    query = query.order("position", { ascending: true }).order("created_at", { ascending: true });
    const { data, error } = await query;
    if (error) {
      if (isMissingTableError(error)) {
        categoriesMigrated = false;
      }
    } else if (Array.isArray(data)) {
      categories = data as PublicServiceCategory[];
    }
  }

  let services: PublicServiceItem[] = [];
  {
    let query = admin
      .from("services")
      .select("id, slug, title, category_id, summary, description, includes, price, duration_minutes, image_url, hero_image_url, position, is_active")
      .eq("organizer_id", organizerId);
    if (!isTeamMember) query = query.eq("is_active", true);
    query = query.order("position", { ascending: true }).order("created_at", { ascending: true });
    let { data, error } = await query;
    if (error && isMissingTableError(error)) {
      // migration 220 columns absent: fall back to the pre-220 column set.
      let fallbackQuery = admin
        .from("services")
        .select("id, slug, title, price, duration_minutes, image_url, position, is_active")
        .eq("organizer_id", organizerId);
      if (!isTeamMember) fallbackQuery = fallbackQuery.eq("is_active", true);
      fallbackQuery = fallbackQuery.order("position", { ascending: true }).order("created_at", { ascending: true });
      const fallback = await fallbackQuery;
      data = (fallback.data || []).map((row) => ({
        ...row,
        category_id: null,
        summary: null,
        description: null,
        includes: [],
        hero_image_url: null,
      })) as typeof data;
      error = fallback.error;
      categoriesMigrated = false;
    }
    if (!error && Array.isArray(data)) {
      services = data.map((row) => ({
        ...row,
        includes: Array.isArray((row as { includes?: unknown }).includes) ? (row as { includes: string[] }).includes : [],
      })) as PublicServiceItem[];
    }
  }

  return { categories, services, categoriesMigrated };
}

export interface ValidatedPublicService {
  id: string;
  title: string;
  duration_minutes: number | null;
  booking_mode: "timed" | "date_only" | null;
}

/**
 * Validate a service id against the business's own organizer and active
 * status for an anonymous booking reference (migration 217 booking_details).
 * No FK: an id that doesn't resolve here is simply dropped by the caller.
 *
 * Migration-absent graceful degrade: if migration 222's booking_mode column
 * isn't applied yet, fall back to the pre-222 column set and default
 * booking_mode to "timed" (the column default) so the booking flow keeps
 * working unchanged.
 */
export async function validatePublicServiceId(
  organizerId: string,
  serviceId: string
): Promise<ValidatedPublicService | null> {
  const admin = createSupabaseAdmin();
  let { data, error } = await admin
    .from("services")
    .select("id, title, duration_minutes, booking_mode, is_active")
    .eq("id", serviceId)
    .eq("organizer_id", organizerId)
    .eq("is_active", true)
    .maybeSingle();
  if (error && isMissingTableError(error)) {
    // migration 222 not applied yet: booking_mode column absent.
    const fallback = await admin
      .from("services")
      .select("id, title, duration_minutes, is_active")
      .eq("id", serviceId)
      .eq("organizer_id", organizerId)
      .eq("is_active", true)
      .maybeSingle();
    if (fallback.error || !fallback.data || !(fallback.data as { is_active?: unknown }).is_active) return null;
    return {
      id: fallback.data.id as string,
      title: fallback.data.title as string,
      duration_minutes: (fallback.data as { duration_minutes?: number | null }).duration_minutes ?? null,
      booking_mode: null,
    };
  }
  if (error || !data || !(data as { is_active?: unknown }).is_active) return null;
  return {
    id: data.id as string,
    title: data.title as string,
    duration_minutes: (data as { duration_minutes?: number | null }).duration_minutes ?? null,
    booking_mode: (data as { booking_mode?: "timed" | "date_only" | null }).booking_mode ?? null,
  };
}

/** Related services: same category first, then others, excluding itself, active only. */
export function getRelatedServices(
  service: Pick<PublicServiceItem, "id" | "category_id">,
  services: readonly PublicServiceItem[],
  limit = 3
): PublicServiceItem[] {
  const active = services.filter((s) => s.is_active && s.id !== service.id);
  const sameCategory = active.filter((s) => s.category_id === service.category_id);
  const others = active.filter((s) => s.category_id !== service.category_id);
  return [...sameCategory, ...others].slice(0, limit);
}
