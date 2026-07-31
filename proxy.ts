/**
 * proxy.ts
 *
 * Global Supabase SSR proxy for:
 * - Session refresh on every request
 * - Protected route enforcement
 * - Suspended account blocking
 * - Article access-control gate (returns real HTTP 404 before streaming starts,
 *   per Next.js 16 loading.md § Status Codes which states that notFound() cannot
 *   change the status once streaming has begun with a 200 header)
 * - Ticketmaster external-event existence gate (same reason — see below)
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

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/create-event") ||
    pathname.startsWith("/create-fundraiser") ||
    pathname.startsWith("/create-organizer");

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

  // Block suspended accounts from protected areas.
  if (isProtected && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.status === "suspended") {
      const loginUrl = req.nextUrl.clone();

      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("suspended", "1");

      return NextResponse.redirect(loginUrl);
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
    // Ticketmaster external-event detail pages — same reason.
    "/external-events/ticketmaster/:id",
  ],
};