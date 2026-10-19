# Aldriva menu, options, ordering, and promotions audit

**Audit date:** 2026-10-19  
**Scope:** Read-only source inspection of the current working tree at C:\Users\Youngyz\aldriva-staging. The worktree was already dirty when inspected; findings describe its checked-out files, including uncommitted files. No code, migration, or data was modified by the investigation. This report is the only requested repository file addition. No database query or test run was performed.

Evidence labels: **VERIFIED** means the behavior/schema was read in code. **INFERRED** means the conclusion goes beyond what repository code can prove. **NOT FOUND** names the paths searched without finding an implementation.

## 1. Executive summary

1. **VERIFIED:** Aldriva is a Next.js App Router application using Supabase/Postgres directly; menu and order tenancy is rooted in organizers, with websites addressed by slug.
2. **VERIFIED:** Menu groups/options exist, but are JSON embedded on each menu item. Owners/editors can create custom groups inline; there is no reusable group library or normalized options schema.
3. **VERIFIED:** Customer ordering uses a mobile item sheet and a browser-local cart. Server code re-reads menu rows, validates option IDs/rules, recalculates totals, and stores an item/options price snapshot in orders.
4. **VERIFIED:** Menu-item promo prices affect ordering totals; builder promo banners are content/placement only. Homepage promotion records and Store promo codes are separate systems.
5. **VERIFIED:** Several target features are partial or missing: option variants, option-level availability/allergens/images/defaults, editable cart selections, no-options quick-add, and popup analytics.
6. **VERIFIED:** The customer quantity UI allows 99, while the shared server calculator accepts at most 50; client price preview also omits the server’s zero-price floor for negative deltas.
7. **NOT VERIFIED:** Source files do not establish production row counts, whether menu/order migrations are deployed, or whether live production data exists. Repository notes say migration 171’s live state was not re-verified.
8. **VERIFIED:** Existing menu/order tests are registered in package.json, but were not run for this read-only audit.

## 2. Architecture overview

### Stack and tenancy

- **VERIFIED:** Next.js 16.3.4 App Router, React 19.2.4, TypeScript, Tailwind CSS 4, Supabase JS/SSR, PostgreSQL, Supabase Auth and Storage, Stripe, Resend, and next-intl are listed in package.json and README.md.
- **VERIFIED:** Database access uses Supabase JS query builders and SQL migrations. No Prisma, Drizzle, Sequelize, or other ORM dependency/model layer was found in package.json or the inspected menu/order code.
- **VERIFIED:** organizers.id is the tenant root. businesses.organizer_id links a business to it; tenant_websites.tenant_id references it (db/migration_125_tenant_websites.sql:9-12). menu_sections.organizer_id, menu_items.organizer_id, and orders.organizer_id are tenant scoped (db/migration_136_services_and_menus.sql:85-93, 136-161; db/migration_171_orders.sql:27-60). Membership roles are checked through requireTenantContext / checkTenantAccess in lib/actions/menus.ts:53-58 and app/dashboard/org/[id]/menu/page.tsx:8-15.
- **INFERRED:** Vercel is a likely deployment target because vercel.json is present and the repository uses Next.js conventions. Repository code cannot prove where the production deployment currently runs.

### Mini-site resolution, builder storage, and rendering

- **VERIFIED:** Public sites are routed as /site/[slug]/.... resolveWebsiteAndPage looks up tenant_websites by slug, checks published status for non-team visitors, then loads published website_pages (app/site/[slug]/[[...page]]/page.tsx:131-150, 195-235). proxy.ts also gates /site/:path* before the route streams (proxy.ts:691-711, 794-797).
- **NOT FOUND:** Custom-domain or business-subdomain resolution in proxy.ts, app/site, db/migration_125_tenant_websites.sql, or the tenant website resolver. The inspected path is slug based; external DNS/domain configuration could exist outside this repository.
- **VERIFIED:** Legacy block-builder pages store live blocks in website_pages; edits go to website_page_drafts through savePageDraft and publishing uses publish_page_draft (lib/actions/website-builder.ts:128-214, 329-448; db/migration_125_tenant_websites.sql and db/migration_129_website_page_drafts_and_publishing_guard.sql).
- **VERIFIED:** Template-first V2 sites store shared content in website_content and website_content_drafts, one JSON document per website (db/migration_168_website_content_store.sql:24-38). saveV2WebsiteAppearanceDraft normalizes and saves draft content (lib/actions/website-v2.ts:82-117); public rendering reads live content while team preview can read drafts (app/site/[slug]/[[...page]]/page.tsx:237-253). The resolver turns the document/template manifest into approved blocks, then shared BlockRenderer renders them.
- **VERIFIED:** Menu content itself is not copied into the builder document. menu_embed blocks reference live menu sections/items resolved by resolveMenuEmbed from the menu tables (lib/website-template-resolver.ts:856-869; lib/website-embeds.ts:344-405; components/site/blocks/BlockRenderer.tsx:2117-2148). Thus content edits/publish state and menu edits have different persistence paths.
- **VERIFIED:** Relevant code is grouped under app/dashboard/org/[id]/menu, components/dashboard/menu, components/dashboard/website/v2, components/site/blocks, lib/actions/menus.ts, lib/menu-pricing.ts, lib/order-submit.ts, lib/website-embeds.ts, and db/ and migration files. The builder and customer site share menu data, MenuManager/StorefrontBrowse, embed resolvers, and menu pricing logic.
- **VERIFIED:** The repository contains restaurant templates restaurant-savannah, restaurant-table-flame, and food-order, as well as rental-driveline and store in lib/website-template-v2.ts:366, 416, 510, 598, 692. The legacy registry also contains restaurant-delight (lib/website-template-registry.ts:152). Rendering is template-aware for presentation, while menu data and ordering components are shared.

