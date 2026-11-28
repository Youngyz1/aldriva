# Aldriva — Rental & Vehicle-Fleet Architecture Audit

> **Target File:** `docs/investigation/rental-audit.md`  
> **Branch:** `feat/rental-overview` (created from local `staging`)  
> **Status:** Verified codebase & staging data investigation (read-only audit)  
> **Author:** Pair Programming Agent  
> **Date:** 2026-11-08  

---

## 1. Executive Summary

Aldriva's dashboard overview is capability-driven (`OverviewShell`, `CapabilityOverviewSections`, `MODULE_REGISTRY` in `lib/dashboard/modules.ts`, `DashboardBottomBar`, `StatCard`). While restaurants, retail shops, event organizers, and appointment-based services have operational sections, **rental and vehicle-fleet businesses were deferred** and currently fall through to misleading retail stats ("Gross Sales", "Orders") and a generic fallback card.

This audit investigates the current code, migrations, and live staging database to establish the exact baseline for building a first-class Rental Overview and fleet engine.

---

## 2. Identification of Rental Businesses Today

Rental businesses are identified strictly through code-owned taxonomy and classification heuristics. There is **no database table** for industries or categories (`businesses.industry`, `businesses.category`, and `businesses.business_type` are plain text columns; `lib/business-taxonomy.ts:1-6`).

### 2.1 Taxonomy Hierarchy (`lib/business-taxonomy.ts`)
- **Industry (`:16`):** `"Automotive & Transportation"`
- **Category (`:40, :88`):** `"Vehicle Rental"`
- **Business Types (`:88`):**
  - `"Car Rental"`
  - `"Motorcycle Rental"`
  - `"Van Rental"`
  - `"Truck Rental"`
- **Accommodation Rentals (`:10, :34`):**
  - Industry: `"Accommodation & Hospitality"`
  - Category: `"Rental Property"` (currently unmapped to specific capabilities; falls back to `CONTENT, GALLERY, CUSTOMERS, REVIEWS`).

### 2.2 Capabilities (`lib/business-taxonomy.ts:163-197`)
- **`Car Rental` (`:174`):**
  `["VEHICLES", "VEHICLE_RENTAL", "RESERVATIONS", "DELIVERY", "CUSTOMERS", "PAYMENTS", "MAINTENANCE", "REVIEWS"]`
- **`Motorcycle Rental` (`:175`):**
  `["VEHICLES", "VEHICLE_RENTAL", "RESERVATIONS", "CUSTOMERS", "PAYMENTS"]`
- **`Van Rental` (`:176`):**
  `["VEHICLES", "VEHICLE_RENTAL", "RESERVATIONS", "CUSTOMERS", "PAYMENTS"]`
- **`Truck Rental`:** Not explicitly mapped in `CAPABILITIES_BY_BUSINESS_TYPE`; falls back via category heuristic (`:247`):
  `if (category === "Vehicle Rental") return getCapabilitiesForBusinessType("Car Rental");`

### 2.3 Business Offerings (`lib/business-offerings.ts:37-43`)
Rental offerings are defined in `carRentalOfferings` (`:37`):
- `daily_rental` (kind: `"fact"`)
- `weekly_rental` (kind: `"fact"`)
- `airport_pickup` (kind: `"fact"`)
- `chauffeur` (kind: `"fact"`)
- `delivery_to_customer` (kind: `"feature"`, `requiresCapability: "DELIVERY"`)

> [!IMPORTANT]
> `carRentalOfferings` does **not** include `table_reservations` or `online_ordering`. As a result, the storefront ordering and table reservation gates correctly close (`lib/storefront-features.ts`).

### 2.4 Booking Model (`db/migration_204_reservation_capacity_and_models.sql:30`)
Migration 204 added `businesses.booking_model` (`CHECK (booking_model IN ('capacity', 'appointment', 'resource', 'service_window'))`).
It explicitly classified:
```sql
WHEN category IN ('Vehicle Rental', 'Rental Property', 'Hotel', 'Guest House', 'Resort', 'Venue')
  OR industry IN ('Accommodation & Hospitality') THEN 'resource'
```
The data model already formally classifies vehicle rental as a **`resource`** booking model.

