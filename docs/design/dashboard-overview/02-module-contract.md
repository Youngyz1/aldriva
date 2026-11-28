# 02 — Module Contract & Data Aggregation

Roles: **one registry** decides capability → module for nav, shell and overview (Decision 1). This document
defines the module object, its runtime states, and the server-side aggregation each module is allowed to use.

---

## 1. Registry schema

```ts
// lib/dashboard/modules.ts  (target file; does not exist yet)
export type DashboardSurface = "nav" | "shell" | "overview";

export interface ModuleDefinition {
  id: ModuleId;                       // stable, kebab-case, asserted by tests
  capabilities: Capability[];         // ANY-of; [] = always available in a workspace
  anyOfOfferings?: string[];          // legacy businesses.offerings[] gate, text[]
  permission: "view" | "manage";      // "manage" = OWNER/ADMIN/EDITOR; "view" includes VIEWER/FINANCE
  surfaces: DashboardSurface[];
  period: "none" | "range";           // "range" modules receive from/to
  nav?: { hrefSuffix: string; icon: TablerIconName; group: "primary" | "manage" | "more" };
  i18n: { title: string; empty: string; error: string };   // keys, never literals
  href: (ctx: ModuleContext) => string;                    // must resolve to an existing route
  load: (ctx: ModuleContext) => Promise<ModuleResult<unknown>>;
  emptyWhen: (data: unknown) => boolean;
}
```

`ModuleContext`: `{ organizerId, businessId, role, capabilities, offerings, from, to, timezone, locale,
currency, surface }`. The loader is **period-aware only when `period: "range"`**; everything else ignores
from/to by construction.

Rules enforced by types + tests:

1. `href` must start with `/dashboard/` and must match a module whose `surfaces` includes `nav` — this is the
   fix for BUG-14 (overview linking to a page the nav hides).
2. `permission: "manage"` modules compute actions server-side from the role; a `VIEWER` receives the module
   with `actions: []`, never with disabled buttons.
3. `load` may not call another module's loader and may not query more than one domain.
4. The registry replaces `lib/org-dashboard-modules.ts`, `lib/business-dashboard-modules.ts` and the rule block
   in `lib/overview-resolver.ts:132-230`. Those files become adapters that read the registry.

## 2. Runtime states

```ts
type ModuleResult<T> =
  | { status: "ok"; data: T }
  | { status: "empty"; reason: "no_rows" | "not_configured" }
  | { status: "unavailable"; reason: "missing_schema" | "not_approved" }
  | { status: "error"; retryable: true };
```

- `missing_schema` is produced by catching `42P01`/`42703` — the same fallback the current page relies on
  (`app/dashboard/org/[id]/overview/page.tsx:139-196`, `:296-302`). It renders as capability-absent, never as
  zeros.
- Exactly **one `<Suspense>` + one error boundary per module**. Skeleton mirrors final height.
- Loaders have a 4s soft timeout: on timeout return `error`, never block the stream.

## 3. Required server aggregation (RPCs / views)

All RPCs are `SECURITY DEFINER`, `SET search_path = public, pg_temp`, take tenant ids explicitly, validate
`business_id` belongs to `organizer_id`, `REVOKE ALL … FROM PUBLIC, anon, authenticated` and
`GRANT EXECUTE … TO service_role` — the same posture as migration 216
(`db/migration_216_reservation_booking_schema.sql:§12`). The overview keeps using
`createSupabaseAdmin()` plus its explicit `checkTenantAccess`; the RPC is **not** the security boundary, the
caller's access check is.

Common parameters: `p_organizer_id uuid`, `p_business_id uuid NULL`, `p_from timestamptz`, `p_to timestamptz`,
`p_tz text`. Buckets use `(ts AT TIME ZONE p_tz)::date`; invalid timezones are rejected app-side
(`lib/date-timezone.ts:40`).

### 3.1 `overview_sales_rollup` — migration 223

Returns: `total_count, gross_amount, collected_amount, outstanding_amount, refunded_count, currency,
by_day jsonb, by_status jsonb, previous_period jsonb`.
Sources: `orders` (`total_amount`, `payment_status`, `status`, `created_at`, `currency`).
Exclusions: `payment_status = 'refunded'` excluded from gross/collected; `status = 'cancelled'` excluded from
counts. Multi-currency: group by `currency`, return the primary plus `currencies_count`.
Indexes: `(business_id, created_at DESC)`, `(organizer_id, payment_status, created_at DESC)`. Verify whether
174 already added a composite before adding.

### 3.2 `overview_bookings_rollup` — migration 223

Parameter adds `p_booking_type text[]` (`{table}` for reservations, `{appointment}` only for bookings; rental track is deferred).
Returns: `pending_count, confirmed_count, today_count, next_starts_at, no_show_count_30d,
completed_count_30d, by_day jsonb`.
Sources: `reservations` (`booking_type`, `status`, `starts_at`, `ends_at`, `party_size`, `duration_minutes`,
`business_id`). `pending_hold` is excluded from live counts and reported separately.
Indexes: existing `(organizer_id, status, starts_at)` from 176; add `(business_id, booking_type, starts_at)`
and `(organizer_id, booking_type, starts_at)`.
**`booking_details` is not aggregated in SQL** beyond `service_type`; JSON keys are read app-side.

