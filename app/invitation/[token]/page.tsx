import { Metadata } from "next";
import Link from "next/link";
import { MailX } from "lucide-react";
import { getInvitationByToken } from "@/lib/invitations";
import { BRAND } from "@/config/branding";
import InvitationClient from "./InvitationClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: `Digital Invitation Pass | ${BRAND.name}`,
    description: "Official digital invitation pass and RSVP portal.",
    robots: {
      index: false,
      follow: false,
      nocache: true,
    },
  };
}

export default async function PublicInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!token || typeof token !== "string" || token.length !== 64) {
    return <InvalidInvitationView message="This invitation link is invalid or malformed." />;
  }

  const result = await getInvitationByToken(token);

  if (!result || !result.invitation) {
    return <InvalidInvitationView message="Invitation not found. The link may have expired or been revoked." />;
  }

  const { invitation, ticketInstance, seat } = result;
  const event = invitation.events as any;

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
