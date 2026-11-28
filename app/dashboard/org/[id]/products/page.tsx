import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { IconPackage as Package, IconPlus as Plus, IconTicket } from "@tabler/icons-react";
import { checkTenantAccess } from "@/lib/entity-auth";
import { listStorePromoCodes } from "@/lib/actions/promo-codes";
import { PromoCodesManager } from "@/components/dashboard/store/PromoCodesManager";

export default async function OrgProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab = "products" } = (await searchParams) ?? {};
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = createSupabaseAdmin();

  // Products are owned by user_id, so we need to resolve user_id from org id
  const { data: org } = await supabase
    .from("organizers")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();

  // Defense-in-depth: verify tenant access
  const access = await checkTenantAccess(user.id, id, [
    "owner",
    "admin",
    "manager",
    "editor",
    "finance",
  ]);
  const isPlatformAdmin = await isAdmin();

  if ((!org || org.user_id !== user.id) && !access.hasAccess && !isPlatformAdmin) {
    redirect("/dashboard");
  }

  const canManage =
    isPlatformAdmin || (access.role ? ["owner", "admin", "manager"].includes(access.role) : org?.user_id === user.id);

  const { data: products } = org
    ? await supabase
        .from("products")
        .select("id, name, slug, status, price_type, stock_quantity, created_at")
        .eq("owner_id", org.user_id)
        .order("created_at", { ascending: false })
    : { data: [] };

  // Fetch website metadata for default currency
  const { data: website } = await supabase
    .from("tenant_websites")
    .select("metadata")
    .eq("tenant_id", id)
    .maybeSingle();

  const metadata = (website?.metadata ?? {}) as Record<string, any>;
  const currency: string = metadata.storefront?.currency ?? "USD";

  // If promo tab is selected, load promo codes
  let promoCodes: any[] = [];
  if (tab === "promos") {
    const promoRes = await listStorePromoCodes(id);
    if (promoRes.success && promoRes.data) {
      promoCodes = promoRes.data;
    }
  }

  const isPromosTab = tab === "promos";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-orange-600">Store Management</p>
          <h1 className="mt-1 text-2xl font-black text-zinc-900">
            {isPromosTab ? "Store Promo Codes" : "Products"}
          </h1>
        </div>
        {!isPromosTab && canManage && (
          <Link
            href="/dashboard/products/new"
            className="flex items-center gap-2 rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-black text-white transition hover:bg-orange-800"
          >
            <Plus className="h-4 w-4" /> New Product
          </Link>
        )}
      </div>

      {/* Tabs navigation */}
      <div className="flex border-b border-zinc-200">
        <Link
          href={`/dashboard/org/${id}/products`}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-bold transition ${
            !isPromosTab
              ? "border-orange-600 text-orange-700"
              : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
          }`}
        >
          <Package className="h-4 w-4" />
          <span>Products</span>
          {(products ?? []).length > 0 && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">
              {(products ?? []).length}
            </span>
          )}
        </Link>
        <Link
          href={`/dashboard/org/${id}/products?tab=promos`}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-bold transition ${
            isPromosTab
              ? "border-orange-600 text-orange-700"
              : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
          }`}
        >
          <IconTicket className="h-4 w-4" />
          <span>Promo Codes</span>
        </Link>
      </div>

      {/* Tab content */}
      {isPromosTab ? (
        <PromoCodesManager
          organizerId={id}
          initialCodes={promoCodes}
          canManage={canManage}
          currency={currency}
        />
      ) : (products ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Package className="mb-3 h-10 w-10 text-zinc-300" />
          <p className="font-black text-zinc-900">No products yet</p>
          <p className="mt-1 text-sm text-zinc-500">Add merchandise, digital goods, or subscriptions.</p>
          {canManage && (
            <Link
              href="/dashboard/products/new"
              className="mt-4 rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-black text-white hover:bg-orange-800"
            >
              Add Product
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wide text-zinc-500">
                  Product
                </th>
                <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wide text-zinc-500">
                  Type
                </th>
                <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wide text-zinc-500">
                  Stock
                </th>
                <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wide text-zinc-500">
                  Status
                </th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(products ?? []).map((p) => (
                <tr key={p.id} className="hover:bg-zinc-50">
                  <td className="px-5 py-4 font-bold text-zinc-900">{p.name}</td>
                  <td className="px-5 py-4 capitalize text-zinc-600">
                    {p.price_type?.replace("_", " ")}
                  </td>
                  <td className="px-5 py-4 text-zinc-600">
                    {p.stock_quantity === null ? "Unlimited" : p.stock_quantity}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        p.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : p.status === "out_of_stock"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/dashboard/products/${p.id}/edit`}
                      className="text-xs font-bold text-orange-600 hover:underline"
                    >
                      Edit
                    </Link>
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
