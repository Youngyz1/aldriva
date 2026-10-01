import { Store } from "lucide-react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext } from "@/lib/dashboard-context";
import { createSupabaseServer } from "@/lib/supabase-server";
import { deleteBusiness } from "@/lib/actions/businesses";
import { revalidatePath } from "next/cache";
import BusinessRowActions from "./BusinessRowActions";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import StickyTableToolbar from "@/components/ui/sticky-table-toolbar";

import { ResponsiveDataTable, ResponsiveColumn } from "@/components/dashboard/ResponsiveDataTable";
import { ResponsiveDataRow } from "@/components/dashboard/ResponsiveDataRow";

const tierBadge: Record<string, string> = {
  free: "bg-zinc-100 text-zinc-700 border-zinc-200",
  one_time: "bg-blue-50 text-blue-700 border-blue-200",
  subscription: "bg-purple-50 text-purple-700 border-purple-200",
};

const statusBadge: Record<string, string> = {
  pending_review: "bg-amber-50 text-amber-700 border-amber-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  archived: "bg-slate-100 text-slate-600 border-slate-200",
};

const BUSINESS_COLUMNS: ResponsiveColumn[] = [
  { id: "business", header: "Business", align: "left" },
  { id: "tier", header: "Tier", align: "left" },
  { id: "status", header: "Status", align: "left" },
  { id: "subscription", header: "Subscription Details", align: "left", hideBelow: "md" },
  { id: "actions", header: "Actions", align: "right" },
];

import { Suspense } from "react";

function BusinessesPageSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-zinc-200 rounded" />
      <div className="h-64 w-full bg-zinc-200 rounded-xl" />
    </div>
  );
}

