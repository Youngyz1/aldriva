"use server";

/**
 * lib/actions/general-booking.ts
 *
 * Server action for General Booking (appointment) requests. Same security
 * posture as submitReservationRequest: honeypot, IP+phone rate limits,
 * name/phone/email validation, preferred-time validation inside opening
 * hours + lead time + horizon (reuses lib/reservation-slots logic),
 * duplicate phone+time check, max 3 open requests per phone, idempotency key.
 *
 * Differences from table reservations: no party-size or seat-capacity
 * checks. Writes party_size = 1, duration_minutes = default_stay_minutes
 * (fallback 60), ends_at computed, booking_type = 'appointment', status
 * 'pending', payment_status 'unpaid'. customer_note = special request.
 * booking_details = { service_type, alt_starts_at, terms_accepted_at }.
 *
 * Both checkboxes (terms + second) must be true or the action rejects.
 * Returns the same result shape as submitReservationRequest so the success
 * screen can be reused.
 */

import { headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { isValidPhoneNumber, normalizePhone } from "@/lib/order-phone";
import { extractReservationSettings } from "@/lib/reservation-settings";
import { resolveBookingHours } from "@/lib/website-content";
import { validateReservationInterval, validateReservationDateOnly } from "@/lib/reservation-slots";
import { getOrgApproval } from "@/lib/server-approval";
import { canTakeOrders } from "@/lib/business-approval";
import { resolveWebsiteTimezone } from "@/lib/date-timezone";
import { getCapabilitiesForBusiness } from "@/lib/business-taxonomy";
import { validatePublicServiceId } from "@/lib/services-public-data";
import { dispatchGeneralBookingNotifications } from "@/lib/general-booking-notifications";

const NOT_AVAILABLE_MESSAGE = "Bookings are not available yet.";

function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "42P01" || code === "42703") return true;
  const message = (err as { message?: unknown }).message;
  return (
    typeof message === "string" &&
    (message.includes("does not exist") || message.includes("schema cache"))
  );
}

export interface SubmitGeneralBookingRequestInput {
  slug: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  serviceType: string;
  serviceId?: string | null;
  preferredStartsAt: string;
  altStartsAt?: string | null;
  specialRequest?: string | null;
  termsAccepted: boolean;
  marketingOptIn: boolean;
  idempotencyKey?: string | null;
  hp?: string | null;
}

export type SubmitGeneralBookingResult =
  | {
      success: true;
      reservationNumber: string;
      lookupToken: string;
    }
  | {
      success: false;
      error:
        | "invalid_submission"
        | "rate_limited"
        | "website_not_found"
        | "reservations_unavailable"
        | "invalid_customer_info"
        | "invalid_time"
        | "too_many_open_requests"
        | "db_error"
        | "unexpected";
      message?: string;
    };

export async function submitGeneralBookingRequest(
  input: SubmitGeneralBookingRequestInput
): Promise<SubmitGeneralBookingResult> {
  const admin = createSupabaseAdmin();
  return submitGeneralBookingRequestWithClient(input, admin);
}

