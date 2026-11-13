# Dashboard Overview Redesign — Status & Handoff

Date: 2026-11-08  
Branch: `feat/dashboard-overview-redesign`  
Status: **PHASE A & PHASE B COMPLETED; MOBILE NAV & EVENT OVERVIEW REFINED**

---

## 1. What was built & refined

### A. Capability-Composed Overview Shell & Detection (Items 1, 2, 3)
- **Capability detection for pure events & fundraiser orgs**: `app/dashboard/org/[id]/overview/page.tsx` and `layout.tsx` augment business taxonomy capabilities with synthetic `"EVENTS"` and `"FUNDRAISING"` / `"DONATIONS"` based on `organizerTypes` and non-zero counts. An org with events or fundraisers displays the relevant `EventsSection` and `FundraisingSection` (via `CapabilityOverviewSections`) rather than prematurely falling back to the generic overview.
- **Relevant KPI cards only**: The top summary row in `OrgOverviewPage` conditionally renders Gross Sales & Orders only for commerce orgs (`ORDERS`, `ONLINE_ORDERING`, `MENU`, or `hasBusiness`), Bookings only for businesses with booking/reservation capabilities, and Total Raised only when fundraisers exist. Pure event orgs do not show empty or misleading commerce cards.
- **"Hours not configured" suppression**: `EntityHeader` only receives and displays `statusBadge` for workspaces associated with a primary business (`primaryBusiness !== null`).
- **Create actions hidden when workspace has content**: When an org already has items (events, fundraisers, orders, menu items, or services), create actions (`create_event`, `create_fundraiser`, and `CreateInvitationButton`) are hidden from the primary overview body. When empty, create prompts remain prominent. One "+ New" / "+ New Event" entry is preserved in the mobile More sheet.

### B. Mobile Navigation (Items 4, 5, 7, 8, 9)
- **Single mobile bottom bar for Org Workspace**: `components/nav/DashboardBottomBar.tsx` dynamically adapts tabs based on enabled capabilities:
  - Tab 1: Overview
  - Tab 2: Events (if `hasEvents`), Live ops (if commerce `hasOrders || hasBookings`), Fundraisers (if fundraiser-only), or Website
  - Tab 3: Fundraisers (if events + fundraisers), Manage (if commerce/services/menu/products), or collapses into a 3-tab layout
  - Tab 4: More (opens `DashboardMoreSheet`)
- **Drawer removal on Org Mobile**: `app/dashboard/org/[id]/OrgMobileHeader.tsx` removes the hamburger button and slide-out drawer, collapsing the top into a single compact bar with back link and organization title.
- **Event Mobile Bottom Bar**: `components/nav/EventBottomBar.tsx` mounts a 4-tab bar (Overview, Check-ins, Scanner, More) for `/dashboard/events/[id]/*` routes.
- **Event Mobile Drawer Removed**: `components/management/ManagementShell.tsx` updated with `hideHamburger` and `bottomBarPadding` flags. When `hideHamburger` is set and `mobileHeaderSlot` (EventSwitcher) is present, the duplicate mobile header collapses into one compact switcher header.
- **Distinct Nav Icons**: Every nav item uses its own dedicated Tabler icon (`IconCalendar`, `IconHeart`, `IconActivity`, `IconCheckbox`, `IconQrcode`, `IconArmchair`, `IconTicket`, `IconPhoto`, etc.) with no repeated generic grid (`LayoutDashboard`) icons. Added `IconArmchair` to `components/nav/platform-nav-icons.ts`.
- **Responsive Padding**: Both org and event layouts apply `pb-[calc(var(--bottom-bar-h)+1.5rem)]` on mobile, ensuring page contents are never obscured by bottom bars at 360px, 390px, or 430px viewports.

