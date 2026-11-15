import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import { isOrganizerDashboardBusiness } from "@/lib/organizer-dashboard-classifier";
import { resolveActiveBusiness, getActiveBusinessCookieName } from "@/lib/active-business";
import { assertCanAccessBusinessStaffArea } from "@/lib/entity-authz";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const EMPLOYMENT_KEY: Record<string, string> = {
  full_time: "employmentFullTime",
  part_time: "employmentPartTime",
  contract: "employmentContract",
  seasonal: "employmentSeasonal",
  volunteer: "employmentVolunteer",
};

const STATUS_KEY: Record<string, string> = {
  active: "statusActive",
  suspended: "statusSuspended",
  deactivated: "statusDeactivated",
};

function StatCard({ label, value, variant }: { label: string; value: number; variant?: "emerald" | "amber" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-semibold text-zinc-500">{label}</p>
        <p className={`text-2xl font-black ${variant === "emerald" ? "text-emerald-600" : variant === "amber" ? "text-amber-600" : "text-zinc-900"}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function BarRow({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-zinc-700">{label}</span>
        <span className="font-bold text-zinc-900">{count}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
        <div className="h-full rounded-full bg-orange-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function OrgWorkforcePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id: organizerId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Workforce");

  // Admin client here matches fleet/page.tsx's and the staff/branches
  // pages' own active-business resolution step -- resolving which business
  // is "active" for this organizer, not staff/branch data. Those reads
  // below use the RLS client.
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
          <h1 className="text-xl font-black">{t("wfTitle")}</h1>
        </header>
        <p className="text-sm text-zinc-500">{t("wfNoBusiness")}</p>
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

  const supabase = await createSupabaseServer();
  const [{ data: staffRows }, { data: branchRows }] = await Promise.all([
    supabase
      .from("staff_members")
      .select("id, full_name, status, branch_id, employment_type, created_at")
      .eq("business_id", activeBusiness.id),
    supabase.from("business_branches").select("id, label, status, is_main").eq("business_id", activeBusiness.id),
  ]);

  const staff = staffRows ?? [];
  const branches = branchRows ?? [];

  const staffBase = `/dashboard/org/${organizerId}/staff?business=${activeBusiness.id}`;
  const branchesBase = `/dashboard/org/${organizerId}/branches?business=${activeBusiness.id}`;

  if (staff.length === 0) {
    return (
      <div className="space-y-6">
        <p className="text-xs font-semibold text-zinc-500">{activeBusiness.name}</p>
        <header>
          <h1 className="text-xl font-black">{t("wfTitle")}</h1>
          <p className="text-sm text-zinc-500">{t("wfNoStaffTitle")}</p>
        </header>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <p className="text-sm text-zinc-500">{t("wfNoStaffBody")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href={staffBase}>{t("wfAddStaff")}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={branchesBase}>{t("wfAddBranch")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const total = staff.length;
  const active = staff.filter((s) => s.status === "active").length;
  const suspended = staff.filter((s) => s.status === "suspended").length;
  const noBranch = staff.filter((s) => !s.branch_id).length;
  const activeBranchCount = branches.filter((b) => b.status === "active").length;

  const countByBranch = new Map<string, number>();
  for (const s of staff) {
    if (!s.branch_id) continue;
    countByBranch.set(s.branch_id, (countByBranch.get(s.branch_id) ?? 0) + 1);
  }
  // Every active branch gets a row, including branches with zero staff --
  // the panel is a coverage view, not just a tally of non-empty branches.
  const staffPerBranch = branches
    .filter((b) => b.status === "active")
    .map((b) => ({ label: b.label, count: countByBranch.get(b.id) ?? 0, isMain: b.is_main }))
    .sort((a, b) => {
      if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
      return b.count - a.count;
    });

  const countByEmployment = new Map<string, number>();
  for (const s of staff) {
    countByEmployment.set(s.employment_type, (countByEmployment.get(s.employment_type) ?? 0) + 1);
  }
  const staffByEmployment = [...countByEmployment.entries()]
    .map(([type, count]) => ({ label: t((EMPLOYMENT_KEY[type] ?? "employmentFullTime") as any), count }))
    .sort((a, b) => b.count - a.count);

  const recentStaff = [...staff]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <p className="text-xs font-semibold text-zinc-500">{activeBusiness.name}</p>
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-black">{t("wfTitle")}</h1>
          <p className="text-sm text-zinc-500">{t("wfSubtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm">
            <Link href={staffBase}>{t("wfAddStaff")}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={branchesBase}>{t("wfAddBranch")}</Link>
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label={t("wfStatTotal")} value={total} />
        <StatCard label={t("wfStatActive")} value={active} variant="emerald" />
        <StatCard label={t("wfStatSuspended")} value={suspended} variant="amber" />
        <StatCard label={t("wfStatNoBranch")} value={noBranch} />
        <StatCard label={t("wfStatActiveBranches")} value={activeBranchCount} />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-zinc-900">{t("wfPerBranchTitle")}</h2>
        {staffPerBranch.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("wfPerBranchEmpty")}</p>
        ) : (
          <Card>
            <CardContent className="space-y-3 p-4">
              {staffPerBranch.map((row) => (
                <BarRow key={row.label} label={row.label} count={row.count} max={total} />
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-zinc-900">{t("wfByEmploymentTitle")}</h2>
        <Card>
          <CardContent className="space-y-3 p-4">
            {staffByEmployment.map((row) => (
              <BarRow key={row.label} label={row.label} count={row.count} max={total} />
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-zinc-900">{t("wfRecentTitle")}</h2>
        <div className="space-y-2">
          {recentStaff.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex items-center justify-between p-3">
                <p className="truncate text-sm font-semibold text-zinc-900">{s.full_name}</p>
                <Badge variant={s.status === "active" ? "emerald" : s.status === "suspended" ? "amber" : "neutral"}>
                  {t((STATUS_KEY[s.status] ?? "statusActive") as any)}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
