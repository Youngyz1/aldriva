import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { checkTenantAccess } from "@/lib/entity-auth";
import { getKitchenManagementData } from "@/lib/actions/kitchen-management";
import { getCourierManagementData } from "@/lib/actions/courier-management";
import { KitchenManagementClient } from "@/components/dashboard/kitchen/KitchenManagementClient";

const MANAGE_ROLES = ["owner", "admin", "manager"] as const;

export default async function KitchenManagementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizerId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Matches updateOrderStatus: owner, admin, or manager on this organizer.
  const access = await checkTenantAccess(user.id, organizerId, [...MANAGE_ROLES]);
  if (!access.hasAccess) return notFound();

  const [result, courierResult] = await Promise.all([
    getKitchenManagementData(organizerId),
    getCourierManagementData(organizerId),
  ]);
  if (!result.ok && result.error === "forbidden") return notFound();
  return (
    <KitchenManagementClient
      organizerId={organizerId}
      businesses={result.ok ? result.businesses : []}
      courierBusinesses={courierResult.ok ? courierResult.businesses : []}
      unavailable={!result.ok && result.error === "unavailable"}
    />
  );
}
