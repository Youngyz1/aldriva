"use client";

import { useState, useTransition } from "react";
import {
  IconPlus as Plus,
  IconQrcode as Qrcode,
  IconDownload as Download,
  IconPrinter as Printer,
  IconRotateClockwise as RotateCw,
  IconTrash as Trash2,
  IconEdit as Edit3,
  IconCheck as Check,
  IconAlertCircle as AlertCircle,
  IconArmchair as Armchair,
  IconClock as Clock,
  IconReceipt as Receipt,
  IconX as X,
} from "@tabler/icons-react";
import {
  createBusinessTable,
  updateBusinessTable,
  deleteBusinessTable,
  regenerateTableQrCode,
  updateBusinessTableOrderingMode,
  closeTableSession,
  getTableRunningBill,
  markTablePaidAndCloseSession,
  type TableWithQr,
} from "@/lib/actions/table-management";
import type { TableOrderingMode, QrRedirectCode } from "@/lib/table-qr";
import type { TableRunningBill } from "@/lib/table-bill";
import { ONLINE_PAYMENT_CURRENCIES } from "@/lib/storefront-features";

interface TableManagerClientProps {
  businessId: string;
  businessName: string;
  businessSlug: string;
  initialTables: TableWithQr[];
  initialMenuQr?: QrRedirectCode | null;
  initialOrderingMode: TableOrderingMode;
  onlinePaymentsAvailable: boolean;
  canManage: boolean;
  canDelete: boolean;
}

const ORDERING_MODES: Array<{
  key: TableOrderingMode;
  title: string;
  description: string;
}> = [
  {
    key: "order_pay_later",
    title: "Order Now & Pay Later (Default)",
    description: "Guests scan, order from their phone, and settle the running bill at the end (cash or card).",
  },
  {
    key: "menu_only",
    title: "Digital Menu Only",
    description: "QR opens the menu for browsing only; order button is disabled. Guests order through waiters.",
  },
  {
    key: "order_pay_now",
    title: "Order & Pay Now",
    description: "Guests submit their order and pay right at the table before or upon arrival of items.",
  },
  {
    key: "pay_online_first",
    title: "Pay Online First",
    description: "Orders require immediate online payment (Stripe/Card) before firing to the kitchen.",
  },
  {
    key: "disabled",
    title: "Disabled",
    description: "Table ordering and table QR sessions are completely disabled.",
  },
];

