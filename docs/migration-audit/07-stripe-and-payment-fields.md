# Stripe and Crypto Payment Database Objects

There is **no dedicated Stripe/payment-events table** in this schema (no `stripe_events`, `payment_logs`, or similar) — payment state is carried entirely as columns on 5 application tables. This document consolidates all of them in one place since they're scattered across the schema and are the highest-stakes columns to get right during migration (a mismatch here means broken payment reconciliation, not just a cosmetic bug).

## Column inventory by table

### `donations`
| Column | Type | Notes |
|---|---|---|
| `payment_intent_id` | text | `UNIQUE` constraint (`donations_payment_intent_id_key`) — this is the idempotency key the Stripe webhook handler relies on |
| `stripe_session_id` | text | no constraint |
| `payment_method` | varchar(50), default `'stripe'` | **no CHECK constraint** restricting values (unlike `product_orders.payment_method`, which has an explicit `ANY(ARRAY['stripe','crypto'])` check) |
| `source` | text, `NOT NULL`, default `'stripe'` | no CHECK constraint on this column either |
| `status` | varchar(50), default `'succeeded'` | `CHECK (status = ANY (ARRAY['pending','succeeded','completed','failed','refunded']))` — note both `'succeeded'` and `'completed'` are valid; `update_fundraiser_raised()` only sums donations where `status = 'completed'` (not `'succeeded'`) when recalculating `fundraisers.raised`/`raised_amount` — this distinction matters for verification (see below) |
| `receipt_path` | varchar(512) | Supabase Storage path, not a Stripe object |
| `certificate_path` | varchar(512) | Supabase Storage path, not a Stripe object |
| `import_batch_id` | uuid | present for donations imported from GoFundMe (see `gofundme_sources`), not Stripe-originated |

**No `crypto_payment_id` column exists on `donations`** — if donations support crypto payment at all, it isn't tracked via a dedicated ID column the way `businesses`/`product_orders` are. Worth confirming against the crypto payment code path before assuming donations are Stripe-only.

### `ticket_orders`
| Column | Type | Notes |
|---|---|---|
| `stripe_payment_intent_id` | text | **unique index** `idx_ticket_orders_payment_intent` (unique via index, not a named `UNIQUE` constraint) — same idempotency role as `donations.payment_intent_id` |
| `stripe_session_id` | text | non-unique index `idx_ticket_orders_stripe_session` |
| `payment_method` | varchar(50), default `'stripe'` | **no CHECK constraint** |
| `currency` | text, default `'usd'` | no constraint |
| `status` | text, default `'valid'` | `CHECK (status = ANY (ARRAY['pending','valid','used','cancelled','refunded']))` |
| `qr_code` | text, `NOT NULL` | `UNIQUE` — not a payment field, but generated at the same point in the purchase flow |

**No `crypto_payment_id` column on `ticket_orders` either.**

### `product_orders`
| Column | Type | Notes |
|---|---|---|
| `stripe_session_id` | text | non-unique index |
| `stripe_payment_intent_id` | text | non-unique index (unlike `donations`/`ticket_orders`, this one is **not** unique-constrained) |
| `crypto_payment_id` | text | non-unique index — this table **does** track crypto payments explicitly |
| `payment_method` | text, `NOT NULL`, default `'stripe'` | `CHECK (payment_method = ANY (ARRAY['stripe','crypto']))` — the one table with an explicit two-way payment method constraint |
| `status` | text, default `'pending'` | `CHECK (status = ANY (ARRAY['pending','paid','cancelled','refunded']))` |
| `unit_price`, `total_amount` | numeric(12,2) | both have `CHECK (... >= 0)`; both are **snapshots** written explicitly by the checkout route at order-creation time (see column comments in `sql/002_tables.sql`) — never re-derived from `products` at read time |

### `businesses` (subscription/listing payment state, not a per-transaction order)
| Column | Type | Notes |
|---|---|---|
| `stripe_price_id` | text | which Stripe Price the business's listing tier maps to |
| `stripe_subscription_id` | text | for `listing_tier = 'subscription'` businesses |
| `current_period_end` | timestamptz | subscription renewal boundary |
| `crypto_payment_id` | text | one-time crypto payment for a listing, alternative to the Stripe subscription path |
| `listing_tier` | text, default `'free'` | `CHECK (listing_tier = ANY (ARRAY['free','one_time','subscription']))` |

