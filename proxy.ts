import "server-only";
/**
 * proxy.ts
 *
 * Global Supabase SSR proxy for:
 * - Session refresh on every request
 * - Protected route enforcement
 * - Suspended account blocking
 * - Article/business/product access-control gates (return real HTTP 404
 *   before streaming starts, per Next.js 16 loading.md § Status Codes which
 *   states that notFound() cannot change the status once streaming has
 *   begun with a 200 header)
 * - Ticketmaster external-event existence gate (same reason — see below)
 *
 * Business/product gates were added after directly testing the alternative:
 * moving these routes into their own route group (app/(gated)/) with an
 * independent root layout, tried with an empty-fallback <Suspense> around
 * <body>, a layout-level connection(), and a page-level connection() inside
 * their own gate-check functions (the pattern that already works for
 * articles) — none of the four combinations stopped Next from prerendering
 * a shell and locking the status at 200 (confirmed via the response's
 * `x-nextjs-prerender: 1` / `x-nextjs-postponed: 1` headers) before
 * notFound() could fire. A proxy-level check, run before the route renders
 * at all, is the only mechanism that reliably produced a real 404 in
 * testing — it's also Next's own documented recommendation for this exact
 * problem (loading.md: "You can run this check in proxy to rewrite missing
 * slugs to a not-found route"). The (gated) route group and its independent
 * layout are kept regardless, since they're still what opts these routes
 * out of the static-shell system architecturally — this proxy gate is the
 * piece that actually locks in the status code.
 *
 * Admin role enforcement is handled separately by:
 * app/admin/layout.tsx -> requireAdmin()
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// ---------------------------------------------------------------------------
// i18n locale handling (next-intl compatible)
// Detects locale from path prefix > cookie > Accept-Language > default
// and normalizes prefixed URLs via rewrite to the canonical (non-prefixed)
// internal path so the App Router files do not need to move to app/[locale].
// ---------------------------------------------------------------------------
const SUPPORTED_LOCALES = ['en', 'fr'] as const;
type SupportedLocale = typeof SUPPORTED_LOCALES[number];
const DEFAULT_LOCALE: SupportedLocale = 'en';
const LOCALE_COOKIE = 'NEXT_LOCALE';
const LOCALE_HEADER = 'x-next-intl-locale';

function isSupportedLocale(v: string | null | undefined): v is SupportedLocale {
  return !!v && (SUPPORTED_LOCALES as readonly string[]).includes(v);
}

function localeFromAcceptLanguage(header: string | null | undefined): SupportedLocale {
  if (!header) return DEFAULT_LOCALE;
  const parts = header.split(',').map(p => p.split(';')[0].trim().toLowerCase());
  for (const part of parts) {
    if (part.startsWith('fr')) return 'fr';
    if (part.startsWith('en')) return 'en';
  }
  return DEFAULT_LOCALE;
}

function getLocaleFromPath(pathname: string): {locale: SupportedLocale | null; stripped: string} {
  const m = pathname.match(/^\/(en|fr)(?=\/|$)/);
  if (!m) return {locale: null, stripped: pathname};
  const locale = m[1] as SupportedLocale;
  // Strip ALL leading locale segments to recover from already-corrupted URLs like /en/fr/...
  let stripped = pathname;
  // Remove up to 5 leading locale prefixes (safety cap to avoid loop)
  for (let i = 0; i < 5; i++) {
    const inner = stripped.match(/^\/(en|fr)(?=\/|$)/);
    if (!inner) break;
    stripped = stripped.replace(/^\/(en|fr)(?=\/|$)/, '') || '/';
  }
  if (stripped === '') stripped = '/';
  if (!stripped.startsWith('/')) stripped = `/${stripped}`;
  return {locale, stripped};
}

// ---------------------------------------------------------------------------
// Article access-control helper
// Runs a lightweight REST API call (no full DB client) to check article
// visibility before the page component starts streaming.
// Returns true when the request should be allowed through, false for 404.
// ---------------------------------------------------------------------------
async function checkArticleAccess(
  slug: string,
  userId: string | null
): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // Fetch only the columns we need — keep this query minimal.
  const res = await fetch(
    `${supabaseUrl}/rest/v1/articles?slug=eq.${encodeURIComponent(slug)}&select=status,visibility,scheduled_for,owner_id&limit=1`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      // Edge-compatible; no caching — we need real-time results.
      cache: "no-store",
    }
  );

  if (!res.ok) return true; // On fetch error, let the page handle it gracefully.

  const rows = (await res.json()) as Array<{
    status: string;
    visibility: string;
    scheduled_for: string | null;
    owner_id: string;
  }>;

  if (!rows.length) return false; // Article doesn't exist → 404.

  const article = rows[0];
  const now = new Date();

  const isScheduledInFuture =
    article.status === "scheduled" &&
    !!article.scheduled_for &&
    new Date(article.scheduled_for) > now;

  const isRestricted = ["draft", "archived", "expired", "rejected"].includes(
    article.status
  );

  const isPrivate = article.visibility === "private";

  // Publicly accessible — allow through immediately.
  if (!isRestricted && !isScheduledInFuture && !isPrivate) return true;

  // Restricted — check authorization.
  if (!userId) return false;

  // Owner always has access to their own articles.
  if (userId === article.owner_id) return true;

  // Check admin status (second DB call only for restricted articles where the
  // user is not the owner — uncommon path, acceptable overhead).
  return isAuthorizedAdmin(userId);
}

// ---------------------------------------------------------------------------
// Shared admin-status lookup for the business/product gates below — same
// second-call pattern as checkArticleAccess (only fetched when the owner
// check itself doesn't already grant access).
// ---------------------------------------------------------------------------
async function isAuthorizedAdmin(userId: string): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const profileRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role,status&limit=1`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      cache: "no-store",
    }
  );

  if (!profileRes.ok) return false;

  const profiles = (await profileRes.json()) as Array<{
    role: string;
    status: string;
  }>;

  const profile = profiles[0];
  return profile?.role === "admin" && profile?.status === "active";
}

// ---------------------------------------------------------------------------
// Business access-control helper — mirrors checkArticleAccess. Gate logic
// matches app/(gated)/businesses/[slug]/page.tsx's fetchAndGateBusiness:
// restricted (non-"active" status) or flagged listings are hidden unless
// the requester owns the listing or is an active admin.
// ---------------------------------------------------------------------------
async function checkBusinessAccess(
  slug: string,
  userId: string | null
): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const res = await fetch(
    `${supabaseUrl}/rest/v1/businesses?slug=eq.${encodeURIComponent(slug)}&select=status,is_flagged,owner_id&limit=1`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    }
  );

  if (!res.ok) return true; // On fetch error, let the page handle it gracefully.

  const rows = (await res.json()) as Array<{
    status: string;
    is_flagged: boolean | null;
    owner_id: string;
  }>;

  if (!rows.length) return false; // Business doesn't exist → 404.

  const business = rows[0];
  const isRestricted = business.status !== "active";
  const isFlagged = business.is_flagged === true;

  if (!isRestricted && !isFlagged) return true;

  if (!userId) return false;
  if (userId === business.owner_id) return true;

  return isAuthorizedAdmin(userId);
}

// ---------------------------------------------------------------------------
// Product access-control helper — mirrors checkArticleAccess. Gate logic
// matches app/(gated)/products/[slug]/page.tsx's fetchAndGateProduct:
// archived products are hidden unless the requester owns the listing or is
// an active admin.
// ---------------------------------------------------------------------------
async function checkProductAccess(
  slug: string,
  userId: string | null
): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const res = await fetch(
    `${supabaseUrl}/rest/v1/products?slug=eq.${encodeURIComponent(slug)}&select=status,owner_id&limit=1`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    }
  );

  if (!res.ok) return true; // On fetch error, let the page handle it gracefully.

  const rows = (await res.json()) as Array<{
    status: string;
    owner_id: string;
  }>;

  if (!rows.length) return false; // Product doesn't exist → 404.

  const product = rows[0];
  const isRestricted = product.status === "archived";

  if (!isRestricted) return true;

  if (!userId) return false;
  if (userId === product.owner_id) return true;

  return isAuthorizedAdmin(userId);
}

// ---------------------------------------------------------------------------
// Tenant website access-control helper — mirrors checkArticleAccess.
//
// Gate logic:
//   - If the site does not exist → 404.
//   - If status = 'published' → allow (public access).
//   - If status ≠ 'published' (draft / archived):
//       - Anonymous visitors → 404 (no hint that a draft exists).
//       - Authenticated entity members (any role) → allow preview.
//       - Authenticated platform admins → allow preview.
//       - Everyone else → 404.
//
// Runs with no-store / service-role key exactly like other proxy gates.
// Fetches only 3 indexed columns (status, tenant_id, 2 bytes each);
// no streaming, no RLS bypass for public visitors.
// ---------------------------------------------------------------------------
async function checkWebsiteAccess(
  slug: string,
  userId: string | null
): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const res = await fetch(
    `${supabaseUrl}/rest/v1/tenant_websites?slug=eq.${encodeURIComponent(slug)}&select=status,tenant_id&limit=1`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    }
  );

  if (!res.ok) return false; // Fail closed: on fetch error, deny anonymous access.

  const rows = (await res.json()) as Array<{
    status: string;
    tenant_id: string;
  }>;

  if (!rows.length) return false; // Site does not exist → 404.

  const site = rows[0];

  // Published sites are publicly accessible.
  if (site.status === "published") return true;

  // Draft / archived — only entity members and admins can preview.
  if (!userId) return false;

  // Check entity membership for this tenant (any role grants preview access).
  const memberRes = await fetch(
    `${supabaseUrl}/rest/v1/entity_members?entity_id=eq.${encodeURIComponent(site.tenant_id)}&user_id=eq.${encodeURIComponent(userId)}&select=role&limit=1`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      cache: "no-store",
    }
  );

  if (memberRes.ok) {
    const members = (await memberRes.json()) as Array<{ role: string }>;
    if (members.length > 0) return true; // Any entity role grants draft preview.
  }

  // Fall back to platform-admin check (same helper as other gates).
  return isAuthorizedAdmin(userId);
}

// ---------------------------------------------------------------------------
// Ticketmaster existence-check helper — lightweight fetch without next/cache.
// ---------------------------------------------------------------------------
async function checkTicketmasterAccess(id: string): Promise<boolean> {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) return false;
  try {
    const params = new URLSearchParams({ apikey: apiKey });
    const response = await fetch(
      `https://app.ticketmaster.com/discovery/v2/events/${encodeURIComponent(id)}.json?${params.toString()}`,
      { cache: "no-store" }
    );
    if (response.status === 404) return false;
    return true;
  } catch {
    return true;
  }
}

/**
 * Redirect that also ends the session.
 *
 * A blocked account still holds a perfectly valid token — being suspended or
 * purged does not invalidate it, because enforcement lives here rather than in
 * the database. Redirecting such a user to /login therefore hit the
 * "already-authenticated users are bounced off /login" rule below and dumped
 * them on the homepage, so the ?suspended=1 / ?deleted=1 notices were never
 * reachable. Confirmed live: a purged account hitting /dashboard/settings
 * landed on "/" with no explanation.
 *
 * Clearing the session removes the conflict at its source rather than
 * special-casing around it — once the cookies are gone the user genuinely is
 * unauthenticated, so the bounce correctly does not apply and /login renders.
 * It is also the right outcome on its own terms: a purged or suspended account
 * should not keep a live session.
 *
 * Cookies must be deleted on the REDIRECT response. `res` further down is a
 * separate NextResponse.next() that these redirects never return, so anything
 * written there is discarded — that subtlety is what made the first fix
 * attempt silently do nothing.
 */
