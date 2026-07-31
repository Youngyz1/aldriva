import { createSupabaseAdmin } from "@/lib/supabase-admin";
import Link from "next/link";
import { Package, Plus } from "lucide-react";

export default async function OrgProductsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createSupabaseAdmin();

  const { data: org } = await supabase
    .from("organizers")
    .select("id, user_id")
    .eq("slug", slug)
    .maybeSingle();

  const { data: products } = org
    ? await supabase
        .from("products")
        .select("id, name, slug, status, price_type, stock_quantity, created_at")
        .eq("owner_id", org.user_id)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-orange-600">Organization</p>
          <h1 className="mt-1 text-2xl font-black">Products</h1>
        </div>
        <Link
          href="/dashboard/products/new"
          className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-orange-700"
        >
          <Plus className="h-4 w-4" /> New Product
        </Link>
      </div>

      {(products ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
          <Package className="mb-3 h-10 w-10 text-zinc-300" />
          <p className="font-black text-zinc-900">No products yet</p>
          <p className="mt-1 text-sm text-zinc-500">Add merchandise, digital goods, or subscriptions.</p>
          <Link href="/dashboard/products/new" className="mt-4 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white hover:bg-orange-700">
            Add Product
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wide text-zinc-500">Product</th>
                <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wide text-zinc-500">Type</th>
                <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wide text-zinc-500">Stock</th>
                <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wide text-zinc-500">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(products ?? []).map((p) => (
                <tr key={p.id} className="hover:bg-zinc-50">
                  <td className="px-5 py-4 font-bold text-zinc-900">{p.name}</td>
                  <td className="px-5 py-4 capitalize text-zinc-600">{p.price_type?.replace("_", " ")}</td>
                  <td className="px-5 py-4 text-zinc-600">{p.stock_quantity === null ? "Unlimited" : p.stock_quantity}</td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      p.status === "active" ? "bg-emerald-100 text-emerald-700" :
                      p.status === "out_of_stock" ? "bg-yellow-100 text-yellow-700" :
                      "bg-zinc-100 text-zinc-600"
                    }`}>{p.status}</span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link href={`/dashboard/products/${p.id}/edit`} className="text-xs font-bold text-orange-600 hover:underline">Edit</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
