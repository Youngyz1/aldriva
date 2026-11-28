/**
 * app/dashboard/org/[id]/fleet/categories/page.tsx
 *
 * Vehicle Categories & Rates Manager.
 * Documentation: docs/design/rental/architecture.md §4 (Slice 1)
 */

import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { checkTenantAccess, type EntityRole } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isOrganizerDashboardBusiness } from "@/lib/organizer-dashboard-classifier";
import { resolveActiveBusiness, getActiveBusinessCookieName } from "@/lib/active-business";
import { listVehicleCategories } from "@/lib/actions/rental-categories";
import { CategoriesManagerClient } from "@/components/dashboard/fleet/CategoriesManagerClient";

const ALLOWED_ROLES: EntityRole[] = [
  "owner",
  "admin",
  "manager",
  "editor",
  "finance",
  "viewer",
];

export default async function CategoriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id: organizerId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const access = await checkTenantAccess(user.id, organizerId, ALLOWED_ROLES);
  if (!access.hasAccess) return notFound();

  const canManage = access.role
    ? ["owner", "admin", "manager", "editor"].includes(access.role)
    : false;

  const supabase = createSupabaseAdmin();

  // 1. Resolve business
  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, name, slug, status, industry, category, business_type, offerings, logo, country, created_at")
    .eq("organizer_id", organizerId);

  const eligibleBusinesses = (businesses ?? []).filter(isOrganizerDashboardBusiness);
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const queryBusinessId =
    typeof resolvedSearchParams.business === "string"
      ? resolvedSearchParams.business
      : null;
  const cookieStore = await cookies();
  const cookieBusinessId =
    cookieStore.get(getActiveBusinessCookieName(organizerId))?.value ?? null;
  const activeBusiness = resolveActiveBusiness(eligibleBusinesses, {
    searchParamBusinessId: queryBusinessId,
    cookieBusinessId,
  });

  if (!activeBusiness) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center">
        <h2 className="text-base font-bold text-zinc-900">No active business found</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Please register a vehicle rental business profile first.
        </p>
      </div>
    );
  }

  // 2. Fetch categories
  const categoriesRes = await listVehicleCategories(organizerId, activeBusiness.id);

  return (
    <CategoriesManagerClient
      initialCategories={categoriesRes.data}
      organizerId={organizerId}
      businessId={activeBusiness.id}
      canManage={canManage}
    />
  );
}
