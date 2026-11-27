"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  assignStaffRole,
  removeStaffRole,
  updateRoleDetails,
  type AssignableRoleRow,
  type StaffRoleAssignmentRow,
} from "@/lib/actions/staff-role-assignments";
import type { RoleDetails } from "@/lib/staff/role-details-validation";
import { isRoleOptionDisabledForCaller } from "@/lib/staff/role-permission-grouping";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

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

function DetailsForm({
  assignmentId,
  businessId,
  details,
  onSaved,
}: {
  assignmentId: string;
  businessId: string;
  details: RoleDetails;
  onSaved: (details: RoleDetails) => void;
}) {
  const t = useTranslations("Workforce");
  const [form, setForm] = useState<RoleDetails>(details);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setError(null);
    setSaved(false);
    setSaving(true);
    const res = await updateRoleDetails(assignmentId, businessId, form);
    setSaving(false);
    if (!res.success) {
      setError(translateByCode(t, res.code, res.error));
      return;
    }
    onSaved(res.data);
    setSaved(true);
  }

  return (
    <div className="space-y-2 rounded-lg border border-zinc-100 bg-zinc-50 p-3">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-700">{error}</div>}
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          className="min-w-0 w-full"
          placeholder={t("raLicenceClassLabel")}
          value={form.licence_class ?? ""}
          onChange={(e) => setForm({ ...form, licence_class: e.target.value })}
        />
        <Input
          className="min-w-0 w-full"
          placeholder={t("raLicenceExpiryLabel")}
          value={form.licence_expiry ?? ""}
          onChange={(e) => setForm({ ...form, licence_expiry: e.target.value })}
        />
        <Input
          className="min-w-0 w-full"
          placeholder={t("raIssuingCountryLabel")}
          value={form.issuing_country ?? ""}
          onChange={(e) => setForm({ ...form, issuing_country: e.target.value })}
        />
        <Input
          className="min-w-0 w-full"
          placeholder={t("raNotesLabel")}
          value={form.notes ?? ""}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={saving} onClick={handleSave}>
          {saving ? t("raDetailsSaving") : t("raDetailsSave")}
        </Button>
        {saved && <span className="text-xs font-semibold text-emerald-700">{t("raDetailsSaved")}</span>}
      </div>
    </div>
  );
}

export default function StaffRoleAssignmentPanel({
  businessId,
  staffMemberId,
  initialAssignments,
  assignableRoles,
  callerScope,
}: {
  businessId: string;
  staffMemberId: string;
  initialAssignments: StaffRoleAssignmentRow[];
  assignableRoles: AssignableRoleRow[];
  callerScope: "organizer" | "staff";
}) {
  const t = useTranslations("Workforce");
  const [assignments, setAssignments] = useState<StaffRoleAssignmentRow[]>(initialAssignments);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [openDetailsId, setOpenDetailsId] = useState<string | null>(null);

  const assignedRoleIds = new Set(assignments.map((a) => a.role_id));
  const availableRoles = assignableRoles.filter((r) => !assignedRoleIds.has(r.id));

  async function handleAssign() {
    if (!selectedRoleId) return;
    setError(null);
    setAssigning(true);
    const res = await assignStaffRole(staffMemberId, businessId, selectedRoleId);
    setAssigning(false);
    if (!res.success) {
      setError(translateByCode(t, res.code, res.error));
      return;
    }
    setAssignments((prev) => [...prev, res.data]);
    setSelectedRoleId("");
  }

  async function handleRemove(assignment: StaffRoleAssignmentRow) {
    setError(null);
    setRowBusy(assignment.id);
    const res = await removeStaffRole(assignment.id, businessId);
    setRowBusy(null);
    if (!res.success) {
      setError(translateByCode(t, res.code, res.error));
      return;
    }
    setAssignments((prev) => prev.filter((a) => a.id !== assignment.id));
  }

  function handleDetailsSaved(assignmentId: string, details: RoleDetails) {
    setAssignments((prev) => prev.map((a) => (a.id === assignmentId ? { ...a, details } : a)));
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-zinc-500">{t("raTitle")}</h3>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      {assignments.length === 0 ? (
        <p className="text-xs text-zinc-400">{t("raEmpty")}</p>
      ) : (
        <div className="space-y-2">
          {assignments.map((assignment) => (
            <div key={assignment.id} className="space-y-1.5 rounded-lg border border-zinc-100 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">{assignment.role_name}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpenDetailsId(openDetailsId === assignment.id ? null : assignment.id)}
                  >
                    {t("raDetailsToggle")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={rowBusy === assignment.id}
                    onClick={() => handleRemove(assignment)}
                  >
                    {t("raRemove")}
                  </Button>
                </div>
              </div>
              {openDetailsId === assignment.id && (
                <DetailsForm
                  assignmentId={assignment.id}
                  businessId={businessId}
                  details={assignment.details}
                  onSaved={(details) => handleDetailsSaved(assignment.id, details)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {availableRoles.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            className="min-w-0 flex-1 pr-8"
            value={selectedRoleId}
            onChange={(e) => setSelectedRoleId(e.target.value)}
            aria-label={t("raAssignPlaceholder")}
          >
            <option value="">{t("raAssignPlaceholder")}</option>
            {availableRoles.map((role) => {
              const disabled = isRoleOptionDisabledForCaller(role.platform_role, callerScope);
              return (
                <option key={role.id} value={role.id} disabled={disabled}>
                  {role.name}{disabled ? ` (${t("raPrivilegedDisabledReason")})` : ""}
                </option>
              );
            })}
          </Select>
          <Button type="button" variant="outline" size="sm" disabled={!selectedRoleId || assigning} onClick={handleAssign}>
            {t("raAssign")}
          </Button>
        </div>
      )}
    </div>
  );
}
