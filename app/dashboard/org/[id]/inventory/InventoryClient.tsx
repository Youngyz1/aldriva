"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconPlus as Plus } from "@tabler/icons-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  adjustStock,
  createInventoryItem,
  ensureDefaultLocation,
  type InventoryBalanceRow,
  type InventoryItemRow,
  type InventoryItemType,
  type InventoryLocationRow,
  type MovementType,
} from "@/lib/actions/inventory";

const ITEM_TYPES: InventoryItemType[] = ["supply", "product", "raw_material", "packaging", "asset", "spare_part", "internal"];
const MOVEMENTS: MovementType[] = [
  "received", "returned_in", "opening", "consumed", "sold", "damaged", "expired", "lost", "returned_out", "adjustment",
];

function useCodeTranslator(t: (key: any) => string) {
  return (code: string, fallback: string) => {
    try {
      return t(`err_${code}` as any);
    } catch {
      return fallback;
    }
  };
}

function AddItemDialog({
  businessId,
  onClose,
  onDone,
}: {
  businessId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("Inventory");
  const tr = useCodeTranslator(t as unknown as (key: any) => string);
  const [form, setForm] = useState({ name: "", sku: "", category: "", unit: "piece", item_type: "supply" as InventoryItemType, min_stock: "0" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    const min = Number(form.min_stock === "" ? "0" : form.min_stock);
    if (!Number.isFinite(min)) {
      setError(tr("item_min_stock_invalid", ""));
      return;
    }
    setSaving(true);
    const res = await createInventoryItem(businessId, {
      name: form.name,
      sku: form.sku || null,
      category: form.category || null,
      unit: form.unit,
      item_type: form.item_type,
      min_stock: min,
    });
    setSaving(false);
    if (!res.success) {
      setError(tr(res.code, res.error));
      return;
    }
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[32rem]">
        <DialogHeader>
          <DialogTitle>{t("addItemTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-500">{t("fName")}</label>
            <Input className="min-w-0 w-full" maxLength={200} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-500">{t("fSku")}</label>
              <Input className="min-w-0 w-full" maxLength={64} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-500">{t("fCategory")}</label>
              <Input className="min-w-0 w-full" maxLength={100} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-500">{t("fType")}</label>
              <Select
                className="min-w-0 w-full pr-8"
                value={form.item_type}
                onChange={(e) => setForm({ ...form, item_type: e.target.value as InventoryItemType })}
              >
                {ITEM_TYPES.map((ty) => (
                  <option key={ty} value={ty}>{t(`type_${ty}` as any)}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-500">{t("fUnit")}</label>
              <Input className="min-w-0 w-full" maxLength={30} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-500">{t("fMinStock")}</label>
            <Input className="min-w-0 w-full" type="number" min="0" step="0.001" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t("cancel")}</Button>
          <Button onClick={handleSave} disabled={saving || form.name.trim() === ""}>{saving ? t("saving") : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdjustDialog({
  businessId,
  item,
  locations,
  balances,
  onClose,
  onDone,
}: {
  businessId: string;
  item: InventoryItemRow;
  locations: InventoryLocationRow[];
  balances: InventoryBalanceRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("Inventory");
  const locale = useLocale();
  const tr = useCodeTranslator(t as unknown as (key: any) => string);
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [type, setType] = useState<MovementType>("received");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onHand = balances.find((b) => b.item_id === item.id && b.location_id === locationId)?.on_hand ?? 0;

  async function handleSave() {
    setError(null);
    const q = Number(quantity);
    if (quantity.trim() === "" || !Number.isFinite(q) || q === 0) {
      setError(tr("bad_quantity", ""));
      return;
    }
    setSaving(true);
    const res = await adjustStock(businessId, {
      item_id: item.id,
      location_id: locationId,
      type,
      quantity: q,
      reason: reason || null,
    });
    setSaving(false);
    if (!res.success) {
      setError(tr(res.code, res.error));
      return;
    }
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[32rem]">
        <DialogHeader>
          <DialogTitle>{t("adjustTitle", { name: item.name })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-500">{t("fLocation")}</label>
            <Select className="min-w-0 w-full pr-8" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
            <p className="text-xs text-zinc-500">
              {t("onHandHere", { qty: onHand.toLocaleString(locale, { maximumFractionDigits: 3 }), unit: item.unit })}
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-500">{t("fMovement")}</label>
            <Select className="min-w-0 w-full pr-8" value={type} onChange={(e) => setType(e.target.value as MovementType)}>
              {MOVEMENTS.map((m) => (
                <option key={m} value={m}>{t(`mv_${m}` as any)}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-500">{t("fQuantity")}</label>
            <Input className="min-w-0 w-full" type="number" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            {type === "adjustment" && <p className="text-xs text-zinc-500">{t("fQuantityAdjustHint")}</p>}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-500">{t("fReason")}</label>
            <Input className="min-w-0 w-full" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t("cancel")}</Button>
          <Button onClick={handleSave} disabled={saving || locationId === "" || quantity.trim() === ""}>
            {saving ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function InventoryClient({
  organizerId,
  businessId,
  businessName,
  items,
  locations,
  balances,
  canManageCatalog,
  manageableLocationIds,
}: {
  organizerId: string;
  businessId: string;
  businessName: string;
  items: InventoryItemRow[];
  locations: InventoryLocationRow[];
  balances: InventoryBalanceRow[];
  canManageCatalog: boolean;
  manageableLocationIds: string[];
}) {
  const t = useTranslations("Inventory");
  const locale = useLocale();
  const router = useRouter();
  const tr = useCodeTranslator(t as unknown as (key: any) => string);
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const [adjusting, setAdjusting] = useState<InventoryItemRow | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [creatingLocation, setCreatingLocation] = useState(false);

  const totals = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of balances) m.set(b.item_id, (m.get(b.item_id) ?? 0) + b.on_hand);
    return m;
  }, [balances]);

  const manageableLocations = locations.filter((l) => l.status === "active" && manageableLocationIds.includes(l.id));
  const fmt = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 3 });

  function statusOf(item: InventoryItemRow): "inactive" | "out" | "low" | "ok" {
    if (!item.is_active) return "inactive";
    const total = totals.get(item.id) ?? 0;
    if (total <= 0) return "out";
    if (item.min_stock > 0 && total <= item.min_stock) return "low";
    return "ok";
  }

  const needle = search.trim().toLowerCase();
  const rows = items.filter((item) => {
    if (needle && !`${item.name} ${item.sku ?? ""} ${item.category ?? ""}`.toLowerCase().includes(needle)) return false;
    if (lowOnly) {
      const s = statusOf(item);
      if (s !== "low" && s !== "out") return false;
    }
    return true;
  });

  async function handleCreateLocation() {
    setLocError(null);
    setCreatingLocation(true);
    const res = await ensureDefaultLocation(businessId);
    setCreatingLocation(false);
    if (!res.success) {
      setLocError(tr(res.code, res.error));
      return;
    }
    router.refresh();
  }

  function done() {
    setAdding(false);
    setAdjusting(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <p className="text-xs font-semibold text-zinc-500">{businessName}</p>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-black">{t("title")}</h1>
          <p className="text-sm text-zinc-500">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManageCatalog && locations.length === 0 && (
            <Button variant="outline" size="sm" onClick={handleCreateLocation} disabled={creatingLocation}>
              {t("createLocation")}
            </Button>
          )}
          {canManageCatalog && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="mr-1 h-4 w-4" />
              {t("addItem")}
            </Button>
          )}
        </div>
      </header>

      {locError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{locError}</div>}

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm font-semibold text-zinc-700">{t("empty")}</p>
            <p className="text-sm text-zinc-500">{canManageCatalog ? t("emptyBody") : t("emptyBodyReadOnly")}</p>
            {canManageCatalog && (
              <div className="flex flex-wrap justify-center gap-2">
                {locations.length === 0 && (
                  <Button variant="outline" onClick={handleCreateLocation} disabled={creatingLocation}>{t("createLocation")}</Button>
                )}
                <Button onClick={() => setAdding(true)}>{t("addItem")}</Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="min-w-0 max-w-xs flex-1"
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t("searchPlaceholder")}
            />
            <Button variant={lowOnly ? "default" : "outline"} size="sm" onClick={() => setLowOnly((v) => !v)} aria-pressed={lowOnly}>
              {t("lowStockOnly")}
            </Button>
          </div>

          {locations.length === 0 && manageableLocations.length === 0 && (
            <p className="text-sm text-zinc-500">{t("noLocationHint")}</p>
          )}

          {rows.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("noMatches")}</p>
          ) : (
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 text-left text-xs font-semibold text-zinc-500">
                      <th className="px-4 py-3">{t("colItem")}</th>
                      <th className="px-4 py-3">{t("colCategory")}</th>
                      <th className="px-4 py-3 text-right">{t("colOnHand")}</th>
                      <th className="px-4 py-3 text-right">{t("colMin")}</th>
                      <th className="px-4 py-3">{t("colStatus")}</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((item) => {
                      const status = statusOf(item);
                      return (
                        <tr key={item.id} className="border-b border-zinc-50 last:border-0">
                          <td className="px-4 py-3">
                            <Link href={`/dashboard/org/${organizerId}/inventory/${item.id}?business=${businessId}`} className="font-semibold text-zinc-900 hover:text-orange-700 hover:underline">{item.name}</Link>
                            {item.sku && <p className="text-xs text-zinc-500">{item.sku}</p>}
                          </td>
                          <td className="px-4 py-3 text-zinc-600">{item.category ?? "-"}</td>
                          <td className="px-4 py-3 text-right font-bold text-zinc-900">
                            {fmt(totals.get(item.id) ?? 0)} <span className="text-xs font-normal text-zinc-500">{item.unit}</span>
                          </td>
                          <td className="px-4 py-3 text-right text-zinc-600">{fmt(item.min_stock)}</td>
                          <td className="px-4 py-3">
                            {status === "ok" && <Badge variant="emerald">{t("statusOk")}</Badge>}
                            {status === "low" && <Badge variant="amber">{t("statusLow")}</Badge>}
                            {status === "out" && <Badge variant="rose">{t("statusOut")}</Badge>}
                            {status === "inactive" && <Badge variant="neutral">{t("statusInactive")}</Badge>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {item.is_active && manageableLocations.length > 0 && (
                              <Button variant="outline" size="sm" onClick={() => setAdjusting(item)}>{t("adjust")}</Button>
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
        </>
      )}

      {adding && <AddItemDialog businessId={businessId} onClose={() => setAdding(false)} onDone={done} />}
      {adjusting && (
        <AdjustDialog
          key={adjusting.id}
          businessId={businessId}
          item={adjusting}
          locations={manageableLocations}
          balances={balances}
          onClose={() => setAdjusting(null)}
          onDone={done}
        />
      )}
    </div>
  );
}