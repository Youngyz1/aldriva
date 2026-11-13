"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { checkTenantAccess } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCapabilitiesForBusiness } from "@/lib/business-taxonomy";
import { getBuiltStorefrontFeatures, resolveStorefrontFeatures } from "@/lib/storefront-features";
import { getV2TemplateForWebsite } from "@/lib/website-v2-theme";
import { DEFAULT_SITE_TIMEZONE, resolveWebsiteTimezone } from "@/lib/date-timezone";
import { normalizeContent } from "@/lib/website-content";
import { isValidPhoneNumber, normalizePhone } from "@/lib/order-phone";
import { getOrgApproval } from "@/lib/server-approval";
import { canTakeOrders } from "@/lib/business-approval";
import {
  extractReservationSettings,
  validateReservationSettings,
} from "@/lib/reservation-settings";
import {
  validateReservationInterval,
} from "@/lib/reservation-slots";
import {
  dispatchReservationNotifications,
  dispatchCustomerReservationStatusEmail,
  notifyOwnerReservationCancelled,
} from "@/lib/reservation-notifications";
import { RESERVATION_TRANSITION_GRAPH } from "@/lib/reservation-transitions";

export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "declined"
  | "seated"
  | "completed"
  | "no_show"
  | "cancelled";

export type DeclineReasonCode =
  | "fully_booked"
  | "closed_that_day"
  | "cannot_accommodate_party"
  | "other";

const DECLINE_REASONS: readonly DeclineReasonCode[] = [
  "fully_booked",
  "closed_that_day",
  "cannot_accommodate_party",
  "other",
] as const;

/** Neutral message: never reveals approval, feature, or settings state. */
const NOT_AVAILABLE_MESSAGE = "Reservations are not available yet.";

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

export type OrderSubmitClient = ReturnType<typeof createSupabaseAdmin>;

// ── Submit (public, no auth) ─────────────────────────────────────────────────

export interface SubmitReservationRequestInput {
  slug: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  partySize: number;
  startsAt: string;
  durationMinutes?: number | null;
  customerNote?: string | null;
  idempotencyKey?: string | null;
  hp?: string | null;
}

export type SubmitReservationResult =
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
        | "invalid_party_size"
        | "invalid_time"
        | "invalid_duration"
        | "fully_booked"
        | "too_many_open_requests"
        | "db_error"
        | "unexpected";
      message?: string;
    };

export async function submitReservationRequest(
  input: SubmitReservationRequestInput
): Promise<SubmitReservationResult> {
  const admin = createSupabaseAdmin();
  return submitReservationRequestWithClient(input, admin);
}

/**
 * Testable core with an injected client (mirrors submitOrderRequestWithClient).
 * Server-authoritative: re-checks approval, feature gate, settings, and slots.
 */
