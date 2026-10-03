// app/products/page.tsx
import { Suspense } from "react";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import Link from "next/link";
import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site-url";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import { MarketingSection } from "@/components/footers";
import { getCurrentUserProfile } from "@/lib/auth";
import {
  PRODUCT_TYPES,
  PRODUCT_TYPE_LABELS,
  isDigitalProductType,
} from "@/lib/digital-products";

export const metadata: Metadata = {
  title: "Shop Products — Aldriva",
  description: "Browse products and merchandise supporting great causes.",
  alternates: {
    canonical: `${getSiteUrl()}/products`,
  },
};

type ProductsSearchParams = {
  q?: string;
  price_type?: string;
  business_id?: string;
  product_type?: string;
  category?: string;
};

// NOT async — renders the static shell immediately, no blocking on searchParams/DB.
export default function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<ProductsSearchParams>;
}) {
  return (
    <MarketingSection>
      <main className="mx-auto max-w-[1440px] px-4 py-8 md:px-6 md:py-12">
        {/* Header — fully static, no dynamic data, paints instantly */}
        <div className="mb-10 flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl md:text-5xl">
              Shop
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base font-bold text-zinc-500 sm:mx-0 sm:text-lg">
              Products from Aldriva creators, organizers, and businesses.
            </p>
          </div>

          <div className="shrink-0">
            <Suspense fallback={null}>
              <CreateProductCta />
            </Suspense>
          </div>
        </div>

        <Suspense fallback={<ProductsLoading />}>
          <ProductsContent searchParams={searchParams} />
        </Suspense>
      </main>
    </MarketingSection>
  );
}

// "Create Product" — visible to authenticated active users (RLS: products INSERT
// requires auth.uid() = owner_id AND an active profile). Admins included.
async function CreateProductCta() {
  const profile = await getCurrentUserProfile();
  if (!profile || profile.status !== "active" || profile.deleted_at) return null;

  return (
    <Link
      href="/dashboard/products/new"
      className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-orange-700"
    >
      Create Product
    </Link>
  );
}

// All uncached/dynamic work lives here, isolated behind Suspense.
async function ProductsContent({
  searchParams,
}: {
  searchParams: Promise<ProductsSearchParams>;
}) {
  const {
    q = "",
    price_type = "",
    business_id = "",
    product_type = "",
    category = "",
  } = await searchParams;

  const supabase = createSupabaseAdmin();

  let query = supabase
    .from("products")
    .select(
      "id, name, slug, description, images, cover_image_url, price_type, product_type, category, stock_quantity, status, business_id"
    )
    .in("status", ["active", "out_of_stock"]);

  if (q.trim()) {
    const term = q.trim().replace(/,/g, " ");
    query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
  }
  if (price_type.trim()) query = query.eq("price_type", price_type.trim());
  if (product_type.trim()) query = query.eq("product_type", product_type.trim());
  if (category.trim()) query = query.eq("category", category.trim());
  if (business_id.trim()) query = query.eq("business_id", business_id.trim());

  const [
    { data: products, error },
    { data: businessesWithProducts },
    { data: categoryRows },
  ] = await Promise.all([
    query.order("created_at", { ascending: false }),
    supabase
      .from("products")
      .select("business_id, businesses(id, name)")
      .in("status", ["active", "out_of_stock"])
      .not("business_id", "is", null),
    supabase
      .from("products")
      .select("category")
      .in("status", ["active", "out_of_stock"])
      .not("category", "is", null),
  ]);

  if (error) {
    console.error("Error loading products:", error);
  }

  const distinctBusinesses = Array.from(
    new Map(
      (businessesWithProducts ?? [])
        .map((row: any) => row.businesses)
        .filter(Boolean)
        .map((b: any) => [b.id, b])
    ).values()
  ).sort((a: any, b: any) => a.name.localeCompare(b.name));

  const distinctCategories = Array.from(
    new Set(
      (categoryRows ?? [])
        .map((r: any) => (typeof r.category === "string" ? r.category.trim() : ""))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  return (
    <div className="grid gap-8 lg:grid-cols-4">
      {/* Sidebar filters — open section, not a card. */}
      <div className="lg:col-span-1 space-y-6">
        <div className="border-t border-zinc-200 pt-5">
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

            <div>
              <label className="block text-xs font-bold text-zinc-500 mb-1">Product Type</label>
              <select
                name="product_type"
                defaultValue={product_type}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
              >
                <option value="">All Products</option>
                {PRODUCT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PRODUCT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            {distinctCategories.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">Category</label>
                <select
                  name="category"
                  defaultValue={category}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
                >
                  <option value="">All Categories</option>
                  {distinctCategories.map((c: string) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}

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
              const digital = isDigitalProductType(
                (product as { product_type?: string | null }).product_type
              );
              const cover =
                (product as { cover_image_url?: string | null }).cover_image_url ||
                product.images?.[0];
              return (
                <div
                  key={product.id}
                  className="group relative flex flex-col justify-between rounded-2xl border border-zinc-150 bg-white p-5 shadow-sm hover:shadow-md transition duration-200"
                >
                  <div>
                    <div className="mb-4 aspect-square w-full overflow-hidden rounded-xl bg-slate-100">
                      {cover ? (
                        <img src={cover} alt={product.name} className="h-full w-full object-cover" />
                      ) : (
                        <LocalBrandedPlaceholder
                          variant="general"
                          title={product.name}
                          initials={product.name.slice(0, 2).toUpperCase()}
                          className="from-transparent to-transparent text-3xl text-slate-400"
                        />
                      )}
                    </div>

                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">
                        {digital
                          ? (PRODUCT_TYPE_LABELS as Record<string, string>)[
                              (product as { product_type?: string }).product_type || "other"
                            ] || "Digital"
                          : product.price_type === "subscription"
                            ? "Subscription"
                            : "One-time"}
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

                    {(product as { category?: string | null }).category && (
                      <p className="mt-1 text-xs font-bold text-zinc-400">
                        {(product as { category?: string }).category}
                      </p>
                    )}

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
  );
}

function ProductsLoading() {
  return (
    <div className="grid animate-pulse gap-8 lg:grid-cols-4">
      <div className="lg:col-span-1 space-y-6">
        <div className="border-t border-zinc-200 pt-5 space-y-4">
          <div className="h-4 w-28 rounded bg-zinc-200" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-16 rounded bg-zinc-100" />
              <div className="h-9 w-full rounded-xl bg-zinc-100" />
            </div>
          ))}
        </div>
      </div>
      <div className="lg:col-span-3">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-zinc-150 bg-white p-5">
              <div className="mb-4 aspect-square w-full rounded-xl bg-zinc-100" />
              <div className="mb-2 h-3 w-20 rounded bg-zinc-100" />
              <div className="mb-2 h-4 w-3/4 rounded bg-zinc-100" />
              <div className="mb-1 h-3 w-full rounded bg-zinc-100" />
              <div className="h-3 w-2/3 rounded bg-zinc-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}