import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import TicketDesignClient from "./TicketDesignClient";

export default async function EventTicketDesignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;

  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  const canManage = await hasEventOrOrganizerAccess(ctx.user.id, eventId, [
    "event_manager",
  ]);

  if (!canManage) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-red-50 p-6 text-center shadow-sm">
        <h2 className="text-xl font-black text-red-700">Access Restricted</h2>
        <p className="mt-2 text-sm font-semibold text-red-600">
          Only Event Managers and Organizers can configure ticket pass designs.
        </p>
      </div>
    );
  }

  const admin = createSupabaseAdmin();
  const { data: event } = await admin
    .from("events")
    .select("id, title, slug, event_date, end_date, venue, city, banner, ticket_template")
    .eq("id", eventId)
    .single();

  if (!event) {
    redirect("/dashboard/events");
  }

  return (
    <TicketDesignClient
      eventId={eventId}
      event={{
        title: event.title,
        slug: event.slug,
        eventDate: event.event_date,
        endDate: event.end_date,
        venue: event.venue,
        city: event.city,
        banner: event.banner,
        ticketTemplate: event.ticket_template || "modern",
      }}
      initialTemplate={(event.ticket_template as "modern" | "concert" | "premium" | "minimal") || "modern"}
    />
  );
}