export async function submitReservationRequestWithClient(
  input: SubmitReservationRequestInput,
  admin: OrderSubmitClient
): Promise<SubmitReservationResult> {
  try {
    // 1. Honeypot
    if (input.hp && input.hp.trim().length > 0) {
      return { success: false, error: "invalid_submission" };
    }

    // 2. Rate limits (IP + normalized phone)
    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");
    const ip =
      headerList.get("x-real-ip") ||
      (forwarded ? forwarded.split(",")[0]?.trim() : null) ||
      "unknown";

    const ipLimit = await checkRateLimit("reservationRequestIp", `ip:${ip}`);
    if (!ipLimit.allowed) {
      return { success: false, error: "rate_limited", message: "Too many requests. Please wait a moment." };
    }

    const cleanPhone = normalizePhone(input.customerPhone || "");
    if (cleanPhone) {
      const phoneLimit = await checkRateLimit("reservationRequestPhone", `phone:${cleanPhone}`);
      if (!phoneLimit.allowed) {
        return { success: false, error: "rate_limited", message: "Too many requests from this phone number." };
      }
    }

    // 3. Field validation
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
    const partySize = Math.round(Number(input.partySize));
    if (!Number.isFinite(partySize) || partySize < 1 || partySize > 50) {
      return { success: false, error: "invalid_party_size", message: "Party size must be between 1 and 50." };
    }
    const customerNote = (input.customerNote || "").trim().slice(0, 300) || null;

    // 4. Website -> organizer (reject unpublished like other public surfaces)
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

    // 5. Business, capabilities, feature gate (re-checked at submit time)
    const { data: business } = await admin
      .from("businesses")
      .select("id, industry, category, business_type, offerings, seat_capacity, default_stay_minutes, max_stay_minutes, booking_model")
      .eq("organizer_id", organizerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const capabilities = getCapabilitiesForBusiness(
      (business as { industry?: string } | null)?.industry ?? "",
      (business as { category?: string } | null)?.category ?? "",
      (business as { business_type?: string } | null)?.business_type ?? ""
    );
    const v2Template = getV2TemplateForWebsite(website.metadata);
    const builtFeatures = v2Template
      ? getBuiltStorefrontFeatures(v2Template)
      : { ordering: false, delivery: false, pickup: false, reservations: false, onlinePayment: false };
    const features = resolveStorefrontFeatures({
      capabilities,
      offerings: Array.isArray((business as { offerings?: unknown } | null)?.offerings)
        ? ((business as { offerings: unknown[] }).offerings as string[])
        : [],
      built: builtFeatures,
    });
    if (!features.reservations) {
      return { success: false, error: "reservations_unavailable", message: NOT_AVAILABLE_MESSAGE };
    }

    // 6. Approval gate (neutral — never reveals business status)
    const orgApproval = await getOrgApproval(organizerId);
    if (!canTakeOrders(orgApproval)) {
      return { success: false, error: "reservations_unavailable", message: NOT_AVAILABLE_MESSAGE };
    }

    // 7. Reservation settings (explicit off => same neutral message)
    const settings = extractReservationSettings(website.metadata);
    if (!settings.enabled) {
      return { success: false, error: "reservations_unavailable", message: NOT_AVAILABLE_MESSAGE };
    }
    if (partySize > settings.max_party_size) {
      return {
        success: false,
        error: "invalid_party_size",
        message: `For parties over ${settings.max_party_size}, please call the restaurant directly.`,
      };
    }

    const timeZone = resolveWebsiteTimezone(website.metadata);

    // 8. Hours + duration + starts_at validation in the SITE timezone
    const defaultStay =
      (business as { default_stay_minutes?: number } | null)?.default_stay_minutes ??
      settings.default_stay_minutes ??
      90;
    const maxStay =
      (business as { max_stay_minutes?: number } | null)?.max_stay_minutes ??
      settings.max_stay_minutes ??
      120;
    const seatCapacity = (business as { seat_capacity?: number | null } | null)?.seat_capacity ?? null;

    const allowedStayMinutes =
      Array.isArray(settings.allowed_stay_minutes) && settings.allowed_stay_minutes.length > 0
        ? settings.allowed_stay_minutes
        : (defaultStay === maxStay ? [defaultStay] : [defaultStay, maxStay].sort((a, b) => a - b));

    let durationMinutes = defaultStay;
    if (!allowedStayMinutes.includes(durationMinutes)) {
      durationMinutes = allowedStayMinutes[0];
    }
    if (input.durationMinutes !== undefined && input.durationMinutes !== null) {
      const rawDur = Math.round(Number(input.durationMinutes));
      if (!Number.isFinite(rawDur) || !allowedStayMinutes.includes(rawDur)) {
        return {
          success: false,
          error: "invalid_duration",
          message: `Requested duration (${rawDur} minutes) is not an allowed stay duration for this venue.`,
        };
      }
      durationMinutes = rawDur;
    }

    const { data: contentRow } = await admin
      .from("website_content")
      .select("content")
      .eq("website_id", website.id)
      .maybeSingle();
    const contentDoc = normalizeContent((contentRow as { content?: unknown } | null)?.content ?? {});
    const timeCheck = validateReservationInterval(input.startsAt, durationMinutes, contentDoc.hours, settings, timeZone);
    if (!timeCheck.valid) {
      return { success: false, error: "invalid_time", message: timeCheck.message };
    }
    const startsAtIso = timeCheck.startsAt;
    const endsAtIso = new Date(new Date(startsAtIso).getTime() + durationMinutes * 60_000).toISOString();

    // 8b. Read-only availability check (advisory guard against seat_capacity)
    if (seatCapacity !== null && (business as { id?: string } | null)?.id) {
      const { data: activeRows } = await admin
        .from("reservations")
        .select("party_size")
        .eq("business_id", (business as { id: string }).id)
        .eq("booking_type", "table")
        .in("status", ["confirmed", "seated"])
        .lt("starts_at", endsAtIso)
        .gt("ends_at", startsAtIso);

      const activeCovers = (Array.isArray(activeRows) ? activeRows : []).reduce(
        (sum, r) => sum + Number((r as { party_size?: unknown }).party_size || 0),
        0
      );

      if (activeCovers + partySize > seatCapacity) {
        return {
          success: false,
          error: "fully_booked",
          message: "That time is fully booked. Please pick another time or call the restaurant.",
        };
      }
    }

    // 9. Idempotency: replay returns the existing tracking info, no new row.
    const idempotencyKey = (input.idempotencyKey || "").trim() || null;
    if (idempotencyKey) {
      const { data: existing, error: existingErr } = await admin
        .from("reservations")
        .select("reservation_number, lookup_token")
        .eq("organizer_id", organizerId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (!existingErr && existing) {
        return {
          success: true,
          reservationNumber: (existing as { reservation_number: string }).reservation_number,
          lookupToken: (existing as { lookup_token: string }).lookup_token,
        };
      }
      if (existingErr && isMissingTableError(existingErr)) {
        return { success: false, error: "reservations_unavailable", message: NOT_AVAILABLE_MESSAGE };
      }
    }

    // 10. Duplicate protection: same phone + same time, still open => same info.
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

    // 11. Open-request cap: 3 pending per phone per organizer.
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
        message: "You already have 3 open requests. Please wait for the restaurant to respond.",
      };
    }
    if (openErr && isMissingTableError(openErr)) {
      return { success: false, error: "reservations_unavailable", message: NOT_AVAILABLE_MESSAGE };
    }

    // 12. Numbers + token (collision-safe, like order numbers)
    const dateStamp = new Date().toISOString().slice(2, 10).replace(/-/g, "");
    let reservationNumber = `RES-${dateStamp}-${Math.floor(1000 + Math.random() * 9000)}`;
    const lookupToken = randomBytes(24).toString("hex");
    const nowIso = new Date().toISOString();
    const firstEvent = {
      status: "pending",
      at: nowIso,
      by_user_id: null,
      note: "Request received",
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
          booking_type: "table",
          reservation_number: reservationNumber,
          lookup_token: lookupToken,
          customer_name: customerName,
          customer_phone: cleanPhone,
          customer_email: customerEmail,
          party_size: partySize,
          starts_at: startsAtIso,
          duration_minutes: durationMinutes,
          ends_at: endsAtIso,
          status: "pending",
          payment_status: "unpaid",
          customer_note: customerNote,
          status_history: [firstEvent],
          idempotency_key: idempotencyKey,
          updated_at: nowIso,
        })
        .select("reservation_number, lookup_token")
        .maybeSingle();

      if (insertError) {
        if (isMissingTableError(insertError)) {
          return { success: false, error: "reservations_unavailable", message: NOT_AVAILABLE_MESSAGE };
        }
        if (insertError.code === "23505" && String(insertError.message).includes("reservation_number")) {
          reservationNumber = `RES-${dateStamp}-${Math.floor(1000 + Math.random() * 9000)}`;
          continue;
        }
        if (insertError.code === "23505" && String(insertError.message).includes("idempotency") && idempotencyKey) {
          const { data: raced } = await admin
            .from("reservations")
            .select("reservation_number, lookup_token")
            .eq("organizer_id", organizerId)
            .eq("idempotency_key", idempotencyKey)
            .maybeSingle();
          if (raced) {
            return {
              success: true,
              reservationNumber: (raced as { reservation_number: string }).reservation_number,
              lookupToken: (raced as { lookup_token: string }).lookup_token,
            };
          }
        }
        console.error("[submitReservationRequest] Insert failed: code=" + insertError.code);
        return { success: false, error: "db_error", message: "Could not send your request. Please try again." };
      }
      inserted = newRow as { reservation_number: string; lookup_token: string } | null;
    }

    if (!inserted) {
      return { success: false, error: "db_error", message: "Could not generate a reference number." };
    }

    // 13. Owner notification (non-blocking; never fails the request).
    await dispatchReservationNotifications({
      id: `${organizerId}:${inserted.reservation_number}`,
      organizer_id: organizerId,
      reservation_number: inserted.reservation_number,
      customer_name: customerName,
      customer_phone: cleanPhone,
      customer_email: customerEmail,
      party_size: partySize,
      starts_at: startsAtIso,
      duration_minutes: durationMinutes,
      ends_at: endsAtIso,
      siteTimezone: timeZone,
      customer_note: customerNote,
      website_slug: input.slug,
      lookup_token: inserted.lookup_token,
    });

    return {
      success: true,
      reservationNumber: inserted.reservation_number,
      lookupToken: inserted.lookup_token,
    };
  } catch (err) {
    console.error(
      "[submitReservationRequest] Caught unexpected error: code=unexpected",
      err instanceof Error ? err.name : "unknown"
    );
    return { success: false, error: "unexpected", message: "An unexpected error occurred. Please try again." };
  }
}

