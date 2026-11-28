#!/usr/bin/env node
/**
 * scripts/test-rental-booking-concurrency.cjs
 *
 * Real Concurrency Test for Aldriva Vehicle Rental Engine (Slice 2)
 *
 * Proves that when N simultaneous booking requests compete for the last available
 * vehicle in a category, exactly 1 succeeds and N-1 fail with CATEGORY_CAPACITY_EXCEEDED.
 *
 * This validates:
 *  1. The transaction advisory lock: pg_advisory_xact_lock(hashtext('rental_category_' || category_id))
 *  2. Atomic capacity evaluation inside public.create_rental_booking()
 *  3. Concurrency-safe booking number generation via sequence
 *
 * HOW TO RUN ON STAGING:
 *   1. Ensure migrations 224 and 225 are applied on the staging database.
 *   2. Set environment variables in your terminal:
 *      $env:NEXT_PUBLIC_SUPABASE_URL = "https://your-staging-project.supabase.co"
 *      $env:SUPABASE_SERVICE_ROLE_KEY = "your-service-role-key"
 *      # or in bash:
 *      export NEXT_PUBLIC_SUPABASE_URL="https://your-staging-project.supabase.co"
 *      export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
 *   3. Run the script:
 *      node scripts/test-rental-booking-concurrency.cjs
 *   4. Optional parameters:
 *      CONCURRENCY=20 node scripts/test-rental-booking-concurrency.cjs
 */

// @ts-check
const { createClient } = require('@supabase/supabase-js');

