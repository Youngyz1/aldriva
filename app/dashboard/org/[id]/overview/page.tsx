import { createSupabaseAdmin } from "@/lib/supabase-admin";
import Link from "next/link";
import { Calendar, Heart, Users, DollarSign, Ticket, Star } from "lucide-react";

function StatCard({
  label, value, icon: Icon, href, color = "orange",
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    orange: "bg-orange-50 text-orange-600",
    emerald: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    purple: "bg-purple-50 text-purple-600",
    yellow: "bg-yellow-50 text-yellow-600",
  };
  const inner = (
    <div className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${colorMap[color] ?? colorMap.orange}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-2xl font-black text-zinc-950">{value}</p>
        <p className="text-sm font-medium text-zinc-500">{label}</p>
      </div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default async function OrgOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();
  const base = `/dashboard/org/${id}`;

  const { data: org } = await supabase
    .from("organizers")
    .select("id, name, slug, follower_offset, events_offset, average_rating, review_count")
    .eq("id", id)
    .maybeSingle();

  if (!org) return null;

  const [
    { count: eventCount },
    { count: fundraiserCount },
    { count: followerCount },
    { count: ticketCount },
    { data: fundraisers },
    { data: recentEvents },
  ] = await Promise.all([
    supabase.from("events").select("*", { count: "exact", head: true }).eq("organizer_id", org.id),
    supabase.from("fundraisers").select("*", { count: "exact", head: true }).eq("organizer_id", org.id).is("deleted_at", null),
    supabase.from("organizer_follows").select("*", { count: "exact", head: true }).eq("organizer_id", org.id),
    supabase.from("ticket_orders").select("quantity", { count: "exact", head: true }),
    supabase.from("fundraisers").select("raised").eq("organizer_id", org.id).is("deleted_at", null),
    supabase.from("events").select("id, title, slug, event_date, city").eq("organizer_id", org.id).order("event_date", { ascending: false }).limit(5),
  ]);

  const totalRaised = (fundraisers ?? []).reduce((s, f) => s + Number(f.raised ?? 0), 0);
  const followers = (followerCount ?? 0) + (org.follower_offset ?? 0);
  const totalEvents = (eventCount ?? 0) + (org.events_offset ?? 0);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-black uppercase tracking-wide text-orange-600">Organization</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{org.name}</h1>
        <p className="mt-1 text-sm font-medium text-zinc-500">Your organization at a glance</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total Events" value={totalEvents} icon={Calendar} href={`${base}/events`} color="orange" />
        <StatCard label="Fundraisers" value={fundraiserCount ?? 0} icon={Heart} href={`${base}/fundraisers`} color="emerald" />
        <StatCard label="Followers" value={followers.toLocaleString()} icon={Users} color="blue" />
        <StatCard label="Total Raised" value={`$${totalRaised.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={DollarSign} href={`${base}/fundraisers`} color="purple" />
        <StatCard label="Tickets Sold" value={ticketCount ?? 0} icon={Ticket} href={`${base}/events`} color="orange" />
        {org.average_rating && (
          <StatCard label={`Avg Rating (${org.review_count ?? 0} reviews)`} value={`★ ${Number(org.average_rating).toFixed(1)}`} icon={Star} href={`${base}/reviews`} color="yellow" />
        )}
      </div>

      {/* Recent Events */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-black text-zinc-950">Recent Events</h2>
          <Link href={`${base}/events`} className="text-sm font-bold text-orange-600 hover:underline">View all →</Link>
        </div>
        {(recentEvents ?? []).length === 0 ? (
          <div className="rounded-xl bg-zinc-50 p-8 text-center">
            <p className="text-sm font-medium text-zinc-500">No events yet.</p>
            <Link href="/create-event" className="mt-3 inline-block rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white hover:bg-orange-700">
              Create Event
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {(recentEvents ?? []).map((evt) => (
              <li key={evt.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-bold text-zinc-900">{evt.title}</p>
                  <p className="text-xs text-zinc-500">
                    {evt.event_date ? new Date(evt.event_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Date TBA"}
                    {evt.city ? ` · ${evt.city}` : ""}
                  </p>
                </div>
                <Link href={`/events/${evt.slug}`} className="shrink-0 text-xs font-bold text-orange-600 hover:underline">View</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Quick Actions */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-black text-zinc-950">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/create-event" className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-orange-700">+ New Event</Link>
          <Link href="/create-fundraiser" className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700">+ New Fundraiser</Link>
          <Link href={`${base}/settings`} className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50">Edit Organization</Link>
          <Link href={org.slug ? `/org/${org.slug}` : `/organizers/${org.id}`} target="_blank" className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50">View Public Profile ↗</Link>
        </div>
      </section>
    </div>
  );
}
