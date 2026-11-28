# 06 — Navigation Architecture (mobile priority)

## G1. Route groups and layouts

| Segment | Layout | Chrome |
|---|---|---|
| `/` (root) | `app/layout.tsx` | `Navbar` (gated by `ChromeGate`), **no footer by design** (`:79-84` comment) |
| `/[locale]/*` | `app/[locale]/layout.tsx` | `Navbar` + `IntlProvider`, no footer |
| `/dashboard/*` | `app/dashboard/layout.tsx` → `DashboardLayoutClient` | Two mutually exclusive shells, chosen **client-side by pathname regex** |
| `/dashboard/org/[id]/*` | `app/dashboard/org/[id]/layout.tsx` | `OrgDashboardSidebar` (desktop) + `OrgMobileHeader` (mobile) + `OrgApprovalBanner` |
| `/dashboard/events/[id]/*` | `app/dashboard/events/[id]/layout.tsx` | `ManagementShell` + `EventSwitcher` |
| `/dashboard/fundraisers/[id]/*` | `app/dashboard/fundraisers/[id]/layout.tsx` | `ManagementShell` + `FundraiserSwitcher` |
| `/dashboard/businesses/[id]/*` | `app/dashboard/businesses/[id]/layout.tsx` | `ManagementShell` (no switcher) |
| `/dashboard/settings/*` | `app/dashboard/settings/layout.tsx` | nested settings nav |
| `/courier`, `/kitchen` | none of their own | `Navbar` renders a brand-only header (`components/Navbar.tsx:89-101`) |
| public profile `/profile/[id]` | root | own bottom nav (`ProfileClient.tsx:723+`) |

**CONFIRMED** from file tree + read files.

### The shell switch is a client-side pathname regex

`app/dashboard/DashboardLayoutClient.tsx:37-44`:

```ts
const isOrgWorkspace = pathname?.startsWith("/dashboard/org/");
const isFundraiserManagement = !!pathname?.match(/^\/dashboard\/fundraisers\/[^/]+(\/.*)?$/);
const isEventManagement = !!pathname?.match(/^\/dashboard\/events\/[^/]+(\/.*)?$/);
const isBusinessManagement = !!pathname?.match(/^\/dashboard\/businesses\/[^/]+(\/.*)?$/);
...
if (isBuilder || isOrgWorkspace || isFundraiserManagement || isEventManagement || isBusinessManagement) return children only;
```

Consequences: the global `DashboardSidebar` and `MobileGlobalNav` are **not rendered at all** inside any entity
workspace; each workspace must supply its own chrome. `DashboardLayoutClient` also blocks render on an async
Supabase auth check with a module-level `_authedCache` (`:9-31`), so every cold dashboard navigation shows a
spinner before any chrome. **CONFIRMED**

## G2. Desktop sidebar definitions

| Sidebar | Items from | Capability-aware? |
|---|---|---|
| `app/dashboard/DashboardSidebar.tsx` | `app/dashboard/nav-items.ts` — **4 hardcoded items** (Overview, Analytics, Messages, Settings) | no |
| `app/dashboard/org/[id]/OrgDashboardSidebar.tsx` | `getOrgNavItems()` → `lib/org-dashboard-modules.ts`, then pushes **Kitchen** and **Tables & QR** manually | yes, but two items bypass the registry |
| `ManagementShell` | caller-supplied `navGroups` (`events/[id]/layout.tsx`, `fundraisers/[id]/layout.tsx`, `businesses/[id]/layout.tsx`) | events: role-filtered tabs; fundraisers: 7 hardcoded; businesses: capability modules |

**CONFIRMED.** Two sidebars add items outside the central registry:
`app/dashboard/org/[id]/org-nav-items.ts:30-32` (Kitchen) and
`app/dashboard/org/[id]/OrgDashboardSidebar.tsx:61-63` (Tables & QR), both keyed on `hasMenuRows || MENU`.

## G3. Mobile layers — what actually stacks

Measured from classes (no browser available; see `07`):

