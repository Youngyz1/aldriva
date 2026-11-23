"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { IconArrowLeft as ArrowLeft } from "@tabler/icons-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import StaffAvatar from "@/components/staff/StaffAvatar";
import StaffRoleAssignmentPanel from "@/components/staff/StaffRoleAssignmentPanel";
import StaffInvitePanel from "@/components/staff/StaffInvitePanel";
import { deleteStaffMember, setStaffStatus, type StaffMemberRow, type StaffStatus } from "@/lib/actions/staff-members";
import type { AssignableRoleRow, StaffRoleAssignmentRow } from "@/lib/actions/staff-role-assignments";
import StaffFormDialog from "@/app/dashboard/businesses/[id]/staff/StaffFormDialog";
import { canEditRow, canDeactivateRow, type StaffUiCapabilities } from "@/lib/staff/staff-capabilities";

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

export default function StaffProfileClient({
  organizerId,
  businessId,
  staff: initialStaff,
  branches,
  capabilities,
  roleAssignments,
  assignableRoles,
  callerScope,
  hasLogin,
  siteUrl,
}: {
  organizerId: string;
  businessId: string;
  staff: StaffMemberRow;
  branches: Branch[];
  capabilities: StaffUiCapabilities;
  roleAssignments: StaffRoleAssignmentRow[];
  assignableRoles: AssignableRoleRow[];
  callerScope: "organizer" | "staff";
  hasLogin: boolean;
  siteUrl: string;
}) {
  const t = useTranslations("Workforce");
  const router = useRouter();
  const [staff, setStaff] = useState<StaffMemberRow>(initialStaff);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const staffListHref = `/dashboard/org/${organizerId}/staff`;
  const branchLabel = staff.branch_label ?? t("stNoBranchOption");

  async function handleToggleStatus() {
    setError(null);
    setStatusBusy(true);
    const nextStatus: StaffStatus = staff.status === "active" ? "deactivated" : "active";
    const res = await setStaffStatus(staff.id, businessId, nextStatus);
    setStatusBusy(false);
    if (!res.success) {
      setError(translateByCode(t, res.code, res.error));
      return;
    }
    setStaff(res.data);
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await deleteStaffMember(staff.id, businessId);
    setDeleting(false);
    setConfirmDelete(false);
    if (!res.success) {
      setError(translateByCode(t, res.code, res.error));
      return;
    }
    router.push(staffListHref);
  }

  return (
    <div className="space-y-6">
      <Link
        href={staffListHref}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("spBackToStaff")}
      </Link>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      <Card>
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-start gap-4">
            <StaffAvatar photoUrl={staff.photo_url} name={staff.full_name} className="h-20 w-20" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-lg font-black text-zinc-900">{staff.full_name}</h1>
                <Badge variant={STATUS_BADGE_VARIANT[staff.status]}>{t(STATUS_KEY[staff.status] as any)}</Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                {staff.role_names.length > 0 ? (
                  staff.role_names.map((r) => (
                    <Badge key={r} variant="outline">{r}</Badge>
                  ))
                ) : (
                  <span className="text-xs text-zinc-400">{t("stNoRole")}</span>
                )}
              </div>
            </div>
          </div>

          <StaffRoleAssignmentPanel
            businessId={businessId}
            staffMemberId={staff.id}
            initialAssignments={roleAssignments}
            assignableRoles={assignableRoles}
            callerScope={callerScope}
          />

          {!hasLogin && staff.status !== "deactivated" && (
            <StaffInvitePanel
              businessId={businessId}
              staffMemberId={staff.id}
              defaultEmail={staff.email}
              assignableRoles={assignableRoles}
              siteUrl={siteUrl}
            />
          )}

          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-0.5">
              <dt className="text-xs font-semibold text-zinc-500">{t("spBranchLabel")}</dt>
              <dd className="truncate text-sm text-zinc-900">{branchLabel}</dd>
            </div>
            <div className="min-w-0 space-y-0.5">
              <dt className="text-xs font-semibold text-zinc-500">{t("spEmploymentTypeLabel")}</dt>
              <dd className="truncate text-sm text-zinc-900">
                {t((EMPLOYMENT_KEY[staff.employment_type] ?? "employmentFullTime") as any)}
              </dd>
            </div>
            <div className="min-w-0 space-y-0.5">
              <dt className="text-xs font-semibold text-zinc-500">{t("spDepartmentLabel")}</dt>
              <dd className="truncate text-sm text-zinc-900">{staff.department ?? t("spNotProvided")}</dd>
            </div>
            <div className="min-w-0 space-y-0.5">
              <dt className="text-xs font-semibold text-zinc-500">{t("spPhoneLabel")}</dt>
              <dd className="truncate text-sm">
                {staff.phone ? (
                  <a href={`tel:${staff.phone}`} className="text-orange-700 hover:underline">{staff.phone}</a>
                ) : (
                  <span className="text-zinc-900">{t("spNotProvided")}</span>
                )}
              </dd>
            </div>
            <div className="min-w-0 space-y-0.5 sm:col-span-2">
              <dt className="text-xs font-semibold text-zinc-500">{t("spEmailLabel")}</dt>
              <dd className="truncate text-sm">
                {staff.email ? (
                  <a href={`mailto:${staff.email}`} className="text-orange-700 hover:underline">{staff.email}</a>
                ) : (
                  <span className="text-zinc-900">{t("spNotProvided")}</span>
                )}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2">
            {canEditRow(capabilities, staff) && (
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>{t("stEdit")}</Button>
            )}
            {canDeactivateRow(capabilities, staff) && (
              <Button variant="ghost" size="sm" disabled={statusBusy} onClick={handleToggleStatus}>
                {staff.status === "active" ? t("stDeactivate") : t("stReactivate")}
              </Button>
            )}
            {capabilities.canDelete && (
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>{t("stDelete")}</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <StaffFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        businessId={businessId}
        branches={branches}
        editing={staff}
        onSaved={setStaff}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("stDeleteConfirmTitle", { name: staff.full_name })}
        description={t("stDeleteConfirmBody")}
        confirmLabel={t("stDelete")}
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
