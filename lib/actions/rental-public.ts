"use server";

/**
 * lib/actions/rental-public.ts
 *
 * Public-facing data layer for Aldriva Vehicle Rental storefronts.
 * Documentation: docs/design/rental/architecture.md §4 (Slice 3)
 *
 * Security & Isolation Invariants:
 *  - Public visitors never query physical vehicles, plates, VINs, or odometers.
 *  - Availability is calculated purely server-side and returns counts or yes/no.
 *  - Prices are calculated server-side; client-supplied price calculations are ignored.
 *  - Security deposits are strictly separated from rental revenue.
 */

import { headers } from "next/headers";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createRentalBookingInternal } from "@/lib/actions/rental-bookings";
import { calculateRentalAmount } from "@/lib/rental/pricing";
import { validateRentalDatesAndDriver } from "@/lib/rental/validation";
import type { VehicleCategorySpecs } from "@/lib/actions/rental-categories";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSiteUrl } from "@/lib/site-url";
import { createNotification } from "@/lib/notifications";
import { toMinorUnits } from "@/lib/money";
import Stripe from "stripe";

export interface PublicRentalCategory {
  id: string;
  businessId: string;
  name: string;
  slug: string;
  description: string | null;
  dailyRate: number;
  weeklyRate: number | null;
  depositAmount: number;
  currency: string;
  specs: VehicleCategorySpecs;
  photoUrl: string | null;
}

export interface PublicRentalBranch {
  id: string;
  label: string;
  city: string | null;
  addressLine1: string | null;
  phone: string | null;
}

export interface RentalQuote {
  categoryId: string;
  categoryName: string;
  startsAt: string;
  endsAt: string;
  days: number;
  dailyRate: number;
  weeklyRate: number | null;
  rentalAmount: number;
  depositRequiredAmount: number;
  currency: string;
  billingBoundary: "rolling_24h" | "calendar_day";
}

export interface AvailabilityResult {
  available: boolean;
  remainingCount: number; // Capped for privacy (max 5)
  reason?: string;
}

/**
 * List active vehicle categories for the public website.
 * Scrubbed projection: never includes physical vehicle assets.
 */
export async function listPublicRentalCategories(
  organizerId: string,
  businessId?: string
): Promise<PublicRentalCategory[]> {
  const admin = createSupabaseAdmin();

  let query = admin
    .from("vehicle_categories")
    .select("id, business_id, name, slug, description, daily_rate, weekly_rate, deposit_amount, currency, specs, photo_url, sort_order")
    .eq("organizer_id", organizerId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (businessId) {
    query = query.eq("business_id", businessId);
  }

  const { data, error } = await query;
  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    dailyRate: Number(row.daily_rate) || 0,
    weeklyRate: row.weekly_rate != null ? Number(row.weekly_rate) : null,
    depositAmount: Number(row.deposit_amount) || 0,
    currency: row.currency || "USD",
    specs: (row.specs as VehicleCategorySpecs) || {},
    photoUrl: row.photo_url,
  }));
}

/**
 * List active pickup and return branches for public booking selector.
 */
export async function listPublicRentalBranches(
  businessId: string
): Promise<PublicRentalBranch[]> {
  const admin = createSupabaseAdmin();

  const { data, error } = await admin
    .from("business_branches")
    .select("id, label, city, address_line1, phone")
    .eq("business_id", businessId)
    .eq("status", "active")
    .order("label", { ascending: true });

  if (error || !data) {
    return [];
  }

  return data.map((b) => ({
    id: b.id,
    label: b.label,
    city: b.city,
    addressLine1: b.address_line1,
    phone: b.phone,
  }));
}

/**
 * Server-side availability verification for a category and date range.
 * Never exposes vehicle IDs or plates. Returns capped remaining count.
 */