### C. Event Overview Screen (Item 6)
- **`app/dashboard/events/[id]/overview/page.tsx`**:
  - Replaced improper Door Scanner `StatCard` with a `QuickActionTile` secondary variant.
  - Subtitle interpolation cleans up stray separators (omits city + separator when `event.city` is null).
  - Quick action links transformed into full-size 2-column action tiles (Door Scanner, Check-ins & Roster, Operations, Seating, Guests & RSVPs, Invitation Builder / Preview, Public/Private Page).
  - `StatCard` component styled with `rounded-xl border border-zinc-200 p-4 bg-white` on all viewports, ensuring minimum 16px padding and rounded corners consistent with org cards.

---

## 2. Test Verification

Run targeted test suite:
```powershell
node --require ./scripts/test-server-only-alias.cjs --test lib/dashboard/__tests__/status-map.test.cjs lib/dashboard/__tests__/module-registry.test.cjs lib/dashboard/__tests__/date-range.test.cjs lib/dashboard/__tests__/bottom-bar.test.cjs lib/dashboard/__tests__/phase-b-overview.test.cjs lib/__tests__/org-dashboard-modules.test.cjs lib/__tests__/phase5-overview.test.cjs
```
**Result**: 128 tests pass, 0 fail.

Run TypeScript check:
```powershell
node node_modules/typescript/bin/tsc --noEmit
```
**Result**: 0 errors.

Run ESLint check on modified files:
```powershell
.\node_modules\.bin\eslint <changed files>
```
**Result**: 0 errors, 0 warnings.

---

## 3. Manual Staging Test Steps

1. **Organization Capability Detection (Org ID: `9e5c45f9-3bf9-41e0-bf85-865ee077b7da`)**:
   - Navigate to `/dashboard/org/9e5c45f9-3bf9-41e0-bf85-865ee077b7da/overview`.
   - Verify that Events and/or Fundraising sections appear with real counts, upcoming events/fundraisers, and recent activity via `CapabilityOverviewSections`.
   - Verify that the generic overview fallback is NOT shown when events or fundraising data exists.
2. **Conditional KPI Cards**:
   - Verify that non-commerce organizations display only relevant KPI cards (e.g., Total Raised or Tickets, NOT Gross Sales or Orders).
   - Verify that "Hours not configured" is absent from the entity header if the organization does not have a linked business with hours.
3. **Create Actions Gate**:
   - In an organization with content, verify that "+ New Event", "+ New Fundraiser", and "+ New Invitation" are absent from the overview surface.
   - Tap "More" in the mobile bottom bar; verify "+ New Event" or "+ New Fundraiser" appears at the top of the menu.
   - In a completely new/empty workspace, verify that the primary create prompts remain visible.
4. **Mobile Navigation & Stacking (360px, 390px, 430px)**:
   - On mobile viewports, verify that the org overview displays exactly ONE bottom bar (Overview, Events/Live ops, Fundraisers/Manage, More) and NO top hamburger button/drawer.
   - Verify the sticky top header is a single compact bar with back link and organization name.
   - Scroll to the bottom of the overview: confirm all content is visible above the bottom bar with safe-area spacing (`pb-[calc(var(--bottom-bar-h)+1.5rem)]`).
5. **Event Overview & Mobile Nav (`/dashboard/events/{id}/overview`)**:
   - Navigate to `/dashboard/events/<event-id>/overview`.
   - Verify the top header collapses into a single compact header (event switcher) without a duplicate title or duplicate hamburger.
   - Verify the subtitle format: no stray "·" when city is missing.
   - Verify StatCards have rounded corners, minimum 16px padding (`p-4`), and clean tabular numbers.
   - Verify Door Scanner is a full-size action tile, not a stat card.
   - Verify the Event mobile bottom bar displays 4 tabs: Overview, Check-ins, Scanner, More.
   - Tap "More": verify the event bottom sheet opens with Operations, Memories, Ticket Design, Seating, Team & Staff, and Edit Details. Tap each item to verify navigation and distinct icons.

---

## 1. What was built in Phase A

