"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Search,
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

export default function PayoutsAdminClient({
  initialQueue,
  initialError,
}: {
  initialQueue: AdminPayoutQueueItem[];
  initialError: string | null;
}) {
  const router = useRouter();
  const [queue, setQueue] = useState<AdminPayoutQueueItem[]>(initialQueue);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError);
  const [activeFilter, setActiveFilter] = useState<string>("all");
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

  function getStatusBadge(status: PayoutStatus) {
    switch (status) {
      case "requested":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
            <Clock size={12} />
            Requested
          </span>
        );
      case "processing":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
            <Loader2 size={12} className="animate-spin" />
            Processing
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
            <CheckCircle2 size={12} />
            Completed
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800">
            <XCircle size={12} />
            Failed
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-bold text-zinc-600">
            <AlertCircle size={12} />
            Cancelled
          </span>
        );
    }
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
  const totalAmount = queue.reduce((acc, i) => acc + i.amount, 0);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 rounded-2xl bg-slate-950 p-6 text-white shadow-xl shadow-slate-950/10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600">
              <Send size={18} className="text-white" />
            </div>
            <h1 className="text-xl font-black tracking-tight">Payout Management</h1>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Disburse recipient funds, complete bank transfers, and manage payout state transitions.
          </p>
        </div>

        <div className="flex gap-4 border-t border-white/10 pt-3 sm:border-t-0 sm:pt-0">
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400">Action Required</p>
            <p className="text-lg font-black text-amber-400">{requestedCount + processingCount}</p>
          </div>
          <div className="border-l border-white/10 pl-4">
            <p className="text-[10px] font-black uppercase text-slate-400">Total Volume</p>
            <p className="text-lg font-black text-emerald-400">${totalAmount.toFixed(2)}</p>
          </div>
        </div>
      </div>

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

      {/* Filters & Search Toolbar */}
      <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        {/* Status Tabs */}
        <div className="flex flex-wrap gap-1">
          {["all", "requested", "processing", "completed", "failed", "cancelled"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => handleFilterChange(st)}
              className={`rounded-xl px-3 py-1.5 text-xs font-black capitalize transition ${
                activeFilter === st
                  ? "bg-slate-950 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {st}
              {st === "requested" && requestedCount > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] text-white">
                  {requestedCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-2.5 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search recipient or ID..."
            className="w-full rounded-xl border border-zinc-200 bg-white pl-8 pr-3 py-1.5 text-xs font-bold text-zinc-900 outline-hidden focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          />
        </div>
      </div>

      {/* Queue Table */}
      <div className="rounded-2xl border border-zinc-200 bg-white shadow-xs overflow-hidden">
        {filteredQueue.length === 0 ? (
          <div className="p-12 text-center text-zinc-500">
            <Send size={24} className="mx-auto text-zinc-300 mb-2" />
            <p className="text-sm font-bold text-zinc-700">No payout records found</p>
            <p className="text-xs text-zinc-400">No payout requests matching the selected filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-600">
              <thead className="bg-zinc-50 text-[10px] font-black uppercase tracking-wider text-zinc-400 border-b border-zinc-200">
                <tr>
                  <th className="px-4 py-3">Payout ID / Date</th>
                  <th className="px-4 py-3">Recipient</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Destination</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-medium">
                {filteredQueue.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-50/60 transition">
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="font-mono font-bold text-zinc-900 text-[11px]">
                        {item.id.slice(0, 8)}...
                      </span>
                      <span className="block text-[10px] text-zinc-400">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          {getRecipientTypeBadge(item.recipientType)}
                          <span className="font-bold text-zinc-900 text-xs">
                            {item.recipientName}
                          </span>
                        </div>
                        {item.requestedByEmail && (
                          <span className="block text-[10px] text-zinc-400">
                            Req: {item.requestedByEmail}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="font-black text-zinc-950 text-sm">
                        ${item.amount.toFixed(2)}
                      </span>{" "}
                      <span className="text-[10px] font-bold text-zinc-400">
                        {item.currency.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="capitalize font-bold text-zinc-800">
                        {item.destinationType.replace("_", " ")}
                      </span>
                      {item.destinationReference && (
                        <span className="block text-[10px] font-mono text-zinc-500">
                          {item.destinationReference}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {getStatusBadge(item.status)}
                      {item.externalPayoutId && (
                        <span className="block text-[10px] font-mono text-emerald-700 font-bold mt-0.5">
                          Ext: {item.externalPayoutId}
                        </span>
                      )}
                      {item.failureReason && (
                        <span className="block text-[10px] text-rose-600 font-normal mt-0.5 max-w-xs">
                          {item.failureReason}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-right space-x-1.5">
                      {item.status === "requested" && (
                        <button
                          type="button"
                          onClick={() => handleStartProcessing(item.id)}
                          disabled={processingId === item.id}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition disabled:opacity-50"
                        >
                          {processingId === item.id ? "Updating..." : "Start Processing"}
                        </button>
                      )}

                      {(item.status === "requested" || item.status === "processing") && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setCompletingItem(item);
                              setExternalPayoutIdInput(`tr_${crypto.randomUUID().slice(0, 8)}`);
                            }}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition"
                          >
                            Complete
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFailingItem(item);
                              setFailureReasonInput("");
                            }}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition"
                          >
                            Fail
                          </button>
                        </>
                      )}

                      {(item.status === "completed" ||
                        item.status === "failed" ||
                        item.status === "cancelled") && (
                        <span className="text-[11px] text-zinc-400 font-bold">Terminal</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
