# Aldriva — Comprehensive Financial Integration & Table Settlement Audit

**Repository:** `C:\Users\Youngyz\aldriva-staging`  
**Branch:** `feat/table-menu-qr-codes`  
**Audit Mode:** Strictly read-only inspection  
**Environment:** Staging / local codebase analysis only  
**Date:** 2026-10-28  
**Scope:** Payment architecture across Events, Fundraising, Products, Storefront Commerce, Dine-In Table Ordering, Currency architecture (XOF/CFA, NGN, USD), Provider capabilities (Stripe, NOWPayments), Ledger & Payout readiness, and Phase 4 Table Settlement financial integrity.

---

## Section 1 — Executive Summary

Aldriva possesses a functioning card payment infrastructure via Stripe and cryptocurrency payment handling via NOWPayments. However, the financial architecture across the platform is sharply fragmented across four historically separate domains:

1. **Events & Ticket Sales:** Fully operational Stripe card checkout (via inline PaymentElement and Checkout Sessions) and NOWPayments crypto checkout. Card payments trigger atomic database credits via `record_ticket_and_credit` into `recipient_ledger_entries`. Ticket checkout is hardcoded to USD.
2. **Fundraising & Donations:** Operational Stripe card checkout and NOWPayments crypto checkout. Card payments trigger atomic ledger credits via `record_donation_and_credit`. Crypto donations update the `donations` table directly but completely bypass the ledger.
3. **Business & Commerce (Store Products & Digital Goods):** Products can be purchased using single-product Stripe Checkout Sessions or multi-item Store Cart sessions (`product_orders` table). Card payments trigger stock decrement and notify buyers/sellers, calling `record_product_paid_and_credit` via `markProductOrderPaid`.
4. **Restaurant Storefront & Dine-In Ordering (`orders` table):** Storefront menu orders and dine-in table ordering use a distinct, modern data model (`orders` table). While online card payments exist via `app/api/orders/payment-intent` and `handleStorefrontOrderPaymentSucceeded`, online payments are strictly hardcoded to USD (`ONLINE_PAYMENT_CURRENCIES = ["USD"]`). When a business selects Côte d'Ivoire (CI) as its country, its currency resolves to `XOF`, which automatically blocks the online payment toggle. Furthermore, the `orders` table is completely decoupled from the recipient ledger (`recipient_ledger_entries`), balance calculations, and payout systems.

### Key Audit Conclusions
- **No Stripe Connect Exists:** There is zero Stripe Connect infrastructure in the repository. There are no connected account creations, no `transfer_data`, no `on_behalf_of`, and no `destination` payments. All Stripe card charges across all four domains settle 100% into Aldriva's single central platform Stripe merchant account.
- **The Dashboard Stripe Connect Button is a Simulation:** The "Connect with Stripe" button in `app/dashboard/settings/payments/PaymentsClient.tsx` executes a 1.5-second `setTimeout` mock that displays a toast notification (`"Stripe integration setup successfully in sandbox mode!"`). No OAuth or Connect account link is created.
- **Payouts are an Internal Ledger State Machine with Manual Admin Clearance:** Payout requests (`payouts` table) debit internal ledger entries and queue requests in `app/admin/finance/payouts`. Payout completion is entirely manual: an admin must disburse funds off-platform (e.g. via bank wire or mobile money) and type an external reference into the admin UI to mark the payout completed. No automated transfer APIs exist.
- **Business/Commerce Payment Incompleteness:** The business commerce experience appears incomplete because:
  - (a) The business orders route `app/dashboard/businesses/[id]/orders/page.tsx` is an 8-line placeholder stub, whereas the actual active orders UI is located at `app/dashboard/org/[id]/orders/page.tsx`.
  - (b) Storefront online card payment is gated to `USD` only, immediately disabling online payments for restaurants in Côte d'Ivoire (`XOF`).
  - (c) Storefront orders (`orders` table) are never credited to `recipient_ledger_entries`. Thus, business owners cannot see commerce revenue in their payments/payouts balance.
- **Phase 4 Table Settlement Integrity:** The running bill engine (`lib/table-bill.ts`) is mathematically sound, authoritative, and cleanly separates online-paid amounts from at-table unpaid amounts while excluding cancelled and declined orders. However, `markTablePaidAndCloseSession` executes three sequential database updates without an atomic transaction, creating a vulnerability where a network failure during session closure can leave orders marked paid while the session remains active.

