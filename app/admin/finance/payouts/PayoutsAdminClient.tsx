"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Loader2,
  X,
  FileCheck,
  Building,
  User,
  ShoppingBag,
} from "lucide-react";
import {
  getAdminPayoutQueue,
  transitionPayoutProcessing,
  completePayout,
  failPayout,
  type AdminPayoutQueueItem,
  type PayoutStatus,
} from "@/lib/payouts";
import AdminTable from "@/components/admin/table/AdminTable";
import TableToolbar from "@/components/admin/table/TableToolbar";
import type { AdminColumn, RowActionsConfig } from "@/components/admin/table/types";
import { tableStrings } from "@/components/admin/table/strings";
import PageHeader from "@/components/admin/PageHeader";
import StatStrip from "@/components/admin/StatStrip";
import { formatCurrencyTotal, groupVolumeByCurrency, payoutsStrings as s } from "./payouts-strings";

export default function PayoutsAdminClient({
  initialQueue,
  initialError,
  initialFilter = "all",
}: {
  initialQueue: AdminPayoutQueueItem[];
  initialError: string | null;
  initialFilter?: string;
}) {
  const router = useRouter();
  const [queue, setQueue] = useState<AdminPayoutQueueItem[]>(initialQueue);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError);
  const [activeFilter, setActiveFilter] = useState<string>(initialFilter);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);

  // Transition / Processing state
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Completion Modal State
  const [completingItem, setCompletingItem] = useState<AdminPayoutQueueItem | null>(null);
  const [externalPayoutIdInput, setExternalPayoutIdInput] = useState("");
  const [isSubmittingComplete, setIsSubmittingComplete] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  // Failure Modal State
  const [failingItem, setFailingItem] = useState<AdminPayoutQueueItem | null>(null);
  const [failureReasonInput, setFailureReasonInput] = useState("");
  const [isSubmittingFail, setIsSubmittingFail] = useState(false);
  const [failError, setFailError] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  async function refetchQueue(filter?: string) {
    const f = filter || activeFilter;
    try {
      setErrorMsg(null);
      const data = await getAdminPayoutQueue(f);
      setQueue(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to refresh payout queue.");
    }
  }

  function handleFilterChange(filter: string) {
    setActiveFilter(filter);
    refetchQueue(filter);
  }

  async function handleStartProcessing(payoutId: string) {
    try {
      setProcessingId(payoutId);
      await transitionPayoutProcessing(payoutId);
      showToast("Payout status updated to Processing.");
      await refetchQueue();
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to transition payout status.");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleCompleteSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!completingItem) return;
    setCompleteError(null);

    if (!externalPayoutIdInput.trim()) {
      setCompleteError("Please enter an external payout transaction reference.");
      return;
    }

    try {
      setIsSubmittingComplete(true);
      await completePayout(completingItem.id, externalPayoutIdInput.trim());
      showToast(`Payout ${completingItem.id.slice(0, 8)} marked as Completed.`);
      setCompletingItem(null);
      setExternalPayoutIdInput("");
      await refetchQueue();
      router.refresh();
    } catch (err) {
      setCompleteError(err instanceof Error ? err.message : "Failed to complete payout.");
    } finally {
      setIsSubmittingComplete(false);
    }
  }

  async function handleFailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!failingItem) return;
    setFailError(null);

    if (!failureReasonInput.trim()) {
      setFailError("Please specify a failure reason.");
      return;
    }

    try {
      setIsSubmittingFail(true);
      await failPayout(failingItem.id, failureReasonInput.trim());
      showToast(`Payout ${failingItem.id.slice(0, 8)} marked as Failed. Ledger credit issued.`);
      setFailingItem(null);
      setFailureReasonInput("");
      await refetchQueue();
      router.refresh();
    } catch (err) {
      setFailError(err instanceof Error ? err.message : "Failed to fail payout.");
    } finally {
      setIsSubmittingFail(false);
    }
  }

  /** Dot colors carry the old badge semantics (amber/blue/emerald/rose/zinc). */
  const STATUS_DOT: Record<PayoutStatus, string> = {
    requested: "bg-amber-500",
    processing: "bg-blue-500",
    completed: "bg-emerald-500",
    failed: "bg-rose-500",
    cancelled: "bg-zinc-400",
  };

  function isTerminal(status: PayoutStatus) {
    return status === "completed" || status === "failed" || status === "cancelled";
  }

  // Priority hiding (detail first, then meta; title/value never hide):
  // payout id/date below 1024px container, destination below 800px.
  const columns: AdminColumn[] = [
    { id: "recipient", header: s.columns.recipient, role: "title" },
    { id: "amount", header: s.columns.amount, role: "value", align: "right" },
    { id: "status", header: s.columns.status, role: "meta" },
    { id: "destination", header: s.columns.destination, role: "meta", hideBelow: "md" },
    { id: "payout", header: s.columns.payout, role: "detail", hideBelow: "lg" },
  ];

  /**
   * Requested rows: primary starts processing (same handler, same
   * "Updating..." working label), menu opens the unchanged modals.
   * Processing rows: primary opens the Complete modal, Fail stays menu-only
   * and destructive-last. Terminal rows carry no actions; the Terminal
   * marker moves into the status cell and the expansion.
   */
  function buildRowActions(item: AdminPayoutQueueItem): RowActionsConfig | undefined {
    if (isTerminal(item.status)) return undefined;
    const openComplete = () => {
      setCompletingItem(item);
      setExternalPayoutIdInput(`tr_${crypto.randomUUID().slice(0, 8)}`);
    };
    const openFail = () => {
      setFailingItem(item);
      setFailureReasonInput("");
    };
    if (item.status === "requested") {
      return {
        primary: {
          key: "process",
          label: processingId === item.id ? s.updating : s.startProcessing,
          onSelect: () => handleStartProcessing(item.id),
          disabled: processingId === item.id,
        },
        menu: [
          { key: "complete", label: s.complete, onSelect: openComplete },
          { key: "fail", label: s.fail, onSelect: openFail, destructive: true },
        ],
      };
    }
    return {
      primary: { key: "complete", label: s.complete, onSelect: openComplete },
      menu: [{ key: "fail", label: s.fail, onSelect: openFail, destructive: true }],
    };
  }

  function getRecipientTypeBadge(type: string) {
    switch (type) {
      case "organizer":
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">
            <Building size={10} /> Organizer
          </span>
        );
      case "business":
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">
            <ShoppingBag size={10} /> Business
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-700">
            <User size={10} /> User
          </span>
        );
    }
  }

  const filteredQueue = queue.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.id.toLowerCase().includes(q) ||
      item.recipientName.toLowerCase().includes(q) ||
      (item.destinationReference && item.destinationReference.toLowerCase().includes(q)) ||
      (item.externalPayoutId && item.externalPayoutId.toLowerCase().includes(q))
    );
  });

  const requestedCount = queue.filter((i) => i.status === "requested").length;
  const processingCount = queue.filter((i) => i.status === "processing").length;
  const volumeByCurrency = groupVolumeByCurrency(queue);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={s.eyebrow}
        title={s.title}
        description={s.description}
      />

      <StatStrip
        items={[
          {
            label: s.actionRequired,
            value: requestedCount + processingCount,
            accent: "text-amber-600",
          },
          ...volumeByCurrency.map(({ currency, total }) => ({
            label: `${s.totalVolume} · ${currency || s.unknownCurrency} · ${s.loadedTab}`,
            value: formatCurrencyTotal(total, currency),
          })),
        ]}
      />

      {/* Notifications */}
      {toast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">
          {toast}
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
          {errorMsg}
        </div>
      )}

      <TableToolbar
        search={{
          value: searchQuery,
          placeholder: s.searchPlaceholder,
          onChange: (v) => setSearchQuery(v),
        }}
        tabs={s.tabs.map((t) => ({
          value: t.value,
          label: t.label,
          count:
            t.value === "requested" && requestedCount > 0 ? requestedCount : undefined,
          active: activeFilter === t.value,
          onSelect: () => handleFilterChange(t.value),
        }))}
        filters={[]}
      />

      <AdminTable
        columns={columns}
        rows={filteredQueue.map((item) => {
          const terminal = isTerminal(item.status);
          return {
            id: item.id,
            cells: [
              <span key="recipient" className="block">
                <span className="flex items-center gap-1.5">
                  {getRecipientTypeBadge(item.recipientType)}
                  <span className="text-xs font-bold text-zinc-900">
                    {item.recipientName}
                  </span>
                </span>
                {item.requestedByEmail && (
                  <span className="block text-[10px] font-normal text-zinc-400">
                    Req: {item.requestedByEmail}
                  </span>
                )}
              </span>,
              <span key="amount" className="whitespace-nowrap tabular-nums">
                <span className="text-sm font-black text-zinc-950">
                  ${item.amount.toFixed(2)}
                </span>{" "}
                <span className="text-[10px] font-bold text-zinc-400">
                  {item.currency.toUpperCase()}
                </span>
              </span>,
              <span key="status" className="block">
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[item.status]}`}
                  />
                  <span>{s.statusLabels[item.status]}</span>
                  {terminal && (
                    <span className="text-[11px] font-bold text-zinc-400">
                      · {s.terminal}
                    </span>
                  )}
                </span>
                {item.externalPayoutId && (
                  <span className="mt-0.5 block font-mono text-[10px] font-bold text-emerald-700">
                    Ext: {item.externalPayoutId}
                  </span>
                )}
                {item.failureReason && (
                  <span className="mt-0.5 block max-w-xs text-[10px] font-normal text-rose-600">
                    {item.failureReason}
                  </span>
                )}
              </span>,
              <span key="destination" className="block">
                <span className="font-bold capitalize text-zinc-800">
                  {item.destinationType.replace("_", " ")}
                </span>
                {item.destinationReference && (
                  <span className="block font-mono text-[10px] text-zinc-500">
                    {item.destinationReference}
                  </span>
                )}
              </span>,
              <span key="payout" className="block">
                <span className="font-mono text-[11px] font-bold text-zinc-900">
                  {item.id.slice(0, 8)}...
                </span>
                <span className="block text-[10px] font-normal text-zinc-400">
                  {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </span>,
            ],
            detailExtra: terminal
              ? [{ label: s.stateLabel, value: s.terminal }]
              : [],
            actions: buildRowActions(item),
          };
        })}
        emptyMessage={
          <span className="block">
            <span className="block text-sm font-bold text-zinc-700">{s.emptyTitle}</span>
            <span className="mt-1 block text-xs font-normal text-zinc-400">{s.emptySub}</span>
          </span>
        }
      />

      <div className="sticky bottom-0 z-10 bg-zinc-100 pb-[env(safe-area-inset-bottom)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold text-zinc-400">
            {queue.length === 0
              ? tableStrings.showingNone(queue.length)
              : tableStrings.showingResults(1, filteredQueue.length, queue.length)}
          </p>
        </div>
      </div>

      {/* Complete Payout Modal */}
      {completingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <FileCheck size={18} className="text-emerald-600" />
                <h3 className="text-lg font-black text-zinc-950">Complete Payout</h3>
              </div>
              <button
                type="button"
                onClick={() => setCompletingItem(null)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition"
              >
                <X size={18} />
              </button>
            </div>

            {completeError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700">
                {completeError}
              </div>
            )}

            <form onSubmit={handleCompleteSubmit} className="space-y-4 text-xs font-bold">
              <div className="rounded-xl bg-zinc-50 p-3 text-zinc-700 space-y-1">
                <p>
                  <strong>Recipient:</strong> {completingItem.recipientName}
                </p>
                <p>
                  <strong>Amount:</strong> ${completingItem.amount.toFixed(2)}{" "}
                  {completingItem.currency.toUpperCase()}
                </p>
                <p>
                  <strong>Destination:</strong> {completingItem.destinationType} (
                  {completingItem.destinationReference || "N/A"})
                </p>
              </div>

              <div>
                <label className="block text-zinc-700 mb-1">
                  External Payout / Transfer ID *
                </label>
                <input
                  type="text"
                  required
                  value={externalPayoutIdInput}
                  onChange={(e) => setExternalPayoutIdInput(e.target.value)}
                  placeholder="e.g. tr_1Nxxxxxx or Wire-Ref-999"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm font-mono font-bold text-zinc-900 outline-hidden focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                />
                <p className="text-[11px] text-zinc-400 font-normal mt-1">
                  Attaches bank transaction or Stripe Transfer ID to lock completed state.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCompletingItem(null)}
                  className="rounded-xl px-4 py-2.5 text-xs font-bold text-zinc-600 hover:bg-zinc-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingComplete}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black text-white hover:bg-emerald-700 transition disabled:opacity-60"
                >
                  {isSubmittingComplete ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Completing...</span>
                    </>
                  ) : (
                    <span>Confirm Completion</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fail Payout Modal */}
      {failingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <AlertCircle size={18} className="text-rose-600" />
                <h3 className="text-lg font-black text-zinc-950">Fail Payout</h3>
              </div>
              <button
                type="button"
                onClick={() => setFailingItem(null)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition"
              >
                <X size={18} />
              </button>
            </div>

            {failError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700">
                {failError}
              </div>
            )}

            <form onSubmit={handleFailSubmit} className="space-y-4 text-xs font-bold">
              <div className="rounded-xl bg-rose-50/60 border border-rose-100 p-3 text-rose-950 space-y-1">
                <p>
                  <strong>Recipient:</strong> {failingItem.recipientName}
                </p>
                <p>
                  <strong>Amount:</strong> ${failingItem.amount.toFixed(2)}{" "}
                  {failingItem.currency.toUpperCase()}
                </p>
                <p className="text-[11px] text-rose-700 font-normal mt-1">
                  <strong>Compensating Reversal:</strong> Marking this payout as failed will automatically execute a single database credit adjustment restoring ${failingItem.amount.toFixed(2)} to the recipient's available balance.
                </p>
              </div>

              <div>
                <label className="block text-zinc-700 mb-1">
                  Failure Reason *
                </label>
                <textarea
                  required
                  rows={3}
                  value={failureReasonInput}
                  onChange={(e) => setFailureReasonInput(e.target.value)}
                  placeholder="e.g. Account closed / Invalid IBAN details"
                  className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-xs font-bold text-zinc-900 outline-hidden focus:border-rose-500 focus:ring-4 focus:ring-rose-100"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFailingItem(null)}
                  className="rounded-xl px-4 py-2.5 text-xs font-bold text-zinc-600 hover:bg-zinc-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingFail}
                  className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-black text-white hover:bg-rose-700 transition disabled:opacity-60"
                >
                  {isSubmittingFail ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Failing...</span>
                    </>
                  ) : (
                    <span>Confirm Failure & Reverse</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