## 3. Current state for areas 2–6

### 3.1 Menu system: dashboard, schema, and media

#### Data model

**VERIFIED — categories:** menu_sections functions as the category/section table. Fields: id, organizer_id, name, nullable description, position, is_active, created_at, updated_at (db/migration_136_services_and_menus.sql:83-99). It has a one-to-many relationship to menu items; deleting a section cascades to its items (same file:136-140). There is no separate menu_categories table in the inspected schema.

**VERIFIED — menu items:** menu_items fields are id, section_id, organizer_id, name, nullable description, price, nullable image_url, dietary_tags, allergens, legacy modifiers JSONB, position, is_active, is_featured, created_at, and updated_at (db/migration_136_services_and_menus.sql:136-153). Migration 170 adds is_sold_out (default false), nullable promo_price, and option_groups JSONB (default empty array) (db/migration_170_menu_ordering_data.sql:55-74).

- price is NUMERIC(12,2), bounded from 0 through 999999.99; promo_price must be nonnegative and strictly lower than price.
- is_active is the visibility/status control; this schema has no draft/active/archived status enum for menu rows. is_sold_out leaves an item visible but unavailable for ordering.
- Menu item organizer_id is denormalized and a trigger enforces that it matches the parent section tenant (db/migration_136_services_and_menus.sql:188-210).

**VERIFIED — dietary/allergen values:** dietary_tags is a text[] limited to 12 entries and to vegan, vegetarian, gluten_free, halal, kosher, dairy_free, nut_free. allergens is a text[] limited to 12 and to nuts, dairy, gluten, soy, eggs, shellfish (db/migration_136_services_and_menus.sql:144-160). The lists are hardcoded in both the dashboard form and server action (components/dashboard/menu/MenuItemForm.tsx:15-16; lib/actions/menus.ts:20-21) and repeated as DB CHECK constraints. Restaurants cannot add custom values through the present form/actions. Both tags and allergens attach to the menu item only; options have no allergen field. The form warns that allergen labels are business-entered and unverified (MenuItemForm.tsx:178-187).

#### Dashboard flow and validation

- **VERIFIED:** The page /dashboard/org/[id]/menu checks membership, computes can-edit/can-delete capabilities, loads sections and items using the admin Supabase client, and mounts MenuManager (app/dashboard/org/[id]/menu/page.tsx:7-27).
- **VERIFIED:** There is no menu-specific REST API route in the inspected app/api files. Mutations use Next server actions in lib/actions/menus.ts: createMenuSection, updateMenuSection, deleteMenuSection, createMenuItem, updateMenuItem, deleteMenuItem, reorderMenuSections, reorderMenuItems.
- **VERIFIED:** New item flow can create a section inline when no section is selected; the form validates required price and promo price client-side, then submits name/description/price/promo/image/tags/allergens/modifiers/options/flags to the server action (components/dashboard/menu/MenuItemForm.tsx:61-127).
- **VERIFIED:** Server-side validation covers name 1–80 chars, description up to 500, price bounds, safe image URL, integer position 0–999, allowed tags/allergens, at most 12 legacy modifiers, promo price, and option-group schema (lib/actions/menus.ts:14-80, 177-261, 264-371). A server-side role check occurs before writes.
- **VERIFIED:** Owners, admins, managers, and editors can create/update/reorder; deletion is restricted to owner/admin/manager in the server actions (lib/actions/menus.ts:197-199, 285-287, 374-385, 387-425). The page allows finance/viewer read access, but not edits (app/dashboard/org/[id]/menu/page.tsx:9-15). RLS separately grants public SELECT only for active sections/items and tenant editors write access (db/migration_136_services_and_menus.sql:391-518).