---

## Section 2 — Payment Architecture Inventory

### 2.1 Provider Initialization & Clients
- **Stripe Client:**
  - Initialized per-route using `new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-05-27.dahlia" })`.
  - Found in 20 distinct files across `app/` and `lib/`.
  - All calls use the platform's root `STRIPE_SECRET_KEY`. No `stripeAccount` header or connected account context is ever passed.
- **NOWPayments (Crypto) Client:**
  - Configured in `lib/cryptoPayment.ts` via `getNowPaymentsConfig()`.
  - Switches between production (`NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`) and sandbox (`NOWPAYMENTS_SANDBOX_API_KEY`, `NOWPAYMENTS_SANDBOX_IPN_SECRET`) using `NOWPAYMENTS_ENV === "sandbox"`.
  - Uses invoice creation API (`https://api.nowpayments.io/v1/invoice` or sandbox) with tagged `order_id` strings: `kind:id` (`"donation:"`, `"ticket:"`, `"business:"`, `"product:"`).
  - Webhook verified via HMAC-SHA512 with recursive key sorting matching Python `json.dumps(sort_keys=True)`.

### 2.2 Domain Checkout & Order Ingestion
1. **Event Tickets (`ticket_orders` table):**
   - Free: Handled in `app/api/checkout/route.ts` (instant validation, marks seat sold, issues QR code).
   - Card: PaymentIntent in `app/api/create-payment-intent/route.ts` or Checkout Session in `app/api/checkout/route.ts`. Currency is hardcoded to `USD`.
   - Webhook: Stamped in `app/api/webhooks/stripe/route.ts` via `record_ticket_and_credit` RPC (Migration 72).
2. **Fundraising Donations (`donations` table):**
   - Card: PaymentIntent in `app/api/donate/intent/route.ts` with metadata `kind: "donation"`.
   - Webhook: Stamped in `app/api/webhooks/stripe/route.ts` via `record_donation_and_credit` RPC.
3. **Store Products (`product_orders` table):**
   - Single item: `app/api/checkout/product/route.ts` (Stripe Checkout Session).
   - Multi-item cart: `app/api/checkout/cart/route.ts` (validates via `lib/store-cart-checkout.ts`, inserts pending `product_orders`, creates multi-line Checkout Session).
   - Crypto: `app/api/checkout/product-crypto/route.ts`.
   - Webhook: Flipped to paid in `app/api/webhooks/stripe/route.ts` via `markProductOrderPaid` which calls `record_product_paid_and_credit` RPC.
4. **Storefront & Dine-In Orders (`orders` table):**
   - Ingestion: `lib/order-submit.ts` (`submitOrderRequestWithClient`) and `lib/actions/orders.ts`.
   - Online Card Payment: `app/api/orders/payment-intent/route.ts` calling `createOnlineOrderPayment` in `lib/storefront-order-payments.ts`.
   - Webhook: Handled by `handleStorefrontOrderPaymentSucceeded` in `lib/storefront-order-payments.ts` (triggered from Stripe webhook L609–631).
   - **Crucial Architectural Disconnect:** Storefront orders perform a direct table update (`UPDATE orders SET payment_status = 'paid'`). They do **not** call any ledger credit RPC.

### 2.3 Webhook Infrastructure & State Reconciliation
- **Stripe Webhook (`app/api/webhooks/stripe/route.ts`):**
  - Verifies raw request body with `stripe.webhooks.constructEvent` using `STRIPE_WEBHOOK_SECRET`.
  - Handles `payment_intent.succeeded`, `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`.
  - Failed reconciliations record to `payment_reconciliation_failures` (Migration 69) and dispatch emergency alert emails via Resend.
- **Crypto Webhook (`app/api/crypto/webhook/route.ts`):**
  - Verifies signature using `x-nowpayments-sig` and HMAC-SHA512.
  - Updates `donations`, `ticket_orders`, `businesses`, and `product_orders`.
  - **Does NOT** call ledger RPCs and **does NOT** write to `payment_reconciliation_failures`.

### 2.4 Ledger, Balance, & Payout Infrastructure
- **`recipients` Table (Migration 70):** Maps identity to `user`, `organizer`, or `business`.
- **`recipient_ledger_entries` Table (Migration 71):** Double-entry style append-only ledger (`credit`, `debit`, `platform_fee`, `refund`, `payout`, `adjustment`).
  - Supported `source_type`: `'donation'`, `'ticket_order'`, `'product_order'`, `'payout'`, `'manual'`.
  - **`orders` table is NOT a recognized `source_type` in Migration 71 constraint!**
