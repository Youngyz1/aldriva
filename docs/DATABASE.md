# Aldriva — Database Architecture, Schema Reference & Migrations

> **Status**: Verified Technical Reference  
> **Canonical Migration Source**: `db/` (Migrations 1 to 135)  
> **Database Engine**: PostgreSQL 15+ (Supabase Managed)  
> **Last Verified**: 2026-09-24 — 650/650 tests, `npx tsc --noEmit --skipLibCheck` 0, build Pass. Migrations **130–131 (Business Mini Website)** + **132–135 (taxonomy/promotions/i18n)** present in repository; **130–133 verified applied** (per CURRENT-STATE), **134–135 pending live application** (not claimed live).

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

The following tables are planned for future phases (DO NOT create before respective phase commences):
- **Services & Menus (Phase 5 — next migration 136)**: `services`, `service_tiers`, `menu_sections`, `menu_items`.
- **Bookings (Phase 7)**: `booking_resources`, `booking_slots`, `reservations`.
- **POS Integration (Phase 11)**: `pos_connectors`, `pos_sync_logs`, `normalized_sales`.

> **Note:** Migrations 130–135 are **present in repository** (`db/` canonical + `supabase/migrations/` mirrors without rollbacks). Migrations **130–133 verified applied** per `docs/CURRENT-STATE.md` (130 metadata, 131 atomic, 132 business_type/branches, 133 event subcategory). Migrations **134–135 (promotions, locale) pending live application** — not claimed live (hermetic tests only).
