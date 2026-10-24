# Aldriva — Database Architecture, Schema Reference & Migrations

> **Status**: Verified Technical Reference  
> **Canonical Migration Source**: `db/` (Migrations 1 to **192**)
> **Database Engine**: PostgreSQL 15+ (Supabase Managed)  
> **Last Updated**: 2026-10-24 (migration application status remains owner-reported and is not independently queried). Latest authored forward migration in the repository: **192** (early courier dispatch; the owner reports it was applied on staging and its read-only postchecks passed). **There is no `schema_migrations` table**, so applied status is only known where the owner reported it: **134, 136, 170, 171, 177, 181, 182, 183, 185, 186, 187, 189, 190, 192** are reported applied on staging; the owner specifically reports migration 186 verified. **184** is owner-approved but not applied; **188** is authored and not applied; **191** is authored for manual owner application. All other migration statuses are unknown unless stated in the register. Rollback twins are missing for **44** older forward migrations and for **182** (`ls db/migration_182*`). Migration-number reservations live in §5 below and in `docs/HANDOFF.md` §6.

---

## 1. Migration System & Canonical Source

Aldriva maintains two migration tracks:
1. **Canonical Source (`db/`)**: Contains all sequential `migration_NNN_*.sql` files and their corresponding `_rollback.sql` twins. This is the authoritative reference for all schema changes.
2. **Supabase CLI Mirror (`supabase/migrations/`)**: Timestamped CLI-compatible mirrors of migrations (contains NO rollback scripts). Note: `db/` is the sole source of truth; CLI mirrors are optional.

---

## 2. Existing Database Schema by Domain

```
                                      ┌────────────────────────┐
                                      │      auth.users        │
                                      └───────────┬────────────┘
                                                  │ 1:1
                                                  ▼
┌───────────────────────────────┐     ┌────────────────────────┐
│         entity_members        │◄────┤        profiles        │
│ - organizer_id (FK)           │     │ - role (admin/user/org)│
│ - user_id (FK)                │     │ - status (active/del)  │
│ - role (owner..viewer)        │     └────────────────────────┘
└───────────────┬───────────────┘
                │ N:1
                ▼
┌──────────────────────────────────────────────────────────────┐
│                    ORGANIZERS (organizers.id)                │
│                 Canonical Entity / Tenant Root               │
└───────┬───────────────┬───────────────┬───────────────┬──────┘
        │               │               │               │
        ▼               ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│    events    │ │ fundraisers  │ │  businesses  │ │   products   │
└───────┬──────┘ └───────┬──────┘ └──────────────┘ └───────┬──────┘
        │                │                                 │
        ▼                ▼                                 ▼
┌──────────────┐ ┌──────────────┐                  ┌──────────────┐
│   tickets    │ │  donations   │                  │product_assets│
│  & seating   │ │  & ledger    │                  │  & downloads │
└──────────────┘ └──────────────┘                  └──────────────┘
```

### A. Identity, Profiles & Multi-Tenant Entities
- **`profiles`**: User identity extension (`role`: `admin` | `organizer` | `user`; `status`: `active` | `suspended` | `pending_deletion` | `purged`; `deleted_at`, `purge_at`).
- **`organizers`**: Canonical tenant entity. Stores brand name, slug, bio, social links, verification status, and stripe account configuration.
- **`entity_members`**: Organization team memberships (`organizer_id`, `user_id`, `role`: `owner` | `admin` | `manager` | `editor` | `finance` | `viewer`).
- **`organizer_status_audit`**: Audit trail of verification tier changes.

