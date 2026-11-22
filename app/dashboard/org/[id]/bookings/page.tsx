/**
 * app/dashboard/org/[id]/bookings/page.tsx
 *
 * Owner booking visibility and operations for service businesses
 * (booking_type='appointment' rows only — table reservations are a
 * separate feature, see app/dashboard/org/[id]/reservations/page.tsx).
 * Allowed roles: owner, admin, manager, editor, finance (read).
 * Action buttons gated to canManage: owner, admin, manager.
 */

import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { checkTenantAccess, type EntityRole } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getTranslations } from "next-intl/server";
import { extractReservationSettings } from "@/lib/reservation-settings";
import { hasConfiguredHours } from "@/lib/reservation-slots";
import { resolveWebsiteTimezone } from "@/lib/date-timezone";
import { BookingsClient } from "@/components/dashboard/bookings/BookingsClient";
import type { DashboardBookingRow } from "@/components/dashboard/bookings/BookingCard";

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

export default async function BookingsPage({
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
  const t = await getTranslations("Bookings");

  const [websiteRes, activeServiceRes] = await Promise.all([
    admin
      .from("tenant_websites")
      .select("id, slug, metadata")
      .eq("tenant_id", organizerId)
      .maybeSingle(),
    admin
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("organizer_id", organizerId)
      .eq("is_active", true),
  ]);

  const websiteRow = websiteRes.data as { id?: string; slug?: string; metadata?: unknown } | null;
  const websiteId = websiteRow?.id ?? null;
  const settings = extractReservationSettings(websiteRow?.metadata);
  const siteTimezone = resolveWebsiteTimezone(websiteRow?.metadata);
  const hasActiveService = (activeServiceRes.count ?? 0) > 0;

  let hoursConfigured = false;
  if (websiteId) {
    const { data: contentRow } = await admin
      .from("website_content")
      .select("content")
      .eq("website_id", websiteId)
      .maybeSingle();
    const hoursValue = (contentRow as { content?: { hours?: unknown } } | null)?.content?.hours ?? {};
    hoursConfigured = hasConfiguredHours(hoursValue);
  }

  let bookings: DashboardBookingRow[] = [];
  let bookingsAvailable = true;
  const { data: rows, error: rowsError } = await admin
    .from("reservations")
    .select(
      "id, reservation_number, customer_name, customer_phone, customer_email, customer_note, starts_at, status, created_at, duration_minutes, booking_details"
    )
    .eq("organizer_id", organizerId)
    .eq("booking_type", "appointment")
    .order("created_at", { ascending: false })
    .limit(200);

  if (rowsError) {
    if (isMissingTableError(rowsError)) {
      bookingsAvailable = false;
    } else {
      console.error("[bookings-page] fetch error:", rowsError.code);
    }
  } else if (rows) {
    bookings = (rows as Array<Record<string, unknown>>).map((row) => {
      const details = (row.booking_details && typeof row.booking_details === "object" ? row.booking_details : {}) as {
        service_title?: unknown;
        service_type?: unknown;
        alt_starts_at?: unknown;
        booking_mode?: unknown;
      };
      return {
        id: row.id as string,
        reservation_number: row.reservation_number as string,
        customer_name: row.customer_name as string,
        customer_phone: row.customer_phone as string,
        customer_email: (row.customer_email as string | null) ?? null,
        customer_note: (row.customer_note as string | null) ?? null,
        starts_at: row.starts_at as string,
        status: row.status as string,
        created_at: row.created_at as string,
        duration_minutes:
          typeof row.duration_minutes === "number"
            ? row.duration_minutes
            : row.duration_minutes != null
              ? Number(row.duration_minutes)
              : null,
        service_title:
          (typeof details.service_title === "string" && details.service_title) ||
          (typeof details.service_type === "string" && details.service_type) ||
          null,
        alt_starts_at: (typeof details.alt_starts_at === "string" && details.alt_starts_at) || null,
        booking_mode: typeof details.booking_mode === "string" ? details.booking_mode : null,
      };
    });
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t("subtitle")}</p>
        </div>
      </div>

      {!bookingsAvailable ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-8 py-16 text-center shadow-xs">
          <p className="text-base font-medium text-zinc-800">{t("setupUpdating")}</p>
        </div>
      ) : (
        <BookingsClient
          organizerId={organizerId}
          websiteId={websiteId}
          canManage={canManage}
          enabled={settings.enabled}
          hoursConfigured={hoursConfigured}
          hasActiveService={hasActiveService}
          bookings={bookings}
          siteTimezone={siteTimezone}
        />
      )}
    </div>
  );
}
