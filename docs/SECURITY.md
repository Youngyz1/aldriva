# Aldriva — Security Architecture & Access Control Specification

> **Status**: Verified Technical Reference  
> **Last Verified**: September 2026

---

## 1. Security Architecture Overview

Aldriva implements a multi-layered defense-in-depth model across HTTP routing, application logic, database Row Level Security, AI pipelines, and file storage.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. ROUTING & HTTP LAYER (proxy.ts, CSP, Next.js 16 Edge)                    │
│    - Session Refresh & Suspended/Purged Account Blocking                     │
│    - Pre-Stream REST Gate (Prevents HTTP 200 on missing/private content)    │
│    - Strict Dynamic Content Security Policy (Disabled unsafe-eval)          │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. APPLICATION & RBAC LAYER (lib/auth.ts, lib/entity-auth.ts)               │
│    - requireAdmin() server-component gate + x-admin-verified header check   │
│    - Entity-level role checks (owner, admin, manager, editor, finance)       │
│    - Generic error responses (no raw stack/db leak to clients)              │
│    - SSRF Guard on import URLs & DOMPurify on user HTML                     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. AI SAFETY & PIPELINE LAYER (lib/ai/*, ADR-0002)                          │
│    - Input Guard & Prompt Sanitization                                      │
│    - SAFE_COLUMNS projection (No SELECT * allowed in AI tools)              │
│    - Output Guard: PII filter, system prompt echo, unknown UUID block       │
│    - Audit Logging to ai_guard_rejections & Admin Panel Review               │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. DATABASE & RLS LAYER (PostgreSQL 15+, Supabase)                          │
│    - Row Level Security enabled across all public tables                    │
│    - is_entity_member() security definer functions                          │
│    - Revoked public EXECUTE on sensitive RPCs                               │
│    - Service-role isolation (Supabase Admin bypasses RLS on server only)    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. STORAGE & ASSET PROTECTION                                               │
│    - Private product-assets bucket (deliverables inaccessible via public URL)│
│    - Server-generated signed URLs with ~120s TTL                             │
│    - File size caps (50MB video, 200MB product assets) & MIME enforcement   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Implemented Security Controls

### A. Pre-Stream Routing & Status Code Integrity (`proxy.ts`)
- In Next.js 16, streaming starts before server component `notFound()` handlers run. `proxy.ts` queries the Supabase REST API via service role before rendering begins.
- Private, draft, or deleted articles, businesses, products, and external events are rewritten to `/_not-found` with an explicit `404` status header.
- Suspended and purged accounts are blocked from accessing `/dashboard` or `/admin` and signed out immediately.

### B. RBAC & Admin Privilege Separation (`lib/auth.ts`)
- Server components in `app/admin/*` call `requireAdmin()`.
- Role verification uses `React.cache()` to deduplicate profile queries.
- `proxy.ts` strips any incoming `x-admin-verified` client header and re-injects it only after verifying the user's active admin profile.

### C. Multi-Tenant Isolation & Least Privilege
- Tenant isolation is anchored to `organizers.id`.
- Entity membership is checked via `entity_members` and the `is_entity_member(tenant_id, roles)` Postgres helper.
- Standard roles: `owner`, `admin`, `manager`, `editor`, `finance`, `viewer`.
- Tables revoke blanket permissions (`DELETE`, `TRUNCATE`) from `anon` and `authenticated` roles.

### D. AI Tool Safety & Output Validation (ADR-0002)
- Models are **never** given direct database access or raw SQL query tools.
- Every tool in `lib/ai/tools/*` defines a `SAFE_COLUMNS` string excluding internal notes, billing tokens, password hashes, and deleted timestamps.
- Model outputs pass through `guardBeforeDisplay()` (`lib/ai/output-guard.ts`) screening for:
  - System prompt echoes (e.g., `[INST]`, `You are an AI assistant`).
  - Email and phone PII patterns.
  - Ungrounded UUIDs (IDs not present in query tool results).
- Violations are logged to `ai_guard_rejections` and viewable at `/admin/ai/rejections`.

### E. Payment Webhook Verification & Idempotency
- Stripe webhooks verify HMAC signatures against `STRIPE_WEBHOOK_SECRET`.
- Crypto webhooks verify HMAC-SHA512 signatures against `NOWPAYMENTS_IPN_SECRET`.
- Order fulfillment RPCs (`record_product_paid_and_credit`) enforce idempotent execution via conditional status checks (`status != 'paid'`) to prevent double-crediting.

### F. Door Ticketing & Anti-Double-Sell Guarantees
- Multi-seat checkout acquires transient seat reservations with automatic expiration to prevent simultaneous double-booking.
- Door check-in RPC (`check_in_ticket`) verifies HMAC token signatures and prevents duplicate entry across online and offline scanners.

---

## 3. Future Security Requirements

| Area | Requirement | Target Phase |
|---|---|---|
| **OAuth Token Storage** | Encrypt third-party tokens (Meta, WhatsApp, TikTok) using Supabase Vault or AWS KMS. | Phase 13 |
| **Public API Authentication** | Issue hashed API keys with granular scope permissions and IP whitelisting. | Phase 9 |
| **Outbound Webhooks** | Sign outbound webhook payloads with HMAC-SHA256 headers (`X-Aldriva-Signature`). | Phase 10 |
| **POS Connector Security** | Enforce mutual TLS and automated token rotation for local POS terminal bridges. | Phase 11 |