### A. Capability-Composed Overview Shell
- **`components/dashboard/overview/CapabilityOverviewSections.tsx`**: Registry mapping enabled business capabilities (`BOOKINGS`, `SERVICES`, `ORDERS`/`MENU`, `PRODUCTS`, `EVENTS`, `FUNDRAISING`, `REVIEWS`) to modular, priority-ordered overview sections.
- **`components/dashboard/overview/ModuleSection.tsx`**: Section wrapper with client `<ErrorBoundary>` + `<Suspense>` fallback, guaranteeing that an error in one module never breaks the rest of the overview.
- **`components/dashboard/overview/OverviewShell.tsx`**: Rewritten padding-free container with `max-w-6xl mx-auto`, `sr-only <h1>` for screen reader accessibility, and 60-second background auto-refresh with relative timestamp ("Updated just now" / "Updated N min ago").
- **`components/dashboard/overview/EntityHeader.tsx`**: Sticky 48px workspace header (`sticky top-14 sm:top-16 z-[var(--z-sticky)]`) with business name, operational status badge, period selector, and refresh button.
- **`components/dashboard/overview/AttentionCard.tsx`**: Single grouped card replacing the old multi-card `AttentionStrip`. 3px semantic tone bar, icon, title, detail, and expand-in-place ("See all N items").
- **`components/dashboard/overview/SetupBanner.tsx`**: 44px slim single-line banner replacing the multi-row card; opens a bottom sheet with checklist progress.
- **`components/dashboard/overview/StatCard.tsx`**: KPI tile with tabular numerals, loading skeleton, multi-currency tag, and delta display.
- **`components/dashboard/overview/StatusChip.tsx`**: Semantic status chip resolving against live CHECK constraints via `lib/dashboard/status-map.ts`.
- **`components/dashboard/overview/EmptyState.tsx`**: Inline, section, and blocked empty states with tap-accessible action buttons (>= 44px).
- **`components/dashboard/overview/InsightCard.tsx`**: Recommendation cards with 3px left border tone.
- **`components/dashboard/overview/QuickActionTile.tsx`**: Primary (48px solid `--primary`) and secondary (72px 2-col) action tiles.
- **`components/dashboard/overview/TrendChart.tsx`**: Recharts area chart with 10% flat fill and accessible `<table>` fallback.

### B. Service and Booking Overviews with Real Tenant Data
- **`components/dashboard/overview/modules/BookingsSection.tsx`**: Tenant-scoped server component querying `public.reservations` for `booking_type = 'appointment'` (and tables), computing scheduled/confirmed/pending counts and upcoming bookings with status chips and service types.
- **`components/dashboard/overview/modules/ServicesSection.tsx`**: Tenant-scoped server component querying `public.services`, displaying active services, unpriced services, and catalog preview rows with direct links to add or edit.
- **`components/dashboard/overview/modules/OrdersMenuSection.tsx`**: Orders and gross sales summary with live status chips.
- **`components/dashboard/overview/modules/ProductsSection.tsx`**, **`EventsSection.tsx`**, **`FundraisingSection.tsx`**, **`ReviewsSection.tsx`**: Modular sections for remaining capabilities.
- **`lib/dashboard/date-range.ts`**: Unified date-range handling for `today`, `7d`, `30d`, `month`, and `custom` period windows computed relative to the site timezone (`lib/date-timezone.ts`).
- **`components/dashboard/overview/PeriodSelector.tsx`**: Bottom sheet period picker writing `?period=`, `?from=`, and `?to=` to URL params.

### C. Unified Mobile Bottom Navigation & Stacking Scale
- **`components/nav/DashboardBottomBar.tsx`**: Fixed 4-tab mobile bottom bar (`fixed inset-x-0 bottom-0 z-[var(--z-bottom-bar)]`, `pb-[env(safe-area-inset-bottom)]`, `lg:hidden`):
  1. Overview (`/dashboard/org/{id}/overview`)
  2. Live ops / Website (`/dashboard/org/{id}/orders` or `/reservations` when live domain exists; fallback to `/website`)
  3. Manage (`/dashboard/org/{id}/services` or `/menu` or `/products` by capability)
  4. More (opens bottom sheet)