// ── Owner status update ──────────────────────────────────────────────────────

export interface UpdateReservationStatusInput {
  reservationId: string;
  organizerId: string;
  expectedCurrentStatus: ReservationStatus;
  nextStatus: ReservationStatus;
  ownerNote?: string | null;
  declineReason?: DeclineReasonCode | null;
  reason?: string | null;
}

export type UpdateReservationStatusResult =
  | { success: true; nextStatus: ReservationStatus; warning?: "possible_double_booking"; warningMessage?: string }
  | {
      success: false;
      error:
        | "unauthorized"
        | "forbidden"
        | "not_found"
        | "invalid_transition"
        | "already_updated"
        | "missing_decline_reason"
        | "capacity_exceeded"
        | "db_error"
        | "unexpected";
      message?: string;
      /** Populated when error === "capacity_exceeded" */
      seatCapacity?: number;
      currentCovers?: number;
      requestedPartySize?: number;
    };

export async function updateReservationStatus(
  input: UpdateReservationStatusInput
): Promise<UpdateReservationStatusResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "unauthorized", message: "You must be signed in." };
  }
  const access = await checkTenantAccess(user.id, input.organizerId, ["owner", "admin", "manager"]);
  if (!access.hasAccess) {
    return { success: false, error: "forbidden", message: "Only owners, admins, and managers can update reservations." };
  }
  const admin = createSupabaseAdmin();
  return updateReservationStatusWithClient(input, admin, user.id);
}