#### Image upload and media

- **VERIFIED:** Item image uses the shared MediaUploadField with folderSubpath menu (MenuItemForm.tsx:164-167). It supports upload, tenant My Media selection, and manual URL; upload uses the public cms-media bucket and a tenant/menu folder path (components/dashboard/website/builder/inspectors/common/MediaUploadField.tsx:15-21, 45-48, 87-139). safeImageSrc validates manual and saved image URLs. No option-level image UI/schema was found.
- **INFERRED:** Image sizing/optimization depends on shared ImageUploader and Supabase storage behavior. The public menu rendering inspected here uses plain img with loading="lazy"; no per-menu responsive source-set or bundle/image performance measurement was found.

### 3.2 Modifiers, option groups, and options

#### Current schema and behavior

- **VERIFIED:** There are no normalized menu_option_groups, menu_options, or menu-item assignment tables in the inspected migrations. All current orderable options live inside each menu_items.option_groups JSONB value (db/migration_170_menu_ordering_data.sql:55-74).
- **VERIFIED:** One menu item may store up to 8 groups. Each group contains id, name, required, integer min, integer max, and ordered options. Each option contains id, name, and numeric price_delta (lib/menu-pricing.ts:9-35, 70-164; DB validator db/migration_170_menu_ordering_data.sql:8-53). Each options array allows at most 20 choices. IDs and array order are stored per item; there is no library relationship or shared option identity across items.
- **VERIFIED:** Group IDs and option IDs are generated in the browser using timestamp/random strings; group/option order is their array order. The editor supports add/remove and group expansion but no default templates or reusable library (components/dashboard/menu/OptionGroupsEditor.tsx:20-105, 111-177).
- **VERIFIED:** The UI exposes group name, required flag, min/max selections, option name and price delta (OptionGroupsEditor.tsx:149-235). A group with max 1 is rendered as radio buttons; max greater than 1 becomes checkboxes (components/site/blocks/StorefrontBrowse.tsx:1103-1117, 1252-1299). There is no explicit single/multiple field; behavior is inferred from max.
- **VERIFIED:** Options accept positive, zero, and negative price deltas, but there is no option type or replacement-price mode. All selected option deltas are added to the item’s effective price (lib/menu-pricing.ts:166-185, 263-317). So size/variant “replace base price” is not modeled separately from add-ons.
- **VERIFIED:** Option records do not include default-selected, free/paid enum, max quantity, sold-out/availability, image, allergen, or quantity multiplier fields. “Free” is represented by delta zero; positive/negative numeric deltas represent price adjustments. Group/option ordering is implicit in JSON array position.
- **VERIFIED:** menu_items.is_sold_out is item-wide. No option-level availability is present in the JSON contract or dashboard editor.
- **VERIFIED:** Legacy menu_items.modifiers is another JSON array of {name, price_delta} entries, max 12 (db/migration_136_services_and_menus.sql:117-134, 148-166; lib/actions/menus.ts:71-81). It is not the order-choice schema: the storefront displays these as detail rows, but order selection and server pricing use option_groups (components/site/blocks/BlockRenderer.tsx:2247-2258; lib/order-submit.ts:302-369). This field is informational/legacy and can duplicate concepts owners may put into option groups.
- **VERIFIED:** Restaurant owners can create fully custom group names and option names inline while creating/editing an item, without a platform list (OptionGroupsEditor.tsx:20-105, 149-235). However, a group is defined only on that item; changing a shared concept requires editing other items separately.
- **VERIFIED:** The editor initializes new groups as optional, min 0, max 1 and options as zero-delta (OptionGroupsEditor.tsx:20-36, 60-72). Empty groups/options can be temporarily edited, but save validation requires a nonempty group name and option names. No owner starter templates or library presets were found.

#### Validation issues observed

- **VERIFIED:** Server validateSelection enforces unknown/duplicate selected IDs, required groups, min and max counts (lib/menu-pricing.ts:193-255). The client allows selections up to max and disables add until each required group’s minimum is met (StorefrontBrowse.tsx:1103-1141).
- **VERIFIED:** The client readiness check only enforces min for groups with required=true, while the server enforces min for all groups. If an optional group is configured with min > 0, the UI can enable add with too few choices and the server rejects it (StorefrontBrowse.tsx:1120-1125; lib/menu-pricing.ts:241-250).
- **VERIFIED:** Dashboard option-group validation checks duplicate group IDs and duplicate option IDs within each group (lib/menu-pricing.ts:83-100, 134-149); the SQL JSON validator does not check those uniqueness rules (db/migration_170_menu_ordering_data.sql:8-50), so direct DB writes/legacy rows could bypass them.

