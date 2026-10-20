# Aldriva — Platform Roadmap & Master Phase Sequence

> **Status**: Living Reference
> **Last Verified**: 2026-10-20 (documentation handoff pass; evidence in `docs/project-status.md` and each phase doc's STATUS block)
> Phase numbers 0–14 are **stable identifiers** — they never change meaning. Start new agents at `docs/HANDOFF.md`.

---

## 1. Master Phase Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 0: CODEBASE & CONTINUITY AUDIT                     │
│                  [DONE] - Source of Truth Established                       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 BUSINESS WEBSITE & COMMERCE ENGINE (Phases 1–6)             │
│                                                                             │
│   Phase 1: Business Website Foundation ──► Phase 2: Public Website Engine   │
│              [DONE]                          [DONE]                         │
│                      │                                     │                │
│                      ▼                                     ▼                │
│   Phase 3: Website Design System       ──► Phase 4: Website Builder/Editor  │
│              [DONE]                          [DONE]                         │
│                      │                                     │                │
│                      ▼                                     ▼                │
│   Phase 5: Products, Services & Menus  ──► Phase 6: Unified Commerce        │
│              [PARTIAL]                      [PARTIAL]                       │
│                          ╲                 ╱                                │
│                           ╲               ╱                                 │
│                    Kitchen & Delivery Workstream [PARTIAL, uncommitted]     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 OPERATIONS & BUSINESS MANAGEMENT (Phases 7–8)               │
│                                                                             │
│   Phase 7: Bookings & Reservations     ──► Phase 8: Business Management ERP │
│              [PARTIAL — nav hidden]           [PARTIAL — branches only]     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 INTEGRATION & DEVELOPER PLATFORM (Phases 9–12)              │
│                                                                             │
│   Phase 9: Public Developer API        ──► Phase 10: Outbound Webhooks      │
│              [NOT STARTED]                   [NOT STARTED]                  │
│                      │                                     │                │
│                      ▼                                     ▼                │
│   Phase 11: POS Integration Framework  ──► Phase 12: Custom Domains & SSL   │
│              [NOT STARTED]                   [NOT STARTED]                  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     ALDRIVA AI & ECOSYSTEM (Phases 13–14)                   │
│                                                                             │
│   Phase 13: Aldriva AI Tenant Engine   ──► Phase 14: External AI Ecosystem  │
│   [PARTIAL — AI Operating System built,        [NOT STARTED]                │
│    WhatsApp/IG + tenant assistant missing]                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Phase Detail & Status Breakdown

Status verified 2026-10-20 against code. **VERIFIED** unless noted; evidence in each phase doc's STATUS block.

| Phase | Title | Objective | Dependencies | Current Status |
|---|---|---|---|---|
| **Phase 0** | **Codebase & Documentation Audit** | Reconcile repository reality, verify migrations, establish agent continuity rules. | None | **DONE** (VERIFIED — canonical docs + phase plans exist) |
| **Phase 1** | **Business Website Foundation** | Website data models, navigation, metadata, tenant linkage to `organizers.id`. | Phase 0 | **DONE** (VERIFIED — `db/migration_125_tenant_websites.sql` + rollback, `lib/actions/website.ts`) |
| **Phase 2** | **Public Website Engine** | SSR rendering of tenant sites at `/site/[slug]` with preview mode. | Phase 1 | **DONE** (VERIFIED — `app/site/[slug]/`, `proxy.ts` pre-stream 404 gate) |
| **Phase 3** | **Website Design System & Template Foundation** | Template registry, section envelope, block catalog, embeds, atomic instantiation. | Phase 2 | **DONE** (VERIFIED — `lib/website-blocks.ts`, `components/site/blocks/`, registered test suites) |
| **Phase 4** | **Template-Driven Visual Website Builder** | Draft/publish builder with controlled editing, reorder, media picker, publish guard. | Phase 3 | **DONE** (VERIFIED — `components/dashboard/website/builder/`, `db/migration_129_website_page_drafts_and_publishing_guard.sql`) |
| **Phase 5** | **Products, Services & Menus** | Catalog for services (tiers) and restaurant menus (sections/items/options/dietary). | Phase 1 | **PARTIAL** — schema/actions/UI built (VERIFIED — `db/migration_136`, `lib/actions/{menus,services}.ts`, dashboard routes). **In-flight workstream**: menu options & promotions implemented on `feat/menu-promotions-phase-4` (migrations 182–183 applied on staging; **184 approved, not applied**); open verifications: order snapshot fields in running app, 375px QA, production data inventory. Known gap: services price hardcoded USD (`components/site/blocks/BlockRenderer.tsx:2082`). See `docs/phases/phase-05-products-services.md`. |
| **Phase 6** | **Unified Commerce** | Consolidated cart/checkout across physical, digital, and service orders; discounts; delivery. | Phase 5 | **PARTIAL** — Store cart + checkout, promo codes (177), orders (171), payment intents (173), timing (174), owner-managed delivery (175) all built (VERIFIED — `app/api/checkout/cart`, `lib/store-cart.ts`, `lib/promo-codes.ts`). Missing: automated tax, unified fulfillment dashboard, multi-item crypto cart (VERIFIED NOT FOUND). Includes the **Kitchen & Delivery workstream** (see below). See `docs/phases/phase-06-commerce.md`. |
| **—** | **Kitchen & Delivery workstream** *(named under Phase 6)* | Restaurant kitchen order flow (accept → preparing → ready → notify), cook/courier worker access, lightweight driver dashboard. | Phase 6 | **PARTIAL — code exists but is 100% UNCOMMITTED in one worktree** (VERIFIED — no kitchen commit in any branch, 2026-10-20). Built: migration 185 (worker access), cook invitations/sessions, kitchen dashboard management, `/kitchen/accept`. Not built: order state flow, `/kitchen/display` page, courier registration UI, driver dashboard. See `docs/phases/phase-kitchen-delivery.md`. |
| **Phase 7** | **Bookings & Reservations** | Appointment/reservation schema, booking widget, calendar views, confirmations. | Phase 5, 6 | **PARTIAL** — reservation **request engine** built (VERIFIED — `db/migration_176_reservations.sql`, `lib/actions/reservations.ts`, dashboard + public pages, `phase7-reservations.test.cjs` passing) but **hidden from dashboard navigation** (VERIFIED — no entry in `org-nav-items.ts`). Not built: staff scheduling, appointment slots, capacity, SMS, `.ics` invites. Phase doc still said "PLANNED" until this pass. See `docs/phases/phase-07-bookings.md`. |
| **Phase 8** | **Business Management ERP** | Multi-branch operations, shift rosters, inventory, centralized reports. | Phase 6, 7 | **PARTIAL — branches only** (VERIFIED — `db/migration_132_business_type_and_branches.sql`, `lib/actions/business-branches.ts`, `app/dashboard/businesses/[id]/branches/`). Shifts/rosters/inventory/cross-branch reporting NOT FOUND. Courier/driver management in the kitchen workstream overlaps conceptually but is not Phase-8 code. See `docs/phases/phase-08-business-management.md`. |
| **Phase 9** | **Public Developer API** | Versioned `/v1/*` REST API, API keys, scopes, pagination, standard errors, OpenAPI docs. | Phase 8 | **NOT STARTED** (VERIFIED — no `app/api/v1/`, no `api_keys` table in `db/*.sql`). Today only the internal session-cookie API exists (172 route handlers, unversioned, partly documented in `docs/API.md`). See `docs/phases/phase-09-public-api.md`. |
| **Phase 10** | **Outbound Webhooks** | Event dispatcher (order.created, booking.confirmed, …) with subscriptions, HMAC signatures, retries. | Phase 9 | **NOT STARTED** (VERIFIED — no webhook-subscription tables or dispatch code; only inbound Stripe webhook). See `docs/phases/phase-10-webhooks.md`. |
| **Phase 11** | **POS Integration Framework** | Bi-directional sync with Square, Clover, Toast, Shopify POS. | Phase 9, 10 | **NOT STARTED** (VERIFIED — no `lib/pos*`, no POS routes, no POS references in `*.ts`). See `docs/phases/phase-11-pos.md`. |
| **Phase 12** | **Custom Domains & SSL** | Tenant custom domains, automated SSL, DNS verification. | Phase 2 | **NOT STARTED** (VERIFIED — `proxy.ts` has no Host-based routing). See `docs/phases/phase-12-advanced-web.md`. |
| **Phase 13** | **Aldriva AI** | Tenant-facing AI assistant, WhatsApp/Instagram auto-responder, AI studio. | Phase 0, 10 | **PARTIAL — built shape differs from plan** (VERIFIED). Built: AI Operating System — gateway + 22 tools with allowlists + output guard, agents/sentinel/QA/background-exec/memory/studio chat (admin-only), migrations 139–168. NOT FOUND: `app/api/webhooks/meta` (WhatsApp/IG), `/dashboard/org/[id]/ai` tenant assistant. See `docs/phases/phase-13-aldriva-ai.md`. |
| **Phase 14** | **External AI Ecosystem** | Marketplace of external AI tools/MCP connectors over tenant data. | Phase 9, 13 | **NOT STARTED** (VERIFIED — nothing found). See `docs/phases/phase-14-external-ai.md`. |

Parallel (non-numbered) programs: **Events / Fundraising / Products / Articles / Organizations** — DONE (VERIFIED — routes + registered suites); **R2 media storage** — PARTIAL (`docs/phases/phase-r2-media-storage.md`); **Server-only boundaries** — DONE (`docs/phases/phase-server-only-boundaries.md`).

---

## 3. EXECUTION ORDER

Work top to bottom. Tracks C–E can start only after their dependencies; A and B are sequential.

| Track | Steps | Why this order | Entry point |
|---|---|---|---|
| **A — Finish & verify in-flight work** | 1. Menu options & promotions: owner applies migration **184** on staging → run `db/tests/migration_184_checks.sql` → confirm order snapshot fields in the running app → 375px visual QA → production data inventory. 2. Kitchen & delivery: commit the uncommitted work to an owner-approved branch, then finish the display page + order state flow. | Both workstreams are built-but-unverified; migration 184 is already approved; the kitchen work is uncommitted and at risk of loss. Shipping verified work beats starting new work. | `docs/HANDOFF.md` §5 |
| **B — Core commerce completeness** | 3. Phase 6 gaps (tax engine, unified fulfillment dashboard, multi-item crypto cart). 4. Phase 7 gaps (un-hide reservations navigation, then appointment slots/capacity). 5. Phase 8 (shift rosters, inventory, cross-branch reporting — reconcile with courier/driver model from the kitchen workstream). | Merchant operations must be complete before opening the platform to developers; Phase 7/8 build on Phase 6's order model. | respective phase docs |
| **C — Developer platform** | 6. Phase 9 Public API. 7. Phase 10 Outbound Webhooks. 8. Phase 11 POS. | Hard dependency chain: 10 needs 9's auth/scopes; 11 needs 9+10. Nothing else unblocks them, so they run after the merchant core. | `docs/phases/phase-09-public-api.md` |
| **D — Custom domains** | 9. Phase 12. | Independent of C/B; scheduled late because proxy/hosting risk is highest when everything else is stable. Can be pulled earlier by owner request. | `docs/phases/phase-12-advanced-web.md` |
| **E — AI completion & ecosystem** | 10. Phase 13 completion (WhatsApp/IG auto-responder, tenant assistant). 11. Phase 14. | 13's remaining pieces need Phase 10's webhook engine for messaging channels; 14 depends on 9+10+13. | `docs/phases/phase-13-aldriva-ai.md` |

**No change from the previously proposed order** — the 2026-10-20 audit confirmed it: in-flight work (A) must be verified first (184 unapplied, kitchen uncommitted), and the 9→10→11 dependency chain is real (no API-key or webhook primitives exist yet). The only addition is the Kitchen & Delivery workstream, placed inside Track A/B as Phase 6 work.

---

## 4. Migration numbers

Never reuse the old planned numbers 128–139 from the original phase docs — they are consumed by unrelated migrations (VERIFIED — e.g. actual `db/migration_139_tool_registry.sql` vs planned "139 cart and discounts"). **Assign at build time from the register** in `docs/HANDOFF.md` §6 and `docs/DATABASE.md`. Current reservations: 182–184 menu options/promotions, 185 kitchen/delivery (see register for statuses).

---

## 5. Guiding Roadmap Principles

1. **Build Upon Established Foundations**: Re-use `organizers.id`, `entity_members`, and existing payment infrastructure rather than creating duplicate tenant models.
2. **Strict Phased Delivery**: Never begin a later phase until its prerequisites have passed linting, type checks, unit tests, and documentation updates.
3. **Continuous Regression Testing**: Maintain 100% pass rate across the test suite (`npm test`) at every step.
4. **Evidence Over Assumption**: Status changes in this file require a VERIFIED reference (file, commit, or test).
5. **One Migration, One Number, One Register Entry**: collisions with consumed numbers 128–139 have already happened once; the register prevents a repeat.
