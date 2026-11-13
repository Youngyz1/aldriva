import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { checkTenantAccess, type EntityRole } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isOrganizerDashboardBusiness } from "@/lib/organizer-dashboard-classifier";
import { resolveActiveBusiness, getActiveBusinessCookieName } from "@/lib/active-business";
import { getRentalSettings } from "@/lib/actions/rental-settings";
import { RentalSettingsClient } from "@/components/dashboard/rentals/RentalSettingsClient";

const ALLOWED_ROLES: EntityRole[] = [
  "owner",
  "admin",
  "manager",
  "editor",
  "finance",
  "viewer",
];

export default async function RentalSettingsPage({
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
    ? ["owner", "admin", "manager"].includes(access.role)
    : false;

  const supabase = createSupabaseAdmin();

  // 1. Resolve active business
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
    return notFound();
  }

  const { settings } = await getRentalSettings(organizerId, activeBusiness.id);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <RentalSettingsClient
        organizerId={organizerId}
        businessId={activeBusiness.id}
        initialSettings={settings}
        canManage={canManage}
      />
    </div>
  );
}