export async function updateReservationStatusWithClient(
  input: UpdateReservationStatusInput,
  admin: OrderSubmitClient,
  userId: string
): Promise<UpdateReservationStatusResult> {
  try {
    const { data: reservation, error: fetchErr } = await admin
      .from("reservations")
      .select(
        "id, reservation_number, customer_name, customer_email, party_size, starts_at, duration_minutes, ends_at, status, status_history, website_id, lookup_token, customer_phone"
      )
      .eq("id", input.reservationId)
      .eq("organizer_id", input.organizerId)
      .maybeSingle();

    if (fetchErr || !reservation) {
      return { success: false, error: "not_found", message: "Reservation not found." };
    }
    const row = reservation as {
      id: string;
      reservation_number: string;
      customer_name: string;
      customer_email: string | null;
      party_size: number;
      starts_at: string;
      duration_minutes?: number | null;
      ends_at?: string | null;
      status: string;
      status_history: unknown;
      website_id: string | null;
      lookup_token: string;
      customer_phone: string;
    };

    if (row.status !== input.expectedCurrentStatus) {
      return {
        success: false,
        error: "already_updated",
        message: "This request was already updated by another team member. Refresh to see the latest.",
      };
    }

    const allowed = RESERVATION_TRANSITION_GRAPH[input.expectedCurrentStatus] || [];
    if (!allowed.includes(input.nextStatus)) {
      return {
        success: false,
        error: "invalid_transition",
        message: `Cannot move a reservation from "${input.expectedCurrentStatus}" to "${input.nextStatus}".`,
      };
    }

    let finalReason: string | null = null;
    if (input.expectedCurrentStatus === "seated" && (input.nextStatus === "cancelled" || input.nextStatus === "no_show")) {
      const seatedReason = (input.reason || (input.declineReason && DECLINE_REASONS.includes(input.declineReason) ? input.declineReason : "") || "").trim();
      if (!seatedReason) {
        return {
          success: false,
          error: "missing_decline_reason",
          message: "A reason is required to cancel or mark a seated reservation as no-show.",
        };
      }
      finalReason = seatedReason.slice(0, 300);
    } else if ((input.nextStatus === "declined" || input.nextStatus === "cancelled") &&
        (!input.declineReason || !DECLINE_REASONS.includes(input.declineReason))) {
      return {
        success: false,
        error: "missing_decline_reason",
        message: "A reason is required to decline or cancel a request.",
      };
    } else if (input.declineReason) {
      finalReason = input.declineReason;
    }

    const ownerNote = (input.ownerNote || "").trim().slice(0, 300) || null;
    const nowIso = new Date().toISOString();
    const existingHistory = Array.isArray(row.status_history) ? (row.status_history as unknown[]) : [];
    const newEvent = {
      status: input.nextStatus,
      at: nowIso,
      by_user_id: userId,
      reason: finalReason,
      note: ownerNote,
    };

    let warning: "possible_double_booking" | undefined;
    let warningMessage: string | undefined;

    if (input.nextStatus === "confirmed") {
      let rpcRes: unknown = null;
      let rpcErr: { code?: string; message?: string } | null = null;

      try {
        if (typeof admin.rpc !== "function") {
          return { success: false, error: "db_error", message: "Failed to confirm reservation." };
        }
        const rpcCall = await admin.rpc(
          "confirm_reservation_with_capacity",
          {
            p_reservation_id: input.reservationId,
            p_expected_status: input.expectedCurrentStatus,
            p_actor: userId,
            p_owner_note: ownerNote,
          }
        );
        rpcRes = rpcCall.data;
        rpcErr = rpcCall.error;
      } catch {
        return { success: false, error: "db_error", message: "Failed to confirm reservation." };
      }

      if (rpcErr) {
        return { success: false, error: "db_error", message: "Failed to confirm reservation." };
      }

      const resObj = (rpcRes && typeof rpcRes === "object" ? rpcRes : {}) as {
        success?: boolean;
        error?: string;
        message?: string;
      };

      if (resObj.success === false) {
        if (resObj.error === "CAPACITY_EXCEEDED") {
          const taken = (resObj as { current_covers?: number }).current_covers ?? 0;
          const capacity = (resObj as { seat_capacity?: number }).seat_capacity ?? 0;
          const requested = (resObj as { requested_party_size?: number }).requested_party_size ?? 0;
          return {
            success: false,
            error: "capacity_exceeded",
            message: `Not enough seats for this time. ${taken} of ${capacity} seats are already confirmed, and this party needs ${requested}.`,
            seatCapacity: capacity,
            currentCovers: taken,
            requestedPartySize: requested,
          };
        }
        if (resObj.error === "ALREADY_UPDATED") {
          return {
            success: false,
            error: "already_updated",
            message: resObj.message || "This request was already updated by another team member.",
          };
        }
        if (resObj.error === "NOT_FOUND") {
          return {
            success: false,
            error: "not_found",
            message: resObj.message || "Reservation not found.",
          };
        }
        return {
          success: false,
          error: "db_error",
          message: resObj.message || "Failed to confirm reservation.",
        };
      }
    } else {
      const { data: updated, error: updateErr } = await admin
        .from("reservations")
        .update({
          status: input.nextStatus,
          owner_note: ownerNote,
          decline_reason: finalReason ?? (input.declineReason ?? null),
          status_history: [...existingHistory, newEvent],
          updated_at: nowIso,
        })
        .eq("id", input.reservationId)
        .eq("organizer_id", input.organizerId)
        .eq("status", input.expectedCurrentStatus)
        .select("id, status")
        .maybeSingle();

      if (updateErr || !updated) {
        if (updateErr) {
          return { success: false, error: "db_error", message: "Failed to update the reservation." };
        }
        return {
          success: false,
          error: "already_updated",
          message: "This request was already updated by another team member.",
        };
      }
    }

    try {
      revalidatePath(`/dashboard/org/${input.organizerId}/reservations`);
    } catch {
      // Non-fatal outside request context.
    }

    // Guest status email (confirmed / declined / cancelled only), non-blocking.
    // Sent only after the conditional update won, so each pair notifies once.
    if (
      row.customer_email &&
      (input.nextStatus === "confirmed" || input.nextStatus === "declined" || input.nextStatus === "cancelled")
    ) {
      (async () => {
        try {
          let slug = "";
          let timeZone = DEFAULT_SITE_TIMEZONE;
          if (row.website_id) {
            const { data: ws } = await admin
              .from("tenant_websites")
              .select("slug, metadata")
              .eq("id", row.website_id)
              .maybeSingle();
            if ((ws as { slug?: string } | null)?.slug) slug = (ws as { slug: string }).slug;
            timeZone = resolveWebsiteTimezone((ws as { metadata?: unknown } | null)?.metadata);
          }
          if (slug) {
            await dispatchCustomerReservationStatusEmail({
              reservationNumber: row.reservation_number,
              customerName: row.customer_name,
              customerEmail: row.customer_email as string,
              status: input.nextStatus,
              partySize: Number(row.party_size || 0),
              startsAt: row.starts_at,
              durationMinutes: row.duration_minutes ? Number(row.duration_minutes) : null,
              endsAt: row.ends_at ? String(row.ends_at) : null,
              siteTimezone: timeZone,
              lookupToken: row.lookup_token,
              websiteSlug: slug,
              ownerNote,
              declineReason: input.declineReason,
            });
          }
        } catch (notifyErr) {
          console.error("[updateReservationStatus] status email failed:", notifyErr instanceof Error ? notifyErr.name : "unknown");
        }
      })();
    }

    return {
      success: true,
      nextStatus: input.nextStatus,
      ...(warning ? { warning, warningMessage } : {}),
    };
  } catch (err) {
    console.error("[updateReservationStatus] Unexpected:", err instanceof Error ? err.stack || err.name : "unknown");
    return { success: false, error: "unexpected", message: "An unexpected error occurred." };
  }
}

// ── Guest cancel by token (public) ───────────────────────────────────────────

export interface CancelReservationByTokenInput {
  slug: string;
  lookupToken: string;
  expectedCurrentStatus: ReservationStatus;
}

export type CancelReservationByTokenResult =
  | { success: true; nextStatus: "cancelled" }
  | {
      success: false;
      error:
        | "rate_limited"
        | "not_found"
        | "invalid_status"
        | "already_updated"
        | "cancellation_window_closed"
        | "db_error"
        | "unexpected";
      message?: string;
    };

export async function cancelReservationByToken(
  input: CancelReservationByTokenInput
): Promise<CancelReservationByTokenResult> {
  const admin = createSupabaseAdmin();
  return cancelReservationByTokenWithClient(input, admin);
}

