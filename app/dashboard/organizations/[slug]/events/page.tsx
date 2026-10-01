import { createSupabaseAdmin } from "@/lib/supabase-admin";
import Link from "next/link";
import { Calendar, Plus } from "lucide-react";
import { ResponsiveDataTable } from "@/components/dashboard/ResponsiveDataTable";
import { ResponsiveDataRow } from "@/components/dashboard/ResponsiveDataRow";

export default async function OrgEventsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createSupabaseAdmin();

  const { data: org } = await supabase
    .from("organizers").select("id").eq("slug", slug).maybeSingle();

  const { data: events } = org
    ? await supabase
        .from("events")
        .select("id, title, slug, event_date, city, venue, status")
        .eq("organizer_id", org.id)
        .order("event_date", { ascending: false })
    : { data: [] };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-orange-600">Organization</p>
          <h1 className="mt-1 text-2xl font-black">Events</h1>
        </div>
        <Link
          href="/create-event"
          className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-orange-700"
        >
          <Plus className="h-4 w-4" /> New Event
        </Link>
      </div>

      {(events ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
          <Calendar className="mb-3 h-10 w-10 text-zinc-300" />
          <p className="font-black text-zinc-900">No events yet</p>
          <p className="mt-1 text-sm text-zinc-500">Create your first event to get started.</p>
          <Link href="/create-event" className="mt-4 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white hover:bg-orange-700">
            Create Event
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <ResponsiveDataTable
            columns={[
              { id: "event", header: "Event" },
              { id: "date", header: "Date" },
              { id: "location", header: "Location", hideBelow: "md" },
              { id: "status", header: "Status" },
              { id: "actions", header: "", align: "right" },
            ]}
          >
            {(events ?? []).map((evt) => {
              const dateStr = evt.event_date ? new Date(evt.event_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "TBA";
              const locationStr = [evt.venue, evt.city].filter(Boolean).join(", ") || "—";
              const statusBadge = (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  evt.status === "approved" || evt.status === "published" ? "bg-emerald-100 text-emerald-700" :
                  evt.status === "draft" ? "bg-zinc-100 text-zinc-600" : "bg-yellow-100 text-yellow-700"
                }`}>
                  {evt.status ?? "draft"}
                </span>
              );

              return (
                <ResponsiveDataRow
                  key={evt.id}
                  id={evt.id}
                  desktopCells={[
                    <span key="title" className="font-bold text-zinc-900 block">{evt.title}</span>,
                    <span key="date" className="text-zinc-600 block">{dateStr}</span>,
                    <span key="loc" className="text-zinc-600 block">{locationStr}</span>,
                    <div key="status">{statusBadge}</div>,
                    <div key="actions" className="text-right">
                      <Link href={`/events/${evt.slug}`} className="text-xs font-bold text-orange-600 hover:underline">View</Link>
                    </div>,
                  ]}
                  identity={<span className="font-bold text-zinc-950 text-left line-clamp-1">{evt.title}</span>}
                  state={statusBadge}
                  secondary={[dateStr, locationStr !== "—" ? locationStr : null]}
                  actions={<Link href={`/events/${evt.slug}`} className="text-xs font-bold text-orange-600 hover:underline">View</Link>}
                  expandedDetails={
                    <div className="space-y-1 text-xs text-zinc-600 py-1">
                      <div><span className="font-bold text-zinc-500">Date:</span> {dateStr}</div>
                      <div><span className="font-bold text-zinc-500">Location:</span> {locationStr}</div>
                    </div>
                  }
                />
              );
            })}
          </ResponsiveDataTable>
        </div>
      )}
    </div>
  );
}
