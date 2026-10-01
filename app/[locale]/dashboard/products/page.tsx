import { ShoppingBag } from "lucide-react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext } from "@/lib/dashboard-context";
import { createSupabaseServer } from "@/lib/supabase-server";
import { deleteProduct } from "@/lib/actions/products";
import { revalidatePath } from "next/cache";
import ProductRowActions from "./ProductRowActions";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import StickyTableToolbar from "@/components/ui/sticky-table-toolbar";
import {
  PRODUCT_TYPE_LABELS,
  isDigitalProductType,
} from "@/lib/digital-products";
import { ResponsiveDataTable, ResponsiveColumn } from "@/components/dashboard/ResponsiveDataTable";
import { ResponsiveDataRow } from "@/components/dashboard/ResponsiveDataRow";

import { Suspense } from "react";

const priceTypeBadge: Record<string, string> = {
  one_time: "bg-blue-50 text-blue-700 border-blue-200",
  subscription: "bg-purple-50 text-purple-700 border-purple-200",
};

const statusBadge: Record<string, string> = {
  pending_review: "bg-amber-50 text-amber-700 border-amber-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  out_of_stock: "bg-amber-50 text-amber-700 border-amber-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  archived: "bg-slate-100 text-slate-600 border-slate-200",
};

const PRODUCT_COLUMNS: ResponsiveColumn[] = [
  { id: "product", header: "Product", align: "left" },
  { id: "type", header: "Type", align: "left", hideBelow: "md" },
  { id: "price_type", header: "Price Type", align: "left", hideBelow: "lg" },
  { id: "status", header: "Status", align: "left" },
  { id: "files", header: "Files", align: "left", hideBelow: "lg" },
  { id: "sales", header: "Sales", align: "left" },
  { id: "stock", header: "Stock", align: "left", hideBelow: "md" },
  { id: "actions", header: "Actions", align: "right" },
];

function ProductsPageSkeleton() {
  return (
    <div className="flex-1 space-y-6 p-6 animate-pulse">
      <div className="h-8 w-48 bg-slate-200 rounded" />
      <div className="h-10 w-full bg-slate-200 rounded" />
      <div className="h-64 w-full bg-slate-200 rounded" />
    </div>
  );
}

