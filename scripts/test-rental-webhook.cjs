#!/usr/bin/env node
/**
 * scripts/test-rental-webhook.cjs
 *
 * Manual integration test for the Stripe rental webhook against staging.
 * Simulates checkout.session.completed events and verifies the booking row.
 *
 * PREREQUISITES
 * -------------
 *  1. Install the Stripe CLI: https://stripe.com/docs/stripe-cli
 *     (or use a raw HMAC signing approach below — both are supported)
 *  2. Set environment variables:
 *       SUPABASE_URL            e.g. https://xxxx.supabase.co
 *       SUPABASE_SERVICE_ROLE_KEY  (service_role, NOT anon)
 *       STRIPE_SECRET_KEY       sk_test_...
 *       STRIPE_WEBHOOK_SECRET   whsec_...  (from: stripe listen --print-secret)
 *       STAGING_URL             https://your-staging-domain.vercel.app
 *                               (or http://localhost:3000 for local)
 *
 * HOW TO GET THE WEBHOOK SIGNING SECRET
 * --------------------------------------
 *   Option A (Stripe CLI, recommended for local):
 *     stripe listen --forward-to http://localhost:3000/api/webhooks/stripe
 *     # Prints: "Your webhook signing secret is whsec_..."
 *
 *   Option B (Vercel staging):
 *     Use the Stripe Dashboard → Developers → Webhooks → your endpoint → Signing secret
 *
 * USAGE
 * -----
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_... \
 *   STAGING_URL=https://my-staging.vercel.app \
 *   node scripts/test-rental-webhook.cjs
 *
 * TESTS
 * -----
 *   Test 1 — Normal payment:   POST checkout.session.completed → booking becomes paid + confirmed
 *   Test 2 — Double delivery:  POST the same event again → idempotent, booking unchanged
 *   Test 3 — Late payment:     Booking pre-set to 'cancelled' → no status change, reconciliation row inserted
 *
 * NOTE: This script creates real rows in the staging database via the service_role key.
 * Clean up test rows afterwards with the SQL printed at the end.
 */

"use strict";

const crypto = require("crypto");
const https = require("https");
const http = require("http");

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STAGING_URL = (process.env.STAGING_URL || "http://localhost:3000").replace(/\/$/, "");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`\nMissing required environment variable: ${name}\n`);
    process.exit(1);
  }
  return v;
}

