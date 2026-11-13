# Stage 1 — Dashboard Overview & Mobile Nav Audit — Summary

**Status:** READ-ONLY audit complete. No source, migration, config, or database row was modified.
**Date:** 2026-11-08
**Evidence rule:** every claim in this report set is tagged **CONFIRMED** (seen in code/migration/schema dump),
**INFERRED** (reasoned, source named), or **UNKNOWN** (not determinable in this environment).

## Environment / in-flight work

| Item | Value | Evidence |
|---|---|---|
| Branch | `chore/remove-all-invitation-templates` | `git rev-parse --abbrev-ref HEAD` |
| Uncommitted work | 10 untracked entries (16 files): migrations 215/216/220 + rollbacks, their `supabase/migrations` mirrors, `.vscode/`, `docs/minimalism-dark-blue/` screenshots | `git status --short` |
| Last commit | `303ed15ed chore(invitations): remove all invitation templates, cards and pickers; neutral guest fallback` | `git log --oneline -10` |
| Prior CLs | `73786a362 fix(scan)`, `b1e099621 wip: general booking…`, `d816cc731 feat(reservations): redesign Reserve form`, Phase 3/4 scanner work | same |
| Live DB | **Not available.** No read-only connection is configured (`.vscode/mcp.json` contains only a placeholder Unsplash MCP server). Schema evidence is taken from `prod_schema.sql`, `staging_schema.sql`, and `db/migration_*.sql`. No PII was read or printed. | `.vscode/mcp.json`, `ls` |
| Browser automation | **Not available.** Playwright is not installed (`node_modules/.bin` has no `playwright`) and no staging URL is defined. §07 is static analysis only. | `ls node_modules/.bin` |

## The 10 most important findings

1. **One overview implementation is real; the rest are not peers.** The organizer workspace
   (`app/dashboard/org/[id]/overview/page.tsx`, 518 lines → `lib/overview-resolver.ts` → 8 widgets) is the only
   capability-driven overview. The event overview is a 79-line three-card page, the business overview is a
   redirect stub, and the legacy `organizations/[slug]` overview is a redirect. **CONFIRMED**

2. **"Restaurant modules on a clinic / clothing store" is real, and the cause is `isCommerceOrg`.** The Today
   strip is shown for *any* business with `can_have_menu`, `can_have_products`, **`can_have_services`**,
   `can_have_vehicles`, or ordering activity. A clinic has `SERVICES`; a boutique has `PRODUCTS`. Both therefore
   get "Orders value today", "Open for orders" and order-centric copy. `lib/overview-resolver.ts:132-140`,
   `components/dashboard/overview/TodayStrip.tsx:43-95`. **CONFIRMED**

3. **"Open for orders" contradicts unconfigured hours.** `app/dashboard/org/[id]/overview/page.tsx:403-404`
   defaults `isOpen = true` while the badge text is "Hours not configured"; `TodayStrip.tsx:90` prints
   "Open for orders" off that boolean. **CONFIRMED**

4. **The primary business is chosen by array order, not by the owner.** `eligibleBusinesses[0]` supplies
   capabilities, offerings, logo, industry and category for the whole workspace overview
   (`app/dashboard/org/[id]/overview/page.tsx:105-108`, `248-255`). For a multi-business org this silently
   picks an arbitrary one. **CONFIRMED**

5. **Capability rules are duplicated in three registries with different gates.** `lib/org-dashboard-modules.ts`
   (nav: offering-gated Orders/Reservations), `lib/business-dashboard-modules.ts` (business shell: route-gated,
   `routeExists:false` for several), `lib/overview-resolver.ts` (overview: capability-only quick actions).
   The same business can therefore get different modules on different surfaces. **CONFIRMED**

6. **Only 26 of the taxonomy's business types carry capabilities; everything else silently degrades to
   `CONTENT/GALLERY/CUSTOMERS/REVIEWS`** (`lib/business-taxonomy.ts:163-197` vs the much longer
   `BUSINESS_TYPES_BY_CATEGORY`). Unmapped verticals lose every commerce surface. **CONFIRMED**

7. **Mobile navigation is fragmented into three unrelated patterns and two dead components.**
   `DashboardMobileNav.tsx` and `OrgMobileNav.tsx` are **imported by nothing**. The workspace instead uses a
   hamburger drawer, the personal dashboard uses a second hamburger, and the only bottom bar with
   Home / Tickets / Dashboard / Explore is hard-coded inside the public profile page
   (`app/profile/[id]/ProfileClient.tsx:723-760`). **CONFIRMED**

8. **The mobile sticky headers are mis-offset by 8px.** The global navbar is `h-14` (56px) on mobile and `h-16`
   (64px) from `sm:` up (`components/Navbar.tsx:106,116`), but every mobile sub-header uses `sticky top-16`
   (`ManagementShell.tsx:57`, `MobileGlobalNav.tsx:13`, `OrgMobileHeader.tsx:43`). On phones the header floats
   8px below the navbar, leaving a scroll gap. **CONFIRMED**

9. **Safe-area padding is inert.** 27 `env(safe-area-inset-bottom)` usages exist, but neither root layout sets
   `viewportFit: "cover"` (`app/layout.tsx:14-19`, `app/[locale]/layout.tsx:24-29`), so the value is 0 on iOS.
   `maximumScale: 1` also blocks pinch-zoom. **CONFIRMED**

10. **The fundraising "quality reference" has hardcoded and non-data-backed elements that a shared system must
    not copy.** `daysRemaining = 30` is a constant (`app/dashboard/fundraisers/[id]/overview/page.tsx:120`),
    the goal is rendered with a literal `$` (`:187`) while raised amounts go through `formatMoney`, three KPI
    cards are permanent "Not tracked yet" placeholders (`:349-367`), and "Email Donors / Invite Team / Boost"
    are disabled `Coming soon` buttons (`components/fundraisers/FundraiserQuickActions.client.tsx:76-105`).
    **CONFIRMED**

## Top risks

- **R1 — Capability drift.** Adding a module to one of the three registries without the other two is the
  default failure mode of this design; there is no shared resolver for "what may this tenant see".
- **R2 — Multi-business orgs.** `[0]`-selection and capability *union* mean one restaurant permanently injects
  Menu/Orders/Kitchen into a clinic's workspace.
- **R3 — Reservation engine + branches are in flight** (migrations 215/216/218/220 uncommitted; `business_branches`
  exists, `fleet`/`bookings` nav reserved). A nav/overview rewrite can collide with `reservations` route naming,
  `booking_type` (`table|rental|appointment`) semantics, and branch scoping.
- **R4 — No live DB verification.** Migration 185/186/220 states are owner-reported only; every runtime column
  claim is from `.sql` files, not a live catalog.
- **R5 — Mobile is the stated priority but has no measurement harness.** No Playwright, no staging target, no
  viewport regression test. Any mobile redesign ships unmeasured.

## What blocks Stage 2

1. A decision on the **single source of truth** for capabilities → modules (one registry vs three).
2. A decision on **multi-business scoping** (`[0]` primary vs explicit selected business vs branch).
3. A decision on **bookings vs reservations** (`booking_type=appointment` rows vs a future bookings table).
4. Confirmation that **`/dashboard/businesses/[id]/*` shells stay** or are retired in favour of the org workspace.
5. A **staging URL / read-only DB** for the measurements and data-shape verification Stage 2 needs.

Open questions are enumerated in `11-open-questions.md`; defects are in `09-bugs-found.md` and are **not fixed**.