export async function cancelReservationByTokenWithClient(
  input: CancelReservationByTokenInput,
  admin: OrderSubmitClient
): Promise<CancelReservationByTokenResult> {
  try {
    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");
    const ip =
      headerList.get("x-real-ip") ||
      (forwarded ? forwarded.split(",")[0]?.trim() : null) ||
      "unknown";
    const cancelLimit = await checkRateLimit(
      "reservationCustomerCancel",
      `ip:${ip}:token:${input.lookupToken}`
    );
    if (!cancelLimit.allowed) {
      return { success: false, error: "rate_limited", message: "Too many requests. Please wait a moment." };
    }

    const { data: website } = await admin
      .from("tenant_websites")
      .select("tenant_id, slug, metadata")
      .eq("slug", input.slug)
      .maybeSingle();
    if (!website) return { success: false, error: "not_found", message: "Request not found." };

    const { data: reservation, error: fetchErr } = await admin
      .from("reservations")
      .select("id, reservation_number, customer_name, status, starts_at, status_history, organizer_id")
      .eq("lookup_token", input.lookupToken)
      .eq("organizer_id", (website as { tenant_id: string }).tenant_id)
      .maybeSingle();

    if (fetchErr || !reservation) {
      return { success: false, error: "not_found", message: "Request not found." };
    }
    const row = reservation as {
      id: string;
      reservation_number: string;
      customer_name: string;
      status: string;
      starts_at: string;
      status_history: unknown;
      organizer_id: string;
    };

    if (row.status !== "pending" && row.status !== "confirmed") {
      return { success: false, error: "invalid_status", message: "Only pending or confirmed requests can be cancelled." };
    }
    if (new Date(row.starts_at).getTime() <= Date.now()) {
      return { success: false, error: "invalid_status", message: "Past reservations cannot be cancelled." };
    }

    // Cancellation cutoff check
    const settings = extractReservationSettings((website as { metadata?: unknown }).metadata);
    if (settings.cancellation_cutoff_minutes !== null && settings.cancellation_cutoff_minutes !== undefined) {
      const cutoffMs = settings.cancellation_cutoff_minutes * 60 * 1000;
      const startsAtMs = new Date(row.starts_at).getTime();
      if (Date.now() > startsAtMs - cutoffMs) {
        return {
          success: false,
          error: "cancellation_window_closed",
          message: "Cancellation is closed. Please call the restaurant.",
        };
      }
    }

    const nowIso = new Date().toISOString();
    const existingHistory = Array.isArray(row.status_history) ? (row.status_history as unknown[]) : [];
    const { data: updated, error: updateErr } = await admin
      .from("reservations")
      .update({
        status: "cancelled",
        status_history: [
          ...existingHistory,
          { status: "cancelled", at: nowIso, by_user_id: null, reason: "cancelled_by_guest", note: "Cancelled by guest" },
        ],
        updated_at: nowIso,
      })
      .eq("id", row.id)
      .eq("status", input.expectedCurrentStatus)
      .select("id")
      .maybeSingle();

    if (updateErr) {
      return { success: false, error: "db_error", message: "Could not cancel your request. Please try again." };
    }
    if (!updated) {
      return {
        success: false,
        error: "already_updated",
        message: "This request was just updated. Please refresh the page.",
      };
    }

    try {
      revalidatePath(`/dashboard/org/${row.organizer_id}/reservations`);
    } catch {
      // Non-fatal.
    }

    (async () => {
      try {
        await notifyOwnerReservationCancelled({
          organizer_id: row.organizer_id,
          reservation_number: row.reservation_number,
          customer_name: row.customer_name,
        });
      } catch (notifyErr) {
        console.error("[cancelReservationByToken] owner notify failed:", notifyErr instanceof Error ? notifyErr.name : "unknown");
      }
    })();

    return { success: true, nextStatus: "cancelled" };
  } catch (err) {
    console.error("[cancelReservationByToken] Unexpected:", err instanceof Error ? err.name : "unknown");
    return { success: false, error: "unexpected", message: "An unexpected error occurred." };
  }
}

// ── Owner settings save ──────────────────────────────────────────────────────

export interface SaveReservationSettingsInput {
  organizerId: string;
  websiteId: string;
  businessId?: string | null;
  enabled: boolean;
  max_party_size: number;
  min_lead_minutes: number;
  max_days_ahead: number;
  slot_minutes: number;
  note?: string | null;
  seat_capacity?: number | null;
  default_stay_minutes?: number;
  max_stay_minutes?: number;
  allowed_stay_minutes?: number[];
  cancellation_cutoff_minutes?: number | null;
}

export type SaveReservationSettingsResult =
  | { success: true }
  | {
      success: false;
      error: "unauthorized" | "forbidden" | "not_found" | "no_website" | "validation_error" | "db_error" | "unexpected";
      message?: string;
    };

export async function saveReservationSettings(
  input: SaveReservationSettingsInput
): Promise<SaveReservationSettingsResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "unauthorized", message: "You must be signed in." };
  }
  const access = await checkTenantAccess(user.id, input.organizerId, ["owner", "admin", "manager"]);
  if (!access.hasAccess) {
    return { success: false, error: "forbidden", message: "Only owners, admins, and managers can update reservation settings." };
  }
  const admin = createSupabaseAdmin();
  return saveReservationSettingsWithClient(input, admin);
}

