import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { requireTenantContext } from "@/lib/tenant-context";
import { checkTenantAccess } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { listBusinessTables } from "@/lib/actions/table-management";
import { TableManagerClient } from "@/components/dashboard/tables/TableManagerClient";
import { resolveStorefrontCurrency } from "@/lib/website-v2-theme";
import { isOnlinePaymentCurrencySupported } from "@/lib/storefront-features";

export default async function TablesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: organizerId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  try {
    await requireTenantContext(user.id, organizerId, [
      "owner",
      "admin",
      "manager",
      "editor",
      "finance",
      "viewer",
    ]);
  } catch {
    return notFound();
  }

  const access = await checkTenantAccess(user.id, organizerId, [
    "owner",
    "admin",
    "manager",
    "editor",
    "finance",
    "viewer",
  ]);

  const canManage = access.role ? ["owner", "admin", "manager"].includes(access.role) : false;
  const canDelete = access.role ? ["owner", "admin"].includes(access.role) : false;

  const admin = createSupabaseAdmin();
  const { data: business } = await admin
    .from("businesses")
    .select("id, name, slug, country, table_ordering_mode")
    .eq("organizer_id", organizerId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!business) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">Tables & QR Codes</h1>
        <p className="text-sm text-zinc-500">
          No business profile is currently linked to this organization workspace.
        </p>
      </div>
    );
  }

  const { data: website } = await admin
    .from("tenant_websites")
    .select("metadata")
    .eq("tenant_id", organizerId)
    .eq("slug", business.slug)
    .maybeSingle();
  const storefrontCurrency = resolveStorefrontCurrency(website?.metadata, business.country ?? null);
  const onlinePaymentsAvailable = isOnlinePaymentCurrencySupported(storefrontCurrency) && Boolean(process.env.STRIPE_SECRET_KEY);

  const result = await listBusinessTables(business.id);

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Tables & QR Codes</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Manage your dining tables, ordering modes, and printable short redirect QR codes.
          </p>
        </div>
      </div>

      <TableManagerClient
        businessId={business.id}
        businessName={business.name}
        businessSlug={business.slug}
        initialTables={result.tables || []}
        initialMenuQr={result.menuQr}
        initialOrderingMode={result.orderingMode || "order_pay_later"}
        onlinePaymentsAvailable={onlinePaymentsAvailable}
        canManage={canManage}
        canDelete={canDelete}
      />
    </div>
  );
}