- **Ledger Credit RPCs (Migration 72):**
  - `record_donation_and_credit`
  - `record_ticket_and_credit`
  - `record_product_paid_and_credit`
  - There is NO `record_storefront_order_paid_and_credit` RPC.
- **`payouts` Table & Balance RPCs (Migration 73):**
  - `get_recipient_balance(p_recipient_id, p_currency)`: Computes sum of credits minus debits and pending payouts.
  - `request_payout_and_debit`: Atomically locks balance, checks KYC status, inserts payout row, and writes debit entry.
  - `payouts.destination_type`: `'stripe_connect'`, `'bank_transfer'`, `'crypto'`, `'manual'`.

---

## Section 3 — Capability Matrix

| Capability | Events | Fundraising | Business/Commerce (Products) | Dine-In / Storefront (`orders`) |
|---|---|---|---|---|
| **Card checkout** | Implemented and verified (`app/api/create-payment-intent`, `app/api/checkout`) | Implemented and verified (`app/api/donate/intent`) | Implemented and verified (`app/api/checkout/cart`, `app/api/checkout/product`) | Implemented and verified for USD only (`app/api/orders/payment-intent`) |
| **Cryptocurrency checkout** | Implemented and verified (`app/api/crypto/create-payment`) | Implemented and verified (`app/api/crypto/create-payment`) | Implemented and verified (`app/api/checkout/product-crypto`) | Absent from inspected code (no crypto route for `orders`) |
| **Payment intent/session creation** | Implemented and verified (Stripe PI & Sessions) | Implemented and verified (Stripe PI) | Implemented and verified (Stripe Sessions) | Implemented and verified (Stripe PI via `storefront-order-payments.ts`) |
| **Provider confirmation/webhooks** | Implemented and verified (`stripe/route.ts:423`) | Implemented and verified (`stripe/route.ts:634`) | Implemented and verified (`stripe/route.ts:1049, 1085`) | Implemented and verified (`storefront-order-payments.ts:162`) |
| **Order/payment association** | Implemented and verified (`ticket_orders.stripe_payment_intent_id`) | Implemented and verified (`donations.payment_intent_id`) | Implemented and verified (`product_orders.stripe_session_id`) | Implemented and verified (`orders.provider_reference`) |
| **Transaction history** | Implemented and verified (`/dashboard/attendees`, `/admin/payments`) | Implemented and verified (`/dashboard/donations`, `/admin/payments`) | Partially implemented (listed in overview counts, no dedicated order ledger) | Implemented for operational status (`/dashboard/org/[id]/orders`); no financial ledger |
| **Refund handling** | Partially implemented (manual admin DB flags) | Partially implemented (manual admin DB flags) | Partially implemented (manual admin DB flags) | UI warning only (`online_refund_required` in `transition-core.ts:40`) |
| **Fees and net amounts** | Absent from inspected code (gross charge recorded; Stripe fee not deducted) | Absent from inspected code | Absent from inspected code | Absent from inspected code (Stripe fees not fetched or stored) |
| **Settlement visibility** | Partially implemented (Internal ledger balance in `/dashboard/settings/payments`) | Partially implemented (Internal ledger balance in `/dashboard/settings/payments`) | Partially implemented (via `record_product_paid_and_credit`) | Absent from inspected code (`orders` never written to ledger) |
| **Payout/withdrawal** | Partially implemented (Manual admin clearance via `/admin/finance/payouts`) | Partially implemented (Manual admin clearance via `/admin/finance/payouts`) | Partially implemented (Manual admin clearance via `/admin/finance/payouts`) | Blocked (unlinked to ledger; balance always reflects 0 for orders) |
| **Owner payment settings** | Implemented (`/dashboard/settings/payments`) | Implemented (`/dashboard/settings/payments`) | Partially implemented (Toggle in `OrderingPaymentsPanel.tsx`) | Blocked for non-USD (`ONLINE_PAYMENT_CURRENCIES` blocks XOF) |

---

## Section 4 — Root Cause of the Missing Business Payment Experience

The investigation confirms that the missing/incomplete business commerce payment experience is caused by five concrete architectural issues:

### 1. Hardcoded USD Gate Blocks Local Currencies (e.g. Côte d'Ivoire / XOF)
- **Evidence:** `lib/storefront-features.ts` (lines 51–56):
  ```ts
  export const ONLINE_PAYMENT_CURRENCIES: readonly string[] = ["USD"];
  export function isOnlinePaymentCurrencySupported(currency: unknown): boolean {
    return ONLINE_PAYMENT_CURRENCIES.includes(currency.trim().toUpperCase());
  }
  ```
- **Consequence:** In `lib/website-v2-theme.ts` (line 163), any business with country Côte d'Ivoire automatically resolves currency to `"XOF"`. When `computeFeatureStatus("onlinePayment")` runs, `currencyOk` evaluates to `false`. The dashboard displays `"Needs setup — currency not supported for online payment"` and disables the online card payment toggle.

### 2. Disconnect Between `orders` Table and the Ledger (`recipient_ledger_entries`)
- **Evidence:** Migration 71 defines:
  ```sql
  CHECK (source_type IN ('donation', 'ticket_order', 'product_order', 'payout', 'manual'))
  ```
  `orders` is absent from the constraint. In `lib/storefront-order-payments.ts`, `handleStorefrontOrderPaymentSucceeded` updates `orders.payment_status = 'paid'`, but never writes to `recipient_ledger_entries` or calls any ledger RPC.
- **Consequence:** A business can receive paid orders, but its available balance in `/dashboard/settings/payments` (`get_recipient_balance`) remains 0.00. The business owner cannot see their sales in their settlement overview or request a payout.

### 3. Orphaned / Placeholder Route in Business Dashboard
- **Evidence:** `app/dashboard/businesses/[id]/orders/page.tsx` is an 8-line placeholder:
  ```tsx
  return <div className="space-y-4"><h1 className="text-lg font-black">Orders</h1><p className="text-sm text-zinc-600">Orders for business {id.slice(0,8)} — scoped via business_id.</p></div>;
  ```
- **Consequence:** If an owner navigates to their business via `/dashboard/businesses/[id]/orders`, they see an empty placeholder. The real, fully built operational orders dashboard is located at `/dashboard/org/[id]/orders/page.tsx`.

### 4. Mocked Stripe Connect Integration
- **Evidence:** `app/dashboard/settings/payments/PaymentsClient.tsx` (lines 84–90):
  ```tsx
  function handleStripeConnect() {
    setIsStripeConnecting(true);
    setTimeout(() => {
      setIsStripeConnecting(false);
      showToast("Stripe integration setup successfully in sandbox mode!");
    }, 1500);
  }
  ```
- **Consequence:** Business owners believe they are connecting their Stripe account, but no account is created or linked. All platform card charges flow into Aldriva's central account.

### 5. Two Divergent Commerce Schemas (`product_orders` vs. `orders`)
- **Evidence:** Physical/digital products in the Store template use `product_orders` (created by `/api/checkout/cart`), whereas food menu, pickup, delivery, and dine-in use `orders` (created by `lib/order-submit.ts`).
- **Consequence:** Product orders have stock decrements and ledger hooks, but lack kitchen dispatch, delivery tracking, and waiter confirmation. Storefront orders have fulfillment tracking, table sessions, and waiter confirmation, but lack ledger entries and crypto support.

---

## Section 5 — Country and Currency Findings

### 5.1 Currency Architecture Analysis

| Currency Layer | Behavior in Code | Verified Status |
|---|---|---|
| **1. Display Currency** | `lib/money.ts` (`formatMoney`) handles ISO-4217, zero-decimal formatting, and renders `"FCFA"` for XOF/XAF with 0 decimals. | Verified Safe & Working |
| **2. Pricing Currency** | `lib/website-v2-theme.ts` (`resolveStorefrontCurrency`) defaults Côte d'Ivoire to `XOF`, others to `USD`. Stored in DB as string. | Verified Working |
| **3. Charge Currency** | Stripe charges use `toMinorUnits` in `lib/money.ts`. Handles zero-decimal (factor 1 for XOF) vs 2-decimal (factor 100 for USD). | Verified Working |
| **4. Settlement Currency** | Stripe settles into the bank account linked to the Stripe account (typically USD or EUR depending on where the Aldriva company account is registered). | Unverified (Live Stripe config inaccessible) |
| **5. Payout Currency** | `payouts.currency` requires 3 lowercase letters (`CHECK (currency ~ '^[a-z]{3}$')`). Defaults to `"usd"` in UI. | Partially working (manual only) |