requireEnv("SUPABASE_URL");
requireEnv("SUPABASE_SERVICE_ROLE_KEY");
requireEnv("STRIPE_WEBHOOK_SECRET");

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function supabaseRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1${path}`);
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const isHttp = url.protocol === "http:";
    const lib = isHttp ? http : https;

    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (isHttp ? 80 : 443),
        path: url.pathname + url.search,
        method,
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Prefer": "return=representation",
          ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function getBooking(id) {
  const res = await supabaseRequest("GET", `/rental_bookings?id=eq.${id}&select=*`);
  return res.body?.[0] ?? null;
}

async function getReconciliationRow(bookingId) {
  const res = await supabaseRequest(
    "GET",
    `/payment_reconciliation_failures?raw_metadata->>rental_booking_id=eq.${bookingId}&order=created_at.desc&limit=1&select=*`
  );
  return res.body?.[0] ?? null;
}

async function createTestBooking(overrides = {}) {
  // We need a real organizer_id, business_id, category_id from your staging DB.
  // Set these via env or hard-code test UUIDs here for the first run.
  const organizerId = process.env.TEST_ORGANIZER_ID;
  const businessId = process.env.TEST_BUSINESS_ID;
  const categoryId = process.env.TEST_CATEGORY_ID;

  if (!organizerId || !businessId || !categoryId) {
    console.error(
      "\nSet TEST_ORGANIZER_ID, TEST_BUSINESS_ID, TEST_CATEGORY_ID to UUIDs from your staging DB.\n" +
      "Example: SELECT id FROM organizers LIMIT 1; SELECT id FROM businesses LIMIT 1; SELECT id FROM vehicle_categories LIMIT 1;\n"
    );
    process.exit(1);
  }

  const now = new Date();
  const startsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const endsAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const bookingNumber = `TEST-${Date.now()}`;

  const row = {
    organizer_id: organizerId,
    business_id: businessId,
    category_id: categoryId,
    booking_number: bookingNumber,
    source: "online",
    starts_at: startsAt,
    ends_at: endsAt,
    expires_at: new Date(Date.now() + 35 * 60 * 1000).toISOString(),
    customer_name: "Webhook Test Driver",
    customer_email: "webhook-test@example.com",
    status: "pending",
    payment_status: "unpaid",
    rental_amount: 150.00,
    snapshot_daily_rate: 50.00,
    snapshot_currency: "USD",
    deposit_required_amount: 300.00,
    ...overrides,
  };

  const res = await supabaseRequest("POST", "/rental_bookings", row);
  if (res.status !== 201) {
    console.error("Failed to create test booking:", res.body);
    process.exit(1);
  }
  return res.body[0];
}

// ── Stripe webhook signing ────────────────────────────────────────────────────

function signStripePayload(payload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const hmac = crypto
    .createHmac("sha256", STRIPE_WEBHOOK_SECRET)
    .update(signedPayload)
    .digest("hex");
  return `t=${timestamp},v1=${hmac}`;
}

// ── HTTP POST to webhook ──────────────────────────────────────────────────────

async function postWebhook(eventPayload) {
  const bodyStr = JSON.stringify(eventPayload);
  const sig = signStripePayload(bodyStr);
  const webhookUrl = new URL(`${STAGING_URL}/api/webhooks/stripe`);
  const isHttp = webhookUrl.protocol === "http:";
  const lib = isHttp ? http : https;

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: webhookUrl.hostname,
        port: webhookUrl.port || (isHttp ? 80 : 443),
        path: webhookUrl.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": sig,
          "Content-Length": Buffer.byteLength(bodyStr),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

function buildCheckoutSessionEvent(booking, overrideMeta = {}) {
  // Amount in minor units (cents for USD)
  const amountTotal = Math.round(Number(booking.rental_amount) * 100);

  return {
    id: `evt_test_${crypto.randomBytes(8).toString("hex")}`,
    type: "checkout.session.completed",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: {
      object: {
        id: `cs_test_${crypto.randomBytes(8).toString("hex")}`,
        object: "checkout.session",
        payment_intent: `pi_test_${crypto.randomBytes(8).toString("hex")}`,
        payment_status: "paid",
        status: "complete",
        amount_total: amountTotal,
        currency: (booking.snapshot_currency || "USD").toLowerCase(),
        customer_email: booking.customer_email,
        metadata: {
          kind: "rental",
          rental_booking_id: booking.id,
          organizer_id: booking.organizer_id,
          confirmation_mode: "instant",
          ...overrideMeta,
        },
      },
    },
  };
}

function buildPaymentIntentEvent(booking, overrideMeta = {}) {
  const amountTotal = Math.round(Number(booking.rental_amount) * 100);

  return {
    id: `evt_test_${crypto.randomBytes(8).toString("hex")}`,
    type: "payment_intent.succeeded",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: {
      object: {
        id: `pi_test_${crypto.randomBytes(8).toString("hex")}`,
        object: "payment_intent",
        amount: amountTotal,
        currency: (booking.snapshot_currency || "USD").toLowerCase(),
        status: "succeeded",
        metadata: {
          kind: "rental",
          rental_booking_id: booking.id,
          organizer_id: booking.organizer_id,
          confirmation_mode: "instant",
          ...overrideMeta,
        },
      },
    },
  };
}

// ── Assertion helper ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.error(`  ❌  ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const createdBookingIds = [];

async function test1_NormalPayment() {
  console.log("\n📋 Test 1: Normal payment → booking confirmed");

  const booking = await createTestBooking();
  createdBookingIds.push(booking.id);
  console.log(`   Created booking ${booking.id} (${booking.booking_number})`);

  const event = buildCheckoutSessionEvent(booking);
  const webhookRes = await postWebhook(event);
  assert("Webhook returns HTTP 200", webhookRes.status === 200, `got ${webhookRes.status}`);

  // Allow async processing
  await new Promise((r) => setTimeout(r, 1500));

  const updated = await getBooking(booking.id);
  assert("payment_status = 'paid'", updated?.payment_status === "paid", `got '${updated?.payment_status}'`);
  assert("status = 'confirmed'", updated?.status === "confirmed", `got '${updated?.status}'`);
}

async function test2_DoubleDelivery() {
  console.log("\n📋 Test 2: Double delivery → idempotent, no duplicate notification");

  const booking = await createTestBooking();
  createdBookingIds.push(booking.id);
  console.log(`   Created booking ${booking.id}`);

  const event = buildCheckoutSessionEvent(booking);

  // First delivery
  const r1 = await postWebhook(event);
  assert("First delivery returns HTTP 200", r1.status === 200, `got ${r1.status}`);
  await new Promise((r) => setTimeout(r, 1500));

  const afterFirst = await getBooking(booking.id);
  assert("After 1st: payment_status = 'paid'", afterFirst?.payment_status === "paid");

  // Second delivery — same event, same ID
  const r2 = await postWebhook(event);
  assert("Second delivery returns HTTP 200 (not 500)", r2.status === 200, `got ${r2.status}`);
  await new Promise((r) => setTimeout(r, 1000));

  const afterSecond = await getBooking(booking.id);
  assert("After 2nd: payment_status still 'paid' (no double-flip)", afterSecond?.payment_status === "paid");
  assert("After 2nd: status still 'confirmed' (not reset)", afterSecond?.status === "confirmed");
}

