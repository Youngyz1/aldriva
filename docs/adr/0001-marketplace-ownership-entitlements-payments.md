# ADR 0001: Ownership, Entitlements, and Payment Status in the Fund4Good Marketplace

**Status:** Retroactive — documents Phases 1–2 as built, written before Phase 3 (Products)
**Date:** 2026-07-11
**Scope:** `articles`, `businesses`, and the two payment rails (Stripe, NOWPayments crypto) that grant access to them

## 1. Why this document exists

Phase 1 (Articles) and Phase 2 (Business Listings) were built without a formal ADR. Phase 3 (Products) is required to "reuse the exact same entitlements/monetization pattern built for Business Listings" — but that pattern was never written down, and it turns out to differ in a few important ways from what the original phased plan assumed (particularly around crypto payments, which the original plan didn't mention at all). This document records what's actually in the database and code today, verified directly against the live Supabase schema and the current codebase, then reconciles it against the Phase 3 spec.

Everything under §2–§8 is a description of **existing, shipped behavior** — not a proposal. §9 is the actual decision record for Phase 3.

## 2. Current schema (verified live via Supabase MCP, 2026-07-11)

### `articles` (Phase 1, extended in Phase 2)
```
id               uuid PK
owner_id         uuid NOT NULL  → auth.users(id) ON DELETE CASCADE
organizer_id     uuid NULL      → organizers(id) ON DELETE SET NULL
business_id      uuid NULL      → businesses(id) ON DELETE SET NULL   -- added in Phase 2
title, slug, excerpt, body, cover_image_url
categories       text[]   (renamed from singular `category` in migration_35)
tags             text[]
seo_title, seo_description, canonical_url
visibility       text  'public' | 'private'
status           text  'draft' | 'published' | 'scheduled' | 'archived' | 'expired' | 'rejected'
published_at, scheduled_for, reading_time
created_at, updated_at
```

### `businesses` (Phase 2)
```
id                        uuid PK
owner_id                  uuid NOT NULL → auth.users(id) ON DELETE CASCADE
name, slug, description, industry, category
logo, website, email, phone, address, city, state, country
listing_tier              text  'free' | 'one_time' | 'subscription'
status                    text  'active' | 'pending_payment' | 'expired'   (default 'pending_payment')
is_flagged                boolean (default false)
stripe_price_id           text NULL
stripe_subscription_id    text NULL
current_period_end        timestamptz NULL
crypto_payment_id         text NULL     -- NOWPayments order_id, our own generated UUID
seo_title, seo_description
created_at, updated_at
```

### Related tables referenced below
- `organizers` — a separate, older "public creator profile" entity (used by events/fundraisers), keyed by `user_id`. **Not** the same concept as `businesses`, and not connected to it — a business has no `organizer_id`.
- `profiles` — base identity: `role` ('admin'|'organizer'|'user'), `status` ('active'|'suspended'). This is what RLS and `lib/auth.ts` actually check for admin/active gating, not `auth.users` directly.

**There is no `entitlements` table anywhere in the schema.** Entitlement state lives directly on the resource being paid for (`businesses.status`), not in a separate ledger.

## 3. Ownership model

Documented explicitly in `migration_35_articles_fixes.sql`'s own header comment (itself a small retroactive ADR fragment):

> `owner_id`: platform-wide convention for all user-owned content tables (articles, businesses, products). The spec's "author_id" was informal naming. `owner_id` is used consistently going forward.

Confirmed by the live schema: both `articles.owner_id` and `businesses.owner_id` are `NOT NULL` FKs straight to `auth.users(id)`, `ON DELETE CASCADE`. There is no polymorphic `owner_type` + `owner_id` pattern — each table gets its own dedicated FK column(s). `articles` additionally carries two *optional* affiliation FKs (`organizer_id`, `business_id`) that don't change who owns the row, only who else it's associated with for display/attribution purposes.

**Decision already made, carried forward:** every content table has exactly one non-nullable `owner_id → auth.users(id)`. Optional affiliations (to an `organizers` row or a `businesses` row) are separate nullable FK columns, not a substitute for `owner_id`.

## 4. Permissions model

Three layers, consistently applied to both `articles` and `businesses`:

1. **`proxy.ts`** — route-level. Redirects unauthenticated users off protected paths, blocks suspended accounts, and (articles-only, so far) does a pre-stream REST check for draft/private/scheduled/expired/rejected content so a real HTTP 404 can be returned before Next.js starts streaming a 200. Businesses currently has no equivalent proxy-level gate — its access control is RLS + admin-layout only, since it doesn't have private/scheduled visibility states, only tiers/status.
2. **`app/admin/layout.tsx` → `requireAdmin()`** — blocks the entire `/admin/*` tree for non-admins, checked via `profiles.role='admin' AND profiles.status='active'`.
3. **Postgres RLS**, identical shape on both tables:
   - Public SELECT: gated on the resource's own "is this live" condition (`status='published' AND visibility='public'` for articles; `status='active' AND is_flagged=false` for businesses).
   - Owner SELECT/UPDATE: `auth.uid() = owner_id`.
   - Owner DELETE: restricted to non-live states only (`status='draft'` for articles; `status != 'active'` for businesses) — you can't self-delete a live, paid-for listing.
   - Admin ALL: `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role='admin' AND status='active')`.

**Decision already made, carried forward:** no separate permissions/ACL table. Access is always derived live from row ownership + `profiles.role`/`profiles.status`, re-evaluated per-request via RLS, with the same four-policy shape (public read / owner read+write / owner delete-if-not-live / admin all).

## 5. The actual monetization / entitlement pattern (Business Listings, Phase 2)

This is the part Phase 3 is told to reuse verbatim, so it needs to be precise.

**Core mechanism: the entitlement *is* a status column on the resource itself, flipped by a payment webhook — never set by the client.**

- `businesses.status` starts at `'pending_payment'` (the column default) regardless of `listing_tier`.
- The *only* code paths that set `status = 'active'` are the two payment webhooks below.
- The public SELECT RLS policy requires `status = 'active'`, so "is entitled" and "is publicly visible" are the same boolean, read from the same column. There is no separate `is_paid` flag and no `entitlements` join table.

**Two independent payment rails converge on that one column:**

| | Stripe | Crypto (NOWPayments) |
|---|---|---|
| Checkout init | `POST /api/checkout/business` — creates a Stripe Checkout **Session** (redirect, not embedded Elements), mode `payment` or `subscription` depending on `listing_tier`, using pre-created Stripe Price IDs from env (`STRIPE_PRICE_BUSINESS_ONETIME`, `STRIPE_PRICE_BUSINESS_SUB`) | `POST /api/checkout/business-crypto` — creates a NOWPayments **invoice** for a hardcoded USD amount (`{one_time: 49, subscription: 19}`), independent of Stripe's price objects |
| Correlation ID | Stripe's own `session.id` / `metadata.business_id` | Our own `crypto.randomUUID()`, stored in `businesses.crypto_payment_id` *before* redirecting the user, so the webhook has something to match on |
| Webhook | `POST /api/webhooks/stripe` (shared with tickets & donations — dispatches on `event.type` then `metadata.kind === "business"`) | `POST /api/crypto/webhook` (shared with tickets & donations — dispatches by **trying each table in turn** for a row matching the IDs in the payload; no explicit `kind` field) |
| Webhook auth | Stripe signature (`stripe-signature` header, `STRIPE_WEBHOOK_SECRET`) | HMAC-SHA512 over the sorted-key JSON body (`x-nowpayments-sig` header, `NOWPAYMENTS_IPN_SECRET`) |
| On success | `UPDATE businesses SET status='active', stripe_subscription_id=…, current_period_end=…, stripe_price_id=… WHERE id=… AND status != 'active'` (idempotency via the `.neq` guard) | `UPDATE businesses SET status='active', current_period_end = now()+30d (subscription tier only) WHERE crypto_payment_id = order_id AND status != 'active'` |
| Subscription renewal | Stripe manages billing; `customer.subscription.deleted` webhook flips `status` back to `'expired'` | **Not handled.** A crypto "subscription" is a one-time 30-day grant with no renewal or expiry-check mechanism wired up. This is a real gap, not a design choice — flagged in §7. |
| Payment failure | `invoice.payment_failed` is logged only; status is left alone deliberately, to let Stripe's own dunning/retry flow resolve it | No equivalent — NOWPayments invoices don't have a retry concept in this integration |

**UI**: a single client component (`BusinessRowActions.tsx`) renders a "Payment Method" modal with two options (Card via Stripe / Crypto via NOWPayments) side by side, then does a full-page redirect (`window.location.href`) to whichever provider's hosted checkout page. This is **not** the `components/payments/*` barrel (`StripeProvider`, `PaymentForm`, `OrderSummary`, `CheckoutShell`) — those are Stripe Elements components used for the *inline* ticket/donation PaymentElement flow. Business listings use hosted Stripe Checkout Sessions instead, so none of the Elements components are involved.

**Merchant of record**: every Stripe call in the codebase uses the single platform `STRIPE_SECRET_KEY` — no Stripe Connect, no `stripe_account` header, no destination/application-fee charges anywhere. Fund4Good is the sole merchant of record for tickets, donations, and business listings alike.

## 6. URL structure

| Purpose | Pattern |
|---|---|
| Public catalog | `/businesses`, `/articles` (flat, not nested under anything) |
| Public detail | `/businesses/[slug]`, `/articles/[slug]` |
| Article taxonomy | `/articles/category/[category]`, `/articles/tag/[tag]` |
| Owner CRUD | `/dashboard/businesses`, `/dashboard/businesses/new`, `/dashboard/businesses/[id]/edit` — **note: edit routes key on `id`, not `slug`** |
| Admin moderation | `/admin/businesses`, `/admin/articles` (both now grouped under the "Marketplace" sidebar section) |

## 7. Structured data

- `businesses/[slug]`: `LocalBusiness` JSON-LD with a nested `PostalAddress`.
- `articles/[slug]`: `BlogPosting` JSON-LD.
- Both are emitted inline as `<script type="application/ld+json">` in the page component itself, not via a shared helper — each page hand-rolls its own JSON-LD object literal.

## 8. Shared systems

- **`app/api/webhooks/stripe/route.ts`** is a single multi-purpose endpoint. It branches on `event.type` (`payment_intent.succeeded`, `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`), and within `checkout.session.completed` branches again on `session.metadata.kind` (`"donation"` | `"business"` | ticket-default). **This is the file and dispatch pattern Phase 3 must extend, not replace.**
- **`app/api/crypto/webhook/route.ts`** is the crypto equivalent, but dispatches differently: it has no `kind` metadata field, and instead sequentially probes `donations`, then `ticket_orders`, then `businesses` for a row matching the incoming `order_id`/`invoice_id`. This is a materially different (and more fragile — string/UUID collision risk grows with each new table added) dispatch strategy than the Stripe webhook's explicit tag. Worth fixing when Products is added rather than perpetuating a third time.
- **`app/sitemap.ts`** is one file covering every content type; each type is its own query block filtered to its "publicly live" condition (mirroring each table's own RLS predicate) and appended to the output array, capped at `limit(5000)` per type.
- **`components/Navbar.tsx`** primary nav is a flat array of `{ label, href, icon }` objects (see lines ~30–33, where "Articles" and "Businesses" already live) — adding "Shop"/"Products" is a one-line addition to that array, not a structural change.

## 9. Decisions carried forward into Phase 3 (the actual ADR)

These are ratified as the pattern Phase 3 must follow, per the instruction to reuse Phase 2's approach:

1. **Ownership**: `products.seller_id` should follow the *same convention as everything else* — a required, non-nullable `owner_id`-style FK, plus an *optional* affiliation. Concretely:
   - Keep a `NOT NULL seller_id → auth.users(id) ON DELETE CASCADE` (renamed from the platform's `owner_id` convention only because the Phase 3 spec explicitly names it `seller_id` — recommend aligning to `owner_id` for consistency unless there's a strong reason to diverge, since every other table uses that name).
   - Add a **separate, nullable** `business_id → businesses(id) ON DELETE SET NULL` column, exactly mirroring how `articles.business_id` was added in migration_35/36 — nullable from day one, FK added once `businesses` exists (it already does, so Products can add the FK immediately rather than in two steps like articles had to).
   - Do **not** make the seller a polymorphic "user or business" single column. The existing pattern never does that — it always keeps the required user owner and the optional business affiliation as two separate columns. A product sold "as a business" is still owned by the user who created it (`seller_id = auth.uid()`), optionally also tagged with `business_id` for display/attribution, exactly like an article can be owned by a user and optionally tagged with a business.
   - This directly answers the spec's open question ("seller_id references a Business or a user — confirm which per the ADR"): **it's a user, always, with an optional business tag** — not an either/or FK.

2. **Entitlement mechanism**: no `entitlements` table for Phase 3 either. `products.status` (`active` | `out_of_stock` | `archived`, per spec) is the right shape and matches the existing pattern of "status column doubles as the public-visibility gate." Stock decrement on purchase (spec requirement) is a webhook-driven `UPDATE`, same idempotency pattern as the business-activation `.neq("status","active")` guard — use `.gt("stock_quantity", 0)` or a similar guard so concurrent webhook retries can't double-decrement.

3. **Payment rails — reconciling the spec's Stripe-only assumption against what's actually built**: the original phased plan only mentions Stripe, but Phase 2 shipped crypto support afterward. Given the instruction to reuse Phase 2's exact pattern, **Products should get the same dual-rail treatment businesses already has**, not a Stripe-only implementation that would then be inconsistent with the rest of the marketplace:
   - Extend `handleCheckoutSessionCompleted`'s existing `kind` branch with a `"product"` case (mirroring `"business"`), rather than writing a new webhook handler.
   - Add a parallel `/api/checkout/products-crypto` route mirroring `business-crypto`, generating a `crypto.randomUUID()` correlation ID stored on the product/order row.
   - **Fix the dispatch gap while touching this file**: extend `/api/crypto/webhook` to also probe for a product/order match, but do so via an explicit type discriminator this time (e.g. require callers to pass `order_id` values that are prefixed or looked up through a single `payment_intents`-style resolver table) rather than adding a third sequential blind probe — three tables of "guess by trying each" is a real scaling/collision concern the original two-table version could get away with.
   - **Important distinction from the business flow**: `businesses.crypto_payment_id` and `stripe_subscription_id` live directly on the entity being entitled because there's exactly one row per purchase. Products are sold as *orders* (quantity, stock decrement, potentially repeat purchases of the same product by different buyers) — so unlike `businesses`, Products needs its own `product_orders` table (analogous to `ticket_orders`) rather than storing payment IDs directly on `products`. The spec's field list (`stripe_price_id` on the product) is fine for *listing* a price, but the *purchase record* (buyer, quantity, payment IDs, fulfillment status) needs its own table — this wasn't explicit in the Phase 3 prompt and should be added to the migration.

4. **Merchant of record**: confirmed — no Stripe Connect exists anywhere in this codebase today. The spec's assumption ("Fund4Good remains the merchant of record... confirm this matches the ADR before writing payment code") **matches current architecture exactly**. Proceed on that basis.

5. **Reuse, don't reimplement**: concretely, this means Phase 3 code should *add branches* to `app/api/webhooks/stripe/route.ts` and `app/api/crypto/webhook/route.ts` rather than create new webhook endpoints, and should build a new `products-crypto` checkout route by copying `business-crypto`'s shape (ownership check → amount lookup → NOWPayments invoice creation → store correlation ID → redirect), not by inventing a new integration pattern.

## 10. Gaps flagged for awareness (not blocking, but should be conscious decisions if Phase 3 touches them)

- Crypto "subscriptions" (businesses today, and would apply to any recurring Product) have no renewal/expiry cron — they're a one-time 30-day grant. If Phase 3 has subscription-priced products, this gap gets duplicated unless addressed.
- ~~The crypto webhook's blind sequential-table-probe dispatch doesn't scale cleanly to a third table~~ — **resolved**: the webhook now dispatches on an explicit `kind` tag embedded in `order_id` (`lib/cryptoPayment.ts`), with a legacy blind-probe fallback retained only for pre-fix in-flight invoices. Products use this from day one — no probing added for a fourth table.
- `businesses.crypto_payment_id` and hardcoded `TIER_AMOUNTS` mean crypto pricing is **not** driven by the same Stripe Price objects as the card path for businesses — the two rails can silently drift out of price-parity there. Products avoided this: both `/api/checkout/product` and `/api/checkout/product-crypto` derive price from a live `stripe.prices.retrieve(product.stripe_price_id)` call, so card and crypto are always in sync for products specifically.
- ~~Neither post-payment landing page was ready~~ — **resolved**: `/products/order-confirmation` (Stripe path) and the `"product"` branches in `/crypto-pending` + `/api/crypto/status` (crypto path) are now built, alongside the full Phase 3 UI (dashboard CRUD, public catalog/detail, JSON-LD, sitemap, nav).
- **Standing risk**: the `pending_review`/`active`/`rejected` approval-gate triggers (`enforce_article_status_transition`, `enforce_business_status_transition`, `enforce_product_status_transition`) treat `auth.uid() IS NULL` as a trusted admin-equivalent context, so that service-role writes (the established `isAdmin()` + `supabaseAdmin` pattern used by `app/api/admin/*` routes, and the crypto/Stripe webhooks) aren't blocked by the trigger. This only holds because *every* service-role write path today is itself gated — either by an `isAdmin()` check before the write, or by webhook signature verification before the write. **The trigger provides zero protection on its own against a future service-role write that skips that gate** — e.g. a new admin route, script, or migration that calls `supabaseAdmin.from('articles').update({status: 'published'})` without an `isAdmin()` check first would sail straight through the trigger, since it can't distinguish "legitimate gated service-role call" from "any service-role call." The real enforcement boundary is the application-level gate in front of each service-role client, not the trigger — the trigger only stops *authenticated non-admin users*, which was its actual purpose. Any new code path that touches these three tables' `status` via `supabaseAdmin` must carry its own authorization check; this is not optional defense-in-depth the trigger will catch for you.

---

No migration or code has been written. This document is for review before Phase 3 implementation begins.
