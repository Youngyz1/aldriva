/** Canonical paths for tenant pages under /site/<slug>. */

export function getSiteBasePath(siteSlug: string): string {
  return `/site/${encodeURIComponent(siteSlug)}`;
}

export function getSitePageHref(
  siteSlug: string,
  pageSlug: string,
  anchor?: string,
): string {
  const base = getSiteBasePath(siteSlug);
  const pagePath = pageSlug === "home" ? base : `${base}/${encodeURIComponent(pageSlug)}`;
  return anchor ? `${pagePath}#${encodeURIComponent(anchor)}` : pagePath;
}

/** Scope a manifest-relative page path to its tenant site, leaving external URLs intact. */
export function resolveSiteHref(siteSlug: string | undefined, href: string): string {
  const value = href.trim();
  if (!siteSlug || !value || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return value;

  const base = getSiteBasePath(siteSlug);
  if (value === base || value.startsWith(`${base}/`) || value.startsWith(`${base}#`) || value.startsWith(`${base}?`)) {
    return value;
  }
  if (value.startsWith("#")) return `${base}${value}`;
  if (value.startsWith("/")) return value === "/" ? base : `${base}${value}`;
  return `${base}/${value}`;
}

/** Scope a multi-segment path (each segment encoded individually) to its tenant site. */
export function getSiteSegmentsHref(siteSlug: string, segments: readonly string[]): string {
  const base = getSiteBasePath(siteSlug);
  if (segments.length === 0) return base;
  return `${base}/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}

/**
 * A service detail page's Book button reuses the site's resolved primary
 * action as-is: it only appends `?service=<id>` when that action actually
 * points at the general booking page (`/book`); any other target (e.g.
 * Contact) is passed through unchanged.
 */
export function resolveServiceDetailBookHref(
  siteSlug: string,
  serviceId: string,
  primary: { href: string } | undefined
): string | null {
  if (!primary) return null;
  const bookPagePath = getSiteSegmentsHref(siteSlug, ["book"]);
  return primary.href === bookPagePath
    ? `${primary.href}?service=${encodeURIComponent(serviceId)}`
    : primary.href;
}

/** Return the tenant page slug represented by an already scoped internal href. */
export function getSitePageSlug(siteSlug: string, href: string): string | undefined {
  const resolved = resolveSiteHref(siteSlug, href);
  const base = getSiteBasePath(siteSlug);
  const path = resolved.split(/[?#]/, 1)[0];
  if (path === base) return "home";
  if (!path.startsWith(`${base}/`)) return undefined;
  const firstSegment = path.slice(base.length + 1).split("/")[0];
  try {
    return decodeURIComponent(firstSegment);
  } catch {
    return undefined;
  }
}