---

## 3. Live Staging Database Audit: Test Organizations

We queried the live staging database directly via service-role client to inspect the organizations cited in project discussions:

| Organization Name | Org ID | Type / Status | Linked Businesses | Actual Data State |
|---|---|---|---|---|
| **Car Rental** | `60ee4921-45bb-46de-9dc9-378b7ae89ef8` | `org_type = 'business'`<br>`status = 'verified'` | **0 businesses** | Has **1 draft event** (`id: 75905b63-...`, "come for the first time so we can mery", `2026-10-30`), 0 fundraisers, 0 services, 0 menu sections, 0 reservations, 0 orders, no website. |
| **Youngyz Cars** | `45a7f427-2a9f-43c3-b2da-62f59893e8de` | `org_type = 'business'`<br>`status = 'verified'` | **1 business** (`47d90df5-047b-...`) | Category: `"Travel Agency"`, Type: `"Leisure Travel"`, Offerings: `['online_ordering', 'pickup']`, `booking_model = 'capacity'`. Has **3 menu sections** ("Main menu", "Tomoto", "Champion"), 0 events, 0 reservations, 0 orders. |

### Key Findings from Staging:
1. **Zero true Vehicle Rental businesses exist on staging.** Querying `businesses` for `category = 'Vehicle Rental'` or `business_type = 'Car Rental'` returned **0 rows**.
2. **`Car Rental` is an event organizer in practice:** Because it has no linked business and 1 event row, `classifyOrganizerDashboardTypes` classifies it as `hasEvents: true, hasBusiness: false`. This was specifically documented in test `lib/__tests__/phase5-overview.test.cjs:611` (`"expected overview descriptors: Car Rental is events-only"`).
3. **`Youngyz Cars` is miscategorized in practice:** It was created under Travel Agency / Leisure Travel with food ordering offerings and menu sections, so it exercises the restaurant/ordering code paths rather than rental paths.
4. **Conclusion:** Any rental testing on staging currently requires either creating a fresh business under Automotive & Transportation → Vehicle Rental → Car Rental or updating `Youngyz Cars`.

---

## 4. Data Model Audit: What Exists vs. What Is Absent

We audited all schema files and migrations (`db/migration_001_*.sql` through `db/migration_223_*.sql`, plus `staging_schema.sql`).

### 4.1 Tables that DO NOT EXIST in the Database
| Expected Domain Table | Status | Evidence |
|---|---|---|
| `vehicles` / `fleet` | **ABSENT (0)** | No migration defines `vehicles`. `db/migration_168_website_content_store.sql` mentions "catalogs (menu/services/fleet/products) stay in their own tables", but fleet was never created. |
| `rental_bookings` | **ABSENT (0)** | No rental booking table exists. |
| `vehicle_availability` / `asset_calendar` | **ABSENT (0)** | No vehicle calendar or blackout dates exist. |
| `drivers` | **ABSENT (0)** | No driver assignment or driver license table exists. |
| `vehicle_pricing` / `rate_plans` | **ABSENT (0)** | No hourly/daily rate structure exists outside of `services.price`. |
| `security_deposits` | **ABSENT (0)** | Only `reservations.deposit_amount` (numeric) exists on table reservations. |

### 4.2 Tables that DO Exist and Are Relevant
1. **`business_branches` (`db/migration_132_business_type_and_branches.sql` & `migration_214`):**
   - Columns: `id, business_id, label, address, city, state, country, phone, is_main, status`.
   - Foreign keys: `orders.branch_id` and `reservations.branch_id` (migration 214).
   - *Relevance:* Fully capable of acting as **Pickup and Return Locations / Depots** for rentals with zero schema changes.
2. **`businesses` (`migration_204`):**
   - Columns: `booking_model` (`'resource'`), `default_stay_minutes`, `max_stay_minutes`.
