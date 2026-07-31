import { getDashboardContext, supabaseAdmin } from "@/lib/dashboard-context";
import { redirect } from "next/navigation";
import { BarChart2, Calendar, Heart, Award, DollarSign } from "lucide-react";
import Link from "next/link";

export default async function AccountAnalyticsPage() {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  const { organizers, organizerIds } = ctx;

  let eventCount = 0;
  let fundraiserCount = 0;
  let totalRaised = 0;

  if (organizerIds.length > 0) {
    const [eventsRes, fundraisersRes] = await Promise.all([
      supabaseAdmin
        .from("events")
        .select("id", { count: "exact", head: true })
        .in("organizer_id", organizerIds),
      supabaseAdmin
        .from("fundraisers")
        .select("raised")
        .in("organizer_id", organizerIds)
        .is("deleted_at", null),
    ]);

    eventCount = eventsRes.count ?? 0;
    fundraiserCount = fundraisersRes.data?.length ?? 0;
    totalRaised = fundraisersRes.data?.reduce((sum, f) => sum + Number(f.raised || 0), 0) || 0;
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-black uppercase tracking-wide text-orange-600">Account Dashboard</p>
        <h1 className="mt-1 text-2xl font-black">Cross-Organization Analytics</h1>
        <p className="text-sm font-medium text-zinc-500">
          Aggregated performance stats across all of your organization workspaces.
        </p>
      </header>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-black text-zinc-950">{eventCount}</p>
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Total Events Hosted</p>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Heart className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-black text-zinc-950">{fundraiserCount}</p>
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Total Campaigns Launched</p>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
            <DollarSign className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-black text-zinc-950">
              ${totalRaised.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Total Funds Raised</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <BarChart2 className="mx-auto h-12 w-12 text-zinc-300 mb-4" />
        <h3 className="text-lg font-black text-zinc-950">Detailed charts are coming soon</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-500">
          We are currently building aggregated performance visual charts for tracking page views, ticket buyer demographics, and donation timelines.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-xl bg-zinc-950 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-600 transition"
        >
          Back to Overview
        </Link>
      </div>
    </div>
  );
}
