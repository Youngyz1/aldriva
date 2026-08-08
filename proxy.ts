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
import { getCachedTicketmasterEvent } from "@/lib/ticketmaster-event";

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

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/create-event") ||
    pathname.startsWith("/create-fundraiser") ||
    pathname.startsWith("/create-organizer");
  const isAdminPath = pathname.startsWith("/admin");

  // Response object that Supabase can attach refreshed cookies to.
  const res = NextResponse.next();

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

    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);

    return NextResponse.redirect(loginUrl);
  }

  // Redirect already-authenticated users away from login/signup.
  if ((pathname === "/login" || pathname === "/signup") && user) {
    const homeUrl = req.nextUrl.clone();
    homeUrl.pathname = "/";
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
      const loginUrl = req.nextUrl.clone();

      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("suspended", "1");

      return NextResponse.redirect(loginUrl);
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
      const loginUrl = req.nextUrl.clone();

      loginUrl.pathname = "/login";
      loginUrl.search = "";
      loginUrl.searchParams.set("deleted", "1");

      return NextResponse.redirect(loginUrl);
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
  // the article gate above. "order-confirmation" is a real sibling page
  // (app/products/order-confirmation), not a product slug — excluded so the
  // gate doesn't 404 it.
  // -------------------------------------------------------------------------
  const productSlugMatch = pathname.match(/^\/products\/([^/]+)$/);
  if (productSlugMatch) {
    const slug = productSlugMatch[1];
    if (slug !== "order-confirmation") {
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
    const id = decodeURIComponent(ticketmasterIdMatch[1]);
    try {
      const result = await getCachedTicketmasterEvent(id);
      if (result.status === "not_found") {
        const notFoundUrl = req.nextUrl.clone();
        notFoundUrl.pathname = "/_not-found";
        return NextResponse.rewrite(notFoundUrl, { status: 404 });
      }
    } catch {
      // Transient Ticketmaster failure — let the page handle it (renders its
      // own "couldn't load, try again" state) rather than 404ing a possibly
      // real event.
    }
  }

  // Admin role already verified above — mark the forwarded request so
  // app/admin/layout.tsx can skip its own redundant Supabase round-trip on
  // the common path. requireAdmin() still runs in full as a fallback if this
  // header is ever absent, preserving defense-in-depth.
  if (isVerifiedAdmin) {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-admin-verified", "1");
    const verifiedRes = NextResponse.next({ request: { headers: requestHeaders } });
    for (const cookie of res.cookies.getAll()) {
      verifiedRes.cookies.set(cookie);
    }
    return verifiedRes;
  }

  return res;
}

export const config = {
  matcher: [
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
    // /products/order-confirmation (real sibling page, not a slug).
    "/products/:slug([^/]+)",
    // Ticketmaster external-event detail pages — same reason.
    "/external-events/ticketmaster/:id",
  ],
};