### 5.2 Côte d'Ivoire (XOF/CFA) and Nigeria (NGN) Feasibility
- **Stripe Account Country vs. Customer Charge Currency:**
  - *External Provider Fact:* Stripe does **not** support Côte d'Ivoire as a merchant account country. A business in Abidjan cannot open a native Stripe account.
  - *Charge Capability:* Aldriva's central Stripe merchant account (if registered in the US, UK, EU, or Canada) **can** charge customer Visa/Mastercard cards in `XOF` and `NGN`. Stripe converts `XOF` to the platform's settlement currency (USD/EUR) upon settlement.
  - *Payout Feasibility:* Stripe **cannot** pay out directly to an Ivorian bank account or mobile money wallet via standard Stripe Connect.
- **NOWPayments (Crypto):**
  - NOWPayments accepts `price_currency: "usd"` or any supported fiat for price estimation, and the customer pays in BTC, ETH, USDT, etc.
  - Payouts from NOWPayments require crypto wallet withdrawals.
- **Local African Payment Gateways (External Research Recommendation):**
  - To support native customer checkout (Wave, Orange Money, MTN MoMo, Moov) and direct business payouts in Côte d'Ivoire, a regional gateway (such as Paystack or CinetPay) is required.

---

## Section 6 — Reuse Architecture

Aldriva should **not** build a second Stripe integration. Instead, the existing financial architecture can be unified using this clean reuse plan:

```
                                  CUSTOMER CHECKOUT
                                         │
        ┌───────────────────┬────────────┴────────────┬───────────────────┐
        ▼                   ▼                         ▼                   ▼
   Ticket Sales        Donations             Store Products       Storefront Orders
  (ticket_orders)     (donations)           (product_orders)          (orders)
        │                   │                         │                   │
        │                   │                         │                   │
        └───────────────────┼─────────────────────────┴───────────────────┘
                            ▼
           EXISTING PAYMENT PIPELINE (REUSED)
        ┌───────────────────────────────────────┐
        │  • Stripe PaymentIntents / Sessions   │
        │  • NOWPayments Invoices               │
        │  • Webhook Verification & Idempotency │
        │  • alertReconciliationFailure Logging │
        └───────────────────┬───────────────────┘
                            │
                            ▼
              CANONICAL RECIPIENT LEDGER
        ┌───────────────────────────────────────┐
        │       recipient_ledger_entries        │
        │  (Add 'order' to source_type CHECK)   │
        └───────────────────┬───────────────────┘
                            │
                            ▼
          UNIFIED SETTLEMENT & PAYOUT ENGINE
        ┌───────────────────────────────────────┐
        │  • get_recipient_balance              │
        │  • request_payout_and_debit           │
        │  • Admin Manual Clearance / Mobile    │
        │    Money / Bank Transfer Record       │
        └───────────────────────────────────────┘
```

### Necessary Extensions (No Duplicate System):
1. **Extend `source_type` on `recipient_ledger_entries`:** Add `'order'` to allow storefront dine-in/pickup/delivery orders to write ledger credits.
2. **Add `record_order_paid_and_credit` RPC:** Port `handleStorefrontOrderPaymentSucceeded` to call this RPC so card payments atomically credit the organizer's balance.
3. **Lift Currency Restriction in `ONLINE_PAYMENT_CURRENCIES`:** Allow `XOF`, `EUR`, `CAD`, `GBP` in `lib/storefront-features.ts` since `lib/money.ts` already handles zero-decimal Stripe math correctly.
4. **Link Business ID to Recipient ID:** Ensure `resolve_recipient` properly attributes orders to the business or its owning organizer tenant.

---

## Section 7 — Payout Readiness

### Current State:
- **Available:**
  - Recipient resolution (`recipients` table).
  - Balance calculation via SQL RPC `get_recipient_balance(p_recipient_id, p_currency)`.
  - Payout request state machine (`requested` -> `processing` -> `completed` / `failed` / `cancelled`).
  - Admin clearance dashboard (`app/admin/finance/payouts/PayoutsAdminClient.tsx`).
- **Missing / Incomplete:**
  - **No Automated Disbursement:** There is no integration with Stripe Transfers, Stripe Connect Payouts, PayPal Payouts, or Mobile Money APIs.
  - **No Stripe Connect OAuth:** Business owners cannot link their own Stripe accounts.
  - **No Bank Account Verification:** Payout destination fields (`destination_reference`) are unvalidated text fields.
