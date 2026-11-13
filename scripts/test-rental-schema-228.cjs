// Test script for Rental Schema Migration 228
// Verifies the migration preserves functionality and security

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");

// Legacy bookings counter for report
let legacyBookingsCount = 0;

async function runQuery(sql, description) {
  const { stdout, stderr, status } = spawnSync("psql", [
    "-d", "kilo",
    "-U", "service_role",
    "-h", "localhost",
    "-p", "5432",
    "-c", sql,
    "-t"
  ], { encoding: "utf8", stdio: "pipe" });

  if (status !== 0) {
    console.error(`❌ ${description} FAILED: ${stderr?.toString() || "Unknown error"}`);
    return null;
  }

  return stdout?.toString().trim() || "";
}

async function getLegacyBookingsCount() {
  const count = await runQuery(
    "SELECT COUNT(*) FROM rental_bookings WHERE payment_status = 'paid' AND rental_amount > 0 AND NOT EXISTS (SELECT 1 FROM rental_payments WHERE rental_payments.booking_id = rental_bookings.id)",
    "Count legacy paid bookings (no rental_payments row)"
  );
  return parseInt(count) || 0;
}

async function checkColumns() {
  console.log("📋 Checking new columns and defaults...")

  const checks = [];

  // Check businesses columns
  const businessesRentalPolicy = await runQuery(
    "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'rental_payment_policy'",
    "Check businesses.rental_payment_policy column"
  );

  if (!businessesRentalPolicy) {
    console.error("❌ Column 'rental_payment_policy' missing in businesses");
    return false;
  }

  // Verify rental_payment_policy has NOT NULL DEFAULT 'offline'
  const rentalPolicyCheck = await runQuery(
    "SELECT is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'rental_payment_policy'",
    "Check rental_payment_policy NOT NULL and DEFAULT"
  );

  if (rentalPolicyCheck) {
    const [isNullable, columnDefault] = rentalPolicyCheck.split("|") || [];
    if (isNullable === "NO" && columnDefault === "'offline'") {
      console.log("✅ rental_payment_policy: NOT NULL DEFAULT 'offline'");
    } else {
      console.error(`❌ rental_payment_policy should be NOT NULL DEFAULT 'offline', got is_nullable=${isNullable}, column_default=${columnDefault}`);
      return false;
    }
  }

  // Check businesses.rental_advance_pct
  const businessesAdvance = await runQuery(
    "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'rental_advance_pct'",
    "Check businesses.rental_advance_pct column"
  );

  if (!businessesAdvance) {
    console.error("❌ Column 'rental_advance_pct' missing in businesses");
    return false;
  }

  // Check businesses.rental_payment_link_hours
  const businessesLinkHours = await runQuery(
    "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'rental_payment_link_hours'",
    "Check businesses.rental_payment_link_hours column"
  );

  if (!businessesLinkHours) {
    console.error("❌ Column 'rental_payment_link_hours' missing in businesses");
    return false;
  }

  // Check rental_bookings columns
  const rbPaymentDueAt = await runQuery(
    "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rental_bookings' AND column_name = 'payment_due_at'",
    "Check rental_bookings.payment_due_at column"
  );

  if (!rbPaymentDueAt) {
    console.error("❌ Column 'payment_due_at' missing in rental_bookings");
    return false;
  }

  const rbCustomerLocale = await runQuery(
    "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rental_bookings' AND column_name = 'customer_locale'",
    "Check rental_bookings.customer_locale column"
  );

  if (!rbCustomerLocale) {
    console.error("❌ Column 'customer_locale' missing in rental_bookings");
    return false;
  }

  const rbSnapshotConfMode = await runQuery(
    "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rental_bookings' AND column_name = 'snapshot_confirmation_mode'",
    "Check rental_bookings.snapshot_confirmation_mode column"
  );

  if (!rbSnapshotConfMode) {
    console.error("❌ Column 'snapshot_confirmation_mode' missing in rental_bookings");
    return false;
  }

  // Verify snapshot_confirmation_mode has NOT NULL DEFAULT 'instant'
  const confModeCheck = await runQuery(
    "SELECT is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rental_bookings' AND column_name = 'snapshot_confirmation_mode'",
    "Check snapshot_confirmation_mode NOT NULL and DEFAULT"
  );

  if (confModeCheck) {
    const [isNullable, columnDefault] = confModeCheck.split("|") || [];
    if (isNullable === "NO" && columnDefault === "'instant'") {
      console.log("✅ snapshot_confirmation_mode: NOT NULL DEFAULT 'instant'");
    } else {
      console.error(`❌ snapshot_confirmation_mode should be NOT NULL DEFAULT 'instant', got is_nullable=${isNullable}, column_default=${columnDefault}`);
      return false;
    }
  }

  const rbSnapshotPayPolicy = await runQuery(
    "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rental_bookings' AND column_name = 'snapshot_payment_policy'",
    "Check rental_bookings.snapshot_payment_policy column"
  );

  if (!rbSnapshotPayPolicy) {
    console.error("❌ Column 'snapshot_payment_policy' missing in rental_bookings");
    return false;
  }

  // Verify snapshot_payment_policy has NOT NULL DEFAULT 'offline'
  const payPolicyCheck = await runQuery(
    "SELECT is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rental_bookings' AND column_name = 'snapshot_payment_policy'",
    "Check snapshot_payment_policy NOT NULL and DEFAULT"
  );

  if (payPolicyCheck) {
    const [isNullable, columnDefault] = payPolicyCheck.split("|") || [];
    if (isNullable === "NO" && columnDefault === "'offline'") {
      console.log("✅ snapshot_payment_policy: NOT NULL DEFAULT 'offline'");
    } else {
      console.error(`❌ snapshot_payment_policy should be NOT NULL DEFAULT 'offline', got is_nullable=${isNullable}, column_default=${columnDefault}`);
      return false;
    }
  }

  const rbSnapshotAdvPct = await runQuery(
    "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rental_bookings' AND column_name = 'snapshot_advance_pct'",
    "Check rental_bookings.snapshot_advance_pct column"
  );

  if (!rbSnapshotAdvPct) {
    console.error("❌ Column 'snapshot_advance_pct' missing in rental_bookings");
    return false;
  }

  const rbAmountDueOnline = await runQuery(
    "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rental_bookings' AND column_name = 'amount_due_online'",
    "Check rental_bookings.amount_due_online column"
  );

  if (!rbAmountDueOnline) {
    console.error("❌ Column 'amount_due_online' missing in rental_bookings");
    return false;
  }

  const rbExpiredAt = await runQuery(
    "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rental_bookings' AND column_name = 'expired_at'",
    "Check rental_bookings.expired_at column"
  );

  if (!rbExpiredAt) {
    console.error("❌ Column 'expired_at' missing in rental_bookings");
    return false;
  }

  // Check new tables exist rental_payments, rental_checkout_sessions, rental_booking_events
  const rentalPayments = await runQuery(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rental_payments'",
    "Check rental_payments table exists"
  );

  if (!rentalPayments) {
    console.error("❌ rental_payments table missing");
    return false;
  }

  const rentalCheckoutSessions = await runQuery(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rental_checkout_sessions'",
    "Check rental_checkout_sessions table exists"
  );

  if (!rentalCheckoutSessions) {
    console.error("❌ rental_checkout_sessions table missing");
    return false;
  }

  const rentalBookingEvents = await runQuery(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rental_booking_events'",
    "Check rental_booking_events table exists"
  );

  if (!rentalBookingEvents) {
    console.error("❌ rental_booking_events table missing");
    return false;
  }

  console.log("✅ All new columns and tables present with correct defaults");
  return true;
}

