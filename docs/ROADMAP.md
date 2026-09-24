# Aldriva — Platform Roadmap & Master Phase Sequence

> **Status**: Living Reference  
> **Last Verified**: September 2026

---

## 1. Master Phase Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 0: CODEBASE & CONTINUITY AUDIT                     │
│               [Status: COMPLETE] - Source of Truth Established              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 BUSINESS WEBSITE & COMMERCE ENGINE (Phases 1–6)             │
│                                                                             │
│   Phase 1: Business Website Foundation ──► Phase 2: Public Website Engine   │
│                      │                                     │                │
│                      ▼                                     ▼                │
│   Phase 3: Website Design System       ──► Phase 4: Website Builder/Editor  │
│                      │                                     │                │
│                      ▼                                     ▼                │
│   Phase 5: Products, Services & Menus  ──► Phase 6: Unified Commerce        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 OPERATIONS & BUSINESS MANAGEMENT (Phases 7–8)               │
│                                                                             │
│   Phase 7: Bookings & Reservations     ──► Phase 8: Business Management ERP │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 INTEGRATION & DEVELOPER PLATFORM (Phases 9–12)              │
│                                                                             │
│   Phase 9: Public Developer API        ──► Phase 10: Outbound Webhooks      │
│                      │                                     │                │
│                      ▼                                     ▼                │
│   Phase 11: POS Integration Framework  ──► Phase 12: Custom Domains & SSL   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     ALDRIVA AI & ECOSYSTEM (Phases 13–14)                   │
│                                                                             │
│   Phase 13: Aldriva AI Tenant Engine   ──► Phase 14: External AI Ecosystem  │
│   [Core Guardrails/Tools: Built]                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Phase Detail & Status Breakdown

| Phase | Title | Objective | Dependencies | Current Status |
|---|---|---|---|---|
| **Phase 0** | **Codebase & Documentation Audit** | Reconcile repository reality, verify database migrations, inspect tests, establish agent continuity rules. | None | **COMPLETE** |
| **Phase 1** | **Business Website Foundation** | Data models for multi-page websites, navigation headers/footers, metadata, tenant linkage to `organizers.id`. | Phase 0 | **COMPLETE** |
| **Phase 2** | **Public Website Engine** | Dynamic SSR/SSG rendering engine for tenant websites at `/site/[slug]` or `/org/[slug]/site`. | Phase 1 | **COMPLETE** |
| **Phase 3** | **Website Design System & Template Foundation** | **COMPLETE** — Stages A–K landed: immutable template registry (id@version, multi-page), section envelope & stable IDs, category vs template family (metadata JSONB), atomic instantiation (hydration + idempotency), controlled element editing (whitelisted paths, proto guard), section/container controls (visible/hiddenOnMobile/spacing/background/container with sanitization), stable reordering (MOVE_BLOCK, history, selection), template library preview (read-only, desktop/mobile), My Media (tenant-scoped cms-media). Block catalog complete. | Phase 2 | **COMPLETE (2026-09-24, 650/650)** |
| **Phase 4** | **Template-Driven Visual Website Builder** | **COMPLETE** — Template-driven site creation, instantiation (NewWebsiteClient + atomic RPC), controlled element/section editing, stable reorder (Move Up/Down, no drag lib), My Media picker (5 surfaces), device preview, undo/redo, autosave, publish guard. Preserves builder architecture (no Puck/dnd-kit). | Phase 3 | **COMPLETE (2026-09-24, 650/650)** |
| **Phase 5** | **Products, Services & Menus** | **SCHEMA + ACTIONS + PUBLIC RENDERING DONE; ADMIN UI PARTIAL** — 136 applied live 2026-09-24 (menu_modifiers_valid, no UNIQUE position, renamed enum constraints). Services CRUD + tiers (placeholder tier manager), menu read-only dashboard, public blocks tenant-isolated. Remaining: menu section/item create/edit UI, tier Move Up/Down, QR page plumbing. | Phase 1 | **PARTIAL (2026-09-24, 672/672 hermetic; live DB constraints 23514 verified, RLS/trigger not yet non-admin tested)** |
| **Phase 6** | **Unified Commerce** | Consolidated checkout experience linking physical, digital, and service orders with cart persistence. | Phase 5 | **PLANNED** |
| **Phase 7** | **Bookings & Reservations** | Staff scheduling, appointment slots, capacity management, SMS/Email booking confirmations. | Phase 5, Phase 6 | **PLANNED** |
| **Phase 8** | **Business Management ERP** | Multi-branch operations, employee shift rosters, inventory sync, centralized sales reports. | Phase 6, Phase 7 | **PLANNED** |
| **Phase 9** | **Public Developer API** | Versioned `/v1/*` REST API with API-key authentication, scoped permissions, and rate limits. | Phase 8 | **PLANNED** |
| **Phase 10** | **Outbound Webhooks** | Event notification dispatcher (order.created, booking.confirmed, checkin.completed) with HMAC signatures. | Phase 9 | **PLANNED** |
| **Phase 11** | **POS Integration Framework** | Bi-directional connector for Square, Clover, Toast, and Shopify POS terminals. | Phase 9, Phase 10 | **PLANNED** |
| **Phase 12** | **Custom Domains & SSL** | Multi-tenant domain proxy, automated SSL certificate issuance, DNS verification check. | Phase 2 | **PLANNED** |
| **Phase 13** | **Aldriva AI Expansion** | Tenant-facing AI assistant, customer service auto-responder, WhatsApp/Instagram AI workflows. | Phase 0, Phase 10 | **IN PROGRESS (Core Built)** |
| **Phase 14** | **External AI Ecosystem** | Developer marketplace for custom AI tools, third-party MCP connectors, webhook triggers. | Phase 9, Phase 13 | **PLANNED** |

---

## 3. Guiding Roadmap Principles

1. **Build Upon Established Foundations**: Re-use `organizers.id`, `entity_members`, and existing payment infrastructure rather than creating duplicate tenant models.
2. **Strict Phased Delivery**: Never begin a later phase until its prerequisites have passed linting, type checks, unit tests, and documentation updates.
3. **Continuous Regression Testing**: Maintain 100% pass rate across the test suite (`npm test`) at every step.