### `products`
| Column | Type | Notes |
|---|---|---|
| `stripe_price_id` | text | the Stripe Price backing this product's checkout |
| `price_type` | text, default `'one_time'` | `CHECK (price_type = ANY (ARRAY['one_time','subscription']))` |

No per-product crypto field — crypto tracking for product purchases lives on `product_orders`, not `products`.

## What this means for migration

- All of the above are **plain columns**, migrated as ordinary table data — no special handling beyond the general data-load order in `04-data-migration-strategy.md`.
- **No Stripe/crypto configuration lives in the database** (API keys, webhook secrets, price IDs for platform-wide products are either environment variables or, for per-listing `stripe_price_id`/`stripe_subscription_id`, already captured as the row data above). Nothing here needs to be "created" in the new project the way tables/functions do — it travels with the row data.
- **The Stripe webhook endpoint itself must be re-pointed** to the new project's deployment (see `04-data-migration-strategy.md` §4) — this is an external Stripe Dashboard configuration change, not a database change, but it's the one dependency that will silently break payment status updates if missed.
- **Idempotency depends on the `donations.payment_intent_id` UNIQUE constraint and the `ticket_orders` unique index on `stripe_payment_intent_id`** surviving the migration intact (they do — both are in `sql/002_tables.sql`) — a webhook retry after cutover must still be rejected/deduped the same way it would have been in production.
- **`product_orders.stripe_payment_intent_id` is NOT unique-constrained**, unlike its equivalents on `donations`/`ticket_orders`. This is existing production behavior, reproduced as-is — not something this migration changes — but it's worth knowing if a webhook-retry double-processing bug is ever investigated on `product_orders` specifically, since the database itself won't prevent a duplicate row the way it would for donations/tickets.

## Verification specific to payment data (see also `05-verification-checklist.md`)

- [ ] After data migration, confirm `donations.payment_intent_id`, `ticket_orders.stripe_payment_intent_id`, and `product_orders.stripe_payment_intent_id` values still resolve against Stripe's API using the **new** project's Stripe keys (same Stripe account, just confirming connectivity/environment — live vs. test mode — matches expectations post-migration).
- [ ] Confirm `businesses` rows with `listing_tier = 'subscription'` and a non-null `stripe_subscription_id` still show as active in Stripe, and that `current_period_end` matches what Stripe reports.
- [ ] Trigger a test Stripe webhook (event replay or Stripe CLI `stripe trigger`) against the new project's webhook endpoint before cutover and confirm it updates the expected `donations`/`ticket_orders`/`product_orders`/`businesses` row exactly once (tests both connectivity and idempotency handling).
- [ ] If crypto payments are an active path, confirm the crypto webhook/confirmation flow writes `crypto_payment_id` on `businesses`/`product_orders` correctly against the new project before relying on it in production.

## Phase 9 execution plan (drafted 2026-07-25 — planning only, no Stripe/NOWPayments/production changes made)

**Status: prep complete, ready for execution pending explicit go-ahead. Not yet executed** — no webhook, API key, or NOWPayments configuration has been created, modified, or deleted. Same drafting discipline as Phases 6–8.

### 1. Full Stripe touchpoint inventory (re-checked against actual code, 2026-07-25)

**Server-side Stripe client instantiation** (`new Stripe(process.env.STRIPE_SECRET_KEY)`) — 10 files: `lib/donations.ts`, `app/api/webhooks/stripe/route.ts`, `app/products/[slug]/page.tsx`, `app/api/donations/sync-stripe/route.ts`, `app/api/receipts/[id]/route.ts`, `app/api/receipts/lookup/route.ts`, `app/api/donate/intent/route.ts`, `app/api/checkout/route.ts`, `app/api/checkout/product/route.ts`, `app/api/checkout/business/route.ts`, `app/api/create-payment-intent/route.ts`.

**Webhook handler**: `app/api/webhooks/stripe/route.ts` — a single shared endpoint for donations, tickets, and business listings (dispatches internally by `event.type` then `metadata.kind`). Verifies via `stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)`. Handles 4 event types: `payment_intent.succeeded`, `checkout.session.completed`, `customer.subscription.deleted` (flips `businesses.status` back to `'expired'`), `invoice.payment_failed` (logged only, no status change — deliberate, per `docs/adr/0001-marketplace-ownership-entitlements-payments.md`).

