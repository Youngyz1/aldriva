"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  createStaffMember,
  updateStaffMember,
  type StaffEmploymentType,
  type StaffMemberRow,
  type StaffStatus,
} from "@/lib/actions/staff-members";
import { useImageUpload } from "@/hooks/use-image-upload";
import { validateStaffPhone } from "@/lib/staff/phone-validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import StaffAvatar from "@/components/staff/StaffAvatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

type Branch = { id: string; label: string; status: "active" | "archived" };

// Translate a stable error/validation code via the Workforce namespace,
// falling back to the English message when no translation exists for it.
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

type FormState = {
  full_name: string;
  phone: string;
  email: string;
  branch_id: string;
  employment_type: StaffEmploymentType;
  department: string;
  status: StaffStatus;
  photo_url: string;
};

function initialFormState(editing: StaffMemberRow | null): FormState {
  if (!editing) {
    return { full_name: "", phone: "", email: "", branch_id: "", employment_type: "full_time", department: "", status: "active", photo_url: "" };
  }
  return {
    full_name: editing.full_name,
    phone: editing.phone ?? "",
    email: editing.email ?? "",
    branch_id: editing.branch_id ?? "",
    employment_type: editing.employment_type,
    department: editing.department ?? "",
    status: editing.status,
    photo_url: "",
  };
}

export default function StaffFormDialog({
  open,
  onOpenChange,
  businessId,
  branches,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  branches: Branch[];
  editing: StaffMemberRow | null;
  onSaved: (row: StaffMemberRow) => void;
}) {
  const t = useTranslations("Workforce");
  const [form, setForm] = useState<FormState>(() => initialFormState(editing));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lastEditingId = useRef(editing?.id ?? null);

  // Dialog instance is reused for create/edit; reset local state only when
  // the identity of what we're editing actually changes (open/close of the
  // same dialog must not wipe in-progress input on a re-render).
  if (lastEditingId.current !== (editing?.id ?? null)) {
    lastEditingId.current = editing?.id ?? null;
    setForm(initialFormState(editing));
    setError(null);
  }

  const { uploading, triggerUpload, handleFileChange, fileInputRef } = useImageUpload({
    folder: "staff-photos",
    onSuccess: (url) => setForm((f) => ({ ...f, photo_url: url })),
    onError: (msg) => setError(msg),
  });

  const activeBranches = branches.filter((b) => b.status === "active");
  const currentBranchId = editing?.branch_id ?? null;
  const currentBranchIsActive = activeBranches.some((b) => b.id === currentBranchId);
  const inactiveCurrentBranch =
    currentBranchId && !currentBranchIsActive ? branches.find((b) => b.id === currentBranchId) : null;

  async function handleSave() {
    setError(null);
    const phoneError = validateStaffPhone(form.phone);
    if (phoneError) {
      setError(translateByCode(t, phoneError.code, phoneError.message));
      return;
    }
    setSaving(true);
    const payload = {
      full_name: form.full_name,
      phone: form.phone || null,
      email: form.email || null,
      branch_id: form.branch_id || null,
      employment_type: form.employment_type,
      department: form.department || null,
      status: form.status,
      ...(form.photo_url ? { photo_url: form.photo_url } : {}),
    };
    const res = editing
      ? await updateStaffMember(editing.id, businessId, payload)
      : await createStaffMember(businessId, payload);
    setSaving(false);
    if (!res.success) {
      setError(translateByCode(t, res.code, res.error));
      return;
    }
    onSaved(res.data);
    onOpenChange(false);
  }

  const photoPreview = form.photo_url || editing?.photo_url || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[32rem]">
        <DialogHeader>
          <DialogTitle>{editing ? t("sfEditTitle") : t("sfAddTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

          <div className="flex items-center gap-3">
            <StaffAvatar photoUrl={photoPreview} name={form.full_name} className="h-16 w-16" />
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
            <Button type="button" variant="outline" size="sm" onClick={triggerUpload} disabled={uploading}>
              {uploading ? t("sfUploading") : t("sfUploadPhoto")}
            </Button>
          </div>

          <Input
            className="min-w-0 w-full"
            placeholder={t("sfFullNamePlaceholder")}
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              className="min-w-0 w-full"
              placeholder={t("sfPhonePlaceholder")}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <Input
              className="min-w-0 w-full"
              placeholder={t("sfEmailPlaceholder")}
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <Select
            className="min-w-0 w-full pr-8"
            value={form.branch_id}
            onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
            aria-label={t("sfBranchAriaLabel")}
          >
            <option value="">{t("sfNoBranchOption")}</option>
            {activeBranches.map((b) => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
            {inactiveCurrentBranch && (
              <option value={inactiveCurrentBranch.id}>{inactiveCurrentBranch.label} {t("sfInactiveSuffix")}</option>
            )}
          </Select>
          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              className="min-w-0 w-full pr-8"
              value={form.employment_type}
              onChange={(e) => setForm({ ...form, employment_type: e.target.value as StaffEmploymentType })}
              aria-label={t("sfEmploymentTypeAriaLabel")}
            >
              <option value="full_time">{t("employmentFullTime")}</option>
              <option value="part_time">{t("employmentPartTime")}</option>
              <option value="contract">{t("employmentContract")}</option>
              <option value="seasonal">{t("employmentSeasonal")}</option>
              <option value="volunteer">{t("employmentVolunteer")}</option>
            </Select>
            <Select
              className="min-w-0 w-full pr-8"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as StaffStatus })}
              aria-label={t("sfStatusAriaLabel")}
            >
              <option value="active">{t("statusActive")}</option>
              <option value="suspended">{t("statusSuspended")}</option>
              <option value="deactivated">{t("statusDeactivated")}</option>
            </Select>
          </div>
          <Input
            className="min-w-0 w-full"
            placeholder={t("sfDepartmentPlaceholder")}
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t("sfCancel")}</Button>
          <Button onClick={handleSave} disabled={saving || uploading || form.full_name.trim().length < 2}>
            {saving ? t("sfSaving") : t("sfSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