| Layer | Component | Height (mobile) | `sticky/fixed` | z |
|---|---|---|---|---|
| 1. Browser chrome | — | browser-owned | — | — |
| 2. Aldriva global header | `components/Navbar.tsx:106,116` | **56px** (`h-14`), 64px from `sm:` | `sticky top-0` | `z-50` |
| 3. Site nav pill ("Explore"-style) | `components/nav/HomeAdaptiveNav.tsx` | 36–40px inside the header | dropdown panel is `fixed top-[calc(3.5rem+8px)]` | panel `z-[200]` |
| 4. Workspace sub-header | `OrgMobileHeader.tsx:43` / `MobileGlobalNav.tsx:13` / `ManagementShell.tsx:57` | ~60px (`px-4 py-3` + 36px button) | `sticky top-16` (**64px — wrong for mobile**) | `z-30` |
| 5. Entity switcher strip | `ManagementShell.tsx:63` (`mobileHeaderSlot`) | ~44–52px | static | — |
| 6. Approval banner (org only) | `OrgApprovalBanner` | UNKNOWN (not read) | static | — |
| 7. Page content | varies | — | — | — |
| 8. Bottom bar | `DashboardMobileNav` / `OrgMobileNav` / `ProfileClient` nav | 48–56px + safe area | `fixed bottom-0` | `z-40` |

### 8px sticky offset bug — CONFIRMED

`ManagementShell.tsx:57`, `MobileGlobalNav.tsx:13`, `OrgMobileHeader.tsx:43` all use `sticky top-16`.
The navbar is `h-14` on mobile and only becomes `h-16` at `sm:` (`Navbar.tsx:116`). So below 640px the
sub-header sticks **8px too low**, leaving a 8px strip where page content scrolls visibly between the two
headers. **CONFIRMED.** (At ≥640px the offset is correct.)

### Every bottom nav and where it renders

| Bottom nav | File | Rendered where | Actually mounted? |
|---|---|---|---|
| Dashboard pill strip | `app/dashboard/DashboardMobileNav.tsx:10-19` | would be a global dashboard bottom bar | **NO — imported by nothing.** `grep` for `DashboardMobileNav` finds only its own file and comments. **CONFIRMED dead component.** |
| Org workspace pill strip | `app/dashboard/org/[id]/OrgMobileNav.tsx:15-33` | would be the org bottom bar, docked above the dashboard bar | **NO — imported by nothing.** `app/dashboard/org/[id]/layout.tsx` renders sidebar + mobile header + banner only. **CONFIRMED dead component.** |
| Home / Tickets / Dashboard / Explore | `app/profile/[id]/ProfileClient.tsx:723-760` | **only the public profile page** | yes, `sm:hidden` |
| Explore sheet trigger | `components/profile/ProfileSettingsModal.tsx:432-470` | inside the profile bottom nav | yes |
| Admin sticky toolbars | `app/admin/**` (`sticky bottom-0`) | admin only | yes, not a nav |
| Builder mobile tab bar | `components/dashboard/website/builder/WebsiteBuilderClient.tsx:512` | website builder only | yes |
| Event ticket-design action bar | `app/dashboard/events/[id]/ticket-design/TicketDesignClient.tsx:420` | ticket design only | yes |
| Venue builder action bar | `app/dashboard/events/[id]/seating/VenueBuilder.tsx:2117` | seating only | yes |

**So the "global bottom bar Home/Tickets/Dashboard/Explore on member pages" is real but scoped to the profile
page**, not the member area. There is **no bottom navigation anywhere in `/dashboard`** today, despite two
unused components that would provide one. **CONFIRMED**

### Reachability from mobile — answer

Every dashboard section is *technically* reachable on mobile through a hamburger drawer: `MobileDrawer` is
portaled and lists `SidebarNavList` with all `navGroups`
(`app/dashboard/org/[id]/OrgMobileHeader.tsx:52-73`, `ManagementShell.tsx:66-77`). But:

- The org drawer lists **all** org items in one flat list (no grouping), which for a restaurant is 11 labels
  including *Promotions*, *Kitchen*, *Tables & QR*. **CONFIRMED**
- `OrgMobileHeader` takes `capabilities` and passes them through, but **does not pass `hasReservationRows`
  correctly?** It does (`:19,49`). OK.
- `OrgMobileHeader` does **not** render `OrgMobileNav`, so the "same links on all three surfaces" promise in
  `org-nav-items.ts:8-13` is only 2/3 true. **CONFIRMED**
- The business shell (`/dashboard/businesses/[id]`) drawer exposes capability items, but `menu`/`website` are
  rewritten to the **org** base (`businesses/[id]/layout.tsx:38-41`) while the other items stay on the business
  base — a single drawer mixing two route trees with two different layouts. **CONFIRMED**

## G4. Hamburger "opens beneath page content" — root-cause analysis

I could **not reproduce this statically**; no browser is available. What the code says:

1. `MobileDrawer` **does** portal to `document.body` with `fixed inset-0 z-[100]`
   (`components/nav/MobileDrawer.tsx:27-45`). A portal escapes ancestor `overflow`/`transform` clipping, so the
   classic "clipped by a transformed sticky ancestor" cause is **already addressed** for this component.
   **CONFIRMED**