### B. Events, Seating, Invitations & Door Check-in
- **`events`**: Event listings (`organizer_id`, title, slug, venue, coordinates, start/end dates, banner, ticketing settings).
- **`tickets`**: Ticket tiers (`event_id`, name, price, capacity, stock, sales window).
- **`ticket_orders`**: Purchase records (`event_id`, `ticket_id`, buyer name/email, payment ID, total amount, status).
- **`ticket_instances`**: Individual ticket units (`order_id`, `ticket_id`, `seat_id`, unique `qr_code`, security hash, check-in status).
- **`ticket_checkins`**: Door scan log (`ticket_instance_id`, `scanned_by`, scanned timestamp, door location).
- **`ticket_checkin_conflicts`**: Offline scanner conflict log for duplicate or out-of-order scans.
- **`venue_layouts`**: SVG canvas configuration and coordinate boundaries.
- **`seats`**: Discrete seating units (`venue_layout_id`, table number, seat label, status, price override, hold expiration).
- **`event_team_members`**: Event-specific staff permissions (`owner`, `manager`, `scanner`, `checkin`).
- **`event_invitations`**: Guest invitation lifecycle (`event_id`, recipient email, token, RSVP status).
- **`ticket_templates` & `invitation_templates`**: Visual design customizations for printed/digital tickets and invitations.

### C. Fundraising, Donations & Beneficiary Ledger
- **`fundraisers`**: Crowdfunding campaigns (`organizer_id`, goal, raised, title, story, status, beneficiary details).
- **`donations`**: Donation transaction log (donor name, email, amount, fee, payment intent ID, anonymous flag).
- **`recipients`**: Managed payout recipient entities.
- **`recipient_ledger_entries`**: Immutable double-entry financial ledger for allocated campaign funds.
- **`beneficiaries` & `beneficiary_accounts`**: Third-party claim tokens and payout routing accounts.
- **`fundraiser_updates` & `fundraiser_media`**: Campaign progress timeline and media assets.

### D. Digital Products & Marketplace Shop
- **`products`**: Product listings (`seller_id`, `business_id`, name, slug, description, `product_type`: `ebook` | `template` | `audio` | `video` | `bundle` | `software` | `ticket_addon` | `voucher` | `other`, price, stock).
- **`product_orders`**: Purchase transactions (buyer details, payment rail, fulfillment status).
- **`product_assets`**: Digital deliverable metadata (file key in private `product-assets` bucket, file size, mime type).
- **`product_downloads`**: Tokenized download access log with rate limiting and expiration timestamps.

### E. Business Directory & Editorial Publishing
- **`businesses`**: Business listings (`owner_id`, name, slug, industry, `category`, `business_type` (taxonomy `lib/business-taxonomy.ts`, migration 132), listing tier, stripe/crypto subscription IDs). `business_branches` (migration 132) 1:N branches (`business_id`, `label`, `address`, `is_main`, `status` `active|archived`, RLS owner-managed).
- **`events`**: Extended with `subcategory` text (migration 133, taxonomy `lib/event-taxonomy.ts`, indexes `category`/`subcategory`).
- **`profiles`**: Extended with `locale` text (migration 135, `next-intl` i18n, `messages/en.json`/`fr.json`).
- **`homepage_promotions`**: Promotions for `app/page.tsx` (migration 134).
- **`articles`**: Editorial articles (`owner_id`, `organizer_id`, `business_id`, title, slug, body, status, categories, audio linkage).
- **`article_audios`**: NVIDIA TTS synthesized audio waveforms and paragraph timing maps.

### F. Multi-Tenant AI & Messaging Foundations
- **`connected_accounts`**: Social channel connections (Meta, WhatsApp, TikTok, Shopify) linked to `organizers.id`.
- **`channel_assets`**: Pages, phone numbers, and ad accounts belonging to connected accounts.
- **`customer_identities`**: External customer identities linked across channels.
- **`conversations` & `messages`**: Channel message threads distinct from AI assistant chats.
- **`ai_provider_configs`**: Tenant-specific AI model preferences and encrypted API configurations.
- **`ai_tool_invocations`**: Audit log of tenant AI tool executions.
- **`ai_guard_rejections`**: Audit log of prompt injection and PII filter rejections.
- **`ai_content_items`**: AI-generated social captions and marketing snapshots.
- **`ai_knowledge_docs`**: Grounded platform knowledge base and brand accuracy rules.

