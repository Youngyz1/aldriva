import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getInvitationTemplates } from "@/lib/invitation-templates";
import InvitationDesignClient from "./InvitationDesignClient";

export default async function EventInvitationDesignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;

  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  const canManage = await hasEventOrOrganizerAccess(ctx.user.id, eventId, ["event_manager"]);

  if (!canManage) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-red-50 p-6 text-center shadow-sm">
        <h2 className="text-xl font-black text-red-700">Access Restricted</h2>
        <p className="mt-2 text-sm font-semibold text-red-600">
          Only Event Managers and Organizers can configure invitation card designs.
        </p>
      </div>
    );
  }

  const admin = createSupabaseAdmin();
  const [{ data: event }, templates] = await Promise.all([
    admin
      .from("events")
      .select("id, title, slug, event_date, end_date, venue, city, banner, invitation_template_id")
      .eq("id", eventId)
      .single(),
    getInvitationTemplates(),
  ]);

  if (!event) {
    redirect("/dashboard/events");
  }

  const initialTemplateId = event.invitation_template_id || (templates[0]?.id ?? null);

  return (
    <InvitationDesignClient
      eventId={eventId}
      event={{
        title: event.title,
        slug: event.slug,
        eventDate: event.event_date,
        endDate: event.end_date,
        venue: event.venue,
        city: event.city,
        banner: event.banner,
      }}
      templates={templates}
      initialTemplateId={initialTemplateId}
    />
  );
}