2. That leaves **z-index collisions**, and there is one concrete one: `HomeAdaptiveNav`'s mobile panel renders at
   **`z-[200]`** (`components/nav/HomeAdaptiveNav.tsx:172`). If the site-nav panel is open when a workspace
   drawer opens, the site panel paints **above** the drawer (200 > 100) — it looks like the drawer is "beneath
   page content" because the content covering it is the nav panel. **CONFIRMED values; INFERRED as the observed
   symptom.**
3. Second concrete candidate: `OrgDashboardSidebar` is a `motion.aside` (`transform`ed by Framer Motion) with
   `sticky top-16 z-30` and `md:flex` (`OrgDashboardSidebar.tsx:100-108`). At ≥768px it is visible while
   `MobileDrawer` is `lg:hidden`; between 768–1023px the drawer (z-100) and the expanded sidebar (z-30) coexist.
   No overlap today, but any future overlay placed *inside* that aside inherits its stacking context and will
   paint under `.z-30` page siblings. **INFERRED risk.**
4. `MobileDrawer` also returns `null` until `mounted` and closes on `pathname` change
   (`:20,24-28`) — no stacking effect.
5. `CookieConsent` is `z-50` (`components/CookieConsent.tsx:59`), below the drawer. Fine.

**Verdict:** the mechanism most consistent with the report is the `z-[200]` site-nav panel outranking the
`z-[100]` drawer. Stage 2 should verify in a browser before changing z-indices, because a single global
z-scale is the actual fix. **INFERRED**

## G5. Safe area and content hiding

- **`viewportFit: "cover"` is never set** (`app/layout.tsx:14-19`, `app/[locale]/layout.tsx:24-29`), so all 27
  `env(safe-area-inset-bottom)` usages (list in `evidence/safe-area-usage.txt`) resolve to **0** on iOS.
  **CONFIRMED**
- `maximumScale: 1` in both viewports blocks pinch-zoom. **CONFIRMED** (accessibility defect).
- Org workspace content wrapper has **no mobile bottom padding**:
  `app/dashboard/org/[id]/layout.tsx:160-162` is `px-4 pt-6 … lg:pb-6`. The unused `OrgMobileNav` comment claims
  "the org content wrapper reserves 69px for it" (`OrgMobileNav.tsx:20-22`) — that is **false in the current
  layout**. If the bar is re-enabled without adding padding, the last card is hidden. **CONFIRMED**
- `ManagementShell` content wrapper `px-4 py-6` (`:78`) likewise reserves nothing for a bottom bar — correct
  today because it renders none. **CONFIRMED**
- Profile page bottom nav is `fixed bottom-0` with no `env()` padding (`ProfileClient.tsx:723-726`), but the
  page container **does** reserve space: `<main className="min-h-screen bg-white px-4 pt-6 pb-24 … sm:pb-16">`
  (`ProfileClient.tsx:177`). Content is therefore not hidden behind that bar. **CONFIRMED** (the missing
  `env()` still means the bar itself sits on the home indicator, not that content is occluded).

## G6. Does the public footer render inside dashboard routes on mobile?

**No.** The root layout intentionally has no footer (`app/layout.tsx:79-84`), dashboard layouts add none, and
`grep -rln "Footer" app/dashboard` returns only `AppSidebar`'s `footer` prop and unrelated components
(names: `DashboardSidebar`, `EventsClient`, `GuestsClient`, `VenueBuilder`, …). **CONFIRMED absence.**

## G7. Navigation ↔ capability mapping

| Capability | Nav surface(s) that respond | Where |
|---|---|---|
| MENU | org: Menu, Promotions, Orders, Kitchen, Tables & QR; business: Menu (org href) | `lib/org-dashboard-modules.ts:66-78`, `org-nav-items.ts:30`, `OrgDashboardSidebar.tsx:61` |
| SERVICES | org: Services | `:67` |
| RESERVATIONS/TABLES | org: Reservations (needs offering or rows) | `:79`, `:165-172` |
| ORDERS/ONLINE_ORDERING | org: Orders (needs offering) | `:78`, `:157-161` |
| VEHICLES/VEHICLE_RENTAL | **reserved, never rendered** | `:80`, `routeExists:false` |
| BOOKINGS/APPOINTMENTS | **reserved, never rendered** | `:81` |
| PRODUCTS | org: Shop only when product rows exist | `:65`, `count` visibility |
| REVIEWS / ANALYTICS | always (Analytics unless `isNone`) | `:82-84` |

**Gap:** there is **no nav destination at all** for bookings/appointments (a clinic's core workflow) or fleet
(car rental's core workflow), even though both have capabilities and data paths. **CONFIRMED**