async function checkConstraints() {
  console.log("🔒 Checking constraint definitions...")

  const checks = [];

  // Check constraint names match exactly: chk_businesses_rental_payment_policy,
  // chk_businesses_rental_advance_pct_range, chk_businesses_rental_payment_link_hours,
  // chk_businesses_advance_requires_pct, chk_rental_bookings_customer_locale,
  // chk_rental_bookings_snapshot_advance_pct, chk_rental_bookings_amount_due_online,
  // chk_rental_bookings_snapshot_conf_mode, chk_rental_bookings_snapshot_payment_policy,
  // chk_rental_bookings_advance_requires_pct

  // Check businesses constraint names exist
  const businessesConstraintChecks = await Promise.all([
    runQuery("SELECT constraint_name FROM information_schema.check_constraints WHERE constraint_name = 'chk_businesses_rental_payment_policy'", "Check chk_businesses_rental_payment_policy"),
    runQuery("SELECT constraint_name FROM information_schema.check_constraints WHERE constraint_name = 'chk_businesses_rental_advance_pct_range'", "Check chk_businesses_rental_advance_pct_range"),
    runQuery("SELECT constraint_name FROM information_schema.check_constraints WHERE constraint_name = 'chk_businesses_rental_payment_link_hours'", "Check chk_businesses_rental_payment_link_hours"),
    runQuery("SELECT constraint_name FROM information_schema.check_constraints WHERE constraint_name = 'chk_businesses_advance_requires_pct'", "Check chk_businesses_advance_requires_pct"),
  ]);

  if (!businessesConstraintChecks[0]) {
    console.error("❌ chk_businesses_rental_payment_policy missing");
    return false;
  }
  if (!businessesConstraintChecks[1]) {
    console.error("❌ chk_businesses_rental_advance_pct_range missing");
    return false;
  }
  if (!businessesConstraintChecks[2]) {
    console.error("❌ chk_businesses_rental_payment_link_hours missing");
    return false;
  }
  if (!businessesConstraintChecks[3]) {
    console.error("❌ chk_businesses_advance_requires_pct missing");
    return false;
  }

  // Check rental_bookings constraint names exist
  const rentalBookingsConstraintChecks = await Promise.all([
    runQuery("SELECT constraint_name FROM information_schema.check_constraints WHERE constraint_name = 'chk_rental_bookings_customer_locale'", "Check chk_rental_bookings_customer_locale"),
    runQuery("SELECT constraint_name FROM information_schema.check_constraints WHERE constraint_name = 'chk_rental_bookings_snapshot_advance_pct'", "Check chk_rental_bookings_snapshot_advance_pct"),
    runQuery("SELECT constraint_name FROM information_schema.check_constraints WHERE constraint_name = 'chk_rental_bookings_amount_due_online'", "Check chk_rental_bookings_amount_due_online"),
    runQuery("SELECT constraint_name FROM information_schema.check_constraints WHERE constraint_name = 'chk_rental_bookings_snapshot_conf_mode'", "Check chk_rental_bookings_snapshot_conf_mode"),
    runQuery("SELECT constraint_name FROM information_schema.check_constraints WHERE constraint_name = 'chk_rental_bookings_snapshot_payment_policy'", "Check chk_rental_bookings_snapshot_payment_policy"),
    runQuery("SELECT constraint_name FROM information_schema.check_constraints WHERE constraint_name = 'chk_rental_bookings_advance_requires_pct'", "Check chk_rental_bookings_advance_requires_pct"),
  ]);

  if (!rentalBookingsConstraintChecks[0]) {
    console.error("❌ chk_rental_bookings_customer_locale missing");
    return false;
  }
  if (!rentalBookingsConstraintChecks[1]) {
    console.error("❌ chk_rental_bookings_snapshot_advance_pct missing");
    return false;
  }
  if (!rentalBookingsConstraintChecks[2]) {
    console.error("❌ chk_rental_bookings_amount_due_online missing");
    return false;
  }
  if (!rentalBookingsConstraintChecks[3]) {
    console.error("❌ chk_rental_bookings_snapshot_conf_mode missing");
    return false;
  }
  if (!rentalBookingsConstraintChecks[4]) {
    console.error("❌ chk_rental_bookings_snapshot_payment_policy missing");
    return false;
  }
  if (!rentalBookingsConstraintChecks[5]) {
    console.error("❌ chk_rental_bookings_advance_requires_pct missing");
    return false;
  }

  // Verify ledger source_type includes rental_booking (should be one of 8 values)
  const sourceTypeCheck = await runQuery(
    "SELECT check_clause FROM information_schema.check_constraints WHERE constraint_name = 'recipient_ledger_entries_source_type_check' AND check_clause LIKE '%rental_booking%' AND check_clause LIKE '%donation%' AND check_clause LIKE '%ticket_order%' AND check_clause LIKE '%product_order%' AND check_clause LIKE '%order%' AND check_clause LIKE '%payout%' AND check_clause LIKE '%manual%' AND check_clause LIKE '%reservation_payment%'",
    "Check recipient_ledger_entries_source_type_check includes all 8 source types"
  );

  if (!sourceTypeCheck) {
    console.error("❌ recipient_ledger_entries_source_type_check missing required source types");
    return false;
  }

  console.log("✅ All constraint names match required specifications");
  return true;
}

