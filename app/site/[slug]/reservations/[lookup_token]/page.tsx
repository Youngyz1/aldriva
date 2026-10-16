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

  const metadata =
    (website as { metadata?: unknown }).metadata &&
    typeof (website as { metadata: unknown }).metadata === "object"
      ? ((website as { metadata: Record<string, unknown> }).metadata as Record<string, unknown>)
      : {};
  const siteTimezone =
    typeof metadata.timezone === "string" && (metadata.timezone as string).trim()
      ? (metadata.timezone as string).trim()
      : "Africa/Abidjan";

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
      "reservation_number, customer_name, customer_phone, party_size, starts_at, status, customer_note, owner_note, decline_reason, created_at"
    )
    .eq("lookup_token", lookupToken)
    .eq("organizer_id", (website as { tenant_id: string }).tenant_id)
    .maybeSingle();

  if (error || !row) {
    return notFound();
  }
  const r = row as {
    reservation_number: string;
    customer_name: string;
    customer_phone: string;
    party_size: number;
    starts_at: string;
    status: string;
    customer_note: string | null;
    owner_note: string | null;
    decline_reason: string | null;
    created_at: string;
  };

  const trackingData: ReservationTrackingData = {
    reservationNumber: String(r.reservation_number),
    businessName: (business as { name?: string } | null)?.name || "Restaurant",
    businessPhone: (business as { phone?: string } | null)?.phone || null,
    siteSlug: slug,
    status: String(r.status),
    partySize: Number(r.party_size),
    startsAt: String(r.starts_at),
    siteTimezone,
    customerNote: r.customer_note ? String(r.customer_note) : null,
    // Owner note only once confirmed; decline reason only when declined.
    ownerNote: r.status === "confirmed" && r.owner_note ? String(r.owner_note) : null,
    declineReason: r.status === "declined" && r.decline_reason ? String(r.decline_reason) : null,
    createdAt: String(r.created_at),
    maskedCustomerName: maskCustomerName(String(r.customer_name || "")),
    maskedCustomerPhone: maskCustomerPhone(String(r.customer_phone || "")),
  };

  return <ReservationTrackingView order={trackingData} slug={slug} lookupToken={lookupToken} />;
}
