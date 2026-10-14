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
      "id, reservation_number, customer_name, customer_phone, customer_email, party_size, starts_at, status, customer_note, owner_note, decline_reason, status_history, created_at"
    )
    .eq("organizer_id", organizerId)
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
      .select("id, offerings")
      .eq("organizer_id", organizerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const websiteRow = websiteRes.data as { id?: string; metadata?: unknown } | null;
  const businessRow = businessRes.data as { id?: string; offerings?: unknown } | null;
  const websiteId = websiteRow?.id ?? null;
  const settings = extractReservationSettings(websiteRow?.metadata);
  const offerings = Array.isArray(businessRow?.offerings) ? (businessRow.offerings as string[]) : [];
  const hasReservationOffering = offerings.includes("table_reservations");

  const metadata =
    websiteRow?.metadata && typeof websiteRow.metadata === "object"
      ? (websiteRow.metadata as Record<string, unknown>)
      : {};
  const siteTimezone =
    typeof metadata.timezone === "string" && (metadata.timezone as string).trim()
      ? (metadata.timezone as string).trim()
      : "Africa/Abidjan";

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
