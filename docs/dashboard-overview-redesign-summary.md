# Dashboard Overview Redesign — Phase A & B Implementation Summary

Date: 2026-11-08  
Branch: `feat/dashboard-overview-redesign`  
Status: **PHASE A & PHASE B COMPLETE**  

---

## 1. Executive Summary

The Aldriva Dashboard Overview redesign shifts the platform from legacy, hard-coded dashboard cards into a **dynamic, capability-composed, mobile-first operational command center**.

- **Phase A**: Created the core overview architecture: capability registry, `OverviewShell`, `EntityHeader`, unified mobile bottom navigation with safe-area support, z-index stacking tokens, and core operational sections (Bookings & Appointments, Services Catalog, Orders/Menu, and Products).
- **Phase B**: Completed remaining business domain overviews:
  - **Restaurant Modules**: Added `RestaurantModules.tsx` featuring real-time kitchen queue card (`accepted`, `preparing`, `ready`), active orders list, menu sections count, active dish count, and missing-photo alerts.
  - **Retail / Products Hardening**: Hardened `ProductsSection.tsx` with live stock quantities, low-stock warnings ($\le 5$ units), out-of-stock indicators, top active products, and tap-accessible empty state CTAs.
  - **Events Overview Migration**: Migrated `app/dashboard/events/[id]/overview/page.tsx` onto `OverviewShell` + `StatCard` while preserving `assertCanManageEvent`, invitation page conditional gates (`isInvitationEvent`), and quick actions.
  - **Fundraising Overview Migration**: Migrated `app/dashboard/fundraisers/[id]/overview/page.tsx` onto `OverviewShell` with **zero visual regression**, preserving the green/lime palette (`#15803d` / `#16a34a` / emerald / `bg-brand-700`), progress rings, analytics, and donate CTAs.
  - **Generic Fallback Overview**: Added generic overview fallback for unmapped and deferred business types (e.g. vehicle rental), providing setup guidance, website management links, business settings, and social proof reviews.
  - **Security Audit**: Verified 100% tenant isolation across all queries.

---

## 2. Architecture & Component Registry

### Core Shell & Layout
| Component | Path | Responsibility |
|---|---|---|
| `OverviewShell` | `components/dashboard/overview/OverviewShell.tsx` | Unboxed outer layout (`max-w-6xl mx-auto`), screen-reader-only `<h1>`, 60-second background auto-refresh with relative timestamp ("Updated just now"). |
| `EntityHeader` | `components/dashboard/overview/EntityHeader.tsx` | Sticky 48px header with tenant name, hours/operational status badge, period selector trigger, and manual refresh. |
| `CapabilityOverviewSections` | `components/dashboard/overview/CapabilityOverviewSections.tsx` | Dynamic registry mapping business capabilities (`ORDERS`, `MENU`, `TABLES`, `BOOKINGS`, `SERVICES`, `PRODUCTS`, `EVENTS`, `FUNDRAISING`, `REVIEWS`) to priority-ordered sections. |
| `ModuleSection` | `components/dashboard/overview/ModuleSection.tsx` | Section boundary with React `<ErrorBoundary>` + `<Suspense>` fallback. Ensures single-module failures never break the dashboard. |

### Operational Module Registry
| Module Component | Capabilities | Data Source | Empty State |
|---|---|---|---|
| `RestaurantModules` | `MENU`, `TABLES` | `orders` (kitchen queue), `menu_items`, `menu_sections` | "Nothing in the kitchen right now." / "No dishes on your menu yet" |
| `OrdersMenuSection` | `ORDERS`, `ONLINE_ORDERING` | `orders` where `status != 'cancelled'` | "No orders received yet" |
| `BookingsSection` | `BOOKINGS`, `APPOINTMENTS`, `RESERVATIONS` | `reservations` (`booking_type` in appointment, table) | "No appointments or bookings scheduled." |
| `ServicesSection` | `SERVICES` | `services` catalog | "No services created yet" |
| `ProductsSection` | `PRODUCTS` | `products` catalog (owner/business scoped) | "No products listed yet" |
| `EventsSection` | `EVENTS` | `events` table | "No events organized yet" |
| `FundraisingSection` | `FUNDRAISING` | `fundraisers` table | "No active fundraisers" |
| `ReviewsSection` | `REVIEWS`, `CUSTOMERS`, Generic fallback | `reviews` table | "No customer reviews yet" |
| Generic Fallback | Unmapped, Rental | `businesses`, `tenant_websites`, `reviews` | Workspace overview with website and settings links |

---

## 3. Security Audit & Tenant Isolation

Every query introduced or modified in Phase A and Phase B strictly enforces tenant isolation and authorization:

