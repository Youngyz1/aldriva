"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { IconArrowLeft as ArrowLeft } from "@tabler/icons-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  setInventoryItemActive,
  updateInventoryItem,
  transferStock,
  type InventoryItemType,
  type InventoryBalanceRow,
  type InventoryItemRow,
  type InventoryLocationRow,
  type InventoryMovementRow,
} from "@/lib/actions/inventory";
import { AdjustDialog } from "../InventoryClient";

const EDIT_ITEM_TYPES: InventoryItemType[] = ["supply", "product", "raw_material", "packaging", "asset", "spare_part", "internal"];

function EditItemDialog({
  businessId,
  item,
  onClose,
  onDone,
}: {
  businessId: string;
  item: InventoryItemRow;
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
  const [form, setForm] = useState({
    name: item.name,
    sku: item.sku ?? "",
    category: item.category ?? "",
    unit: item.unit,
    item_type: item.item_type,
    min_stock: String(item.min_stock),
    reorder: item.reorder_quantity === null ? "" : String(item.reorder_quantity),
    cost: item.cost_price === null ? "" : String(item.cost_price),
    price: item.selling_price === null ? "" : String(item.selling_price),
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toNum = (s: string): number | null => (s.trim() === "" ? null : Number(s));

  async function handleSave() {
    setError(null);
    const min = toNum(form.min_stock) ?? 0;
    const reorder = toNum(form.reorder);
    const cost = toNum(form.cost);
    const price = toNum(form.price);
    if ([min, reorder, cost, price].some((v) => v !== null && !Number.isFinite(v))) {
      setError(tr("err_item_price_invalid", ""));
      return;
    }
    setSaving(true);
    const res = await updateInventoryItem(businessId, item.id, {
      name: form.name,
      sku: form.sku || null,
      category: form.category || null,
      unit: form.unit,
      item_type: form.item_type,
      min_stock: min,
      reorder_quantity: reorder,
      cost_price: cost,
      selling_price: price,
    });
    setSaving(false);
    if (!res.success) {
      setError(tr("err_" + res.code, res.error));
      return;
    }
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[32rem]">
        <DialogHeader>
          <DialogTitle>{t("editItem")}</DialogTitle>
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
              <Select className="min-w-0 w-full pr-8" value={form.item_type} onChange={(e) => setForm({ ...form, item_type: e.target.value as InventoryItemType })}>
                {EDIT_ITEM_TYPES.map((ty) => (
                  <option key={ty} value={ty}>{tr("type_" + ty, ty)}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-500">{t("fUnit")}</label>
              <Input className="min-w-0 w-full" maxLength={30} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-500">{t("fMinStock")}</label>
              <Input className="min-w-0 w-full" type="number" min="0" step="0.001" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-500">{t("fReorder")}</label>
              <Input className="min-w-0 w-full" type="number" min="0" step="0.001" value={form.reorder} onChange={(e) => setForm({ ...form, reorder: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-500">{t("fCost")}</label>
              <Input className="min-w-0 w-full" type="number" min="0" step="0.0001" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-500">{t("fPrice")}</label>
              <Input className="min-w-0 w-full" type="number" min="0" step="0.0001" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
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

function TransferDialog({
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
  const tr = (key: string, fallback: string) => {
    try {
      return (t as unknown as (k: any) => string)(key);
    } catch {
      return fallback;
    }
  };
  const onHandAt = (id: string) => balances.find((b) => b.location_id === id)?.on_hand ?? 0;
  const firstWithStock = locations.find((l) => onHandAt(l.id) > 0) ?? locations[0];
  const firstOther = locations.find((l) => l.id !== firstWithStock.id);
  const [from, setFrom] = useState(firstWithStock.id);
  const [to, setTo] = useState(firstOther ? firstOther.id : "");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    const q = Number(qty);
    if (qty.trim() === "" || !Number.isFinite(q) || q <= 0) {
      setError(tr("err_bad_quantity", ""));
      return;
    }
    setSaving(true);
    const res = await transferStock(businessId, {
      item_id: item.id,
      from_location_id: from,
      to_location_id: to,
      quantity: q,
      reason: reason || null,
    });
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
          <DialogTitle>{t("transferStock")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-500">{t("trFrom")}</label>
            <Select className="min-w-0 w-full pr-8" value={from} onChange={(e) => setFrom(e.target.value)}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
            <p className="text-xs text-zinc-500">{t("trAvailable")}: {onHandAt(from)} {item.unit}</p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-500">{t("trTo")}</label>
            <Select className="min-w-0 w-full pr-8" value={to} onChange={(e) => setTo(e.target.value)}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-500">{t("fQuantity")}</label>
            <Input className="min-w-0 w-full" type="number" min="0" step="0.001" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-500">{t("fReason")}</label>
            <Input className="min-w-0 w-full" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t("cancel")}</Button>
          <Button onClick={handleSave} disabled={saving || to === "" || from === to}>{saving ? t("saving") : t("transferStock")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ItemDetailClient({
  organizerId,
  businessId,
  businessName,
  item,
  locations,
  balances,
  movements,
  canManageCatalog,
  manageableLocationIds,
}: {
  organizerId: string;
  businessId: string;
  businessName: string;
  item: InventoryItemRow;
  locations: InventoryLocationRow[];
  balances: InventoryBalanceRow[];
  movements: InventoryMovementRow[];
  canManageCatalog: boolean;
  manageableLocationIds: string[];
}) {
  const t = useTranslations("Inventory");
  const locale = useLocale();
  const router = useRouter();
  const [adjusting, setAdjusting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [transfersOnly, setTransfersOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tr = (key: string, fallback: string) => {
    try {
      return (t as unknown as (k: any) => string)(key);
    } catch {
      return fallback;
    }
  };
  const fmt = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 3 });
  const money = (n: number | null) => (n === null ? "-" : n.toLocaleString(locale, { maximumFractionDigits: 4 }));
  const locName = (id: string) => locations.find((l) => l.id === id)?.name ?? "-";
  const locCell = (m: InventoryMovementRow) => {
    if (m.reference_id && (m.movement_type === "transfer_out" || m.movement_type === "transfer_in")) {
      const other = movements.find((o) => o.reference_id === m.reference_id && o.id !== m.id);
      if (other) {
        const out = m.movement_type === "transfer_out" ? m : other;
        const inn = m.movement_type === "transfer_out" ? other : m;
        return locName(out.location_id) + " \u2192 " + locName(inn.location_id);
      }
    }
    return locName(m.location_id);
  };

  const total = balances.reduce((sum, b) => sum + b.on_hand, 0);
  const shownMovements = transfersOnly ? movements.filter((m) => m.movement_type === "transfer_out" || m.movement_type === "transfer_in") : movements;
  const manageable = locations.filter((l) => l.status === "active" && manageableLocationIds.includes(l.id));
  const status: "inactive" | "out" | "low" | "ok" = !item.is_active
    ? "inactive"
    : total <= 0
      ? "out"
      : item.min_stock > 0 && total <= item.min_stock
        ? "low"
        : "ok";

  async function toggleActive() {
    setError(null);
    setBusy(true);
    const res = await setInventoryItemActive(businessId, item.id, !item.is_active);
    setBusy(false);
    if (!res.success) {
      setError(tr(`err_${res.code}`, res.error));
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

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-black">{item.name}</h1>
            {status === "ok" && <Badge variant="emerald">{t("statusOk")}</Badge>}
            {status === "low" && <Badge variant="amber">{t("statusLow")}</Badge>}
            {status === "out" && <Badge variant="rose">{t("statusOut")}</Badge>}
            {status === "inactive" && <Badge variant="neutral">{t("statusInactive")}</Badge>}
          </div>
          <p className="text-sm text-zinc-500">
            {fmt(total)} {item.unit} {t("inTotal")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {item.is_active && manageable.length > 0 && (
            <Button size="sm" onClick={() => setAdjusting(true)}>{t("adjust")}</Button>
          )}
          {item.is_active && manageable.length >= 2 && (
            <Button size="sm" variant="outline" onClick={() => setTransferring(true)}>{t("transferStock")}</Button>
          )}
          {canManageCatalog && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>{t("editItem")}</Button>
          )}
          {canManageCatalog && (
            <Button size="sm" variant="outline" onClick={toggleActive} disabled={busy}>
              {item.is_active ? t("deactivate") : t("activate")}
            </Button>
          )}
        </div>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [t("fSku"), item.sku ?? "-"],
            [t("fCategory"), item.category ?? "-"],
            [t("fType"), tr(`type_${item.item_type}`, item.item_type)],
            [t("fUnit"), item.unit],
            [t("fMinStock"), fmt(item.min_stock)],
            [t("fReorder"), item.reorder_quantity === null ? "-" : fmt(item.reorder_quantity)],
            [t("fCost"), money(item.cost_price)],
            [t("fPrice"), money(item.selling_price)],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-xs font-semibold text-zinc-500">{label}</p>
              <p className="text-sm font-semibold text-zinc-900">{value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-black">{t("detailStock")}</h2>
        {balances.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("noBalances")}</p>
        ) : (
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs font-semibold text-zinc-500">
                    <th className="px-4 py-3">{t("colLocation")}</th>
                    <th className="px-4 py-3 text-right">{t("colOnHand")}</th>
                    <th className="px-4 py-3 text-right">{t("colReserved")}</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b) => (
                    <tr key={b.location_id} className="border-b border-zinc-50 last:border-0">
                      <td className="px-4 py-3 font-semibold text-zinc-900">{locName(b.location_id)}</td>
                      <td className="px-4 py-3 text-right font-bold">{fmt(b.on_hand)}</td>
                      <td className="px-4 py-3 text-right text-zinc-600">{fmt(b.reserved)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-black">{t("detailMovements")}</h2>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600">
            <input type="checkbox" checked={transfersOnly} onChange={(e) => setTransfersOnly(e.target.checked)} />
            {t("filterTransfersOnly")}
          </label>
        </div>
        {movements.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("noMovements")}</p>
        ) : (
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs font-semibold text-zinc-500">
                    <th className="px-4 py-3">{t("colDate")}</th>
                    <th className="px-4 py-3">{t("fMovement")}</th>
                    <th className="px-4 py-3">{t("colLocation")}</th>
                    <th className="px-4 py-3 text-right">{t("fQuantity")}</th>
                    <th className="px-4 py-3 text-right">{t("colBalanceAfter")}</th>
                    <th className="px-4 py-3">{t("colReason")}</th>
                    <th className="px-4 py-3">{t("colBy")}</th>
                  </tr>
                </thead>
                <tbody>
                  {shownMovements.map((m) => (
                    <tr key={m.id} className="border-b border-zinc-50 last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-600">
                        {new Date(m.created_at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
                      </td>
                      <td className="px-4 py-3 font-semibold text-zinc-900">{tr(`mv_${m.movement_type}`, m.movement_type)}</td>
                      <td className="px-4 py-3 text-zinc-600">{locCell(m)}</td>
                      <td className={`px-4 py-3 text-right font-bold ${m.quantity > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {m.quantity > 0 ? "+" : ""}{fmt(m.quantity)}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-900">{fmt(m.balance_after)}</td>
                      <td className="px-4 py-3 text-zinc-600">{m.reason ?? "-"}</td>
                      <td className="px-4 py-3 text-zinc-600">{m.by_me ? t("you") : (m.created_by_name ?? t("unknownUser"))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
        {movements.length >= 200 && <p className="text-xs text-zinc-500">{t("movementsLimit")}</p>}
      </section>

      {transferring && (
        <TransferDialog
          key={item.id}
          businessId={businessId}
          item={item}
          locations={manageable}
          balances={balances}
          onClose={() => setTransferring(false)}
          onDone={() => { setTransferring(false); router.refresh(); }}
        />
      )}

      {editing && (
        <EditItemDialog
          key={item.id}
          businessId={businessId}
          item={item}
          onClose={() => setEditing(false)}
          onDone={() => { setEditing(false); router.refresh(); }}
        />
      )}

      {adjusting && (
        <AdjustDialog
          key={item.id}
          businessId={businessId}
          item={item}
          locations={manageable}
          balances={balances}
          onClose={() => setAdjusting(false)}
          onDone={() => { setAdjusting(false); router.refresh(); }}
        />
      )}
    </div>
  );
}