export async function saveReservationSettingsWithClient(
  input: SaveReservationSettingsInput,
  admin: OrderSubmitClient
): Promise<SaveReservationSettingsResult> {
  try {
    // Scoped by tenant_id — the canonical tenant column (never organizer_id).
    const { data: website, error: fetchErr } = await admin
      .from("tenant_websites")
      .select("id, tenant_id, metadata")
      .eq("id", input.websiteId)
      .eq("tenant_id", input.organizerId)
      .maybeSingle();

    if (fetchErr) {
      return { success: false, error: "db_error", message: "Failed to load website. Please try again." };
    }
    if (!website) {
      return { success: false, error: "no_website", message: "Create your website first to configure reservations." };
    }

    const valResult = validateReservationSettings({
      enabled: input.enabled,
      max_party_size: input.max_party_size,
      min_lead_minutes: input.min_lead_minutes,
      max_days_ahead: input.max_days_ahead,
      slot_minutes: input.slot_minutes,
      note: input.note,
      seat_capacity: input.seat_capacity,
      default_stay_minutes: input.default_stay_minutes,
      max_stay_minutes: input.max_stay_minutes,
      allowed_stay_minutes: input.allowed_stay_minutes,
      cancellation_cutoff_minutes: input.cancellation_cutoff_minutes,
    });
    if (!valResult.valid) {
      return { success: false, error: "validation_error", message: valResult.error };
    }

    const currentMeta =
      (website as { metadata?: unknown }).metadata &&
      typeof (website as { metadata: unknown }).metadata === "object" &&
      !Array.isArray((website as { metadata: unknown }).metadata)
        ? ((website as { metadata: Record<string, unknown> }).metadata as Record<string, unknown>)
        : {};
    const currentStorefront =
      currentMeta.storefront && typeof currentMeta.storefront === "object" && !Array.isArray(currentMeta.storefront)
        ? (currentMeta.storefront as Record<string, unknown>)
        : {};

    const mergedMetadata: Record<string, unknown> = {
      ...currentMeta,
      storefront: {
        ...currentStorefront,
        reservations: { ...valResult.settings },
      },
    };

    const { error: updateErr } = await admin
      .from("tenant_websites")
      .update({ metadata: mergedMetadata })
      .eq("id", input.websiteId)
      .eq("tenant_id", input.organizerId);

    if (updateErr) {
      return { success: false, error: "db_error", message: "Failed to save reservation settings." };
    }

    // Also update businesses capacity & stay duration columns if present
    const bizUpdate: Record<string, unknown> = {};
    if (valResult.settings.seat_capacity !== undefined) {
      bizUpdate.seat_capacity = valResult.settings.seat_capacity;
    }
    if (valResult.settings.default_stay_minutes !== undefined) {
      bizUpdate.default_stay_minutes = valResult.settings.default_stay_minutes;
    }
    if (valResult.settings.max_stay_minutes !== undefined) {
      bizUpdate.max_stay_minutes = valResult.settings.max_stay_minutes;
    }
    if (Object.keys(bizUpdate).length > 0) {
      try {
        let bizQuery = admin.from("businesses").update(bizUpdate);
        if (input.businessId) {
          bizQuery = bizQuery.eq("id", input.businessId);
        } else {
          bizQuery = bizQuery.eq("organizer_id", input.organizerId);
        }
        await bizQuery;
      } catch {
        // Tolerates unapplied migration 204 column updates
      }
    }

    try {
      revalidatePath(`/dashboard/org/${input.organizerId}/reservations`);
    } catch {
      // Non-fatal.
    }

    return { success: true };
  } catch {
    return { success: false, error: "unexpected", message: "An unexpected error occurred." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Notes (Staff-only, Migration 205)
// ─────────────────────────────────────────────────────────────────────────────

export interface UpdateReservationInternalNoteInput {
  reservationId: string;
  organizerId: string;
  internalNote: string | null;
}

export type UpdateReservationInternalNoteResult =
  | { success: true; internalNote: string | null }
  | {
      success: false;
      error: "unauthorized" | "forbidden" | "not_found" | "invalid_input" | "db_error";
      message?: string;
    };

/**
 * Staff-only operational note editor (Phase 7 Stage C2).
 * Strictly gated to tenant manage roles (owner, admin, manager).
 * Note is stored directly in reservations.internal_note; NEVER recorded in
 * status_history and NEVER selected or returned to guest-facing surfaces.
 */
export async function updateReservationInternalNote(
  input: UpdateReservationInternalNoteInput
): Promise<UpdateReservationInternalNoteResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "unauthorized", message: "You must be signed in." };
  }
  const access = await checkTenantAccess(user.id, input.organizerId, ["owner", "admin", "manager"]);
  if (!access.hasAccess) {
    return {
      success: false,
      error: "forbidden",
      message: "Only owners, admins, and managers can update internal notes.",
    };
  }
  const admin = createSupabaseAdmin();
  return updateReservationInternalNoteWithClient(input, admin);
}

