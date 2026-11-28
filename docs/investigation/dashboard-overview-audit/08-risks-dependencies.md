# 08 — Risks, Dependencies, and What Must Not Break

## I1. Routes the overviews link to (a redesign must keep them valid)

From `lib/overview-resolver.ts`, `OrgOverviewClient`, `TodayStrip`, `AttentionStrip`, `QuickActions`,
`SetupChecklist`, `EventMetricsWidget`, `RecentOrdersWidget`, `OrgDashboardSidebar`:

```
/dashboard/org/{id}/orders?tab=needs_attention
/dashboard/org/{id}/reservations?tab=needs_action
/dashboard/org/{id}/menu
/dashboard/org/{id}/services
/dashboard/org/{id}/website/builder
/dashboard/org/{id}/products
/dashboard/org/{id}/events
/dashboard/org/{id}/fundraisers
/dashboard/org/{id}/reviews
/dashboard/org/{id}/analytics
/dashboard/org/{id}/settings        (+ #hours anchor)
/dashboard/org/{id}/tables
/dashboard/org/{id}/kitchen
/dashboard/events/new
/dashboard/businesses/new
/create-fundraiser
/dashboard/fundraisers/{id}/{updates,donors,donations,beneficiaries,analytics,settings}
/dashboard/events/{id}/{guests,checkins,scan,team,seating,operations,memories,ticket-design,invitation-page}
/site/{slug}    /fundraisers/{slug}    /events/{slug}
```

All of these resolve to real files **except** the placeholder query strings (`?tab=...` is only consumed by
`MobilePillNav`'s active-state logic — `components/nav/MobilePillNav.tsx:24-26`). **CONFIRMED**

## I2. Server actions / APIs / RPCs the overview surfaces touch

| Dependency | Used by | File |
|---|---|---|
| `getFundraiserDonationStats` (reads `donations`) | fundraiser overview | `lib/fundraiser-dashboard.ts:361-390` |
| `GET /api/dashboard/donations/export?fundraiser_id=` | fundraiser quick actions | `components/fundraisers/FundraiserQuickActions.client.tsx:24-39` |
| `router.refresh()` every 60s | org overview | `components/dashboard/overview/OverviewShell.tsx:20-33` |
| `assertCanManageEvent` / `assertCanManageFundraiser` / `assertCanManageBusiness` | entity shells | `lib/entity-authz.ts` |
| `checkTenantAccess` | org layout + overview | `lib/entity-auth.ts:116-160` |
| `createSupabaseAdmin` (service role, **bypasses RLS**) | every overview read | `lib/supabase-admin.ts` |
| `lib/actions/orders.ts`, `reservations.ts`, `table-management.ts` | linked operation pages (not the overview itself) | `lib/actions/*` |
| RPCs | **none called by any overview** | — |

**Security dependency to preserve:** every overview uses the **service-role** client and relies on an explicit
`checkTenantAccess` / `assertCanManage*` call for isolation. A redesign that drops the check would expose every
tenant's orders. **CONFIRMED** — this is the highest-severity "must not break".

## I3. Existing tests that constrain the redesign

`test-files.json` includes (grep results):

- `lib/__tests__/phase5-overview.test.cjs` (line 185) — **asserts exact arrays**:
  `["add_dish","edit_website"]`, `["add_service","edit_website"]`, `["edit_website"]`,
  `["new_event"]`, `["new_event","new_fundraiser"]`, and `assert.deepEqual(ids, ["empty_state"])`.
  Any change to quick-action ids/order or widget order **fails this suite by design**.
- `lib/__tests__/org-dashboard-modules.test.cjs` (line 169) — asserts exact nav label arrays per business type,
  e.g. restaurant `["Overview","Website","Menu","Promotions","Orders","Reviews","Analytics","Settings","Kitchen"]`.
- `lib/dashboard/__tests__/org-overview-scoping.test.cjs` (line 52).
- `lib/__tests__/data-consistency.test.cjs` — cross-surface consistency (currency/status).
- Ran? **No tests were executed** (read-only audit; `npm test` would also write caches). Their content is
  evidence; their pass state is **UNKNOWN** for this working tree.

**Implication:** the tests encode the *current* capability rules, so Stage 2 must treat them as a spec to
update deliberately, not as obstacles to delete.

## I4. In-flight work a redesign could collide with

| In flight | Evidence | Collision |
|---|---|---|
| Reservation engine | uncommitted `db/migration_215_atomic_scan_order_and_harden_reservation.sql`, `216_reservation_booking_schema.sql` + supabase mirrors; `218_reservation_capacity_booking_type_filter`, `217_reservation_booking_details` already mirrored | Any "live tables" card must handle `booking_type=table|rental|appointment`, deposits, change requests (migration 206), internal notes (205) |
| Service categories | uncommitted `db/migration_220_service_categories.sql` + mirror; `lib/actions/service-categories.ts` | A marketing-style module for Services/Bookings may collide with the new category taxonomy |
| Branches | `business_branches` table, `app/dashboard/businesses/[id]/branches`, migration 214 scan actions and branches | Overview is **single-business, no branch dimension**; adding branches will break `primaryBusiness` and all tenant counts |
| General booking | `b1e099621 wip: general booking…`, `lib/actions/general-booking.ts`, `components/site/reservations/GeneralBookingForm.tsx` | Bookings may become their own domain, invalidating `booking_type=appointment` assumptions |
| Invitation removal | HEAD commit `303ed15ed`, branch name | `CreateInvitationButton` is wired into the org overview (`page.tsx:7,500-505`); invitation templates were just removed |
| Scan phases 3–4 | `73786a362`, `e2506765d`, `b4b408e63`, `69e1970fd` | Event overview Scan card competes with the scanner workspace |

## I5. What must not break (ordered by blast radius)

1. **Tenant isolation.** Service-role reads + manual access checks. Any new aggregate query must use
   `.eq('organizer_id', …)`; `orders`/`reservations` RLS is a backstop only for `authenticated`, not for
   `service_role`.
2. **Resilience to unapplied migrations.** The overview already degrades for missing orders/reservations columns
   (`page.tsx:139-196`, `:296-302`). Migration 185/186/220 states are **owner-reported only** (AGENTS.md) — the
   fallbacks are load-bearing.
3. **"Rows always win" nav rule** — never hide the only catalog-entry link
   (`lib/org-dashboard-modules.ts:168-175`, tests enforce it). Hiding Menu/Services while rows exist strands data.
4. **Role gating.** `viewer`/`editor` must not receive create/edit actions; `finance` must keep read access.
5. **Legacy redirects.** `organizations/[slug]/overview`, `businesses/[id]/overview`, `events/[id]/page.tsx`,
   `businesses/[id]/orders` all redirect; bookmarks and old links depend on them (`phase5-overview.test.cjs`
   asserts they call `redirect`).
6. **Shop gating** — `Shop` appears only when the owner has product rows, never on business creation alone
   (tested).
7. **Kitchen/Tables visibility** keyed on `MENU`/menu rows (`org-nav-items.ts:30`, `OrgDashboardSidebar.tsx:61`).
8. **Approval banner + publish/orders gating** (`OrgApprovalBanner`, `getApprovalState`).
9. **`/events/[id]` role tab set** (`lib/event-dashboard-navigation.ts`) — scanner/manager/owner see different
   tabs; a new nav must call the same function.
10. **The 60-second refresh** and its visibility check (`OverviewShell.tsx:22-32`) — dashboards are expected to
    stay close to live without a websocket.