### 3.3 `overview_events_rollup` — migration 223

Returns: `events_upcoming, tickets_sold, tickets_checked_in, guests_confirmed, next_event_at, per_event jsonb`.
Sources: `events` (`event_date`, `status`, `organizer_id`), `tickets`, `ticket_orders`, `ticket_checkins`,
`guests`. Only rows for events whose date falls in `[p_from, p_to]` for the money/count series; the next-event
lookup ignores `p_from`.
Indexes: `events(organizer_id, event_date)`, FK indexes on `event_id` (verify each exists).

### 3.4 `overview_donations_rollup` — migration 223

Returns: `raised_by_currency jsonb, donor_count, gift_count, average_gift, previous_period jsonb, by_day jsonb`.
Sources: `donations` (`amount`, `currency`, `created_at`, `fundraiser_id`, `status`), joined to `fundraisers`
(`id`, `organizer_id`, `goal`, `status`). `donations` has **NO** `organizer_id` column; it must always join through
`fundraisers.organizer_id = p_organizer_id`.
`fundraisers` contains both `raised` and `raised_amount`: the donation flow (`lib/donations.ts:72`) writes to
`raised` (updating total after donations), while `raised_amount` is a legacy column. Period metrics must be computed
directly from `donations` rows (`donations.amount` filtered by `created_at`), **not** from either cached column on
`fundraisers`.
Exclusions: non-succeeded donations (`status != 'succeeded'`). No shares/views/conversion — those columns do not exist (audit `03`).
Indexes: `donations(fundraiser_id, created_at)`, `fundraisers(organizer_id)`.

### 3.5 `overview_catalog_counts` — migration 223

Returns one row: `menu_items, menu_sections, services_active, services_missing_price, products_active,
products_no_image`.
Sources: `menu_items`, `menu_sections`, `services` (`is_active` confirmed in use at
`feat/fresh-home-redesign:app/dashboard/org/[id]/bookings/page.tsx:60-64`; `price` nullable since 219),
`products`.
Indexes: `(business_id)` on `menu_items`/`products`, `(organizer_id, is_active)` on `services`.

### 3.6 `overview_activity_feed` — migration 223

Returns up to `p_limit` rows `{kind, at, title_key, params jsonb, href_suffix, amount, currency}`.
Sources: union of `orders`, `reservations`, `donations`, `reviews` — each projected to the same shape.
This is the only cross-domain query, and it is read-only with a hard limit (default 5, max 20).
Indexes: the per-domain `created_at` indexes above; no new index.

### 3.7 Attention counts

Not a new RPC: attention stays in `lib/overview-resolver.ts` but reads the six rollups and maps to
`AttentionItem`. Rationale: attention combines approval state (app tables) with counts (SQL) and cannot live
entirely in SQL without duplicating `getOrgApproval`.

## 4. Mapping table (module → RPC)

| Module | RPC | Tables |
|---|---|---|
| `kpi_sales`, `trend_sales`, `live_orders` | sales | `orders` |
| `kpi_bookings`, `live_bookings` | bookings (`appointment`) | `reservations` |
| `kpi_reservations`, `live_reservations` | bookings (`table`) | `reservations` |
| `event_metrics`, `live_events` | events | `events, tickets, ticket_orders, ticket_checkins, guests` |
| `fundraiser_metrics`, `live_donations` | donations | `donations, fundraisers` |
| `catalog_menu`, `catalog_services`, `catalog_products` | catalog | `menu_*, services, products` |
| `reviews` | none (existing pages) | `reviews` |
| `recent_activity` | activity | four domains |
| `attention`, `setup`, `quick_actions` | app-side | `lib/overview-resolver.ts` (rewritten) |

## 5. Data shapes at the boundary

```ts
interface Metric { key: string; value: number; format: "count"|"money"|"percent"|"duration";
                   currency?: string; }
interface Delta { value: number; direction: "up"|"down"|"flat"; comparable: boolean; }
interface SeriesPoint { bucket: string; value: number; }   // bucket = YYYY-MM-DD in site tz
```

`comparable: false` is rendered by omitting the delta line — never `0%`, never `+∞`.

## 6. Caching and freshness

- Page shell is static; each module streams. Do **not** add `export const dynamic`.
- Rollups are read with `unstable_cache`? **No** — tenant data + 60s refresh (`OverviewShell.tsx:22-32`)
  means caching must be per-request. Keep the existing refresh; do not add a cache layer in this effort.
- Any future cache must key on `(organizerId, businessId, from, to, tz)`; documented here so it is not
  accidentally keyed on the path only.

## 7. Naming and i18n

- Module ids: `snake_case`; i18n keys: `Overview.modules.<id>.title|empty|error`, plus
  `Overview.period.*`, `Overview.attention.*`, `Overview.status.<domain>.<value>`.
- Every string added in this effort ships in `messages/en.json` **and** `messages/fr.json`
  (Decision 8). No hardcoded English in components.