**Client-side publishable key**: `components/payments/StripeProvider.tsx` — `loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)`, feeding Stripe Elements for the embedded PaymentIntent-based checkout flows (donations, tickets).

**Checkout session creation**: both patterns are in use — Stripe Checkout **Sessions** (redirect) for business listings (`app/api/checkout/business/route.ts`, using pre-created Price IDs from env) and product purchases (`app/api/checkout/product/route.ts`), and PaymentIntent + Elements (embedded) for donations/tickets (`app/api/donate/intent/route.ts`, `app/api/create-payment-intent/route.ts`).

**Stripe Connect**: confirmed **not used anywhere** — `docs/adr/0001-marketplace-ownership-entitlements-payments.md` states this explicitly ("every Stripe call in the codebase uses the single platform `STRIPE_SECRET_KEY` — no Stripe Connect, no `stripe_account` header, no destination/application-fee charges anywhere. Aldriva is the sole merchant of record"), and a grep for `stripe.accounts`/`application_fee`/`on_behalf_of`/`stripeAccount`/`accountLinks`/`transfer_data` across the whole codebase confirms zero matches. The "Connect Stripe Account" button in `app/dashboard/settings/payments/PaymentsClient.tsx` is a **UI mock only** — its handler comment literally reads "Mimic Stripe Connect redirection handshake" and shows a "sandbox mode" toast; it makes no real API call. This rules out per-organizer connected-account complexity entirely — the account-relationship question below is a single platform-level decision, not one that has to be made per organizer/business.

**Distinct env vars this touches**: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_BUSINESS_ONETIME`, `STRIPE_PRICE_BUSINESS_SUB`. Everything else Stripe-related (`stripe_price_id`, `stripe_subscription_id`, `payment_intent_id`, etc.) is row data already migrated in Phase 7 — no separate config step, per the "What this means for migration" section above.

### 2. Account relationship — confirmed by the user (2026-07-25), not assumed

Both existing docs (`07-stripe-and-payment-fields.md` line 70, `MIGRATION_MASTER_PLAN.md` line 253, prior to this update) only *hedged* toward same-account ("just confirming... matches expectations", "may be unchanged") — this had never actually been decided. Explicitly confirmed now:

- **Stripe: same account.** `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_BUSINESS_ONETIME`, `STRIPE_PRICE_BUSINESS_SUB` stay **identical** between production and `supabase-new` — existing customers, payment methods, and active subscriptions carry over seamlessly, and every `stripe_price_id`/`stripe_subscription_id` value already migrated in Phase 7 remains a valid reference (no stale IDs, since nothing in the Stripe account itself changes).
- **NOWPayments: same account.** `NOWPAYMENTS_API_KEY`/`NOWPAYMENTS_IPN_SECRET` also stay identical.

This means Phase 9's real scope is **narrower than "reconfigure Stripe"** — see §3.

### 3. Narrowed actual scope (same-account confirmed)

- **(a) New/updated Stripe webhook endpoint** in the Stripe Dashboard, pointed at whichever URL fronts `supabase-new`'s backend post-cutover. Note this is tied to the **app's** deployment URL (Vercel), not the Supabase project URL directly — practically, this change should happen at **Phase 12 (Cutover)** time, when the app is actually redeployed pointing at `supabase-new`, not in isolation beforehand. Creating the endpoint early against a URL that isn't live yet just means Stripe will log delivery failures until cutover.
- **(b) New webhook signing secret** for that new endpoint, stored as `STRIPE_WEBHOOK_SECRET` in the new deployment's environment (Vercel project settings) — this is the one Stripe-side value that's genuinely per-endpoint, not per-account, so it necessarily changes even though the account doesn't.
- **API keys and Price IDs (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_BUSINESS_ONETIME`, `STRIPE_PRICE_BUSINESS_SUB`) do not need to change** — same account, same values.
- **NOWPayments needs no Dashboard-side webhook step at all**, same-account or not — see §5.

### 4. Test mode vs. live mode

