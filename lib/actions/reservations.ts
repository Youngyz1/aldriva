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
import { normalizeContent } from "@/lib/website-content";
import { isValidPhoneNumber, normalizePhone } from "@/lib/order-phone";
import { getOrgApproval } from "@/lib/server-approval";
import { canTakeOrders } from "@/lib/business-approval";
import {
  extractReservationSettings,
  validateReservationSettings,
} from "@/lib/reservation-settings";
import { validateReservationStartsAt } from "@/lib/reservation-slots";
import {
  dispatchReservationNotifications,
  dispatchCustomerReservationStatusEmail,
  notifyOwnerReservationCancelled,
} from "@/lib/reservation-notifications";

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

const RESERVATION_TRANSITION_GRAPH: Record<ReservationStatus, ReservationStatus[]> = {
  pending: ["confirmed", "declined", "cancelled"],
  confirmed: ["seated", "no_show", "cancelled", "completed"],
  seated: ["completed"],
  declined: [],
  completed: [],
  no_show: [],
  cancelled: [],
};

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
      .select("id, industry, category, business_type, offerings")
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

    const metadata =
      website.metadata && typeof website.metadata === "object"
        ? (website.metadata as Record<string, unknown>)
        : {};
    const timeZone = typeof metadata.timezone === "string" && metadata.timezone.trim()
      ? (metadata.timezone as string).trim()
      : "Africa/Abidjan";

    // 8. Hours + starts_at validation in the SITE timezone
    const { data: contentRow } = await admin
      .from("website_content")
      .select("content")
      .eq("website_id", website.id)
      .maybeSingle();
    const contentDoc = normalizeContent((contentRow as { content?: unknown } | null)?.content ?? {});
    const timeCheck = validateReservationStartsAt(input.startsAt, contentDoc.hours, settings, timeZone);
    if (!timeCheck.valid) {
      return { success: false, error: "invalid_time", message: timeCheck.message };
    }
    const startsAtIso = timeCheck.startsAt;

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
          status: "pending",
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
        | "db_error"
        | "unexpected";
      message?: string;
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
        "id, reservation_number, customer_name, customer_email, party_size, starts_at, status, status_history, website_id, lookup_token, customer_phone"
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
      status: string;
      status_history: unknown;
      website_id: string | null;
      lookup_token: string;
      customer_phone: string;
    };

    const allowed = RESERVATION_TRANSITION_GRAPH[input.expectedCurrentStatus] || [];
    if (!allowed.includes(input.nextStatus)) {
      return {
        success: false,
        error: "invalid_transition",
        message: `Cannot move a reservation from "${input.expectedCurrentStatus}" to "${input.nextStatus}".`,
      };
    }

    if ((input.nextStatus === "declined" || input.nextStatus === "cancelled") &&
        (!input.declineReason || !DECLINE_REASONS.includes(input.declineReason))) {
      return {
        success: false,
        error: "missing_decline_reason",
        message: "A reason is required to decline or cancel a request.",
      };
    }

    const ownerNote = (input.ownerNote || "").trim().slice(0, 300) || null;
    const nowIso = new Date().toISOString();
    const existingHistory = Array.isArray(row.status_history) ? (row.status_history as unknown[]) : [];
    const newEvent = {
      status: input.nextStatus,
      at: nowIso,
      by_user_id: userId,
      reason: input.declineReason ?? null,
      note: ownerNote,
    };

    const { data: updated, error: updateErr } = await admin
      .from("reservations")
      .update({
        status: input.nextStatus,
        owner_note: ownerNote,
        decline_reason: input.declineReason ?? null,
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

    // Double-booking awareness (hint only, never blocks): on confirm, look for
    // other confirmed reservations within 90 minutes whose combined party
    // exceeds twice the configured max party size.
    let warning: "possible_double_booking" | undefined;
    let warningMessage: string | undefined;
    if (input.nextStatus === "confirmed") {
      try {
        let maxParty = 12;
        if (row.website_id) {
          const { data: ws } = await admin
            .from("tenant_websites")
            .select("metadata")
            .eq("id", row.website_id)
            .maybeSingle();
          const meta = (ws as { metadata?: unknown } | null)?.metadata;
          const { extractReservationSettings: extract } = await import("@/lib/reservation-settings");
          maxParty = extract(meta).max_party_size;
        }
        const targetMs = new Date(row.starts_at).getTime();
        if (!isNaN(targetMs)) {
          const windowStart = new Date(targetMs - 90 * 60_000).toISOString();
          const windowEnd = new Date(targetMs + 90 * 60_000).toISOString();
          const { data: nearby } = await admin
            .from("reservations")
            .select("party_size")
            .eq("organizer_id", input.organizerId)
            .eq("status", "confirmed")
            .gte("starts_at", windowStart)
            .lte("starts_at", windowEnd);
          const combined = (Array.isArray(nearby) ? nearby : []).reduce(
            (sum, r) => sum + Number((r as { party_size?: unknown }).party_size || 0),
            Number(row.party_size || 0)
          );
          if (combined > maxParty * 2) {
            warning = "possible_double_booking";
            warningMessage = `Heads up: confirmed parties within 90 minutes total ${combined} guests (guideline: ${maxParty * 2}). This is a hint only — the request is confirmed.`;
          }
        }
      } catch {
        // Heuristic must never block or fail the confirm.
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
          let timeZone = "Africa/Abidjan";
          if (row.website_id) {
            const { data: ws } = await admin
              .from("tenant_websites")
              .select("slug, metadata")
              .eq("id", row.website_id)
              .maybeSingle();
            if ((ws as { slug?: string } | null)?.slug) slug = (ws as { slug: string }).slug;
            const meta =
              (ws as { metadata?: unknown } | null)?.metadata &&
              typeof (ws as { metadata: unknown }).metadata === "object"
                ? ((ws as { metadata: Record<string, unknown> }).metadata as Record<string, unknown>)
                : {};
            if (typeof meta.timezone === "string") timeZone = meta.timezone;
          }
          if (slug) {
            await dispatchCustomerReservationStatusEmail({
              reservationNumber: row.reservation_number,
              customerName: row.customer_name,
              customerEmail: row.customer_email as string,
              status: input.nextStatus,
              partySize: Number(row.party_size || 0),
              startsAt: row.starts_at,
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
    console.error("[updateReservationStatus] Unexpected:", err instanceof Error ? err.name : "unknown");
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
      error: "rate_limited" | "not_found" | "invalid_status" | "already_updated" | "db_error" | "unexpected";
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
      .select("tenant_id, slug")
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

    const nowIso = new Date().toISOString();
    const existingHistory = Array.isArray(row.status_history) ? (row.status_history as unknown[]) : [];
    const { data: updated, error: updateErr } = await admin
      .from("reservations")
      .update({
        status: "cancelled",
        status_history: [
          ...existingHistory,
          { status: "cancelled", at: nowIso, by_user_id: null, note: "Cancelled by guest" },
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
  enabled: boolean;
  max_party_size: number;
  min_lead_minutes: number;
  max_days_ahead: number;
  slot_minutes: number;
  note?: string | null;
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
