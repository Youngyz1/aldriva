import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import TeamClient from "./TeamClient";

export default async function EventTeamManagementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;

  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  const canManageTeam = await hasEventOrOrganizerAccess(ctx.user.id, eventId, [
    "event_manager",
  ]);

  if (!canManageTeam) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-red-50 p-6 text-center shadow-sm">
        <h2 className="text-xl font-black text-red-700">Access Restricted</h2>
        <p className="mt-2 text-sm font-semibold text-red-600">
          Only Event Managers and Organizers can manage event staff.
        </p>
      </div>
    );
  }

  const admin = createSupabaseAdmin();
  const { data: event } = await admin
    .from("events")
    .select("id, title")
    .eq("id", eventId)
    .single();

  return <TeamClient eventId={eventId} eventTitle={event?.title || "Event"} />;
}