#### Reuse boundaries

- **VERIFIED:** The V2 website editor can open a Menu drawer, but it reuses MenuManager and getFullMenu from the dashboard, operating on the same rows/actions rather than a parallel menu model (components/dashboard/website/v2/V2MenuDrawer.tsx:6-7, 32-43, 117-128).
- **VERIFIED:** V2 featured-menu picks only select item IDs for the template’s menu_embed block; they do not create option groups or define a shared option library (lib/website-template-resolver.ts:856-869; lib/actions/website-v2.ts:442-522).

### 3.3 Customer-facing menu and ordering

- **VERIFIED:** MenuEmbedBlockRenderer calls server-side resolveMenuEmbed; that resolver scopes by organizer/tenant, filters inactive sections and items for public visitors, and returns active menu fields including promo price and option groups (components/site/blocks/BlockRenderer.tsx:2117-2148; lib/website-embeds.ts:344-405). This is a direct Supabase query path, not a separate menu-fetch API route.
- **VERIFIED:** Tapping a dish opens ItemDetailSheet; the restaurant Savannah presentation uses a mobile bottom sheet, and other variants use the shared dialog/sheet component. Choice controls and live line price are shown there (components/site/blocks/StorefrontBrowse.tsx:452-475, 1103-1141, 1143-1158, 1252-1299). A dish without choices still opens the detail sheet and then requires the Add to order button; one-tap card add is not implemented for menu dishes.
- **VERIFIED:** The restaurant flow has a floating/sticky cart bar and an order drawer. The drawer shows chosen option names, quantities, and current line total, and permits quantity change/removal (StorefrontBrowse.tsx:477-526, 1803-1855). It does not expose a control to edit the selected options on an existing cart line; changing choices requires removing/reopening the dish.
- **VERIFIED:** Menu cart state is React state persisted in browser localStorage under aldriva_cart_{slug}. Cart lines contain only itemId, selectedOptionIds, and quantity (StorefrontBrowse.tsx:122-126, 219-246, 274-319). Selected IDs persist with the line, but option names/prices are resolved from the current live catalog, so stale carts can become unorderable after an option is removed.
- **VERIFIED:** Restaurant customer checkout calls the submitOrderRequest server action, or POST /api/orders/payment-intent for online card collection (components/site/blocks/StorefrontBrowse.tsx:1595-1659; lib/actions/orders.ts:76-84; app/api/orders/payment-intent/route.ts). The menu order input sends item IDs, selected option IDs, and quantity—not client prices.
- **VERIFIED:** Server submission resolves site slug to a published tenant website/business, checks ordering/fulfilment gates and rate limits, re-reads menu rows for that organizer, rejects inactive/sold-out items and unknown options, validates rules, and recomputes prices from database values (lib/order-submit.ts:102-175, 294-399). The shared menu-pricing engine is described as authoritative; browser totals are display previews, not trusted inputs.
- **VERIFIED:** effectiveUnitPrice selects valid promo_price; server totals sum selected option deltas and clamp single-item price to at least zero (lib/menu-pricing.ts:166-185, 263-317). The client preview computes base + deltas without the same zero floor (StorefrontBrowse.tsx:1127-1139, 1535-1563), so sufficiently negative options can display a negative total while the server charges zero.
- **VERIFIED:** The item detail UI allows quantity through 99 (StorefrontBrowse.tsx:1423-1437), but computeLineTotal accepts only 1–50 (lib/menu-pricing.ts:37-40, 263-283). order-submit’s initial per-line check accepts up to 99 (lib/order-submit.ts:120-145); a quantity 51–99 can reach the calculator and become an unexpected error. The cart drawer’s quantity increment also has no visible upper bound (StorefrontBrowse.tsx:1834-1849).
- **VERIFIED:** Orders use one orders table, not a separate order-items table. orders.items is JSONB containing line snapshots: item_id, item name, unit/base/promo prices, chosen option {id,name,price_delta} snapshots, quantity, and line total (db/migration_171_orders.sql:27-60; lib/order-submit.ts:328-369, 439-468). This preserves option names and prices independently of future catalog edits. It does not snapshot the option group name.
- **VERIFIED:** Owner dashboard order cards, customer tracking, and email notifications render chosen option names (components/dashboard/orders/OrderCard.tsx:786-800; components/site/OrderTrackingView.tsx:409-422; lib/order-notifications.ts:113-125). A distinct kitchen-ticket output/integration was NOT FOUND in app/dashboard, components, lib, or app/api order paths inspected.
- **VERIFIED:** There is a separate Store product cart and /api/checkout/cart implementation, with product/order and product promo handling. It is not the restaurant menu-order cart; docs/phases/phase-06-commerce.md:23 says the Store cart stays separate, and the menu flow above uses StorefrontBrowse localStorage state.

