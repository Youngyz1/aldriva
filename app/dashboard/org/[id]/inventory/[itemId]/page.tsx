import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import { isOrganizerDashboardBusiness } from "@/lib/organizer-dashboard-classifier";
import { resolveActiveBusiness, getActiveBusinessCookieName } from "@/lib/active-business";
import { assertCanAccessBusinessStaffArea } from "@/lib/entity-authz";
import { getInventoryItemDetail } from "@/lib/actions/inventory";
import ItemDetailClient from "./ItemDetailClient";

export default async function OrgInventoryItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; itemId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id: organizerId, itemId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const admin = createSupabaseAdmin();
  const { data: businesses } = await admin
    .from("businesses")
    .select("id, name, slug, status, industry, category, business_type, offerings, logo, country, created_at")
    .eq("organizer_id", organizerId);
  const eligible = (businesses ?? []).filter(isOrganizerDashboardBusiness);
  if (eligible.length === 0) return notFound();

  const sp = searchParams ? await searchParams : {};
  const cookieStore = await cookies();
  const activeBusiness = resolveActiveBusiness(eligible, {
    searchParamBusinessId: typeof sp.business === "string" ? sp.business : null,
    cookieBusinessId: cookieStore.get(getActiveBusinessCookieName(organizerId))?.value ?? null,
  });
  if (!activeBusiness) return notFound();

  const auth = await assertCanAccessBusinessStaffArea(activeBusiness.id);
  if (!auth.ok) return notFound();

  const detail = await getInventoryItemDetail(activeBusiness.id, itemId);
  if (!detail.success) return notFound();
  const { item, locations, balances, movements } = detail.data;

  const supabase = await createSupabaseServer();
  const catalogRes = await supabase.rpc("inventory_can_manage", {
    p_business_id: activeBusiness.id,
    p_branch_id: null,
  });
  const canManageCatalog = !catalogRes.error && catalogRes.data === true;

  const activeLocations = locations.filter((l) => l.status === "active");
  let manageableLocationIds: string[];
  if (canManageCatalog) {
    manageableLocationIds = activeLocations.map((l) => l.id);
  } else {
    const checks = await Promise.all(
      activeLocations.map(async (l) => {
        const res = await supabase.rpc("inventory_can_manage", {
          p_business_id: activeBusiness.id,
          p_branch_id: l.branch_id,
        });
        return !res.error && res.data === true ? l.id : null;
      })
    );
    manageableLocationIds = checks.filter((id): id is string => id !== null);
  }

  return (
    <ItemDetailClient
      organizerId={organizerId}
      businessId={activeBusiness.id}
      businessName={activeBusiness.name}
      item={item}
      locations={locations}
      balances={balances}
      movements={movements}
      canManageCatalog={canManageCatalog}
      manageableLocationIds={manageableLocationIds}
    />
  );
}