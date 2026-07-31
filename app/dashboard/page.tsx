import { redirect } from "next/navigation";
import { getDashboardContext, supabaseAdmin } from "@/lib/dashboard-context";
import Link from "next/link";
import Image from "next/image";
import { Building2, Plus, ArrowRight, Settings, Users, Star, Award } from "lucide-react";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

export default async function DashboardPage() {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  const { user, organizers, organizerIds } = ctx;
  const displayName = (user.user_metadata?.display_name as string | undefined)?.trim() || "User";

  // Let's compute high-level aggregate numbers across all user's organizations
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
      {/* Welcome Header */}
      <header className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm sm:p-8">
        <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black uppercase tracking-wide text-orange-400">
          Account Overview
        </span>
        <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
          Welcome back, {displayName}
        </h1>
        <p className="mt-2 text-sm font-medium text-slate-300">
          Manage your organizations, view cross-platform analytics, and update your personal account settings.
        </p>
      </header>

      {/* Aggregate Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-3xl font-black text-zinc-950">{organizers.length}</p>
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide mt-0.5">Organizations Owned</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-3xl font-black text-zinc-950">{eventCount}</p>
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide mt-0.5">Total Events Hosted</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-3xl font-black text-zinc-950">
            ${totalRaised.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide mt-0.5">Total Funds Raised</p>
        </div>
      </div>

      {/* Main Action area: Switcher Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-zinc-950">Select Organization Workspace</h2>
          <Link
            href="/create-organizer"
            className="flex items-center gap-1.5 text-xs font-black text-orange-600 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Organization
          </Link>
        </div>

        {organizers.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center shadow-sm">
            <Building2 className="mb-3 h-10 w-10 text-zinc-300" />
            <p className="font-black text-zinc-950">Get Started</p>
            <p className="mt-1 text-sm text-zinc-500">Create an organization profile to host events and fundraisers.</p>
            <Link
              href="/create-organizer"
              className="mt-4 rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white hover:bg-orange-700 transition"
            >
              Create Organization
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {organizers.map((org) => (
              <Link
                key={org.id}
                href={`/dashboard/org/${org.id}/overview`}
                className="group flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-orange-200 hover:bg-orange-50/20"
              >
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-zinc-100 bg-zinc-50">
                  {org.photo ? (
                    <Image
                      src={org.photo}
                      alt={org.name}
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  ) : (
                    <LocalBrandedPlaceholder
                      variant="avatar"
                      title={org.name}
                      initials={org.name.charAt(0).toUpperCase()}
                      className="from-transparent to-transparent text-zinc-400"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-black text-zinc-950 group-hover:text-orange-600 transition">
                    {org.name}
                  </p>
                  <p className="text-xs font-medium text-zinc-500">
                    Manage events, fundraisers, and settings
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 group-hover:text-orange-500 transition-transform group-hover:translate-x-1" />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Account Settings Shortcut Panel */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="font-black text-zinc-950 mb-3">Account Settings</h2>
        <p className="text-sm font-medium text-zinc-500 mb-4">
          Configure security details, notifications, and billing preferences.
        </p>
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-bold text-zinc-700 hover:bg-zinc-50 transition"
        >
          <Settings className="h-4 w-4 text-zinc-400" />
          Edit Account Settings
        </Link>
      </section>
    </div>
  );
}
