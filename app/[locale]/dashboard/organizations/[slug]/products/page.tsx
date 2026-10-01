import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Package, Plus } from "lucide-react";
import { ResponsiveDataTable } from "@/components/dashboard/ResponsiveDataTable";
import { ResponsiveDataRow } from "@/components/dashboard/ResponsiveDataRow";

export default async function OrgProductsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = createSupabaseAdmin();

  const { data: org } = await supabase
    .from("organizers")
    .select("id, user_id")
    .eq("slug", slug)
    .maybeSingle();

  // Defense-in-depth (see dashboard/org/[id]/products): never let a
  // user-controlled slug select another tenant's products.
  if (!org || org.user_id !== user.id) redirect("/dashboard");

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
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <ResponsiveDataTable
            columns={[
              { id: "product", header: "Product" },
              { id: "type", header: "Type" },
              { id: "stock", header: "Stock", hideBelow: "md" },
              { id: "status", header: "Status" },
              { id: "actions", header: "", align: "right" },
            ]}
          >
            {(products ?? []).map((p) => {
              const statusBadge = (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  p.status === "active" ? "bg-emerald-100 text-emerald-700" :
                  p.status === "out_of_stock" ? "bg-yellow-100 text-yellow-700" :
                  "bg-zinc-100 text-zinc-600"
                }`}>{p.status}</span>
              );

              return (
                <ResponsiveDataRow
                  key={p.id}
                  id={p.id}
                  desktopCells={[
                    <span key="name" className="font-bold text-zinc-900 block">{p.name}</span>,
                    <span key="type" className="capitalize text-zinc-600 block">{p.price_type?.replace("_", " ")}</span>,
                    <span key="stock" className="text-zinc-600 block">{p.stock_quantity === null ? "Unlimited" : p.stock_quantity}</span>,
                    <div key="status">{statusBadge}</div>,
                    <div key="actions" className="text-right">
                      <Link href={`/dashboard/products/${p.id}/edit`} className="text-xs font-bold text-orange-600 hover:underline">Edit</Link>
                    </div>,
                  ]}
                  identity={<span className="font-bold text-zinc-950 text-left line-clamp-1">{p.name}</span>}
                  state={statusBadge}
                  secondary={[p.price_type?.replace("_", " "), p.stock_quantity === null ? "Unlimited stock" : `${p.stock_quantity} in stock`]}
                  actions={<Link href={`/dashboard/products/${p.id}/edit`} className="text-xs font-bold text-orange-600 hover:underline">Edit</Link>}
                  expandedDetails={
                    <div className="space-y-1 text-xs text-zinc-600 py-1">
                      <div><span className="font-bold text-zinc-500">Stock:</span> {p.stock_quantity === null ? "Unlimited" : p.stock_quantity}</div>
                      <div><span className="font-bold text-zinc-500">Price Type:</span> {p.price_type?.replace("_", " ")}</div>
                    </div>
                  }
                />
              );
            })}
          </ResponsiveDataTable>
        </div>
      )}
    </div>
  );
}
