# 11 — Open Questions (owner decisions required before Stage 2)

Each question blocks a concrete design/build choice. Recommended default in italics; the default is a proposal,
not a decision.

## Q1. Single source of truth for capability → modules?
Three registries currently decide different things (`lib/org-dashboard-modules.ts`,
`lib/business-dashboard-modules.ts`, `lib/overview-resolver.ts`). Should Stage 2 collapse them into one
`capability → module` registry with per-surface filters?
*Default: yes — one registry, three thin adapters (nav, shell, overview).*
**Blocks:** any module table (report `10`), nav consolidation, test rewrites.

## Q2. Multi-business organizations: one primary business or many?
`primaryBusiness = businesses[0]` (`overview page.tsx:105-108`). Is the workspace scoped to one business
(selected explicitly), or should the overview aggregate across all linked businesses?
*Default: explicit selector with a persisted default; aggregate only at the org level.*
**Blocks:** every KPI, hours badge, approval state, and nav module on the org overview; branch work.

## Q3. Do branches become a first-class dimension now?
`business_branches` exists and is being worked on, but the overview has no branch concept and all counts are
`organizer_id`-scoped. Should Stage 2 scope metrics by branch?
*Default: no — ship capability-driven single-business first, leave a branch slot.*
**Blocks:** KPI definitions, "Today" queries, reservations/orders counts.

## Q4. Bookings: separate domain or `reservations.booking_type='appointment'`?
There is no bookings table; appointments ride on reservations, and "general booking" is in-flight. Which model
should the booking dashboard read?
*Default: keep reservations as the single source and treat `booking_type` as the discriminator until a bookings
table ships.*
**Blocks:** clinic/salon/cleaning dashboards, staff availability module.

## Q5. Is `bookings` + `fleet` nav to be enabled, stubbed, or removed?
Both are defined with `routeExists:false` (`lib/org-dashboard-modules.ts:80-81`) and never render. A clinic's core
workflow (appointments) and a rental's core workflow (fleet) currently have **no nav entry at all**.
*Default: enable Bookings (reservations-backed), keep Fleet hidden until a vehicles table exists.*
**Blocks:** category coverage; "every section reachable on mobile".

## Q6. What is the canonical status vocabulary, and who owns the label map?
Order statuses are constrained in migration 171 (`pending…cancelled`) but the UI styles `out_for_delivery` and
`delivered`; reservation statuses (`pending…no_show`) have no label map. Later migrations may have widened the
enum (unverifiable offline).
*Default: one shared `status → {label, tone}` map per domain, generated from the live constraint.*
**Blocks:** status chips, attention copy, any localization of statuses.

## Q7. Does "revenue" mean gross, collected, or net?
`orders.total_amount` + `payment_status` allows gross and collected; refunded orders still count as sales today;
there is no expenses table, so profit is impossible.
*Default: show collected and outstanding separately; never show "profit".*
**Blocks:** every KPI naming decision, payout alignment.

## Q8. Period selector semantics: site timezone or viewer timezone?
"Today" is server-side in `tenant_websites.metadata.timezone`; fundraiser "today" is UTC. Should all periods use
the site timezone everywhere (including donations), and should the selector offer Today / 7d / 30d / custom?
*Default: site timezone everywhere; Today / 7 / 30 / this month.*
**Blocks:** `05` formulas, `03` indexes, and any KPI that says "today".

## Q9. Mobile navigation: what are the four fixed items?
The design direction says one bottom bar of 4 + More. Candidates: Home (personal), Overview (current workspace),
Live ops (orders/reservations), Catalog, Insights. The current shells differ per entity and
`DashboardLayoutClient` returns bare children for all entity routes.
*Default: Home · Overview · Live ops · Catalog · More (contextual per workspace).*
**Blocks:** all of §G, the sticky-offset and safe-area fixes, and where the bar mounts.

## Q10. Are the dead bottom-nav components the starting point or to be deleted?
`DashboardMobileNav` and `OrgMobileNav` are unused and one carries a false padding comment. Reuse or replace?
*Default: replace with one shared bar; delete both.*
**Blocks:** implementation size for Stage 3.

## Q11. Dark mode: fix or remove for dashboards?
`DESIGN.md:210` says "either it works properly or it is removed"; the overview relies on a global utility rewrite
and fundraising is explicitly excluded.
*Default: keep dark mode out of scope for the overview redesign, and do not claim it works.*
**Blocks:** token work, component styling, visual QA.

## Q12. i18n: translate the overviews now or after the redesign?
All overview widgets are hardcoded English; org nav uses `label.toLowerCase()` lookups; `phase5-overview.test.cjs`
documents "i18n deferred to Phase 6".
*Default: design with keys from day one, translate EN/FR in the same change.*
**Blocks:** component API (strings vs keys), test expectations.

## Q13. What happens to `/dashboard/businesses/[id]/*`?
It redirects to the org overview when linked, and has placeholder analytics/reviews pages plus a real branches
page. Is the business shell kept as a standalone mode, or retired into the org workspace?
*Default: keep branches + edit; retire duplicate overview/orders (both redirect or duplicate org).*
**Blocks:** route map, nav consolidation, "one dashboard" claim.

## Q14. Fundraiser: add `end_date`, or keep a fixed 30-day model?
`daysRemaining = 30` is a constant because there is no end date. Health score, pace and projected finish all hinge
on it.
*Default: add `fundraisers.end_date` (migration) and make "days left" real before reusing the pattern elsewhere.*
**Blocks:** reusing the fundraiser model as the platform reference; campaign KPIs.

## Q15. Measurement environment for Stage 2
No staging URL, no Playwright, no read-only DB. §07 is arithmetic, not measurement.
*Default: provide a staging URL with seeded restaurant / clinic / boutique orgs and a read-only DB before Stage 2
sign-off.*
**Blocks:** every "mobile is the top priority" claim; verification of the hamburger stacking bug (BUG-21).