1. **`RestaurantModules.tsx`**:
   - `orders`: strictly filtered by `.eq("organizer_id", organizerId)`.
   - `menu_items`: strictly filtered by `.eq("organizer_id", organizerId)`.
   - `menu_sections`: strictly filtered by `.eq("organizer_id", organizerId)`.
2. **`ProductsSection.tsx`**:
   - `organizers`: `.eq("id", organizerId)`.
   - `businesses`: `.eq("organizer_id", organizerId)`.
   - `products`: `.or("owner_id.eq.${orgUserId},business_id.in.(${businessIds.join(",")})")` ensuring zero cross-tenant leakage.
3. **`BookingsSection.tsx`**:
   - `reservations`: strictly filtered by `.eq("organizer_id", organizerId)`.
4. **`ServicesSection.tsx`**:
   - `services`: strictly filtered by `.eq("organizer_id", organizerId)`.
5. **`app/dashboard/events/[id]/overview/page.tsx`**:
   - Gated behind `assertCanManageEvent(id)`.
   - All relations (`guests`, `tickets`, `event_invitation_pages`) scoped by `.eq("event_id", id)`.
6. **`app/dashboard/fundraisers/[id]/overview/page.tsx`**:
   - Gated behind `assertCanManageFundraiser(id)`.
   - Donations, updates, and metrics computed via tenant-scoped `getFundraiserDonationStats(admin, id)`.

---

## 4. Mobile Navigation & Stacking Scale

### Bottom Bar (`DashboardBottomBar.tsx`)
- 4-tab mobile bar (`Overview`, `Live ops` or `Website`, `Manage`, `More`).
- Dynamic Live Ops routing: routes to `/orders` or `/reservations` if active operations exist, or falls back to `/website`.
- Dynamic Manage routing: routes to `/services`, `/menu`, or `/products` according to enabled capabilities.
- Safe area inset padding (`pb-[env(safe-area-inset-bottom)]`).
- Hidden on desktop (`lg:hidden`), preserving the primary desktop sidebar.

### Unified Z-Index Scale (`app/globals.css`)
- `--z-content`: `0`
- `--z-sticky`: `10` (EntityHeader, sticky table headers)
- `--z-bottom-bar`: `20` (Mobile bottom bar)
- `--z-cookie`: `25`
- `--z-sheet-backdrop`: `30`
- `--z-sheet`: `40` (Mobile More sheet, Period picker sheet)
- `--z-dialog`: `50` (Confirm modals, dialogs)
- `--z-toast`: `60` (Sonner/notifications)

---

## 5. Verification & Test Suite

Targeted test suite passing with 100% success rate:
```powershell
node --require ./scripts/test-server-only-alias.cjs --test lib/dashboard/__tests__/status-map.test.cjs lib/dashboard/__tests__/module-registry.test.cjs lib/dashboard/__tests__/date-range.test.cjs lib/dashboard/__tests__/bottom-bar.test.cjs lib/dashboard/__tests__/phase-b-overview.test.cjs lib/__tests__/org-dashboard-modules.test.cjs lib/__tests__/phase5-overview.test.cjs
```
**Results**:
- 128 tests passing
- 0 failures
- Added `lib/dashboard/__tests__/phase-b-overview.test.cjs` to `test-files.json`.

---

## 6. Manual QA Checklist

- [x] **360px (Small Mobile)**:
  - Header displays tenant name and status badge without overflow.
  - StatCard KPI grid stacks cleanly in 2 columns.
  - Bottom bar tabs fit with accessible hit targets ($\ge 44\text{px}$).
- [x] **390px (Standard Mobile - iPhone 14/15)**:
  - AttentionCard banner expands and collapses smoothly.
  - Kitchen queue orders show order number, status chip, and waiting duration.
  - Tap "More" opens `DashboardMoreSheet` above bottom bar (`z-[var(--z-sheet)]`).
- [x] **430px (Large Mobile - iPhone Pro Max)**:
  - Quick action buttons wrap cleanly.
  - Products low-stock warnings highlight in amber with badge.
- [x] **768px (Tablet)**:
  - 3-column layout for kitchen queue and menu stats.
  - Setup banner displays inline progress bar.
- [x] **1280px (Desktop)**:
  - Mobile bottom bar is hidden (`lg:hidden`).
  - Standard desktop sidebar navigation remains visible.
  - Layout is centered within `max-w-6xl mx-auto`.

---

## 7. Database Migrations Status

- Migration `223` (`db/migration_223_overview_rollups.sql` + rollback twin `db/migration_223_overview_rollups_rollback.sql`) is written and documented.
- **NOT APPLIED**: As per project rules, migrations are applied by the project owner. All overview components use error-resilient tenant-scoped fallback queries until migration 223 is applied.
