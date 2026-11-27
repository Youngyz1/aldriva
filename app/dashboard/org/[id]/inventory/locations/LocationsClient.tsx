"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { IconArrowLeft as ArrowLeft } from "@tabler/icons-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  createInventoryLocation,
  updateInventoryLocation,
  setInventoryLocationArchived,
  type InventoryBalanceRow,
  type InventoryLocationRow,
} from "@/lib/actions/inventory";

type BranchOption = { id: string; label: string };

function LocationDialog({
  businessId,
  location,
  branches,
  canPickBranch,
  onClose,
  onDone,
}: {
  businessId: string;
  location: InventoryLocationRow | null;
  branches: BranchOption[];
  canPickBranch: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("Inventory");
  const tr = (key: string, fallback: string) => {
    try {
      return (t as unknown as (k: any) => string)(key);
    } catch {
      return fallback;
    }
  };
  const [name, setName] = useState(location?.name ?? "");
  const [branch, setBranch] = useState(location?.branch_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const branchLocked = !canPickBranch || (location?.is_default ?? false);

  async function handleSave() {
    setError(null);
    setSaving(true);
    const branchPart = branchLocked ? {} : { branch_id: branch === "" ? null : branch };
    const res = location
      ? await updateInventoryLocation(businessId, location.id, { name, ...branchPart })
      : await createInventoryLocation(businessId, { name, ...branchPart });
    setSaving(false);
    if (!res.success) {
      setError(tr("err_" + res.code, res.error));
      return;
    }
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[28rem]">
        <DialogHeader>
          <DialogTitle>{location ? t("locEdit") : t("locAdd")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-500">{t("locName")}</label>
            <Input className="min-w-0 w-full" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-500">{t("locBranch")}</label>
            <Select className="min-w-0 w-full pr-8" value={branch} disabled={branchLocked} onChange={(e) => setBranch(e.target.value)}>
              <option value="">{t("locBusinessWide")}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t("cancel")}</Button>
          <Button onClick={handleSave} disabled={saving || name.trim() === ""}>{saving ? t("saving") : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function LocationsClient({
  organizerId,
  businessId,
  businessName,
  locations,
  balances,
  branches,
  canManageCatalog,
  manageableLocationIds,
}: {
  organizerId: string;
  businessId: string;
  businessName: string;
  locations: InventoryLocationRow[];
  balances: InventoryBalanceRow[];
  branches: BranchOption[];
  canManageCatalog: boolean;
  manageableLocationIds: string[];
}) {
  const t = useTranslations("Inventory");
  const router = useRouter();
  const [dialog, setDialog] = useState<{ location: InventoryLocationRow | null } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const tr = (key: string, fallback: string) => {
    try {
      return (t as unknown as (k: any) => string)(key);
    } catch {
      return fallback;
    }
  };
  const branchLabel = (id: string | null) => (id === null ? t("locBusinessWide") : branches.find((b) => b.id === id)?.label ?? "-");
  const stockCount = (locationId: string) => balances.filter((b) => b.location_id === locationId && b.on_hand > 0).length;
  const visible = locations.filter((l) => showArchived || l.status === "active");
  const hasArchived = locations.some((l) => l.status === "archived");

  async function toggleArchive(l: InventoryLocationRow) {
    setError(null);
    setBusyId(l.id);
    const res = await setInventoryLocationArchived(businessId, l.id, l.status === "active");
    setBusyId(null);
    if (!res.success) {
      setError(tr("err_" + res.code, res.error));
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/dashboard/org/${organizerId}/inventory?business=${businessId}`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("backToInventory")}
      </Link>
      <p className="text-xs font-semibold text-zinc-500">{businessName}</p>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black">{t("locationsTitle")}</h1>
        <div className="flex flex-wrap items-center gap-3">
          {hasArchived && (
            <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              {t("locShowArchived")}
            </label>
          )}
          {canManageCatalog && <Button size="sm" onClick={() => setDialog({ location: null })}>{t("locAdd")}</Button>}
        </div>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      {visible.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("locNone")}</p>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs font-semibold text-zinc-500">
                  <th className="px-4 py-3">{t("locName")}</th>
                  <th className="px-4 py-3">{t("locBranch")}</th>
                  <th className="px-4 py-3 text-right">{t("locItemsInStock")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((l) => {
                  const canEdit = manageableLocationIds.includes(l.id);
                  const stock = stockCount(l.id);
                  const archived = l.status === "archived";
                  const blocked = !archived && (l.is_default || stock > 0);
                  return (
                    <tr key={l.id} className="border-b border-zinc-50 last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-zinc-900">{l.name}</span>
                          {l.is_default && <Badge variant="emerald">{t("locDefault")}</Badge>}
                          {archived && <Badge variant="neutral">{t("locArchived")}</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{branchLabel(l.branch_id)}</td>
                      <td className="px-4 py-3 text-right font-bold">{stock}</td>
                      <td className="px-4 py-3">
                        {canEdit && (
                          <div className="flex justify-end gap-2">
                            {!archived && (
                              <Button size="sm" variant="outline" onClick={() => setDialog({ location: l })}>{t("locEdit")}</Button>
                            )}
                            {!l.is_default && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busyId === l.id || blocked}
                                title={blocked && stock > 0 ? t("locArchiveBlocked") : undefined}
                                onClick={() => toggleArchive(l)}
                              >
                                {archived ? t("locRestore") : t("locArchive")}
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {dialog && (
        <LocationDialog
          key={dialog.location?.id ?? "new"}
          businessId={businessId}
          location={dialog.location}
          branches={branches}
          canPickBranch={canManageCatalog}
          onClose={() => setDialog(null)}
          onDone={() => { setDialog(null); router.refresh(); }}
        />
      )}
    </div>
  );
}