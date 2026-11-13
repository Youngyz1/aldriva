/**
 * app/dashboard/org/[id]/reservations/page.tsx
 *
 * Owner table-request visibility and operations (Phase 7, request-based).
 * Allowed roles: owner, admin, manager, editor, finance (read).
 * Action buttons gated to canManage: owner, admin, manager.
 *
 * Resilient against unapplied migration 176: the list shows a neutral
 * "setup is updating" state while settings remain editable (metadata only).
 */

import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { checkTenantAccess, type EntityRole } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getTranslations } from "next-intl/server";
import { ReservationsClient } from "@/components/dashboard/reservations/ReservationsClient";
import type { DashboardReservationRow } from "@/components/dashboard/reservations/ReservationCard";
import { extractReservationSettings } from "@/lib/reservation-settings";
import { resolveWebsiteTimezone } from "@/lib/date-timezone";
import { isGeneralBookingsLive } from "@/lib/storefront-features";
import { getCapabilitiesForBusiness } from "@/lib/business-taxonomy";

const ALLOWED_ROLES = ["owner", "admin", "manager", "editor", "finance"] as const;
const MANAGE_ROLES: EntityRole[] = ["owner", "admin", "manager"];

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

export default async function ReservationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: organizerId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const access = await checkTenantAccess(user.id, organizerId, [...ALLOWED_ROLES]);
  if (!access.hasAccess) {
    return notFound();
  }

  const canManage = access.role ? MANAGE_ROLES.includes(access.role) : false;
  const admin = createSupabaseAdmin();
  const t = await getTranslations("Reservations");

  // 1. Reservations list (200-row cap, newest first). Missing migration 176
  // surfaces as a neutral state, never a crash.
  let reservations: DashboardReservationRow[] = [];
  let reservationsAvailable = true;
  const { data: rows, error: rowsError } = await admin
    .from("reservations")
    .select(
      "id, reservation_number, customer_name, customer_phone, customer_email, party_size, starts_at, duration_minutes, ends_at, status, payment_status, deposit_amount, deposit_currency, customer_note, owner_note, internal_note, decline_reason, status_history, created_at"
    )
    .eq("organizer_id", organizerId)
    .eq("booking_type", "table")
    .order("created_at", { ascending: false })
    .limit(200);

  if (rowsError) {
    if (isMissingTableError(rowsError)) {
      reservationsAvailable = false;
    } else {
      console.error("[reservations-page] fetch error:", rowsError.code);
    }
  } else if (rows) {
    reservations = rows as unknown as DashboardReservationRow[];

    // Fetch pending change requests for these reservations
    try {
      const reservationIds = reservations.map((r) => r.id);
      if (reservationIds.length > 0) {
        const { data: changeRequests } = await admin
          .from("reservation_change_requests")
          .select("id, reservation_id, requested_starts_at, requested_party_size, requested_duration_minutes, guest_note, status, decision_note, created_at")
          .in("reservation_id", reservationIds)
          .eq("status", "pending");

        if (changeRequests && changeRequests.length > 0) {
          const map = new Map<string, DashboardReservationRow["change_request"]>();
          for (const cr of changeRequests as Array<{
            id: string;
            reservation_id: string;
            requested_starts_at: string | null;
            requested_party_size: number | null;
            requested_duration_minutes: number | null;
            guest_note: string | null;
            status: string;
            decision_note: string | null;
            created_at: string;
          }>) {
            map.set(cr.reservation_id, {
              id: cr.id,
              requested_starts_at: cr.requested_starts_at,
              requested_party_size: cr.requested_party_size,
              requested_duration_minutes: cr.requested_duration_minutes,
              guest_note: cr.guest_note,
              status: cr.status,
              decision_note: cr.decision_note,
              created_at: cr.created_at,
            });
          }

          reservations = reservations.map((r) => ({
            ...r,
            change_request: map.get(r.id) ?? null,
          }));
        }
      }
    } catch {
      // Graceful fallback if migration 206 table is not yet present
    }
  }

  // 2. Website metadata (settings + timezone) and business offerings.
  const [websiteRes, businessRes] = await Promise.all([
    admin
      .from("tenant_websites")
      .select("id, slug, metadata")
      .eq("tenant_id", organizerId)
      .maybeSingle(),
    admin
      .from("businesses")
      .select("id, offerings, country, industry, category, business_type, seat_capacity, default_stay_minutes, max_stay_minutes, booking_model")
      .eq("organizer_id", organizerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const websiteRow = websiteRes.data as { id?: string; metadata?: unknown } | null;
  const businessRow = businessRes.data as {
    id?: string;
    offerings?: unknown;
    country?: unknown;
    industry?: string | null;
    category?: string | null;
    business_type?: string | null;
    seat_capacity?: number | null;
    default_stay_minutes?: number;
    max_stay_minutes?: number;
    booking_model?: string;
  } | null;
  const websiteId = websiteRow?.id ?? null;
  const baseSettings = extractReservationSettings(websiteRow?.metadata);
  const defaultStay = businessRow?.default_stay_minutes !== undefined ? businessRow.default_stay_minutes : (baseSettings.default_stay_minutes ?? 90);
  const maxStay = businessRow?.max_stay_minutes !== undefined ? businessRow.max_stay_minutes : (baseSettings.max_stay_minutes ?? 120);
  const allowedStays = Array.isArray(baseSettings.allowed_stay_minutes) && baseSettings.allowed_stay_minutes.length > 0
    ? [...baseSettings.allowed_stay_minutes]
    : (defaultStay === maxStay ? [defaultStay] : [defaultStay, maxStay].sort((a, b) => a - b));
  if (!allowedStays.includes(defaultStay)) {
    allowedStays.push(defaultStay);
    allowedStays.sort((a, b) => a - b);
  }

  const settings = {
    ...baseSettings,
    seat_capacity: businessRow?.seat_capacity !== undefined ? businessRow.seat_capacity : baseSettings.seat_capacity,
    default_stay_minutes: defaultStay,
    max_stay_minutes: allowedStays[allowedStays.length - 1],
    allowed_stay_minutes: allowedStays,
  };
  const offerings = Array.isArray(businessRow?.offerings) ? (businessRow.offerings as string[]) : [];
  const bookingCaps = getCapabilitiesForBusiness(
    businessRow?.industry ?? "",
    businessRow?.category ?? "",
    businessRow?.business_type ?? ""
  );
  const reservationSettings = extractReservationSettings(websiteRow?.metadata);
  const generalBookingsLive = isGeneralBookingsLive(
    bookingCaps,
    reservationSettings.enabled,
    true
  );
  const hasReservationOffering = offerings.includes("table_reservations") || generalBookingsLive;

  const siteTimezone = resolveWebsiteTimezone(websiteRow?.metadata);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t("subtitle")}</p>
        </div>
      </div>

      {!reservationsAvailable ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-8 py-16 text-center shadow-xs">
          <p className="text-base font-medium text-zinc-800">{t("setupUpdating")}</p>
        </div>
      ) : (
        <ReservationsClient
          initialReservations={reservations}
          organizerId={organizerId}
          canManage={canManage}
          websiteId={websiteId}
          businessId={businessRow?.id ?? null}
          initialSettings={settings}
          hasReservationOffering={hasReservationOffering}
          siteTimezone={siteTimezone}
        />
      )}
    </div>
  );
}
