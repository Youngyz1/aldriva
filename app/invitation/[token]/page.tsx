import { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { MailX } from "lucide-react";
import { getInvitationByToken } from "@/lib/invitations";
import { BRAND } from "@/config/branding";
import InvitationClient from "./InvitationClient";
import { getPublishedInvitationPage } from "@/lib/actions/invitation-page";
import { assembleInvitationPageData } from "@/lib/types/invitation-page-snapshot";
import { getSiteUrl } from "@/lib/site-url";
import { buildInvitationCardImageUrl } from "@/lib/invitation-card-url";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const title = `Digital Invitation Pass | ${BRAND.name}`;
  const description = "Official digital invitation pass and RSVP portal.";
  const baseMetadata: Metadata = {
    title,
    description,
    robots: {
      index: false,
      follow: false,
      nocache: true,
    },
  };

  const { token } = await params;
  if (!token || token.length !== 64) return baseMetadata;

  try {
    await connection();
    const result = await getInvitationByToken(token);
    if (!result?.invitation) return baseMetadata;

    const event = result.invitation.events as { id?: string; invitation_template_id?: string | null } | null;
    const publishedPage = event?.id ? await getPublishedInvitationPage(event.id) : null;
    const cardImageUrl = buildInvitationCardImageUrl(
      getSiteUrl(),
      token,
      event?.invitation_template_id,
      publishedPage?.published_at
    );

    return {
      ...baseMetadata,
      openGraph: {
        title,
        description,
        type: "website",
        images: [{ url: cardImageUrl, width: 1200, height: 630, alt: "Invitation card preview" }],
      },
      twitter: {
        card: "summary_large_image",
        images: [cardImageUrl],
      },
    };
  } catch {
    return baseMetadata;
  }
}

export default async function PublicInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Pure token-shape validation — no I/O, safe to prerender statically.
  if (!token || typeof token !== "string" || token.length !== 64) {
    return <InvalidInvitationView message="This invitation link is invalid or malformed." />;
  }

  // The invitation lookup below must run per request (see InvitationLoader),
  // so it lives behind a Suspense boundary: the static shell streams
  // immediately while the live data resolves in the dynamic slot.
  return (
    <Suspense fallback={<InvitationLoadingView />}>
      <InvitationLoader token={token} />
    </Suspense>
  );
}

/**
 * Fetches the live invitation record for this token. `connection()` opts this
 * component out of the prerender cache (the cacheComponents replacement for
 * the removed `dynamic = "force-dynamic"`): invitation rows are mutable —
 * RSVP status changes on every accept/decline POST, and invitations can be
 * revoked, expired, cancelled, or re-seated at any time — so a cached copy
 * could show a valid pass for a revoked invitation or stale RSVP state.
 * Everything outside this boundary (metadata, shell, malformed-token view)
 * remains statically cacheable.
 *
 * BRANCH LOGIC:
 * 1. If the event has a *published* invitation_page → render the new custom page
 *    template via the Invitation Template Registry. Unknown template_id → card fallback.
 * 2. If no published page (or page unpublished) → render the existing invitation card
 *    unchanged. Old invitations without any page always land here.
 */