#### Mobile and performance

- **VERIFIED:** Dish details use a fixed mobile bottom sheet; images in the browse sheet/cards use native img with loading="lazy" (StorefrontBrowse.tsx:1143-1158, 1200-1209, 1420-1450; BlockRenderer.tsx:2390-2392).
- **VERIFIED:** resolveMenuEmbed applies limit to sections, but the subsequent menu_items query has no .limit() call (lib/website-embeds.ts:352-371). A few large sections can therefore load many items and hydrate them into the client browse component; no item virtualization/page slicing occurs in the resolver.
- **NOT FOUND:** Menu-specific bundle-size reports or production mobile performance measurements in the inspected code/tests. The client storefront component is large and interactive; that observation alone does not quantify bundle impact.

### 3.4 Promotions

Promotion behavior is split into distinct systems that are not unified.

#### Menu item promotional price

- **VERIFIED:** Dashboard MenuItemForm has a direct promo-price field (components/dashboard/menu/MenuItemForm.tsx:40-42, 151-162). Server action and SQL require a valid value below base price (lib/actions/menus.ts:208-211, 307-329; db/migration_170_menu_ordering_data.sql:61-65).
- **VERIFIED:** BlockRenderer displays promo price and crossed-out base price; order code uses the promo price as the authoritative unit price (components/site/blocks/BlockRenderer.tsx:2213-2219, 2379-2384; lib/menu-pricing.ts:166-185). This is a real special price, but has no start/end schedule or offer type. It is not shared with the builder CTA promo record.

#### V2 builder promotional banner

- **VERIFIED:** The Savannah template manifest has one optional, default-off promo section with image, eyebrow, headline, text, CTA label, manually entered CTA link, and end date slots (lib/website-template-v2.ts:340-343; lib/website-v2-editor-schema.ts:158).
- **VERIFIED:** The V2 resolver reads the promo content document, falls back to legacy template_extras keys, hides past-end-date banners, and emits cta_banner with variant promo (lib/website-template-resolver.ts:931-1000). The builder preview renders that CTA variant (components/dashboard/website/v2/V2WebsitePreviewClient.tsx:247-260). The content is stored in the website JSON draft/live document, not a promotion table.
- **VERIFIED:** This is display content/placement only. The button_link is not an entity relation and the banner fields do not affect menu/cart/order pricing. No percentage, special-price, free-delivery, or promo-code association is made from the banner.
- **VERIFIED:** Scheduling here is end-date hiding only. No start date, lifecycle pause, duplicate action, priority/conflict rule, impression/click/dismissal/order analytics, or popup behavior was found in the builder promo slot.

#### Homepage promotion table
- **VERIFIED:** migration 134 authors homepage_promotions with id, entity_type, entity_slug, creative_url, media_type, cta_label, position, priority, is_visible, status, starts_at, ends_at, created_by, approved_by, created_at, updated_at (db/migration_134_homepage_promotions.sql:34-54). Entity types are event/business/product/fundraiser/article/organizer; it is polymorphic, has no foreign key, and destination URL generation is documented as application code.
- **VERIFIED:** Table RLS supports public active/visible/in-window reads, creator drafts/pending review, and admin moderation (same file:174 onward; policies around lines 177-289). However, the migration comment calls it a future homepage placement.
- **NOT FOUND:** Any homepage_promotions create/read/render endpoint, dashboard route, or customer-site usage under app, components, or lib. Its schema is not wired into the restaurant builder/customer price path in the inspected working tree. Do not infer that its live table exists or contains rows.

#### Store promo codes and other “promotion” code