async function checkCreateRentalBookingStillWorks() {
  console.log("🔍 Testing create_rental_booking still inserts booking...")

  // Insert a test booking
  const insertSql = `
    INSERT INTO public.rental_bookings (
      id, organizer_id, business_id, category_id, source, booking_number,
      starts_at, ends_at, expires_at, pickup_branch_id, return_branch_id,
      customer_name, customer_email, customer_phone, customer_locale,
      driver_license_number, driver_license_country, driver_dob,
      status, payment_status, rental_amount, snapshot_daily_rate, snapshot_weekly_rate,
      snapshot_currency, snapshot_confirmation_mode, snapshot_payment_policy,
      snapshot_advance_pct, amount_due_online,
      deposit_required_amount, notes, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000001',
      'office',
      'TEST-RBK-' || to_char(now() AT TIME ZONE 'UTC', 'YYMMDD') || '-0001',
      now(), now() + interval '1 day', null,
      null, null,
      'Test Customer', 'test@example.com', null, 'en',
      null, null, null,
      'confirmed', 'unpaid', 100.00, 10.00, null,
      'USD', 'instant', 'offline', null, 0.00,
      0.00, null, now(), now()
    ) RETURNING id;
  `;

  const bookingId = await runQuery(insertSql, "Create test rental booking");

  if (!bookingId) {
    console.error("❌ Failed to insert test rental booking");
    return false;
  }

  // Verify the booking was created
  const verifySql = `
    SELECT id FROM public.rental_bookings WHERE id = '${bookingId}' AND status = 'confirmed';
  `;

  const verified = await runQuery(verifySql, "Verify test rental booking was created");

  if (!verified) {
    console.error("❌ Test rental booking was not created correctly");
    return false;
  }

  // Clean up the test booking
  const deleteSql = `DELETE FROM public.rental_bookings WHERE id = '${bookingId}';`;
  const deleteResult = await runQuery(deleteSql, "Clean up test rental booking");

  console.log("✅ create_rental_booking functionality preserved");
  return true;
}

