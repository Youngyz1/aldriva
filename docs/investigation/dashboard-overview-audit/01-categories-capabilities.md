# 01 — Categories, Capabilities, Organizers, Roles

All claims tagged CONFIRMED / INFERRED / UNKNOWN. Line numbers are from the working tree at
`303ed15ed` (branch `chore/remove-all-invitation-templates`).

## A1. Where the business taxonomy lives

`lib/business-taxonomy.ts` is the single code-owned taxonomy. There is **no database table** for
industry/category/type; the columns are plain `text` validated in code.

> "Code-owned authoritative taxonomy: Industry → Category → Business Type → Capabilities … No DB tables for
> taxonomy; businesses.industry/category/business_type remain text with code validation."
> — `lib/business-taxonomy.ts:1-6` **CONFIRMED**

| Layer | Location | Count |
|---|---|---|
| Industries | `INDUSTRIES`, `:9-28` | 19 |
| Categories per industry | `CATEGORIES_BY_INDUSTRY`, `:30-72` | 6 per industry (varies) |
| Business types per category | `BUSINESS_TYPES_BY_CATEGORY`, `:~74-119` | 1–4 per category |
| Capability vocabulary | `CAPABILITIES`, `:121-159` | **37 keys** |
| Type → capability map | `CAPABILITIES_BY_BUSINESS_TYPE`, `:163-197` | **26 types only** |
| Resolvers | `:238-252` | — |

**Capability keys (37), verbatim:** `PRODUCTS, SERVICES, ORDERS, ONLINE_ORDERING, ONLINE_PAYMENT, BOOKINGS,
RESERVATIONS, APPOINTMENTS, DELIVERY, PICKUP, MENU, TABLES, INVENTORY, POS, CUSTOMERS, STAFF, BRANCHES, PAYMENTS,
REVIEWS, GALLERY, PORTFOLIO, VEHICLES, VEHICLE_RENTAL, ROOMS, MAINTENANCE, QUOTES, INVOICING, SUBSCRIPTIONS,
MEMBERSHIPS, EVENTS, TICKETING, DONATIONS, CONTENT, BLOG, MESSAGING, MARKETING, ANALYTICS`. **CONFIRMED**

**The 26 mapped business types:** Full-Service Restaurant, Fast Food / Quick Service, Specialty Restaurant,
Fine Dining, Coffee Shop, Bakery Café, Boutique Hotel, Supermarket, Grocery Store, Boutique, Car Rental,
Motorcycle Rental, Van Rental, Residential Cleaning, Commercial Cleaning, Specialized Cleaning, Photography
Studio, Wedding Photography, Gym, Yoga Studio, Hair Salon, Barbershop, General Clinic, Dental Practice,
Nonprofit Organization, Custom Business. **CONFIRMED**

**Everything else falls through.** `getCapabilitiesForBusinessType` returns
`CAPABILITIES_BY_BUSINESS_TYPE["Custom Business"] = ["CONTENT","GALLERY","CUSTOMERS","REVIEWS"]` for any type not
in that map (`:238-240`). All other verticals in `BUSINESS_TYPES_BY_CATEGORY` (e.g. Hotel, Legal, Pharmacy,
Auto Repair & Sales, Travel Agency, School, Church, Farm, Plumber, Real Estate Agency…) therefore have **no
commerce capability at all**. **CONFIRMED** — this is a structural cause of "the dashboard has nothing for my
category", not a UI bug.

**Category-level heuristics exist for only four categories** (`:242-251`): `Restaurant → Full-Service Restaurant`,
`Vehicle Rental → Car Rental`, `Cleaning → Residential Cleaning`, `Photography → Photography Studio`. All other
categories with a missing/invalid `business_type` get the generic four. **CONFIRMED**

## A2. Where the owner chooses capabilities

Capabilities are **never chosen by the owner**. They are derived from `industry + category + business_type`.
What the owner selects is a separate, smaller vocabulary of **offerings**.

- Stable offering keys: `lib/business-offerings.ts:17-60`. Facts (`dine_in, catering, outdoor_seating, parking,
  wifi, live_music, daily_rental, weekly_rental, airport_pickup, chauffeur, …`) and features
  (`pickup, delivery, online_ordering, online_payment, table_reservations, delivery_to_customer`).
- Feature offerings require a capability in the catalog (`requiresCapability`), but validation deliberately
  accepts **any known key for any business type**
  (`validateBusinessOfferings`, `:130-160`, comment "Owner rule: any known key validates for any business type").
  **CONFIRMED**
- The builder panel always shows the same five feature keys for every business
  (`BUILDER_FEATURE_OFFERING_KEYS`, `:74-91`). **CONFIRMED**
- Storage: `businesses.offerings` (read as an array in
  `app/dashboard/org/[id]/overview/page.tsx:257-259` and `app/dashboard/org/[id]/layout.tsx:110-121`).
  **CONFIRMED** (column type text[] vs jsonb not asserted — see `03` and `11`.)
- The creation form was **not** located in the files searched; `app/dashboard/businesses/new/page.tsx` does not
  mention `offerings`. **UNKNOWN** whether offerings are selectable at creation or only from the website builder
  ordering panel (`components/dashboard/website/v2/OrderingPaymentsPanel.tsx` exists).

**Consequence:** a clinic can tick `online_ordering` + `table_reservations` (allowed by validation even though the
business type lacks `ORDERS`/`RESERVATIONS`). The storefront gates close (`lib/storefront-features.ts:96-160`
returns `needs_setup — not supported by business type`), but the **dashboard overview does not read that same
gate** for its Today strip (see `05`). **CONFIRMED** mechanism; **INFERRED** that this is how the observed
"restaurant modules on a clinic" arises.

## A3. Where capabilities drive the dashboard (three separate registries)