- **VERIFIED:** Migration 177 adds tenant-scoped promo_codes for Store multi-item product cart: code, percent/fixed reduction, currency, minimum subtotal, usage cap/counter, start/expiry, active flag and timestamps (db/migration_177_store_promo_codes.sql:23-45). Validation and integer minor-unit discount logic live in lib/promo-codes.ts:13-35, 42-110, 112-149, and Store checkout applies them through lib/store-cart-checkout.ts:310-344. The Stripe webhook increments usage only when paid (app/api/webhooks/stripe/route.ts:820-832, 945-950).
- **VERIFIED:** These promo codes do not enter SubmitOrderRequestInput and do not apply to restaurant orders (lib/order-submit.ts:31-45; no promo-code input in the order calculation at 294-399). Store promo code migration 177 is present as an untracked working-tree file; repository notes say this work made no database write.
- **VERIFIED:** The promo_codes table grants authenticated users SELECT but writes are service-role-only (migration 177:87-102). No dashboard code to create/manage these codes was found; phase-06-commerce.md §13 says owner UI is deferred and codes are provisioned out of band.
- **VERIFIED:** lib/promotionEngine.js and /api/cron/promotion-engine are a separate platform content/social-post promotion workflow, not a restaurant discount or customer-site campaign engine (app/api/cron/promotion-engine/route.js:114-196).

### 3.5 Builder vs dashboard boundary and template behavior

- **VERIFIED:** Menu item/category data and CRUD belong to the menu manager. The legacy website builder controls block placement/appearance and selected sections/items, not menu fields. The V2 editor can open the shared Menu drawer for CRUD and also has featured item ID picks (V2MenuDrawer.tsx:6-7, 32-43, 117-128; V2WebsiteEditor.tsx:179-180, 340-358; lib/website-template-resolver.ts:856-869).
- **VERIFIED:** Promotional menu price is set in MenuItemForm. V2 Savannah promo banner content is in the website builder. Homepage promotions and Store codes have separate schema/backend paths and no verified owner-facing promotions dashboard. Overlap is in the word “promo,” not shared campaign state.
- **VERIFIED:** The public route uses tenant_websites.slug and the selected template manifest/resolver. Template IDs alter style, section choices, and page structure; menu fetching and order validation stay shared through BlockRenderer, resolveMenuEmbed, StorefrontBrowse, and menu-pricing.
- **VERIFIED:** Other templates exist besides restaurant: Store and rental DriveLine are in the V2 registry; other platform template registries also cover non-restaurant site types (lib/website-template-v2.ts:510-692; lib/website-template-registry.ts).
- **NOT FOUND:** A restaurant-only option-group UI, schema, or reusable modifier library in the template builder. Template-specific rendering does not currently create new option capabilities.

### 3.6 Cross-cutting concerns

- **Currency — VERIFIED:** Menu prices are currency-neutral NUMERIC values. Site currency is read from metadata.storefront.currency, otherwise Côte d’Ivoire resolves to XOF and legacy/default sites resolve to USD (lib/website-v2-theme.ts:141-168). New restaurant site creation defaults Table & Flame/Savannah to XOF and other sites to USD (lib/actions/website-v2.ts:273-277). orders.currency snapshots the selected code (migration 171:40-43). Formatting uses Intl helpers (lib/format-locale.ts:15-17; menu embed uses it through lib/money.ts). The current language config is English/French (i18n/routing.ts:3-10). Menu item names/descriptions are not language-keyed in the schema.
- **Permissions — VERIFIED:** Menu writes use owner/admin/manager/editor; menu delete only owner/admin/manager. Order read excludes viewers; update is owner/admin/manager (lib/actions/orders.ts status actions; db/migration_171_orders.sql:75-127). Promotion UI roles cannot be confirmed because no restaurant promotions UI was found; homepage promotion schema has creator/admin policies.
- **Tests — VERIFIED by inspection, NOT RUN:** package.json registers phase2a3-builder-menu, phase2b1-menu-ordering, phase2b2-cart-and-orders, phase3-order-online-payment, phase4bc-orders, services-and-menus, storefront-browse, website-template-v2, and Savannah render/menu suites. They cover schema/pricing/rules, cart behavior, order submission, template currency, and rendering. **NOT FOUND:** a dedicated promotion-dashboard or homepage_promotions test file in the app/lib/components search. No tests were executed for this audit.
- **Known hardcoding/duplication — VERIFIED:** Dietary/allergen enums are duplicated in form, action, and SQL; the legacy modifiers JSON and option_groups JSON overlap conceptually; product promo codes, builder banner, homepage promotion records, and item promo prices are independent systems. V2 resolver also keeps a compatibility fallback from old template_extras promo keys (website-template-resolver.ts:935-950).
- **Known TODO — VERIFIED:** Nearby ServicesEmbedBlockRenderer still has a source TODO for multi-currency and hardcodes $ (components/site/blocks/BlockRenderer.tsx:2080). This is the separate services catalog, not restaurant menu rendering.
- **NOT FOUND:** Item-level custom dietary tags, option-level allergens, kitchen ticket output, or restaurant promo-code create/manage UI in the inspected paths.