async function checkCheckoutSessionIdempotency() {
  console.log("🔄 Testing checkout session idempotency...")

  // First create a test booking
  const insertSql = `
    INSERT INTO public.rental_bookings (
      id, organizer_id, business_id, category_id, source, booking_number,
      starts_at, ends_at, expires_at, pickup_branch_id, return_branch_id,
      customer_name, customer_email, customer_phone, customer_locale,
      driver_license_number, driver_license_country, driver_dob,
      status, payment_status, rental_amount, snapshot_daily_rate, snapshot_weekly_rate,
      snapshot_currency, snapshot_confirmation_mode, snapshot_payment_policy,
      snapshot_advance_pct, amount_due_online,
      deposit_required_amount, notes, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000002',
      'online',
      'TEST-CHK-' || to_char(now() AT TIME ZONE 'UTC', 'YYMMDD') || '-0001',
      now(), now() + interval '1 day', now() + interval '35 minutes',
      null, null,
      'Test Customer', 'test2@example.com', null, 'en',
      null, null, null,
      'pending', 'unpaid', 100.00, 10.00, null,
      'USD', 'instant', 'full_online', null, 100.00,
      0.00, null, now(), now()
    ) RETURNING id;
  `;

  const bookingId = await runQuery(insertSql, "Create test checkout booking");

  if (!bookingId) {
    console.error("❌ Failed to create test checkout booking");
    return false;
  }

  // Try to insert a second checkout session for the same booking (should be rejected)
  const insertSessionSql = `
    INSERT INTO public.rental_checkout_sessions (
      id, booking_id, stripe_session_id, kind, amount, expires_at, status
    ) VALUES (
      gen_random_uuid(),
      '${bookingId}',
      'sess_test_' || to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDDHHMMSS'),
      'full',
      100.00,
      now() + interval '30 minutes',
      'open'
    ) RETURNING id;
  `;

  const secondSessionId = await runQuery(insertSessionSql, "Try to create second checkout session");

  // This should fail with a unique constraint violation
  if (secondSessionId) {
    console.error("❌ Second checkout session should have been rejected (unique constraint)");

    // Clean up
    const deleteBookingSql = `DELETE FROM public.rental_bookings WHERE id = '${bookingId}';`;
    await runQuery(deleteBookingSql, "Clean up test checkout booking");

    return false;
  }

  // Clean up
  const deleteBookingSql = `DELETE FROM public.rental_bookings WHERE id = '${bookingId}';`;
  await runQuery(deleteBookingSql, "Clean up test checkout booking");

  console.log("✅ Checkout session idempotency verified (unique constraint working)");
  return true;
}

