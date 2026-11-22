# 09 — Bugs Found (NOT FIXED)

Severity: **S1** broken/incorrect data or misleading state · **S2** wrong module/wrong content · **S3** UX/visual.
Every item was observed in code. Nothing in this audit changed any file except these reports.

---

### BUG-01 — Commerce modules render for non-commerce businesses (S2)
**Evidence:** `lib/overview-resolver.ts:132-140` — `isCommerceOrg = hasBusiness && (can_have_menu || can_have_products || can_have_services || can_have_vehicles || features.ordering || activity)`. `TodayStrip` then renders "Orders placed today", "Orders value today", "Open for orders" (`TodayStrip.tsx:52-95`).
**Effect:** a clinic (`SERVICES`), cleaning company (`SERVICES`), boutique (`PRODUCTS`), car rental (`VEHICLES`) and nonprofit (`DONATIONS`) all get an order-centric Today strip with zeros. This is the "restaurant modules on a clinic / clothing store" observation.
**Note:** "Add dish" specifically requires `MENU` (`:327-343`), so it should not appear for a clinic **unless** the org has a linked restaurant business (capability union, BUG-04) or the business row carries a restaurant `business_type`. Exact reproduction data **UNKNOWN** (no DB).

### BUG-02 — "Open for orders" while hours are unconfigured (S1)
**Evidence:** `app/dashboard/org/[id]/overview/page.tsx:403-404` (`isOpen = true; hoursBadgeText = "Hours not configured"`), `TodayStrip.tsx:88-95` renders `isOpen ? "Open for orders" : "Currently closed"`.
**Effect:** every new business advertises "Open for orders" 24/7 on its own dashboard. Also applies when hours are saved but unpublished (`:411-413` sets only the badge text).

### BUG-03 — Primary business is arbitrary (S1)
**Evidence:** `app/dashboard/org/[id]/overview/page.tsx:105-108` `primaryBusiness = eligibleBusinesses[0]`; the `businesses` query at `:64-78` has no `.order()`.
**Effect:** capabilities, offerings, logo, hours source, approval state and quick actions for the whole workspace come from whichever row the DB returns first.

### BUG-04 — Capability union leaks modules across businesses (S2)
**Evidence:** `lib/org-dashboard-modules.ts:196-214` unions capabilities across **all** eligible businesses; `OrgDashboardSidebar` then also injects Kitchen/Tables (`org-nav-items.ts:30`, `OrgDashboardSidebar.tsx:61`) on `MENU` from any one business.
**Effect:** an org with a restaurant + a clinic shows Menu, Orders, Kitchen, Tables & QR in the clinic's shared workspace, and `primaryBusiness` may be the clinic — so the counters and the nav disagree.

### BUG-05 — Mobile sticky headers are 8px low (S3)
**Evidence:** `components/Navbar.tsx:116` (`h-14 … sm:h-16`) vs `ManagementShell.tsx:57`, `MobileGlobalNav.tsx:13`, `OrgMobileHeader.tsx:43` (all `sticky top-16`).
**Effect:** below 640px the sub-header floats 8px below the navbar; page content is visible in the gap while scrolling.

### BUG-06 — Safe-area padding is inert on iOS (S2)
**Evidence:** 27 `env(safe-area-inset-bottom)` usages (`evidence/safe-area-usage.txt`) but no `viewportFit` anywhere (`grep -rn viewportFit` → none); `app/layout.tsx:14-19` and `app/[locale]/layout.tsx:24-29` define only width/scale/themeColor.
**Effect:** bottom bars sit on the home indicator; the reserved padding is 0.

### BUG-07 — Pinch-zoom disabled (S2, accessibility)
**Evidence:** `maximumScale: 1` in both root viewports (`app/layout.tsx:18`, `app/[locale]/layout.tsx:28`).
**Effect:** WCAG 1.4.4 failure on every route, including the dashboards this project calls mobile-first.

### BUG-08 — Fundraiser dates/currency are faked (S1)
**Evidence:** `daysRemaining = 30` constant (`app/dashboard/fundraisers/[id]/overview/page.tsx:120`), rendered as "Days Left" (`:230-235`); goal printed with literal `$` (`:187`) against `formatMoney` everywhere else (`:172`); insight strings hardcode USD (`lib/fundraiser-dashboard.ts:75-77`).
**Effect:** every campaign shows 30 days left forever; XOF/XAF campaigns show `$` next to `FCFA`; insights contradict the KPIs.

