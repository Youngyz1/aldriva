# Order and Payment Lifecycle Audit — 2026-10

**Audit date:** 2026-10-29  
**Repository branch:** `feat/table-menu-qr-codes`  
**Supabase project inspected:** `qyodwnefnploexgrbuhr` (`eu-west-1`, project name `Aldriva-nightly-cron-and-ingest-pipeline`)  
**Decision:** **Not ready** for a financial release until the backend payment gate and migration-history drift are addressed.

## Scope and evidence standard

This is a read-only audit of the checked-out working tree and the Supabase project catalog. No customer rows were queried. No orders, payments, refunds, notifications, settings, migrations, tests, or builds were run or changed by this audit. The allowed output is this report only.

Labels mean: **Confirmed** = directly visible in source or observed in the live schema; **Partially confirmed** = source/live evidence supports the finding but runtime behavior was not exercised; **Hypothesis** = a risk that depends on configuration or a state not inspected; **Unknown** = not verified. The live project schema queries were catalog-only. “Staging” follows the project context supplied in the existing audit notes and owner reports.

### Concurrent worktree boundary

At inspection, the branch had **46 modified tracked files and 67 untracked paths (113 status entries)**. These include order/payment/tracking/UI changes, migration 198 edits, local migrations 199–202, tests, docs, scratch files, and a local dev server/test activity described by the owner. A parallel audit file was also present. I did not edit or clean any of them. Source findings below describe the checked-out, uncommitted snapshot; another session may change them after this capture. The staging catalog is independent evidence. This prevents attributing the whole working-tree state to a committed release or proving that it matches production.

## A. Executive summary

**What works (Confirmed):** order creation writes a single `orders` row; server code reprices menu items and calculates the total; website card checkout creates a Stripe PaymentIntent and only the signed Stripe webhook can mark it paid; that webhook checks the DB amount, currency, tenant metadata, provider reference, then calls an atomic paid-plus-ledger RPC. Pay-on-fulfilment orders have a separate method/status, and courier completion requires a session for the assigned courier plus a cash-collected confirmation for unpaid orders. Tracking uses a unique random bearer token and tenant scoping. QR table orders flow through the same `orders` table and kitchen/status path as website orders.

**What is broken or incomplete:**

