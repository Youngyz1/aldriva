/**
 * lib/services-virtual-route.ts
 *
 * Bridges the pure resolver (lib/services-route-resolver.ts) to the public
 * services catalog (lib/services-public-data.ts) for the /services virtual
 * route tree, plus a cached SEO lookup for generateMetadata.
 */

import { cacheLife } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveServicesRoute } from "@/lib/services-route-resolver";
import {
  getPublicServicesCatalog,
  getRelatedServices,
  type PublicServicesCatalog,
  type PublicServiceCategory,
  type PublicServiceItem,
} from "@/lib/services-public-data";

export type ServicesVirtualRoute =
  | { kind: "notFound" }
  | { kind: "category"; category: PublicServiceCategory; services: PublicServiceItem[] }
  | {
      kind: "service";
      service: PublicServiceItem;
      category: PublicServiceCategory | null;
      related: PublicServiceItem[];
      categoriesById: Map<string, PublicServiceCategory>;
    };

/**
 * Resolves a /services/<...> virtual sub-route from an already-fetched
 * catalog. Returns undefined when the request isn't a virtual sub-route at
 * all (plain /services, or a different page entirely) so the caller falls
 * through to normal page rendering. `catalog` is null when the viewer
 * cannot see the real /services page (draft, missing, or not a v2 site) —
 * every sub-route under it is then notFound, per the "can't see /services,
 * can't see its children" rule.
 */
export function resolveServicesVirtualRoute(
  pageSlugArr: string[] | undefined,
  catalog: PublicServicesCatalog | null
): ServicesVirtualRoute | undefined {
  if (!pageSlugArr || pageSlugArr.length <= 1 || pageSlugArr[0] !== "services") return undefined;
  if (!catalog) return { kind: "notFound" };

  const result = resolveServicesRoute(pageSlugArr.slice(1), catalog);
  if (result.kind === "notFound" || result.kind === "index") return { kind: "notFound" };

  if (result.kind === "category") {
    const category = result.category as PublicServiceCategory;
    const services = catalog.services.filter((s) => s.category_id === category.id && s.is_active);
    return { kind: "category", category, services };
  }

  const service = result.service as PublicServiceItem;
  const category = (result.category as PublicServiceCategory | null) ?? null;
  const related = getRelatedServices(service, catalog.services, 3);
  const categoriesById = new Map(catalog.categories.map((c) => [c.id, c]));
  return { kind: "service", service, category, related, categoriesById };
}

export interface ServicesVirtualRouteSeo {
  title: string;
  description: string | null;
}

/**
 * SEO-only lookup for generateMetadata, independent of the render path's
 * isTeamMember context (crawlers are never previewing). Mirrors the
 * published-website + published-page gating getCachedPublicPageSeo applies
 * to every other page, so draft/preview-only content never gets indexed.
 */
export async function getCachedServicesVirtualRouteSeo(
  siteSlug: string,
  segments: string[]
): Promise<ServicesVirtualRouteSeo | null> {
  "use cache";
  cacheLife({ revalidate: 60 });

  const admin = createSupabaseAdmin();
  const { data: website } = await admin
    .from("tenant_websites")
    .select("id, tenant_id, status")
    .eq("slug", siteSlug)
    .eq("status", "published")
    .maybeSingle();
  if (!website) return null;

  const { data: servicesPage } = await admin
    .from("website_pages")
    .select("id")
    .eq("website_id", website.id)
    .eq("slug", "services")
    .eq("status", "published")
    .maybeSingle();
  if (!servicesPage) return null;

  const catalog = await getPublicServicesCatalog(website.tenant_id, false);
  const result = resolveServicesRoute(segments, catalog);

  if (result.kind === "category") {
    const category = result.category as PublicServiceCategory;
    return { title: category.title, description: category.tagline || category.description };
  }
  if (result.kind === "service") {
    const service = result.service as PublicServiceItem;
    return { title: service.title, description: service.summary || service.description };
  }
  return null;
}
