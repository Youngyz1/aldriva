"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cancelShift, createShift, updateShift, type ShiftRow } from "@/lib/actions/staff-shifts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export type RosterStaff = { id: string; full_name: string; branch_id: string | null };
export type RosterBranch = { id: string; label: string; status: "active" | "archived" };

// Same dynamic-key escape the other staff dialogs use.
function translateByCode(t: (key: any) => string, code: string, fallback: string): string {
  try {
    return t(code as any);
  } catch {
    return fallback;
  }
}

type FormState = {
  staff_member_id: string;
  shift_date: string;
  starts_at: string;
  ends_at: string;
  branch_id: string;
  notes: string;
};

// Mount this dialog with a key that changes per target (shift id, or
// staff + date for a new shift) so its form state starts fresh each time.
export default function ShiftDialog({
  open,
  onOpenChange,
  businessId,
  staff,
  branches,
  editing,
  defaultStaffId,
  defaultDate,
  defaultBranchId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  staff: RosterStaff[];
  branches: RosterBranch[];
  editing: ShiftRow | null;
  defaultStaffId?: string | null;
  defaultDate?: string | null;
  defaultBranchId?: string | null;
  onSaved: (row: ShiftRow) => void;
}) {
  const t = useTranslations("Workforce");
  const [form, setForm] = useState<FormState>(() => {
    if (editing) {
      return {
        staff_member_id: editing.staff_member_id,
        shift_date: editing.shift_date,
        starts_at: editing.starts_at,
        ends_at: editing.ends_at,
        branch_id: editing.branch_id ?? "",
        notes: editing.notes ?? "",
      };
    }
    const person = staff.find((s) => s.id === defaultStaffId);
    return {
      staff_member_id: defaultStaffId ?? "",
      shift_date: defaultDate ?? "",
      starts_at: "09:00",
      ends_at: "17:00",
      branch_id: defaultBranchId ?? person?.branch_id ?? "",
      notes: "",
    };
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activeBranches = branches.filter((b) => b.status === "active");
  const currentBranch = form.branch_id ? branches.find((b) => b.id === form.branch_id) : null;
  const showCurrentInactive = currentBranch && currentBranch.status !== "active";

  async function handleSave() {
    setError(null);
    setSaving(true);
    const res = editing
      ? await updateShift(businessId, editing.id, {
          branch_id: form.branch_id || null,
          shift_date: form.shift_date,
          starts_at: form.starts_at,
          ends_at: form.ends_at,
          notes: form.notes || null,
        })
      : await createShift(businessId, {
          staff_member_id: form.staff_member_id,
          branch_id: form.branch_id || null,
          shift_date: form.shift_date,
          starts_at: form.starts_at,
          ends_at: form.ends_at,
          notes: form.notes || null,
        });
    setSaving(false);
    if (!res.success) {
      setError(translateByCode(t, res.code, res.error));
      return;
    }
    onSaved(res.data);
    onOpenChange(false);
  }

  async function handleCancelShift() {
    if (!editing) return;
    setError(null);
    setSaving(true);
    const res = await cancelShift(businessId, editing.id);
    setSaving(false);
    if (!res.success) {
      setError(translateByCode(t, res.code, res.error));
      return;
    }
    onSaved(res.data);
    onOpenChange(false);
  }

  const canSave = !saving && form.staff_member_id !== "" && form.shift_date !== "" && form.starts_at !== "" && form.ends_at !== "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[32rem]">
        <DialogHeader>
          <DialogTitle>{editing ? t("rsEditShift") : t("rsAddShift")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

          <Select
            className="min-w-0 w-full pr-8"
            value={form.staff_member_id}
            disabled={Boolean(editing)}
            onChange={(e) => setForm({ ...form, staff_member_id: e.target.value })}
            aria-label={t("rsStaffLabel")}
          >
            <option value="">{t("rsSelectStaff")}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </Select>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-500">{t("rsDateLabel")}</label>
            <Input
              className="min-w-0 w-full"
              type="date"
              value={form.shift_date}
              onChange={(e) => setForm({ ...form, shift_date: e.target.value })}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-500">{t("rsStartLabel")}</label>
              <Input
                className="min-w-0 w-full"
                type="time"
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-500">{t("rsEndLabel")}</label>
              <Input
                className="min-w-0 w-full"
                type="time"
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
              />
            </div>
          </div>

          <Select
            className="min-w-0 w-full pr-8"
            value={form.branch_id}
            onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
            aria-label={t("rsBranchLabel")}
          >
            <option value="">{t("rsNoBranch")}</option>
            {activeBranches.map((b) => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
            {showCurrentInactive && currentBranch && (
              <option value={currentBranch.id}>{currentBranch.label} {t("sfInactiveSuffix")}</option>
            )}
          </Select>

          <Input
            className="min-w-0 w-full"
            placeholder={t("rsNotesPlaceholder")}
            maxLength={500}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        <DialogFooter>
          {editing && editing.status === "scheduled" && (
            <Button variant="ghost" onClick={handleCancelShift} disabled={saving}>{t("rsCancelShift")}</Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t("sfCancel")}</Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {saving ? t("sfSaving") : t("sfSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
