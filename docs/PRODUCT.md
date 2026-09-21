# Aldriva — Product Definition & Ecosystem Overview

> **Version**: 1.0  
> **Status**: Active Living Document  
> **Last Verified**: September 2026

---

## 1. Executive Summary: What is Aldriva?

**Aldriva** is a multi-tenant operating system and digital marketplace that bridges local commerce, event management, cause fundraising, editorial publishing, and AI-driven growth automation for creators, organizers, and businesses.

Rather than fragmenting a business or organizer's operations across multiple disconnected tools (e.g., Eventbrite for tickets, GoFundMe for donations, Shopify/Gumroad for digital products, WordPress for blogging, Buffer/Hootsuite for social marketing), Aldriva unifies these capabilities onto a single canonical entity model (`organizers.id`).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ALDRIVA UNIFIED ECOSYSTEM                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌───────────────┐   ┌───────────────┐   ┌─────────────────────────────┐   │
│   │    EVENTS     │   │  FUNDRAISING  │   │      COMMERCE / SHOP        │   │
│   │ - Tiered Tix  │   │ - Campaigns   │   │ - Digital Deliverables      │   │
│   │ - Seating Eng │   │ - Ledger      │   │ - Asset Protection          │   │
│   │ - Invitations │   │ - Beneficiary │   │ - Stock Management          │   │
│   │ - Scanner PWA │   │ - Donor Wall  │   │ - Order Confirmation        │   │
│   └───────┬───────┘   └───────┬───────┘   └──────────────┬──────────────┘   │
│           │                   │                          │                  │
│           └───────────────────┼──────────────────────────┘                  │
│                               ▼                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │           CANONICAL ENTITY & TENANT MODEL (organizers.id)           │   │
│   │       - Multi-Tier Roles (owner, admin, manager, editor, finance)    │   │
│   │       - Organization Hubs & Verification Trust Badges                │   │
│   │       - Social Following & Activity Graph                           │   │
│   └───────────────────────────────────┬─────────────────────────────────┘   │
│                                       │                                     │
│           ┌───────────────────────────┼──────────────────────────┐          │
│           ▼                           ▼                          ▼          │
│   ┌───────────────┐   ┌─────────────────────────────┐   ┌───────────────┐   │
│   │  EDITORIAL    │   │      ALDRIVA AI STUDIO      │   │ REVIEWS & CRM │   │
│   │ - TipTap CMS  │   │ - Grounded Social Promo     │   │ - Org Reviews │   │
│   │ - TTS Audio   │   │ - Facebook Auto-Publish     │   │ - Ratings     │   │
│   │ - Entity Link │   │ - Tenant AI Tool Execution  │   │ - Identities  │   │
│   └───────────────┘   └─────────────────────────────┘   └───────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Value Propositions & Target Personas

### A. For Event Organizers & Venues
- **Comprehensive Ticketing**: Sell multi-tier, multi-seat tickets with real-time seat mapping, stale-hold double-sell protection, and immediate QR delivery.
- **Visual Seating Engine**: Design custom table, booth, and auditorium layouts with drag-and-drop SVG tools and AI-assisted seating generators.
- **Operations & Check-in**: Manage doors with an offline-capable PWA scanner utilizing IndexedDB local caching and deterministic conflict reconciliation.
- **Invitations & Guest Management**: Import CSV attendee lists, customize digital invitation cards, and track live RSVP statuses.

### B. For Fundraisers & Nonprofits
- **Transparent Campaigns**: Launch verified fundraising campaigns with public goal trackers, video stories, and donor recognition walls.
- **Beneficiary & Ledger Management**: Direct fund attribution through dedicated beneficiary accounts and auditable recipient ledgers.
- **Dual Payment Rail**: Accept debit/credit card payments via Stripe and cryptocurrency via NOWPayments.

### C. For Businesses & Creators
- **Digital Product Commerce**: Monetize downloads, guides, digital art, templates, and event add-ons with tokenized, short-lived signed URLs (~120s TTL) backed by private Supabase storage.
- **Business Directory & Hubs**: Establish verified organizational hubs with team RBAC, follower networks, and customer reviews.
- **AI Growth Automation**: Leverage grounded LLM pipelines (Gemini / OpenRouter) to automatically generate and publish social spotlight campaigns to Meta/Facebook.

### D. For End Users / Community Members
- **Unified Discovery**: Explore local events, community fundraisers, local businesses, and marketplace products in one responsive application.
- **Universal Checkout**: Secure one-click checkout across card and crypto payment rails with instant receipt and ticket issuance.
- **Content Hub**: Read curated articles and listen to synchronized AI-synthesized audio narrations.

---

## 3. Product Domains & Implemented Subsystems

| Domain | Status | Key Implemented Features |
|---|---|---|
| **Events & Ticketing** | **COMPLETE** | Multi-tier ticketing, visual SVG seating builder, multi-seat checkout, QR ticketing, offline door scanner, invitations, team RBAC |
| **Fundraising** | **COMPLETE** | Campaign management, donor wall, ledger credits, beneficiary claims, Stripe + Crypto donations, receipts & certificates |
| **Digital Products / Shop** | **COMPLETE** | Digital asset protection, signed URL delivery, stock management, order confirmation, library downloads |
| **Articles & Editorial CMS** | **COMPLETE** | TipTap rich-text editor, categories/tags, NVIDIA TTS audio narration, editorial approval workflow, XSS sanitization |
| **Entities & Organizations** | **COMPLETE** | Canonical tenant model (`organizers.id`), `entity_members` RBAC, identity verification workflow, reviews, social graph |
| **Growth Studio (Aldriva AI)** | **PARTIAL** | Grounded caption generation, Facebook auto-posting, safe column allowlists, output guards, tenant tool registry (14 tools) |
| **Connected Accounts** | **FOUNDATION** | Schema and data models for Meta/WhatsApp/TikTok/Shopify accounts, tenant-scoped channel assets and customer identities |
| **Website Builder / Pages** | **PLANNED** | Multi-page customizable business websites, blocks, themes, custom domains (Phases 1–4) |
| **Bookings & Reservations** | **PLANNED** | Appointment scheduling, calendar management, staff booking assignments (Phase 7) |
| **POS Integrations** | **PLANNED** | Square, Clover, Toast, Shopify POS synchronization and unified sales reconciliation (Phase 11) |
| **Public Developer API** | **PLANNED** | REST/GraphQL v1 endpoints for external integrations and webhooks (Phases 9–10) |

---

## 4. Product Governance & Boundaries

1. **Merchant of Record**: Aldriva acts as the unified merchant of record for tickets, donations, business listings, and digital products.
2. **Tenant Data Isolation**: Business and entity data are strictly partitioned by `organizers.id` and enforced via Postgres Row Level Security.
3. **AI Safety by Construction**: All generative AI capabilities must adhere to strict structural constraints — safe-column database projections, prompt-injection output guards, and PII filtering.