export async function submitGeneralBookingRequestWithClient(
  input: SubmitGeneralBookingRequestInput,
  admin: ReturnType<typeof createSupabaseAdmin>
): Promise<SubmitGeneralBookingResult> {
  try {
    // 1. Honeypot
    if (input.hp && input.hp.trim().length > 0) {
      return { success: false, error: "invalid_submission" };
    }

    // 2. Terms checkbox required; marketing opt-in optional
    if (!input.termsAccepted) {
      return {
        success: false,
        error: "invalid_customer_info",
        message: "Please accept the terms of service to continue.",
      };
    }

    // 3. Rate limits (IP + normalized phone)
    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");
    const ip =
      headerList.get("x-real-ip") ||
      (forwarded ? forwarded.split(",")[0]?.trim() : null) ||
      "unknown";

    const ipLimit = await checkRateLimit("generalBookingRequestIp", `ip:${ip}`);
    if (!ipLimit.allowed) {
      return { success: false, error: "rate_limited", message: "Too many requests. Please wait a moment." };
    }

    const cleanPhone = normalizePhone(input.customerPhone || "");
    if (cleanPhone) {
      const phoneLimit = await checkRateLimit("generalBookingRequestPhone", `phone:${cleanPhone}`);
      if (!phoneLimit.allowed) {
        return { success: false, error: "rate_limited", message: "Too many requests from this phone number." };
      }
    }

    // 4. Field validation
    const customerName = (input.customerName || "").trim();
    if (customerName.length < 1 || customerName.length > 100) {
      return { success: false, error: "invalid_customer_info", message: "Please provide your full name." };
    }
    if (!isValidPhoneNumber(input.customerPhone)) {
      return { success: false, error: "invalid_customer_info", message: "Please provide a valid phone number." };
    }
    const customerEmail = (input.customerEmail || "").trim() || null;
    if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return { success: false, error: "invalid_customer_info", message: "Please provide a valid email address." };
    }
    const serviceType = (input.serviceType || "").trim();
    if (!serviceType) {
      return { success: false, error: "invalid_customer_info", message: "Please select a service type." };
    }
    const customerNote = (input.specialRequest || "").trim().slice(0, 300) || null;

    // 5. Website -> organizer
    const { data: website, error: websiteError } = await admin
      .from("tenant_websites")
      .select("id, slug, status, metadata, tenant_id")
      .eq("slug", input.slug)
      .maybeSingle();

    if (websiteError || !website || website.status !== "published") {
      return { success: false, error: "website_not_found", message: "Website not found or not published." };
    }
    if (!website.tenant_id) {
      return { success: false, error: "website_not_found" };
    }
    const organizerId = website.tenant_id as string;

    // 6. Business, settings, feature gate, approval
    const { data: business } = await admin
      .from("businesses")
      .select("id, industry, category, business_type, offerings, seat_capacity, default_stay_minutes, max_stay_minutes, booking_model")
      .eq("organizer_id", organizerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!business) {
      return { success: false, error: "website_not_found", message: "Business not found." };
    }

    const settings = extractReservationSettings(website.metadata);
    if (!settings.enabled) {
      return { success: false, error: "reservations_unavailable", message: NOT_AVAILABLE_MESSAGE };
    }

    // 6b. General booking requires the BOOKINGS or APPOINTMENTS capability.
    // Table reservations keep their own capability gate (RESERVATIONS/TABLES)
    // and are unaffected by this check.
    const bookingCaps = getCapabilitiesForBusiness(
      business.industry ?? "",
      business.category ?? "",
      business.business_type ?? ""
    );
    const hasBookingCapability =
      bookingCaps.includes("BOOKINGS") || bookingCaps.includes("APPOINTMENTS");
    if (!hasBookingCapability) {
      return { success: false, error: "reservations_unavailable", message: NOT_AVAILABLE_MESSAGE };
    }

    const orgApproval = await getOrgApproval(organizerId);
    if (!canTakeOrders(orgApproval)) {
      return { success: false, error: "reservations_unavailable", message: NOT_AVAILABLE_MESSAGE };
    }

    // 6c. Optional service reference (migration 217 booking_details): an id
    // that doesn't resolve to this organizer's own active service is simply
    // dropped, never rejected — the booking still proceeds.
    const validatedService = input.serviceId
      ? await validatePublicServiceId(organizerId, input.serviceId)
      : null;

    // 7. Fetch website content hours (for time validation)
    const { data: contentRow } = await admin
      .from("website_content")
      .select("content")
      .eq("website_id", website.id)
      .maybeSingle();
    const contentDoc = (contentRow as { content?: unknown } | null)?.content ?? {};
    // Single source of truth with the form (page.tsx): resolve saved hours, else
    // null. A business with no saved hours has no bookable times — the server
    // rejects every slot the form might have offered, matching the form.
    const hoursValue = resolveBookingHours((contentDoc as { hours?: unknown })?.hours);

    // Booking length: service duration_minutes when set and >= 15, else the
    // business default stay (settings.default_stay_minutes, fallback 60).
    const bookingMode = (validatedService?.booking_mode ?? "timed") as "timed" | "date_only";
    const serviceDuration =
      validatedService?.duration_minutes != null && validatedService.duration_minutes >= 15
        ? validatedService.duration_minutes
        : null;
    const durationMinutes = serviceDuration ?? (settings.default_stay_minutes ?? 60);

    const timeZone = resolveWebsiteTimezone(website.metadata);

    // date_only services carry no time grid: validate the date is today-or-
    // later, inside the horizon, and on an open day by business hours. No
    // slot-boundary / off_slot check. Timed or no service: current behavior.
    let startsAtIso: string;
    if (bookingMode === "date_only") {
      const dateCheck = validateReservationDateOnly(input.preferredStartsAt, hoursValue, settings, timeZone);
      if (!dateCheck.valid) {
        return { success: false, error: "invalid_time", message: dateCheck.message };
      }
      startsAtIso = dateCheck.startsAt;
    } else {
      const timeCheck = validateReservationInterval(input.preferredStartsAt, durationMinutes, hoursValue, settings, timeZone);
      if (!timeCheck.valid) {
        return { success: false, error: "invalid_time", message: timeCheck.message };
      }
      startsAtIso = timeCheck.startsAt;
    }

    // 9. Alternative date validation (optional): within horizon, different from preferred
    let altStartsAtIso: string | null = null;
    if (input.altStartsAt) {
      const altCheck = validateReservationInterval(
        input.altStartsAt,
        durationMinutes,
        hoursValue,
        settings,
        timeZone
      );
      if (!altCheck.valid) {
        return { success: false, error: "invalid_time", message: altCheck.message };
      }
      if (altCheck.startsAt === startsAtIso) {
        return {
          success: false,
          error: "invalid_time",
          message: "Alternative date must be different from your preferred date.",
        };
      }
      altStartsAtIso = altCheck.startsAt;
    }

    // 10. Ends at computed
    const endsAtIso = new Date(new Date(startsAtIso).getTime() + durationMinutes * 60_000).toISOString();

    // 11. Duplicate protection: same phone + same preferred time, still open
    const { data: dupe, error: dupeErr } = await admin
      .from("reservations")
      .select("reservation_number, lookup_token")
      .eq("organizer_id", organizerId)
      .eq("customer_phone", cleanPhone)
      .eq("starts_at", startsAtIso)
      .in("status", ["pending", "confirmed"])
      .maybeSingle();
    if (!dupeErr && dupe) {
      return {
        success: true,
        reservationNumber: (dupe as { reservation_number: string }).reservation_number,
        lookupToken: (dupe as { lookup_token: string }).lookup_token,
      };
    }
    if (dupeErr && isMissingTableError(dupeErr)) {
      return { success: false, error: "reservations_unavailable", message: NOT_AVAILABLE_MESSAGE };
    }

    // 12. Open-request cap: 3 pending per phone per organizer
    const { data: openRows, error: openErr } = await admin
      .from("reservations")
      .select("id")
      .eq("organizer_id", organizerId)
      .eq("customer_phone", cleanPhone)
      .eq("status", "pending");
    if (!openErr && Array.isArray(openRows) && openRows.length >= 3) {
      return {
        success: false,
        error: "too_many_open_requests",
        message: "You already have 3 open requests. Please wait for the business to respond.",
      };
    }
    if (openErr && isMissingTableError(openErr)) {
      return { success: false, error: "reservations_unavailable", message: NOT_AVAILABLE_MESSAGE };
    }

    // 13. Numbers + token
    const dateStamp = new Date().toISOString().slice(2, 10).replace(/-/g, "");
    let reservationNumber = `GBK-${dateStamp}-${Math.floor(1000 + Math.random() * 9000)}`;
    const lookupToken = randomBytes(24).toString("hex");
    const nowIso = new Date().toISOString();
    const firstEvent = {
      status: "pending",
      at: nowIso,
      by_user_id: null,
      note: "Request received",
    };

    const bookingDetails = {
      service_type: serviceType,
      alt_starts_at: altStartsAtIso,
      terms_accepted_at: nowIso,
      marketing_opt_in: Boolean(input.marketingOptIn),
      booking_mode: bookingMode,
      duration_minutes: durationMinutes,
      ...(validatedService
        ? { service_id: validatedService.id, service_title: validatedService.title }
        : {}),
    };

    let inserted: { reservation_number: string; lookup_token: string } | null = null;
    let attempts = 0;
    while (!inserted && attempts < 3) {
      attempts++;
      const { data: newRow, error: insertError } = await admin
        .from("reservations")
        .insert({
          organizer_id: organizerId,
          business_id: (business as { id?: string } | null)?.id ?? null,
          website_id: website.id,
          booking_type: "appointment",
          reservation_number: reservationNumber,
          lookup_token: lookupToken,
          customer_name: customerName,
          customer_phone: cleanPhone,
          customer_email: customerEmail,
          party_size: 1,
          starts_at: startsAtIso,
          duration_minutes: durationMinutes,
          ends_at: endsAtIso,
          status: "pending",
          payment_status: "unpaid",
          customer_note: customerNote,
          status_history: [firstEvent],
          idempotency_key: input.idempotencyKey ? (input.idempotencyKey || "").trim() || null : null,
          updated_at: nowIso,
          booking_details: bookingDetails,
        })
        .select("reservation_number, lookup_token")
        .maybeSingle();

      if (insertError) {
        if (isMissingTableError(insertError)) {
          return { success: false, error: "reservations_unavailable", message: NOT_AVAILABLE_MESSAGE };
        }
        if (insertError.code === "23505" && String(insertError.message).includes("reservation_number")) {
          reservationNumber = `GBK-${dateStamp}-${Math.floor(1000 + Math.random() * 9000)}`;
          continue;
        }
        return { success: false, error: "db_error", message: insertError.message };
      }
      inserted = newRow;
    }

    if (!inserted) {
      return { success: false, error: "db_error", message: "Could not create booking request." };
    }

    // Owner notification: never blocks or fails the booking request, even if
    // the dispatcher itself misbehaves (it already catches everything
    // internally; this is a second, independent safety net).
    try {
      await dispatchGeneralBookingNotifications({
        id: `${organizerId}:${inserted.reservation_number}`,
        organizer_id: organizerId,
        reservation_number: inserted.reservation_number,
        customer_name: customerName,
        customer_phone: cleanPhone,
        customer_email: customerEmail,
        service_type: serviceType,
        starts_at: startsAtIso,
        duration_minutes: durationMinutes,
        ends_at: endsAtIso,
        siteTimezone: timeZone,
        customer_note: customerNote,
      });
    } catch (notifyErr) {
      console.error(
        "[submitGeneralBookingRequest] Owner notification dispatch failed: code=notify_failed",
        notifyErr instanceof Error ? notifyErr.name : "unknown"
      );
    }

    return {
      success: true,
      reservationNumber: inserted.reservation_number,
      lookupToken: inserted.lookup_token,
    };
  } catch {
    return { success: false, error: "unexpected", message: "Something went wrong. Please try again." };
  }
}