async function DashboardBusinessesContent({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tier?: string }>;
}) {
  const ctx = await getDashboardContext();
  if (!ctx) {
    redirect("/login");
  }

  const { q = "", tier = "all" } = await searchParams;
  const supabase = await createSupabaseServer();

  let query = supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", ctx.user.id);

  if (q.trim()) {
    query = query.ilike("name", `%${q.trim()}%`);
  }

  if (tier !== "all") {
    query = query.eq("listing_tier", tier);
  }

  const { data: businesses, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading user businesses:", error);
  }

  async function handleDelete(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    if (id) {
      await deleteBusiness(id);
      revalidatePath("/dashboard/businesses");
    }
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            My Businesses
          </h1>
          <p className="text-sm font-semibold text-slate-500">
            Manage your business listings, pricing tiers, and subscriptions.
          </p>
        </div>
        <Link
          href="/dashboard/businesses/new"
          className="inline-flex items-center justify-center rounded-xl bg-orange-600 px-4 py-2.5 text-center text-sm font-black text-white hover:bg-orange-700 transition"
        >
          + Add Business
        </Link>
      </div>

      {/* Sticky toolbar — search/filter stays visible while table scrolls */}
      <StickyTableToolbar>
        <form method="GET" action="/dashboard/businesses" className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search businesses by name..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
            />
          </div>
          <div className="w-full sm:w-48">
            <select
              name="tier"
              defaultValue={tier}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
            >
              <option value="all">All Tiers</option>
              <option value="free">Free</option>
              <option value="one_time">One-time</option>
              <option value="subscription">Subscription</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-bold text-white hover:bg-slate-800 transition"
          >
            Filter
          </button>
        </form>
      </StickyTableToolbar>

      {/* Main List */}
      {!businesses || businesses.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-100 bg-white p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 mb-4">
            <Store className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No businesses yet</h3>
          <p className="mt-1 text-sm font-semibold text-slate-500 max-w-sm">
            Create a business listing to promote your company and publish related news articles.
          </p>
          <Link
            href="/dashboard/businesses/new"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white hover:bg-orange-700 transition"
          >
            Get Started
          </Link>
        </div>
      ) : (
        <ResponsiveDataTable columns={BUSINESS_COLUMNS}>
          {businesses.map((biz) => (
            <ResponsiveDataRow
              key={biz.id}
              id={biz.id}
              desktopCells={[
                <div key="biz" className="flex items-center gap-3">
                  {biz.logo ? (
                    <img
                      src={biz.logo}
                      alt={biz.name}
                      className="h-10 w-10 rounded-xl object-cover border border-slate-100"
                    />
                  ) : (
                    <LocalBrandedPlaceholder
                      variant="business"
                      title={biz.name}
                      initials={biz.name.slice(0, 2).toUpperCase()}
                      className="h-10 w-10 rounded-xl from-slate-100 to-slate-100 text-base text-slate-500"
                    />
                  )}
                  <div>
                    <div className="font-bold text-slate-900">{biz.name}</div>
                    <div className="text-xs text-slate-400">{biz.industry} • {biz.category}</div>
                  </div>
                </div>,

                <div key="tier">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${tierBadge[biz.listing_tier] || "bg-slate-100"}`}>
                    {biz.listing_tier === "one_time" ? "One-time" : biz.listing_tier.toUpperCase()}
                  </span>
                </div>,

                <div key="status">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${statusBadge[biz.status] || "bg-slate-100"}`}>
                    {biz.status.replace("_", " ")}
                  </span>
                </div>,

                <div key="sub" className="text-xs text-slate-500">
                  {biz.listing_tier === "subscription" && biz.stripe_subscription_id ? (
                    <div>
                      <div className="font-semibold">Sub ID: {biz.stripe_subscription_id.slice(0, 12)}...</div>
                      {biz.current_period_end && (
                        <div className="text-slate-400">
                          Ends: {new Date(biz.current_period_end).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </div>,

                <div key="actions" className="text-right">
                  <BusinessRowActions
                    business={biz}
                    onDelete={handleDelete}
                  />
                </div>,
              ]}
              identity={
                <div className="flex items-center gap-3">
                  {biz.logo ? (
                    <img
                      src={biz.logo}
                      alt={biz.name}
                      className="h-8 w-8 rounded-lg object-cover border border-slate-100 shrink-0"
                    />
                  ) : (
                    <LocalBrandedPlaceholder
                      variant="business"
                      title={biz.name}
                      initials={biz.name.slice(0, 2).toUpperCase()}
                      className="h-8 w-8 rounded-lg from-slate-100 to-slate-100 text-xs text-slate-500 shrink-0"
                    />
                  )}
                  <span className="font-bold text-slate-900 truncate">{biz.name}</span>
                </div>
              }
              primaryValue={
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${tierBadge[biz.listing_tier] || "bg-slate-100"}`}>
                  {biz.listing_tier === "one_time" ? "One-time" : biz.listing_tier.toUpperCase()}
                </span>
              }
              state={
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusBadge[biz.status] || "bg-slate-100"}`}>
                  {biz.status.replace("_", " ")}
                </span>
              }
              secondary={[
                (biz.industry || biz.category) ? (
                  <span key="industry" className="truncate">{[biz.industry, biz.category].filter(Boolean).join(" • ")}</span>
                ) : null,
                biz.listing_tier === "subscription" && biz.current_period_end ? (
                  <span key="sub" className="text-slate-400">Ends {new Date(biz.current_period_end).toLocaleDateString()}</span>
                ) : null,
              ].filter(Boolean)}
              actions={
                <BusinessRowActions
                  business={biz}
                  onDelete={handleDelete}
                />
              }
              expandedDetails={
                <div className="space-y-1.5 text-xs pt-1">
                  <div>
                    <span className="text-slate-400 font-medium">Category: </span>
                    <span className="font-bold text-slate-700">{biz.industry || "General"} {biz.category ? `• ${biz.category}` : ""}</span>
                  </div>
                  {biz.listing_tier === "subscription" && biz.stripe_subscription_id && (
                    <div>
                      <span className="text-slate-400 font-medium">Subscription ID: </span>
                      <span className="font-mono text-slate-700">{biz.stripe_subscription_id}</span>
                    </div>
                  )}
                </div>
              }
            />
          ))}
        </ResponsiveDataTable>
      )}
    </div>
  );
}

export default function DashboardBusinessesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tier?: string }>;
}) {
  return (
    <Suspense fallback={<BusinessesPageSkeleton />}>
      <DashboardBusinessesContent searchParams={searchParams} />
    </Suspense>
  );
}
