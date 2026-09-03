import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import EventSubNav, { type EventUserRole } from "@/components/dashboard/EventSubNav";
import { getEventTeamRole, hasEventOrOrganizerAccess } from "@/lib/event-auth";

export default async function EventDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?redirect=/dashboard/events/${eventId}/checkins`);
  }

  const admin = createSupabaseAdmin();

  // Fetch event record
  const { data: event } = await admin
    .from("events")
    .select("id, title, slug, user_id, organizer_id")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) {
    redirect("/dashboard/events");
  }

  // Use the shared event-team authorization helpers so the tab bar follows
  // the same role matrix as the event-team routes.
  const hasOrganizerAccess = await hasEventOrOrganizerAccess(user.id, eventId, []);
  const teamRole = hasOrganizerAccess ? null : await getEventTeamRole(user.id, eventId);
  const userRole: EventUserRole = hasOrganizerAccess ? "owner" : teamRole;

  if (!userRole) {
    redirect("/dashboard/events");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <EventSubNav
        eventId={eventId}
        eventTitle={event.title}
        eventSlug={event.slug}
        userRole={userRole}
      />
      <div>{children}</div>
    </div>
  );
}
