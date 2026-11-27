"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { IconArrowLeft as ArrowLeft } from "@tabler/icons-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import StaffAvatar from "@/components/staff/StaffAvatar";
import BranchCoverImage from "@/components/branches/BranchCoverImage";
import { updateBranch } from "@/lib/actions/business-branches";
import type { Branch } from "@/app/dashboard/businesses/[id]/branches/BranchesClient";
import BranchFormDialog from "@/app/dashboard/businesses/[id]/branches/BranchFormDialog";
import StaffFormDialog from "@/app/dashboard/businesses/[id]/staff/StaffFormDialog";
import type { StaffEmploymentType, StaffMemberRow, StaffStatus } from "@/lib/actions/staff-members";

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

type BranchStaffRow = {
  id: string;
  full_name: string;
  photo_url: string | null;
  status: StaffStatus;
  employment_type: StaffEmploymentType;
};

type Branches = { id: string; label: string; status: "active" | "archived" }[];

export default function BranchDetailClient({
  organizerId,
  branch: initialBranch,
  initialStaff,
  branches,
}: {
  organizerId: string;
  branch: Branch;
  initialStaff: BranchStaffRow[];
  branches: Branches;
}) {
  const t = useTranslations("Workforce");
  const [branch, setBranch] = useState<Branch>(initialBranch);
  const [staff, setStaff] = useState<BranchStaffRow[]>(initialStaff);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addStaffOpen, setAddStaffOpen] = useState(false);

  const branchesListHref = `/dashboard/org/${organizerId}/branches`;
  const staffListHref = `/dashboard/org/${organizerId}/staff`;
  const isArchived = branch.status === "archived";

  async function handleSetMain() {
    setError(null);
    setBusy(true);
    const res = await updateBranch(branch.id, { is_main: true });
    setBusy(false);
    if (!res.success) {
      setError(translateByCode(t, res.code, res.error));
      return;
    }
    setBranch((prev) => ({ ...prev, is_main: true }));
  }

  async function handleToggleStatus() {
    setError(null);
    setBusy(true);
    const nextStatus = branch.status === "active" ? "archived" : "active";
    const res = await updateBranch(branch.id, { status: nextStatus });
    setBusy(false);
    if (!res.success) {
      setError(translateByCode(t, res.code, res.error));
      return;
    }
    setBranch((prev) => ({ ...prev, status: nextStatus }));
  }

  function handleStaffAdded(row: StaffMemberRow) {
    if (row.branch_id !== branch.id) return;
    setStaff((prev) => [...prev, { id: row.id, full_name: row.full_name, photo_url: row.photo_url, status: row.status, employment_type: row.employment_type }]);
  }

  const addressParts = [branch.address, branch.city, branch.state, branch.country].filter(Boolean);

  return (
    <div className="space-y-6">
      <Link
        href={branchesListHref}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("bdBackToBranches")}
      </Link>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      <Card>
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <BranchCoverImage coverImageUrl={branch.cover_image_url} label={branch.label} className="h-16 w-24" />
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-black text-zinc-900">{branch.label}</h1>
              {branch.is_main && <Badge variant="orange">{t("brMain")}</Badge>}
              <Badge variant={isArchived ? "neutral" : "emerald"}>{isArchived ? t("brInactiveBadge") : t("brActiveBadge")}</Badge>
            </div>
          </div>

          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-0.5 sm:col-span-2">
              <dt className="text-xs font-semibold text-zinc-500">{t("bdAddressLabel")}</dt>
              <dd className="truncate text-sm text-zinc-900">{addressParts.length > 0 ? addressParts.join(", ") : t("brNoAddress")}</dd>
            </div>
            <div className="min-w-0 space-y-0.5">
              <dt className="text-xs font-semibold text-zinc-500">{t("bdPhoneLabel")}</dt>
              <dd className="truncate text-sm">
                {branch.phone ? (
                  <a href={`tel:${branch.phone}`} className="text-orange-700 hover:underline">{branch.phone}</a>
                ) : (
                  <span className="text-zinc-900">{t("spNotProvided")}</span>
                )}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(true)}>{t("brEdit")}</Button>
            {!branch.is_main && !isArchived && (
              <Button variant="outline" size="sm" disabled={busy} onClick={handleSetMain}>{t("brSetAsMain")}</Button>
            )}
            {!branch.is_main && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={handleToggleStatus}>
                {isArchived ? t("brReactivate") : t("brDeactivate")}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setAddStaffOpen(true)}>{t("bdAddStaffHere")}</Button>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-zinc-900">{t("bdStaffTitle")}</h2>
        {staff.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("bdStaffEmpty")}</p>
        ) : (
          <div className="space-y-3">
            {staff.map((s) => (
              <Card key={s.id}>
                <CardContent className="flex items-center gap-3 p-4">
                  <StaffAvatar photoUrl={s.photo_url} name={s.full_name} />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <Link href={`${staffListHref}/${s.id}`} className="truncate text-sm font-bold text-zinc-900 hover:underline">
                      {s.full_name}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={STATUS_BADGE_VARIANT[s.status]}>{t(STATUS_KEY[s.status] as any)}</Badge>
                      <span className="text-xs text-zinc-500">{t((EMPLOYMENT_KEY[s.employment_type] ?? "employmentFullTime") as any)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <BranchFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        businessId={branch.business_id}
        editing={branch}
        onSaved={setBranch}
      />

      <StaffFormDialog
        open={addStaffOpen}
        onOpenChange={setAddStaffOpen}
        businessId={branch.business_id}
        branches={branches}
        editing={null}
        onSaved={handleStaffAdded}
        defaultBranchId={branch.id}
      />
    </div>
  );
}