3. **`services` (`migration_136`, `migration_220`, `migration_222`):**
   - Columns: `id, organizer_id, name, description, duration_minutes, price, currency, is_active, category_id, summary, includes (jsonb), hero_image_url, booking_mode ('timed' | 'date_only')`.
4. **`reservations` (`migration_176`, `migration_204`, `migration_216`, `migration_217`):**
   - Columns: `id, organizer_id, business_id, reservation_number, customer_name, customer_email, customer_phone, starts_at, ends_at, duration_minutes, party_size, status, booking_type, deposit_amount, deposit_currency, booking_details (jsonb), branch_id`.
   - `booking_details` JSONB (`migration_217`) already stores flexible keys: `service_type`, `alt_starts_at`, `terms_accepted_at`, `marketing_opt_in`, `service_id`, `service_title`.
5. **`reservation_resources` (present in `migration_216`):**
   - Unused schema for physical assets with schedule/exceptions tables, but has 0 application integration.

---

## 5. What a Rental Owner Can Do Today

### 5.1 Dashboard Navigation (`lib/org-dashboard-modules.ts` & `lib/dashboard/modules.ts`)
When an owner has a pure `Car Rental` business:
- **Rendered Nav Items:**
  - `Overview` (`/dashboard/org/[id]/overview`)
  - `Website` (`/dashboard/org/[id]/website`)
  - `Reviews` (`/dashboard/org/[id]/reviews`)
  - `Analytics` (`/dashboard/org/[id]/analytics`)
  - `Settings` (`/dashboard/org/[id]/settings`)
- **Suppressed / Hidden Nav Items:**
  - `Fleet` (`id: "fleet"`, `lib/dashboard/modules.ts:245`): **`routeExists: false`**, icon `Car`. Never rendered.
  - `Bookings`: Gated on `BOOKINGS` / `APPOINTMENTS` or active service rows. Not shown for pure Car Rental.
  - `Services`: Requires `SERVICES` capability or service rows.
  - `Menu`, `Promotions`, `Orders`: Requires food capabilities/offerings.
  - `Reservations`: Requires `table_reservations` offering or reservation rows.
- **Mobile Bottom Bar (`DashboardBottomBar.tsx`):**
  Shows `Overview`, `Website` (fallback tab), and `More`.

### 5.2 Public Website Experience (`lib/website-template-v2.ts`)
- **Template:** `RENTAL_DRIVELINE` ("DriveLine", `id: "rental-driveline"`, `:511-549`).
- **Status:** Marked `legacy: true` (`:525`), meaning it is hidden from the new site creation gallery.
- **Blocks Built:** `hero`, `features` ("how-it-works"), `about` ("why-us"), `testimonials`, `faq`, `contact` ("locations", "hours"), `cta_banner`.
- **Commerce Blocks UNBUILT (Pending):**
  - `fleet_cards` (pending block for featured vehicles: *"No fleet table exists yet; featured.vehicle_ids are stored references only"*)
  - `booking_bar` (pending block for search dates + location bar)
  - `addons_table` (pending block for insurance/child seat add-ons)
  - `fleet_grid` (pending block for category-filtered fleet list)
  - `booking_form` (pending block for vehicle checkout)
- **Call-to-Action:** CTA is hardcoded to `"Ask about availability"` (`header.ctaLabel: "Ask about availability"`), routing to contact info or inquiry form.

---

## 6. Overlap with Existing Features & Engine Design Evaluation

### 6.1 Evaluation of Reusing Existing Tables vs. New Dedicated Tables

