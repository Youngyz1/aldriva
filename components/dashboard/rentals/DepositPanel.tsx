"use client";

/**
 * components/dashboard/rentals/DepositPanel.tsx
 *
 * Deposit recording panel for the booking detail page.
 * Calls recordDeposit server action. Deposit is NEVER revenue.
 * docs/design/rental/architecture.md Decision 3.
 */

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  IconShieldCheck as ShieldCheck,
  IconLoader2 as Loader,
  IconCheck as Check,
} from "@tabler/icons-react";

export type DepositStatus =
  | "none"
  | "pending_collection"
  | "collected_offline"
  | "returned_full"
  | "partially_retained"
  | "retained_full";

const DEPOSIT_STATUS_LABEL: Record<DepositStatus, string> = {
  none: "No deposit",
  pending_collection: "Pending collection",
  collected_offline: "Collected",
  returned_full: "Returned in full",
  partially_retained: "Partially retained",
  retained_full: "Retained",
};

const DEPOSIT_STATUS_COLOR: Record<DepositStatus, string> = {
  none: "text-zinc-400",
  pending_collection: "text-amber-600",
  collected_offline: "text-green-600",
  returned_full: "text-zinc-500",
  partially_retained: "text-orange-600",
  retained_full: "text-red-600",
};

export interface DepositPanelProps {
  bookingId: string;
  organizerId: string;
  currency: string;
  depositRequired: number;
  depositCollected: number;
  depositRetained?: number;
  depositStatus: DepositStatus;
  retentionReason?: string | null;
  canManage: boolean;
}

export function DepositPanel({
  bookingId,
  organizerId,
  currency,
  depositRequired,
  depositCollected,
  depositRetained = 0,
  depositStatus,
  retentionReason,
  canManage,
}: DepositPanelProps) {
  const [amount, setAmount] = useState(depositRequired.toString());
  const [paid, setPaid] = useState(true);
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const isRecorded =
    depositStatus === "collected_offline" ||
    depositStatus === "returned_full" ||
    depositStatus === "partially_retained" ||
    depositStatus === "retained_full";

  function handleRecord() {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      try {
        const { recordDeposit } = await import("@/lib/actions/rental-bookings");
        const result = await recordDeposit(bookingId, organizerId, {
          amount: parseFloat(amount) || 0,
          paid,
          notes: notes || undefined,
        });
        if (result && "error" in result) {
          setError(result.error || "Failed to record deposit");
          return;
        }
        setSuccess(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to record deposit");
      }
    });
  }

  const fmt = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", minimumFractionDigits: 0 }).format(v);

  return (
    <div className="space-y-3">
      {/* Status display */}
      <div className="flex items-center gap-3 text-sm">
        <ShieldCheck className="h-4 w-4 text-zinc-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className={`font-semibold ${DEPOSIT_STATUS_COLOR[depositStatus]}`}>
            {DEPOSIT_STATUS_LABEL[depositStatus]}
          </span>
          {depositRequired > 0 && (
            <span className="ml-2 text-zinc-500">
              Required: {fmt(depositRequired)}
              {depositCollected > 0 && ` · Collected: ${fmt(depositCollected)}`}
              {depositRetained > 0 && ` · Retained: ${fmt(depositRetained)}`}
            </span>
          )}
        </div>
      </div>

      <p className="text-xs text-zinc-400 italic">
        Security deposits are tracked separately and never included in rental revenue.
      </p>
      {retentionReason ? (
        <p className="text-xs text-zinc-600"><span className="font-semibold">Retention reason:</span> {retentionReason}</p>
      ) : null}

      {/* Record form — only if not yet collected and canManage */}
      {canManage && !isRecorded && (
        <div className="space-y-2 pt-1 border-t border-zinc-100">
          {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
          {success && (
            <div className="flex items-center gap-1.5 text-xs text-green-700 font-semibold">
              <Check className="h-3.5 w-3.5" /> Deposit recorded
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 h-9 px-3 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
              placeholder="Amount"
              disabled={isPending}
            />
            <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 cursor-pointer">
              <input
                type="checkbox"
                checked={paid}
                onChange={(e) => setPaid(e.target.checked)}
                disabled={isPending}
                className="h-4 w-4 rounded border-zinc-300 accent-brand-700"
              />
              Paid
            </label>
            <button
              type="button"
              onClick={handleRecord}
              disabled={isPending}
              className="inline-flex items-center gap-1 h-9 px-4 rounded-xl bg-brand-700 text-xs font-bold text-white hover:bg-brand-800 disabled:opacity-50 transition"
            >
              {isPending && <Loader className="h-3.5 w-3.5 animate-spin" />}
              Record
            </button>
          </div>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Deposit notes (optional)"
            className="w-full h-9 px-3 rounded-xl border border-zinc-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
            disabled={isPending}
          />
        </div>
      )}
    </div>
  );
}
