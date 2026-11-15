"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { updateBranch } from "@/lib/actions/business-branches";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import BranchFormDialog from "./BranchFormDialog";

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

export type Branch = {
  id: string;
  business_id: string;
  label: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
  is_main: boolean;
  status: "active" | "archived";
};

export default function BranchesClient({
  businessId,
  initialBranches,
  staffCountByBranch,
  orgBasePath,
}: {
  businessId: string;
  initialBranches: Branch[];
  staffCountByBranch: Record<string, number>;
  /** Org-workspace branches list base path (e.g. /dashboard/org/{id}/branches).
   * When provided, each row's label links to its detail page under this
   * base. Omitted on the businesses/[id] route, which has no detail page. */
  orgBasePath?: string;
}) {
  const t = useTranslations("Workforce");
  const [branches, setBranches] = useState<Branch[]>(initialBranches);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(b: Branch) {
    setEditing(b);
    setError(null);
    setDialogOpen(true);
  }

  function handleSaved(branch: Branch) {
    setBranches((prev) => {
      const exists = prev.some((b) => b.id === branch.id);
      return exists ? prev.map((b) => (b.id === branch.id ? branch : b)) : [...prev, branch];
    });
  }

  async function handleSetMain(b: Branch) {
    setError(null);
    setRowBusy(b.id);
    const res = await updateBranch(b.id, { is_main: true });
    setRowBusy(null);
    if (!res.success) {
      setError(translateByCode(t, res.code, res.error));
      return;
    }
    setBranches((prev) =>
      prev.map((row) => (row.id === b.id ? { ...row, is_main: true } : { ...row, is_main: false }))
    );
  }

  async function handleToggleStatus(b: Branch) {
    setError(null);
    setRowBusy(b.id);
    const nextStatus = b.status === "active" ? "archived" : "active";
    const res = await updateBranch(b.id, { status: nextStatus });
    setRowBusy(null);
    if (!res.success) {
      setError(translateByCode(t, res.code, res.error));
      return;
    }
    setBranches((prev) => prev.map((row) => (row.id === b.id ? { ...row, status: nextStatus } : row)));
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black">{t("brTitle")}</h1>
          <p className="text-sm text-zinc-500">{t("brSubtitle")}</p>
        </div>
        <Button onClick={openCreate}>{t("brAddBranch")}</Button>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      {branches.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("brEmpty")}</p>
      ) : (
        <div className="space-y-3">
          {branches.map((b) => {
            const isArchived = b.status === "archived";
            const staffCount = staffCountByBranch[b.id] ?? 0;
            const labelBlock = <p className="truncate text-sm font-bold text-zinc-900">{b.label}</p>;
            return (
              <Card key={b.id} className={isArchived ? "opacity-60" : undefined}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {orgBasePath ? (
                        <Link href={`${orgBasePath}/${b.id}`} className="hover:underline">
                          {labelBlock}
                        </Link>
                      ) : (
                        labelBlock
                      )}
                      {b.is_main && <Badge variant="orange">{t("brMain")}</Badge>}
                      <Badge variant={isArchived ? "neutral" : "emerald"}>{isArchived ? t("brInactiveBadge") : t("brActiveBadge")}</Badge>
                    </div>
                    <p className="text-xs text-zinc-500">
                      {[b.address, b.city, b.state, b.country].filter(Boolean).join(", ") || t("brNoAddress")}
                      {b.phone ? ` · ${b.phone}` : ""}
                    </p>
                    <p className="text-xs text-zinc-500">{staffCount} {t("brStaffCountSuffix")}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(b)}>{t("brEdit")}</Button>
                    {!b.is_main && !isArchived && (
                      <Button variant="outline" size="sm" disabled={rowBusy === b.id} onClick={() => handleSetMain(b)}>
                        {t("brSetAsMain")}
                      </Button>
                    )}
                    {!b.is_main && (
                      <Button variant="ghost" size="sm" disabled={rowBusy === b.id} onClick={() => handleToggleStatus(b)}>
                        {isArchived ? t("brReactivate") : t("brDeactivate")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <BranchFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        businessId={businessId}
        editing={editing}
        onSaved={handleSaved}
      />
    </div>
  );
}