- **Provider / Account Prerequisites to Confirm:**
  1. Determine where Aldriva's legal entity and primary Stripe account are registered.
  2. For Côte d'Ivoire: Confirm whether payouts will be processed manually (admin transfers via Wave / Orange Money / wire and records the transaction ID in `payouts.external_payout_id`) or via an integrated African payout API.

---

## Section 8 — Phase 4 Financial Integrity Audit

### 8.1 Running Bill Correctness (`lib/table-bill.ts`)
- **Order Inclusion/Exclusion:**
  - Verified: Active orders are included; cancelled orders (`status === 'cancelled'`) and declined orders (`waiter_confirmation_state === 'declined'`) are placed in `excludedOrders` with 0 contribution to `totalAmount`.
  - Multi-order aggregation correctly sums `totalAmount` across all orders in the session.
- **Line Items & Options:**
  - Verified: Parses option deltas and item quantities accurately.
- **Paid vs. Unpaid Calculation:**
  - Verified: Computes `paidAmount` strictly from orders where `payment_status === 'paid'`.
  - `unpaidAmount = Math.max(0, totalAmount - paidAmount)`.
  - Does NOT assume all paid orders used the same method (handles online card + cash mix cleanly).
- **Client Manipulation:**
  - Verified safe: Calculations run strictly over database rows (`RawBillOrder[]`) fetched server-side in `getTableRunningBill`. Client cannot pass arbitrary totals.

### 8.2 Customer "Request Bill" (`requestTableBill`)
- **Tenant Isolation:**
  - Verified: `business_tables` is checked against `businessId`.
- **Session Resolution:**
  - Verified: Resolves current active or bill_requested session. Safe against duplicate calls (returns friendly "already requested" message).
- **Security Observation (Low Severity):**
  - `requestTableBill` accepts `{ businessId, tableId }` without verifying the guest's cookie token (`aldriva_guest_token`). Anyone with knowledge of the public table UUID could trigger a "Bill Requested" notification to the staff.

### 8.3 Staff "Mark Table Paid" (`markTablePaidAndCloseSession`)
- **Staff Authorization:**
  - Verified: Strictly protected by `assertCanManageBusiness(businessId)`.
- **Order Status Transitions vs. Settlement:**
  - Verified: Updates pending waiter confirmation orders to `waiter_confirmation_state = 'confirmed'`.
  - Updates unpaid non-cancelled orders to `payment_status = 'paid'` and `payment_method = 'at_table'`.
- **Critical Concurrency / Atomicity Gap (Medium Severity):**
  - `markTablePaidAndCloseSession` executes three sequential Supabase updates:
    1. Confirm waiter orders (`orders.update`)
    2. Settle unpaid orders (`orders.update`)
    3. Close session (`table_sessions.update`)
  - **Risk:** These updates are not wrapped in a PostgreSQL transaction (`BEGIN ... COMMIT`). If a database error or network timeout occurs between Step 2 and Step 3, the orders are marked paid but the table session remains active.
- **Online Payment Conflict Edge Case (Low Severity):**
  - If a customer on `pay_online_first` started checkout, abandoned it, and paid cash to the waiter, staff clicking "Mark Table Paid" overwrites `payment_method = 'at_table'`. If the customer's Stripe webhook subsequently arrives, Stripe sees `alreadyPaid: true` and logs without alerting.

### 8.4 Session Closure and Table Release
- **Constraint Safety:**
  - Verified: Setting `table_sessions.status = 'closed'` immediately removes the row from the partial unique index:
    ```sql
    CREATE UNIQUE INDEX idx_table_sessions_table_active_unique
      ON table_sessions(table_id) WHERE status IN ('active', 'bill_requested');
    ```
  - The table is released instantly for the next party.
- **Order Submission Guard:**
  - Verified: `lib/order-submit.ts` rejects any new order if the table session is closed.

---

## Section 9 — Security Findings