export async function updateReservationInternalNoteWithClient(
  input: UpdateReservationInternalNoteInput,
  admin: OrderSubmitClient
): Promise<UpdateReservationInternalNoteResult> {
  try {
    if (!input.reservationId || !input.organizerId) {
      return { success: false, error: "invalid_input", message: "Missing reservation or organizer ID." };
    }
    if (typeof input.internalNote === "string" && input.internalNote.length > 1000) {
      return {
        success: false,
        error: "invalid_input",
        message: "Internal note cannot exceed 1000 characters.",
      };
    }

    const cleanNote = typeof input.internalNote === "string" ? input.internalNote.trim() || null : null;
    const nowIso = new Date().toISOString();

    const { data: updated, error: updateErr } = await admin
      .from("reservations")
      .update({
        internal_note: cleanNote,
        updated_at: nowIso,
      })
      .eq("id", input.reservationId)
      .eq("organizer_id", input.organizerId)
      .select("id, internal_note")
      .maybeSingle();

    if (updateErr) {
      return { success: false, error: "db_error", message: "Failed to update internal note." };
    }
    if (!updated) {
      return { success: false, error: "not_found", message: "Reservation not found." };
    }

    try {
      revalidatePath(`/dashboard/org/${input.organizerId}/reservations`);
    } catch {
      // Non-fatal outside Next.js request context.
    }

    return {
      success: true,
      internalNote: (updated as { internal_note?: string | null }).internal_note ?? null,
    };
  } catch {
    return { success: false, error: "db_error", message: "Failed to update internal note." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Change Requests (Stage D, Migration 206)
// ─────────────────────────────────────────────────────────────────────────────

export interface SubmitChangeRequestInput {
  slug: string;
  lookupToken: string;
  requestedStartsAt?: string | null;
  requestedPartySize?: number | null;
  requestedDurationMinutes?: number | null;
  guestNote?: string | null;
}

export type SubmitChangeRequestResult =
  | { success: true; requestId: string }
  | {
      success: false;
      error:
        | "rate_limited"
        | "not_found"
        | "invalid_status"
        | "has_open_request"
        | "invalid_input"
        | "outside_opening_hours"
        | "db_error"
        | "unexpected";
      message?: string;
    };

export async function submitChangeRequest(
  input: SubmitChangeRequestInput
): Promise<SubmitChangeRequestResult> {
  const admin = createSupabaseAdmin();
  return submitChangeRequestWithClient(input, admin);
}

export async function submitChangeRequestWithClient(
  input: SubmitChangeRequestInput,
  admin: OrderSubmitClient
): Promise<SubmitChangeRequestResult> {
  try {
    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");
    const ip =
      headerList.get("x-real-ip") ||
      (forwarded ? forwarded.split(",")[0]?.trim() : null) ||
      "unknown";

    const changeLimit = await checkRateLimit(
      "reservationChangeRequest",
      `ip:${ip}:token:${input.lookupToken}`
    );
    if (!changeLimit.allowed) {
      return { success: false, error: "rate_limited", message: "Too many requests. Please wait a moment." };
    }

    const { data: website } = await admin
      .from("tenant_websites")
      .select("id, tenant_id, slug, metadata")
      .eq("slug", input.slug)
      .maybeSingle();

    if (!website) {
      return { success: false, error: "not_found", message: "Request not found." };
    }

    const organizerId = (website as { tenant_id: string }).tenant_id;
    const settings = extractReservationSettings((website as { metadata?: unknown }).metadata);

    const { data: reservation, error: fetchErr } = await admin
      .from("reservations")
      .select("id, status, starts_at, party_size, duration_minutes, organizer_id")
      .eq("lookup_token", input.lookupToken)
      .eq("organizer_id", organizerId)
      .maybeSingle();

    if (fetchErr || !reservation) {
      return { success: false, error: "not_found", message: "Request not found." };
    }

    const row = reservation as {
      id: string;
      status: string;
      starts_at: string;
      party_size: number;
      duration_minutes?: number | null;
      organizer_id: string;
    };

    if (row.status !== "pending" && row.status !== "confirmed") {
      return {
        success: false,
        error: "invalid_status",
        message: "Only pending or confirmed requests can be modified.",
      };
    }

    // Check at least one change is provided
    const reqStartsAt = input.requestedStartsAt ? input.requestedStartsAt.trim() : null;
    const reqPartySize =
      input.requestedPartySize !== null && input.requestedPartySize !== undefined
        ? Math.round(Number(input.requestedPartySize))
        : null;
    const reqDuration =
      input.requestedDurationMinutes !== null && input.requestedDurationMinutes !== undefined
        ? Math.round(Number(input.requestedDurationMinutes))
        : null;
    const cleanGuestNote =
      typeof input.guestNote === "string" ? input.guestNote.trim().slice(0, 300) || null : null;

    if (!reqStartsAt && reqPartySize === null && reqDuration === null) {
      return {
        success: false,
        error: "invalid_input",
        message: "Please specify at least one change (time, party size, or duration).",
      };
    }

    // Validate party size if provided
    if (reqPartySize !== null) {
      if (reqPartySize < 1 || reqPartySize > settings.max_party_size || reqPartySize > 50) {
        return {
          success: false,
          error: "invalid_input",
          message: `Party size must be between 1 and ${settings.max_party_size}.`,
        };
      }
    }

    // Validate duration if provided
    if (reqDuration !== null) {
      const allowed = settings.allowed_stay_minutes ?? [settings.default_stay_minutes ?? 90];
      if (!allowed.includes(reqDuration)) {
        return {
          success: false,
          error: "invalid_input",
          message: "Requested duration is not available.",
        };
      }
    }

    // Validate starts_at interval if provided
    if (reqStartsAt) {
      const targetDuration = reqDuration ?? row.duration_minutes ?? settings.default_stay_minutes ?? 90;
      const { data: contentRow } = await admin
        .from("website_content")
        .select("content")
        .eq("website_id", (website as { id?: string }).id ?? "")
        .maybeSingle();

      const contentDoc = normalizeContent(contentRow ? (contentRow as { content: unknown }).content : null);
      const siteTimezone = resolveWebsiteTimezone((website as { metadata?: unknown }).metadata);
      const intervalCheck = validateReservationInterval(
        reqStartsAt,
        targetDuration,
        contentDoc.hours,
        settings,
        siteTimezone
      );
      if (!intervalCheck.valid) {
        return {
          success: false,
          error: "outside_opening_hours",
          message: intervalCheck.error === "outside_opening_hours"
            ? "The requested time is outside opening hours."
            : "The requested time is invalid or too soon.",
        };
      }
    }

    // Check for open request
    const { data: existingPending } = await admin
      .from("reservation_change_requests")
      .select("id")
      .eq("reservation_id", row.id)
      .eq("status", "pending")
      .maybeSingle();

    if (existingPending) {
      return {
        success: false,
        error: "has_open_request",
        message: "You already have a change request pending review.",
      };
    }

    const { data: inserted, error: insertErr } = await admin
      .from("reservation_change_requests")
      .insert({
        reservation_id: row.id,
        organizer_id: organizerId,
        requested_starts_at: reqStartsAt,
        requested_party_size: reqPartySize,
        requested_duration_minutes: reqDuration,
        guest_note: cleanGuestNote,
        status: "pending",
      })
      .select("id")
      .maybeSingle();

    if (insertErr || !inserted) {
      console.error("[submitChangeRequest] insert_error", insertErr ? { code: insertErr.code, message: insertErr.message, details: insertErr.details, hint: insertErr.hint } : "no row returned");
      return { success: false, error: "db_error", message: "Could not submit change request." };
    }

    return {
      success: true,
      requestId: (inserted as { id: string }).id,
    };
  } catch (err) {
    console.error("[submitChangeRequest] unexpected", err);
    console.error("[submitChangeRequest] Unexpected:", err instanceof Error ? err.name : "unknown");
    return { success: false, error: "unexpected", message: "An unexpected error occurred." };
  }
}

export interface WithdrawChangeRequestInput {
  slug: string;
  lookupToken: string;
  requestId: string;
}

export type WithdrawChangeRequestResult =
  | { success: true }
  | {
      success: false;
      error: "not_found" | "already_decided" | "db_error" | "unexpected";
      message?: string;
    };

export async function withdrawChangeRequest(
  input: WithdrawChangeRequestInput
): Promise<WithdrawChangeRequestResult> {
  const admin = createSupabaseAdmin();
  return withdrawChangeRequestWithClient(input, admin);
}

export async function withdrawChangeRequestWithClient(
  input: WithdrawChangeRequestInput,
  admin: OrderSubmitClient
): Promise<WithdrawChangeRequestResult> {
  try {
    const { data: website } = await admin
      .from("tenant_websites")
      .select("tenant_id")
      .eq("slug", input.slug)
      .maybeSingle();

    if (!website) return { success: false, error: "not_found", message: "Not found." };

    const { data: reservation } = await admin
      .from("reservations")
      .select("id")
      .eq("lookup_token", input.lookupToken)
      .eq("organizer_id", (website as { tenant_id: string }).tenant_id)
      .maybeSingle();

    if (!reservation) return { success: false, error: "not_found", message: "Not found." };

    const nowIso = new Date().toISOString();
    const { data: updated, error: updateErr } = await admin
      .from("reservation_change_requests")
      .update({
        status: "withdrawn",
        updated_at: nowIso,
      })
      .eq("id", input.requestId)
      .eq("reservation_id", (reservation as { id: string }).id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (updateErr) {
      return { success: false, error: "db_error", message: "Could not withdraw change request." };
    }
    if (!updated) {
      return {
        success: false,
        error: "already_decided",
        message: "This request has already been reviewed or withdrawn.",
      };
    }

    return { success: true };
  } catch (err) {
    console.error("[withdrawChangeRequest] Unexpected:", err instanceof Error ? err.name : "unknown");
    return { success: false, error: "unexpected", message: "An unexpected error occurred." };
  }
}

export interface ApproveChangeRequestInput {
  requestId: string;
  organizerId: string;
  decisionNote?: string | null;
}

export type ApproveChangeRequestResult =
  | { success: true }
  | {
      success: false;
      error:
        | "unauthorized"
        | "forbidden"
        | "not_found"
        | "already_decided"
        | "capacity_exceeded"
        | "db_error"
        | "unexpected";
      message?: string;
    };

export async function approveChangeRequest(
  input: ApproveChangeRequestInput
): Promise<ApproveChangeRequestResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "unauthorized", message: "You must be signed in." };
  }
  const access = await checkTenantAccess(user.id, input.organizerId, ["owner", "admin", "manager"]);
  if (!access.hasAccess) {
    return {
      success: false,
      error: "forbidden",
      message: "Only owners, admins, and managers can approve change requests.",
    };
  }
  const admin = createSupabaseAdmin();
  return approveChangeRequestWithClient(input, admin, user.id);
}

export async function approveChangeRequestWithClient(
  input: ApproveChangeRequestInput,
  admin: OrderSubmitClient,
  actorId: string
): Promise<ApproveChangeRequestResult> {
  try {
    const cleanDecisionNote =
      typeof input.decisionNote === "string" ? input.decisionNote.trim().slice(0, 300) || null : null;

    const rpcRes = await admin.rpc("approve_reservation_change_with_capacity", {
      p_request_id:    input.requestId,
      p_organizer_id:  input.organizerId,
      p_actor:         actorId,
      p_decision_note: cleanDecisionNote,
    });

    if (rpcRes.error) {
      return { success: false, error: "db_error", message: "Failed to approve change request." };
    }

    const payload = rpcRes.data as {
      success: boolean;
      error?: string;
      current_covers?: number;
      seat_capacity?: number;
      requested_party_size?: number;
    } | null;

    if (!payload) {
      return { success: false, error: "db_error", message: "Empty response from server." };
    }

    if (!payload.success) {
      if (payload.error === "CAPACITY_EXCEEDED") {
        return {
          success: false,
          error: "capacity_exceeded",
          message: `Not enough seats for this time. ${payload.current_covers ?? 0} of ${payload.seat_capacity ?? 0} seats are already confirmed, and this party needs ${payload.requested_party_size ?? 0}.`,
        };
      }
      if (payload.error === "REQUEST_NOT_PENDING") {
        return {
          success: false,
          error: "already_decided",
          message: "This request was already decided by another team member. Refresh to see the latest.",
        };
      }
      if (payload.error === "NOT_FOUND" || payload.error === "RESERVATION_NOT_CHANGEABLE") {
        return {
          success: false,
          error: "not_found",
          message: "Reservation or change request not found or cannot be modified.",
        };
      }
      return {
        success: false,
        error: "db_error",
        message: payload.error || "Failed to approve change request.",
      };
    }

    try {
      revalidatePath(`/dashboard/org/${input.organizerId}/reservations`);
    } catch {
      // Non-fatal
    }

    return { success: true };
  } catch (err) {
    console.error("[approveChangeRequest] Unexpected:", err instanceof Error ? err.name : "unknown");
    return { success: false, error: "unexpected", message: "An unexpected error occurred." };
  }
}

export interface DeclineChangeRequestInput {
  requestId: string;
  organizerId: string;
  decisionNote?: string | null;
}

export type DeclineChangeRequestResult =
  | { success: true }
  | {
      success: false;
      error: "unauthorized" | "forbidden" | "not_found" | "already_decided" | "db_error" | "unexpected";
      message?: string;
    };

export async function declineChangeRequest(
  input: DeclineChangeRequestInput
): Promise<DeclineChangeRequestResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "unauthorized", message: "You must be signed in." };
  }
  const access = await checkTenantAccess(user.id, input.organizerId, ["owner", "admin", "manager"]);
  if (!access.hasAccess) {
    return {
      success: false,
      error: "forbidden",
      message: "Only owners, admins, and managers can decline change requests.",
    };
  }
  const admin = createSupabaseAdmin();
  return declineChangeRequestWithClient(input, admin, user.id);
}

