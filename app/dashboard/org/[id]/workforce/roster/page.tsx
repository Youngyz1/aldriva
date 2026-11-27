import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import { isOrganizerDashboardBusiness } from "@/lib/organizer-dashboard-classifier";
import { resolveActiveBusiness, getActiveBusinessCookieName } from "@/lib/active-business";
import { assertCanAccessBusinessStaffArea } from "@/lib/entity-authz";
import { listShiftsForWeek } from "@/lib/actions/staff-shifts";
import RosterClient from "./RosterClient";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toIso(new Date(Date.UTC(y, m - 1, d + n)));
}

// Snaps any date to the Monday of its week.
function mondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

function first(v: string | string[] | undefined): string | null {
  return typeof v === "string" ? v : null;
}

export default async function RosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id: organizerId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const admin = createSupabaseAdmin();
  const { data: businesses } = await admin
    .from("businesses")
    .select("id, name, slug, status, industry, category, business_type, offerings, logo, country, created_at")
    .eq("organizer_id", organizerId);
  const eligible = (businesses ?? []).filter(isOrganizerDashboardBusiness);
  if (eligible.length === 0) return notFound();

  const sp = searchParams ? await searchParams : {};
  const cookieStore = await cookies();
  const activeBusiness = resolveActiveBusiness(eligible, {
    searchParamBusinessId: first(sp.business),
    cookieBusinessId: cookieStore.get(getActiveBusinessCookieName(organizerId))?.value ?? null,
  });
  if (!activeBusiness) return notFound();

  const auth = await assertCanAccessBusinessStaffArea(activeBusiness.id);
  if (!auth.ok) return notFound();

  const todayIso = toIso(new Date());
  const rawWeek = first(sp.week);
  const weekStart = mondayOf(rawWeek && DATE_RE.test(rawWeek) ? rawWeek : todayIso);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const supabase = await createSupabaseServer();
  const [{ data: staffRows }, { data: branchRows }, canWriteRes] = await Promise.all([
    supabase
      .from("staff_members")
      .select("id, full_name, branch_id")
      .eq("business_id", activeBusiness.id)
      .eq("status", "active")
      .order("full_name", { ascending: true }),
    supabase.from("business_branches").select("id, label, status").eq("business_id", activeBusiness.id).order("label", { ascending: true }),
    supabase.rpc("staff_has_permission", {
      p_business_id: activeBusiness.id,
      p_permission_key: "workforce.schedules.manage",
      p_branch_id: null,
    }),
  ]);
  const canWriteAll = !canWriteRes.error && canWriteRes.data === true;

  const branches = (branchRows ?? []) as { id: string; label: string; status: "active" | "archived" }[];

  // Without the business-wide key, ask the database the same two questions the
  // staff_shifts policies ask, once per active branch: branch manager of it, or
  // workforce.schedules.manage at it. Any error counts as "no" (fewer buttons).
  let writableBranchIds: string[] = [];
  if (!canWriteAll) {
    const checks = await Promise.all(
      branches
        .filter((b) => b.status === "active")
        .map(async (b) => {
          const [mgr, perm] = await Promise.all([
            supabase.rpc("is_staff_branch_manager", { p_business_id: activeBusiness.id, p_branch_id: b.id }),
            supabase.rpc("staff_has_permission", {
              p_business_id: activeBusiness.id,
              p_permission_key: "workforce.schedules.manage",
              p_branch_id: b.id,
            }),
          ]);
          return mgr.data === true || perm.data === true ? b.id : null;
        })
    );
    writableBranchIds = checks.filter((id): id is string => id !== null);
  }
  const rawBranch = first(sp.branch);
  const branchFilter = rawBranch && branches.some((b) => b.id === rawBranch) ? rawBranch : "";

  const shiftsRes = await listShiftsForWeek(activeBusiness.id, weekStart, branchFilter || null);

  return (
    <RosterClient
      organizerId={organizerId}
      businessId={activeBusiness.id}
      weekStart={weekStart}
      prevWeek={addDays(weekStart, -7)}
      nextWeek={addDays(weekStart, 7)}
      thisWeek={mondayOf(todayIso)}
      days={days}
      staff={(staffRows ?? []) as { id: string; full_name: string; branch_id: string | null }[]}
      branches={branches}
      branchFilter={branchFilter}
      initialShifts={shiftsRes.success ? shiftsRes.data : []}
      canWriteAll={canWriteAll}
      writableBranchIds={writableBranchIds}
    />
  );
}
