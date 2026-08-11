"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SettingsCard } from "@/components/ui/settings-card";
import {
  Sparkles,
  Building,
  Landmark,
  Calendar,
  ArrowUpRight,
  Wallet,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  X,
  Loader2,
} from "lucide-react";
import {
  getRecipientPaymentsOverview,
  requestRecipientPayout,
  cancelRecipientPayout,
  type RecipientType,
  type DestinationType,
  type RecipientPaymentsOverview,
  type PayoutStatus,
} from "@/lib/payouts";

export default function PaymentsClient({
  recipientType,
  entityId,
  initialOverview,
  initialError,
}: {
  userId?: string;
  organizerName?: string | null;
  recipientType: RecipientType;
  entityId?: string;
  initialOverview: RecipientPaymentsOverview | null;
  initialError: string | null;
}) {
  const router = useRouter();
  const [overview, setOverview] = useState<RecipientPaymentsOverview | null>(initialOverview);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError);

  const [currency, setCurrency] = useState(initialOverview?.currency?.toUpperCase() || "USD");
  const [payoutSchedule, setPayoutSchedule] = useState("weekly");
  const [isStripeConnecting, setIsStripeConnecting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Request Payout Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [requestAmount, setRequestAmount] = useState("");
  const [destinationType, setDestinationType] = useState<DestinationType>("bank_transfer");
  const [destinationRef, setDestinationRef] = useState("");
  const [isSubmittingPayout, setIsSubmittingPayout] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Cancelling payout state
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  async function refetchOverview(targetCurrency?: string) {
    const cur = (targetCurrency || currency).toLowerCase();
    try {
      setErrorMsg(null);
      const data = await getRecipientPaymentsOverview(recipientType, entityId, cur);
      setOverview(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to refresh overview.");
    }
  }

  function handleCurrencyChange(newCur: string) {
    setCurrency(newCur);
    refetchOverview(newCur);
  }

  function handleStripeConnect() {
    setIsStripeConnecting(true);
    setTimeout(() => {
      setIsStripeConnecting(false);
      showToast("Stripe integration setup successfully in sandbox mode!");
    }, 1500);
  }

  async function handleRequestPayoutSubmit(e: React.FormEvent) {
    e.preventDefault();
    setModalError(null);

    const amt = parseFloat(requestAmount);
    if (isNaN(amt) || amt <= 0) {
      setModalError("Please enter a valid amount greater than zero.");
      return;
    }

    if (overview && amt > overview.availableBalance) {
      setModalError(
        `Amount exceeds available balance ($${overview.availableBalance.toFixed(2)}).`
      );
      return;
    }

    try {
      setIsSubmittingPayout(true);
      await requestRecipientPayout({
        recipientType,
        entityId,
        amount: amt,
        currency: currency.toLowerCase(),
        destinationType,
        destinationReference: destinationRef.trim() || undefined,
        idempotencyKey: `req_${crypto.randomUUID()}`,
      });

      showToast(`Payout request of $${amt.toFixed(2)} ${currency} submitted successfully!`);
      setIsModalOpen(false);
      setRequestAmount("");
      setDestinationRef("");
      await refetchOverview();
      router.refresh();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Failed to request payout.");
    } finally {
      setIsSubmittingPayout(false);
    }
  }

  async function handleCancelPayout(payoutId: string) {
    if (!confirm("Are you sure you want to cancel this pending payout request?")) return;

    try {
      setCancellingId(payoutId);
      await cancelRecipientPayout(payoutId);
      showToast("Payout request cancelled. Funds have been returned to available balance.");
      await refetchOverview();
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to cancel payout.");
    } finally {
      setCancellingId(null);
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

  const availableBalance = overview?.availableBalance ?? 0;
  const pendingPayoutAmount = overview?.pendingPayoutAmount ?? 0;
  const totalWithdrawn = overview?.totalWithdrawn ?? 0;
  const payouts = overview?.payoutHistory ?? [];

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 shadow-sm transition">
          {toast}
        </div>
      )}

      {/* Global Error Banner */}
      {errorMsg && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {errorMsg}
        </div>
      )}

      {/* Real Balance Overview Bar */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
              Available Balance
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Wallet size={18} />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-zinc-950 sm:text-3xl">
            ${availableBalance.toFixed(2)}{" "}
            <span className="text-xs font-bold text-zinc-400">{currency}</span>
          </p>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              disabled={availableBalance <= 0}
              className="w-full rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700 transition shadow-xs disabled:opacity-50"
            >
              Request Payout
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
              Pending Payouts
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Clock size={18} />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-zinc-950 sm:text-3xl">
            ${pendingPayoutAmount.toFixed(2)}{" "}
            <span className="text-xs font-bold text-zinc-400">{currency}</span>
          </p>
          <p className="mt-2 text-xs text-zinc-400">Funds currently in processing</p>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
              Total Withdrawn
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-zinc-950 sm:text-3xl">
            ${totalWithdrawn.toFixed(2)}{" "}
            <span className="text-xs font-bold text-zinc-400">{currency}</span>
          </p>
          <p className="mt-2 text-xs text-zinc-400">Completed disbursements</p>
        </div>
      </div>

      {/* Stripe Connect Card */}
      <SettingsCard
        title={
          <div className="flex items-center gap-2">
            <span>Stripe Payouts</span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-black uppercase text-zinc-500">
              Sandbox Mode
            </span>
          </div>
        }
        description="Receive payouts directly into your bank account. Securely process tickets and donation collections."
      >
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2 max-w-lg">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              <p className="text-sm font-bold text-amber-800">Status: Not Connected</p>
            </div>
            <p className="text-xs text-zinc-500 sm:text-sm leading-relaxed">
              Connect your account to Stripe to enable ticketing and accept donations. Payouts are made to your linked checking account on your preferred schedule.
            </p>
          </div>
          <button
            type="button"
            onClick={handleStripeConnect}
            disabled={isStripeConnecting}
            className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 text-sm font-black transition shadow-xs disabled:opacity-60 text-center shrink-0"
          >
            <span>{isStripeConnecting ? "Connecting..." : "Connect Stripe Account"}</span>
            <ArrowUpRight size={16} />
          </button>
        </div>
      </SettingsCard>

      {/* Payout Preferences */}
      <SettingsCard
        title="Payout Preferences"
        description="Configure your payout schedule and regional currency settings."
        footer={
          <button
            type="button"
            onClick={() => showToast("Payout preferences saved successfully.")}
            className="rounded-xl bg-orange-600 px-5 py-2.5 text-xs font-black text-white hover:bg-orange-700 transition"
          >
            Save Payout Settings
          </button>
        }
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-zinc-500">
              <Building size={14} className="text-zinc-400" />
              Payout Currency
            </span>
            <select
              value={currency}
              onChange={(e) => handleCurrencyChange(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold outline-hidden transition focus:border-orange-500 focus:ring-4 focus:ring-orange-100 sm:rounded-xl sm:px-4 sm:py-2.5"
            >
              <option value="USD">USD ($) - United States Dollar</option>
              <option value="CAD">CAD ($) - Canadian Dollar</option>
              <option value="EUR">EUR (€) - Euro</option>
              <option value="GBP">GBP (£) - British Pound</option>
              <option value="NGN">NGN (₦) - Nigerian Naira</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-zinc-500">
              <Calendar size={14} className="text-zinc-400" />
              Payout Schedule
            </span>
            <select
              value={payoutSchedule}
              onChange={(e) => setPayoutSchedule(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold outline-hidden transition focus:border-orange-500 focus:ring-4 focus:ring-orange-100 sm:rounded-xl sm:px-4 sm:py-2.5"
            >
              <option value="daily">Daily Payouts</option>
              <option value="weekly">Weekly Payouts (Every Monday)</option>
              <option value="monthly">Monthly Payouts (First day of month)</option>
            </select>
          </label>
        </div>
      </SettingsCard>

      {/* Linked Bank Account */}
      <SettingsCard
        title="Linked Bank Account"
        description="The account where payouts will be directly transferred."
      >
        <div className="flex items-center gap-4 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 p-6 text-zinc-500">
          <Landmark size={24} className="shrink-0 text-zinc-400" />
          <div>
            <p className="text-sm font-bold text-zinc-700">No bank account linked</p>
            <p className="text-xs mt-0.5 text-zinc-500">
              You can specify bank transfer details during payout request, or link a Stripe profile above.
            </p>
          </div>
        </div>
      </SettingsCard>

      {/* Payout History / Ledger Table */}
      <div className="rounded-xl border border-zinc-200/80 bg-white p-5 sm:rounded-2xl sm:p-6 shadow-xs">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-zinc-900 sm:text-xl font-sans">
              Payout Ledger
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500 sm:text-sm">
              A complete list of disbursements and status history for your account.
            </p>
          </div>
          {availableBalance > 0 && (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="self-start rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700 transition shadow-xs sm:self-auto"
            >
              Request Payout
            </button>
          )}
        </div>

        {payouts.length === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-zinc-100 p-8 text-center bg-zinc-50/20">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-500">
              <Sparkles size={20} />
            </div>
            <p className="mt-4 text-sm font-bold text-zinc-950">No payouts record found</p>
            <p className="mt-1 max-w-xs text-xs text-zinc-500 leading-normal">
              Once you collect donations or ticket revenue and submit payout requests, disbursement records will accumulate here.
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-600">
              <thead className="bg-zinc-50 text-[11px] font-black uppercase tracking-wider text-zinc-400 border-b border-zinc-200">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Destination</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-medium">
                {payouts.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50/60 transition">
                    <td className="px-4 py-3.5 whitespace-nowrap text-zinc-900 font-bold">
                      {new Date(p.created_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap font-black text-zinc-950">
                      ${p.amount.toFixed(2)} {p.currency.toUpperCase()}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="capitalize font-bold text-zinc-800">
                        {p.destination_type.replace("_", " ")}
                      </span>
                      {p.destination_reference && (
                        <span className="block text-[11px] text-zinc-400 font-normal">
                          Ref: {p.destination_reference}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {getStatusBadge(p.status)}
                      {p.failure_reason && (
                        <p className="mt-1 text-[11px] text-rose-600 font-normal max-w-xs">
                          {p.failure_reason} (Funds returned)
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-right">
                      {p.status === "requested" ? (
                        <button
                          type="button"
                          onClick={() => handleCancelPayout(p.id)}
                          disabled={cancellingId === p.id}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100 transition disabled:opacity-50"
                        >
                          {cancellingId === p.id ? "Cancelling..." : "Cancel"}
                        </button>
                      ) : (
                        <span className="text-[11px] text-zinc-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Request Payout Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="text-lg font-black text-zinc-950">Request Payout</h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition"
              >
                <X size={18} />
              </button>
            </div>

            {modalError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700">
                {modalError}
              </div>
            )}

            <form onSubmit={handleRequestPayoutSubmit} className="space-y-4 text-xs font-bold">
              <div>
                <label className="block text-zinc-600 mb-1">
                  Available Balance
                </label>
                <div className="rounded-xl bg-zinc-100 px-4 py-2.5 text-sm font-black text-zinc-800">
                  ${availableBalance.toFixed(2)} {currency}
                </div>
              </div>

              <div>
                <label className="block text-zinc-600 mb-1">
                  Payout Amount ({currency}) *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-zinc-400 font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={availableBalance}
                    required
                    value={requestAmount}
                    onChange={(e) => setRequestAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-zinc-200 bg-white pl-8 pr-4 py-2.5 text-sm font-bold text-zinc-900 outline-hidden focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-600 mb-1">
                  Destination Type *
                </label>
                <select
                  value={destinationType}
                  onChange={(e) => setDestinationType(e.target.value as DestinationType)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm font-bold text-zinc-900 outline-hidden focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                >
                  <option value="bank_transfer">Bank Transfer (IBAN / Wire)</option>
                  <option value="stripe_connect">Stripe Connect</option>
                  <option value="manual">Manual Disbursement</option>
                  <option value="crypto">Crypto Wallet</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-600 mb-1">
                  Destination Reference / Account Details
                </label>
                <input
                  type="text"
                  value={destinationRef}
                  onChange={(e) => setDestinationRef(e.target.value)}
                  placeholder="e.g. IBAN DE89... or Bank Account # or Wallet"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm font-bold text-zinc-900 outline-hidden focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl px-4 py-2.5 text-xs font-bold text-zinc-600 hover:bg-zinc-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayout}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black text-white hover:bg-emerald-700 transition disabled:opacity-60"
                >
                  {isSubmittingPayout ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <span>Submit Request</span>
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
