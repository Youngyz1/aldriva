import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { assertCanAccessBusinessStaffArea } from "@/lib/entity-authz";
import { getRolesAccess } from "@/lib/staff/roles-access-server";
import RolesPageBody from "@/components/staff/RolesPageBody";

// Business-scoped Roles route, reachable by staff-layer users (the org shell
// bounces them). Admission matches the Staff page; the view rule is the same
// one the database enforces (see lib/staff/roles-access.ts).
export default async function BusinessRolesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const auth = await assertCanAccessBusinessStaffArea(id);
  if (!auth.ok) return notFound();

  const access = await getRolesAccess(id, auth.scope === "organizer");
  if (!access.canView) return notFound();

  return <RolesPageBody businessId={id} canManage={access.canManage} />;
}
