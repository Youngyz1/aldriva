"use client";

/**
 * components/dashboard/rentals/BookingDetailActions.tsx
 *
 * Status action buttons for the booking detail page.
 * Calls updateBookingStatus and cancelRentalBooking server actions.
 *
 * Pickup guard: when transitioning to "active", the server enforces:
 *   1. Vehicle must be assigned (VEHICLE_NOT_ASSIGNED)
 *   2. Current time must not be more than 4 hours before scheduled start (TOO_EARLY_FOR_PICKUP)
 * When the server returns TOO_EARLY_FOR_PICKUP, an override textarea is shown.
 * The owner writes a reason (min 5 chars), then resubmits with that reason stored in notes.
 */

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  IconCheck as Check,
  IconX as X,
  IconLoader2 as Loader,
  IconAlertTriangle as AlertTriangle,
} from "@tabler/icons-react";
import type { RentalBookingStatus } from "./RentalBookingStatusBadge";

const VALID_ACTIONS: Record<RentalBookingStatus, { label: string; newStatus: RentalBookingStatus; variant: "primary" | "danger" | "outline" }[]> = {
  pending: [
    { label: "Confirm", newStatus: "confirmed", variant: "primary" },
    { label: "Decline", newStatus: "cancelled", variant: "danger" },
  ],
  confirmed: [
    { label: "Start Rental", newStatus: "active", variant: "primary" },
    { label: "No Show", newStatus: "no_show", variant: "outline" },
    { label: "Cancel", newStatus: "cancelled", variant: "danger" },
  ],
  awaiting_payment: [
    { label: "Cancel", newStatus: "cancelled", variant: "danger" },
  ],
  active: [
    { label: "Complete Return", newStatus: "completed", variant: "primary" },
    { label: "Cancel", newStatus: "cancelled", variant: "danger" },
  ],
  completed: [],
  cancelled: [],
  expired: [],
  no_show: [],
};

const FRIENDLY_ERRORS: Record<string, string> = {
  VEHICLE_NOT_ASSIGNED: "Assign a vehicle before starting the rental.",
  PICKUP_BLOCKED_STATUS: "This booking cannot be started in its current status.",
  PICKUP_BLOCKED_UNPAID: "Record the payment received at pickup before starting the rental.",
};

type PickupPayment = { method: string; amount: number; currency: string };

export interface BookingDetailActionsProps {
  bookingId: string;
  organizerId: string;
  status: RentalBookingStatus;
}