export async function declineChangeRequestWithClient(
  input: DeclineChangeRequestInput,
  admin: OrderSubmitClient,
  actorId: string
): Promise<DeclineChangeRequestResult> {
  try {
    const cleanDecisionNote =
      typeof input.decisionNote === "string" ? input.decisionNote.trim().slice(0, 300) || null : null;

    const nowIso = new Date().toISOString();
    const { data: updated, error: updateErr } = await admin
      .from("reservation_change_requests")
      .update({
        status: "declined",
        decided_by: actorId,
        decided_at: nowIso,
        decision_note: cleanDecisionNote,
        updated_at: nowIso,
      })
      .eq("id", input.requestId)
      .eq("organizer_id", input.organizerId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (updateErr) {
      return { success: false, error: "db_error", message: "Failed to decline change request." };
    }
    if (!updated) {
      return {
        success: false,
        error: "already_decided",
        message: "This request was already decided by another team member. Refresh to see the latest.",
      };
    }

    try {
      revalidatePath(`/dashboard/org/${input.organizerId}/reservations`);
    } catch {
      // Non-fatal
    }

    return { success: true };
  } catch (err) {
    console.error("[declineChangeRequest] Unexpected:", err instanceof Error ? err.name : "unknown");
    return { success: false, error: "unexpected", message: "An unexpected error occurred." };
  }
}

