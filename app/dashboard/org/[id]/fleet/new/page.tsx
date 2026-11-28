/**
 * app/dashboard/org/[id]/fleet/new/page.tsx
 *
 * Register New Fleet Vehicle.
 * Documentation: docs/design/rental/architecture.md §4 (Slice 1)
 */

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { IconCar as Car, IconPlus as Plus, IconArrowLeft as ArrowLeft } from "@tabler/icons-react";
import { getCurrentUser } from "@/lib/auth";
import { checkTenantAccess, type EntityRole } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isOrganizerDashboardBusiness } from "@/lib/organizer-dashboard-classifier";
import { resolveActiveBusiness, getActiveBusinessCookieName } from "@/lib/active-business";
import { listVehicleCategories } from "@/lib/actions/rental-categories";
import { VehicleForm } from "@/components/dashboard/fleet/VehicleForm";

const ALLOWED_ROLES: EntityRole[] = ["owner", "admin", "manager", "editor"];

export default async function NewVehiclePage({
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

  // 2. Fetch categories and branches
  const [categoriesRes, { data: branchRows }] = await Promise.all([
    listVehicleCategories(organizerId, activeBusiness.id),
    supabase
      .from("business_branches")
      .select("id, label, address")
      .eq("business_id", activeBusiness.id)
      .eq("status", "active"),
  ]);

  const categories = categoriesRes.data;
  const branches = branchRows || [];

  if (categories.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <Link
            href={`/dashboard/org/${organizerId}/fleet`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Fleet Directory
          </Link>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-8 sm:p-12 text-center">
          <Car className="mx-auto h-12 w-12 text-zinc-300" />
          <h2 className="mt-4 text-base font-bold text-zinc-900">
            A rate category is required before registering vehicles
          </h2>
          <p className="mx-auto mt-2 max-w-md text-xs text-zinc-500 sm:text-sm">
            Vehicles must belong to a rate category (e.g. Compact SUV, Economy Sedan) so daily rental rates, deposits, and specifications can be linked.
          </p>
          <div className="mt-6">
            <Link
              href={`/dashboard/org/${organizerId}/fleet/categories`}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-orange-700 px-5 text-xs font-bold text-white hover:bg-orange-800"
            >
              <Plus className="h-4 w-4" />
              Create Rate Category
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <VehicleForm
      organizerId={organizerId}
      businessId={activeBusiness.id}
      categories={categories}
      branches={branches}
    />
  );
}