### BUG-09 — Health score can never exceed 65 from pace (S1)
**Evidence:** `lib/fundraiser-dashboard.ts:29-34` — `clamp(0,100, round(paceRatio*65))`.
**Effect:** hitting the required pace exactly scores 65/100 and renders a "Slightly Behind"-coloured experience; the remaining 35 points are unreachable except via `completed`.

### BUG-10 — Raw enums shown to users (S2)
**Evidence:** fundraiser `:187` `{statusRaw}` and `:185` `{category}`; event `:31` `{event.status}`; `RecentOrdersWidget.tsx:70` `{order.fulfilmentType}` (`pickup`/`delivery`), `:88` `{order.status}`; `businesses/[id]/orders/page.tsx:78` `{ord.payment_status}`; `TodayStrip.tsx:43` prints the IANA zone `Africa/Abidjan`.
**Effect:** "dine_in", "pickup", "approved", "out_for_delivery" appear untranslated/unlabelled in the product UI.

### BUG-11 — Order status styling does not match the schema (S2, needs DB confirm)
**Evidence:** `RecentOrdersWidget.tsx:10-20` styles `out_for_delivery` and `delivered`; `db/migration_171_orders.sql:47-48` constrains `status` to `pending, accepted, preparing, ready, completed, cancelled` and `payment_status` to `unpaid, paid, refunded`. `app/dashboard/org/[id]/orders/page.tsx` selects `dine_in_confirmation`, `dine_in_declined_reason`, `rider_*` columns not present in 171.
**Effect:** either later migrations widen the enum (not verifiable without a DB) or those statuses can never occur and the badges are dead code. **UNKNOWN which** — Stage 2 must check the live catalog.

### BUG-12 — Business analytics/reviews pages are placeholders (S2)
**Evidence:** `app/dashboard/businesses/[id]/analytics/page.tsx` and `.../reviews/page.tsx` are 8-line files printing `Business analytics for {id.slice(0,8)}` / `Reviews for business {id.slice(0,8)}` with no data and no empty state.
**Effect:** reachable from the business shell nav (`lib/business-dashboard-modules.ts` modules `analytics`, `reviews` have no `routeExists:false`) and look broken.

### BUG-13 — Two mobile nav components are dead, with a false comment (S2)
**Evidence:** `app/dashboard/DashboardMobileNav.tsx` and `app/dashboard/org/[id]/OrgMobileNav.tsx` are imported by nothing (`grep` shows only their own definitions/comments). `OrgMobileNav.tsx:20-22` claims "the org content wrapper reserves 69px for it (see ./layout.tsx)" — `app/dashboard/org/[id]/layout.tsx:160` reserves nothing.
**Effect:** the intended bottom navigation does not exist; re-enabling it as-is hides the last card behind the bar.

### BUG-14 — Overview can link to a page its own nav hides (S2)
**Evidence:** `lib/overview-resolver.ts:155,169` always build `/dashboard/org/{id}/orders?tab=needs_attention` when counts > 0; `lib/org-dashboard-modules.ts:157-161` hides the Orders nav unless the `online_ordering` offering is selected.
**Effect:** attention CTA exists with no corresponding nav item (reachable but undiscoverable), and vice versa for reservations (`:79` vs `:175-196`).

### BUG-15 — "Upcoming tables today" can drop today's reservations (S3, correctness risk)
**Evidence:** `app/dashboard/org/[id]/overview/page.tsx:272-285` queries `.gte('starts_at', startOfTodayIso)` **without an upper bound**, `.limit(200)`, then filters with `isTodayInTimezone`.
**Effect:** a tenant with 200+ future reservations sees 0 upcoming tables today.

### BUG-16 — Refunded orders count as sales (S2)
**Evidence:** `app/dashboard/org/[id]/overview/page.tsx:196-207` adds every non-cancelled today order to `salesTodayTotal` regardless of `payment_status` (only `paid` vs "to collect" splits). `db/migration_171_orders.sql:49` allows `payment_status='refunded'`.
**Effect:** refunded revenue inflates "Orders value today" and "paid" totals.