- **`components/nav/DashboardMoreSheet.tsx`**: Accessible modal bottom sheet (`z-[var(--z-sheet)]`, backdrop `z-[var(--z-sheet-backdrop)]`, Esc key and backdrop dismissal) containing remaining workspace destinations + "Back to Aldriva Dashboard".
- **`app/globals.css`**: Standardized z-index scale custom properties (`--z-content: 0`, `--z-sticky: 10`, `--z-bottom-bar: 20`, `--z-cookie: 25`, `--z-sheet-backdrop: 30`, `--z-sheet: 40`, `--z-dialog: 50`, `--z-toast: 60`), `--app-navbar-h`, and `--bottom-bar-h`.
- **`app/dashboard/org/[id]/layout.tsx`**: Double-gutter padding fix + content padding to clear the bottom bar (`pb-[calc(var(--bottom-bar-h)+1.5rem)] lg:pb-6`), mounting `<DashboardBottomBar>`.

### D. Migrations (Written, NOT Applied)
- **`db/migration_223_overview_rollups.sql`**: 6 SECURITY DEFINER tenant-scoped rollup functions (`overview_sales_rollup`, `overview_bookings_rollup`, `overview_events_rollup`, `overview_donations_rollup`, `overview_catalog_counts`, `overview_activity_feed`).
- **`db/migration_223_overview_rollups_rollback.sql`**: Full rollback twin.

---

## 2. Test Verification

Run targeted test suite:
```powershell
node --require ./scripts/test-server-only-alias.cjs --test lib/dashboard/__tests__/status-map.test.cjs lib/dashboard/__tests__/module-registry.test.cjs lib/dashboard/__tests__/date-range.test.cjs lib/dashboard/__tests__/bottom-bar.test.cjs lib/__tests__/org-dashboard-modules.test.cjs lib/__tests__/phase5-overview.test.cjs
```
**Result**: 126 tests pass, 0 fail.

---

## 3. Manual Staging Test Steps

1. **Mobile Bottom Bar (360px / 390px / 430px)**:
   - Log into `/dashboard/org/<org-id>/overview` in responsive view mode (360px width).
   - Verify the bottom bar has exactly 4 tabs: Overview, Live ops (or Website), Manage, More.
   - Verify active tab highlighting uses `--primary` (#c2410c).
   - Tap "More" -> verify the sheet smoothly slides up above the bottom bar with `z-[var(--z-sheet)]` without being obscured by page content.
   - Tap "Back to Aldriva Dashboard" or backdrop to dismiss.
2. **Desktop View (>= 1024px)**:
   - Expand viewport to 1280px.
   - Verify the mobile bottom bar is hidden (`lg:hidden`) and the desktop sidebar remains the primary navigation.
3. **Period Selector**:
   - Tap the period button in the header -> select "Last 7 days".
   - Verify the URL updates to `?period=7d` and the overview reloads with the 7-day date window.
4. **Service & Booking Real Data**:
   - For a service business, verify active services count, service list rows, and duration labels.
   - Tap "+ New Service" -> navigates to `/dashboard/org/<id>/services/new`.
   - For an organization with bookings, verify upcoming appointments with status chips (`pending`, `confirmed`).
   - For an organization with 0 bookings, verify the in-place empty state ("No bookings scheduled in this period.") renders cleanly without breaking layout.

---

## 4. Risks & Mitigations

- **Migration 223 is draft-only**: SQL rollups are not yet applied on staging. Page components currently fall back to direct Supabase queries with tenant scoping via `createSupabaseAdmin()` and `checkTenantAccess`.
- **Landscape / Safe Area Insets**: Viewport fit (`viewportFit: cover`) will be added in PR 8 per spec; `pb-[env(safe-area-inset-bottom)]` is already in place on the bottom bar so it will safely adapt as soon as cover is enabled.

---

## 5. What the Next Phase (Phase B / PR 3) Needs

- PR 3: Port Fundraiser overview onto the unified shell (`/dashboard/fundraisers/{id}/overview`).
- PR 4: Restaurant specific modules (`RestaurantModules.tsx`, Kitchen queue card).
- PR 6: Event overview port onto the unified shell (`/dashboard/events/{id}/overview`).
- Apply migration 223 (`overview_rollups`) when staging migration window opens.
