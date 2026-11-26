"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { IconArrowLeft as ArrowLeft, IconPlus as Plus } from "@tabler/icons-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { ShiftRow } from "@/lib/actions/staff-shifts";
import ShiftDialog, { type RosterBranch, type RosterStaff } from "./ShiftDialog";

type Target = { kind: "edit"; shift: ShiftRow } | { kind: "add"; staffId: string; date: string };

function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export default function RosterClient({
  organizerId,
  businessId,
  weekStart,
  prevWeek,
  nextWeek,
  thisWeek,
  days,
  staff,
  branches,
  branchFilter,
  initialShifts,
  canWriteAll,
  writableBranchIds,
}: {
  organizerId: string;
  businessId: string;
  weekStart: string;
  prevWeek: string;
  nextWeek: string;
  thisWeek: string;
  days: string[];
  staff: RosterStaff[];
  branches: RosterBranch[];
  branchFilter: string;
  initialShifts: ShiftRow[];
  canWriteAll: boolean;
  writableBranchIds: string[];
}) {
  const t = useTranslations("Workforce");
  const [shifts, setShifts] = useState<ShiftRow[]>(initialShifts);
  const [target, setTarget] = useState<Target | null>(null);
  const canWrite = canWriteAll || writableBranchIds.length > 0;
  const canEditShift = (s: ShiftRow) => canWriteAll || (s.branch_id !== null && writableBranchIds.includes(s.branch_id));

  const base = `/dashboard/org/${organizerId}/workforce/roster`;
  const href = (week: string, branch: string) => {
    const q = new URLSearchParams({ business: businessId, week });
    if (branch) q.set("branch", branch);
    return `${base}?${q.toString()}`;
  };

  function handleSaved(row: ShiftRow) {
    setShifts((prev) => (prev.some((s) => s.id === row.id) ? prev.map((s) => (s.id === row.id ? row : s)) : [...prev, row]));
  }

  const dialogKey = target ? (target.kind === "edit" ? target.shift.id : `${target.staffId}-${target.date}`) : "closed";

  return (
    <div className="space-y-6">
      <Link
        href={`/dashboard/org/${organizerId}/workforce?business=${businessId}`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("rsBackToWorkforce")}
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-black">{t("rsTitle")}</h1>
          <p className="text-sm text-zinc-500">{t("rsWeekOf", { date: dayLabel(weekStart) })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm"><Link href={href(prevWeek, branchFilter)}>{t("rsPrevWeek")}</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href={href(thisWeek, branchFilter)}>{t("rsThisWeek")}</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href={href(nextWeek, branchFilter)}>{t("rsNextWeek")}</Link></Button>
        </div>
      </header>

      <form method="get" action={base} className="flex max-w-xs items-center gap-2">
        <input type="hidden" name="business" value={businessId} />
        <input type="hidden" name="week" value={weekStart} />
        <Select name="branch" defaultValue={branchFilter} className="min-w-0 flex-1 pr-8" aria-label={t("rsBranchLabel")}>
          <option value="">{t("rsAllBranches")}</option>
          {branches.filter((b) => b.status === "active").map((b) => (
            <option key={b.id} value={b.id}>{b.label}</option>
          ))}
        </Select>
        <Button type="submit" variant="outline" size="sm">{t("rsApplyFilter")}</Button>
      </form>

      {staff.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("rsNoStaff")}</p>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[56rem] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="sticky left-0 bg-white p-3 font-semibold text-zinc-500">{t("rsStaffColumn")}</th>
                  {days.map((d) => (
                    <th key={d} className="p-3 font-semibold text-zinc-500">{dayLabel(d)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staff.map((person) => (
                  <tr key={person.id} className="border-b border-zinc-50 align-top">
                    <td className="sticky left-0 bg-white p-3 text-sm font-semibold text-zinc-900">{person.full_name}</td>
                    {days.map((d) => {
                      const cell = shifts.filter((s) => s.staff_member_id === person.id && s.shift_date === d);
                      return (
                        <td key={d} className="space-y-1 p-2">
                          {cell.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              disabled={!canEditShift(s)}
                              onClick={() => setTarget({ kind: "edit", shift: s })}
                              className={`block w-full rounded-lg border px-2 py-1 text-left ${
                                s.status === "cancelled"
                                  ? "border-zinc-200 bg-zinc-50 text-zinc-400 line-through"
                                  : "border-orange-200 bg-orange-50 text-orange-800"
                              }`}
                            >
                              {s.starts_at}–{s.ends_at}
                              {s.status === "cancelled" && (
                                <Badge variant="neutral" className="ml-1 no-underline">{t("rsCancelledBadge")}</Badge>
                              )}
                            </button>
                          ))}
                          {canWrite && (
                            <button
                              type="button"
                              aria-label={t("rsAddShift")}
                              onClick={() => setTarget({ kind: "add", staffId: person.id, date: d })}
                              className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {canWrite && target && (
        <ShiftDialog
          key={dialogKey}
          open
          onOpenChange={(o) => { if (!o) setTarget(null); }}
          businessId={businessId}
          staff={staff}
          branches={branches}
          editing={target.kind === "edit" ? target.shift : null}
          defaultStaffId={target.kind === "add" ? target.staffId : null}
          defaultDate={target.kind === "add" ? target.date : null}
          defaultBranchId={branchFilter || null}
          writableBranchIds={canWriteAll ? null : writableBranchIds}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
