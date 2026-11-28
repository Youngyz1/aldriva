import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import { isOrganizerDashboardBusiness } from "@/lib/organizer-dashboard-classifier";
import { resolveActiveBusiness, getActiveBusinessCookieName } from "@/lib/active-business";
import { assertCanAccessBusinessStaffArea } from "@/lib/entity-authz";
import { listInventory } from "@/lib/actions/inventory";
import LocationsClient from "./LocationsClient";

export default async function OrgInventoryLocationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id: organizerId } = await params;
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

  const t = await getTranslations("Inventory");
  const snapshot = await listInventory(activeBusiness.id);
  if (!snapshot.success) {
    return (
      <div className="space-y-6">
        <p className="text-xs font-semibold text-zinc-500">{activeBusiness.name}</p>
        <h1 className="text-xl font-black">{t("locationsTitle")}</h1>
        <p className="text-sm font-semibold text-red-700">{t("error")}</p>
      </div>
    );
  }
  const { locations, balances } = snapshot.data;

  // Branch names for the link dropdown: read after the gate, scoped to this business.
  const { data: branchRows } = await admin
    .from("business_branches")
    .select("id, label")
    .eq("business_id", activeBusiness.id)
    .order("label", { ascending: true });
  const branches = ((branchRows ?? []) as { id: string; label: string | null }[]).map((b) => ({
    id: b.id,
    label: b.label ?? "-",
  }));

  const supabase = await createSupabaseServer();
  const catalogRes = await supabase.rpc("inventory_can_manage", {
    p_business_id: activeBusiness.id,
    p_branch_id: null,
  });
  const canManageCatalog = !catalogRes.error && catalogRes.data === true;

  let manageableLocationIds: string[];
  if (canManageCatalog) {
    manageableLocationIds = locations.map((l) => l.id);
  } else {
    const checks = await Promise.all(
      locations.map(async (l) => {
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
    <LocationsClient
      organizerId={organizerId}
      businessId={activeBusiness.id}
      businessName={activeBusiness.name}
      locations={locations}
      balances={balances}
      branches={branches}
      canManageCatalog={canManageCatalog}
      manageableLocationIds={manageableLocationIds}
    />
  );
}