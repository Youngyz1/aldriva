import { createSupabaseAdmin } from "@/lib/supabase-admin";
import Link from "next/link";
import { Calendar, Plus } from "lucide-react";

export default async function OrgEventsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();

  const { data: events } = await supabase
    .from("events")
    .select("id, title, slug, event_date, city, venue, status")
    .eq("organizer_id", id)
    .order("event_date", { ascending: false });

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
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wide text-zinc-500">Event</th>
                <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wide text-zinc-500">Date</th>
                <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wide text-zinc-500">Location</th>
                <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wide text-zinc-500">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(events ?? []).map((evt) => (
                <tr key={evt.id} className="hover:bg-zinc-50">
                  <td className="px-5 py-4 font-bold text-zinc-900">{evt.title}</td>
                  <td className="px-5 py-4 text-zinc-600">
                    {evt.event_date ? new Date(evt.event_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "TBA"}
                  </td>
                  <td className="px-5 py-4 text-zinc-600">{[evt.venue, evt.city].filter(Boolean).join(", ") || "—"}</td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      evt.status === "approved" || evt.status === "published" ? "bg-emerald-100 text-emerald-700" :
                      evt.status === "draft" ? "bg-zinc-100 text-zinc-600" : "bg-yellow-100 text-yellow-700"
                    }`}>
                      {evt.status ?? "draft"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link href={`/events/${evt.slug}`} className="text-xs font-bold text-orange-600 hover:underline">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