## 4. Data model diagram

Text relationship diagram (VERIFIED from the migrations and code):

- organizers.id → businesses.organizer_id and tenant_websites.tenant_id
- organizers.id → many menu_sections → many menu_items
- Each menu_items row embeds modifiers[] and option_groups[] JSON. Within option_groups[]: group {id, name, required, min, max, options[]} → option {id, name, price_delta}. There is no option-group/options table or assignment table.
- Restaurant browser cart: localStorage[aldriva_cart_{site_slug}] → cart lines {itemId, selectedOptionIds[], quantity}. No server cart/session table was found.
- orders stores contact/fulfilment/pricing fields and items[] JSON snapshots. items[].item_id is only a JSON value; there is no relational order_items table/FK. Snapshot options retain selected option ID/name/delta and line prices.
- tenant_websites.id → website_pages and website_content/website_content_drafts. Website content contains the template’s promo banner content, while menu catalogs remain in menu tables.
- Promotion systems are separate: menu_items.promo_price affects menu-order pricing; website_content.promo renders a CTA banner; homepage_promotions is a polymorphic platform homepage schema; promo_codes.tenant_id is applied only in Store product cart checkout.

## 5. Gap analysis

| Target item | Status | Evidence and notes |
|---|---|---|
| Restaurant owner creates custom option groups/options from scratch | DONE | Inline OptionGroupsEditor, saved per item; OptionGroupsEditor.tsx:20-105, 149-235. |
| Editable starter templates for protein/sides/drinks/spice/size | MISSING | No starter/preset source or UI found in components/dashboard/menu or option schema. |
| Inline option creation plus reusable group library | PARTIAL | Inline creation exists; no shared library/table/assignments. |
| Per-item price overrides and per-item hiding of shared options | MISSING | No shared groups to override, no hidden/override fields in JSON schema. |
| Variants replace base price, separate from additive add-ons | MISSING | Only price_delta is applied additively; menu-pricing.ts:263-317. |
| Default selection, free/paid, per-option max quantity, sold-out, reorder, optional image | PARTIAL | Delta allows free/paid and arrays have order; no default, per-option quantity/availability/image; only menu-item sold-out. |
| Fixed standard allergens plus custom tags; allergens on options | PARTIAL | Fixed item-level allergen list exists, no custom tags or option allergen field; MenuItemForm.tsx:15-16, 178-187. |
| Customer bottom sheet, live price, sticky add button, scroll to missing required group | PARTIAL | Sheet/live price/sticky cart exist; no auto-scroll or missing-group focus. StorefrontBrowse.tsx:1120-1141, 1143-1158, 477-498. |
| No-options items add in one tap | MISSING | Dish card opens sheet and requires its Add to order action. |
| Selected options visible/editable in cart and carried to order/kitchen ticket | PARTIAL | Visible in cart, persisted to order snapshot, shown to owner/customer; cannot edit in cart; kitchen ticket NOT FOUND. |
| Server validation, server totals, order snapshot of option labels/prices | DONE | Server reloads menu state, validates IDs/rules and recomputes; JSONB stores chosen options and totals. |
| Dashboard owns promotions; builder only controls placement/style | PARTIAL | Item promo price dashboard-owned; builder banner content-only; no unified dashboard promotion manager. |
| Discount stored on product/offer and reflected in menu/cart/checkout | PARTIAL | Menu promo_price is reflected in menu/order; Store codes affect product checkout; builder banner has no pricing effect. |
| Percentage, special price, free delivery, promo code offers | PARTIAL | Special menu price, Store percentage/fixed codes, and delivery threshold exist separately; no unified offer model. |
| Destination types generated from product/category/pages/external/none selections | MISSING | Builder promo has manually entered button_link; homepage table only has entity type+slug; no shared destination picker. |
| Single-page create/live preview, scheduling, pause/duplicate, hero priority/conflict rules | PARTIAL | Builder preview and banner editor exist; only end-date hide. Homepage schema has date/priority columns but no UI wiring; no pause/duplicate/one-hero rule found. |
| Featured banner, dish card, announcement bar, popup layouts | PARTIAL | Banner and menu dish cards are separate presentation elements, not selectable campaign layouts. No announcement/popup promotion system found. |
| Popup delay/scroll, frequency, exclusion pages, device targeting, accessible dismissal | MISSING | No popup promotion behavior found. |
| Promotion impressions, clicks, dismissals, attributed orders | MISSING | No campaign analytics fields/event path found. |

