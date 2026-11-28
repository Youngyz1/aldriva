/**
 * app/dashboard/org/[id]/fleet/[vehicleId]/page.tsx
 *
 * Edit Fleet Vehicle Details.
 * Documentation: docs/design/rental/architecture.md §4 (Slice 1)
 */

import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { checkTenantAccess, type EntityRole } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getVehicle } from "@/lib/actions/vehicles";
import { listVehicleCategories } from "@/lib/actions/rental-categories";
import { VehicleForm } from "@/components/dashboard/fleet/VehicleForm";

const ALLOWED_ROLES: EntityRole[] = ["owner", "admin", "manager", "editor"];

export default async function EditVehiclePage({
  params,
}: {
  params: Promise<{ id: string; vehicleId: string }>;
}) {
  const { id: organizerId, vehicleId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const access = await checkTenantAccess(user.id, organizerId, ALLOWED_ROLES);
  if (!access.hasAccess) return notFound();

  const supabase = createSupabaseAdmin();

  // 1. Fetch vehicle
  const vehicleRes = await getVehicle(vehicleId, organizerId);
  if (!vehicleRes.success || !vehicleRes.data) {
    return notFound();
  }
  const vehicle = vehicleRes.data;

  // 2. Fetch categories and branches
  const [categoriesRes, { data: branchRows }] = await Promise.all([
    listVehicleCategories(organizerId, vehicle.business_id),
    supabase
      .from("business_branches")
      .select("id, label, address")
      .eq("business_id", vehicle.business_id)
      .eq("status", "active"),
  ]);

  const categories = categoriesRes.data;
  const branches = branchRows || [];

  return (
    <VehicleForm
      organizerId={organizerId}
      businessId={vehicle.business_id}
      vehicle={vehicle}
      categories={categories}
      branches={branches}
    />
  );
}
