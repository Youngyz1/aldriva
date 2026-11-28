import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import { isOrganizerDashboardBusiness } from "@/lib/organizer-dashboard-classifier";
import { resolveActiveBusiness, getActiveBusinessCookieName } from "@/lib/active-business";
import { assertCanManageBusiness } from "@/lib/entity-authz";
import BranchesClient from "@/app/dashboard/businesses/[id]/branches/BranchesClient";

export default async function OrgBranchesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id: organizerId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Admin client here matches fleet/page.tsx's and org/[id]/staff/page.tsx's
  // own active-business resolution step -- resolving which business is
  // "active" for this organizer, not branch data.
  const admin = createSupabaseAdmin();
  const { data: businesses } = await admin
    .from("businesses")
    .select("id, name, slug, status, industry, category, business_type, offerings, logo, country, created_at")
    .eq("organizer_id", organizerId);

  const eligibleBusinesses = (businesses ?? []).filter(isOrganizerDashboardBusiness);

  if (eligibleBusinesses.length === 0) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-xl font-black">Branches</h1>
        </header>
        <p className="text-sm text-zinc-500">No business yet. Create a business to manage branches.</p>
      </div>
    );
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const queryBusinessId =
    typeof resolvedSearchParams.business === "string" ? resolvedSearchParams.business : null;
  const cookieStore = await cookies();
  const cookieBusinessId =
    cookieStore.get(getActiveBusinessCookieName(organizerId))?.value ?? null;
  const activeBusiness = resolveActiveBusiness(eligibleBusinesses, {
    searchParamBusinessId: queryBusinessId,
    cookieBusinessId,
  });

  if (!activeBusiness) return notFound();

  // Branches are organizer-level only -- unlike Staff, there is no
  // staff-scope admission here (business_branches' own "Owners can manage
  // branches" RLS policy is entity-level only).
  const auth = await assertCanManageBusiness(activeBusiness.id);
  if (!auth.ok) return notFound();

  const { data: branches } = await admin
    .from("business_branches")
    .select("*")
    .eq("business_id", activeBusiness.id)
    .order("is_main", { ascending: false })
    .order("status", { ascending: true })
    .order("created_at", { ascending: true });

  // Staff count per branch is staff data -- fetched with the RLS-respecting
  // user-session client, not the admin client used above for branches/business
  // rows (same split as app/dashboard/businesses/[id]/branches/page.tsx).
  const supabase = await createSupabaseServer();
  const { data: staffRows } = await supabase
    .from("staff_members")
    .select("branch_id")
    .eq("business_id", activeBusiness.id);
  const staffCountByBranch: Record<string, number> = {};
  for (const row of staffRows ?? []) {
    if (!row.branch_id) continue;
    staffCountByBranch[row.branch_id] = (staffCountByBranch[row.branch_id] ?? 0) + 1;
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-zinc-500">{activeBusiness.name}</p>
      <BranchesClient
        businessId={activeBusiness.id}
        initialBranches={branches ?? []}
        staffCountByBranch={staffCountByBranch}
        orgBasePath={`/dashboard/org/${organizerId}/branches`}
      />
    </div>
  );
}
