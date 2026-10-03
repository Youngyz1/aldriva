# Aldriva — System Architecture & Technical Design

> **Version**: 1.0  
> **Status**: Verified Technical Reference  
> **Last Verified**: September 2026

---

## 1. High-Level Architecture Topology

```
                                  ┌───────────────────────────┐
                                  │   Clients / Web Browser   │
                                  │ (Desktop, Tablet, Mobile) │
                                  └─────────────┬─────────────┘
                                                │ HTTPS / WSS
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                NEXT.JS 16 APP ROUTER (Edge / Node)                          │
│                                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                                       proxy.ts                                        │  │
│  │   - Session Refresh & Auth Redirects (/dashboard, /admin)                             │  │
│  │   - Account Lifecycle Enforcement (Purged / Suspended accounts blocked)               │  │
│  │   - Pre-Stream Status Gate (Articles, Businesses, Products, Ticketmaster)            │  │
│  │   - Admin Header Injection (x-admin-verified: 1)                                      │  │
│  └──────────────────────────────────────────┬────────────────────────────────────────────┘  │
│                                             │                                               │
│         ┌───────────────────────────────────┼───────────────────────────────────┐           │
│         ▼                                   ▼                                   ▼           │
│  ┌──────────────┐                   ┌──────────────┐                   ┌────────────────┐   │
│  │ Public Pages │                   │  Dashboard   │                   │   Admin Area   │   │
│  │ (SSR/Static) │                   │  (SSR/Auth)  │                   │ (requireAdmin) │   │
│  └──────┬───────┘                   └──────┬───────┘                   └────────┬───────┘   │
│         │                                  │                                    │           │
│         └──────────────────────────────────┼────────────────────────────────────┘           │
│                                            ▼                                                │
│  ┌───────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                               Application Services & Lib Layer                        │  │
│  │  - Auth & RBAC (lib/auth.ts)              - Entity & Tenant Model (lib/entity-auth.ts)│  │
│  │  - Dual Payment Rails (Stripe / Crypto)   - AI Engine & Tool Registry (lib/ai/*)      │  │
│  │  - Seating Engine (lib/seating*.ts)       - Digital Deliverables (lib/digital-prod.ts)│  │
│  └──────────────────────────────────────────┬────────────────────────────────────────────┘  │
└─────────────────────────────────────────────┼───────────────────────────────────────────────┘
                                              │
         ┌────────────────────────────────────┼────────────────────────────────────┐
         ▼                                    ▼                                    ▼
┌───────────────────┐                ┌───────────────────┐                ┌───────────────────┐
│   SUPABASE POSTGRES│                │ SUPABASE STORAGE  │                │ EXTERNAL SERVICES │
│ - 40+ Core Tables │                │ - 7 Public Buckets│                │ - Stripe Payments │
│ - RLS Security    │                │ - 1 Private Bucket│                │ - NOWPayments     │
│ - Triggers & RPCs │                │   (product-assets)│                │ - Resend Email    │
│ - Realtime Pubs   │                │ - 200MB Cap / TTL │                │ - Gemini / Meta   │
└───────────────────┘                └───────────────────┘                └───────────────────┘
```

---

## 2. Frontend & Next.js 16 App Router Architecture

### A. Core Stack
- **Framework**: Next.js 16.3.4 (App Router, Turbopack, React 19.2.4).
- **Styling**: Tailwind CSS v4, Zinc palette base with Orange-600 accents (`text-orange-600`, `bg-orange-600`).
- **Component Primitives**: Radix UI primitives (`@radix-ui/react-*`), Lucide React icons, Framer Motion for animations.
- **Rich Text & Media**: TipTap Editor 3.31 (`@tiptap/react`, `@tiptap/starter-kit`), Leaflet 1.9 for interactive venue maps, jsQR / IDB for offline barcode scanner.

### B. Routing & Pre-Stream Status Code Gate (`proxy.ts`)
Next.js 16 introduces streaming behavior where `notFound()` or dynamic redirects executed after response streaming starts **cannot alter the HTTP 200 status code**.

To maintain strict HTTP semantics and SEO compliance:
1. `proxy.ts` (the Next.js 16 standard replacing `middleware.ts`) intercepts requests before rendering begins.
2. For dynamic slugs (`/articles/:slug`, `/businesses/:slug`, `/products/:slug`, `/external-events/ticketmaster/:id`), `proxy.ts` runs a lightweight REST fetch via `SUPABASE_SERVICE_ROLE_KEY` to evaluate status (`published`, `active`, `archived`) and access rights.
3. If unentitled or non-existent, `proxy.ts` performs an immediate internal rewrite to `/_not-found` with an explicit `404` status header.

---

## 3. Backend & Supabase Client Architecture

To prevent data leaks and maintain strict separation of privileges, three distinct Supabase client instances exist:

