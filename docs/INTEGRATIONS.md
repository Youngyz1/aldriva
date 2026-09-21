# Aldriva — External Integrations & Service Providers

> **Status**: Verified Technical Reference  
> **Last Verified**: September 2026

---

## 1. Implemented & Active Integrations

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ALDRIVA PLATFORM CORE                             │
└──────┬────────────┬────────────┬────────────┬────────────┬────────────┬─────┘
       │            │            │            │            │            │
       ▼            ▼            ▼            ▼            ▼            ▼
┌────────────┐┌────────────┐┌────────────┐┌────────────┐┌────────────┐┌────────────┐
│   STRIPE   ││NOWPAYMENTS ││   RESEND   ││  SUPABASE  ││ GOOGLE AI  ││    META    │
│  Payments  ││   Crypto   ││Transact-   ││Auth/DB/    ││  (Gemini)  ││ (Facebook  │
│& Subscript.││  Invoices  ││ional Email ││Storage/RT  ││  LLM Core  ││ Graph API) │
└────────────┘└────────────┘└────────────┘└────────────┘└────────────┘└────────────┘
```

### A. Stripe (Credit & Debit Card Payments)
- **Implementation**: `stripe@22.2.0`, `@stripe/stripe-js`, `@stripe/react-stripe-js`.
- **Authentication**: `STRIPE_SECRET_KEY` (server-side), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (client-side).
- **Architecture**: Single platform merchant of record. Creates hosted Stripe Checkout Sessions for tickets, donations, product orders, and business listing subscriptions.
- **Webhooks**: Handled at `app/api/webhooks/stripe/route.ts` with signature verification via `STRIPE_WEBHOOK_SECRET`.

### B. NOWPayments (Cryptocurrency Invoices)
- **Implementation**: REST API integration (`https://api.nowpayments.io/v1`).
- **Authentication**: `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`.
- **Architecture**: Generates dynamic cryptocurrency payment invoices matching live USD price calculations.
- **Webhooks**: Handled at `app/api/crypto/webhook/route.ts` with HMAC-SHA512 signature validation.

### C. Resend (Transactional Email Delivery)
- **Implementation**: `resend@6.12.4`.
- **Authentication**: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.
- **Usage**: Dispatches PDF donation receipts, donation certificates, digital ticket QR packages, account deletion confirmations, and team invitation links. Domain DKIM verified.

### D. Supabase (Backend as a Service)
- **Postgres Database**: Managed PostgreSQL with row-level security.
- **Supabase Auth**: JWT and session token management with GoTrue and Google OAuth.
- **Supabase Storage**: 7 public buckets + 1 private bucket (`product-assets`) with signed URL generation.
- **Supabase Realtime**: Live change delivery on `notifications` table.

### E. Google AI Studio / Gemini API
- **Implementation**: Native REST integration (`https://generativelanguage.googleapis.com/v1beta`).
- **Authentication**: `GEMINI_API_KEY` (Authorization Key format prefixed with `AQ.`), passed via `x-goog-api-key` header.
- **Model**: `gemini-3.6-flash`. Used for grounded caption generation and article writing assistance. Filters internal chain-of-thought tokens.

### F. OpenRouter (LLM Fallback)
- **Implementation**: Cloud proxy API (`https://openrouter.ai/api/v1`).
- **Authentication**: `OPENROUTER_API_KEY`. Provides failover LLM text generation capabilities.

### G. Meta / Facebook Graph API
- **Implementation**: REST integration with Graph API v20.0 (`lib/facebook.js`, `lib/facebookPublisher.js`).
- **Authentication**: `FB_PAGE_ACCESS_TOKEN`, `FB_PAGE_ID`. Automatically exchanges System User tokens for cached Page Access Tokens.
- **Usage**: Automated feed and photo publishing for social growth spotlight campaigns.

### H. Ticketmaster Discovery API
- **Implementation**: REST integration (`https://app.ticketmaster.com/discovery/v2`).
- **Authentication**: `TICKETMASTER_API_KEY`. Surfaces curated external events with in-memory Data Cache revalidation (600s TTL).

### I. NVIDIA FastPitch TTS
- **Implementation**: REST integration in `lib/audio/nvidia-tts.ts`.
- **Usage**: Synthesizes natural speech audio narration for editorial articles.

---

## 2. Future Planned Integrations

| Provider / Channel | Target Phase | Purpose & Architecture |
|---|---|---|
| **WhatsApp Cloud API** | Phase 13 | Direct customer messaging, order status alerts, and AI auto-response bots. |
| **Instagram Graph API** | Phase 13 | Instagram feed and Reels publishing for business promotions. |
| **Square / Clover / Toast**| Phase 11 | Bi-directional POS inventory sync, in-store sales reconciliation, and digital receipting. |
| **fal.ai / Replicate** | Phase 13 | AI image generation for promotional creatives and blog covers. |
| **ElevenLabs** | Phase 13 | High-fidelity multilingual voice narration for digital media. |
| **Shopify Storefront** | Phase 11 | Syncing external e-commerce product catalogs to Aldriva business hubs. |