async function test3_LatePayment() {
  console.log("\n📋 Test 3: Late payment on cancelled booking → flagged for review, no status change");

  // Pre-set booking to cancelled to simulate hold expiry
  const booking = await createTestBooking({ status: "cancelled" });
  createdBookingIds.push(booking.id);
  console.log(`   Created booking ${booking.id} (pre-cancelled)`);

  const event = buildCheckoutSessionEvent(booking);
  const webhookRes = await postWebhook(event);
  assert("Webhook returns HTTP 200 (no 500)", webhookRes.status === 200, `got ${webhookRes.status}`);
  await new Promise((r) => setTimeout(r, 1500));

  const updated = await getBooking(booking.id);
  assert("status still 'cancelled' (not accidentally confirmed)", updated?.status === "cancelled", `got '${updated?.status}'`);
  assert("payment_status still 'unpaid' (no flip)", updated?.payment_status === "unpaid", `got '${updated?.payment_status}'`);

  const reconciliationRow = await getReconciliationRow(booking.id);
  assert("payment_reconciliation_failures row inserted", reconciliationRow !== null, "no row found");
  if (reconciliationRow) {
    assert("kind = 'rental'", reconciliationRow.kind === "rental", `got '${reconciliationRow.kind}'`);
  }
}

async function test4_PaymentIntentSucceededAlone() {
  console.log("\n📋 Test 4: payment_intent.succeeded alone must NOT mark rental paid");

  const booking = await createTestBooking();
  createdBookingIds.push(booking.id);
  console.log(`   Created booking ${booking.id} (${booking.booking_number})`);

  // Send payment_intent.succeeded instead of checkout.session.completed
  const event = buildPaymentIntentEvent(booking);
  const webhookRes = await postWebhook(event);
  assert("Webhook returns HTTP 200", webhookRes.status === 200, `got ${webhookRes.status}`);

  await new Promise((r) => setTimeout(r, 1500));

  const checked = await getBooking(booking.id);
  assert("payment_status remains 'unpaid' (payment_intent.succeeded alone does not fulfill)", checked?.payment_status === "unpaid", `got '${checked?.payment_status}'`);
  assert("status remains 'pending' (not confirmed)", checked?.status === "pending", `got '${checked?.status}'`);
}

async function test5_HoldExpired() {
  console.log("\n📋 Test 5: Checkout paid after hold expired → flagged for reconciliation, not confirmed");

  // Pre-set booking to expired to simulate hold expiry before checkout completed
  const booking = await createTestBooking({ status: "expired" });
  createdBookingIds.push(booking.id);
  console.log(`   Created booking ${booking.id} (pre-expired)`);

  const event = buildCheckoutSessionEvent(booking);
  const webhookRes = await postWebhook(event);
  assert("Webhook returns HTTP 200", webhookRes.status === 200, `got ${webhookRes.status}`);

  await new Promise((r) => setTimeout(r, 1500));

  const updated = await getBooking(booking.id);
  assert("status remains 'expired' (never confirmed)", updated?.status === "expired", `got '${updated?.status}'`);
  assert("payment_status remains 'unpaid' (never paid)", updated?.payment_status === "unpaid", `got '${updated?.payment_status}'`);

  const reconciliationRow = await getReconciliationRow(booking.id);
  assert("payment_reconciliation_failures row inserted for expired booking payment", reconciliationRow !== null, "no row found");
  if (reconciliationRow) {
    assert("kind = 'rental'", reconciliationRow.kind === "rental", `got '${reconciliationRow.kind}'`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("Rental Webhook Integration Tests");
  console.log(`Target: ${STAGING_URL}/api/webhooks/stripe`);
  console.log("=".repeat(60));

  try {
    await test1_NormalPayment();
    await test2_DoubleDelivery();
    await test3_LatePayment();
    await test4_PaymentIntentSucceededAlone();
    await test5_HoldExpired();
  } catch (err) {
    console.error("\nUnexpected error:", err);
    failed++;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (createdBookingIds.length > 0) {
    console.log(
      `\nTo clean up test rows in staging (run as service_role):\n` +
      `DELETE FROM public.rental_bookings WHERE id IN (${createdBookingIds.map((id) => `'${id}'`).join(", ")});\n` +
      `DELETE FROM public.payment_reconciliation_failures WHERE raw_metadata->>'rental_booking_id' IN (${createdBookingIds.map((id) => `'${id}'`).join(", ")});`
    );
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
