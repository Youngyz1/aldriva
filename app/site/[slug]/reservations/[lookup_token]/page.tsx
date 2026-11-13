import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  ReservationTrackingView,
  type ReservationTrackingData,
} from "@/components/site/ReservationTrackingView";
import { maskCustomerName, maskCustomerPhone } from "@/lib/order-masking";
import { resolveWebsiteTimezone } from "@/lib/date-timezone";
import { extractReservationSettings } from "@/lib/reservation-settings";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

interface TrackingPageProps {
  params: Promise<{
    slug: string;
    lookup_token: string;
  }>;
}

export default async function ReservationTrackingPage({
  params,
}: TrackingPageProps) {
  const { slug, lookup_token: lookupToken } = await params;

  // 1. Rate limiting by IP (same posture as order tracking: 30s refresh room).
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip =
    headerList.get("x-real-ip") ||
    (forwarded ? forwarded.split(",")[0]?.trim() : null) ||
    "unknown";

  const rateCheck = await checkRateLimit("reservationTrackingView", `ip:${ip}`);
  if (!rateCheck.allowed) {
    return (
      <main className="public-site flex min-h-screen items-center justify-center bg-[var(--ps-cream)] p-[var(--ps-space-6)] text-center text-[var(--ps-text)]">
        <div className="ps-card max-w-md p-[var(--ps-space-8)]">
          <h1 className="font-bold">Too many requests</h1>
          <p className="mt-[var(--ps-space-2)] text-xs text-[var(--ps-muted)]">
            Please wait a moment before refreshing your request page.
          </p>
        </div>
      </main>
    );
  }

  const admin = createSupabaseAdmin();

  // 2. Website by slug. No status check here: unpublished sites are already
  // gated to a real 404 by proxy.ts (/site/:path*), same as order tracking —
  // entity members keep preview access to their own tracking links.
  const { data: website } = await admin
    .from("tenant_websites")
    .select("tenant_id, slug, metadata")
    .eq("slug", slug)
    .maybeSingle();

  if (!website) {
    return notFound();
  }

  // One shared rule: explicit metadata.timezone wins, else Africa/Abidjan.
  const siteTimezone = resolveWebsiteTimezone((website as { metadata?: unknown }).metadata);

  // 3. Business contact for the "call us" path.
  const { data: business } = await admin
    .from("businesses")
    .select("name, phone")
    .eq("organizer_id", (website as { tenant_id: string }).tenant_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // 4. Token lookup, strictly tenant-scoped. No lists, no enumeration:
  // a wrong token (or another tenant's token) renders the same not-found.
  // Without migration 176 the table is absent and this errors -> notFound
  // (graceful, never crashes).
  const { data: row, error } = await admin
    .from("reservations")
    .select(
      "id, reservation_number, customer_name, customer_phone, party_size, starts_at, duration_minutes, ends_at, status, customer_note, owner_note, decline_reason, created_at"
    )
    .eq("lookup_token", lookupToken)
    .eq("organizer_id", (website as { tenant_id: string }).tenant_id)
    .maybeSingle();

  if (error || !row) {
    return notFound();
  }
  const r = row as {
    id: string;
    reservation_number: string;
    customer_name: string;
    customer_phone: string;
    party_size: number;
    starts_at: string;
    duration_minutes?: number | null;
    ends_at?: string | null;
    status: string;
    customer_note: string | null;
    owner_note: string | null;
    decline_reason: string | null;
    created_at: string;
  };

  const reservationSettings = extractReservationSettings((website as { metadata?: unknown }).metadata);

  // 5. Check for any change request associated with this reservation.
  // Table created in migration 206; gracefully handle missing table in unmigrated environments.
  let changeRequest: ReservationTrackingData["changeRequest"] = null;
  try {
    const { data: crData } = await admin
      .from("reservation_change_requests")
      .select("id, requested_starts_at, requested_party_size, requested_duration_minutes, guest_note, status, decision_note, created_at")
      .eq("reservation_id", r.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (crData) {
      const cr = crData as {
        id: string;
        requested_starts_at: string | null;
        requested_party_size: number | null;
        requested_duration_minutes: number | null;
        guest_note: string | null;
        status: string;
        decision_note: string | null;
        created_at: string;
      };
      changeRequest = {
        id: cr.id,
        requestedStartsAt: cr.requested_starts_at,
        requestedPartySize: cr.requested_party_size,
        requestedDurationMinutes: cr.requested_duration_minutes,
        guestNote: cr.guest_note,
        status: cr.status as "pending" | "approved" | "declined" | "withdrawn" | "expired",
        decisionNote: cr.decision_note,
        createdAt: cr.created_at,
      };
    }
  } catch {
    // Graceful fallback if migration 206 table is not yet created
  }

  const trackingData: ReservationTrackingData = {
    reservationNumber: String(r.reservation_number),
    businessName: (business as { name?: string } | null)?.name || "Restaurant",
    businessPhone: (business as { phone?: string } | null)?.phone || null,
    siteSlug: slug,
    status: String(r.status),
    partySize: Number(r.party_size),
    startsAt: String(r.starts_at),
    durationMinutes: r.duration_minutes ? Number(r.duration_minutes) : null,
    endsAt: r.ends_at ? String(r.ends_at) : null,
    siteTimezone,
    customerNote: r.customer_note ? String(r.customer_note) : null,
    // Owner note only once confirmed; decline reason only when declined.
    ownerNote: r.status === "confirmed" && r.owner_note ? String(r.owner_note) : null,
    declineReason: r.status === "declined" && r.decline_reason ? String(r.decline_reason) : null,
    createdAt: String(r.created_at),
    maskedCustomerName: maskCustomerName(String(r.customer_name || "")),
    maskedCustomerPhone: maskCustomerPhone(String(r.customer_phone || "")),
    cancellationCutoffMinutes: reservationSettings.cancellation_cutoff_minutes ?? null,
    changeRequest,
    maxPartySize: reservationSettings.max_party_size,
    allowedStayMinutes: reservationSettings.allowed_stay_minutes ?? [90],
  };

  return <ReservationTrackingView order={trackingData} slug={slug} lookupToken={lookupToken} />;
}