export async function checkCategoryAvailability(params: {
  organizerId: string;
  businessId: string;
  categoryId: string;
  startsAt: string;
  endsAt: string;
}): Promise<AvailabilityResult> {
  const { organizerId, businessId, categoryId, startsAt, endsAt } = params;
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return { available: false, remainingCount: 0, reason: "Invalid dates" };
  }

  // Rate-limit by IP — lightweight but can be polled on every date change
  try {
    const headersList = await headers();
    const forwarded = headersList.get("x-forwarded-for");
    const ip = (forwarded ? forwarded.split(",")[0]?.trim() : null) || "unknown";
    const rl = await checkRateLimit("rentalAvailabilityIp", `ip:${ip}`);
    if (!rl.allowed) {
      return { available: false, remainingCount: 0, reason: "Rate limited" };
    }
  } catch {
    // Non-fatal: proceed if headers() is unavailable (e.g. during build)
  }

  const admin = createSupabaseAdmin();

  // 1. Get active vehicles in category not out_of_service or maintenance
  const { data: vehicles, error: vehErr } = await admin
    .from("vehicles")
    .select("id")
    .eq("organizer_id", organizerId)
    .eq("business_id", businessId)
    .eq("category_id", categoryId)
    .eq("is_active", true)
    .not("status", "in", '("out_of_service","maintenance")');

  if (vehErr || !vehicles || vehicles.length === 0) {
    return { available: false, remainingCount: 0, reason: "No vehicles in category" };
  }

  const vehicleIds = vehicles.map((v) => v.id);

  // 2. Filter out vehicles with maintenance blocks overlapping the requested period
  const { data: blocks } = await admin
    .from("rental_blocks")
    .select("vehicle_id")
    .in("vehicle_id", vehicleIds)
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt);

  const blockedVehicleIds = new Set((blocks ?? []).map((b) => b.vehicle_id));
  const eligibleVehicleIds = vehicleIds.filter((id) => !blockedVehicleIds.has(id));

  if (eligibleVehicleIds.length === 0) {
    return { available: false, remainingCount: 0, reason: "All vehicles under maintenance" };
  }

  // 3. Count assigned bookings on eligible vehicles during requested period.
  // Exclude 'pending' holds whose expires_at is in the past — they are stale
  // and the create_rental_booking function expires them inside the advisory lock
  // (migration_226 step 5). Matching that logic here prevents over-counting.
  const now = new Date().toISOString();
  const { data: assignedBookings } = await admin
    .from("rental_bookings")
    .select("vehicle_id")
    .in("vehicle_id", eligibleVehicleIds)
    .in("status", ["confirmed", "active"])
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt);

  // Pending holds that have NOT yet expired also consume capacity
  const { data: pendingAssigned } = await admin
    .from("rental_bookings")
    .select("vehicle_id")
    .in("vehicle_id", eligibleVehicleIds)
    .eq("status", "pending")
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt);

  // Held awaiting_payment bookings consume capacity until payment_due_at passes
  const { data: awaitingAssigned } = await admin
    .from("rental_bookings")
    .select("vehicle_id")
    .in("vehicle_id", eligibleVehicleIds)
    .eq("status", "awaiting_payment")
    .or(`payment_due_at.is.null,payment_due_at.gt.${now}`)
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt);

  const bookedVehicleIds = new Set([
    ...(assignedBookings ?? []).map((b) => b.vehicle_id),
    ...(pendingAssigned ?? []).map((b) => b.vehicle_id),
    ...(awaitingAssigned ?? []).map((b) => b.vehicle_id),
  ]);

  // 4. Count unassigned category bookings during requested period (non-expired pending + confirmed + active)
  const { data: unassignedConfirmed } = await admin
    .from("rental_bookings")
    .select("id")
    .eq("category_id", categoryId)
    .eq("business_id", businessId)
    .is("vehicle_id", null)
    .in("status", ["confirmed", "active"])
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt);

  const { data: unassignedPending } = await admin
    .from("rental_bookings")
    .select("id")
    .eq("category_id", categoryId)
    .eq("business_id", businessId)
    .is("vehicle_id", null)
    .eq("status", "pending")
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt);

  const { data: unassignedAwaiting } = await admin
    .from("rental_bookings")
    .select("id")
    .eq("category_id", categoryId)
    .eq("business_id", businessId)
    .is("vehicle_id", null)
    .eq("status", "awaiting_payment")
    .or(`payment_due_at.is.null,payment_due_at.gt.${now}`)
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt);

  const unassignedCount =
    (unassignedConfirmed?.length ?? 0) + (unassignedPending?.length ?? 0) + (unassignedAwaiting?.length ?? 0);
  const freeEligibleCount = eligibleVehicleIds.filter((id) => !bookedVehicleIds.has(id)).length;
  const availableCapacity = Math.max(0, freeEligibleCount - unassignedCount);

  return {
    available: availableCapacity > 0,
    remainingCount: Math.min(availableCapacity, 5), // Privacy cap
  };
}

