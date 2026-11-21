"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  createStaffRole,
  updateStaffRole,
  setRolePermissions,
  type StaffRoleRow,
  type StaffPermissionRow,
} from "@/lib/actions/staff-roles";
import { groupPermissionsByDomain } from "@/lib/staff/role-permission-grouping";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

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

const DOMAIN_LABEL_KEY: Record<string, string> = {
  staff_management: "rlDomainStaffManagement",
  role_management: "rlDomainRoleManagement",
  scheduling: "rlDomainScheduling",
  assignment_management: "rlDomainAssignments",
  reporting: "rlDomainReporting",
};

type FormState = { name: string; description: string };

function initialFormState(editing: StaffRoleRow | null): FormState {
  if (!editing) return { name: "", description: "" };
  return { name: editing.name, description: editing.description ?? "" };
}

export default function RoleFormDialog({
  open,
  onOpenChange,
  businessId,
  editing,
  allPermissions,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  editing: StaffRoleRow | null;
  allPermissions: StaffPermissionRow[];
  onSaved: (role: StaffRoleRow) => void;
}) {
  const t = useTranslations("Workforce");
  const [form, setForm] = useState<FormState>(() => initialFormState(editing));
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set(editing?.permission_keys ?? []));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmKeys, setConfirmKeys] = useState(false);
  const lastEditingId = useRef(editing?.id ?? null);

  // Dialog instance is reused for create/edit; reset local state only when
  // the identity of what we're editing actually changes -- same pattern
  // StaffFormDialog.tsx and BranchFormDialog.tsx already use.
  if (lastEditingId.current !== (editing?.id ?? null)) {
    lastEditingId.current = editing?.id ?? null;
    setForm(initialFormState(editing));
    setSelectedKeys(new Set(editing?.permission_keys ?? []));
    setError(null);
  }

  const groups = groupPermissionsByDomain(allPermissions);

  function togglePermission(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function keysChanged(): boolean {
    if (!editing) return false;
    const before = new Set(editing.permission_keys);
    if (before.size !== selectedKeys.size) return true;
    for (const k of selectedKeys) if (!before.has(k)) return true;
    return false;
  }

  // A key change on a role in use takes effect for every holder at once.
  function handleSaveClick() {
    if (editing && editing.assigned_count > 0 && keysChanged()) {
      setConfirmKeys(true);
      return;
    }
    void handleSave();
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    const keys = [...selectedKeys];

    const roleResult = editing
      ? await updateStaffRole(editing.id, businessId, { name: form.name, description: form.description || null })
      : await createStaffRole(businessId, { name: form.name, description: form.description || null });

    if (!roleResult.success) {
      setSaving(false);
      setError(translateByCode(t, roleResult.code, roleResult.error));
      return;
    }

    const permissionsResult = await setRolePermissions(roleResult.data.id, businessId, keys);
    setSaving(false);
    if (!permissionsResult.success) {
      setError(translateByCode(t, permissionsResult.code, permissionsResult.error));
      // The role itself was saved successfully even though the permission
      // sync failed -- hand the caller the role as-is (its old permission
      // set from roleResult) rather than silently dropping the save.
      onSaved(roleResult.data);
      return;
    }

    onSaved({ ...roleResult.data, permission_keys: permissionsResult.data });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[36rem]">
        <DialogHeader>
          <DialogTitle>{editing ? t("rlFormEditTitle") : t("rlFormAddTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

          <Input
            className="min-w-0 w-full"
            placeholder={t("rlNamePlaceholder")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            className="min-w-0 w-full"
            placeholder={t("rlDescriptionPlaceholder")}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900">{t("rlPermissionsHeading")}</h3>
              <span className="text-xs font-semibold text-zinc-500">{t("rlSelectedCount", { count: selectedKeys.size })}</span>
            </div>
            <p className="text-xs text-zinc-500">{t("rlPermissionsNote")}</p>

            {groups.map((group) => (
              <div key={group.domain} className="space-y-1.5 pt-1">
                <h4 className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                  {translateByCode(t, DOMAIN_LABEL_KEY[group.domain] ?? "", group.domain)}
                </h4>
                <div className="space-y-1.5">
                  {group.permissions.map((permission) => (
                    <label key={permission.key} className="flex cursor-pointer items-start gap-2 text-sm text-zinc-700">
                      <input
                        type="checkbox"
                        className="mt-0.5 rounded border-zinc-300 text-primary focus:ring-ring"
                        checked={selectedKeys.has(permission.key)}
                        onChange={() => togglePermission(permission.key)}
                      />
                      <span>{permission.description ?? permission.key}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t("rlCancel")}</Button>
          <Button onClick={handleSaveClick} disabled={saving || form.name.trim().length < 2}>
            {saving ? t("rlSaving") : t("rlSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
      <ConfirmDialog
        open={confirmKeys}
        onOpenChange={setConfirmKeys}
        title={t("rlKeysConfirmTitle")}
        description={t("rlKeysConfirmBody", { count: editing?.assigned_count ?? 0 })}
        confirmLabel={t("rlKeysConfirmAction")}
        onConfirm={async () => {
          setConfirmKeys(false);
          await handleSave();
        }}
        loading={saving}
      />
    </Dialog>
  );
}
