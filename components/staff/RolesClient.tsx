"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  setStaffRoleActive,
  deleteStaffRole,
  type StaffRoleRow,
  type StaffPermissionRow,
} from "@/lib/actions/staff-roles";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import RoleFormDialog from "./RoleFormDialog";

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

export default function RolesClient({
  businessId,
  initialRoles,
  initialError,
  permissions,
  canManage,
}: {
  businessId: string;
  initialRoles: StaffRoleRow[];
  initialError: string | null;
  permissions: StaffPermissionRow[];
  /** Organizer-level only -- a branch-manager (staff-scope) caller can view
   * this screen but never create/edit/deactivate/delete a role. Mirrors the
   * canDelete prop pattern already used on the staff profile page. */
  canManage: boolean;
}) {
  const t = useTranslations("Workforce");
  const [roles, setRoles] = useState<StaffRoleRow[]>(initialRoles);
  const [error, setError] = useState<string | null>(initialError);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRoleRow | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<StaffRoleRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffRoleRow | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const builtInRoles = roles.filter((r) => r.role_scope === "platform");
  const customRoles = roles.filter((r) => r.role_scope === "business");

  function permissionLabel(key: string): string {
    return permissions.find((p) => p.key === key)?.description ?? key;
  }

  function openCreate() {
    setEditing(null);
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(role: StaffRoleRow) {
    setEditing(role);
    setError(null);
    setDialogOpen(true);
  }

  function handleSaved(role: StaffRoleRow) {
    setRoles((prev) => {
      const exists = prev.some((r) => r.id === role.id);
      return exists ? prev.map((r) => (r.id === role.id ? role : r)) : [...prev, role];
    });
  }

  async function handleToggleActive(role: StaffRoleRow, nextActive: boolean) {
    setError(null);
    setRowBusy(role.id);
    const res = await setStaffRoleActive(role.id, businessId, nextActive);
    setRowBusy(null);
    if (!res.success) {
      setError(translateByCode(t, res.code, res.error));
      return;
    }
    // Reactivate's return has a placeholder permission_keys/assigned_count
    // (see setStaffRoleActive) -- keep the row's existing known values and
    // only patch is_active, rather than clobbering them with the stub.
    setRoles((prev) => prev.map((r) => (r.id === role.id ? { ...r, is_active: res.data.is_active } : r)));
  }

  async function handleDeactivateConfirm() {
    if (!deactivateTarget) return;
    setConfirmBusy(true);
    await handleToggleActive(deactivateTarget, false);
    setConfirmBusy(false);
    setDeactivateTarget(null);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setConfirmBusy(true);
    const res = await deleteStaffRole(deleteTarget.id, businessId);
    setConfirmBusy(false);
    if (!res.success) {
      setError(translateByCode(t, res.code, res.error));
      setDeleteTarget(null);
      return;
    }
    setRoles((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black">{t("rlTitle")}</h1>
          <p className="text-sm text-zinc-500">{t("rlSubtitle")}</p>
        </div>
        {canManage && <Button onClick={openCreate}>{t("rlAddRole")}</Button>}
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-zinc-900">{t("rlBuiltInTitle")}</h2>
        <div className="space-y-3">
          {builtInRoles.map((role) => (
            <Card key={role.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-zinc-900">{role.name}</p>
                  <Badge variant="neutral">{t("rlBuiltInBadge")}</Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {role.permission_keys.map((key) => (
                    <Badge key={key} variant="outline">{permissionLabel(key)}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-zinc-900">{t("rlCustomTitle")}</h2>
        {customRoles.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("rlCustomEmpty")}</p>
        ) : (
          <div className="space-y-3">
            {customRoles.map((role) => {
              const isInactive = !role.is_active;
              const inUse = role.assigned_count > 0;
              return (
                <Card key={role.id} className={isInactive ? "opacity-60" : undefined}>
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-bold text-zinc-900">{role.name}</p>
                        <Badge variant={isInactive ? "neutral" : "emerald"}>{isInactive ? t("rlStatusInactive") : t("rlStatusActive")}</Badge>
                      </div>
                      {role.description && <p className="text-xs text-zinc-500">{role.description}</p>}
                      <p className="text-xs text-zinc-500">{role.assigned_count} {t("rlAssignedCountSuffix")}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {role.permission_keys.map((key) => (
                          <Badge key={key} variant="outline">{permissionLabel(key)}</Badge>
                        ))}
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(role)}>{t("rlEdit")}</Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={rowBusy === role.id || (!isInactive && inUse)}
                          title={!isInactive && inUse ? t("rlInUseReason") : undefined}
                          onClick={() => (isInactive ? handleToggleActive(role, true) : setDeactivateTarget(role))}
                        >
                          {isInactive ? t("rlReactivate") : t("rlDeactivate")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={inUse}
                          title={inUse ? t("rlInUseReason") : undefined}
                          onClick={() => setDeleteTarget(role)}
                        >
                          {t("rlDelete")}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <RoleFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        businessId={businessId}
        editing={editing}
        allPermissions={permissions}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(open) => !open && setDeactivateTarget(null)}
        title={t("rlDeactivateConfirmTitle", { name: deactivateTarget?.name ?? "" })}
        description={t("rlDeactivateConfirmBody", { count: deactivateTarget?.assigned_count ?? 0 })}
        confirmLabel={t("rlDeactivate")}
        onConfirm={handleDeactivateConfirm}
        loading={confirmBusy}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("rlDeleteConfirmTitle", { name: deleteTarget?.name ?? "" })}
        description={t("rlDeleteConfirmBody", { count: deleteTarget?.assigned_count ?? 0 })}
        confirmLabel={t("rlDelete")}
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        loading={confirmBusy}
      />
    </div>
  );
}