| Strategy | Architecture | Pros | Cons & Risks | Recommendation |
|---|---|---|---|---|
| **A. Re-use `services` as Vehicles** | Store cars in `services` (e.g. name = "Toyota RAV4", price = daily rate, `booking_mode = 'date_only'`). | • Zero DB migrations.<br>• Instant access to images, categories, and descriptions.<br>• Works with current services actions. | • A service is a service, not an asset: no VIN, license plate, transmission, fuel type, mileage.<br>• No individual inventory tracking (if you have 3 RAV4s, you can't distinguish which is out).<br>• Confusing UX ("Add Service" instead of "Add Vehicle"). | **Reject for long-term; viable only for brochure mockup.** |
| **B. Re-use `reservations` as Rental Bookings** | Set `booking_type = 'rental'`, store vehicle ID, driver info, and dates in `booking_details`. | • Reuses existing date intervals (`starts_at`, `ends_at`).<br>• Reuses customer fields and deposit columns.<br>• Integrates with existing scan codes (`R1-...`). | • `reservations` capacity checking (`migration_204`/`218`) checks headcounts/covers, not asset availability.<br>• Concurrency collisions if two book the same vehicle.<br>• `reservations` table is already overloaded across restaurants, clinics, and cleanings. | **Viable hybrid: use `reservations` for booking records, but pair with a discrete `vehicles` table for unit tracking.** |
| **C. Dedicated Rental Tables** | `vehicles` (assets) + `rental_bookings` (or clean `reservations` link). | • Clean domain model (VIN, plates, fuel, mileage, maintenance status).<br>• Real availability calendar & overlapping date prevention.<br>• Supports multi-unit fleets and instant dispatch. | • Requires new migrations and CRUD actions. | **Recommended.** |

### 6.2 Evaluation of the Proposed Unified Rental Engine Design
> **Proposed:** One rental engine supporting several booking models (`unit`, `inventory`, `venue`, `stay`), per-type field templates in JSON on listings, and a multi-select "What do you rent?" setup step.

1. **What in the codebase supports it:**
   - **`businesses.booking_model` (`migration_204`):** Already has `'resource'` model. Expanding this to distinguish discrete units (vehicles/rooms) from bulk inventory (tools/event gear) fits the existing enum pattern.
   - **JSONB Schema Pattern:** The repo heavily uses JSONB for vertical-specific fields: `website_content.content`, `services.includes`, `reservations.booking_details`. Storing vehicle specs (`transmission`, `fuel_type`, `seats`, `doors`, `air_conditioning`) or stay specs (`beds`, `baths`) as JSON on a core asset listing conforms directly with repository precedent.
   - **Branch / Depot Infrastructure:** `business_branches` is already built, tenant-isolated, and foreign-keyed to orders and reservations. Rentals can use `pickup_branch_id` and `return_branch_id` immediately.
2. **Where the setup step hooks in:**
   - **Business Creation / Edit Form (`NewBusinessFormClient.tsx:338` & `EditBusinessFormClient.tsx`):**
     Currently, when an owner selects an industry/category, `getBusinessOfferings()` displays static checkboxes. When `category === 'Vehicle Rental'` (or any resource rental category), hook in a **"Rental Setup / Asset Types"** multi-select (`Cars`, `SUVs`, `Vans`, `Motorcycles`, `Equipment`).
   - **Website Builder (`OrderingPaymentsPanel.tsx` / Settings):**
     Add a dedicated "Rental Configuration" panel for deposit policies, minimum rental duration, and branch pickup rules.

---

## 7. Scanner and Receipt Relevance

### 7.1 Scan Registry (`db/migration_212_scan_codes.sql` & `migration_214`)
- **Existing Capabilities:**
  - Issues QR codes with format `R1-<alphanumeric>` for reservations and `O1-...` for orders.
  - Scan execution engine (`lib/scan-actions/run.ts`) logs atomic scan events (`begin_scan_event` / `finalize_scan_event`).
  - Supported actions: `check_in`, `pick_up`, `deliver`, `refund`, `seat`, `no_show`.
- **Relevance to Rentals:**
  - **Pickup Workflow:** A customer arrives with their booking QR. The staff scans it using the existing door/mobile scanner. The action is **`pick_up`** (already in `migration_214`'s CHECK constraint!). This records the timestamp and hands over the asset.
  - **Return Workflow:** On vehicle return, a **`return`** scan action (needs small migration addition to `migration_214` CHECK constraint or handled as a status transition) can record return mileage, fuel level, and condition.

### 7.2 Receipts (`lib/receipt.ts` & Print Systems)
- **Existing Capabilities:**
  - Donation PDF generator (`generateReceiptPdf` using `pdfkit`).
  - Storefront itemized order receipts (`components/site/OrderTrackingView.tsx:890`).
  - Table bill itemization & staff settlement (`lib/table-bill.ts`).
- **Relevance to Rentals:**
  - Rentals contractually require a **Rental Handover Agreement & Receipt**: booking reference, daily rate breakdown, refundable deposit, pickup/return dates, and fuel/damage condition report.
  - This can cleanly reuse the `pdfkit` generation pipeline in `lib/receipt.ts` or an HTML printable receipt format.

---

## 8. What the Generic Fallback Overview Shows Today (and Why It's Weak)

When a rental owner opens `/dashboard/org/[id]/overview` today:

1. **Top StatCards (`overview/page.tsx:598-612`):**
   - Because `hasCommerce` includes `|| organizerTypes.hasBusiness`, it unconditionally displays:
     - **"Gross Sales" ($0.00)**
     - **"Orders" (0)**
   - Because `Car Rental` has `RESERVATIONS` in taxonomy, it also shows:
     - **"Bookings" (0)** — linking to `/dashboard/org/[id]/reservations` (which is hidden in the nav).
2. **Setup Banner (`overview/page.tsx:595`):**
   - Shows generic business steps ("Add menu items" / "Configure hours" / "Customize website").
3. **QuickActions (`overview/page.tsx:658` & `lib/overview-resolver.ts:327`):**
   - Only shows **"Edit Website"**. There is no button to add a car, review a fleet, or take a booking.
4. **Capability Sections (`CapabilityOverviewSections.tsx:128`):**
   - Shows `BookingsSection` with:
     - KPI tiles: Total Scheduled (0), Confirmed (0), Pending Approval (0).
     - Empty state: *"No bookings scheduled in this period. [Open Bookings]"* (broken link).
   - If capabilities are unmapped, it renders the generic fallback card:
     - *"Your business workspace is active. Manage your website, customize your details, and collect customer reviews directly from this dashboard."*

### Why this is weak:
- **Zero fleet semantics:** No vehicle count, no availability, no active rentals, no license plates.
- **Wrong commerce language:** Uses restaurant/retail terms ("Orders", "Menu", "Guests").
- **Dead ends:** Prompts the owner to "Open Bookings" or "Reservations", leading to pages that are hidden or designed exclusively for dining tables.

---

## 9. Proposed Rental Overview Specification

Using the standardized Aldriva Overview components (`OverviewShell`, `StatCard`, `ModuleSection`, `StatusChip`, `EmptyState`), a rental-specific section should look like this:

### 9.1 Top Summary StatCards
| Card Label | Proposed Metric | Status / Feasibility |
|---|---|---|
| **Fleet Size** | Total active vehicles registered | **Needs a migration** (requires `vehicles` table) |
| **Available Now** | Vehicles currently in depot and not booked | **Needs a migration** (requires `vehicles.status`) |
| **Out on Rental** | Vehicles currently dispatched to customers | **Needs a migration** (requires `vehicles.status` / booking linkage) |
| **Bookings Today** | Pickups scheduled for the current site date | **Exists now** (if query filters `reservations.booking_type = 'rental'`) |
| **Overdue Returns** | Rentals past `ends_at` not marked returned | **Needs a migration** (or UI query on `reservations.ends_at < now()`) |
| **Gross Rental Revenue** | Total rental income for selected period | **Exists now** (if recording transaction rows) |

### 9.2 Operational Sections (Replacing Restaurant/Orders Sections)
1. **Fleet Dispatch & Returns Queue (Operational Section):**
   - Two tabs: **Today's Pickups** (starts_at = today) and **Today's Returns** (ends_at = today).
   - Rows display: Customer name, Vehicle model, Pickup/Return Branch, Rental duration (e.g. "3 days"), Deposit status (`paid` / `pending`), and Quick Scan button.
2. **Fleet Utilization Strip:**
   - Visual progress bar: e.g. "8 of 12 vehicles out (67% utilization)".
3. **Quick Actions:**
   - `Add Vehicle` (routes to `/dashboard/org/[id]/fleet/new`)
   - `New Booking` (manual telephone reservation entry)
   - `Scan Handover` (opens door scanner in rental mode)
   - `Edit Website`

---

## 10. Risks, Open Questions & Staged Implementation Plan

### 10.1 Key Architectural Risks
1. **Overloading `reservations`:** Storing vehicles, drivers, odometer readings, and rental contracts entirely inside `reservations.booking_details` risks repeating the same technical debt that occurred before migration 218 split table covers from appointment slots.
2. **Double-Booking Race Conditions:** Without a discrete `vehicle_id` foreign key and unique interval exclusion constraint (or advisory lock), concurrent customers could book the same vehicle for overlapping dates.
3. **Primary Business Selection Hazard:** `app/dashboard/org/[id]/overview/page.tsx:105` selects `eligibleBusinesses[0]` without an explicit `.order()`. If an organizer has both a car rental and a restaurant, the overview could unpredictably switch capabilities.

### 10.2 Open Questions for Product / Stakeholders
1. **Booking Model:** Do rental customers book a **specific vehicle** (e.g. "2024 Toyota RAV4, Plate ABC-123") or a **category/class** (e.g. "Compact SUV or similar", with physical car assigned at handover)?
2. **Pricing Structure:** Is pricing strictly **daily** (24h blocks), or do we need **hourly** rentals and weekly/monthly discounted rates?
3. **Deposit Handling:** Does the platform pre-authorize deposits via Stripe, or are deposits collected offline in cash/card at the counter?

### 10.3 Staged Implementation Plan (Small Vertical Slices)

```mermaid
flowchart LR
    A["Slice 1: Fleet Catalog (Read/Write)"] --> B["Slice 2: Rental Overview Dashboard"]
    B --> C["Slice 3: Booking Flow & Availability"]
    C --> D["Slice 4: QR Handover & Return Scanner"]
```

#### Slice 1: Fleet Catalog (Admin Core)
- **Migration:** Safe, additive migration creating `public.vehicles` (`id, organizer_id, business_id, branch_id, name, model, make, year, license_plate, category, transmission, seats, daily_rate, currency, status, photo_url, specs jsonb`).
- **Dashboard UI:** Turn `lib/dashboard/modules.ts`'s `fleet` module to `routeExists: true`. Implement `/dashboard/org/[id]/fleet` listing and `/new` form.

#### Slice 2: Dedicated Rental Overview (Current Task Scope)
- **Capability Mapping:** Add `VEHICLES` / `VEHICLE_RENTAL` to `CapabilityOverviewSections.tsx`.
- **UI:** Mount a `RentalFleetSection` showing Fleet KPI cards (Fleet Size, Out, Available), Today's Pickups/Returns queue, and appropriate empty states.
- **Clean Overview Header:** Suppress "Gross Sales" / "Orders" when business capability is strictly `VEHICLE_RENTAL`.

#### Slice 3: Storefront & Booking Flow
- **Website V2 Block:** Build the pending `fleet_cards` and `booking_bar` blocks in `RENTAL_DRIVELINE` (`components/site/blocks/`).
- **Booking Creation:** Store rental bookings with dates and assigned vehicle/category.

#### Slice 4: Handover, Scanner & Receipts
- **Scanner:** Support `pick_up` and `return` scan actions via `lib/scan-actions/`.
- **Receipt:** Generate PDF Handover Agreement with vehicle condition check.

---

## 11. Audit Completion Notice

This audit is completely read-only. No application code, database migrations, or dependencies were altered. The report is saved to `docs/investigation/rental-audit.md`.