### BUG-17 — `finance` role has no distinct view (S3)
**Evidence:** `lib/entity-auth.ts:21-28` defines `ENTITY_ROLES_FINANCE_VIEW` and states it is not consumed; the overview admits `finance` to the same widgets as `viewer` (`app/dashboard/org/[id]/overview/page.tsx:33-40`).

### BUG-18 — Fundraiser quick actions include duplicates and disabled promises (S3)
**Evidence:** `components/fundraisers/FundraiserQuickActions.client.tsx` — "Share Campaign" (`:61-68`) and "Copy Link" (`:88-96`) both call `handleShare`; "Email Donors" (`:76-82`), "Invite Team" (`:99-105`), "Boost Campaign" (`:106-112`) are `disabled` + "Coming soon".
**Effect:** 6 tiles, 2 effective actions.

### BUG-19 — Same destinations appear in nav and page actions (S3)
**Evidence:** event overview Scan card (`:37`) vs "Door Scanner" tab (`lib/event-dashboard-navigation.ts:49-55`); Quick actions Team/Seating/Operations (`:45-49`) vs the same tabs (`:59-64,100-115`). Personal dashboard repeats Check-Ins/Scan/Team per event (`DashboardView.tsx:238-260`).

### BUG-20 — Cookie banner covers the profile bottom nav (S3)
**Evidence:** `components/CookieConsent.tsx:59` `fixed bottom-0 … z-50` vs `ProfileClient.tsx:725` `fixed bottom-0 … z-40`.
**Effect:** the consent banner is the top-most bottom bar until dismissed.

### BUG-21 — Site-nav panel outranks the workspace drawer (S3, needs repro)
**Evidence:** `components/nav/HomeAdaptiveNav.tsx:172` `z-[200]`; `components/nav/MobileDrawer.tsx:41` `z-[100]`.
**Effect:** if the site nav panel is open, it paints above the hamburger drawer. **INFERRED** cause of "drawer opens beneath content"; browser repro required before changing.

### BUG-22 — Fundraiser "Total Raised" hardcodes `$` in the org overview (S3)
**Evidence:** `components/dashboard/overview/EventMetricsWidget.tsx:104` `${metrics.totalRaised.toLocaleString(...)}`.
**Effect:** same currency bug as BUG-08 on the org dashboard, with no currency prop at all.

### BUG-23 — Double gutter on the org overview (S3)
**Evidence:** `app/dashboard/org/[id]/layout.tsx:160` `px-4`, then `OverviewShell.tsx:38` `mx-auto max-w-7xl … p-4`.
**Effect:** 32px per side at 360px width (≈18% of the viewport), pushing the "compact two-column" grid narrower than necessary.

### BUG-24 — `fulfilment_type` is invented when missing (S3)
**Evidence:** `app/dashboard/org/[id]/overview/page.tsx:222` `fulfilmentType: o.fulfilment_type || "pickup"`.
**Effect:** an order with no fulfilment type displays "pickup" as fact.

### BUG-25 — `Admin`-only styling leaks into overview cards (S3, design-system)
**Evidence:** `shadow-xs` on buttons/cards in `QuickActions.tsx:89,105`, `OverviewShell.tsx:52`, `SetupChecklist.tsx:81`; `orange-*` tokens in the org overview vs `brand-*` in the fundraiser page vs `--primary` unused.
**Effect:** violates AGENTS.md "No default shadow on buttons, sections, or cards" and splits the accent token.

### BUG-26 — `DashboardView.tsx` hardcodes USD and appears unused (S3)
**Evidence:** `app/dashboard/DashboardView.tsx:99-101,105` `Intl.NumberFormat(locale, { style:'currency', currency:'USD' })`; `app/dashboard/page.tsx` renders `MyThingsView` instead.
**Effect:** dead but maintained code with the currency bug baked in (a future reuse would reintroduce it).

### BUG-27 — Events overview shows no ticket/check-in value (S2, gap)
**Evidence:** event overview counts `guests` and `tickets` rows (`:22-27`) and nothing else; `ticket_orders`, `ticket_checkins` exist (`staging_schema.sql` table list) but are unused on that page.
**Effect:** the event "overview" cannot answer "how many checked in / how much sold".