## 6. Risks and migration concerns
1. **Production data is unknown.** No live database was queried. Current repository notes explicitly state migration 171’s live applied state was not re-verified (docs/CURRENT-STATE.md:129-131). Before schema work, take a read-only inventory of deployed migration state and row counts for menu_sections, menu_items, and orders.
2. **Backfill embedded JSON carefully.** If normalizing option groups, migrate every item’s group/option IDs, names, required/min/max, array order, and price deltas into library/assignment rows. Existing IDs are strings generated by the browser. Preserve per-item copies as a compatibility snapshot until read/write cutover is proven.
3. **Keep legacy modifiers separate until semantics are decided.** modifiers entries are not interactive order choices and do not contain IDs or selection rules. Do not silently merge them into new group data or historical orders.
4. **Do not rewrite historical order snapshots.** Orders embed names and prices, but no group name. Keep those snapshots immutable; use IDs only for any future current-catalog linkage.
5. **Promo migrations need separate treatment.** homepage_promotions, builder website_content.promo, menu promo_price, and Store promo_codes have different ownership/destination/pricing behavior. A unified campaign migration needs explicit source precedence, scope, currency, scheduling, and backward-compatibility rules.
6. **Browser carts hold references, not snapshots.** A deploy that changes option IDs/schema can leave localStorage carts stale. Add versioning/invalid-cart handling or a compatibility parser before changing the JSON contract.
7. **Keep server validation authoritative.** The order submit action uses the Supabase admin client after public request validation. Any new normalized group/option tables need tenant scoping, RLS, availability checks, and server-calculated snapshot prices; accepting client totals would undo the existing protection.
8. **Current implementation mismatches can surface at checkout.** Optional group min counts can pass client readiness but fail server rules; quantities 51–99 can pass form/input checks but exceed calculator maximum 50; negative delta client preview can diverge from the server zero floor.
9. **Promotion schemas are migration files, not proof of live deployment.** Migration 177 is untracked in the inspected worktree and repository notes say no database write was performed. homepage_promotions data and promo-code rows must be inventoried before cutover.
10. **Worktree baseline caveat.** git status --short already showed many modified/untracked files before the report was written. This audit does not assert that those changes are committed or compare them to HEAD.

## 7. Open questions not answerable from source alone

- How many production rows currently exist in menu_sections, menu_items, and orders? Which menu/order/promotion migrations have actually been applied?
- Are there deployed custom domains or reverse-proxy DNS rules outside this repo?
- Is homepage_promotions meant for Aldriva’s main platform homepage or restaurant sites, and is any external moderation/admin tooling managing it?
- Are there production menu option_groups with duplicate IDs, unexpected JSON shapes, or legacy modifiers that owners still depend on?
- Should a size variant replace the base price, be a delta, or support both; should options have quantity multipliers?
- Should menu promo prices be schedulable or stack with option deltas / promo codes?
- Is a kitchen-ticket/print integration expected, or is the dashboard order card the only kitchen handoff?
- Which templates are enabled in the actual production product and which have ordering turned on?
- What bundle-size and device-level performance budgets apply to long restaurant menus?

## 8. Recommended implementation order

| Step | Scope | Effort |
|---|---|---|
| 1 | Decide canonical semantics: variants vs add-ons, quantity, defaults, option availability/allergens, price rounding, and promotion ownership/destinations. | S |
| 2 | Take a read-only deployed-schema/data inventory; record counts and invalid legacy JSON, then define additive normalized schema, tenant RLS, indexes, backfill, and rollback plan. | M |
| 3 | Implement reusable group library and editable starter groups; add per-item assignments, overrides/hide, and inline create/reuse from the item form. Preserve old JSON during rollout. | L |
| 4 | Add missing option fields and dashboard validation: default selection, max quantity, sold-out/availability, reorder, image, option allergens, custom dietary tags as appropriate. | M |
| 5 | Upgrade customer item sheet and cart: min/max messaging, scroll-to-missing, no-option quick add, live server-consistent price preview, edit options in cart, stale-cart migration. | M |
| 6 | Harden server validation and order snapshots against the normalized model; align quantity bounds; include group labels and preserve immutable historical snapshots; define kitchen-ticket output if required. | M |
| 7 | Build a dashboard promotion manager and one canonical offer/pricing model; connect menu, cart, checkout, and delivery offers. Keep display-only banner placement/style in builder and add destination selection. | L |
| 8 | Add campaign scheduling/lifecycle/conflict rules, popup accessibility/frequency/device/page rules, and impressions/clicks/dismissals/attributed-order analytics. | L |
| 9 | Add focused regression tests for migrations/backfill, options/client-server parity, cart editing, promotion pricing, permissions, and template rendering; validate on real mobile viewports and large menus. | M |