export function BookingDetailActions({
  bookingId,
  organizerId,
  status,
}: BookingDetailActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [pendingNewStatus, setPendingNewStatus] = useState<RentalBookingStatus | null>(null);
  const router = useRouter();
  const [payOpen, setPayOpen] = useState(false);
  const [payMethod, setPayMethod] = useState("cash");
  const [payAmount, setPayAmount] = useState("");
  const [payCurrency, setPayCurrency] = useState("USD");
  const [pendingPayment, setPendingPayment] = useState<PickupPayment | null>(null);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [clickedStatus, setClickedStatus] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [refundDue, setRefundDue] = useState<number | null>(null);

  const actions = VALID_ACTIONS[status] ?? [];
  if (actions.length === 0 && refundDue === null) return null;

  function handleAction(newStatus: RentalBookingStatus, override?: string, payment?: PickupPayment, reason?: string) {
    setError(null);
    setErrorCode(null);
    startTransition(async () => {
      try {
        const { updateBookingStatus } = await import("@/lib/actions/rental-bookings");
        if (payment) setPendingPayment(payment);
        const result = await updateBookingStatus(bookingId, organizerId, newStatus, override, payment, reason);
        if (result && "error" in result && result.error) {
          const code = (result as { code?: string }).code ?? null;
          setError(FRIENDLY_ERRORS[code ?? ""] ?? (result.error || "Action failed"));
          setErrorCode(code);
          if (code === "TOO_EARLY_FOR_PICKUP") {
            setPendingNewStatus(newStatus);
            setPayOpen(false);
          }
          return;
        }
        // Success — clear override state
        setOverrideReason("");
        setPendingNewStatus(null);
        setPayOpen(false);
        setPendingPayment(null);
        setReasonOpen(false);
        setCancelReason("");
        if (newStatus === "cancelled" && (result.netPaid ?? 0) > 0) setRefundDue(result.netPaid ?? 0);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed");
      }
    });
  }

  function handleClick(newStatus: RentalBookingStatus) {
    if (newStatus === "cancelled") {
      setError(null);
      setErrorCode(null);
      setRefundDue(null);
      setReasonOpen(true);
      return;
    }
    if (!(status === "confirmed" && newStatus === "active")) {
      handleAction(newStatus);
      return;
    }
    setError(null);
    setErrorCode(null);
    startTransition(async () => {
      try {
        const { getRentalBookingBalance } = await import("@/lib/actions/rental-bookings");
        const bal = await getRentalBookingBalance(bookingId, organizerId);
        if (!bal.success) {
          setError(bal.error || "Could not load the payment balance.");
          return;
        }
        if ((bal.unpaid ?? 0) <= 0) {
          handleAction(newStatus);
          return;
        }
        setPayCurrency(bal.currency ?? "USD");
        setPayAmount(String(bal.unpaid));
        setPayOpen(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed");
      }
    });
  }

  function handlePaySubmit() {
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter the amount received at pickup.");
      return;
    }
    handleAction("active", undefined, { method: payMethod, amount, currency: payCurrency });
  }

  function handleCancelSubmit() {
    const min = status === "active" ? 5 : 3;
    if (cancelReason.trim().length < min) {
      setError("Please provide a reason of at least " + min + " characters.");
      return;
    }
    handleAction("cancelled", undefined, undefined, cancelReason.trim());
  }

  function handleOverrideSubmit() {
    if (!pendingNewStatus) return;
    if (overrideReason.trim().length < 5) {
      setError("Please provide a reason of at least 5 characters.");
      return;
    }
    handleAction(pendingNewStatus, overrideReason.trim(), pendingPayment ?? undefined);
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">{error}</div>
        </div>
      )}

      {/* Override reason form — shown after TOO_EARLY_FOR_PICKUP */}
      {errorCode === "TOO_EARLY_FOR_PICKUP" && pendingNewStatus && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-xs font-semibold text-amber-800">
            Owner early-pickup override — provide written reason:
          </p>
          <textarea
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="e.g. Customer needs vehicle 5 hours early due to flight schedule"
            rows={3}
            className="w-full text-sm rounded-lg border border-amber-300 bg-white px-3 py-2 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending || overrideReason.trim().length < 5}
              onClick={handleOverrideSubmit}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isPending ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Confirm Override
            </button>
            <button
              type="button"
              onClick={() => { setError(null); setErrorCode(null); setPendingNewStatus(null); setOverrideReason(""); }}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-bold border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {refundDue !== null && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Booking cancelled. Net amount paid so far: {refundDue}. Refund the customer if one is due. Recording refunds in the dashboard is not available yet.
        </div>
      )}

      {reasonOpen && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
          <p className="text-xs font-semibold text-red-800">
            {status === "pending" ? "Decline this request" : "Cancel this booking"}: reason required
            {status === "active" ? " (rental already started, at least 5 characters)" : ""}
          </p>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason (internal, not shown to the customer)"
            rows={3}
            className="w-full text-sm rounded-lg border border-red-300 bg-white px-3 py-2 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-400"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending || cancelReason.trim().length < (status === "active" ? 5 : 3)}
              onClick={handleCancelSubmit}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-bold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isPending ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              {status === "pending" ? "Confirm decline" : "Confirm cancel"}
            </button>
            <button
              type="button"
              onClick={() => { setReasonOpen(false); setCancelReason(""); setError(null); }}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-bold border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 transition"
            >
              Keep booking
            </button>
          </div>
        </div>
      )}

      {payOpen && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
          <p className="text-xs font-semibold text-zinc-800">Record payment received at pickup</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
              className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900"
            >
              <option value="cash">Cash</option>
              <option value="mobile_money">Mobile money</option>
              <option value="card_offline">Card (offline terminal)</option>
              <option value="other">Other</option>
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
            />
            <input
              type="text"
              value={payCurrency}
              readOnly
              className="h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handlePaySubmit}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-bold bg-brand-700 text-white hover:bg-brand-800 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isPending ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Record payment and start rental
            </button>
            <button
              type="button"
              onClick={() => { setPayOpen(false); setError(null); }}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-bold border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Normal action buttons — hidden while override form is active.
          Destructive (danger) actions render in their own group, visually
          separated from Start Rental/No Show by a divider, so Cancel is
          never adjacent to a primary action by accident. No handler/state
          logic changed — this only regroups the same `actions` array. */}
      {!payOpen && !reasonOpen && !(errorCode === "TOO_EARLY_FOR_PICKUP" && pendingNewStatus) && (() => {
        const nonDangerActions = actions.filter((a) => a.variant !== "danger");
        const dangerActions = actions.filter((a) => a.variant === "danger");
        const renderButton = (action: typeof actions[number]) => (
          <button
            key={action.newStatus}
            type="button"
            disabled={isPending}
            onClick={() => { setClickedStatus(action.newStatus); handleClick(action.newStatus); }}
            className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-bold transition disabled:opacity-60 disabled:cursor-not-allowed ${
              action.variant === "primary"
                ? "bg-brand-700 text-white hover:bg-brand-800"
                : action.variant === "danger"
                ? "bg-red-600 text-white hover:bg-red-700"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            {isPending && clickedStatus === action.newStatus ? (
              <Loader className="h-3.5 w-3.5 animate-spin" />
            ) : action.variant === "primary" ? (
              <Check className="h-3.5 w-3.5" />
            ) : action.variant === "danger" ? (
              <X className="h-3.5 w-3.5" />
            ) : null}
            {action.label}
          </button>
        );
        return (
          <div className="flex flex-wrap items-center gap-2">
            {nonDangerActions.length > 0 && (
              <div className="flex flex-wrap gap-2">{nonDangerActions.map(renderButton)}</div>
            )}
            {dangerActions.length > 0 && (
              <div className="flex flex-wrap gap-2 sm:ml-2 sm:border-l sm:border-zinc-200 sm:pl-3">
                {dangerActions.map(renderButton)}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
