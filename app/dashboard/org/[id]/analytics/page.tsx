import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import { isOrganizerDashboardBusiness } from "@/lib/organizer-dashboard-classifier";
import { resolveActiveBusiness, getActiveBusinessCookieName } from "@/lib/active-business";
import { assertCanAccessBusinessStaffArea } from "@/lib/entity-authz";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHIFT_LIMIT = 5000;
const MAX_DAYS = 366;
type Kind = "7d" | "30d" | "month" | "custom";

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toIso(new Date(Date.UTC(y, m - 1, d + n)));
}
function isRealDate(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
function dayDiff(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}
function minutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function first(v: string | string[] | undefined): string | null {
  return typeof v === "string" ? v : null;
}

type ShiftRow = {
  id: string;
  staff_member_id: string;
  branch_id: string | null;
  shift_date: string;
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "cancelled";
};
type Agg = { minutes: number; shifts: number; cancelled: number };

export default async function OrgAnalyticsPage({
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

  const t = await getTranslations("Workforce");
  const locale = await getLocale();

  // ---- Period ----
  const todayIso = toIso(new Date());
  const rawKind = first(sp.period);
  let kind: Kind = rawKind === "30d" || rawKind === "month" || rawKind === "custom" ? rawKind : "7d";
  let from = addDays(todayIso, -6);
  let to = todayIso;
  let invalid = false;
  if (kind === "30d") from = addDays(todayIso, -29);
  else if (kind === "month") from = todayIso.slice(0, 8) + "01";
  else if (kind === "custom") {
    const f = first(sp.from);
    const e = first(sp.to);
    if (f && e && isRealDate(f) && isRealDate(e) && f <= e && dayDiff(f, e) < MAX_DAYS) {
      from = f;
      to = e;
    } else {
      invalid = true;
      kind = "7d";
    }
  }
  const totalDays = dayDiff(from, to) + 1;

  // ---- Data (session client: RLS decides what this person may see) ----
  const supabase = await createSupabaseServer();
  const { data: branchRows } = await supabase
    .from("business_branches")
    .select("id, label, status")
    .eq("business_id", activeBusiness.id)
    .order("label", { ascending: true });
  const branches = (branchRows ?? []) as { id: string; label: string; status: "active" | "archived" }[];
  const rawBranch = first(sp.branch);
  const branchFilter = rawBranch && branches.some((b) => b.id === rawBranch) ? rawBranch : "";

  let shiftQuery = supabase
    .from("staff_shifts")
    .select("id, staff_member_id, branch_id, shift_date, starts_at, ends_at, status")
    .eq("business_id", activeBusiness.id)
    .gte("shift_date", from)
    .lte("shift_date", to)
    .order("shift_date", { ascending: true })
    .limit(SHIFT_LIMIT);
  if (branchFilter) shiftQuery = shiftQuery.eq("branch_id", branchFilter);

  let staffQuery = supabase
    .from("staff_members")
    .select("id, full_name, branch_id")
    .eq("business_id", activeBusiness.id)
    .eq("status", "active");
  if (branchFilter) staffQuery = staffQuery.eq("branch_id", branchFilter);

  const [shiftRes, staffRes] = await Promise.all([shiftQuery, staffQuery]);
  const shifts = (shiftRes.data ?? []) as ShiftRow[];
  const staff = (staffRes.data ?? []) as { id: string; full_name: string; branch_id: string | null }[];
  const truncated = shifts.length >= SHIFT_LIMIT;

  // ---- Aggregation ----
  const total: Agg = { minutes: 0, shifts: 0, cancelled: 0 };
  const byBranch = new Map<string, Agg>();
  const byStaff = new Map<string, Agg>();
  const coveredDays = new Set<string>();
  const bump = (m: Map<string, Agg>, key: string, s: ShiftRow, mins: number) => {
    const a = m.get(key) ?? { minutes: 0, shifts: 0, cancelled: 0 };
    if (s.status === "cancelled") a.cancelled += 1;
    else {
      a.minutes += mins;
      a.shifts += 1;
    }
    m.set(key, a);
  };
  for (const s of shifts) {
    const mins = Math.max(0, minutes(s.ends_at) - minutes(s.starts_at));
    if (s.status === "cancelled") total.cancelled += 1;
    else {
      total.minutes += mins;
      total.shifts += 1;
      coveredDays.add(s.shift_date);
    }
    bump(byBranch, s.branch_id ?? "none", s, mins);
    bump(byStaff, s.staff_member_id, s, mins);
  }
  const uncoveredDays = Math.max(0, totalDays - coveredDays.size);
  const attempted = total.shifts + total.cancelled;
  const cancelRate = attempted === 0 ? 0 : (total.cancelled / attempted) * 100;

  const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const hours = (m: number) => `${num.format(m / 60)} h`;
  const dayFmt = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });
  };
  const staffName = new Map(staff.map((s) => [s.id, s.full_name]));
  const branchName = (id: string) =>
    id === "none" ? t("rsNoBranch") : branches.find((b) => b.id === id)?.label ?? "-";

  const branchRowsOut = [...byBranch.entries()].sort((a, b) => b[1].minutes - a[1].minutes);
  const staffRowsOut = [...byStaff.entries()].sort((a, b) => b[1].minutes - a[1].minutes);

  const cards: { label: string; value: string }[] = [
    { label: t("anScheduledHours"), value: hours(total.minutes) },
    { label: t("anShifts"), value: String(total.shifts) },
    { label: t("anCancelledShifts"), value: String(total.cancelled) },
    { label: t("anCancelRate"), value: `${num.format(cancelRate)} %` },
    { label: t("anActiveStaff"), value: String(staff.length) },
    { label: t("anUncoveredDays"), value: String(uncoveredDays) },
  ];

  const field = "rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">{t("anTitle")}</h1>
        <p className="mt-1 text-sm font-medium text-zinc-500">
          {t("anSubtitle")} {dayFmt(from)} - {dayFmt(to)}
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="business" value={activeBusiness.id} />
        <label className="flex flex-col gap-1 text-xs font-bold text-zinc-600">
          {t("anPeriodLabel")}
          <select name="period" defaultValue={kind} className={field}>
            <option value="7d">{t("anRange7d")}</option>
            <option value="30d">{t("anRange30d")}</option>
            <option value="month">{t("anRangeMonth")}</option>
            <option value="custom">{t("anRangeCustom")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-zinc-600">
          {t("anFromLabel")}
          <input type="date" name="from" defaultValue={kind === "custom" ? from : ""} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-zinc-600">
          {t("anToLabel")}
          <input type="date" name="to" defaultValue={kind === "custom" ? to : ""} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-zinc-600">
          {t("rsBranchLabel")}
          <select name="branch" defaultValue={branchFilter} className={field}>
            <option value="">{t("rsAllBranches")}</option>
            {branches
              .filter((b) => b.status === "active")
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
          </select>
        </label>
        <button type="submit" className="rounded-xl bg-zinc-950 px-5 py-2.5 text-sm font-black text-white transition hover:bg-orange-600">
          {t("rsApplyFilter")}
        </button>
      </form>

      {invalid && <p className="text-sm font-medium text-amber-700">{t("anRangeInvalid")}</p>}
      {truncated && <p className="text-sm font-medium text-amber-700">{t("anTruncated", { count: SHIFT_LIMIT })}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">{c.label}</p>
            <p className="mt-2 text-2xl font-black">{c.value}</p>
          </div>
        ))}
      </div>

      {shifts.length === 0 ? (
        <p className="text-sm font-medium text-zinc-500">{t("anNoData")}</p>
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-sm font-black">{t("anByBranch")}</h2>
            <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr>
                    <th className="px-4 py-2">{t("rsBranchLabel")}</th>
                    <th className="px-4 py-2">{t("anColHours")}</th>
                    <th className="px-4 py-2">{t("anColShifts")}</th>
                    <th className="px-4 py-2">{t("anColCancelled")}</th>
                  </tr>
                </thead>
                <tbody>
                  {branchRowsOut.map(([id, a]) => (
                    <tr key={id} className="border-t border-zinc-100">
                      <td className="px-4 py-2 font-bold">{branchName(id)}</td>
                      <td className="px-4 py-2">{hours(a.minutes)}</td>
                      <td className="px-4 py-2">{a.shifts}</td>
                      <td className="px-4 py-2">{a.cancelled}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-black">{t("anByStaff")}</h2>
            <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr>
                    <th className="px-4 py-2">{t("rsStaffColumn")}</th>
                    <th className="px-4 py-2">{t("anColHours")}</th>
                    <th className="px-4 py-2">{t("anColShifts")}</th>
                    <th className="px-4 py-2">{t("anColCancelled")}</th>
                  </tr>
                </thead>
                <tbody>
                  {staffRowsOut.map(([id, a]) => (
                    <tr key={id} className="border-t border-zinc-100">
                      <td className="px-4 py-2 font-bold">{staffName.get(id) ?? "-"}</td>
                      <td className="px-4 py-2">{hours(a.minutes)}</td>
                      <td className="px-4 py-2">{a.shifts}</td>
                      <td className="px-4 py-2">{a.cancelled}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
