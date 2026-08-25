import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import ScannerClient from "./ScannerClient";

export default async function EventScannerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;

  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  const canScan = await hasEventOrOrganizerAccess(ctx.user.id, eventId, [
    "event_manager",
    "ticket_scanner",
  ]);

  if (!canScan) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-red-50 p-6 text-center shadow-sm">
        <h2 className="text-xl font-black text-red-700">Access Denied</h2>
        <p className="mt-2 text-sm font-semibold text-red-600">
          You do not have permission to scan tickets for this event.
        </p>
      </div>
    );
  }

  // Fetch event title for header
  const admin = createSupabaseAdmin();
  const { data: event } = await admin
    .from("events")
    .select("id, title, event_date, venue, city")
    .eq("id", eventId)
    .single();

  return (
    <ScannerClient
      eventId={eventId}
      eventTitle={event?.title || "Event Door Scanner"}
      eventDetails={
        event
          ? [event.venue, event.city].filter(Boolean).join(", ")
          : undefined
      }
    />
  );
}
