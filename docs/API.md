# Aldriva — API Reference & Endpoint Catalog

> **Status**: Verified Technical Reference  
> **Last Verified**: September 2026

---

## 1. Existing Internal API Routes & Server Endpoints

All internal routes live under `app/api/` and utilize Next.js 16 Route Handlers.

### A. Authentication & Account Management
- `POST /api/account/recover`: Initiates self-service recovery for accounts inside the 14-day deletion grace period.
- `POST /api/account/delete`: Initiates account soft-deletion (`status = 'pending_deletion'`).
- `GET /auth/callback`: OAuth callback handler verifying PKCE state and exchanging authorization codes.

### B. Admin Moderation & Operations (`requireAdmin()` Gated)
- `GET, POST /api/admin/articles`: Article moderation, state transitions, and search.
- `GET, POST /api/admin/businesses`: Business listing reviews and flag management.
- `GET, POST /api/admin/events`: Event approval, status overrides, and visibility boosting.
- `GET, POST /api/admin/fundraisers`: Fundraiser verification, beneficiary approvals, and goal audits.
- `GET, POST /api/admin/products`: Product catalog moderation and asset integrity checks.
- `GET, POST /api/admin/users`: User profile status administration and suspension controls.
- `GET /api/admin/homepage/*`: Homepage hero sliders, featured items, and category curation.

### C. Checkout & Payment Rails
- `POST /api/checkout/session`: Initiates Stripe Checkout Session for event tickets and seat reservations.
- `POST /api/checkout/product`: Initiates Stripe Checkout Session for digital/physical marketplace products.
- `POST /api/checkout/business`: Initiates Stripe Checkout Session for business listing tiers/subscriptions.
- `POST /api/checkout/crypto`: Creates NOWPayments invoice for crypto ticket and donation orders.
- `POST /api/checkout/product-crypto`: Creates NOWPayments invoice for crypto product purchases.
- `POST /api/checkout/business-crypto`: Creates NOWPayments invoice for crypto business subscriptions.
- `POST /api/webhooks/stripe`: Multi-purpose Stripe webhook handler (ticket orders, donations, product fulfillment, subscription lifecycle).
- `POST /api/crypto/webhook`: HMAC-verified NOWPayments IPN webhook receiver with discriminator routing.
- `GET /api/crypto/status`: Polling endpoint for client-side crypto invoice settlement status.

### D. Digital Products & Deliverables
- `GET /api/products/[id]/download`: Generates tokenized, short-lived signed URL (~120s TTL) for entitled product asset downloads.
- `POST /api/products/[id]/upload-url`: Generates signed upload URL for seller asset storage in `product-assets`.
- `POST /api/products/[id]/assets/confirm`: Verifies asset upload completion and registers metadata.
- `POST /api/products/order-lookup`: Buyer order lookup by email and confirmation code.

### E. Events, Seating & Door Operations
- `GET /api/tickets/order-lookup`: Attendee ticket lookup with email proof.
- `POST /api/send-ticket`: Dispatches ticket confirmation email with embedded QR codes.
- `POST /api/invitation/[token]/rsvp`: Public guest RSVP submission handler.
- `POST /api/door/checkin`: Door scanner check-in verification and timestamp recording.
- `POST /api/door/sync-offline`: Batch reconciliation endpoint for offline scanner rosters and conflict logging.

### F. Growth Studio & Background Jobs
- `POST /api/ai/chat`: Admin interactive AI chat with tool dispatch and guard screening.
- `GET /api/cron/daily-post`: Vercel Cron (14:00 UTC) for platform and grounded social spotlight generation.
- `GET /api/cron/promotion-engine`: Vercel Cron (18:00 UTC) for multi-channel campaign rotation.

---

## 2. Server Actions (`lib/actions/*`)

- `lib/actions/articles.ts`: `createArticle`, `updateArticle`, `publishArticle`, `deleteArticle`.
- `lib/actions/businesses.ts`: `createBusiness`, `updateBusiness`, `deleteBusiness`.
- `lib/actions/products.ts`: `createProduct`, `updateProduct`, `deleteProduct`, `toggleProductStatus`.

---

## 3. Future Public Developer API (`/v1/*` — Planned for Phase 9)

The public developer API will be released in Phase 9 with API Key authentication (`X-Aldriva-Key`), tenant scoping, and OpenAPI 3.1 documentation:

```
GET    /v1/businesses
GET    /v1/businesses/:id
GET    /v1/branches
GET    /v1/products
POST   /v1/products
GET    /v1/orders
GET    /v1/customers
GET    /v1/sales
GET    /v1/inventory
POST   /v1/inventory/adjust
GET    /v1/bookings
POST   /v1/bookings
```