/**
 * Server-side rental quote calculation.
 * Recomputes rates from database; client-side price totals are strictly ignored.
 */
export async function getRentalQuote(params: {
  organizerId: string;
  businessId: string;
  categoryId: string;
  startsAt: string;
  endsAt: string;
}): Promise<{ quote: RentalQuote | null; error?: string }> {
  const { organizerId, businessId, categoryId, startsAt, endsAt } = params;
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return { quote: null, error: "Invalid date range." };
  }

  // Rate-limit by IP — called on every date change in the booking bar
  try {
    const headersList = await headers();
    const forwarded = headersList.get("x-forwarded-for");
    const ip = (forwarded ? forwarded.split(",")[0]?.trim() : null) || "unknown";
    const rl = await checkRateLimit("rentalQuoteIp", `ip:${ip}`);
    if (!rl.allowed) {
      return { quote: null, error: "Too many requests. Please wait a moment and try again." };
    }
  } catch {
    // Non-fatal: proceed if headers() is unavailable (e.g. during build)
  }

  const admin = createSupabaseAdmin();

  // 1. Fetch category rate snapshot
  const { data: category, error: catErr } = await admin
    .from("vehicle_categories")
    .select("id, name, daily_rate, weekly_rate, deposit_amount, currency")
    .eq("id", categoryId)
    .eq("organizer_id", organizerId)
    .eq("business_id", businessId)
    .single();

  if (catErr || !category) {
    return { quote: null, error: "Vehicle category not found." };
  }

  // 2. Fetch business billing boundary setting
  const { data: business } = await admin
    .from("businesses")
    .select("rental_billing_boundary")
    .eq("id", businessId)
    .single();

  const billingBoundary =
    (business?.rental_billing_boundary as "rolling_24h" | "calendar_day") || "rolling_24h";

  const dailyRate = Number(category.daily_rate) || 0;
  const weeklyRate = category.weekly_rate != null ? Number(category.weekly_rate) : null;
  const depositRequiredAmount = Number(category.deposit_amount) || 0;

  // 3. Compute rental amount using business billing boundary
  const rentalAmount = calculateRentalAmount({
    dailyRate,
    weeklyRate,
    startsAt: start,
    endsAt: end,
    billingBoundary,
  });

  // Calculate day count
  let days: number;
  if (billingBoundary === "calendar_day") {
    const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
    days = Math.max(1, Math.round((endDay - startDay) / (1000 * 60 * 60 * 24)));
  } else {
    days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  }

  const quote: RentalQuote = {
    categoryId: category.id,
    categoryName: category.name,
    startsAt,
    endsAt,
    days,
    dailyRate,
    weeklyRate,
    rentalAmount,
    depositRequiredAmount, // Deposit is NEVER added to rentalAmount
    currency: category.currency || "USD",
    billingBoundary,
  };

  return { quote };
}

