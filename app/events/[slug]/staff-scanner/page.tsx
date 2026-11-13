import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import ScannerClient from "@/app/dashboard/events/[id]/scan/ScannerClient";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  eventStaffSessionCookieName,
  validateEventStaffSession,
} from "@/lib/staff/guest-session";
import {
  GUEST_SCANNER_UNAVAILABLE_MESSAGE,
  isGuestScannerEnabled,
} from "@/lib/staff/guest-scanner-flag";

function ReturnHome({ title, message }: { title: string; message: string }) {
  return (
    <main className="mx-auto flex min-h-[65vh] max-w-5xl items-center px-4 py-12 sm:px-6">
      <section role="status" className="mx-auto w-full max-w-lg text-center">
        <h1 className="mt-2 text-xl font-black text-foreground">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{message}</p>
        <Button asChild className="mt-5">
          <Link href="/">Return to Aldriva</Link>
        </Button>
      </section>
    </main>
  );
}

/**
 * Guest scanner landing route. Account-less staff invitations redeem to
 * this URL. Gated behind EVENT_GUEST_SCANNER_ENABLED (default off); when the
 * flag is off this always answers with an explicit status instead of a 404.
 */
export default async function EventStaffScannerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: eventId } = await params;

  if (!isGuestScannerEnabled()) {
    return (
      <main className="mx-auto flex min-h-[65vh] max-w-5xl items-center px-4 py-12 sm:px-6">
        <section role="status" className="mx-auto w-full max-w-lg text-center">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
            Event team access
          </p>
          <h1 className="mt-2 text-xl font-black text-foreground">
            Guest scanning is not available yet
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {GUEST_SCANNER_UNAVAILABLE_MESSAGE} Guest scanning is currently switched off for this environment.
          </p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            If you already have an Aldriva account on this event&apos;s team, sign in and open the
            event dashboard to scan tickets.
          </p>
          <Button asChild className="mt-5">
            <Link href="/">Return to Aldriva</Link>
          </Button>
        </section>
      </main>
    );
  }

  // Without a valid session, this page must reveal nothing about the event
  // behind it - not its title, not whether it exists - only a generic,
  // actionable message.
  const cookieStore = await cookies();
  const token = cookieStore.get(eventStaffSessionCookieName(eventId))?.value;
  const session = token ? await validateEventStaffSession(eventId, token) : null;

  if (!session) {
    const t = await getTranslations("Events");
    return (
      <ReturnHome
        title={t("staffScannerNoSessionHeading")}
        message={t("staffScannerNoSessionBody")}
      />
    );
  }

  const admin = createSupabaseAdmin();
  const [{ data: event }, { data: staffMember }] = await Promise.all([
    admin.from("events").select("id, title, event_date, venue, city").eq("id", eventId).maybeSingle(),
    admin
      .from("event_team_members")
      .select("staff_name, role_label, role, position_label")
      .eq("event_id", eventId)
      .eq("id", session.staffMemberId)
      .maybeSingle(),
  ]);

  if (!event) {
    return (
      <ReturnHome
        title="Event unavailable"
        message="The event workspace could not be loaded."
      />
    );
  }

  return (
    <ScannerClient
      eventId={eventId}
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