async function InvitationLoader({ token }: { token: string }) {
  await connection();

  const result = await getInvitationByToken(token);

  if (!result || !result.invitation) {
    return <InvalidInvitationView message="Invitation not found. The link may have expired or been revoked." />;
  }

  const { invitation, ticketInstance, seat } = result;
  const event = invitation.events as any;

  // ── Branch: check for published invitation page ───────────────────────────
  const publishedPage = event?.id ? await getPublishedInvitationPage(event.id) : null;

  if (publishedPage) {
    const { getTemplateById } = await import("@/components/invitation/templates/registry");
    const registryEntry = getTemplateById(publishedPage.published_snapshot.template_id);

    if (registryEntry) {
      // Assemble live data layers into the InvitationPageData contract.
      const guestRecord = {
        guest_name: invitation.guest_name,
        guest_title: invitation.guest_title,
        organization: invitation.organization,
        rsvp_status: invitation.rsvp_status as "pending" | "accepted" | "declined",
        rsvp_at: invitation.rsvp_at,
        token: invitation.token,
        is_vip: seat?.is_vip ?? false,
      };

      const seatRecord = seat
        ? {
            section: seat.section,
            row_label: seat.row_label,
            seat_number: seat.seat_number,
            table_number: seat.table_number,
            table_name: seat.table_name,
            is_vip: Boolean(seat.is_vip),
          }
        : null;

      const ticketRecord = ticketInstance
        ? {
            qr_code: ticketInstance.qr_code,
            status: ticketInstance.status,
            checked_in_at: ticketInstance.checked_in_at,
          }
        : null;

      const liveEvent = {
        id: event.id,
        title: event.title || "Exclusive Event",
        slug: event.slug || "",
        event_date: event.event_date || "",
        end_date: event.end_date || null,
        venue: event.venue || null,
        street_address: null as string | null, // not selected in getInvitationByToken
        city: event.city || null,
        latitude: null as number | null,
        longitude: null as number | null,
      };

      const pageData = assembleInvitationPageData(
        publishedPage.published_snapshot,
        liveEvent,
        guestRecord,
        ticketRecord,
        seatRecord
      );

      const TemplateComponent = registryEntry.component;

      // RSVP handler — delegates to the existing RSVP API.
      async function handleRsvp(response: "accepted" | "declined") {
        "use server";
        const { rsvpInvitation } = await import("@/lib/invitations");
        await rsvpInvitation({ token, response });
      }

      return <TemplateComponent data={pageData} onRsvp={handleRsvp} />;
    }

    // Unknown template_id — log and fall through to card fallback.
    console.error(
      `[InvitationLoader] Unknown template_id "${publishedPage.published_snapshot.template_id}" for event ${event?.id}. Falling back to card.`
    );
  }

  // ── Fallback: existing invitation card (unchanged) ────────────────────────
  const { getInvitationTemplateById } = await import("@/lib/invitation-templates");
  const template = await getInvitationTemplateById(event?.invitation_template_id);

  // Format seat label nicely if available
  let seatDisplay: {
    label: string;
    isVip: boolean;
    tableNumber?: string | null;
    tableName?: string | null;
  } | null = null;

  if (seat) {
    let label = `${seat.section} · Row ${seat.row_label} · Seat ${seat.seat_number}`;
    if (seat.table_number) {
      const namePart = seat.table_name ? ` (${seat.table_name})` : "";
      label = `Table ${seat.table_number}${namePart} · Seat ${seat.seat_number}`;
    }
    seatDisplay = {
      label,
      isVip: Boolean(seat.is_vip),
      tableNumber: seat.table_number,
      tableName: seat.table_name,
    };
  } else if (ticketInstance?.seat_label) {
    seatDisplay = {
      label: ticketInstance.seat_label,
      isVip: false,
    };
  }

  return (
    <InvitationClient
      token={token}
      template={template}
      guest={{
        name: invitation.guest_name,
        title: invitation.guest_title,
        organization: invitation.organization,
        invitationStatus: invitation.invitation_status,
        rsvpStatus: invitation.rsvp_status,
        rsvpAt: invitation.rsvp_at,
      }}
      event={{
        title: event?.title || "Exclusive Event",
        slug: event?.slug || "",
        eventDate: event?.event_date || null,
        endDate: event?.end_date || null,
        venue: event?.venue || null,
        city: event?.city || null,
        banner: event?.banner || null,
      }}
      ticketInstance={
        ticketInstance
          ? {
              qrCode: ticketInstance.qr_code,
              status: ticketInstance.status,
              checkedInAt: ticketInstance.checked_in_at,
            }
          : null
      }
      seat={seatDisplay}
    />
  );
}

function InvitationLoadingView() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/90 p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 h-16 w-16 animate-pulse rounded-2xl border border-zinc-700 bg-zinc-800" />
        <div className="mx-auto h-5 w-40 animate-pulse rounded-lg bg-zinc-800" />
        <div className="mx-auto mt-3 h-3.5 w-56 animate-pulse rounded-lg bg-zinc-800/70" />
      </div>
    </main>
  );
}

function InvalidInvitationView({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/90 p-8 text-center shadow-2xl backdrop-blur-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800 border border-zinc-700 text-zinc-400">
          <MailX size={28} />
        </div>
        <h1 className="text-xl font-black text-white">Invalid Invitation</h1>
        <p className="mt-2 text-sm font-medium text-zinc-400 leading-relaxed">
          {message}
        </p>
        <div className="mt-6 pt-6 border-t border-zinc-800">
          <Link
            href="/"
            className="inline-block rounded-xl bg-zinc-800 px-5 py-2.5 text-xs font-black text-zinc-200 hover:bg-zinc-700 transition-all"
          >
            Go to {BRAND.name} Home
          </Link>
        </div>
      </div>
    </main>
  );
}
