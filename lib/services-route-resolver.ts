/**
 * lib/services-route-resolver.ts
 *
 * Pure, DB-free resolver for the public /services virtual route tree
 * (/services, /services/<category-or-uncategorized-service>,
 * /services/<category>/<service>). No "server-only" import so this loads
 * under plain node --test.
 *
 * Resolution order for a single segment: category first, then an
 * uncategorized service (Phase 3 rejects a same-slug collision between the
 * two, but the resolver stays deterministic either way). Slugs are matched
 * case-insensitively. More than two segments after "services" is always
 * notFound.
 */

export interface ServiceRouteCategory {
  id: string;
  slug: string;
  is_active: boolean;
}

export interface ServiceRouteService {
  id: string;
  slug: string;
  category_id: string | null;
  is_active: boolean;
}

export interface ServiceRouteCatalog {
  categories: readonly ServiceRouteCategory[];
  services: readonly ServiceRouteService[];
}

export type ServicesRouteResolution =
  | { kind: "index" }
  | { kind: "category"; category: ServiceRouteCategory }
  | { kind: "service"; service: ServiceRouteService; category: ServiceRouteCategory | null }
  | { kind: "notFound" };

export function resolveServicesRoute(
  segments: readonly string[],
  catalog: ServiceRouteCatalog
): ServicesRouteResolution {
  const cleaned = segments.filter((segment) => segment.length > 0);
  if (cleaned.length === 0) return { kind: "index" };
  if (cleaned.length > 2) return { kind: "notFound" };

  const lower = cleaned.map((segment) => segment.toLowerCase());

  if (lower.length === 1) {
    const [slug] = lower;
    const category = catalog.categories.find(
      (c) => c.is_active && c.slug.toLowerCase() === slug
    );
    if (category) return { kind: "category", category };

    const service = catalog.services.find(
      (s) => s.is_active && s.category_id === null && s.slug.toLowerCase() === slug
    );
    if (service) return { kind: "service", service, category: null };

    return { kind: "notFound" };
  }

  const [categorySlug, serviceSlug] = lower;
  const category = catalog.categories.find(
    (c) => c.is_active && c.slug.toLowerCase() === categorySlug
  );
  if (!category) return { kind: "notFound" };

  const service = catalog.services.find(
    (s) => s.is_active && s.category_id === category.id && s.slug.toLowerCase() === serviceSlug
  );
  if (!service) return { kind: "notFound" };

  return { kind: "service", service, category };
}

/** Relative path segments under /services for a category's virtual page. */
export function buildCategoryPath(category: Pick<ServiceRouteCategory, "slug">): string[] {
  return ["services", category.slug];
}

/**
 * Relative path segments under /services for a service's virtual page.
 * category is null for an uncategorized service.
 */
export function buildServicePath(
  service: Pick<ServiceRouteService, "slug">,
  category: Pick<ServiceRouteCategory, "slug"> | null
): string[] {
  return category ? ["services", category.slug, service.slug] : ["services", service.slug];
}