export interface SubmitPublicRentalBookingInput {
  organizerId: string;
  businessId: string;
  categoryId: string;
  siteSlug?: string;
  startsAt: string;
  endsAt: string;
  pickupBranchId?: string | null;
  returnBranchId?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  driverLicenseNumber?: string | null;
  driverLicenseCountry?: string | null;
  driverDob?: string | null;
  termsAccepted: boolean;
  hp?: string; // honeypot
}

export interface SubmitPublicRentalBookingResult {
  success: boolean;
  error?: string;
  field?: string;
  message?: string;
  confirmationMode?: "approval" | "instant";
  bookingId?: string;
  bookingNumber?: string;
  lookupToken?: string;
  checkoutUrl?: string;
}

/**
 * Public visitor rental booking submission action.
 * Enforces server-side validation, rate limits, bot honeypot, driver minimum age,
 * and re-computes pricing authoritatively from database rates.
 */
export async function submitPublicRentalBooking(
  input: SubmitPublicRentalBookingInput
): Promise<SubmitPublicRentalBookingResult> {
  try {
    // 1. Bot Honeypot check
    if (input.hp && input.hp.trim().length > 0) {
      return { success: false, error: "invalid_submission", message: "Invalid submission detected." };
    }

    // 2. Rate limiting (IP based)
    try {
      const headerList = await headers();
      const forwarded = headerList.get("x-forwarded-for");
      const ip =
        headerList.get("x-real-ip") ||
        (forwarded ? forwarded.split(",")[0]?.trim() : null) ||
        "unknown";

      const ipLimit = await checkRateLimit("rentalRequestIp", `ip:${ip}`);
      if (!ipLimit.allowed) {
        return {
          success: false,
          error: "rate_limited",
          message: "Too many booking requests. Please wait a moment before trying again.",
        };
      }
    } catch {
      // In test runner or non-request context, ignore header lookup errors
    }

    // 3. Agreement to terms
    if (!input.termsAccepted) {
      return {
        success: false,
        error: "terms_required",
        message: "You must accept the rental terms and agreement to continue.",
      };
    }

    // 4. Customer contact validation
    const customerName = (input.customerName || "").trim();
    if (customerName.length < 2 || customerName.length > 100) {
      return {
        success: false,
        error: "invalid_customer_name",
        message: "Please enter your full legal name.",
      };
    }

    const customerEmail = (input.customerEmail || "").trim();
    if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return {
        success: false,
        error: "invalid_customer_email",
        message: "Please enter a valid email address.",
      };
    }

    const admin = createSupabaseAdmin();

    // 5. Tenant & Business verification (fetch storefront settings)
    const { data: business, error: bizErr } = await admin
      .from("businesses")
      .select(
        "id, organizer_id, name, rental_confirmation_mode, rental_min_notice_hours, rental_billing_boundary, rental_require_license_dob, rental_min_driver_age"
      )
      .eq("id", input.businessId)
      .eq("organizer_id", input.organizerId)
      .single();

    if (bizErr || !business) {
      return { success: false, error: "business_not_found", message: "Rental business not found." };
    }

    // 6. Comprehensive Date, Notice, License, and Driver Age validation
    const validation = validateRentalDatesAndDriver({
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      driverDob: input.driverDob,
      driverLicenseNumber: input.driverLicenseNumber,
      requireLicenseDob: business.rental_require_license_dob ?? true,
      minDriverAge: Number(business.rental_min_driver_age) || 21,
      minNoticeHours: Number(business.rental_min_notice_hours) || 2,
    });

    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        field: validation.field,
        message: validation.message,
      };
    }

    const start = new Date(input.startsAt);
    const end = new Date(input.endsAt);

    // 9. Category & Price calculation (recomputed authoritatively, client totals ignored)
    const { data: category, error: catErr } = await admin
      .from("vehicle_categories")
      .select("id, name, daily_rate, weekly_rate, deposit_amount, currency, business_id, organizer_id")
      .eq("id", input.categoryId)
      .eq("business_id", input.businessId)
      .eq("organizer_id", input.organizerId)
      .single();

    if (catErr || !category) {
      return { success: false, error: "category_not_found", message: "Vehicle category not found." };
    }

    const billingBoundary =
      (business.rental_billing_boundary as "rolling_24h" | "calendar_day") || "rolling_24h";

    const dailyRate = Number(category.daily_rate) || 0;
    const weeklyRate = category.weekly_rate != null ? Number(category.weekly_rate) : null;
    const depositRequiredAmount = Number(category.deposit_amount) || 0;

    // Check duration limits
    let days: number;
    if (billingBoundary === "calendar_day") {
      const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
      const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
      days = Math.max(1, Math.round((endDay - startDay) / (1000 * 60 * 60 * 24)));
    } else {
      days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    }

    if (days < 1) {
      return { success: false, error: "duration_too_short", message: "Minimum rental duration is 1 day." };
    }
    if (days > 30) {
      return { success: false, error: "duration_too_long", message: "Maximum rental duration is 30 days." };
    }

    // 10. Determine hold expiry window
    const confirmationMode =
      (business.rental_confirmation_mode as "approval" | "instant") || "approval";

    const expiresAt =
      confirmationMode === "instant"
        ? new Date(Date.now() + 35 * 60 * 1000).toISOString() // 35-minute checkout hold
        : new Date(Date.now() + 24 * 3600 * 1000).toISOString(); // 24-hour approval window

    // 11. Execute booking creation through the single shared engine
    const createResult = await createRentalBookingInternal({
      organizerId: input.organizerId,
      businessId: input.businessId,
      categoryId: input.categoryId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      expiresAt,
      source: "online",
      customerName: customerName,
      customerEmail: customerEmail,
      customerPhone: input.customerPhone?.trim() || null,
      driverLicenseNumber: input.driverLicenseNumber?.trim() || null,
      driverLicenseCountry: input.driverLicenseCountry?.trim() || null,
      driverDob: input.driverDob || null,
      pickupBranchId: input.pickupBranchId || null,
      returnBranchId: input.returnBranchId || null,
      snapshotDailyRate: dailyRate,
      snapshotWeeklyRate: weeklyRate,
      snapshotCurrency: category.currency || "USD",
      depositRequiredAmount,
      notes: "Online storefront booking",
    });

    if ("error" in createResult) {
      if (createResult.error === "CATEGORY_CAPACITY_EXCEEDED") {
        return {
          success: false,
          error: "fully_booked",
          message: "Sorry, all vehicles in this category are fully booked for your selected dates.",
        };
      }
      if (createResult.error === "VEHICLE_CONFLICT") {
        return {
          success: false,
          error: "vehicle_conflict",
          message: "The requested vehicle is no longer available.",
        };
      }
      return {
        success: false,
        error: createResult.error,
        message: createResult.message || "Failed to create reservation.",
      };
    }

    const booking = createResult.booking;

    // 12. Handle payment checkout or approval response
    // normalizeBookingRow drops amount_due_online, so read it from the database
    const { data: dueRow } = await createSupabaseAdmin().from("rental_bookings").select("amount_due_online").eq("id", booking.id).maybeSingle();
    const dueOnline = Number((dueRow as { amount_due_online?: number | string | null } | null)?.amount_due_online ?? 0);
    if (confirmationMode === "instant" && process.env.STRIPE_SECRET_KEY && dueOnline > 0) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const siteUrl = getSiteUrl().replace(/\/$/, "");

        // Use the booking's snapshot currency (never hardcode USD).
        // toMinorUnits handles zero-decimal currencies (JPY, KRW, etc.) correctly.
        const currencyCode = (category.currency || "USD").toUpperCase();
        let unitAmount: number;
        try {
          unitAmount = toMinorUnits(dueOnline, currencyCode);
        } catch {
          // Fallback for unrecognized currency code — standard 2-decimal
          unitAmount = Math.round(dueOnline * 100);
        }

        // Stripe checkout session expires_at must be between 30 minutes and 24 hours from now.
        // The booking hold (expires_at) is set to 35 minutes for instant mode.
        // We set the Stripe session to exactly 30 minutes so it always expires BEFORE the hold
        // is released, ensuring no payment can succeed after the booking hold has lapsed.
        const stripeSessionExpiresAt = Math.floor(Date.now() / 1000) + 30 * 60; // 30 min

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          customer_email: customerEmail,
          expires_at: stripeSessionExpiresAt,
          line_items: [
            {
              price_data: {
                currency: currencyCode.toLowerCase(),
                unit_amount: unitAmount,
                product_data: {
                  name: `Rental: ${category.name}`,
                  description: `${days} day(s) from ${new Date(input.startsAt).toLocaleDateString()} to ${new Date(input.endsAt).toLocaleDateString()} (Security deposit of ${depositRequiredAmount} ${currencyCode} collected separately at pickup)`,
                },
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url: `${siteUrl}/rentals/lookup/${booking.lookup_token}?paid=true`,
          cancel_url: `${siteUrl}/rentals/lookup/${booking.lookup_token}?cancelled=true`,
          metadata: {
            kind: "rental",
            rental_booking_id: booking.id,
            organizer_id: input.organizerId,
            confirmation_mode: "instant",
          },
        });

        return {
          success: true,
          confirmationMode: "instant",
          bookingId: booking.id,
          bookingNumber: booking.booking_number,
          lookupToken: booking.lookup_token,
          checkoutUrl: session.url || undefined,
        };
      } catch (stripeErr) {
        console.error("[submitPublicRentalBooking] Stripe session creation failed:", stripeErr);
        // Fall back to approval response if Stripe session failed to create
      }
    }

    const instantOffline = confirmationMode === "instant" && dueOnline === 0;

    // Notify organizer for approval-mode / pending online bookings, and for
    // instant bookings that were confirmed without a Stripe redirect.
    try {
      const { data: organizer } = await admin
        .from("organizers")
        .select("user_id")
        .eq("id", input.organizerId)
        .maybeSingle();

      if (organizer?.user_id) {
        await createNotification({
          userId: organizer.user_id,
          type: "reservation_placed",
          title: instantOffline
            ? "New rental booking confirmed"
            : "New rental booking request",
          body: instantOffline
            ? `New online rental booking #${booking.booking_number} from ${customerName} is confirmed.`
            : `New online rental request #${booking.booking_number} from ${customerName} awaiting approval.`,
          link: `/dashboard/org/${input.organizerId}/rentals/${booking.id}`,
          relatedType: "reservation",
          relatedId: booking.id,
        });
      }
    } catch (notifErr) {
      console.error("[submitPublicRentalBooking] Failed to notify organizer:", notifErr);
    }

    if (instantOffline) {
      // The booking is already confirmed and no Stripe redirect will happen,
      // so send the confirmation email here. A mail failure must not undo a
      // successfully created booking.
      try {
        const { sendRentalEmail } = await import("@/lib/rental/emails");
        await sendRentalEmail("confirmed", booking.id);
      } catch (mailErr) {
        console.error("[submitPublicRentalBooking] Confirmation email failed:", mailErr);
      }

      return {
        success: true,
        confirmationMode: "instant",
        bookingId: booking.id,
        bookingNumber: booking.booking_number,
        lookupToken: booking.lookup_token,
      };
    }

    try {
      const { sendRentalEmail } = await import("@/lib/rental/emails");
      await sendRentalEmail("request_received", booking.id);
    } catch (mailErr) {
      console.error("[submitPublicRentalBooking] Request emails failed:", mailErr);
    }

    // Default approval confirmation
    return {
      success: true,
      confirmationMode: "approval",
      bookingId: booking.id,
      bookingNumber: booking.booking_number,
      lookupToken: booking.lookup_token,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return { success: false, error: "unexpected_error", message };
  }
}

