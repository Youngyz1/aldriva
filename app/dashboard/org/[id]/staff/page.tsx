import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import { isOrganizerDashboardBusiness } from "@/lib/organizer-dashboard-classifier";
import { resolveActiveBusiness, getActiveBusinessCookieName } from "@/lib/active-business";
import { assertCanAccessBusinessStaffArea } from "@/lib/entity-authz";
import { listStaffMembers } from "@/lib/actions/staff-members";
import StaffClient from "@/app/dashboard/businesses/[id]/staff/StaffClient";

export default async function OrgStaffPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id: organizerId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Admin client here matches fleet/page.tsx's own active-business resolution
  // step (lines 53-59 there) -- resolving which business is "active" for this
  // organizer, not staff data. Staff reads below use the RLS client.
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
          <h1 className="text-xl font-black">Staff</h1>
        </header>
        <p className="text-sm text-zinc-500">No business yet. Create a business to manage staff.</p>
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

  const auth = await assertCanAccessBusinessStaffArea(activeBusiness.id);
  if (!auth.ok) return notFound();

  // business_branches has a public SELECT policy (no auth required), so this
  // is safe for both organizer-level and staff-scope users via the RLS client.
  const supabase = await createSupabaseServer();
  const { data: branches } = await supabase
    .from("business_branches")
    .select("id, label")
    .eq("business_id", activeBusiness.id)
    .order("label", { ascending: true });

  const staffResult = await listStaffMembers(activeBusiness.id);

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-zinc-500">{activeBusiness.name}</p>
      <StaffClient
        businessId={activeBusiness.id}
        branches={branches ?? []}
        initialStaff={staffResult.success ? staffResult.data : []}
        initialError={staffResult.success ? null : staffResult.error}
      />
    </div>
  );
}