### G. Tenant Websites & CMS Foundation (migrations 125–131)
- **`tenant_websites`**: Branded mini-website configuration 1:1 `organizers(id)` (`tenant_id`, `slug`, `site_title`, `site_tagline`, `theme_config`, `header_config`, `footer_config`, `seo_title`, `seo_description`, `seo_og_image`, `status` `draft|published|archived`, `metadata JSONB` (migration 130, `websiteCategory` + `templateId/templateVersion` + `creationRequestId`, GIN index, default `'{}'`)).
- **`website_pages`**: Multi-page content (`website_id`, `title`, `slug`, `is_home`, `blocks JSONB`, `sort_order`, `status`, SEO). `UNIQUE(website_id,slug)` + `uq_website_pages_single_home`.
- **`website_navigation`**: Header hierarchy (`website_id UNIQUE`, `items JSONB`).
- **`website_page_drafts`**: Draft vs live (`page_id PK`, `blocks JSONB`, `version INTEGER`, `updated_at`, RLS tenant-isolated, trigger `update_website_page_drafts_updated_at`, migration 129).
- **RLS & Role Enforcement (migration 126)**: SELECT/INSERT/UPDATE allow `editor`; DELETE restricted to `owner|admin|manager`.
- **Atomic Instantiation (migration 131)**: `create_website_from_template(website_id, tenant_id, slug, site_title, …, pages JSONB, navigation JSONB)` — transactional `tenant_websites` + `website_pages` + `website_page_drafts` + `website_navigation`, `ON CONFLICT (tenant_id) DO NOTHING` + `creationRequestId` idempotency, `SECURITY DEFINER` + `search_path=public,pg_temp` + `REVOKE/GRANT service_role`.

---

## 3. Core Database Functions & RPCs

- `is_entity_member(p_organizer_id UUID, p_roles TEXT[])`: Security definer checking user membership across entity tiers.
- `create_website_from_template(… JSONB)`: Transactional RPC (migration 131) — atomic `tenant_websites`+`website_pages`+`website_page_drafts`+`website_navigation`, `ON CONFLICT (tenant_id) DO NOTHING` + `creationRequestId` idempotency, `SECURITY DEFINER` pinned `search_path`.
- `publish_page_draft(p_page_id UUID, p_expected_version INTEGER)`: Atomic publish with `40001` TOCTOU version check, `REVOKE/GRANT service_role` (migration 129).
- `record_product_paid_and_credit(...)`: Idempotent RPC executing product stock decrement, order fulfillment, and ledger crediting.
- `check_in_ticket(p_qr_code TEXT, p_scanned_by UUID, ...)`: Validates ticket instance authenticity, checks previous check-ins, and records entry.
- `trg_update_fundraiser_raised()`: Trigger automatically synchronizing fundraiser `raised` totals upon successful donation insert.
- `handle_new_user()`: Auth trigger provisioning a matching `profiles` record upon Supabase Auth signup.

---

## 4. Future Planned Database Schema

The following tables are planned for future phases (DO NOT create before respective phase commences). **Numbers here are indicative only — always assign the real number from the register in §5.**
- **Bookings scheduling (Phase 7 — see `docs/phases/phase-07-bookings.md`)**: `booking_resources`, `availability_rules`, `time_slots`. (`reservations` already exists via migration 176.)
- **Developer platform (Phase 9)**: `api_keys` + scopes.
- **Webhooks (Phase 10)**: `webhook_subscriptions`, delivery attempts/dead-letter.
- **POS Integration (Phase 11)**: `pos_connections`, normalized sales (per vendor adapter).
- **Custom domains (Phase 12)**: domain + verification records per tenant.
- **Business ERP (Phase 8)**: shift rosters, inventory movements.
- **External AI (Phase 14)**: third-party app/OAuth registry, tool manifests.

> **Historical note (pre-2026-10-20):** the original text here said "Services & Menus (Phase 5 — next migration 136)" and described 130–136 as pending/partially applied. That is now **out of date**: 136 is verified applied on staging, 137+ exist, and the latest forward migration is **185**. The old planned names `migration_128`–`139` are **all consumed** by unrelated migrations (VERIFIED — e.g. 128 = website drafts, 130 = website category, 132 = business branches, 139 = AI tool registry).