function redirectAndSignOut(
  req: NextRequest,
  pathname: string,
  notice: [string, string]
) {
  const url = req.nextUrl.clone();
  const {locale: reqPathLocale} = getLocaleFromPath(req.nextUrl.pathname);
  const localePrefix = reqPathLocale ? `/${reqPathLocale}` : '';
  url.pathname = `${localePrefix}${pathname}`;
  url.search = "";
  url.searchParams.set(notice[0], notice[1]);

  const response = NextResponse.redirect(url);

  // Supabase SSR stores the session across `sb-<ref>-auth-token` and, once the
  // token is large enough, numbered chunks of it. Clearing by prefix covers
  // every chunk without hardcoding the project ref.
  for (const cookie of req.cookies.getAll()) {
    if (cookie.name.startsWith("sb-")) {
      response.cookies.delete(cookie.name);
    }
  }

  return response;
}

export async function proxy(req: NextRequest) {
  // ---- Locale resolution (path prefix > cookie > Accept-Language > default) ----
  const rawPathname = req.nextUrl.pathname;
  const {locale: pathLocale, stripped: strippedPath} = getLocaleFromPath(rawPathname);
  const cookieLocale = req.cookies.get(LOCALE_COOKIE)?.value ?? null;
  const acceptLang = req.headers.get('accept-language');
  const inferredLocale: SupportedLocale = pathLocale ?? (isSupportedLocale(cookieLocale) ? cookieLocale as SupportedLocale : localeFromAcceptLanguage(acceptLang));
  const effectiveLocale: SupportedLocale = inferredLocale;

  // For routing/logic we use the stripped path (so /en/dashboard -> /dashboard)
  const pathname = strippedPath;
  const hasLocalePrefix = pathLocale !== null;

  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/create-event") ||
    pathname.startsWith("/create-fundraiser") ||
    pathname.startsWith("/create-organizer");
  const isAdminPath = pathname.startsWith("/admin");

  // Response object that Supabase can attach refreshed cookies to.
  // If the request had a locale prefix, rewrite internally to the stripped path
  // so App Router resolves /en/dashboard -> /dashboard file.
  // Propagate locale via request header so app/layout can read via headers().
  const localeRequestHeaders = new Headers(req.headers);
  localeRequestHeaders.set(LOCALE_HEADER, effectiveLocale);
  let res: NextResponse;
  if (hasLocalePrefix) {
    const rewriteUrl = req.nextUrl.clone();
    rewriteUrl.pathname = pathname;
    res = NextResponse.rewrite(rewriteUrl, { request: { headers: localeRequestHeaders } });
  } else {
    res = NextResponse.next({ request: { headers: localeRequestHeaders } });
  }

  // Also set on response for debugging/client
  res.headers.set(LOCALE_HEADER, effectiveLocale);
  // If path had locale prefix, persist it; otherwise if no cookie yet, set inferred locale
  const existingCookie = req.cookies.get(LOCALE_COOKIE)?.value;
  if (hasLocalePrefix) {
    if (existingCookie !== effectiveLocale) {
      res.cookies.set(LOCALE_COOKIE, effectiveLocale, { path: '/', maxAge: 31536000, sameSite: 'lax' });
    }
  } else if (!existingCookie) {
    // First visit without explicit cookie — persist negotiation result
    res.cookies.set(LOCALE_COOKIE, effectiveLocale, { path: '/', maxAge: 31536000, sameSite: 'lax' });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },

        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // getUser() validates the JWT and refreshes tokens when needed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protected routes require authentication.
  if (isProtected && !user) {
    const loginUrl = req.nextUrl.clone();

    loginUrl.pathname = hasLocalePrefix ? `/${effectiveLocale}/login` : "/login";
    // Preserve original full path (with locale prefix if present) as redirect param
    loginUrl.searchParams.set("redirect", rawPathname + req.nextUrl.search);

    return NextResponse.redirect(loginUrl);
  }

  // Redirect already-authenticated users away from login/signup.
  if ((pathname === "/login" || pathname === "/signup") && user) {
    const homeUrl = req.nextUrl.clone();
    homeUrl.pathname = hasLocalePrefix ? `/${effectiveLocale}/` : "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  // Block suspended accounts from protected areas. Also fetches `role` here
  // (same query, no extra round-trip) so admin paths can be gated below.
  let isVerifiedAdmin = false;

  if (isProtected && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("status, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.status === "suspended") {
      return redirectAndSignOut(req, "/login", ["suspended", "1"]);
    }

    /**
     * Accounts in the deletion lifecycle.
     *
     * `purged` is the terminal state: the grace period elapsed, so there is no
     * way back and the account must behave as gone. The row and its data are
     * retained for fraud and dispute investigation, so nothing about that is
     * enforced in the database — this check IS the enforcement. Without it a
     * purged user could still sign in and use the dashboard normally.
     *
     * `pending_deletion` is bounced too, but to the recovery page rather than a
     * dead end: they are inside the 14-day window and self-cancelling is the
     * whole point of it.
     */
    if (profile?.status === "purged") {
      return redirectAndSignOut(req, "/login", ["deleted", "1"]);
    }

    if (profile?.status === "pending_deletion") {
      const recoverUrl = req.nextUrl.clone();

      recoverUrl.pathname = "/recover-account";
      recoverUrl.search = "";

      return NextResponse.redirect(recoverUrl);
    }


    if (isAdminPath) {
      if (profile?.role !== "admin") {
        const homeUrl = req.nextUrl.clone();
        homeUrl.pathname = "/";
        homeUrl.search = "";
        return NextResponse.redirect(homeUrl);
      }
      isVerifiedAdmin = true;
    }
  }

  // -------------------------------------------------------------------------
  // Article access-control gate.
  // Per Next.js 16 loading.md § "Status Codes": when a page streams, the 200
  // header is flushed before notFound() can change it. The proxy is the only
  // place where we can reliably return an HTTP 404 before streaming begins.
  // -------------------------------------------------------------------------
  const articleSlugMatch = pathname.match(/^\/articles\/([^/]+)$/);
  if (articleSlugMatch) {
    const slug = articleSlugMatch[1];
    // Skip the gate for known sub-section prefixes that share the pattern
    // but are handled by their own pages (category/tag are caught by the
    // matcher only if they happen to match, which they won't due to the
    // nested path — kept here as a safety belt).
    if (slug !== "category" && slug !== "tag") {
      const allowed = await checkArticleAccess(slug, user?.id ?? null);
      if (!allowed) {
        // Rewrite to the internal not-found route with an explicit 404 status.
        // Next.js renders app/not-found.tsx for /_not-found internally.
        const notFoundUrl = req.nextUrl.clone();
        notFoundUrl.pathname = "/_not-found";
        return NextResponse.rewrite(notFoundUrl, { status: 404 });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Business access-control gate. Same streaming/status-code constraint as
  // the article gate above.
  // -------------------------------------------------------------------------
  const businessSlugMatch = pathname.match(/^\/businesses\/([^/]+)$/);
  if (businessSlugMatch) {
    const slug = businessSlugMatch[1];
    const allowed = await checkBusinessAccess(slug, user?.id ?? null);
    if (!allowed) {
      const notFoundUrl = req.nextUrl.clone();
      notFoundUrl.pathname = "/_not-found";
      return NextResponse.rewrite(notFoundUrl, { status: 404 });
    }
  }

  // -------------------------------------------------------------------------
  // Product access-control gate. Same streaming/status-code constraint as
  // the article gate above. "order-confirmation" and "library" are real
  // sibling pages (app/products/order-confirmation, app/products/library),
  // not product slugs — excluded so the gate doesn't 404 them.
  // -------------------------------------------------------------------------
  const productSlugMatch = pathname.match(/^\/products\/([^/]+)$/);
  if (productSlugMatch) {
    const slug = productSlugMatch[1];
    if (slug !== "order-confirmation" && slug !== "library") {
      const allowed = await checkProductAccess(slug, user?.id ?? null);
      if (!allowed) {
        const notFoundUrl = req.nextUrl.clone();
        notFoundUrl.pathname = "/_not-found";
        return NextResponse.rewrite(notFoundUrl, { status: 404 });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Ticketmaster external-event existence gate.
  // Same streaming/status-code constraint as the article gate above. The page
  // also awaits isAdmin()/getDashboardContext() alongside the Ticketmaster
  // fetch, which triggers Next's dynamic rendering early enough that by the
  // time notFound() fires for a genuinely nonexistent event, the response has
  // already started streaming with a 200 — confirmed via a real request that
  // came back 200 with "NEXT_HTTP_ERROR_FALLBACK;404" buried in the payload
  // instead of an actual 404. getCachedTicketmasterEvent is the same
  // unstable_cache instance the page itself calls (proxy defaults to the
  // Node.js runtime in this Next version, so the Data Cache is genuinely
  // shared) — whichever of the two runs first for a given id is the only one
  // that hits Ticketmaster within the 5-minute window.
  // -------------------------------------------------------------------------
  const ticketmasterIdMatch = pathname.match(/^\/external-events\/ticketmaster\/([^/]+)$/);
  if (ticketmasterIdMatch) {
    const allowed = await checkTicketmasterAccess(ticketmasterIdMatch[1]);
    if (!allowed) {
      const notFoundUrl = req.nextUrl.clone();
      notFoundUrl.pathname = "/_not-found";
      return NextResponse.rewrite(notFoundUrl, { status: 404 });
    }
  }

  // -------------------------------------------------------------------------
  // Tenant website access-control gate.
  //
  // Matches /site/<slug> and /site/<slug>/<any-subpage>. The slug is the first
  // segment only — subpages resolve inside the catch-all page component.
  //
  // Same streaming/status-code constraint as the article gate above: if a
  // draft-site page starts rendering and notFound() fires after the 200 header
  // is flushed, the status cannot be changed retroactively. This pre-stream
  // check is the only reliable path to a real HTTP 404 for unlisted sites.
  //
  // Draft/archived sites are allowed through for authenticated entity members
  // (any role) and platform admins to support preview workflows.
  // -------------------------------------------------------------------------
  const websiteSlugMatch = pathname.match(/^\/site\/([^/]+)(?:\/.*)?$/);
  if (websiteSlugMatch) {
    const slug = websiteSlugMatch[1];
    const allowed = await checkWebsiteAccess(slug, user?.id ?? null);
    if (!allowed) {
      const notFoundUrl = req.nextUrl.clone();
      notFoundUrl.pathname = "/_not-found";
      return NextResponse.rewrite(notFoundUrl, { status: 404 });
    }
  }

  // Admin role already verified above — mark the forwarded request so
  // app/admin/layout.tsx can skip its own redundant Supabase round-trip on
  // the common path. requireAdmin() still runs in full as a fallback if this
  // header is ever absent, preserving defense-in-depth.
  if (isVerifiedAdmin) {
    const requestHeaders = new Headers(req.headers);
    // Propagate locale header to downstream layout
    requestHeaders.set(LOCALE_HEADER, effectiveLocale);
    // Actively drop any client-supplied header first: only the value set
    // fresh below (after the role check above) may survive. Without this, a
    // future refactor that sets the header conditionally could let a spoofed
    // incoming value pass through untouched.
    requestHeaders.delete("x-admin-verified");
    requestHeaders.set("x-admin-verified", "1");
    let verifiedRes: NextResponse;
    if (hasLocalePrefix) {
      const rewriteUrl = req.nextUrl.clone();
      rewriteUrl.pathname = pathname;
      verifiedRes = NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } });
    } else {
      verifiedRes = NextResponse.next({ request: { headers: requestHeaders } });
    }
    // Propagate locale header
    verifiedRes.headers.set(LOCALE_HEADER, effectiveLocale);
    for (const cookie of res.cookies.getAll()) {
      verifiedRes.cookies.set(cookie);
    }
    return verifiedRes;
  }

  return res;
}

export const config = {
  matcher: [
    "/",
    "/en",
    "/fr",
    "/en/:path*",
    "/fr/:path*",
    "/dashboard/:path*",
    "/admin/:path*",
    "/my-tickets",
    "/create-event/:path*",
    "/create-fundraiser/:path*",
    "/create-organizer/:path*",
    "/login",
    "/signup",
    // Article detail pages — must be in matcher for the access gate to fire.
    // Excluded: /articles (list), /articles/category/:cat, /articles/tag/:tag.
    "/articles/:slug([^/]+)",
    // Business detail pages — same reason. Excluded: /businesses (list).
    "/businesses/:slug([^/]+)",
    // Product detail pages — same reason. Excluded: /products (list),
    // /products/order-confirmation + /products/library (real sibling pages,
    // not slugs — the gate itself skips them, see above).
    "/products/:slug([^/]+)",
    // Ticketmaster external-event detail pages — same reason.
    "/external-events/ticketmaster/:id",
    // Tenant public website pages — access gate must run before streaming
    // begins so draft/archived sites return a real HTTP 404 to anonymous
    // visitors. Matches /site/<slug> and /site/<slug>/<any-subpage>.
    "/site/:path*",
    // Memories guest upload pages (/m/[token]) — standalone chrome-free
    // experience like /invitation/*; locale handling must still run.
    "/m/:path*",
    // Fallback for any other page to ensure locale handling runs
    "/((?!api|_next|_vercel|_proxy|.*\\..*).*)",
  ],
};