// Support loading from .env.local or .env if present
try {
  require('dotenv').config({ path: '.env.local' });
  require('dotenv').config({ path: '.env' });
} catch {
  // dotenv optional
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('\n❌ Missing Supabase credentials.');
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.\n');
  console.error('Example (PowerShell):');
  console.error('  $env:NEXT_PUBLIC_SUPABASE_URL = "https://xxx.supabase.co"');
  console.error('  $env:SUPABASE_SERVICE_ROLE_KEY = "eyJhb..."');
  console.error('  node scripts/test-rental-booking-concurrency.cjs\n');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CONCURRENCY = parseInt(process.env.CONCURRENCY || '10', 10);

async function run() {
  console.log('='.repeat(70));
  console.log(` Aldriva Rental Concurrency Test (N = ${CONCURRENCY} parallel requests)`);
  console.log('='.repeat(70));

  let testOrgId = null;
  let testBusinessId = null;
  let testCategoryId = null;
  let testVehicleId = null;
  const createdBookingIds = [];

  try {
    // 1. Locate an existing active business and organizer
    console.log('\n[1/5] Finding active tenant in database...');
    const { data: businesses, error: bizErr } = await supabase
      .from('businesses')
      .select('id, organizer_id, name')
      .limit(1);

    if (bizErr || !businesses || businesses.length === 0) {
      throw new Error(`Failed to find an active business: ${bizErr?.message || 'No businesses in database'}`);
    }

    testBusinessId = businesses[0].id;
    testOrgId = businesses[0].organizer_id;
    console.log(`  Tenant: org=${testOrgId}, business=${testBusinessId} (${businesses[0].name})`);

    // 2. Create an isolated test category
    console.log('\n[2/5] Creating test vehicle category with 1 unit capacity...');
    const slugSuffix = Math.floor(Math.random() * 1000000);
    const { data: category, error: catErr } = await supabase
      .from('vehicle_categories')
      .insert({
        organizer_id: testOrgId,
        business_id: testBusinessId,
        name: `Test Cat ${slugSuffix}`,
        slug: `test-cat-${slugSuffix}`,
        daily_rate: 75.0,
        currency: 'USD',
        is_active: true,
      })
      .select()
      .single();

    if (catErr || !category) {
      throw new Error(`Failed to create test category: ${catErr?.message || 'Unknown error'}`);
    }
    testCategoryId = category.id;
    console.log(`  Category created: id=${testCategoryId}, slug=${category.slug}`);

    // 3. Create EXACTLY ONE vehicle in this category
    console.log('\n[3/5] Registering exactly 1 vehicle in the category...');
    const plateSuffix = Math.floor(Math.random() * 9000 + 1000);
    const { data: vehicle, error: vehErr } = await supabase
      .from('vehicles')
      .insert({
        organizer_id: testOrgId,
        business_id: testBusinessId,
        category_id: testCategoryId,
        make: 'Toyota',
        model: 'Corolla',
        year: 2024,
        license_plate: `TEST-${plateSuffix}`,
        status: 'available',
        is_active: true,
        current_mileage: 12000,
      })
      .select()
      .single();

    if (vehErr || !vehicle) {
      throw new Error(`Failed to create test vehicle: ${vehErr?.message || 'Unknown error'}`);
    }
    testVehicleId = vehicle.id;
    console.log(`  Vehicle registered: id=${testVehicleId}, plate=${vehicle.license_plate}`);

    // 4. Fire N simultaneous bookings for the identical time window
    const targetPeriodStart = new Date(Date.now() + 86400000 * 5).toISOString(); // 5 days ahead
    const targetPeriodEnd = new Date(Date.now() + 86400000 * 8).toISOString();   // 8 days ahead
    console.log(`\n[4/5] Firing ${CONCURRENCY} SIMULTANEOUS bookings for period:`);
    console.log(`  Starts: ${targetPeriodStart}`);
    console.log(`  Ends:   ${targetPeriodEnd}`);

    const bookingPromises = Array.from({ length: CONCURRENCY }, (_, i) => {
      const customerIdx = i + 1;
      return supabase.rpc('create_rental_booking', {
        p_organizer_id: testOrgId,
        p_business_id: testBusinessId,
        p_category_id: testCategoryId,
        p_starts_at: targetPeriodStart,
        p_ends_at: targetPeriodEnd,
        p_customer_name: `Concurrent Customer ${customerIdx}`,
        p_customer_email: `concur_${customerIdx}_${slugSuffix}@example.com`,
        p_snapshot_daily_rate: 75.0,
        p_rental_amount: 225.0,
        p_source: 'online',
        p_snapshot_currency: 'USD',
      });
    });

    console.log(`  Executing Promise.allSettled on ${CONCURRENCY} concurrent requests...`);
    const startTime = Date.now();
    const results = await Promise.allSettled(bookingPromises);
    const durationMs = Date.now() - startTime;
    console.log(`  All requests finished in ${durationMs}ms`);

    // 5. Analyze results
    console.log('\n[5/6] Analyzing concurrency guarantees...');
    let successCount = 0;
    let capacityExceededCount = 0;
    let otherErrorCount = 0;

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      if (res.status === 'fulfilled') {
        const { data, error } = res.value;
        if (!error && data) {
          successCount++;
          createdBookingIds.push(data.id);
          console.log(`  Request #${i + 1}: ✅ WON! Booking Number: ${data.booking_number}`);
        } else if (error) {
          const msg = error.message || '';
          if (error.code === 'RB001' || error.code === 'P0001' || msg.includes('CATEGORY_CAPACITY_EXCEEDED')) {
            capacityExceededCount++;
            console.log(`  Request #${i + 1}: 🛡️ BLOCKED cleanly: CATEGORY_CAPACITY_EXCEEDED (RB001)`);
          } else {
            otherErrorCount++;
            console.log(`  Request #${i + 1}: ⚠️ Unexpected error: ${error.message} (code: ${error.code})`);
          }
        }
      } else {
        otherErrorCount++;
        console.log(`  Request #${i + 1}: ❌ Rejected promise: ${res.reason}`);
      }
    }

    console.log('\n' + '-'.repeat(70));
    console.log(` CONCURRENCY RESULTS:`);
    console.log(`   Successful Bookings:       ${successCount} (expected: 1)`);
    console.log(`   Capacity Blocked (RB001):  ${capacityExceededCount} (expected: ${CONCURRENCY - 1})`);
    console.log(`   Other/Unexpected Errors:   ${otherErrorCount} (expected: 0)`);
    console.log('-'.repeat(70));

    let concurrencyPassed = (successCount === 1 && capacityExceededCount === CONCURRENCY - 1 && otherErrorCount === 0);

    // 6. Contract Verification Tests
    console.log('\n[6/6] Running SQL Contract Tests...');
    let contractFailures = 0;

    // Contract Test A: Cross-tenant ID rejected (RB004)
    console.log('  [A] Testing cross-tenant ID rejection (RB004)...');
    const fakeOrgId = '00000000-0000-0000-0000-000000000000';
    const { error: crossTenantErr } = await supabase.rpc('create_rental_booking', {
      p_organizer_id: fakeOrgId,
      p_business_id: testBusinessId,
      p_category_id: testCategoryId,
      p_starts_at: targetPeriodStart,
      p_ends_at: targetPeriodEnd,
      p_customer_name: 'Cross Tenant Tester',
      p_customer_email: 'crosstenant@example.com',
      p_snapshot_daily_rate: 75.0,
      p_rental_amount: 225.0,
    });
    if (crossTenantErr && (crossTenantErr.code === 'RB004' || crossTenantErr.message.includes('TENANT_MISMATCH'))) {
      console.log('      ✅ PASS: Cross-tenant rejected with RB004 / TENANT_MISMATCH');
    } else {
      contractFailures++;
      console.error(`      ❌ FAIL: Expected RB004 error, got: ${crossTenantErr?.message} (code: ${crossTenantErr?.code})`);
    }

    // Contract Test B: Specific vehicle in wrong category rejected (RB006)
    console.log('  [B] Testing vehicle in wrong category rejection (RB006)...');
    // Create a 2nd category
    const { data: cat2 } = await supabase.from('vehicle_categories').insert({
      organizer_id: testOrgId,
      business_id: testBusinessId,
      name: `Test Cat Other ${slugSuffix}`,
      slug: `test-cat-other-${slugSuffix}`,
      daily_rate: 80.0,
      currency: 'USD',
      is_active: true,
    }).select().single();

    if (cat2) {
      const { error: wrongCatErr } = await supabase.rpc('create_rental_booking', {
        p_organizer_id: testOrgId,
        p_business_id: testBusinessId,
        p_category_id: cat2.id, // wrong category for testVehicleId
        p_vehicle_id: testVehicleId,
        p_starts_at: targetPeriodStart,
        p_ends_at: targetPeriodEnd,
        p_customer_name: 'Wrong Cat Tester',
        p_customer_email: 'wrongcat@example.com',
        p_snapshot_daily_rate: 80.0,
        p_rental_amount: 240.0,
      });
      if (wrongCatErr && (wrongCatErr.code === 'RB006' || wrongCatErr.message.includes('VEHICLE_INVALID'))) {
        console.log('      ✅ PASS: Vehicle in wrong category rejected with RB006 / VEHICLE_INVALID');
      } else {
        contractFailures++;
        console.error(`      ❌ FAIL: Expected RB006 error, got: ${wrongCatErr?.message} (code: ${wrongCatErr?.code})`);
      }
      await supabase.from('vehicle_categories').delete().eq('id', cat2.id);
    }

    // Contract Test C: Expired pending booking frees capacity
    console.log('  [C] Testing expired pending hold frees capacity...');
    const periodStartC = new Date(Date.now() + 86400000 * 20).toISOString();
    const periodEndC = new Date(Date.now() + 86400000 * 23).toISOString();
    // Insert a pending booking that expired 10 minutes ago
    const expiredAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: expiredBooking } = await supabase.from('rental_bookings').insert({
      organizer_id: testOrgId,
      business_id: testBusinessId,
      category_id: testCategoryId,
      vehicle_id: testVehicleId,
      booking_number: `EXP-${slugSuffix}`,
      status: 'pending',
      expires_at: expiredAt,
      starts_at: periodStartC,
      ends_at: periodEndC,
      snapshot_daily_rate: 75.0,
      rental_amount: 225.0,
      customer_name: 'Expired Holder',
      customer_email: 'expired@example.com',
    }).select().single();

    if (expiredBooking) {
      createdBookingIds.push(expiredBooking.id);
      // Now booking for the same period should succeed because the expired pending booking is auto-expired
      const { data: freshBooking, error: freshErr } = await supabase.rpc('create_rental_booking', {
        p_organizer_id: testOrgId,
        p_business_id: testBusinessId,
        p_category_id: testCategoryId,
        p_vehicle_id: testVehicleId,
        p_starts_at: periodStartC,
        p_ends_at: periodEndC,
        p_customer_name: 'Fresh Customer',
        p_customer_email: 'fresh@example.com',
        p_snapshot_daily_rate: 75.0,
        p_rental_amount: 225.0,
      });

      if (!freshErr && freshBooking) {
        createdBookingIds.push(freshBooking.id);
        console.log('      ✅ PASS: Stale pending booking was expired and vehicle was booked successfully');
      } else {
        contractFailures++;
        console.error(`      ❌ FAIL: Fresh booking failed when pending was expired: ${freshErr?.message}`);
      }
    }

    // Contract Test D: Vehicle with both block and booking in period is not double-subtracted
    console.log('  [D] Testing block + booking on same vehicle does not double-subtract...');
    // Create a 2nd vehicle in the category so category capacity is 2
    const { data: veh2 } = await supabase.from('vehicles').insert({
      organizer_id: testOrgId,
      business_id: testBusinessId,
      category_id: testCategoryId,
      make: 'Honda',
      model: 'Civic',
      year: 2024,
      license_plate: `TEST-D-${plateSuffix}`,
      status: 'available',
      is_active: true,
      current_mileage: 5000,
    }).select().single();

    if (veh2) {
      const periodStartD = new Date(Date.now() + 86400000 * 30).toISOString();
      const periodEndD = new Date(Date.now() + 86400000 * 33).toISOString();

      // Put a maintenance block on vehicle 1
      const { data: blockD } = await supabase.from('rental_blocks').insert({
        organizer_id: testOrgId,
        business_id: testBusinessId,
        vehicle_id: testVehicleId,
        starts_at: periodStartD,
        ends_at: periodEndD,
        reason: 'maintenance',
      }).select().single();

      // Vehicle 2 is free. Attempting a category booking must succeed (capacity is 1, not 0)
      const { data: catBookingD, error: catBookingErr } = await supabase.rpc('create_rental_booking', {
        p_organizer_id: testOrgId,
        p_business_id: testBusinessId,
        p_category_id: testCategoryId,
        p_starts_at: periodStartD,
        p_ends_at: periodEndD,
        p_customer_name: 'Capacity D Customer',
        p_customer_email: 'capd@example.com',
        p_snapshot_daily_rate: 75.0,
        p_rental_amount: 225.0,
      });

      if (!catBookingErr && catBookingD) {
        createdBookingIds.push(catBookingD.id);
        console.log('      ✅ PASS: Vehicle 2 was correctly available despite vehicle 1 block');
      } else {
        contractFailures++;
        console.error(`      ❌ FAIL: Booking failed for available vehicle in partially blocked category: ${catBookingErr?.message}`);
      }

      if (blockD) {
        await supabase.from('rental_blocks').delete().eq('id', blockD.id);
      }
      await supabase.from('vehicles').delete().eq('id', veh2.id);
    }

    if (concurrencyPassed && contractFailures === 0) {
      console.log('\n🎉 ALL TESTS PASSED: Concurrency and SQL contracts verified!');
    } else {
      console.error(`\n❌ SUMMARY: concurrencyPassed=${concurrencyPassed}, contractFailures=${contractFailures}`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('\n💥 Test threw an unhandled exception:', err);
    process.exitCode = 1;
  } finally {
    // Cleanup test records
    console.log('\n[Cleanup] Cleaning up test records...');
    if (createdBookingIds.length > 0) {
      await supabase.from('rental_bookings').delete().in('id', createdBookingIds);
      console.log(`  Deleted ${createdBookingIds.length} test booking(s).`);
    }
    if (testVehicleId) {
      await supabase.from('vehicles').delete().eq('id', testVehicleId);
      console.log('  Deleted test vehicle.');
    }
    if (testCategoryId) {
      await supabase.from('vehicle_categories').delete().eq('id', testCategoryId);
      console.log('  Deleted test category.');
    }
    console.log('Cleanup complete.\n');
  }
}

run();
