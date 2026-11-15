"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createBranch, updateBranch, type BranchInput } from "@/lib/actions/business-branches";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

const EMPTY_FORM = { label: "", address: "", city: "", state: "", country: "", phone: "" };

export default function BranchesClient({
  businessId,
  initialBranches,
  staffCountByBranch,
}: {
  businessId: string;
  initialBranches: Branch[];
  staffCountByBranch: Record<string, number>;
}) {
  const t = useTranslations("Workforce");
  const [branches, setBranches] = useState<Branch[]>(initialBranches);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(b: Branch) {
    setEditingId(b.id);
    setForm({
      label: b.label,
      address: b.address ?? "",
      city: b.city ?? "",
      state: b.state ?? "",
      country: b.country ?? "",
      phone: b.phone ?? "",
    });
    setError(null);
    setDialogOpen(true);
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    const input: BranchInput = {
      label: form.label,
      address: form.address || null,
      city: form.city || null,
      state: form.state || null,
      country: form.country || null,
      phone: form.phone || null,
    };
    const res = editingId ? await updateBranch(editingId, input) : await createBranch(businessId, input);
    setSaving(false);
    if (!res.success) {
      setError(translateByCode(t, res.code, res.error));
      return;
    }
    if (editingId) {
      setBranches((prev) => prev.map((b) => (b.id === editingId ? (res.data as Branch) : b)));
    } else {
      setBranches((prev) => [...prev, res.data as Branch]);
    }
    setDialogOpen(false);
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
            return (
              <Card key={b.id} className={isArchived ? "opacity-60" : undefined}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold text-zinc-900">{b.label}</p>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[32rem]">
          <DialogHeader>
            <DialogTitle>{editingId ? t("brEditTitle") : t("brAddTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
            <Input
              className="min-w-0 w-full"
              placeholder={t("brLabelPlaceholder")}
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
            <Input
              className="min-w-0 w-full"
              placeholder={t("brAddressPlaceholder")}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                className="min-w-0 w-full"
                placeholder={t("brCityPlaceholder")}
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
              <Input
                className="min-w-0 w-full"
                placeholder={t("brStatePlaceholder")}
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
              />
              <Input
                className="min-w-0 w-full"
                placeholder={t("brCountryPlaceholder")}
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              />
              <Input
                className="min-w-0 w-full"
                placeholder={t("brPhonePlaceholder")}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>{t("brCancel")}</Button>
            <Button onClick={handleSave} disabled={saving || form.label.trim().length < 2}>
              {saving ? t("brSaving") : t("brSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
