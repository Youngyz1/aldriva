"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const migration = read("db/migration_201_courier_dispatch_recovery.sql");
const completionMigration = read("db/migration_202_dispatch_ready_deliveries_after_courier_completion.sql");
const paymentGateMigration = read("db/migration_203_gate_courier_dispatch_on_online_payment.sql");

require.extensions[".ts"] = function compileTs(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { resolveBusinessReadyTime } = require("../../orders/ready-time.ts");
const { DEFAULT_SITE_TIMEZONE, resolveSiteTimezone } = require("../../date-timezone.ts");

function functionBody(source, name) {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert.notEqual(start, -1, `function ${name} exists`);
  const bodyStart = source.indexOf("AS $function$", start);
  const end = source.indexOf("$function$;", bodyStart);
  assert.notEqual(bodyStart, -1, `function ${name} has a body`);
  assert.notEqual(end, -1, `function ${name} terminates`);
  return source.slice(bodyStart, end);
}

const dispatch = functionBody(migration, "dispatch_business_courier_order");
const offerTrigger = functionBody(migration, "offer_ready_delivery_couriers");
const offerView = migration.split("CREATE OR REPLACE VIEW public.business_courier_offer_feed")[1]
  .split(";\n\nREVOKE ALL ON public.business_courier_offer_feed")[0];
const claim = functionBody(migration, "claim_business_courier_offer");
const decline = functionBody(migration, "decline_business_courier_offer");
const readyRefresh = functionBody(migration, "refresh_business_courier_offers_on_ready");
const expiry = functionBody(migration, "courier_dispatch_offer_expiry");
const schema = read("db/migration_186_courier_offers.sql");

test("delivery dispatch is triggered on accept without an ETA", () => {
  const action = read("lib/actions/orders.ts");
  assert.match(offerTrigger, /NEW\.status IN \('accepted', 'preparing', 'ready'\)/);
  assert.match(offerTrigger, /NEW\.fulfilment_type = 'delivery'/);
  assert.match(dispatch, /o\.status IN \('accepted', 'preparing', 'ready'\)/);
  assert.doesNotMatch(dispatch, /estimated_ready_at\s+IS\s+NOT\s+NULL/i);
  assert.match(action, /if \(!isDelivery && !Number\.isFinite\(readyAtMs\)\)/);
  assert.match(migration, /CREATE TRIGGER trg_refresh_business_courier_offers_on_ready/);
});

test("accept fans out to every available, active, invited courier without a five-worker cap", () => {
  const availableCouriers = Array.from({ length: 7 }, (_, index) => `courier-${index + 1}`);
  assert.equal(availableCouriers.length, 7, "fixture intentionally exceeds the former cap");
  assert.match(dispatch, /worker_row\.role = 'courier'/);
  assert.match(dispatch, /worker_row\.is_active = true/);
  assert.match(dispatch, /worker_row\.deactivated_at IS NULL/);
  assert.match(dispatch, /worker_row\.is_available = true/);
  assert.match(dispatch, /accepted_invitation\.accepted_at IS NOT NULL/);
  assert.match(dispatch, /accepted_invitation\.revoked_at IS NULL/);
  assert.doesNotMatch(dispatch, /LIMIT\s+5/i);
  assert.doesNotMatch(dispatch, /estimated_ready_at\s+IS\s+NOT\s+NULL/i);
  assert.match(dispatch, /NOT EXISTS \([\s\S]+active_order\.courier_worker_id = worker_row\.id/);
});

test("ASAP may be accepted with no estimate or with a relative prep estimate", () => {
  const now = new Date("2026-10-28T14:00:00.000Z");
  assert.deepEqual(resolveBusinessReadyTime("", "", "Africa/Abidjan", now), {
    success: true,
    estimatedReadyAt: null,
  });
  const orderCard = read("components/dashboard/orders/OrderCard.tsx");
  assert.match(orderCard, /new Date\(Date\.now\(\) \+ acceptPrepMinutes \* 60 \* 1000\)/);
  assert.match(read("lib/actions/orders.ts"), /if \(!isDelivery && !Number\.isFinite\(readyAtMs\)\)/);
});

test("ASAP orders with and without a prep estimate get a clear offer label", () => {
  const courier = read("components/courier/CourierDashboard.tsx");
  assert.match(offerView, /o\.estimated_ready_at/);
  assert.match(courier, /ASAP — kitchen will alert you when ready/);
  assert.match(courier, /Estimated ready \$\{readyAt\}/);
  assert.match(courier, /offer\.order_status === "ready"/);
});

test("scheduled offers expose and display the scheduled time before a prep estimate", () => {
  const courier = read("components/courier/CourierDashboard.tsx");
  const route = read("app/api/courier/orders/route.ts");
  assert.match(offerView, /o\.scheduled_for/);
  assert.match(route, /estimated_ready_at, scheduled_for, order_status/);
  assert.match(route, /scheduledFor: assigned\.scheduled_for/);
  assert.match(courier, /Scheduled for \$\{scheduledAt\}/);
  assert.ok(courier.indexOf("scheduledAt\n                    : readyAt") < courier.indexOf("Estimated ready "), "scheduled timing takes precedence over kitchen ETA");
});

test("time-only input uses the explicit business/site timezone and resolves to today's date", () => {
  const now = new Date("2026-10-28T14:00:00.000Z");
  assert.equal(resolveSiteTimezone("", DEFAULT_SITE_TIMEZONE), "Africa/Abidjan");
  const result = resolveBusinessReadyTime("", "15:00", "Africa/Abidjan", now);
  assert.deepEqual(result, { success: true, estimatedReadyAt: "2026-10-28T15:00:00.000Z" });
  assert.equal(resolveSiteTimezone("Europe/Paris", DEFAULT_SITE_TIMEZONE), "Europe/Paris");
});

test("date-only acceptance input is rejected instead of silently becoming no ETA", () => {
  assert.deepEqual(
    resolveBusinessReadyTime("2026-10-29", "", "Africa/Abidjan", new Date("2026-10-28T14:00:00.000Z")),
    { success: false, message: "Enter a ready time for that date, or clear the date to leave the estimate empty." }
  );
  assert.match(read("components/dashboard/orders/OrderCard.tsx"), /Enter a ready time for that date/);
});

test("past time-only and dated estimates are rejected", () => {
  const now = new Date("2026-10-28T14:00:00.000Z");
  assert.equal(resolveBusinessReadyTime("", "13:59", "Africa/Abidjan", now).success, false);
  assert.equal(resolveBusinessReadyTime("2026-10-28", "13:59", "Africa/Abidjan", now).success, false);
});

test("repeated acceptance dispatch cannot create duplicate order/courier offers", () => {
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS uq_business_courier_offers_order_worker[\s\S]+\(order_id, courier_worker_id\)/);
  assert.match(dispatch, /ON CONFLICT \(order_id, courier_worker_id\) DO UPDATE/);
  assert.match(dispatch, /existing_offer\.status IN \('withdrawn', 'expired'\)/);
  assert.match(migration, /IF COALESCE\(p_reoffer, false\)[\s\S]+IF v_open_count > 0 THEN\s+RAISE EXCEPTION 'COURIER_DISPATCH_BATCH_STILL_OPEN'/);
});

test("ASAP offers stay open indefinitely; scheduled offers expire after the pickup window", () => {
  assert.match(migration, /ALTER COLUMN expires_at DROP NOT NULL/);
  assert.match(expiry, /WHEN p_scheduled_for IS NULL THEN NULL::timestamptz/);
  assert.match(expiry, /p_scheduled_for \+ interval '2 hours'/);
  assert.match(expiry, /p_now \+ public\.courier_dispatch_offer_timeout\(\)/);
  assert.doesNotMatch(expiry, /estimated_ready_at/);
  assert.match(offerView, /offer\.expires_at IS NULL OR offer\.expires_at > clock_timestamp\(\)/);
  assert.match(claim, /offer\.expires_at IS NULL OR offer\.expires_at > clock_timestamp\(\)/);
  assert.match(decline, /offer\.expires_at IS NULL OR offer\.expires_at > clock_timestamp\(\)/);
  assert.match(read("app/dashboard/org/[id]/orders/page.tsx"), /!offer\.expires_at \|\| \(Number\.isFinite\(expiresAtMs\) && expiresAtMs > Date\.now\(\)\)/);
});

test("the first claim wins under order row lock, and the losing API response reports taken", () => {
  const route = read("app/api/courier/offers/[orderId]/accept/route.ts");
  assert.match(claim, /FOR UPDATE OF o/);
  assert.match(claim, /o\.courier_worker_id IS NULL/);
  assert.match(claim, /FOR UPDATE OF offer/);
  assert.match(claim, /WHERE o\.id = p_order_id[\s\S]+AND o\.courier_worker_id IS NULL/);
  assert.match(claim, /SET status = 'taken'[\s\S]+SET status = 'accepted'/);
  assert.match(route, /courierJson\([\s\S]+This offer was taken by another courier\.[\s\S]+, 409\)/);
});

test("declining is courier-specific and does not hide another courier's offer", () => {
  assert.match(decline, /offer\.courier_worker_id = p_worker_id/);
  assert.match(decline, /SET status = 'declined'/);
  assert.doesNotMatch(decline, /UPDATE public\.business_courier_offers\s+SET status = 'withdrawn'\s+WHERE order_id = p_order_id/i);
});

test("READY refresh re-alerts eligible couriers after expiry without duplicates or resurrecting declines", () => {
  assert.match(readyRefresh, /o\.status = 'ready'/);
  assert.match(readyRefresh, /o\.courier_worker_id IS NULL/);
  assert.match(readyRefresh, /offered_at = clock_timestamp\(\)/);
  assert.match(readyRefresh, /existing_offer\.status IN \('offered', 'expired', 'withdrawn'\)/);
  assert.match(readyRefresh, /prior_offer\.status NOT IN \('offered', 'expired', 'withdrawn'\)/);
  assert.match(readyRefresh, /ON CONFLICT \(order_id, courier_worker_id\)/);
  assert.match(migration, /offer\.expires_at IS NOT NULL\s+AND offer\.expires_at <= clock_timestamp\(\)/);
});

test("claimed orders are not re-offered; the assigned courier sees READY through the active-order feed", () => {
  const route = read("app/api/courier/orders/route.ts");
  const courier = read("components/courier/CourierDashboard.tsx");
  assert.match(readyRefresh, /o\.courier_worker_id IS NULL/);
  assert.match(route, /assignedOrder/);
  assert.match(courier, /assigned\.status === "ready"\s*\?\s*"Pickup at Restaurant"/);
  assert.match(courier, /assigned\.status === "ready"/);
});

test("inactive, deactivated, unavailable, unaccepted, and busy couriers receive no offers", () => {
  assert.match(dispatch, /worker_row\.is_active = true/);
  assert.match(dispatch, /worker_row\.deactivated_at IS NULL/);
  assert.match(dispatch, /worker_row\.is_available = true/);
  assert.match(dispatch, /accepted_invitation\.accepted_at IS NOT NULL/);
  assert.match(dispatch, /accepted_invitation\.revoked_at IS NULL/);
  assert.match(dispatch, /active_order\.status IN \('accepted', 'preparing', 'ready', 'picked_up', 'out_for_delivery'\)/);
});

test("owner-managed WhatsApp and manual rider assignment remain available", () => {
  const orderCard = read("components/dashboard/orders/OrderCard.tsx");
  const deliverySettings = read("lib/delivery-settings.ts");
  const manualAssignment = orderCard.split("const handleSaveRiderModal")[1].split("const handleSendToCourier")[0];
  assert.match(deliverySettings, /courier_whatsapp/);
  assert.match(orderCard, /buildCourierWhatsAppUrl/);
  assert.match(manualAssignment, /nextStatus: "out_for_delivery"/);
  assert.match(manualAssignment, /riderPhoneInput\.trim\(\) \|\| null/);
});

test("null ETA shows safe ASAP or confirmation labels in customer, kitchen, dashboard, courier, and email views", () => {
  const tracking = read("components/site/OrderTrackingView.tsx");
  const kitchen = read("components/dashboard/kitchen/KitchenOrderCard.tsx");
  const orderCard = read("components/dashboard/orders/OrderCard.tsx");
  const courier = read("components/courier/CourierDashboard.tsx");
  const email = read("lib/order-notifications.ts");
  const sorting = read("components/dashboard/orders/OrdersClient.tsx");
  const translations = read("messages/en.json");

  assert.match(tracking, /t\("asapReadyTimePending"\)/);
  assert.match(translations, /"asapReadyTimePending": "ASAP — the kitchen will alert you when your order is ready\."/);
  assert.match(tracking, /Number\.isFinite\(date\.getTime\(\)\)/);
  assert.match(kitchen, /To be confirmed/);
  assert.match(orderCard, /As soon as possible \(ASAP\)/);
  assert.match(orderCard, /Ready time to be confirmed by the kitchen/);
  assert.match(courier, /ASAP — the kitchen will alert you when the order is ready\./);
  assert.match(email, /ASAP — the kitchen will update you when the order is ready\./);
  assert.match(sorting, /Number\.isFinite\(estimated\)/);
});

test("courier in-app feed poll is the notification channel and remains worker/business scoped", () => {
  const route = read("app/api/courier/orders/route.ts");
  const dashboard = read("components/courier/CourierDashboard.tsx");
  assert.match(route, /validateCourierRequestSession/);
  assert.match(route, /\.from\("business_courier_offer_feed"\)/);
  assert.match(route, /\.eq\("courier_worker_id", session\.workerId\)/);
  assert.match(route, /\.eq\("business_id", session\.businessId\)/);
  assert.match(dashboard, /COURIER_FEED_POLL_MS/);
  assert.match(migration, /GRANT SELECT ON public\.business_courier_offer_feed TO service_role/);
});

test("courier completion dispatch includes READY orders in migration 202", () => {
  const completion = functionBody(completionMigration, "dispatch_pending_deliveries_after_courier_completion");
  const mirror = read("supabase/migrations/20261028220000_migration_202_dispatch_ready_deliveries_after_courier_completion.sql");
  const rollback = read("db/migration_202_dispatch_ready_deliveries_after_courier_completion_rollback.sql");

  assert.match(completion, /OLD\.status NOT IN \('picked_up', 'out_for_delivery'\)/);
  assert.match(completion, /NEW\.status <> 'delivered'/);
  assert.match(completion, /pending_order\.status IN \('accepted', 'preparing', 'ready'\)/);
  assert.match(completion, /pending_order\.fulfilment_type = 'delivery'/);
  assert.match(completion, /pending_order\.courier_worker_id IS NULL/);
  assert.match(completion, /PERFORM public\.dispatch_business_courier_order\(v_order_id, false\)/);
  assert.match(completionMigration, /BEGIN;[\s\S]+COMMIT;/);
  assert.match(rollback, /MIGRATION_202_ROLLBACK_BLOCKED/);
  assert.match(rollback, /RAISE EXCEPTION/);
  assert.equal(mirror, completionMigration);
});

test("migration 203 gates dispatch, READY refresh, courier feed, and claims on paid online orders", () => {
  const dispatch203 = functionBody(paymentGateMigration, "dispatch_business_courier_order");
  const readyRefresh203 = functionBody(paymentGateMigration, "refresh_business_courier_offers_on_ready");
  const claim203 = functionBody(paymentGateMigration, "claim_business_courier_offer");
  const feed203 = paymentGateMigration.split("CREATE OR REPLACE VIEW public.business_courier_offer_feed")[1]
    .split(";\n\nREVOKE ALL ON public.business_courier_offer_feed")[0];
  const mirror = read("supabase/migrations/20261029001705_migration_203_gate_courier_dispatch_on_online_payment.sql");
  const rollback = read("db/migration_203_gate_courier_dispatch_on_online_payment_rollback.sql");

  assert.match(dispatch203, /o\.payment_method <> 'online' OR o\.payment_status = 'paid'/);
  assert.match(dispatch203, /order_row\.payment_method <> 'online' OR order_row\.payment_status = 'paid'/);
  assert.match(dispatch203, /ON CONFLICT \(order_id, courier_worker_id\)/);
  assert.doesNotMatch(dispatch203, /LIMIT\s+5/i);
  assert.match(dispatch203, /courier_dispatch_offer_expiry\(order_row\.scheduled_for\)/);
  assert.match(readyRefresh203, /o\.payment_method <> 'online' OR o\.payment_status = 'paid'/);
  assert.match(readyRefresh203, /order_row\.payment_method <> 'online' OR order_row\.payment_status = 'paid'/);
  assert.match(readyRefresh203, /existing_offer\.status IN \('offered', 'expired', 'withdrawn'\)/);
  assert.match(feed203, /o\.payment_method <> 'online' OR o\.payment_status = 'paid'/);
  assert.equal((claim203.match(/o\.payment_method <> 'online' OR o\.payment_status = 'paid'/g) || []).length, 2);
  assert.match(paymentGateMigration, /AFTER UPDATE OF status, estimated_ready_at, fulfilment_type, courier_worker_id, payment_status/);
  assert.match(paymentGateMigration, /OLD\.payment_status IS DISTINCT FROM NEW\.payment_status/);
  assert.match(paymentGateMigration, /BEGIN;[\s\S]+COMMIT;/);
  assert.equal(mirror, paymentGateMigration);
  assert.match(rollback, /MIGRATION_203_ROLLBACK_BLOCKED/);
  assert.match(rollback, /RAISE EXCEPTION/);
});

test("payment-status dispatch retains existing fanout and on-fulfilment eligibility", () => {
  const dispatch203 = functionBody(paymentGateMigration, "dispatch_business_courier_order");
  const offerTrigger203 = paymentGateMigration.slice(paymentGateMigration.indexOf("CREATE TRIGGER trg_offer_ready_delivery_update"));
  assert.match(dispatch203, /worker_row\.is_active = true/);
  assert.match(dispatch203, /worker_row\.is_available = true/);
  assert.match(dispatch203, /accepted_invitation\.accepted_at IS NOT NULL/);
  assert.match(dispatch203, /EXISTS \([\s\S]+business_worker_invitations/);
  assert.match(offerTrigger203, /EXECUTE FUNCTION public\.offer_ready_delivery_couriers\(\)/);
  assert.match(read("lib/courier/__tests__/phase4-courier-accept-dispatch.test.cjs"), /courier in-app feed poll is the notification channel/);
});

test("migration and mirror have no order recovery/backfill", () => {
  const mirror = read("supabase/migrations/20261028210000_migration_201_courier_dispatch_recovery.sql");
  const rollback = read("db/migration_201_courier_dispatch_recovery_rollback.sql");
  assert.doesNotMatch(migration, /ORD-261028-4523|recover_known_order/i);
  assert.doesNotMatch(rollback, /ORD-261028-4523|recover_known_order/i);
  assert.equal(mirror, migration);
});