| Surface | File | Gate used |
|---|---|---|
| Org workspace nav + mobile drawer + org pill nav | `lib/org-dashboard-modules.ts` (`ORG_NAV_MODULES`, `:52-85`) | organizer-type flags, product count, **capability OR rows**, plus *offering* checks for `orders`/`reservations` (`:145-175`) |
| Business shell `/dashboard/businesses/[id]/*` | `lib/business-dashboard-modules.ts` (`BUSINESS_MODULES`, `:26-133`) | capability only, `routeExists:false` hides 4 modules, reservations additionally requires `resolveStorefrontFeatures()` |
| Org overview widgets | `lib/overview-resolver.ts` | capability + offerings + features + approval + counts |
| Business category profile (public) | `lib/profile-modules.ts` | `org_type` only; **all 10 org types get the same four modules** (`:39-50`) |

**These are not reconciled with each other.** Concrete divergence: `Orders` is hidden in nav without the
`online_ordering` offering (`lib/org-dashboard-modules.ts:157-161`) but the overview's attention strip will still
link to `…/orders?tab=needs_attention` whenever `pendingOrders > 0`
(`lib/overview-resolver.ts:145-173`). **CONFIRMED**

`lib/business-dashboard-modules.ts` marks `orders` and `reservations` `routeExists:false` (`:41,50`) even though
`app/dashboard/org/[id]/orders` and `/reservations` exist; the comment in `lib/org-dashboard-modules.ts:26-29`
says reservations shipped. Stale flag. **CONFIRMED**

## A4. Organizer types and scoping

Two different type systems exist and must not be confused:

1. **Dashboard denominator — row existence.** `lib/organizer-dashboard-classifier.ts:28-42`:
   `hasEvents = any non-deleted event row`, `hasFundraisers = any non-deleted fundraiser row`,
   `hasBusiness = any business that is not soft-deleted and not "archived"` (`:22-24`).
   Offsets/totals never classify. **CONFIRMED**
2. **Public profile denominator — `organizers.org_type`.** 10 values in `lib/profile-modules.ts:16-27`
   (`nonprofit, business, church, school, creator, community, government, restaurant, sports_club, other`).
   Only affects the public profile module list. **CONFIRMED**

**Tenant identity is `organizers.id`.** `app/dashboard/org/[id]/layout.tsx:24-56` resolves the org row, checks
`checkTenantAccess`, and renders the sidebar from a **capability union across every eligible linked business**
(`lib/org-dashboard-modules.ts:196-214`). **CONFIRMED**

**Primary business selection.** `const primaryBusiness = eligibleBusinesses[0] ?? null`
(`app/dashboard/org/[id]/overview/page.tsx:105-108`). The `businesses` query has **no `.order()`**
(`:64-78`), so the driver returns arbitrary order. Capabilities, offerings, hours, logo and approval state all
come from that one row (`:248-255`, `:115-118`, `:283-290`). **CONFIRMED risk.**

## A5. Roles and permissions that change what is visible

`lib/entity-auth.ts:14-16` defines six roles: `owner, admin, manager, editor, finance, viewer`.
`ENTITY_ROLES_MANAGE = [owner, admin, manager]`; `ENTITY_ROLES_FINANCE_VIEW` is explicitly **unused**
(`:21-28`, "Not yet consumed by any route or RLS policy").

- Overview admits all six (`app/dashboard/org/[id]/overview/page.tsx:33-40`). **CONFIRMED**
- `canUserManage` gates only the *add* actions and some labels (`lib/overview-resolver.ts:24-28`,
  `:327-360`). `viewer` still receives quick actions (tested at `lib/__tests__/phase5-overview.test.cjs`,
  "viewer role: quick_actions still present"). **CONFIRMED**
- `finance` sees no distinct financial view; it gets the same cards as `viewer`. **CONFIRMED**
  (contradicts the intent recorded in `lib/entity-auth.ts:23-27`).
- Orders/reservations pages admit `owner/admin/manager/editor/finance` and gate mutations to
  `owner/admin/manager` (`app/dashboard/org/[id]/orders/page.tsx:21-22,37`,
  `app/dashboard/org/[id]/reservations/page.tsx:24-26,55`). **CONFIRMED**
- RLS mirrors the same role sets for `orders` (`db/migration_171_orders.sql:60-125`) and `reservations`
  (`db/migration_176_reservations.sql:62-130`). **CONFIRMED**

## A6. Summary table — category → what the overview currently shows

| Business type (capabilities) | Today strip? | Quick actions | Extra modules in nav |
|---|---|---|---|
| Full-Service Restaurant (`MENU, ORDERS, …`) | yes | Add dish, Edit website | Menu, Promotions, Orders\*, Reservations\*, Kitchen, Tables & QR |
| Boutique (`PRODUCTS, ORDERS, …`) | yes | Edit website (secondary) | Shop (only if product rows) |
| General Clinic (`SERVICES, APPOINTMENTS, …`) | **yes (orders copy)** | Add service, Edit website | Services |
| Residential Cleaning (`SERVICES, BOOKINGS, …`) | **yes (orders copy)** | Add service, Edit website | Services |
| Car Rental (`VEHICLES, VEHICLE_RENTAL, …`) | **yes (orders copy)** | Edit website (primary) | none (Fleet reserved) |
| Nonprofit (`DONATIONS, EVENTS, TICKETING, …`) | **yes (orders copy)** | Edit website | Events (if rows) |
| Custom/unmapped | **yes** (PRODUCTS? no — `can_have_products` only if PRODUCTS) | Edit website | Reviews, Analytics, Settings |

\* Orders/Reservations additionally require the corresponding offering or existing rows
(`lib/org-dashboard-modules.ts:145-175`). The **Today strip does not apply that same offering gate** — see `05`.
