import Link from "next/link";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { Button } from "@/components/ui/button";
import ScannerClient from "@/app/dashboard/events/[id]/scan/ScannerClient";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  eventStaffSessionCookieName,
  validateEventStaffSession,
} from "@/lib/staff/guest-session";

export default function EventStaffScannerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-lg px-4 py-12 text-center">
          <p className="text-sm text-zinc-600">Loading staff workspace…</p>
        </main>
      }
    >
      <EventStaffScannerContent params={params} />
    </Suspense>
  );
}

async function EventStaffScannerContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: eventId } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(eventStaffSessionCookieName(eventId))?.value;
  const session = token ? await validateEventStaffSession(eventId, token) : null;

  if (!session) {
    return (
      <main className="mx-auto flex min-h-[65vh] max-w-5xl items-center px-4 py-12 sm:px-6">
        <section role="status" className="mx-auto w-full max-w-lg text-center">
          <h1 className="text-xl font-black text-foreground">Staff access expired or revoked</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            This event staff session is no longer valid. Ask the organizer for a new invitation.
          </p>
          <Button asChild className="mt-5">
            <Link href="/">Return to Aldriva</Link>
          </Button>
        </section>
      </main>
    );
  }

  const admin = createSupabaseAdmin();
  const { data: event, error } = await admin
    .from("events")
    .select("id, title, event_date, venue, city")
    .eq("id", eventId)
    .maybeSingle();

  if (error || !event) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12 text-center">
        <h1 className="text-xl font-black text-zinc-950">Event unavailable</h1>
        <p className="mt-2 text-sm text-zinc-600">The event workspace could not be loaded.</p>
      </main>
    );
  }

  const { data: staffMember } = await admin
    .from("event_team_members")
    .select("staff_name, role_label, role, position_label")
    .eq("event_id", eventId)
    .eq("id", session.staffMemberId)
    .maybeSingle();

  return (
    <ScannerClient
      eventId={eventId}
      userId={`guest:${session.staffMemberId}`}
      staffMemberId={session.staffMemberId}
      staffName={staffMember?.staff_name || null}
      staffRole={session.role}
      staffRoleLabel={staffMember?.role_label || null}
      staffPositionLabel={staffMember?.position_label || null}
      assignedEntrance={session.entranceId}
      eventTitle={event.title}
      eventDetails={[event.event_date, event.venue, event.city].filter(Boolean).join(" · ")}
      guestSession
    />
  );
}