| # | Severity | Category | File & Line | Description | Remediation |
|---|---|---|---|---|---|
| **SEC-01** | **Medium** | Atomicity | `lib/actions/table-management.ts:670-705` | Non-atomic table settlement: 3 sequential updates can leave orders paid with table session unclosed on partial failure. | Wrap `markTablePaidAndCloseSession` in a single PostgreSQL RPC. |
| **SEC-02** | **Medium** | Financial Integrity | `app/api/crypto/webhook/route.ts:108-180` | Crypto webhook does not cross-check received amount against DB expected amount; accepts any finished status. | Add expected amount & currency check against target DB row before activating. |
| **SEC-03** | **Medium** | Ledger Bypass | `app/api/crypto/webhook/route.ts:113, 174` | Crypto donations and ticket sales do not call `record_*_and_credit` RPCs; bypasses organizer balances entirely. | Call ledger credit RPCs upon crypto payment confirmation. |
| **SEC-04** | **Low** | Rate / Spam | `lib/actions/table-management.ts:530` | `requestTableBill` does not validate `aldriva_guest_token` cookie; permits unauthenticated bill request pings. | Verify caller's hashed guest token against session `guest_token_hash`. |
| **SEC-05** | **Low** | UI Simulation | `PaymentsClient.tsx:84-90` | Stripe Connect button simulates success via `setTimeout` without creating or checking a real Stripe account. | Replace mock with clear notice that payouts are managed by platform admin. |

---

## Section 10 — Test Coverage Gaps

1. **Table Settlement Atomicity:** No test currently simulates a partial failure between marking orders paid and closing the table session.
2. **Concurrent Table Orders During Closure:** No test exercises an order arriving at the exact millisecond `markTablePaidAndCloseSession` executes.
3. **Crypto Amount Validation:** No test verifies rejection of an underpaid crypto invoice.
4. **Multi-Currency Storefront Checkout:** No automated test asserts behavior when storefront currency is `XOF` vs `USD`.

---

## Section 11 — Recommended Implementation Roadmap

Preserving all existing Event, Fundraising, and Product payment flows, execute in this strict order:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ WORKSTREAM 1: Table Settlement Safety & Atomicity (Phase 4 Hardening)  │
│ • Create atomic RPC for markTablePaidAndCloseSession                    │
│ • Validate guest token hash in requestTableBill                         │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│ WORKSTREAM 2: Currency Unblocking (XOF / CFA & International)           │
│ • Lift hardcoded ["USD"] restriction in lib/storefront-features.ts      │
│ • Test zero-decimal Stripe PaymentIntent creation with XOF              │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│ WORKSTREAM 3: Storefront Order Ledger Integration                      │
│ • Add 'order' to recipient_ledger_entries source_type constraint        │
│ • Wire handleStorefrontOrderPaymentSucceeded to credit organizer balance│
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│ WORKSTREAM 4: Business Dashboard Financial Visibility                   │
│ • Wire /dashboard/businesses/[id]/orders to actual order query          │
│ • Add historical transaction & revenue views to tenant workspace        │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│ WORKSTREAM 5: Crypto Webhook Hardening & Ledger Connection              │
│ • Add amount cross-checks to NOWPayments IPN webhook                    │
│ • Connect crypto payments to recipient_ledger_entries                   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│ WORKSTREAM 6: Payout Rails Definition & Regional Expansion              │
│ • Define manual vs automated payout rails for Côte d'Ivoire (Mobile Mo) │
│ • Replace mock Stripe Connect UI with honest payout account settings    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Section 12 — Verification Limits

1. **Live Stripe Account Capabilities:** The live Stripe Dashboard was not queried (read-only audit). The default settlement currency and merchant country of Aldriva's Stripe account must be confirmed by the repository owner.
2. **NOWPayments Account Limits:** Live minimum transaction limits for crypto checkout in sandbox vs production could not be queried without API keys.
3. **Staging Database Modifications:** Per operating rules, no database migrations or RPCs were executed during this audit.

---

## Section 13 — Final Recommendation

### Selection: **FIX FIRST**

**Justification:**
No active money loss is occurring in Production today because Phase 4 is only deployed to Staging and storefront online payments for `XOF` are blocked by configuration. However:
1. `markTablePaidAndCloseSession` must be made atomic before high-volume restaurant floor operations begin, preventing open sessions with settled orders.
2. The hardcoded `["USD"]` restriction in `lib/storefront-features.ts` must be unblocked so the owner's primary target market in Côte d'Ivoire (`XOF`) can use online card payments.
3. The `orders` table must be connected to the ledger before advertising merchant balances or payouts to business owners.

Proceeding directly to new features (such as Phase 5 or advanced split billing) without addressing these points would compound technical debt on top of an unlinked financial ledger.