| Client File | Construction | Execution Context | RLS Enforcement | Primary Use Case |
|---|---|---|---|---|
| `lib/supabase.ts` | `createBrowserClient()` | Browser / React Client Components | **ENFORCED** (Client session token) | Client-side reads, Realtime subscriptions, form interactions |
| `lib/supabase-server.ts` | `createSupabaseServer()` | Server Components, Server Actions, Route Handlers | **ENFORCED** (Cookie-based auth token) | Authenticated user actions, dashboard rendering, user queries |
| `lib/supabase-admin.ts` | `createSupabaseAdmin()` | Server-only privileged execution | **BYPASSED** (Service role secret) | Background jobs, webhooks, RBAC checks, admin moderation |

---

## 4. Canonical Tenant & Entity Architecture

Aldriva unifies organizations, businesses, venues, and campaigns around a single tenant identity:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ORGANIZERS (organizers.id)                        │
│                     Canonical Entity / Tenant Root Record                   │
└──────┬──────────────────────────────────┬───────────────────────────────────┘
       │ 1:N                              │ 1:N
       ▼                                  ▼
┌───────────────────────────────┐  ┌──────────────────────────────────────────┐
│        ENTITY_MEMBERS         │  │              TENANT RESOURCES            │
│  - user_id → auth.users(id)   │  │  - events (organizer_id)                 │
│  - role: owner | admin |      │  │  - fundraisers (organizer_id)            │
│          manager | editor |   │  │  - products (seller_id, business_id)     │
│          finance | viewer     │  │  - articles (organizer_id, business_id)  │
│  - RLS via is_entity_member() │  │  - connected_accounts (tenant_id)        │
└───────────────────────────────┘  └──────────────────────────────────────────┘
```

- **Membership Enforcement**: `is_entity_member(tenant_id, allowed_roles[])` is a Postgres security definer function used across RLS policies.
- **Server Context Resolution**: `lib/tenant-context.ts` resolves authoritative tenant context from the active session or verified channel asset, never trusting client parameters.

---

## 5. Dual Payment Rails & Commerce Architecture

Aldriva operates as the **single merchant of record** across two distinct payment rails:

```
                                  ┌───────────────────────────┐
                                  │      Checkout Action      │
                                  └─────────────┬─────────────┘
                                                │
                        ┌───────────────────────┴───────────────────────┐
                        ▼                                               ▼
         ┌─────────────────────────────┐                 ┌─────────────────────────────┐
         │     Card Rail (Stripe)      │                 │  Crypto Rail (NOWPayments)  │
         │ - Hosted Checkout Session   │                 │ - Invoice generation        │
         │ - Webhook: /api/webhooks/   │                 │ - Webhook: /api/crypto/     │
         │   stripe                    │                 │   webhook                   │
         └──────────────┬──────────────┘                 └──────────────┬──────────────┘
                        │                                               │
                        └───────────────────────┬───────────────────────┘
                                                ▼
                                 ┌─────────────────────────────┐
                                 │   Order & Entitlement RPC   │
                                 │ - record_product_paid_and_  │
                                 │   credit                    │
                                 │ - check_in_ticket           │
                                 │ - trg_update_fundraiser_    │
                                 │   raised                    │
                                 └─────────────────────────────┘
```

---

## 6. Storage & Digital Asset Delivery

| Bucket | Access | Max Size | Allowed Content | Delivery Method |
|---|---|---|---|---|
| `event-banners` | Public | 10 MB | JPEG, PNG, WebP | Public CDN URL |
| `profile-images` | Public | 5 MB | JPEG, PNG, WebP | Public CDN URL |
| `organizer-banners` | Public | 10 MB | JPEG, PNG, WebP | Public CDN URL |
| `cms-media` | Public | 15 MB | JPEG, PNG, WebP, SVG | Public CDN URL |
| `videos` | Public | 50 MB | MP4, WebM | Public CDN URL |
| `fundraiser-media` | Public | 10 MB | JPEG, PNG, WebP | Public CDN URL |
| `organizer-verification`| Private | 20 MB | PDF, JPEG, PNG | Admin-only Service Role |
| `product-assets` | **Private** | 200 MB | Any digital deliverable | **Signed URLs (~120s TTL)** via `lib/digital-products.ts` |

---

## 7. AI System & Controlled Tool Pipeline (ADR-0002)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Growth Studio / Assistant UI                       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Input Guard & Prompt Sanitizer                    │
│                             (lib/ai/input-guard.ts)                         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Provider Abstraction Router                        │
│            ┌───────────────────────────────────┬───────────────────┐        │
│            │ GeminiProvider (gemini-3.6-flash) │ OpenRouterProvider│        │
│            └───────────────────────────────────┴───────────────────┘        │
└──────────────────┬──────────────────────────────────────────────────────────┘
                   │
         ┌─────────┴─────────────────────────────────┐
         ▼                                           ▼
┌──────────────────────────────────┐        ┌──────────────────────────────────┐
│      Safe Controlled Tools       │        │     Structural Output Guard      │
│    (lib/ai/tools-registry.ts)    │        │     (lib/ai/output-guard.ts)     │
│  - Hard-coded SAFE_COLUMNS       │        │  - System Prompt Echo Detection  │
│  - screenToolResult()            │        │  - Email & Phone PII Filtering   │
│  - Tenant-scoped verification    │        │  - Unknown UUID Leak Prevention  │
└──────────────────────────────────┘        │  - Audit log: ai_guard_rejections│
                                            └──────────────────────────────────┘
```