**Current state, confirmed from `.env.local`**: the Stripe keys already configured there for `supabase-new`'s local dev (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) are **test-mode** keys (`sk_test_…`/`pk_test_…` prefixes). Production's actual deployed key mode **cannot be determined from this repo** — production's real environment variables live in its own deployment target (Vercel project settings for the old project), not in this checkout's `.env.local`, and were never available to inspect during this audit. Flagging as unknown rather than assuming production is live-mode.

**Proposed default (test-mode-first), matching what's already configured today**: exercise the full payment flow — checkout session/PaymentIntent creation, webhook receipt, idempotency (a webhook retry must still dedupe against `donations.payment_intent_id`'s `UNIQUE` constraint / `ticket_orders`' unique index), and subscription lifecycle (`customer.subscription.deleted` → `businesses.status`) — against `supabase-new` using Stripe **test-mode** keys and the Stripe CLI (`stripe listen` / `stripe trigger`, already called out in this file's verification checklist above) **before** creating or pointing any **live-mode** webhook endpoint at `supabase-new`. Only after that passes should a live-mode webhook change happen, timed with actual cutover (§3a).

### 5. NOWPayments (crypto) — same-account confirmed, but a genuine documentation gap otherwise

**NOWPayments was not mentioned anywhere in `docs/migration-audit/` before this update** — the original audit covered the `crypto_payment_id` *columns* but never named NOWPayments as the provider or discussed its account/config migration needs at all, and there is no dedicated "Configure NOWPayments" phase in `MIGRATION_MASTER_PLAN.md`'s phase table (only "Configure Stripe" and "Configure Resend"). Folding it into Phase 9 here since it's the same category of decision.

- **No Dashboard-side webhook registration exists for NOWPayments, unlike Stripe, regardless of the account decision.** Confirmed in code (`app/api/crypto/create-payment/route.ts` and its `business-crypto`/`product-crypto` counterparts): `ipn_callback_url` is passed **dynamically, per payment-creation request**, derived from `process.env.NEXT_PUBLIC_BASE_URL`. Once that env var points at the new deployment (already a generic Phase 11 "update environment variables" item), NOWPayments IPNs route correctly automatically — there is no separate NOWPayments Dashboard step to perform, same-account or not.
- **Risk flag: there is no sandbox/test-mode code path for NOWPayments in this codebase.** All 4 call sites (`app/api/checkout/business-crypto/route.ts`, `app/api/checkout/product-crypto/route.ts`, `app/api/crypto/create-payment/route.ts`, `app/api/crypto/status/route.ts`) hit the hardcoded live API host `https://api.nowpayments.io` — never a sandbox host — regardless of which API key is configured. This means any pre-cutover testing of the crypto payment path against `supabase-new` would hit NOWPayments' real, live API. Worth resolving directly with NOWPayments (does their sandbox behavior toggle by account/key rather than by host? this codebase doesn't support a host toggle either way) before doing any crypto-path testing here, rather than assuming a "test mode" exists the way it does for Stripe.
- **Known pre-existing gap, unrelated to migration** (documented in `docs/adr/0001-marketplace-ownership-entitlements-payments.md`, restated here so it isn't mistaken for a migration bug during Phase 9 testing): crypto "subscriptions" for business listings are a one-time 30-day grant with **no renewal or expiry-check mechanism** — if a 30-day crypto listing doesn't auto-expire when tested post-migration, that's existing production behavior, not something Phase 9 broke.

### Recommended sequencing

1. **Now**: no Stripe/NOWPayments Dashboard changes — this section is planning only.
2. **Before cutover, in Stripe test mode**: full payment-flow verification against `supabase-new` per §4, using the Stripe CLI.
3. **At Phase 12 (Cutover)**: create the new Stripe webhook endpoint pointed at the live, redeployed app URL; store the new signing secret as `STRIPE_WEBHOOK_SECRET`; leave `STRIPE_SECRET_KEY`/`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`/`STRIPE_PRICE_BUSINESS_ONETIME`/`STRIPE_PRICE_BUSINESS_SUB` unchanged (same account). Update `NEXT_PUBLIC_BASE_URL` (already a Phase 11 item) — this alone makes NOWPayments' dynamic IPN callback correct with no further NOWPayments-side action.
4. **Post-cutover**: run this file's existing payment-data verification checklist (above) against live traffic.