---

## 5. Migration Register & Number Reservations (139 → 185)

**Rule:** before writing a migration, list `db/` and `supabase/migrations/` **in every worktree and on every branch** (`git worktree list`, `git ls-tree`), take the next free number, and add a row to this table and to `docs/HANDOFF.md` §6.

**Applied-on-staging status** (owner-reported; no `schema_migrations` table): **134, 136, 170, 171, 177, 181, 182, 183, 185, 186 = reported applied.** The owner specifically confirms migration 186 was verified. **184 = approved, not applied.** Everything else = **UNKNOWN**.

| # | Forward file (`db/`) | Rollback twin | Supabase mirror | Applied on staging |
|---|---|---|---|---|
| 139 | `migration_139_tool_registry.sql` | yes | yes | UNKNOWN |
| 140 | `migration_140_agent_registry.sql` | yes | yes | UNKNOWN |
| 141 | `migration_141_knowledge_foundation.sql` | yes | yes | UNKNOWN |
| 142 | `migration_142_agent_runtime.sql` | yes | yes | UNKNOWN |
| 143 | `migration_143_sentinel_events.sql` | yes | yes | UNKNOWN |
| 144 | `migration_144_sentinel_events_fixes.sql` | yes | yes | UNKNOWN |
| 145 | `migration_145_qa_execution.sql` | yes | yes | UNKNOWN |
| 146 | `migration_146_background_execution.sql` | yes | yes | UNKNOWN |
| 147 | `migration_147_exec_smoke_notify.sql` | yes | yes | UNKNOWN |
| 148 | `migration_148_approval_gated_call_text.sql` | yes | yes | UNKNOWN |
| 149 | `migration_149_agent_memory.sql` | yes | yes | UNKNOWN |
| 150 | `migration_150_memory_hardening.sql` | yes | yes | UNKNOWN |
| 151 | `migration_151_workforce_rls_narrowing.sql` | yes | yes | UNKNOWN |
| 152 | `migration_152_studio_chat_persistence.sql` | yes | yes | UNKNOWN |
| 153 | `migration_153_workforce_grant_hardening.sql` | yes | yes | UNKNOWN |
| 154 | `migration_154_invitation_pages.sql` | yes | yes | UNKNOWN |
| 155 | `migration_155_event_kind.sql` | yes | yes | UNKNOWN |
| 156 | `migration_156_invitation_share_link.sql` | yes | yes | UNKNOWN |
| 157 | `migration_157_public_media_r2.sql` | yes | yes | UNKNOWN |
| 158 | `migration_158_media_buckets_setup.sql` | yes | yes | UNKNOWN |
| 159 | `migration_159_product_asset_storage_provider.sql` | yes | yes | UNKNOWN |
| 160 | `migration_160_public_media_quota_and_targets.sql` | yes | yes | UNKNOWN |
| 161 | `migration_161_configurable_public_media_quota.sql` | yes | yes | UNKNOWN |
| 162 | `migration_162_event_memories.sql` | yes | yes | UNKNOWN |
| 163 | `migration_163_unified_template_rpc.sql` | yes | yes | UNKNOWN |
| 164 | `migration_164_event_staff_labels_badges.sql` | yes | yes | UNKNOWN |
| 165 | `migration_165_event_staff_badge_hardening.sql` | yes | yes | UNKNOWN |
| 166 | `migration_166_invite_token_hash.sql` | yes | yes | UNKNOWN |
| 167 | `migration_167_invitation_music_links.sql` | yes | yes | UNKNOWN |
| 168 | `migration_168_website_content_store.sql` | yes | yes | UNKNOWN |
| 169 | `migration_169_business_offerings.sql` | yes | yes | UNKNOWN |
| 170 | `migration_170_menu_ordering_data.sql` | yes | yes | **applied** |
| 171 | `migration_171_orders.sql` | yes | yes | **applied** |
| 172 | `migration_172_notification_checks_widen.sql` | yes | yes | UNKNOWN |
| 173 | `migration_173_order_online_payment.sql` | yes | yes | UNKNOWN |
| 174 | `migration_174_order_timing.sql` | yes | yes | UNKNOWN |
| 175 | `migration_175_owner_managed_delivery.sql` | yes | yes | UNKNOWN — forward+rollback have **uncommitted edits** (idempotent forward, guard rollback); `db/migration_175_rollback.sql` is an untracked duplicate |
| 176 | `migration_176_reservations.sql` | yes | yes | UNKNOWN |
| 177 | `migration_177_store_promo_codes.sql` | yes | yes | **applied** |
| 178 | `migration_178_universal_page_blocks.sql` | yes | yes | UNKNOWN |
| 179 | `migration_179_romantic_envelope_presets.sql` | yes | yes | UNKNOWN |
| 180 | `migration_180_botanical_reverie.sql` | yes | yes | UNKNOWN |
| 181 | `migration_181_luxe_editorial_invitation_card.sql` | yes | yes | **applied** |
| 182 | `migration_182_menu_option_groups.sql` | **NO ROLLBACK TWIN** | yes | **applied** |
| 183 | `migration_183_menu_option_assignment_cleanup.sql` | yes | yes | **applied** |
| 184 | `migration_184_menu_promotions.sql` | yes | yes | **approved, not applied** (SHA-256 `30fb2d16…5482`) |
| 185 | `migration_185_kitchen_worker_access.sql` | yes | **no mirror** | **Applied on staging per owner report**; not independently queried (owner applies SQL manually) |
| 186 | `migration_186_courier_offers.sql` | yes | **no mirror** | **Applied and verified on staging per owner report**; not independently queried (owner applies SQL manually); rollback, staging cleanup, pre/post-checks, and claim-race SQL included |
| 187 | `migration_187_cook_performance.sql` | yes | no mirror | Owner-reported applied; not independently queried |
| 188 | `migration_188_evergreen_envelope_rsvp.sql` | yes | no mirror | Authored, not applied; paired rollback exists; owner applies manually |
| 189 | `migration_189_courier_pickup_workflow.sql` | yes | `20261022120000_migration_189_courier_pickup_workflow.sql` | **Applied on staging per owner report** |
| 190 | `migration_190_delivery_live_gps.sql` | yes | `20261022130000_migration_190_delivery_live_gps.sql` | Applied on staging per owner report |
| 191 | `migration_191_courier_performance_and_rating.sql` | yes | `20261022140000_migration_191_courier_performance_and_rating.sql` | Authored forward + rollback; mirror exists; owner applies manually |
| 192 | `migration_192_early_courier_dispatch.sql` | yes | `20261024000000_migration_192_early_courier_dispatch.sql` | Owner reports applied on staging and read-only postchecks passed; not independently queried in this session; guarded rollback exists |
| 193+ | — | — | — | **free** as of 2026-10-24 |

**Number reservations by owner/workstream:** 182–184 = menu options & promotions workstream; 185–187 = kitchen & delivery; 188 = Evergreen Envelope RSVP; 189 = courier pickup workflow; 190 = live GPS and transit tracking; 191 = courier performance & customer rating; 192 = early courier dispatch and location sharing reliability. Next free = **193**.

### Read-only verification queries (no `schema_migrations` table)

Run these on staging to confirm live state before trusting the UNKNOWN rows (SELECT-only; they make no changes):

```sql
-- Which of our known tables actually exist (proves selected migrations ran)
SELECT c.relname AS table_name
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('orders','reservations','store_promo_codes','menu_option_groups',
                    'menu_options','menu_item_option_groups','menu_promotions',
                    'business_kitchens','business_workers','business_worker_invitations',
                    'business_worker_sessions','business_kitchen_display_links')
ORDER BY c.relname;

-- Migration 175 CHECK shape (proves which 175 variant is live)
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.orders'::regclass
  AND conname LIKE 'orders_rider%';

-- RLS posture on the newest tables (should be enabled; no anon/authenticated DML grants)
SELECT c.relname, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname LIKE 'business_worker%';
```