async function DashboardProductsContent({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const ctx = await getDashboardContext();
  if (!ctx) {
    redirect("/login");
  }

  const { q = "", status = "all" } = await searchParams;
  const supabase = await createSupabaseServer();

  let query = supabase
    .from("products")
    .select("*")
    .eq("owner_id", ctx.user.id);

  if (q.trim()) {
    query = query.ilike("name", `%${q.trim()}%`);
  }

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data: products, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading user products:", error);
  }

  // Sales + file counts, derived from authoritative paid orders (never mocked).
  const productIds = (products ?? []).map((p: { id: string }) => p.id);
  const assetCountByProduct = new Map<string, number>();
  const salesByProduct = new Map<string, { orders: number; units: number; revenue: number }>();
  if (productIds.length > 0) {
    const { data: assetRows } = await supabase
      .from("product_assets")
      .select("product_id")
      .in("product_id", productIds);
    for (const row of (assetRows ?? []) as { product_id: string }[]) {
      assetCountByProduct.set(row.product_id, (assetCountByProduct.get(row.product_id) ?? 0) + 1);
    }

    const { data: paidOrders } = await supabase
      .from("product_orders")
      .select("product_id, quantity, total_amount")
      .eq("status", "paid")
      .in("product_id", productIds);
    for (const o of (paidOrders ?? []) as { product_id: string; quantity: number; total_amount: number }[]) {
      const prev = salesByProduct.get(o.product_id) ?? { orders: 0, units: 0, revenue: 0 };
      salesByProduct.set(o.product_id, {
        orders: prev.orders + 1,
        units: prev.units + (o.quantity ?? 0),
        revenue: prev.revenue + Number(o.total_amount ?? 0),
      });
    }
  }

  const totalRevenue = [...salesByProduct.values()].reduce((sum, s) => sum + s.revenue, 0);
  const totalPaidOrders = [...salesByProduct.values()].reduce((sum, s) => sum + s.orders, 0);
  const totalUnits = [...salesByProduct.values()].reduce((sum, s) => sum + s.units, 0);

  async function handleDelete(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    if (id) {
      await deleteProduct(id);
      revalidatePath("/dashboard/products");
    }
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            My Products
          </h1>
          <p className="text-sm font-semibold text-slate-500">
            Manage your product listings, pricing, inventory, and digital files.
          </p>
        </div>
        <Link
          href="/dashboard/products/new"
          className="inline-flex items-center justify-center rounded-xl bg-orange-600 px-4 py-2.5 text-center text-sm font-black text-white hover:bg-orange-700 transition"
        >
          + Add Product
        </Link>
      </div>

      <StickyTableToolbar>
        <form method="GET" action="/dashboard/products" className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search products by name..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
            />
          </div>
          <div className="w-full sm:w-48">
            <select
              name="status"
              defaultValue={status}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="pending_review">Pending Review</option>
              <option value="active">Active</option>
              <option value="out_of_stock">Out of Stock</option>
              <option value="rejected">Rejected</option>
              <option value="archived">Archived</option>
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

      {/* Revenue summary — real paid-order totals only. */}
      {products && products.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 rounded-2xl border border-slate-100 bg-white px-6 py-4 shadow-sm shadow-slate-100/5">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Gross sales</p>
            <p className="text-2xl font-black text-slate-900">
              {totalRevenue.toLocaleString("en-US", { style: "currency", currency: "USD" })}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Paid orders</p>
            <p className="text-lg font-black text-slate-700">{totalPaidOrders}</p>
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Units sold</p>
            <p className="text-lg font-black text-slate-700">{totalUnits}</p>
          </div>
        </div>
      )}

      {/* Main List */}
      {!products || products.length === 0 ? (        <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-100 bg-white p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 mb-4">
            <ShoppingBag className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No products yet</h3>
          <p className="mt-1 text-sm font-semibold text-slate-500 max-w-sm">
            List a product to start selling on the platform.
          </p>
          <Link
            href="/dashboard/products/new"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white hover:bg-orange-700 transition"
          >
            Get Started
          </Link>
        </div>
      ) : (
        <ResponsiveDataTable columns={PRODUCT_COLUMNS}>
          {products.map((product) => {
            const s = salesByProduct.get(product.id);
            const isDigital = isDigitalProductType(product.product_type);
            const assetCount = assetCountByProduct.get(product.id) ?? 0;

            return (
              <ResponsiveDataRow
                key={product.id}
                id={product.id}
                desktopCells={[
                  <div key="product" className="flex items-center gap-3">
                    {(product.cover_image_url || product.images?.[0]) ? (
                      <img
                        src={product.cover_image_url || product.images[0]}
                        alt={product.name}
                        className="h-10 w-10 rounded-xl object-cover border border-slate-100"
                      />
                    ) : (
                      <LocalBrandedPlaceholder
                        variant="general"
                        title={product.name}
                        initials={product.name.slice(0, 2).toUpperCase()}
                        className="h-10 w-10 rounded-xl from-slate-100 to-slate-100 text-base text-slate-500"
                      />
                    )}
                    <div>
                      <div className="font-bold text-slate-900">{product.name}</div>
                    </div>
                  </div>,

                  <div key="type">
                    {isDigital ? (
                      <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs font-bold text-orange-700">
                        {(PRODUCT_TYPE_LABELS as Record<string, string>)[product.product_type] || "Digital"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-500">
                        Physical
                      </span>
                    )}
                  </div>,

                  <div key="price_type">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${priceTypeBadge[product.price_type] || "bg-slate-100"}`}>
                      {product.price_type === "one_time" ? "One-time" : "Subscription"}
                    </span>
                  </div>,

                  <div key="status">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${statusBadge[product.status] || "bg-slate-100"}`}>
                      {product.status.replace("_", " ")}
                    </span>
                  </div>,

                  <div key="files" className="text-xs">
                    {isDigital ? (
                      <span className="font-bold text-slate-700">{assetCount} file(s)</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </div>,

                  <div key="sales" className="text-xs">
                    {!s ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className="font-bold text-slate-700">
                        {s.orders} order{s.orders === 1 ? "" : "s"} ·{" "}
                        {s.revenue.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
                      </span>
                    )}
                  </div>,

                  <div key="stock" className="text-xs text-slate-500">
                    {isDigital ? (
                      <span className="text-slate-400">Digital</span>
                    ) : product.stock_quantity === null ? (
                      <span className="text-slate-400">Unlimited</span>
                    ) : (
                      <span className="font-bold text-slate-700">{product.stock_quantity}</span>
                    )}
                  </div>,

                  <div key="actions" className="text-right">
                    <ProductRowActions
                      product={product}
                      onDelete={handleDelete}
                    />
                  </div>,
                ]}
                identity={
                  <div className="flex items-center gap-3">
                    {(product.cover_image_url || product.images?.[0]) ? (
                      <img
                        src={product.cover_image_url || product.images[0]}
                        alt={product.name}
                        className="h-8 w-8 rounded-lg object-cover border border-slate-100 shrink-0"
                      />
                    ) : (
                      <LocalBrandedPlaceholder
                        variant="general"
                        title={product.name}
                        initials={product.name.slice(0, 2).toUpperCase()}
                        className="h-8 w-8 rounded-lg from-slate-100 to-slate-100 text-xs text-slate-500 shrink-0"
                      />
                    )}
                    <span className="font-bold text-slate-900 truncate">{product.name}</span>
                  </div>
                }
                primaryValue={
                  s && s.revenue > 0 ? (
                    <span className="text-xs font-bold text-emerald-700 tabular-nums">
                      {s.revenue.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-slate-600">
                      {product.price !== null && product.price !== undefined ? `$${product.price}` : "—"}
                    </span>
                  )
                }
                state={
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusBadge[product.status] || "bg-slate-100"}`}>
                    {product.status.replace("_", " ")}
                  </span>
                }
                secondary={[
                  isDigital ? (
                    <span key="type" className="text-orange-700 font-bold">
                      {(PRODUCT_TYPE_LABELS as Record<string, string>)[product.product_type] || "Digital"}
                    </span>
                  ) : (
                    <span key="type" className="text-slate-500">Physical</span>
                  ),
                  <span key="price_type" className="capitalize">{product.price_type === "one_time" ? "One-time" : "Subscription"}</span>,
                  isDigital ? (
                    <span key="files">{assetCount} file(s)</span>
                  ) : (
                    <span key="stock">{product.stock_quantity === null ? "Unlimited" : `${product.stock_quantity} in stock`}</span>
                  ),
                ]}
                actions={
                  <ProductRowActions
                    product={product}
                    onDelete={handleDelete}
                  />
                }
                expandedDetails={
                  <div className="space-y-2 text-xs pt-1">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-400 font-medium">Sales: </span>
                        <span className="font-bold text-slate-700">
                          {s ? `${s.orders} order${s.orders === 1 ? "" : "s"} (${s.units} units)` : "0 orders"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Files: </span>
                        <span className="font-bold text-slate-700">
                          {isDigital ? `${assetCount} file(s)` : "Physical product"}
                        </span>
                      </div>
                    </div>
                  </div>
                }
              />
            );
          })}
        </ResponsiveDataTable>
      )}
    </div>
  );
}

export default function DashboardProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  return (
    <Suspense fallback={<ProductsPageSkeleton />}>
      <DashboardProductsContent searchParams={searchParams} />
    </Suspense>
  );
}
