import { listStaffRoles, listStaffPermissions } from "@/lib/actions/staff-roles";
import RolesClient from "@/components/staff/RolesClient";

// Shared body of the Roles screen. Callers (org/[id]/roles and
// businesses/[id]/roles) are responsible for the access gate and pass the
// resolved canManage; writes re-gate themselves in lib/actions/staff-roles.ts.
export default async function RolesPageBody({
  businessId,
  businessName,
  canManage,
}: {
  businessId: string;
  businessName?: string;
  canManage: boolean;
}) {
  const [rolesResult, permissionsResult] = await Promise.all([
    listStaffRoles(businessId),
    listStaffPermissions(),
  ]);

  return (
    <div className="space-y-1">
      {businessName ? (
        <p className="text-xs font-semibold text-zinc-500">{businessName}</p>
      ) : null}
      <RolesClient
        businessId={businessId}
        initialRoles={rolesResult.success ? rolesResult.data : []}
        initialError={rolesResult.success ? null : rolesResult.error}
        permissions={permissionsResult.success ? permissionsResult.data : []}
        canManage={canManage}
      />
    </div>
  );
}
