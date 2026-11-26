"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { IconArrowLeft as ArrowLeft } from "@tabler/icons-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  setInventoryItemActive,
  type InventoryBalanceRow,
  type InventoryItemRow,
  type InventoryLocationRow,
  type InventoryMovementRow,
} from "@/lib/actions/inventory";
import { AdjustDialog } from "../InventoryClient";

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

  const total = balances.reduce((sum, b) => sum + b.on_hand, 0);
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
        <h2 className="text-sm font-black">{t("detailMovements")}</h2>
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
                    <th className="px-4 py-3">{t("fReason")}</th>
                    <th className="px-4 py-3">{t("colBy")}</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id} className="border-b border-zinc-50 last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-600">
                        {new Date(m.created_at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
                      </td>
                      <td className="px-4 py-3 font-semibold text-zinc-900">{tr(`mv_${m.movement_type}`, m.movement_type)}</td>
                      <td className="px-4 py-3 text-zinc-600">{locName(m.location_id)}</td>
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