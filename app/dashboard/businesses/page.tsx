import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext } from "@/lib/dashboard-context";
import { createSupabaseServer } from "@/lib/supabase-server";
import { deleteBusiness } from "@/lib/actions/businesses";
import { revalidatePath } from "next/cache";
import BusinessRowActions from "./BusinessRowActions";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

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

export default async function DashboardBusinessesPage({
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

      {/* Toolbar / Filters */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-100/5">
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
      </div>

      {/* Main List */}
      {!businesses || businesses.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-100 bg-white p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 mb-4">
            🏢
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
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm shadow-slate-100/5">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm text-slate-500">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <tr>
                  <th scope="col" className="px-6 py-4">Business</th>
                  <th scope="col" className="px-6 py-4">Tier</th>
                  <th scope="col" className="px-6 py-4">Status</th>
                  <th scope="col" className="px-6 py-4">Subscription Details</th>
                  <th scope="col" className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                {businesses.map((biz) => (
                  <tr key={biz.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
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
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${tierBadge[biz.listing_tier] || "bg-slate-100"}`}>
                        {biz.listing_tier === "one_time" ? "One-time" : biz.listing_tier.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${statusBadge[biz.status] || "bg-slate-100"}`}>
                        {biz.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
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
                    </td>
                    <td className="px-6 py-4 text-right">
                      <BusinessRowActions
                        business={biz}
                        onDelete={handleDelete}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