1. **High / financial integrity — Confirmed:** the backend does not require an online order to be paid before acceptance, preparation, READY, or dispatch. The UI blocks this only for unpaid dine-in orders; it still allows delivery and pickup. Even the `pay_online_first` table mode only requires `payment_method='online'` at submission; a direct authenticated server-action call can accept the still-unpaid order. The final delivered/completed transition does reject unpaid online orders, but that is too late to prevent preparation or dispatch. See [OrderCard.tsx](../../components/dashboard/orders/OrderCard.tsx#L700), [orders.ts](../../lib/actions/orders.ts#L422), and [transition-core.ts](../../lib/orders/transition-core.ts#L124).
2. **High / payment-attempt integrity — Confirmed design risk:** an order is inserted before Stripe initialization. A row stores one `provider_reference`, while each retry gets a timestamp-derived Stripe idempotency key and mints a fresh PaymentIntent. A delayed success for a replaced intent fails the current order/reference association and is sent to reconciliation; the prior intent is not explicitly cancelled. No payment-attempt relation was found. See [storefront-order-payments.ts](../../lib/storefront-order-payments.ts#L57) and [storefront-order-payments.ts](../../lib/storefront-order-payments.ts#L92).
3. **High / release integrity — Confirmed:** Supabase’s migration tracker returns only `20260824210000 / migration_75_check_in_ticket_rpc`, while staging contains later order, QR/table, courier-offer tables, functions, and triggers. Local migration files 198–202 are modified or untracked. A routine migration push is unsafe until applied schema and migration history are reconciled.
4. **High / table journey — Confirmed in the current worktree plus live schema:** `getTableRunningBill()` selects `orders.waiter_confirmation_state`, but staging has `orders.dine_in_confirmation` and no `waiter_confirmation_state` or `waiter_confirmed_at`. The live query will fail and the action returns “Failed to load session orders.” The bill calculator and test fixtures also model the obsolete waiter column. The live atomic settlement RPC uses `dine_in_confirmation`. See [table-management.ts](../../lib/actions/table-management.ts#L544), [table-bill.ts](../../lib/table-bill.ts#L58), and the live `information_schema.columns` catalog.
5. **Medium / coverage and customer experience — Confirmed:** the public tracking page loads payment method/status into its data object, but `OrderTrackingView` does not render either value. A customer cannot distinguish awaiting payment, paid online, and cash still due on the tracking page. The dashboard has a payment badge.
6. **Medium / geography and provider — Confirmed from the checked-out code and previously established staging context:** online order card payment is gated to USD only. The money helper’s XOF zero-decimal support does not enable Stripe checkout for XOF. The established context for **Timo Wears** is country `Ukraine` and website timezone metadata `null`; the owner says the business is in Côte d’Ivoire and uses FCFA. No country row was re-read for this audit. Website timezone metadata takes precedence and the code default is `Africa/Abidjan`; country is not used to derive a timezone.

The principal payment fields are separated: operational `status`, `payment_method`, `payment_status`, `provider`, `provider_reference`, `scheduled_for`, and `estimated_ready_at` are distinct columns. They are not a complete payment-attempt model: provider state and payment timing are mostly inferred, failure/processing states are not stored, and cash collection has no provider evidence.

## B. Current implementation stage

I use only stage names already present in the repository:

- **Phase 6 — Unified Commerce:** marked partial in `docs/ROADMAP.md` and `docs/phases/phase-06-commerce.md`; the phase doc reports menu/store checkout and order/payment foundations, with tax, a unified fulfillment dashboard, and multi-item crypto carts deferred.
- **Kitchen & Delivery Workstream (under Phase 6: Unified Commerce):** the current phase doc reports migration 201 applied on staging and migration 202 locally drafted for READY orders after a courier completes a delivery. The roadmap still says the workstream is wholly uncommitted and that order-state flow and the driver dashboard are not built. That is stale against the current source and live triggers.
- **Table & Menu QR Codes (Phases 5–6), implementation Phases 1–4:** the phase document says all four are implemented and verified, including a running bill and settlement. The same document retains older “planned” text, and the roadmap has not been reconciled. The confirmed bill-column mismatch also means “verified” is too broad for the current worktree/live schema combination.

Evidence: `docs/phases/phase-kitchen-delivery.md:1-11`, `docs/phases/phase-table-menu-qr-codes.md:1-16`, `docs/phases/phase-06-commerce.md:1-28`, and `docs/ROADMAP.md:80-81`.

## C. Architecture and code map

| Path | Entry point / operation | Writes or reads | Relevant status / timing |
|---|---|---|---|
| Website storefront | `app/site/[slug]/[[...page]]/page.tsx` resolves published site, capabilities, currency, delivery config and optional table context; `StorefrontBrowse.tsx` submits | Non-card calls `lib/actions/orders.ts::submitOrderRequest` → `lib/order-submit.ts::submitOrderRequestWithClient`; card calls `POST /api/orders/payment-intent` | All new orders begin `pending` and `unpaid`. Default method is `on_fulfilment`; online method is `online`. |
| Card checkout | `app/api/orders/payment-intent/route.ts` → `lib/storefront-order-payments.ts::createOnlineOrderPayment` | Inserts/reuses the order, reads authoritative DB total, creates Stripe PaymentIntent, stamps `provider='stripe'`, one `provider_reference`, and a 30-minute `payment_expires_at` | Order exists before a successful payment; there is no separate attempt row. |
| Paid order | `app/api/webhooks/stripe/route.ts::handlePaymentIntentSucceeded` dispatches `kind='storefront_order'` to `handleStorefrontOrderPaymentSucceeded` | Verifies order association, tenant, currency, amount; calls live `record_storefront_order_paid_and_credit(order_id, payment_intent_id)` | `payment_status` becomes `paid` atomically with one deduplicated `recipient_ledger_entries` credit. Duplicate callbacks do not repeat the paid notification. |
| Operational order transitions | `components/dashboard/orders/OrderCard.tsx` → `lib/actions/orders.ts::updateOrderStatus` → `updateOrderStatusWithClient` → `lib/orders/transition-core.ts::executeOrderStatusTransitionCore` | Status update uses compare-and-set on expected prior status, writes history, then revalidates and sends customer status email | `pending → accepted → preparing → ready`; pickup ends `completed`; delivery continues to courier/`delivered`. |
| Kitchen | `app/api/kitchen/orders/route.ts`; `lib/actions/kitchen-orders.ts::transitionKitchenOrder` | Authenticated cook session scoped to worker/business; shares transition core | Cook transitions only `accepted → preparing → ready`. Kitchen UI renders null/invalid ETA as “To be confirmed.” |
| Table QR | `app/q/[code]/route.ts` resolves active `qr_redirect_codes`, checks business/table, redirects to the published site, sets table context and guest-device cookies | Same `lib/order-submit.ts` path inserts a `dine_in` order with `table_id`, `table_session_id`, `table_label`, guest hash, and `dine_in_confirmation='pending'` | `businesses.table_ordering_mode` controls behavior. QR customer sees waiter-confirmation flow; table orders are not delivery orders. |
| Table sessions/bills | `lib/actions/table-management.ts::{getTableRunningBill,requestTableBill,markTablePaidAndCloseSession}`; live `get_or_create_active_table_session` and `mark_table_paid_and_close_session` security-definer RPCs | `table_sessions`, `orders`, `business_tables`; settlement RPC locks session and orders and marks eligible unpaid `on_fulfilment` orders paid before closing | The checked-out running-bill query currently uses the missing waiter column; the live settlement RPC uses `dine_in_confirmation`. |
| Courier dispatch/feed | Live `orders` triggers invoke `offer_ready_delivery_couriers`, `trigger_refresh_business_courier_offers_on_ready`, `resolve_courier_offers_on_order_status`, and `dispatch_pending_deliveries_after_courier_completion`; `dispatch_business_courier_order`, `advance_business_courier_dispatch`, claim/decline RPCs operate on `business_courier_offers` | `/api/courier/orders` validates courier session, advances dispatch and reads `business_courier_offer_feed`; `CourierDashboard` polls the endpoint | Offers are in-app feed rows; this path is not push, SMS, or WhatsApp. Accept/decline is atomic and scoped to the courier session. The completion trigger’s live function omits `ready` orders; migration 202 is local only. |
| Tracking/rating | `/site/[slug]/orders/[tracking_token]` loads by token and website tenant; `OrderTrackingView` refreshes every 30 seconds; `POST /api/orders/[trackingToken]/rating` | Reads `orders`, masks customer name/phone, limits courier phone until pickup/out-for-delivery; rating is one-time after delivery | Token is a 24-byte random DB default, unique and stable. Status changes do not filter the order out. |

Owner order notifications use `lib/order-notifications.ts`: in-app bell and Resend email are implemented; WhatsApp is explicitly a future extension point. Customer accepted/ready/status emails are dispatched by post-persist transition effects. Storefront online owner notification is deferred until the verified-paid webhook. Courier offer visibility is feed polling rather than an external notification channel.

The live `orders` trigger inventory contains terminal delivery-location cleanup, offer creation/update, READY refresh, offer resolution, and courier-completion dispatch. No payment-status trigger was found; payment settlement is webhook/RPC based.

## D. Customer journey matrix

| Journey | State | Evidence / actual behavior |
|---|---|---|
| Website order, pay on fulfilment | **Working, with manual collection** | Server validates/reprices and inserts `pending + on_fulfilment + unpaid`. Delivery and pickup status paths are shared through order status. |
| Website order, pay online at checkout | **Partial** | USD only; order is stored before payment. Stripe success webhook validates and records paid. Stale/replaced attempt and orphan-order risks remain. |
| Delivery / courier | **Partial** | Accept triggers platform-pool offers and READY refresh; courier polls feed. Courier must assert cash collected to finish an unpaid pay-on-fulfilment order. No in-delivery card/mobile-money attempt exists. |
| Pickup | **Partial** | Online checkout or pay-on-fulfilment. Manager confirms collected payment when completing an unpaid pickup order. No new checkout attempt is presented from tracking after placement. |
| QR/table order | **Partial** | Active table QR resolves to the same storefront; order is `dine_in`; session/order caps are checked in application code. Table-mode `pay_online_first` forces `online` method at submit. Running-bill loader has the live-schema mismatch below. |
| Pay later / pay when served | **Partial** | Table modes `order_pay_later` and `order_pay_now` are stored on `businesses`; both submit `on_fulfilment` and eventually rely on staff/table settlement. `order_pay_now` changes copy, not the persisted payment timing. |
| Pay during delivery | **Missing** | No customer/courier action creates a new provider attempt tied to an existing order. The courier completion endpoint accepts cash confirmation only; unpaid online orders cannot be manually marked paid. |
| Table bill / multiple orders | **Partial** | Calculation aggregates multiple orders and filters a guest’s view by guest hash. There is no split bill and no guest payment of the aggregate balance. Current DB query for the bill fails on the absent waiter column. |
| Failure/retry/cancel | **Partial** | Failed/cancelled Stripe callbacks leave the order unpaid; same checkout key can reuse order, but a retry creates a fresh intent. Paid online cancellation returns a manual-refund warning; no order refund API/webhook handling was found. |
| Tracking | **Partial** | Token/tenant scoped; 30-second refresh; tracking 404 regression is fixed per established context and current fallback source. Payment method/status are not rendered. 404 remains expected for invalid token, missing order, or token not belonging to that website tenant. |
| Delivery rating | **Working in source** | Tracking-token endpoint accepts one rating (1–5, optional bounded comment) only for delivered/completed delivery orders. No live rating write was attempted. |

## E. Payment capability matrix (A–F)

| Scenario | Classification | Evidence-based behavior and limits |
|---|---|---|
| **A. Pay online at checkout** | **Partially connected** | New `orders` row first; Stripe PaymentIntent uses server-repriced DB total; valid signed webhook checks amount/currency/tenant/reference and calls atomic order+ledger RPC; only new paid transition notifies. Online payment is enabled only for USD. The UI success callback is Stripe client confirmation; the database becomes paid when webhook/RPC succeeds. |
| **B. Cash on delivery** | **Partially connected** | Stored as `on_fulfilment + unpaid`. Courier feed reports amount to collect. `/api/courier/orders/[orderId]/delivered` requires a valid assigned courier session and `cashCollectedConfirmed=true`; shared transition core then changes `payment_status` to paid and appends the confirmation note. This is courier attestation, not a cash-provider confirmation; no separate cash receipt/ledger event was found. |
| **C. Pay online during delivery** | **Not implemented as a supported journey** | No endpoint takes an existing order ID and creates a payment attempt. The checkout endpoint accepts a cart/order-submission payload and only has organizer-scoped idempotency; it can reuse an order only if its key/payload are replayed. The courier route accepts cash confirmation; transition core rejects manual payment of an online order. No new order is created by courier payment flow because no such flow exists. |
| **D. Pickup payment** | **Partially connected** | Online at checkout shares the USD-only Stripe path. Pay-on-fulfilment stays unpaid through accepted/preparing/ready; the dashboard’s completion action asks staff to confirm collection and marks it paid. Tracking page does not display pending/paid/to-collect state, so customers cannot see this distinction there. No provider-verified counter terminal flow was found. |
| **E. QR/table ordering and payment** | **Partially connected** | One order row per submission; session bill aggregates orders and calculates paid/unpaid totals. Pay-online-first is per-order checkout, not a table-bill charge; paid rows are excluded from staff cash settlement. Guest bill read is limited to that guest hash, so current UI does not let one guest submit payment for another guest’s balance. Split bills are explicitly out of scope. The bill loader is currently broken against the live `orders` columns. |
| **F. Failure, retry, duplicate, cancel, delayed success, refund** | **Partially connected** | Failed/cancelled callbacks leave `payment_status='unpaid'`; no failed/expired payment status is stored, and UI expiry is derived from `payment_expires_at`. Same webhook replay is idempotent through the order lock/paid state and unique ledger source index. Retry mints a fresh Stripe intent; the single order reference can be replaced, leaving an old intent unassociated. Webhook does not reject success solely because the local 30-minute deadline elapsed. A success after order cancellation is rejected/alerted for reconciliation; a paid order cancellation is not automatically refunded. |

### Provider, currency, and timing configuration

- **Stripe:** wired to menu/storefront order checkout, but code gates online order checkout to `USD` (`lib/storefront-features.ts:50-59`). `lib/money.ts` supporting zero-decimal XOF arithmetic does not override that gate. **XOF card checkout is not end to end.** COD/manual collection can use a non-USD order currency, but that is not an online XOF payment integration.
- **NOWPayments:** routes/webhooks exist for other kinds (business, product, ticket, donation); no menu `orders` payment path or `storefront_order` NOWPayments handler was found. **Not wired for food orders.**
- **Mobile money/local provider:** `orders.payment_method` DB check allows `mobile_money`, but `SubmitOrderOptions` only allows `on_fulfilment | online`; no menu-order mobile-money route was found. **Not wired for food orders.**
- **Timing settings:** ordinary website checkout presents pay-on-fulfilment vs online when the feature and currency gate allow it. The order stores only the method, not an explicit `payment_timing`. Table mode is `businesses.table_ordering_mode`; `pay_online_first` is enforced for method choice server-side, while `order_pay_now` and `order_pay_later` both write `on_fulfilment`. Delivery/pickup “pay during delivery/counter” has no separate backend setting or provider flow. A minimal intended configuration needs an explicit allowed-method/timing policy per business/fulfilment type and server validation at submit; a during-delivery option additionally needs an order-linked attempt/settlement path.

### Separation of lifecycle states

**Confirmed:** operational state is `orders.status`; delivery/pickup/dine-in is `fulfilment_type`; payment method is `payment_method`; internal paid state is `payment_status`; Stripe association is `provider + provider_reference`; schedule and estimate are `scheduled_for` and `estimated_ready_at`; delivery assignment has rider/courier columns. DB checks allow payment status only `unpaid | paid | refunded`, and payment method only `on_fulfilment | online | mobile_money`.

**Limitation:** provider state (`requires_action`, failed, processing, etc.) and each attempt are not an order-level lifecycle record. Expiry is a timestamp/derived badge, not a payment status. Pickup and delivery share one status field; payment timing is inferred from method/table mode and not stored as a separate per-order fact. Courier cash collection has a history note but not a provider transaction reference.

## F. Schema and environment drift

### Authoritative relations and payment linkage

- `public.orders` is the authoritative order and payment-state row. It has a unique default-generated `tracking_token` (`orders_tracking_token_key`) and a unique `(organizer_id, idempotency_key)` index. `uq_orders_provider_reference` uniquely covers `(provider, provider_reference)` when both are non-null.
- `public.recipient_ledger_entries` is the append-only financial ledger relation. Live index `idx_recipient_ledger_entries_source_dedup` uniquely deduplicates non-refund entries by `(source_type, source_id, entry_type)`. The storefront Stripe RPC credits one `order` entry atomically with marking the order paid.
- `public.payment_reconciliation_failures` is the reconciliation alert store; it contains Stripe reference, amount/currency, buyer email, raw metadata, error and resolution time. No row values were read.
- No normalized `order_payment_attempts` relation was found in the public relation catalog. Several attempts per order are therefore **not represented authoritatively**, even though checkout can mint fresh Stripe PaymentIntents for a reused order.
- `table_sessions`, `business_tables`, and `qr_redirect_codes` own table/session/QR state. `business_courier_offers` and `business_courier_offer_feed` own courier offer/visibility state.

### Confirmed query mismatch

- **Confirmed required query mismatch:** staging `public.orders` has `dine_in_confirmation` and `dine_in_declined_reason`; it does not have `waiter_confirmation_state` or `waiter_confirmed_at`. The current `getTableRunningBill()` select asks for `waiter_confirmation_state` (`lib/actions/table-management.ts:546-556`), so PostgREST returns an error and the action returns “Failed to load session orders.” `lib/table-bill.ts` and table-bill tests still use the waiter field. The live `mark_table_paid_and_close_session()` RPC instead checks `dine_in_confirmation`. This is required for the current table-bill UI, not an optional legacy column.
- **Tracking 404:** treated as fixed per the supplied established evidence. Current `app/site/[slug]/orders/[tracking_token]/page.tsx:79-117` selects `dine_in_confirmation` and falls back to baseline columns. No status filter is used. Remaining expected `notFound()` cases are an invalid/missing website, an order token not found under that website’s tenant, or an invalid token/order association; ordinary status changes do not hide the order.
- **RPC references:** live catalog confirms `record_storefront_order_paid_and_credit`, `get_or_create_active_table_session`, `mark_table_paid_and_close_session`, and `submit_dine_in_order` exist and are `SECURITY DEFINER` with locked `search_path`; EXECUTE is granted to `service_role`, not `anon`/`authenticated`. All referenced ledger and table columns exist. Source search found no application call to `submit_dine_in_order` or `get_or_create_active_table_session`; current order/session flow uses `lib/order-submit.ts` direct service-role inserts/queries. That means the RPC’s transaction/advisory-lock guarantees are not on the current order-submit path.
- **Payment schema shape:** payment status has no `failed`, `expired`, `processing`, or `refunded_at` field. The DB does allow `refunded`, but the storefront webhook/actions inspected do not implement order refund processing. This is a modeling limitation, not a missing-column query.
- **RLS:** live RLS is enabled on orders, table sessions, QR/table relations, courier offers, reconciliation failures and ledger. `orders` has no anon table privileges; authenticated tenant roles are scoped by RLS. Courier-offer table has no anon/auth table privileges; server route uses service role after courier-session validation. Reconciliation and ledger tables have broad `anon` table privileges reported by Postgres grants, but current RLS policies deny anonymous rows/writes; this is unnecessary grant surface, not an observed exposure. RPCs are service-role-only.

### Migration history and deploy risk

`list_migrations` returned only **`20260824210000 / migration_75_check_in_ticket_rpc`**. Live catalog includes order timing/payment/courier/table schema and functions from later migrations, and owner context reports migration 201 applied. The working tree has a modified migration 198 plus untracked 199, 200, 201 and 202 files/mirrors/rollbacks. Migration 202 is documented as unapplied. **Do not run `db push` or apply migrations until an operator reconciles live schema against the canonical register and tracker.** Replaying an already-live function/table migration or applying an out-of-sequence rollback could fail or damage schema state.

## G. Security and financial integrity findings

| Severity | Evidence | Finding |
|---|---|---|
| **High (P0)** | **Confirmed:** `OrderCard.tsx:700-724`; `orders.ts:422-440`; `transition-core.ts:124-143` | Server-side transition path has no `payment_status='paid'` gate before accepting/preparing/ready/out-for-delivery for online orders. UI blocks only unpaid dine-in; delivery/pickup remain actionable, and `pay_online_first` is not enforced as paid at the backend transition. Final `delivered/completed` refuses unpaid online, which does not prevent food preparation or courier dispatch. |
| **High (P0)** | **Confirmed design risk:** `storefront-order-payments.ts:57-60, 92-134, 194-241`; live `orders` catalog | Order-first payment can leave an unpaid order if Stripe creation or stamping fails. Retry mints a new intent and overwrites the sole provider reference; a prior delayed success is not associated and is sent to manual reconciliation. No payment-attempt table or old-intent cancellation was found. |
| **High (P1)** | **Confirmed:** `transition-core.ts:144-147`; `lib/actions/orders.ts` cancellation path; no order-refund route found in Stripe webhook/action search | Paid online cancellation produces `online_refund_required`; no automatic Stripe refund or order-refund webhook handling was found. `payment_status` can remain paid on a cancelled order pending manual action. Refund authorization/reconciliation must remain an explicit operational process until implemented. |
| **High (P1)** | **Confirmed:** live tracker response and worktree migration state | Tracker/schema drift makes deployment order unsafe and obscures which migration files have already been applied. |
| **High (P1)** | **Confirmed:** `table-management.ts:546-556` versus live columns/function | Table bill reads a nonexistent column and cannot return the running bill against staging. |
| **Medium** | **Confirmed:** `storefront-features.ts:50-59`, `order-submit.ts:267-270`, DB payment checks | Card checkout is USD-only; XOF/FCFA online is not wired. `mobile_money` exists only as a DB-allowed method, not as an order UI/backend provider path. |
| **Medium** | **Confirmed:** `app/site/[slug]/orders/[tracking_token]/page.tsx:144-173`; `OrderTrackingView.tsx` only declares payment fields | Customer tracking omits payment state, making pay-at-pickup/cash-due/online-paid opaque after checkout. |
| **Medium** | **Partially confirmed:** courier completion route, transition core, ledger RPCs | Cash-collected state is a courier/staff assertion. The source marks order paid and stores history, but no cash receipt/provider transaction reference or ledger credit on this path was found. Whether the recipient ledger is intended to include cash sales is **Unknown**. |
| **Medium** | **Confirmed with qualification:** live Postgres grants/RLS | `anon` has table grants on `payment_reconciliation_failures` and `recipient_ledger_entries`, but current RLS policies deny anonymous rows and mutations. Revoke unnecessary grants and retain owner/admin RLS. No anonymous data access was exercised. |
| **Low / Info** | **Confirmed:** `orders` RLS policy catalog | Authenticated tenant editors/finance roles can read orders under tenant-scoped RLS, which includes customer and tracking fields. This may be intended staff access; confirm least-privilege role expectations. No customer row was read. |

Tracking tokens are high-entropy bearer credentials (DB default `encode(gen_random_bytes(24),'hex')`), unique and not indexed by search engines; page reads are rate-limited and tenant-scoped. Rating is token-authenticated, rate-limited, delivery-only, and non-overwritable. Courier feed is session/worker/business scoped; personal customer details are returned on the assigned-order response, not as an anonymous table read.

## H. Test coverage

No test was run in this audit. In particular, I did not run the full suite or a build because the worktree has concurrent test/dev-server activity and the request prohibits them.

Relevant tests present in the working tree include:

- `lib/__tests__/phase3-order-online-payment.test.cjs`: money conversion, USD gating, DB repricing, idempotent order reuse/fresh intent, webhook replay, amount/currency/tenant rejection, expiry label and cart behavior.
- `lib/__tests__/phase4bc-orders.test.cjs`: status CAS, accept timing, status transitions, unpaid pickup and online terminal guards, ETA and overdue behavior.
- `lib/__tests__/phase6-owner-managed-delivery.test.cjs`: delivery fees, cash collection guard, unpaid online guard at terminal status, paid-online cancellation warning, Stripe amount verification.
- `lib/courier/__tests__/courier-server.test.cjs`: courier session isolation, feed, atomic claim/decline, cash confirmation and unpaid online rejection.
- `lib/__tests__/table-bill.test.cjs`, `table-qr.test.cjs`, `table-settlement-atomic.test.cjs`: pure bill calculations, QR/session rules and mocked atomic settlement.
- `lib/kitchen/__tests__/kitchen-orders.test.cjs`: kitchen feed and worker state transitions.

Coverage gaps or mismatches (Confirmed by source/test inventory):

- No live-schema integration test catches the `waiter_confirmation_state` query against staging’s `dine_in_confirmation` column. The pure bill fixtures use the obsolete waiter field.
- No test proves all online-unpaid operational transitions (accept, prepare, ready, courier dispatch) are rejected server-side. Existing payment guards cover terminal completion; a dine-in button guard is UI-only.
- No test covers two successful/superseded PaymentIntents for one order, old-intent cancellation, webhook success after cancellation/expiry, charge reversal/refund, or a reconciliation replay from the UI.
- No provider-backed in-delivery payment or XOF card/mobile-money test exists. No live checkout, Stripe webhook, cash event, courier session, or RLS scenario was performed.
- No end-to-end QR table payment/bill test runs against the live schema; split bills are explicitly out of scope.

The checked-out docs report different full-suite counts/failure totals across Phase 6, Table & Menu QR, and Kitchen & Delivery records. They are historical/concurrent reports and were not independently verified here; no fresh pass/fail result is claimed.

## I. Prioritized recommendations

Confirmed defects to fix before feature expansion:

1. **P0 — Add server-side online-paid gate.** Reject online-unpaid transitions that expose work to kitchen/couriers; enforce `pay_online_first` payment status at the server boundary, not just the button. Keep the signed webhook as the only authority to set online paid. Ensure dispatch triggers and manual dispatch cannot offer an unpaid online order.
2. **P0 — Make payment attempts durable and idempotent.** Store each attempt against the order, use stable idempotency keys, explicitly cancel/retire an old intent, and make webhook handling reconcile valid late success (including cancellation/expiry policy) without silently losing a charge. Add a supported retry-from-existing-order path.
3. **P0 — Reconcile migration tracker before any deployment.** Compare live schema/functions/triggers with canonical `db/` register and tracker, mark already-applied migrations accurately through the approved workflow, then review each pending migration. Do not replay the local stack blindly.
4. **P1 — Restore running bill compatibility.** Query/map `dine_in_confirmation` consistently in the action and bill model, then make the settlement test reflect the live RPC’s statuses/columns. Keep guest bill reads scoped to the guest hash and staff settlement atomic.
5. **P1 — Define cash accounting and refunds.** Decide whether cash orders belong in `recipient_ledger_entries`; retain actor, order, amount, currency and collection method if they do. Add an auditable refund/reversal workflow for paid cancelled orders before claiming automated refunds.
6. **P1 — Clarify supported order payment configuration.** Persist/validate a clear business policy for online vs pay-on-fulfilment by fulfilment type. If XOF or mobile money is intended, confirm provider merchant capabilities and add provider-specific checkout/webhook/ledger handling; do not infer support from zero-decimal arithmetic or the DB enum.
7. **P2 — Show payment state in tracking.** Render “Paid”, “Awaiting payment”, “Expired/needs retry”, or “Pay on pickup/delivery” from server-loaded fields; do not show a paid label before webhook settlement as authoritative.
8. **P3 — Consider split bills later.** Current phase doc explicitly excludes them; design a separate allocation/partial-payment ledger before adding a UI affordance.

## J. Proposed work using existing documented stages

No new stage name or migration is created by this audit.

### Phase 6 — Unified Commerce (primary next stage)

- **Objective:** prevent unpaid online fulfillment and make retries, delayed successes, cancellation/refund, and payment evidence auditable.
- **Preserve:** server-side repricing, signed webhook validation, atomic paid-plus-ledger RPC, payment/status separation, courier session authorization, and the owner’s USD-only gate until provider capabilities are established.
- **Scope / likely files:** `lib/storefront-order-payments.ts`, `app/api/orders/payment-intent/route.ts`, `app/api/webhooks/stripe/route.ts`, `lib/orders/transition-core.ts`, `lib/actions/orders.ts`, `components/dashboard/orders/OrderCard.tsx`, payment labels/tests; include courier dispatch eligibility if transitions can create offers.
- **Dependencies:** first reconcile staging tracker versus live schema; confirm business policy for pay-now, pay-on-fulfilment, and whether late success after cancellation/expiry is refunded or manually fulfilled.
- **Database impact:** likely a payment-attempt relation or equivalent immutable attempt record, unique provider attempt key, and refund/reconciliation references. This requires a reviewed forward migration and rollback plan; none was authored here.
- **Safeguards:** webhook remains sole online-paid authority; amount/currency derive from DB order; no secret in client; each attempt is idempotent; every captured-but-unsettled charge creates a durable alert; prevent dispatch while unpaid.
- **Acceptance criteria/tests:** online-unpaid cannot reach accepted/preparing/ready/out-for-delivery for website, pickup, or QR; webhook success enables the transition; failure and expiry do not; duplicate and late callbacks settle once; superseded success is either safely attached/refunded and alerted; retries do not create duplicate order rows or untracked charges; tenant and currency mismatch remains rejected.
- **Rollback:** roll back application behavior only after no new attempts are in flight; keep payment-attempt history append-only; database rollback must be fail-closed and retain charge/reconciliation evidence. Do not drop financial rows.

### Table & Menu QR Codes (Phases 5–6), Phase 4 — Running Table Bill & Session Closure

- **Objective:** restore customer/staff running-bill reads against the actual staging schema and keep final settlement consistent with the live atomic RPC.
- **Preserve:** one active session per table, guest-token filtering, order-level online payment, pending waiter confirmation, atomic row locks, and the explicit split-bill exclusion.
- **Scope / likely files:** `lib/actions/table-management.ts`, `lib/table-bill.ts`, `components/site/blocks/StorefrontBrowse.tsx`, `components/dashboard/tables/TableManagerClient.tsx`, `db/migration_199...` and its tests only after tracker/schema reconciliation.
- **Dependencies:** resolve whether current untracked migration 199 is exactly the live function; compare the latest phase document with the live schema; do not update the database from this audit.
- **Database impact:** likely none for the confirmed missing-column query if the source/model is corrected to `dine_in_confirmation`; additional DDL only if catalog reconciliation proves a required object absent.
- **Safeguards:** settlement remains staff-authorized and atomic; reject pending/unverified online orders; never mark an online order paid as table cash; guests only see their own rows; never close after a failed settlement.
- **Acceptance criteria/tests:** live-schema running bill loads and accurately totals multiple orders; cancelled/declined rows excluded; paid online orders remain untouched; unpaid `on_fulfilment` rows settle only on authenticated staff action; session closes once; guest cannot read another guest’s order or pay the aggregate bill.
- **Rollback:** revert the query/model to the last schema-compatible version if the bill regression remains; preserve the live settlement RPC and all ledger entries; any database rollback must first prove it will not remove payment evidence.

### Kitchen & Delivery Workstream (under Phase 6: Unified Commerce)

This remains an existing Phase 6 workstream, not a new stage. Preserve migration 201’s accept-time, uncapped, idempotent offers and ASAP no-expiry behavior. Reconcile and then apply/verify the already drafted migration 202 through the owner’s normal migration process to include READY orders after courier completion. Acceptance criteria: accepted/preparing/ready waiting orders are re-offered after completion; no duplicate `(order_id,courier_worker_id)` rows; claimed orders stay excluded; courier polling remains session-scoped. No staging session or dispatch test was run for this audit.

## K. Readiness decision

**Not ready.** Order creation, online settlement, table ordering, courier offers and tracking foundations exist, but the payment gate is not enforced before fulfillment, payment attempts are not durably modeled, the table running-bill query does not match the live schema, XOF online payment is disabled, and live migration history is materially behind the deployed schema.

**Single most important blocker:** an online-unpaid order can be accepted and reach kitchen/courier-visible states because payment is checked only at the terminal success transition. This can cause preparation or dispatch before money is confirmed.

**Acceptance criteria for removing that blocker:** (1) every server transition and dispatch entry point rejects `payment_method='online' AND payment_status<>'paid'` before kitchen/courier work; (2) Stripe webhook success atomically marks paid before those transitions become available; (3) a paid webhook replay remains idempotent; (4) tests cover website delivery, pickup, and `pay_online_first` dine-in at the action/core and dispatch boundary; (5) staging verifies the same with a valid merchant session and safe non-capturing provider test mode after the owner authorizes it.

**More investigation required?** The source and catalog are sufficient to identify these blockers; runtime provider capability, Stripe account settlement currencies, real merchant/courier behavior, and the exact production schema are **Unknown**. No authenticated merchant/courier session or live payment test was available or attempted. The established Timo Wears context still reports country `Ukraine` and website timezone metadata `null`; owner correction remains `Côte d’Ivoire` in the business Country field and `Africa/Abidjan` in the website timezone setting. No business data was changed.
