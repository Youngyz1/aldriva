import { createSupabaseAdmin } from "@/lib/supabase-admin";
import Link from "next/link";
import type { Metadata } from "next";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

export const revalidate = 60; // Cache public catalog for 60 seconds

export const metadata: Metadata = {
  title: "Shop Products — Aldriva",
  description: "Browse products and merchandise supporting great causes.",
  alternates: {
    canonical: "https://www.fund4agoodcause.com/products",
  },
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; price_type?: string; business_id?: string }>;
}) {
  const { q = "", price_type = "", business_id = "" } = await searchParams;
  const supabase = createSupabaseAdmin();

  // 1. Fetch public products — status must match the RLS-visible set exactly.
  let query = supabase
    .from("products")
    .select("id, name, slug, description, images, price_type, stock_quantity, status, business_id")
    .in("status", ["active", "out_of_stock"]);

  if (q.trim()) {
    query = query.ilike("name", `%${q.trim()}%`);
  }

  if (price_type.trim()) {
    query = query.eq("price_type", price_type.trim());
  }

  if (business_id.trim()) {
    query = query.eq("business_id", business_id.trim());
  }

  const { data: products, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading products:", error);
  }

  // 2. Fetch businesses that have at least one live product, for the filter dropdown.
  const { data: businessesWithProducts } = await supabase
    .from("products")
    .select("business_id, businesses(id, name)")
    .in("status", ["active", "out_of_stock"])
    .not("business_id", "is", null);

  const distinctBusinesses = Array.from(
    new Map(
      (businessesWithProducts ?? [])
        .map((row: any) => row.businesses)
        .filter(Boolean)
        .map((b: any) => [b.id, b])
    ).values()
  ).sort((a: any, b: any) => a.name.localeCompare(b.name));

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-8 md:px-6 md:py-12">
      {/* Header */}
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl md:text-5xl">
          Shop
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base font-bold text-zinc-500 sm:text-lg">
          Products from Aldriva creators, organizers, and businesses.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-4">
        {/* Sidebar filters */}
        <div className="lg:col-span-1 space-y-6">
          <div className="rounded-2xl border border-zinc-150 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-900 mb-4">
              Search &amp; Filter
            </h3>

            <form method="GET" action="/products" className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">Keywords</label>
                <input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="T-shirt..."
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">Price Type</label>
                <select
                  name="price_type"
                  defaultValue={price_type}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
                >
                  <option value="">All Types</option>
                  <option value="one_time">One-time</option>
                  <option value="subscription">Subscription</option>
                </select>
              </div>

              {distinctBusinesses.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Business</label>
                  <select
                    name="business_id"
                    defaultValue={business_id}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
                  >
                    <option value="">All Businesses</option>
                    {distinctBusinesses.map((b: any) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex gap-2">
                <Link
                  href="/products"
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
          {!products || products.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 py-16 text-center">
              <p className="text-sm font-bold text-zinc-500">No products found matching the criteria.</p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => {
                const outOfStock = product.status === "out_of_stock";
                return (
                  <div
                    key={product.id}
                    className="group relative flex flex-col justify-between rounded-2xl border border-zinc-150 bg-white p-5 shadow-sm hover:shadow-md transition duration-200"
                  >
                    <div>
                      {/* Image */}
                      <div className="mb-4 aspect-square w-full overflow-hidden rounded-xl bg-slate-100">
                        {product.images?.[0] ? (
                          <img
                            src={product.images[0]}
                            alt={product.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <LocalBrandedPlaceholder
                            variant="general"
                            title={product.name}
                            initials={product.name.slice(0, 2).toUpperCase()}
                            className="from-transparent to-transparent text-3xl text-slate-400"
                          />
                        )}
                      </div>

                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">
                          {product.price_type === "subscription" ? "Subscription" : "One-time"}
                        </span>
                        {outOfStock && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">
                            Out of Stock
                          </span>
                        )}
                      </div>

                      <h2 className="text-base font-black text-zinc-900 group-hover:text-orange-600 transition">
                        {product.name}
                      </h2>

                      <p className="text-sm text-zinc-500 font-semibold line-clamp-2 mt-2 mb-4">
                        {product.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-end border-t border-zinc-100 pt-4 mt-auto">
                      <Link
                        href={`/products/${product.slug}`}
                        className="text-xs font-black text-orange-600 hover:text-orange-700 transition"
                      >
                        View Details →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
