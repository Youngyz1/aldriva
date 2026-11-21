import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isOrganizerDashboardBusiness } from "@/lib/organizer-dashboard-classifier";
import { resolveActiveBusiness, getActiveBusinessCookieName } from "@/lib/active-business";
import { assertCanAccessBusinessStaffArea } from "@/lib/entity-authz";
import { listStaffRoles, listStaffPermissions } from "@/lib/actions/staff-roles";
import { getRolesAccess } from "@/lib/staff/roles-access-server";
import RolesClient from "@/components/staff/RolesClient";

export default async function OrgRolesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id: organizerId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Admin client here only resolves which business is "active" for this
  // organizer -- same active-business step org/[id]/branches/page.tsx and
  // org/[id]/staff/page.tsx already use. No staff/role data is read with it.
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
          <h1 className="text-xl font-black">Roles & Permissions</h1>
        </header>
        <p className="text-sm text-zinc-500">No business yet. Create a business to manage roles.</p>
      </div>
    );
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const queryBusinessId = typeof resolvedSearchParams.business === "string" ? resolvedSearchParams.business : null;
  const cookieStore = await cookies();
  const cookieBusinessId = cookieStore.get(getActiveBusinessCookieName(organizerId))?.value ?? null;
  const activeBusiness = resolveActiveBusiness(eligibleBusinesses, {
    searchParamBusinessId: queryBusinessId,
    cookieBusinessId,
  });
  if (!activeBusiness) return notFound();

  // Reachability only (organizer-level or active staff_members row) --
  // same admission as the Staff and Workforce Overview pages. Write
  // actions in lib/actions/staff-roles.ts re-gate themselves with the
  // narrower assertCanManageBusiness for anything that mutates a role.
  const auth = await assertCanAccessBusinessStaffArea(activeBusiness.id);
  if (!auth.ok) return notFound();

  // Same rule as the database (256/257): see lib/staff/roles-access.ts.
  const access = await getRolesAccess(activeBusiness.id, auth.scope === "organizer");
  if (!access.canView) return notFound();

  const [rolesResult, permissionsResult] = await Promise.all([
    listStaffRoles(activeBusiness.id),
    listStaffPermissions(),
  ]);

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-zinc-500">{activeBusiness.name}</p>
      <RolesClient
        businessId={activeBusiness.id}
        initialRoles={rolesResult.success ? rolesResult.data : []}
        initialError={rolesResult.success ? null : rolesResult.error}
        permissions={permissionsResult.success ? permissionsResult.data : []}
        canManage={access.canManage}
      />
    </div>
  );
}
