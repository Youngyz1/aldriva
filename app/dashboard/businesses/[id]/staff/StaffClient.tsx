"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import StaffAvatar from "@/components/staff/StaffAvatar";
import { deleteStaffMember, setStaffStatus, type StaffMemberRow, type StaffStatus } from "@/lib/actions/staff-members";
import StaffFormDialog from "./StaffFormDialog";

// Dynamic/runtime-determined key, same `as any` escape next-intl's own
// strict Translator type requires here as OrgDashboardSidebar.tsx already
// uses for its own dynamic key lookup -- a runtime string can never be
// verified against NamespacedMessageKeys at compile time.
function translateByCode(t: (key: any) => string, code: string, fallback: string): string {
  try {
    return t(code as any);
  } catch {
    return fallback;
  }
}

const STATUS_BADGE_VARIANT: Record<StaffStatus, "emerald" | "amber" | "neutral"> = {
  active: "emerald",
  suspended: "amber",
  deactivated: "neutral",
};

const STATUS_KEY: Record<StaffStatus, string> = {
  active: "statusActive",
  suspended: "statusSuspended",
  deactivated: "statusDeactivated",
};

const EMPLOYMENT_KEY: Record<string, string> = {
  full_time: "employmentFullTime",
  part_time: "employmentPartTime",
  contract: "employmentContract",
  seasonal: "employmentSeasonal",
  volunteer: "employmentVolunteer",
};

type Branch = { id: string; label: string; status: "active" | "archived" };

export default function StaffClient({
  businessId,
  branches,
  initialStaff,
  initialError,
  canDelete,
  orgBasePath,
}: {
  businessId: string;
  branches: Branch[];
  initialStaff: StaffMemberRow[];
  initialError: string | null;
  canDelete: boolean;
  /** Org-workspace staff list base path (e.g. /dashboard/org/{id}/staff). When
   * provided, each row's name links to its profile page under this base.
   * Omitted on the businesses/[id] route, which has no profile page. */
  orgBasePath?: string;
}) {
  const t = useTranslations("Workforce");
  const [staff, setStaff] = useState<StaffMemberRow[]>(initialStaff);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMemberRow | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffMemberRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((s) => {
      if (branchFilter === "unassigned" && s.branch_id) return false;
      if (branchFilter !== "all" && branchFilter !== "unassigned" && s.branch_id !== branchFilter) return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.full_name.toLowerCase().includes(q) ||
        (s.phone ?? "").toLowerCase().includes(q) ||
        (s.email ?? "").toLowerCase().includes(q) ||
        s.role_names.some((r) => r.toLowerCase().includes(q))
      );
    });
  }, [staff, search, branchFilter, statusFilter]);

  function openCreate() {
    setEditing(null);
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(s: StaffMemberRow) {
    setEditing(s);
    setError(null);
    setDialogOpen(true);
  }

  function handleSaved(row: StaffMemberRow) {
    setStaff((prev) => {
      const exists = prev.some((s) => s.id === row.id);
      return exists ? prev.map((s) => (s.id === row.id ? row : s)) : [...prev, row];
    });
  }

  async function handleToggleStatus(s: StaffMemberRow) {
    setError(null);
    setRowBusy(s.id);
    const nextStatus: StaffStatus = s.status === "active" ? "deactivated" : "active";
    const res = await setStaffStatus(s.id, businessId, nextStatus);
    setRowBusy(null);
    if (!res.success) {
      setError(translateByCode(t, res.code, res.error));
      return;
    }
    setStaff((prev) => prev.map((row) => (row.id === s.id ? res.data : row)));
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await deleteStaffMember(deleteTarget.id, businessId);
    setDeleting(false);
    if (!res.success) {
      setError(translateByCode(t, res.code, res.error));
      setDeleteTarget(null);
      return;
    }
    setStaff((prev) => prev.filter((row) => row.id !== deleteTarget.id));
    setDeleteTarget(null);
  }

  if (initialError) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-xl font-black">{t("stTitle")}</h1>
        </header>
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{initialError}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-business-id={businessId}>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black">{t("stTitle")}</h1>
          <p className="text-sm text-zinc-500">{t("stSubtitle")}</p>
        </div>
        <Button onClick={openCreate}>{t("stAddStaff")}</Button>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      {staff.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("stEmpty")}</p>
      ) : (
        <>
          <section className="space-y-3">
            <Input placeholder={t("stSearchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} aria-label="Filter by branch">
                <option value="all">{t("stAllBranches")}</option>
                <option value="unassigned">{t("stNoBranchOption")}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </Select>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
                <option value="all">{t("stAllStatuses")}</option>
                <option value="active">{t("statusActive")}</option>
                <option value="suspended">{t("statusSuspended")}</option>
                <option value="deactivated">{t("statusDeactivated")}</option>
              </Select>
            </div>
          </section>

          {filtered.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("stNoMatch")}</p>
          ) : (
            <div className="space-y-3">
              {filtered.map((s) => {
                const branchLabel = s.branch_label ?? t("stNoBranchOption");
                const nameBlock = (
                  <p className="truncate text-sm font-bold text-zinc-900">{s.full_name}</p>
                );
                return (
                  <Card key={s.id}>
                    <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <StaffAvatar photoUrl={s.photo_url} name={s.full_name} />
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {orgBasePath ? (
                              <Link href={`${orgBasePath}/${s.id}`} className="hover:underline">
                                {nameBlock}
                              </Link>
                            ) : (
                              nameBlock
                            )}
                            <Badge variant={STATUS_BADGE_VARIANT[s.status]}>{t(STATUS_KEY[s.status] as any)}</Badge>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {s.role_names.length > 0 ? (
                              s.role_names.map((r) => (
                                <Badge key={r} variant="outline">{r}</Badge>
                              ))
                            ) : (
                              <span className="text-xs text-zinc-400">{t("stNoRole")}</span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500">
                            {branchLabel} · {t((EMPLOYMENT_KEY[s.employment_type] ?? "employmentFullTime") as any)}
                            {s.phone ? ` · ${s.phone}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(s)}>{t("stEdit")}</Button>
                        <Button variant="ghost" size="sm" disabled={rowBusy === s.id} onClick={() => handleToggleStatus(s)}>
                          {s.status === "active" ? t("stDeactivate") : t("stReactivate")}
                        </Button>
                        {canDelete && (
                          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(s)}>{t("stDelete")}</Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <StaffFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        businessId={businessId}
        branches={branches}
        editing={editing}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("stDeleteConfirmTitle", { name: deleteTarget?.full_name ?? t("stDeleteConfirmFallbackName") })}
        description={t("stDeleteConfirmBody")}
        confirmLabel={t("stDelete")}
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