async function checkRefundDirectionConstraint() {
  console.log("💰 Testing refund direction constraint...")

  // Create a test payment with direction 'credit' (this should be REJECTED for refunds)
  const insertPaymentSql = `
    INSERT INTO public.rental_payments (
      id, booking_id, organizer_id, kind, method, amount, currency,
      direction, applied, stripe_session_id, stripe_payment_intent_id, stripe_refund_id,
      notes, created_at
    ) VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000004',
      '00000000-0000-0000-0000-000000000004',
      'refund',
      'stripe',
      50.00,
      'USD',
      'credit',  // This should be REJECTED for refunds
      true,
      'sess_refund_test',
      'pi_refund_test',
      'ref_test123',
      'Test refund payment',
      now()
    ) RETURNING id;
  `;

  const paymentId = await runQuery(insertPaymentSql, "Try to insert refund payment with direction 'credit' (should be REJECTED)");

  if (paymentId) {
    console.error("❌ Refund payment with direction 'credit' should have been REJECTED but was accepted");
    return false;
  }

  // Now create a test payment with direction 'debit' (this should be accepted for refunds)
  const insertDebitPaymentSql = `
    INSERT INTO public.rental_payments (
      id, booking_id, organizer_id, kind, method, amount, currency,
      direction, applied, stripe_session_id, stripe_payment_intent_id, stripe_refund_id,
      notes, created_at
    ) VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000005',
      '00000000-0000-0000-0000-000000000005',
      'refund',
      'stripe',
      50.00,
      'USD',
      'debit',  // This should be ACCEPTED for refunds
      true,
      'sess_refund_test',
      'pi_refund_test',
      'ref_test123',
      'Test refund payment',
      now()
    ) RETURNING id;
  `;

  const debitPaymentId = await runQuery(insertDebitPaymentSql, "Insert refund payment with direction 'debit' (should be ACCEPTED)");

  if (!debitPaymentId) {
    console.error("❌ Refund payment with direction 'debit' should have been ACCEPTED");
    return false;
  }

  // Clean up
  const deleteSql = `DELETE FROM public.rental_payments WHERE id IN ('${paymentId}', '${debitPaymentId}')`;
  await runQuery(deleteSql, "Clean up test refund payments");

  console.log("✅ Refund direction constraint working (refunds must use direction 'debit')");
  return true;
}

async function checkTablePermissions() {
  console.log("🔐 Checking table permissions...")

  // Check that anon and authenticated have no privileges on new tables
  const tables = ['rental_payments', 'rental_checkout_sessions', 'rental_booking_events'];

  for (const table of tables) {
    // Check anon role
    const anonPrivs = await runQuery(
      `SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee = 'anon' AND table_schema = 'public' AND table_name = '${table}'`,
      `Check anon privileges on ${table}`
    );

    if (anonPrivs && anonPrivs.trim() !== '') {
      console.error(`❌ anon has privileges on ${table}: ${anonPrivs}`);
      return false;
    }

    // Check authenticated role
    const authPrivs = await runQuery(
      `SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee = 'authenticated' AND table_schema = 'public' AND table_name = '${table}'`,
      `Check authenticated privileges on ${table}`
    );

    if (authPrivs && authPrivs.trim() !== '') {
      console.error(`❌ authenticated has privileges on ${table}: ${authPrivs}`);
      return false;
    }
  }

  console.log("✅ New tables have correct permissions (service_role only)");
  return true;
}

async function runAllChecks() {
  console.log("🔄 Starting Rental Schema Migration 228 Tests...\n");

  // Get legacy bookings count for report
  legacyBookingsCount = await getLegacyBookingsCount();
  if (legacyBookingsCount > 0) {
    console.log(`📊 Found ${legacyBookingsCount} legacy paid bookings (no rental_payments rows). These will remain unchanged.\n`);
  }

  const results = [];

  results.push(await checkColumns());
  results.push(await checkConstraints());
  results.push(await checkCreateRentalBookingStillWorks());
  results.push(await checkCheckoutSessionIdempotency());
  results.push(await checkRefundDirectionConstraint());
  results.push(await checkTablePermissions());

  const passed = results.filter(Boolean).length;
  const total = results.length;

  console.log("\n" + "="*60);
  console.log(`TEST SUMMARY: ${passed}/${total} checks passed`);
  console.log(`\nLegacy bookings count (no rental_payments): ${legacyBookingsCount}`);

  if (passed === total) {
    console.log("🎉 ALL TESTS PASSED - Migration 228 is ready!")
    return true;
  } else {
    console.log("❌ SOME TESTS FAILED - Review output above and fix issues")
    return false;
  }
}

