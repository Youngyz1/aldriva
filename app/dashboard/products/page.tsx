import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext } from "@/lib/dashboard-context";
import { createSupabaseServer } from "@/lib/supabase-server";
import { deleteProduct } from "@/lib/actions/products";
import { revalidatePath } from "next/cache";
import ProductRowActions from "./ProductRowActions";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

const priceTypeBadge: Record<string, string> = {
  one_time: "bg-blue-50 text-blue-700 border-blue-200",
  subscription: "bg-purple-50 text-purple-700 border-purple-200",
};

const statusBadge: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  out_of_stock: "bg-amber-50 text-amber-700 border-amber-200",
  archived: "bg-slate-100 text-slate-600 border-slate-200",
};

export default async function DashboardProductsPage({
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
            Manage your product listings, pricing, and stock.
          </p>
        </div>
        <Link
          href="/dashboard/products/new"
          className="inline-flex items-center justify-center rounded-xl bg-orange-600 px-4 py-2.5 text-center text-sm font-black text-white hover:bg-orange-700 transition"
        >
          + Add Product
        </Link>
      </div>

      {/* Toolbar / Filters */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-100/5">
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
              <option value="active">Active</option>
              <option value="out_of_stock">Out of Stock</option>
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
      </div>

      {/* Main List */}
      {!products || products.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-100 bg-white p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 mb-4">
            🛍️
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
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm shadow-slate-100/5">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm text-slate-500">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <tr>
                  <th scope="col" className="px-6 py-4">Product</th>
                  <th scope="col" className="px-6 py-4">Price Type</th>
                  <th scope="col" className="px-6 py-4">Status</th>
                  <th scope="col" className="px-6 py-4">Stock</th>
                  <th scope="col" className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {product.images?.[0] ? (
                          <img
                            src={product.images[0]}
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
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${priceTypeBadge[product.price_type] || "bg-slate-100"}`}>
                        {product.price_type === "one_time" ? "One-time" : "Subscription"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${statusBadge[product.status] || "bg-slate-100"}`}>
                        {product.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {product.stock_quantity === null ? (
                        <span className="text-slate-400">Unlimited</span>
                      ) : (
                        <span className="font-bold text-slate-700">{product.stock_quantity}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <ProductRowActions
                        product={product}
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
