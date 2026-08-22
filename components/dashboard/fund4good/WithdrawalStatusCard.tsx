"use client";

import {
  formatCurrency,
  type WithdrawalStatus,
} from "@/lib/fund4good-data";
import { cn } from "@/lib/utils";
import { CircleDollarSign, CheckCircle2, Clock, AlertCircle, ChevronRight } from "lucide-react";
import { EmptyState } from "./EmptyState";

const statusConfig = {
  completed: {
    icon: CheckCircle2,
    color: "text-brand-700",
    bg: "bg-brand-50",
    label: "Completed",
  },
  processing: {
    icon: Clock,
    color: "text-sky-600",
    bg: "bg-sky-50",
    label: "Processing",
  },
  pending: {
    icon: Clock,
    color: "text-amber-600",
    bg: "bg-amber-50",
    label: "Pending",
  },
  failed: {
    icon: AlertCircle,
    color: "text-red-600",
    bg: "bg-red-50",
    label: "Failed",
  },
};

interface WithdrawalStatusCardProps {
  data?: WithdrawalStatus[];
  className?: string;
}

export function WithdrawalStatusCard({
  data = [],
  className,
}: WithdrawalStatusCardProps) {
  const totalWithdrawn = data
    .filter((w) => w.status === "completed")
    .reduce((sum, w) => sum + w.amount, 0);

  const pending = data.filter((w) => w.status === "processing" || w.status === "pending");

  return (
    <div className={cn("rounded-xl border border-zinc-200 bg-white", className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <CircleDollarSign className="h-4 w-4 text-brand-600" aria-hidden />
          <h2 className="text-sm font-semibold text-slate-900">Withdrawals</h2>
        </div>
        <button
          type="button"
          disabled
          title="Withdrawal requests aren't available yet"
          className="flex items-center gap-0.5 text-xs font-medium text-violet-600 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded disabled:text-slate-300 disabled:cursor-not-allowed disabled:hover:text-slate-300"
        >
          Request
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* Total Withdrawn */}
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
          <span className="text-xs text-slate-500 font-medium">Total withdrawn</span>
          <span className="text-sm font-bold text-slate-900 tabular-nums">
            {formatCurrency(totalWithdrawn, "USD")}
          </span>
        </div>

        {/* Pending notice */}
        {pending.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5">
            <Clock className="h-3.5 w-3.5 text-sky-600 flex-shrink-0" aria-hidden />
            <p className="text-xs text-sky-700 font-medium">
              {formatCurrency(pending[0].amount, "USD")} transfer in progress (1–3 business days)
            </p>
          </div>
        )}

        {/* Withdrawal History */}
        {data.length === 0 ? (
          <EmptyState
            icon={CircleDollarSign}
            title="No withdrawals yet"
            description="Your payout history will appear here once you request a withdrawal."
            className="py-6"
          />
        ) : (
        <ul className="space-y-2" role="list" aria-label="Withdrawal history">
          {data.map((w) => {
            const config = statusConfig[w.status];
            const StatusIcon = config.icon;
            return (
              <li
                key={w.id}
                className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-3"
              >
                <div
                  className={cn(
                    "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full",
                    config.bg
                  )}
                  aria-hidden
                >
                  <StatusIcon className={cn("h-4 w-4", config.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {formatCurrency(w.amount, w.currency)}
                  </p>
                  <p className="text-xs text-slate-400">
                    ••••{w.bankLast4} ·{" "}
                    {new Date(w.requestedDate).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    config.color,
                    config.bg,
                    "border",
                    w.status === "completed" ? "border-brand-200" :
                    w.status === "processing" ? "border-sky-200" :
                    w.status === "pending" ? "border-amber-200" :
                    "border-red-200"
                  )}
                  aria-label={`Status: ${config.label}`}
                >
                  {config.label}
                </span>
              </li>
            );
          })}
        </ul>
        )}
      </div>
    </div>
  );
}