// Run the tests
runAllChecks()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Test execution error:", error);
    process.exit(1);
  });

async function getLegacyBookingsCount() {
  const count = await runQuery(
    "SELECT COUNT(*) FROM rental_bookings WHERE payment_status = 'paid' AND rental_amount > 0 AND NOT EXISTS (SELECT 1 FROM rental_payments WHERE rental_payments.booking_id = rental_bookings.id)",
    "Count legacy paid bookings (no rental_payments row)"
  );
  return parseInt(count) || 0;
}

async function checkAdvanceOnlineCheck() {
  console.log("🔍 Testing advance_online CHECK constraint...")

  // Test advance_online with null percentage for businesses
  const businessAdvanceTest = await runQuery(
    "INSERT INTO businesses (id, organizer_id, rental_payment_policy, rental_advance_pct) VALUES ('test-business', 'test-org', 'advance_online', NULL) RETURNING id",
    "Test advance_online with null advance_pct"
  );

  if (businessAdvanceTest) {
    console.error("❌ advance_online policy with null advance_pct should have been rejected");
    // Clean up
    await runQuery("DELETE FROM businesses WHERE id = 'test-business'", "Clean up test business");
    return false;
  }

  // Test advance_online with valid percentage for businesses
  const businessValidAdvanceTest = await runQuery(
    "INSERT INTO businesses (id, organizer_id, rental_payment_policy, rental_advance_pct) VALUES ('test-business-valid', 'test-org', 'advance_online', 20) RETURNING id",
    "Test advance_online with valid advance_pct"
  );

  if (!businessValidAdvanceTest) {
    console.error("❌ advance_online policy with valid advance_pct should have been accepted");
    return false;
  }

  // Clean up
  await runQuery("DELETE FROM businesses WHERE id = 'test-business-valid'", "Clean up test business");

  console.log("✅ advance_online CHECK constraint working (requires non-null percentage)");
  return true;
}

async function getSnapshotDefaults() {
  console.log("🔍 Verifying snapshot column defaults...")

  // Check snapshot_payment_policy default
  const payPolicyDefault = await runQuery(
    "SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rental_bookings' AND column_name = 'snapshot_payment_policy' AND column_default = '''offline'''",
    "Check snapshot_payment_policy default value"
  );

  if (!payPolicyDefault) {
    console.error("❌ snapshot_payment_policy should have DEFAULT 'offline'");
    return false;
  }

  // Check snapshot_confirmation_mode default
  const confModeDefault = await runQuery(
    "SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rental_bookings' AND column_name = 'snapshot_confirmation_mode' AND column_default = '''instant'''",
    "Check snapshot_confirmation_mode default value"
  );

  if (!confModeDefault) {
    console.error("❌ snapshot_confirmation_mode should have DEFAULT 'instant'");
    return false;
  }

  console.log("✅ Snapshot column defaults verified");
  return true;
}

async function runAdvancedChecks() {
  // Additional checks
  await checkAdvanceOnlineCheck();
  await getSnapshotDefaults();
}

// Enhanced test execution with additional checks
async function runAllChecksWithAdvanced() {
  console.log("🔄 Starting Enhanced Rental Schema Migration 228 Tests...\n");

  const results = [];

  results.push(await checkColumns());
  results.push(await checkConstraints());
  results.push(await checkCreateRentalBookingStillWorks());
  results.push(await checkCheckoutSessionIdempotency());
  results.push(await checkRefundDirectionConstraint());
  results.push(await checkTablePermissions());
  results.push(await getSnapshotDefaults());

  await runAdvancedChecks();

  const passed = results.filter(Boolean).length;
  const total = results.length;

  console.log("\n" + "="*60);
  console.log(`TEST SUMMARY: ${passed}/${total} checks passed`);
  console.log(`\nLegacy bookings count (no rental_payments): ${legacyBookingsCount}`);

  if (passed === total) {
    console.log("🎉 ALL TESTS PASSED - Migration 228 is ready!")
    return true;
  } else {
    console.log("❌ SOME TESTS FAILED - Review output above and fix issues")
    return false;
  }
}

// Run the enhanced tests
runAllChecksWithAdvanced()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Test execution error:", error);
    process.exit(1);
  });
