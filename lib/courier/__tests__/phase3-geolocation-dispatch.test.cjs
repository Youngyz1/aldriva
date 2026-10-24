const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");

function loadGeolocationHelpers() {
  const filename = path.join(ROOT, "lib/courier/geolocation.ts");
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  const compiledModule = { exports: {} };
  new Function("module", "exports", output)(compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

test("Phase 3: geolocation errors are distinguished and courier lifecycle states are trackable", () => {
  const { geolocationStatusFromErrorCode, isCourierLocationTrackableStatus } = loadGeolocationHelpers();
  assert.equal(geolocationStatusFromErrorCode(1), "permission_denied");
  assert.equal(geolocationStatusFromErrorCode(2), "position_unavailable");
  assert.equal(geolocationStatusFromErrorCode(3), "timeout");
  assert.equal(geolocationStatusFromErrorCode(99), "position_unavailable");
  for (const status of ["accepted", "preparing", "ready", "picked_up", "out_for_delivery"]) {
    assert.equal(isCourierLocationTrackableStatus(status), true, `${status} can share an assigned courier position`);
  }
  assert.equal(isCourierLocationTrackableStatus("delivered"), false);
  assert.equal(isCourierLocationTrackableStatus("cancelled"), false);
});

test("Phase 3: location uploads are rate-limited by time and movement", () => {
  const { shouldUploadCourierLocation } = loadGeolocationHelpers();
  const point = { latitude: 5, longitude: -1 };
  assert.equal(shouldUploadCourierLocation(20_000, 0, point, null), true);
  assert.equal(shouldUploadCourierLocation(20_000, 10_000, point, point), false);
  assert.equal(shouldUploadCourierLocation(20_000, 10_000, { latitude: 5, longitude: -0.9996 }, point), true);
  assert.equal(shouldUploadCourierLocation(22_000, 10_000, point, point), true);
});

test("Phase 3: the platform permits same-origin GPS and rider UI separates acquisition from upload", () => {
  const config = fs.readFileSync(path.join(ROOT, "next.config.ts"), "utf8");
  const dashboard = fs.readFileSync(path.join(ROOT, "components/courier/CourierDashboard.tsx"), "utf8");
  assert.match(config, /geolocation=\(self\)/);
  assert.doesNotMatch(config, /geolocation=\(\)/);
  assert.match(dashboard, /navigator\.geolocation\.watchPosition/);
  assert.match(dashboard, /navigator\.geolocation\.clearWatch/);
  assert.match(dashboard, /Start location sharing/);
  assert.match(dashboard, /Retry location/);
  assert.match(dashboard, /document\.addEventListener\("visibilitychange"/);
  assert.match(dashboard, /window\.addEventListener\("pageshow"/);
  assert.match(dashboard, /locationUploadStatus/);
  assert.match(dashboard, /geolocationStatusFromErrorCode\(error\.code\)/);
});

test("Phase 3: location APIs reject stale writes and expose tracking only for the assigned order", () => {
  const publishRoute = fs.readFileSync(path.join(ROOT, "app/api/courier/orders/[orderId]/location/route.ts"), "utf8");
  const customerRoute = fs.readFileSync(path.join(ROOT, "app/api/orders/[trackingToken]/location/route.ts"), "utf8");
  const businessRoute = fs.readFileSync(path.join(ROOT, "app/api/dashboard/orders/[orderId]/location/route.ts"), "utf8");
  assert.match(publishRoute, /validateCourierRequestSession/);
  assert.match(publishRoute, /\.eq\("courier_worker_id", session\.workerId\)/);
  assert.match(publishRoute, /recordedMs <= prevRecordedMs/);
  assert.match(publishRoute, /\["accepted", "preparing", "ready", "picked_up", "out_for_delivery"\]/);
  assert.match(customerRoute, /tracking_token/);
  assert.match(customerRoute, /order\.courier_worker_id/);
  assert.match(customerRoute, /\.eq\("courier_worker_id", order\.courier_worker_id\)/);
  assert.match(customerRoute, /Cache-Control.*private, no-store/);
  assert.match(businessRoute, /getCurrentUser\(\)/);
  assert.match(businessRoute, /checkTenantAccess/);
  assert.match(businessRoute, /\.eq\("courier_worker_id", order\.courier_worker_id\)/);
});

test("Phase 3: customer tracking labels the prep estimate correctly and never invents a road ETA", () => {
  const trackingView = fs.readFileSync(path.join(ROOT, "components/site/OrderTrackingView.tsx"), "utf8");
  assert.match(trackingView, /This is a kitchen preparation estimate, never a courier arrival estimate/);
  assert.match(trackingView, /roadRouteEtaUnavailable/);
  assert.doesNotMatch(trackingView, /t\("estimatedArrival"\)/);
  for (const locale of ["en", "fr"]) {
    const messages = JSON.parse(fs.readFileSync(path.join(ROOT, `messages/${locale}.json`), "utf8"));
    assert.equal(typeof messages.Orders.roadRouteEtaUnavailable, "string");
    assert.equal(typeof messages.Orders.locationStale, "string");
  }
});

test("Phase 3: accepted delivery offers are durable, atomic, and hide customer address before claim", () => {
  const migration = fs.readFileSync(path.join(ROOT, "db/migration_192_early_courier_dispatch.sql"), "utf8");
  const rollback = fs.readFileSync(path.join(ROOT, "db/migration_192_early_courier_dispatch_rollback.sql"), "utf8");
  const mirror = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261024000000_migration_192_early_courier_dispatch.sql"), "utf8");
  const dispatch = migration.split("CREATE OR REPLACE FUNCTION public.dispatch_business_courier_order")[1].split("$function$;")[0];
  const claim = migration.split("CREATE OR REPLACE FUNCTION public.claim_business_courier_offer")[1].split("$function$;")[0];
  const decline = migration.split("CREATE OR REPLACE FUNCTION public.decline_business_courier_offer")[1].split("$function$;")[0];
  assert.equal(mirror, migration, "timestamped Supabase mirror matches the canonical SQL");
  assert.match(migration, /o\.status IN \('accepted', 'preparing', 'ready'\)/);
  assert.match(migration, /o\.estimated_ready_at IS NOT NULL/);
  assert.match(dispatch, /INSERT INTO public\.business_courier_offers/);
  assert.match(dispatch, /ON CONFLICT \(order_id, courier_worker_id\) DO UPDATE/);
  assert.match(dispatch, /IF COALESCE\(p_reoffer, false\) = false/);
  assert.match(dispatch, /LIMIT 5/);
  assert.match(dispatch, /COURIER_DISPATCH_BATCH_STILL_OPEN/);
  assert.match(migration, /expires_at > clock_timestamp\(\)[\s\S]+FOR UPDATE OF offer/);
  assert.match(decline, /expires_at > clock_timestamp\(\)/);
  assert.match(migration, /MIGRATION_192_BLOCKED/);
  assert.match(migration, /offer_timeout_seconds BETWEEN 60 AND 3600/);
  assert.match(migration, /public\.courier_dispatch_offer_timeout\(\)/);
  assert.match(migration, /advance_business_courier_dispatch/);
  assert.match(migration, /dispatch_pending_deliveries_after_courier_completion/);
  assert.match(migration, /pending_order\.status IN \('accepted', 'preparing'\)/);
  assert.match(rollback, /MIGRATION_192_ROLLBACK_BLOCKED/);
  assert.match(rollback, /DROP TRIGGER IF EXISTS trg_dispatch_pending_deliveries_after_courier_completion/);
  assert.match(migration, /NULL::text AS delivery_address/);
  assert.match(claim, /FOR UPDATE OF o/);
  assert.match(claim, /courier_worker_id = p_worker_id/);
  const orderWrite = claim.split("UPDATE public.orders AS o")[1].split("RETURNING")[0];
  assert.doesNotMatch(orderWrite, /SET status =/);
  assert.doesNotMatch(orderWrite, /status_history/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.claim_business_courier_offer[\s\S]+GRANT EXECUTE[\s\S]+TO service_role/);
});