export function TableManagerClient({
  businessId,
  businessName,
  businessSlug,
  initialTables,
  initialMenuQr,
  initialOrderingMode,
  onlinePaymentsAvailable,
  canManage,
  canDelete,
}: TableManagerClientProps) {
  const [tables, setTables] = useState<TableWithQr[]>(initialTables);
  const [menuQr] = useState<QrRedirectCode | null>(initialMenuQr || null);
  const [orderingMode, setOrderingMode] = useState<TableOrderingMode>(initialOrderingMode);

  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTableLabel, setNewTableLabel] = useState("");
  const [newTablePosition, setNewTablePosition] = useState(0);

  const [editingTable, setEditingTable] = useState<TableWithQr | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editPosition, setEditPosition] = useState(0);
  const [editIsActive, setEditIsActive] = useState(true);

  const [selectedQrCode, setSelectedQrCode] = useState<{
    title: string;
    code: string;
    url: string;
  } | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);

  const [showPrintAll, setShowPrintAll] = useState(false);

  // Table Bill Modal states (Phase 4)
  const [billTable, setBillTable] = useState<TableWithQr | null>(null);
  const [billData, setBillData] = useState<TableRunningBill | null>(null);
  const [loadingBill, setLoadingBill] = useState(false);
  const [settlingPayment, setSettlingPayment] = useState(false);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://aldriva.com";

  function clearMessages() {
    setActionError(null);
    setActionSuccess(null);
  }

  // Open Staff Running Bill Modal
  async function openBillModal(table: TableWithQr) {
    if (!table.active_session) return;
    setBillTable(table);
    setBillData(null);
    setLoadingBill(true);
    try {
      const res = await getTableRunningBill(businessId, table.id, table.active_session.id);
      if (res.success && res.bill) {
        setBillData(res.bill);
      }
    } catch {
      // ignore
    } finally {
      setLoadingBill(false);
    }
  }

  // Handle Mark Paid and Close Session
  async function handleMarkPaidAndClose() {
    if (!billTable || !billTable.active_session) return;
    setSettlingPayment(true);
    clearMessages();
    try {
      const res = await markTablePaidAndCloseSession({
        tableSessionId: billTable.active_session.id,
        businessId,
      });
      if (!res.success) {
        setActionError(res.error || "Failed to settle table.");
        return;
      }
      setTables((prev) =>
        prev.map((t) => (t.id === billTable.id ? { ...t, active_session: null } : t))
      );
      setActionSuccess(`Table "${billTable.label}" marked paid and released for next party.`);
      setBillTable(null);
      setBillData(null);
    } catch {
      setActionError("An unexpected error occurred while settling the table.");
    } finally {
      setSettlingPayment(false);
    }
  }

  // Handle Add Table
  function handleAddTable(e: React.FormEvent) {
    e.preventDefault();
    if (!newTableLabel.trim()) return;
    clearMessages();

    startTransition(async () => {
      const res = await createBusinessTable({
        businessId,
        label: newTableLabel.trim(),
        position: newTablePosition,
      });

      if (!res.success || !res.table) {
        setActionError(res.error || "Failed to create table");
        return;
      }

      setTables((prev) => [...prev, res.table!].sort((a, b) => a.position - b.position || a.label.localeCompare(b.label)));
      setNewTableLabel("");
      setNewTablePosition(tables.length + 1);
      setShowAddModal(false);
      setActionSuccess(`Table "${res.table.label}" created successfully.`);
    });
  }

  // Handle Edit Table
  function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTable || !editLabel.trim()) return;
    clearMessages();

    startTransition(async () => {
      const res = await updateBusinessTable({
        tableId: editingTable.id,
        label: editLabel.trim(),
        position: editPosition,
        is_active: editIsActive,
      });

      if (!res.success) {
        setActionError(res.error || "Failed to update table");
        return;
      }

      setTables((prev) =>
        prev
          .map((t) => (t.id === editingTable.id ? { ...t, label: editLabel.trim(), position: editPosition, is_active: editIsActive } : t))
          .sort((a, b) => a.position - b.position || a.label.localeCompare(b.label))
      );
      setEditingTable(null);
      setActionSuccess(`Table "${editLabel.trim()}" updated.`);
    });
  }

  // Handle Delete Table
  function handleDeleteTable(table: TableWithQr) {
    if (!confirm(`Are you sure you want to delete table "${table.label}"? Any associated active QR codes will be removed.`)) {
      return;
    }
    clearMessages();

    startTransition(async () => {
      const res = await deleteBusinessTable(table.id);
      if (!res.success) {
        setActionError(res.error || "Failed to delete table");
        return;
      }

      setTables((prev) => prev.filter((t) => t.id !== table.id));
      setActionSuccess(`Table "${table.label}" deleted.`);
    });
  }

  // Handle Regenerate QR
  function handleRegenerateQr(table: TableWithQr) {
    if (
      !confirm(
        `Regenerate QR code for table "${table.label}"? Previously printed codes for this table will immediately stop working.`
      )
    ) {
      return;
    }
    clearMessages();

    startTransition(async () => {
      const res = await regenerateTableQrCode(table.id);
      if (!res.success || !res.qrCode) {
        setActionError(res.error || "Failed to regenerate QR code");
        return;
      }

      setTables((prev) =>
        prev.map((t) => (t.id === table.id ? { ...t, qr_code: res.qrCode! } : t))
      );
      setActionSuccess(`New QR code generated for "${table.label}". Old codes are now inactive.`);
    });
  }

  // Handle Ordering Mode Change
  function handleOrderingModeChange(mode: TableOrderingMode) {
    clearMessages();
    startTransition(async () => {
      const res = await updateBusinessTableOrderingMode(businessId, mode);
      if (!res.success) {
        setActionError(res.error || "Failed to update ordering mode");
        return;
      }
      setOrderingMode(mode);
      setActionSuccess("Ordering mode updated.");
    });
  }

  // Handle Close Session
  function handleCloseSession(table: TableWithQr) {
    if (!table.active_session) return;
    if (!confirm(`Close active session for table "${table.label}"?`)) return;
    clearMessages();

    startTransition(async () => {
      const res = await closeTableSession(table.active_session!.id);
      if (!res.success) {
        setActionError(res.error || "Failed to close session");
        return;
      }
      setTables((prev) =>
        prev.map((t) => (t.id === table.id ? { ...t, active_session: null } : t))
      );
      setActionSuccess(`Session for "${table.label}" closed.`);
    });
  }

  // Show QR modal and render SVG
  async function openQrModal(title: string, code: string) {
    const targetUrl = `${baseUrl}/q/${code}`;
    setSelectedQrCode({ title, code, url: targetUrl });
    try {
      const QRCode = await import("qrcode");
      const svg = await QRCode.toString(targetUrl, {
        type: "svg",
        width: 320,
        margin: 2,
        color: { dark: "#09090b", light: "#ffffff" },
      });
      setQrSvg(svg);
    } catch (err) {
      console.error("QR render error:", err);
    }
  }

  // Download QR as PNG
  async function downloadQrPng(title: string, code: string) {
    const targetUrl = `${baseUrl}/q/${code}`;
    try {
      const QRCode = await import("qrcode");
      const dataUrl = await QRCode.toDataURL(targetUrl, {
        width: 1024,
        margin: 3,
        color: { dark: "#09090b", light: "#ffffff" },
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${businessSlug}-${title.toLowerCase().replace(/\s+/g, "-")}-qr.png`;
      link.click();
    } catch (err) {
      console.error("QR download error:", err);
    }
  }

  return (
    <div className="space-y-8">
      {/* Alert Banners */}
      {actionError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <Check className="w-5 h-5 shrink-0 text-emerald-600" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Section 1: Ordering Mode Setting */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Table Ordering Mode</h2>
          <p className="text-sm text-zinc-500">
            Controls how customers interact when scanning QR codes at tables.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ORDERING_MODES.map((mode) => {
            const isSelected = orderingMode === mode.key;
            return (
              <button
                key={mode.key}
                type="button"
                disabled={!canManage || isPending}
                onClick={() => handleOrderingModeChange(mode.key)}
                className={`text-left p-4 rounded-xl border transition flex flex-col justify-between ${
                  isSelected
                    ? "border-orange-600 bg-orange-50/50 ring-1 ring-orange-600"
                    : "border-zinc-200 hover:border-zinc-300 bg-white"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-zinc-900">{mode.title}</span>
                    {isSelected && <Check className="w-4 h-4 text-orange-600" />}
                  </div>
                  <p className="text-xs text-zinc-600 leading-relaxed">{mode.description}</p>
                </div>
              </button>
            );
          })}
        </div>
        {orderingMode === "pay_online_first" && !onlinePaymentsAvailable ? (
          <p role="status" className="text-sm text-amber-800">
            Pay Online First requires online card payment. Card payments currently support {ONLINE_PAYMENT_CURRENCIES.join(", ")} only and require the Stripe platform connection. Choose Order Now &amp; Pay Later or Order &amp; Pay Now so guests can settle at the table.
          </p>
        ) : null}
      </section>

      {/* Section 2: Business Menu Point-of-Entry QR */}
      {menuQr && (
        <section className="space-y-3 pt-4 border-t border-zinc-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">General Menu QR Code</h2>
              <p className="text-sm text-zinc-500">
                Single QR code for entrance, takeaway counters, or promotional flyers.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openQrModal("Menu", menuQr.code)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 transition"
              >
                <Qrcode className="w-4 h-4" />
                <span>View</span>
              </button>
              <button
                type="button"
                onClick={() => downloadQrPng("Menu", menuQr.code)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 transition"
              >
                <Download className="w-4 h-4" />
                <span>Download PNG</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Section 3: Tables & Table QR Codes */}
      <section className="space-y-4 pt-4 border-t border-zinc-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Dining Tables ({tables.length})</h2>
            <p className="text-sm text-zinc-500">
              Each table has a dedicated short redirect QR code that survives domain and URL changes.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {tables.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPrintAll(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 transition"
              >
                <Printer className="w-4 h-4 text-zinc-600" />
                <span>Print All Tables Sheet</span>
              </button>
            )}

            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setNewTableLabel(`Table ${tables.length + 1}`);
                  setNewTablePosition(tables.length + 1);
                  setShowAddModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-orange-700 text-white hover:bg-orange-800 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Add Table</span>
              </button>
            )}
          </div>
        </div>

        {/* Empty State */}
        {tables.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-zinc-200 rounded-2xl">
            <Armchair className="w-10 h-10 mx-auto text-zinc-300 mb-2" />
            <p className="text-base font-semibold text-zinc-800">No tables defined yet</p>
            <p className="text-sm text-zinc-500 max-w-sm mx-auto mt-1 mb-4">
              Add your dining tables to generate unique QR codes for dine-in menu browsing and ordering.
            </p>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setNewTableLabel("Table 1");
                  setNewTablePosition(1);
                  setShowAddModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-orange-700 text-white hover:bg-orange-800 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Add First Table</span>
              </button>
            )}
          </div>
        ) : (
          /* Table List */
          <div className="border border-zinc-200 rounded-2xl overflow-hidden divide-y divide-zinc-100 bg-white">
            {tables.map((t) => (
              <div
                key={t.id}
                className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-zinc-50/50 transition"
              >
                {/* Left: Info & Badges */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0">
                    <span className="font-bold text-sm text-orange-800">#{t.position}</span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base text-zinc-900">{t.label}</span>
                      {!t.is_active && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 text-zinc-600">
                          Inactive
                        </span>
                      )}
                      {t.active_session && (
                        t.active_session.status === "bill_requested" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                            <Receipt className="w-3.5 h-3.5" />
                            <span>Bill Requested</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Active Session</span>
                          </span>
                        )
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500 font-mono">
                      <span>Code: /q/{t.qr_code?.code || "—"}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {t.active_session && canManage && (
                    <>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => openBillModal(t)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg border transition cursor-pointer ${
                          t.active_session.status === "bill_requested"
                            ? "border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100 ring-2 ring-amber-200"
                            : "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                        }`}
                        title="View running bill and settle table"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>{t.active_session.status === "bill_requested" ? "Settle Bill" : "View Bill"}</span>
                      </button>

                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleCloseSession(t)}
                        className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition cursor-pointer"
                        title="Quick close session"
                      >
                        <span>Close</span>
                      </button>
                    </>
                  )}

                  {t.qr_code && (
                    <>
                      <button
                        type="button"
                        onClick={() => openQrModal(t.label, t.qr_code!.code)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 transition"
                      >
                        <Qrcode className="w-3.5 h-3.5" />
                        <span>View QR</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => downloadQrPng(t.label, t.qr_code!.code)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 transition"
                        title="Download PNG for print"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>PNG</span>
                      </button>

                      {canManage && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleRegenerateQr(t)}
                          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition"
                          title="Regenerate QR (invalidates old printed code)"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}

                  {canManage && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTable(t);
                        setEditLabel(t.label);
                        setEditPosition(t.position);
                        setEditIsActive(t.is_active);
                      }}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition"
                      title="Edit table"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  )}

                  {canDelete && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleDeleteTable(t)}
                      className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition"
                      title="Delete table"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modal 1: Add Table */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-zinc-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900">Add Dining Table</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddTable} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Table Label *
                </label>
                <input
                  type="text"
                  required
                  maxLength={50}
                  value={newTableLabel}
                  onChange={(e) => setNewTableLabel(e.target.value)}
                  placeholder="e.g. Table 1, Patio 4, Booth A"
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:border-orange-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Sort Position (Order)
                </label>
                <input
                  type="number"
                  min={0}
                  value={newTablePosition}
                  onChange={(e) => setNewTablePosition(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:border-orange-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !newTableLabel.trim()}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-orange-700 text-white hover:bg-orange-800 disabled:opacity-50"
                >
                  {isPending ? "Creating..." : "Create Table"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Edit Table */}
      {editingTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-zinc-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900">Edit {editingTable.label}</h3>
              <button
                type="button"
                onClick={() => setEditingTable(null)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Table Label *
                </label>
                <input
                  type="text"
                  required
                  maxLength={50}
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:border-orange-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Sort Position
                </label>
                <input
                  type="number"
                  min={0}
                  value={editPosition}
                  onChange={(e) => setEditPosition(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:border-orange-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="editIsActive"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  className="rounded text-orange-600 focus:ring-orange-500"
                />
                <label htmlFor="editIsActive" className="text-xs font-semibold text-zinc-700">
                  Table is active (uncheck to temporarily close)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingTable(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !editLabel.trim()}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-orange-700 text-white hover:bg-orange-800 disabled:opacity-50"
                >
                  {isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: View Single QR Code */}
      {selectedQrCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-zinc-200 text-center space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900">{selectedQrCode.title} QR Code</h3>
              <button
                type="button"
                onClick={() => {
                  setSelectedQrCode(null);
                  setQrSvg(null);
                }}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-white p-4 rounded-xl border border-zinc-200 flex items-center justify-center min-h-[260px]">
              {qrSvg ? (
                <div
                  className="w-full flex items-center justify-center"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              ) : (
                <span className="text-xs text-zinc-400">Rendering code...</span>
              )}
            </div>

            <div className="text-left bg-zinc-50 rounded-xl p-3 border border-zinc-200 text-xs font-mono text-zinc-600 break-all">
              {selectedQrCode.url}
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => downloadQrPng(selectedQrCode.title, selectedQrCode.code)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 transition"
              >
                <Download className="w-4 h-4" />
                <span>Download PNG</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Print All Tables Sheet */}
      {showPrintAll && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-y-auto p-6 md:p-12 print:p-0">
          <div className="max-w-4xl mx-auto w-full space-y-6">
            <div className="flex items-center justify-between print:hidden border-b border-zinc-200 pb-4">
              <div>
                <h3 className="text-lg font-bold text-zinc-900">{businessName} — QR Code Sheets</h3>
                <p className="text-xs text-zinc-500">
                  Ready to print for table tents, stickers, or stands.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-orange-700 text-white hover:bg-orange-800 transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Sheet</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintAll(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Grid of table tents */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {tables.map((t) => {
                const targetUrl = `${baseUrl}/q/${t.qr_code?.code || ""}`;
                return (
                  <div
                    key={t.id}
                    className="p-6 border-2 border-zinc-900 rounded-2xl flex flex-col items-center text-center space-y-3 bg-white"
                  >
                    <div className="font-bold text-xs uppercase tracking-wider text-zinc-500">
                      {businessName}
                    </div>
                    <div className="text-2xl font-black text-zinc-900">{t.label}</div>

                    <div className="w-48 h-48 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center justify-center p-2">
                      <PrintableQrImage url={targetUrl} />
                    </div>

                    <div className="text-xs font-semibold text-zinc-700">
                      Scan to view menu & order
                    </div>
                    <div className="text-[10px] font-mono text-zinc-400">
                      aldriva.com • table #{t.position}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal 5: Staff Running Bill & Settlement Modal (Phase 4) */}
      {billTable && billTable.active_session && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] flex flex-col space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center">
                  <Receipt className="w-5 h-5 text-orange-700" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900">
                    Running Bill — {billTable.label}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    {billTable.active_session.status === "bill_requested" ? (
                      <span className="text-amber-700 font-semibold">Bill Requested by Guest</span>
                    ) : (
                      "Active dining session"
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBillTable(null)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {loadingBill ? (
                <div className="py-8 text-center text-zinc-500">Loading running bill…</div>
              ) : !billData || billData.orders.length === 0 ? (
                <div className="py-8 text-center text-zinc-500 space-y-1">
                  <p className="font-semibold text-zinc-800">No orders in this session yet</p>
                  <p className="text-xs text-zinc-500">Orders placed by guests will appear here itemized.</p>
                </div>
              ) : (
                <>
                  {/* Itemized Order Receipts */}
                  <div className="space-y-2.5">
                    {billData.orders.map((ord) => (
                      <div key={ord.orderId} className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 space-y-2">
                        <div className="flex items-center justify-between border-b border-zinc-200/80 pb-1.5 text-xs">
                          <span className="font-bold text-zinc-900">Order #{ord.orderNumber}</span>
                          <span className="text-zinc-500">
                            {ord.paymentStatus === "paid" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                                Paid Online
                              </span>
                            ) : ord.waiterConfirmation === "pending" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                                Awaiting Confirmation
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-200 text-zinc-700">
                                Unpaid at Table
                              </span>
                            )}
                          </span>
                        </div>

                        <ul className="space-y-1">
                          {ord.items.map((it, idx) => (
                            <li key={idx} className="flex items-start justify-between text-xs">
                              <div className="min-w-0 flex-1 pr-2">
                                <span className="font-bold text-zinc-500 mr-1.5">{it.quantity}×</span>
                                <span className="text-zinc-900 font-medium">{it.name}</span>
                                {it.chosen_options && it.chosen_options.length > 0 && (
                                  <p className="text-[11px] text-zinc-500 pl-5">
                                    {it.chosen_options.map((o) => o.name).join(", ")}
                                  </p>
                                )}
                              </div>
                              <span className="tabular-nums font-semibold text-zinc-900 shrink-0">
                                {billData.currency} {it.line_total.toFixed(2)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>

                  {/* Financial Breakdown */}
                  <div className="rounded-xl bg-zinc-100/80 border border-zinc-200 p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs text-zinc-600">
                      <span>Total Orders ({billData.orderCount})</span>
                      <span className="tabular-nums font-semibold text-zinc-900">
                        {billData.currency} {billData.totalAmount.toFixed(2)}
                      </span>
                    </div>

                    {billData.paidAmount > 0 && (
                      <div className="flex items-center justify-between text-xs text-emerald-700 font-medium">
                        <span>Paid Online</span>
                        <span className="tabular-nums">
                          - {billData.currency} {billData.paidAmount.toFixed(2)}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-300 text-sm font-bold text-zinc-900">
                      <span>Balance to Collect</span>
                      <span className="tabular-nums text-orange-700 text-base">
                        {billData.currency} {billData.unpaidAmount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="pt-2 border-t border-zinc-200 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setBillTable(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 transition cursor-pointer"
              >
                Close View
              </button>

              <button
                type="button"
                disabled={settlingPayment}
                onClick={handleMarkPaidAndClose}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 transition disabled:opacity-50 shadow-xs cursor-pointer"
              >
                {settlingPayment
                  ? "Settling…"
                  : billData && billData.unpaidAmount > 0
                  ? `Mark Paid & Release Table (${billData.currency} ${billData.unpaidAmount.toFixed(2)})`
                  : "Close & Release Table"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PrintableQrImage({ url }: { url: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useState(() => {
    import("qrcode").then((QRCode) => {
      QRCode.toDataURL(url, {
        width: 384,
        margin: 2,
        color: { dark: "#09090b", light: "#ffffff" },
      }).then(setDataUrl);
    });
  });

  if (!dataUrl) {
    return <span className="text-xs text-zinc-400">Rendering...</span>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={dataUrl} alt="Table QR" className="w-full h-full object-contain" />
  );
}
