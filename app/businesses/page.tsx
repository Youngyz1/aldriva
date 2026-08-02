import { createSupabaseAdmin } from "@/lib/supabase-admin";
import Link from "next/link";
import type { Metadata } from "next";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

export const metadata: Metadata = {
  title: "Businesses Directory — Aldriva",
  description: "Browse and discover local businesses supporting communities.",
  alternates: {
    canonical: "https://www.fund4agoodcause.com/businesses",
  },
};

export default async function BusinessesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; city?: string; category?: string }>;
}) {
  const { q = "", city = "", category = "" } = await searchParams;
  const supabase = createSupabaseAdmin();

  // 1. Fetch public active and non-flagged businesses
  let query = supabase
    .from("businesses")
    .select("id, name, slug, description, industry, category, logo, city, state, website")
    .eq("status", "active")
    .eq("is_flagged", false);

  if (q.trim()) {
    query = query.ilike("name", `%${q.trim()}%`);
  }

  if (city.trim()) {
    query = query.eq("city", city.trim());
  }

  if (category.trim()) {
    query = query.eq("category", category.trim());
  }

  const { data: businesses, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading businesses:", error);
  }

  // 2. Fetch distinct cities and categories for side filters
  const { data: allActive } = await supabase
    .from("businesses")
    .select("city, category")
    .eq("status", "active")
    .eq("is_flagged", false);

  const distinctCities = Array.from(
    new Set((allActive ?? []).map((b) => b.city).filter(Boolean))
  ).sort();

  const distinctCategories = Array.from(
    new Set((allActive ?? []).map((b) => b.category).filter(Boolean))
  ).sort();

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-8 md:px-6 md:py-12">
      {/* Header */}
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl md:text-5xl">
          Business Directory
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base font-bold text-zinc-500 sm:text-lg">
          Support local businesses, sponsors, and community partners.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-4">
        {/* Sidebar filters */}
        <div className="lg:col-span-1 space-y-6">
          <div className="rounded-2xl border border-zinc-150 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-900 mb-4">
              Search &amp; Filter
            </h3>
            
            <form method="GET" action="/businesses" className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">Keywords</label>
                <input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="Acme Corp..."
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">City</label>
                <select
                  name="city"
                  defaultValue={city}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
                >
                  <option value="">All Cities</option>
                  {distinctCities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">Category</label>
                <select
                  name="category"
                  defaultValue={category}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
                >
                  <option value="">All Categories</option>
                  {distinctCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <Link
                  href="/businesses"
                  className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-center text-xs font-black text-zinc-700 hover:bg-zinc-50 transition"
                >
                  Reset
                </Link>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-orange-600 px-3 py-2 text-center text-xs font-black text-white hover:bg-orange-700 transition"
                >
                  Apply
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Main listings grid */}
        <div className="lg:col-span-3">
          {!businesses || businesses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 py-16 text-center">
              <p className="text-sm font-bold text-zinc-500">No active businesses found matching the criteria.</p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {businesses.map((biz) => (
                <div
                  key={biz.id}
                  className="group relative flex flex-col justify-between rounded-2xl border border-zinc-150 bg-white p-5 shadow-sm hover:shadow-md transition duration-200"
                >
                  <div>
                    {/* Logo/Image */}
                    <div className="flex items-center gap-3 mb-4">
                      {biz.logo ? (
                        <img
                          src={biz.logo}
                          alt={biz.name}
                          className="h-12 w-12 rounded-xl object-cover border border-zinc-100"
                        />
                      ) : (
                        <LocalBrandedPlaceholder
                          variant="business"
                          title={biz.name}
                          initials={biz.name.slice(0, 2).toUpperCase()}
                          className="h-12 w-12 rounded-xl from-slate-100 to-slate-100 text-lg text-slate-500"
                        />
                      )}
                      <div>
                        <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">
                          {biz.industry}
                        </span>
                        <h2 className="text-base font-black text-zinc-900 group-hover:text-orange-600 transition">
                          {biz.name}
                        </h2>
                      </div>
                    </div>

                    <p className="text-sm text-zinc-500 font-semibold line-clamp-3 mb-4">
                      {biz.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between border-t border-zinc-100 pt-4 mt-auto">
                    <span className="text-xs font-bold text-zinc-400">
                      {biz.city ? `${biz.city}${biz.state ? `, ${biz.state}` : ""}` : "Global"}
                    </span>
                    <Link
                      href={`/businesses/${biz.slug}`}
                      className="text-xs font-black text-orange-600 hover:text-orange-700 transition"
                    >
                      View Details →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
