import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { checkInvitationPageAccess } from "@/lib/actions/invitation-page";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { LivePreviewFrame } from "./LivePreviewFrame";

export const metadata: Metadata = {
  title: "Live Invitation Preview | Aldriva Dashboard",
  robots: { index: false, follow: false, nocache: true, noarchive: true },
};

export default async function InvitationLivePreviewRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id: eventId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?redirect=/dashboard/events/${eventId}/invitation-page`);
  }

  // Server-side ownership check: sample guest only, no real guest data,
  // no RSVP writes — but the event itself must not leak to strangers.
  const canAccess = await checkInvitationPageAccess(user.id, eventId);
  if (!canAccess) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 p-6 text-center shadow-xs">
        <h2 className="text-xl font-black text-red-700">Access Restricted</h2>
        <p className="mt-2 text-sm font-semibold text-red-600">
          Only Event Managers and Organizers can preview this invitation page.
        </p>
      </div>
    );
  }

  const admin = createSupabaseAdmin();
  const { data: event } = await admin
    .from("events")
    .select("id, title, slug, event_date, end_date, venue, street_address, city, latitude, longitude, banner, category")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-xs">
        <h2 className="text-xl font-black text-zinc-900">Event not found</h2>
      </div>
    );
  }

  return <LivePreviewFrame event={event} />;
}
