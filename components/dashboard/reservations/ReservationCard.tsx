"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  updateReservationStatus,
  updateReservationInternalNote,
  approveChangeRequest,
  declineChangeRequest,
  type ReservationStatus,
  type DeclineReasonCode,
} from "@/lib/actions/reservations";
import { formatReservationTimeRange } from "@/lib/reservation-slots";
import { IconUsers as Users, IconAlertCircle as AlertCircle } from "@tabler/icons-react";

export interface DashboardReservationChangeRequest {
  id: string;
  requested_starts_at: string | null;
  requested_party_size: number | null;
  requested_duration_minutes: number | null;
  guest_note: string | null;
  status: string;
  decision_note: string | null;
  created_at: string;
}

export interface DashboardReservationRow {
  id: string;
  reservation_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  party_size: number;
  starts_at: string;
  duration_minutes?: number;
  ends_at?: string;
  payment_status?: string;
  deposit_amount?: number | null;
  deposit_currency?: string | null;
  status: ReservationStatus | string;
  customer_note: string | null;
  owner_note: string | null;
  internal_note?: string | null;
  decline_reason: string | null;
  status_history: unknown;
  created_at: string;
  change_request?: DashboardReservationChangeRequest | null;
}

interface ReservationCardProps {
  reservation: DashboardReservationRow;
  organizerId: string;
  canManage: boolean;
  siteTimezone: string;
  onRefresh?: () => void;
}

const STATUS_VARIANTS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 border-amber-200 font-semibold",
  confirmed: "bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold",
  declined: "bg-red-50 text-red-700 border-red-200 font-medium",
  seated: "bg-blue-50 text-blue-800 border-blue-200 font-semibold",
  completed: "bg-zinc-100 text-zinc-600 border-zinc-200 font-medium",
  no_show: "bg-red-50 text-red-600 border-red-200 font-medium",
  cancelled: "bg-zinc-100 text-zinc-500 border-zinc-200 font-medium",
};

const STATUS_LABEL_KEY: Record<string, string> = {
  pending: "pending",
  confirmed: "confirmed",
  declined: "declined",
  seated: "seated",
  completed: "completed",
  no_show: "noShow",
  cancelled: "cancelled",
};

const DECLINE_REASONS: DeclineReasonCode[] = [
  "fully_booked",
  "closed_that_day",
  "cannot_accommodate_party",
  "other",
];

const DECLINE_LABEL_KEY: Record<DeclineReasonCode, string> = {
  fully_booked: "reasonFullyBooked",
  closed_that_day: "reasonClosedThatDay",
  cannot_accommodate_party: "reasonCannotAccommodate",
  other: "reasonOther",
};

export function ReservationCard({ reservation, organizerId, canManage, siteTimezone, onRefresh }: ReservationCardProps) {
  const t = useTranslations("Reservations");
  const tCommon = useTranslations("Common");
  const tDynamic = t as unknown as (key: string) => string;
  const locale = useLocale();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showDeclineDialog, setShowDeclineDialog] = useState(false);
  const [actionTargetStatus, setActionTargetStatus] = useState<ReservationStatus>("declined");
  const [declineReason, setDeclineReason] = useState<DeclineReasonCode>("fully_booked");
  const [dialogNote, setDialogNote] = useState("");
  const [phoneCopied, setPhoneCopied] = useState(false);

  const [internalNoteText, setInternalNoteText] = useState(reservation.internal_note ?? "");
  const [isSavingInternalNote, setIsSavingInternalNote] = useState(false);
  const [internalNoteSaved, setInternalNoteSaved] = useState(false);
  const [internalNoteError, setInternalNoteError] = useState<string | null>(null);

  // Change request state
  const [isApprovingChange, setIsApprovingChange] = useState(false);
  const [isDecliningChange, setIsDecliningChange] = useState(false);
  const [showDeclineChangeDialog, setShowDeclineChangeDialog] = useState(false);
  const [declineChangeNote, setDeclineChangeNote] = useState("");
  const [changeActionError, setChangeActionError] = useState<string | null>(null);

  const statusLabel = tDynamic(STATUS_LABEL_KEY[reservation.status] ?? "pending");
  const badgeCls = STATUS_VARIANTS[reservation.status] ?? "bg-zinc-100 text-zinc-500 border-zinc-200";

  const whenFormatted = formatReservationTimeRange({
    startsAt: reservation.starts_at,
    endsAt: reservation.ends_at,
    durationMinutes: reservation.duration_minutes,
    timeZone: siteTimezone,
    locale,
  });

  const cleanPhone = reservation.customer_phone.replace(/[^\d+]/g, "");
  const whatsappUrl = `https://wa.me/${cleanPhone.replace(/^\+/, "")}`;

  const handleCopyPhone = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(reservation.customer_phone);
      setPhoneCopied(true);
      setTimeout(() => setPhoneCopied(false), 2000);
    } catch {
      // Clipboard unavailable.
    }
  };

  const handleSaveInternalNote = async () => {
    setIsSavingInternalNote(true);
    setInternalNoteError(null);
    setInternalNoteSaved(false);
    try {
      const res = await updateReservationInternalNote({
        reservationId: reservation.id,
        organizerId,
        internalNote: internalNoteText.trim() ? internalNoteText.trim() : null,
      });
      if (!res.success) {
        setInternalNoteError(res.message || "Failed to save note");
      } else {
        setInternalNoteSaved(true);
        onRefresh?.();
      }
    } catch {
      setInternalNoteError("Failed to save note");
    } finally {
      setIsSavingInternalNote(false);
    }
  };

  const formatActorLabel = (hist: {
    status?: string;
    by_user_id?: string | null;
    reason?: string | null;
    note?: string | null;
  }) => {
    if (hist.by_user_id) {
      return t("actorOwnerTeam");
    }
    if (
      hist.status === "pending" ||
      hist.reason === "cancelled_by_guest" ||
      hist.note === "Cancelled by guest"
    ) {
      return t("actorGuest");
    }
    return t("actorSystem");
  };

  const runUpdate = async (args: {
    expectedCurrentStatus: ReservationStatus;
    nextStatus: ReservationStatus;
    ownerNote?: string | null;
    declineReason?: DeclineReasonCode | null;
    reason?: string | null;
  }) => {
    setIsSubmitting(true);
    setActionError(null);
    setWarning(null);
    try {
      const res = await updateReservationStatus({
        reservationId: reservation.id,
        organizerId,
        ...args,
      });
      if (!res.success) {
        if (
          res.error === "capacity_exceeded" &&
          res.currentCovers !== undefined &&
          res.seatCapacity !== undefined &&
          res.requestedPartySize !== undefined
        ) {
          setActionError(
            t("capacityExceeded", {
              taken: res.currentCovers,
              capacity: res.seatCapacity,
              requested: res.requestedPartySize,
            })
          );
        } else {
          setActionError(res.message || t("alreadyUpdated"));
        }
      } else {
        if (res.warning === "possible_double_booking" && res.warningMessage) {
          setWarning(res.warningMessage);
        }
        setShowConfirmDialog(false);
        setShowDeclineDialog(false);
        setDialogNote("");
        onRefresh?.();
      }
    } catch {
      setActionError(t("alreadyUpdated"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveChange = async () => {
    if (!reservation.change_request) return;
    setIsApprovingChange(true);
    setChangeActionError(null);
    try {
      const res = await approveChangeRequest({
        requestId: reservation.change_request.id,
        organizerId,
      });
      if (!res.success) {
        setChangeActionError(res.message || t("alreadyUpdated"));
      } else {
        onRefresh?.();
      }
    } catch {
      setChangeActionError(t("alreadyUpdated"));
    } finally {
      setIsApprovingChange(false);
    }
  };

  const handleDeclineChange = async () => {
    if (!reservation.change_request) return;
    setIsDecliningChange(true);
    setChangeActionError(null);
    try {
      const res = await declineChangeRequest({
        requestId: reservation.change_request.id,
        organizerId,
        decisionNote: declineChangeNote.trim() || null,
      });
      if (!res.success) {
        setChangeActionError(res.message || t("alreadyUpdated"));
      } else {
        setShowDeclineChangeDialog(false);
        setDeclineChangeNote("");
        onRefresh?.();
      }
    } catch {
      setChangeActionError(t("alreadyUpdated"));
    } finally {
      setIsDecliningChange(false);
    }
  };

  const status = reservation.status as ReservationStatus;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-xs overflow-hidden transition-colors">
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="cursor-pointer p-4 sm:p-5 hover:bg-zinc-50/70 transition-colors select-none"
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-bold text-zinc-900 tracking-tight">
                #{reservation.reservation_number}
              </span>
              <span className="text-xs text-zinc-500">• {whenFormatted}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {reservation.change_request && reservation.change_request.status === "pending" && (
                <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                  {t("changeRequested")}
                </span>
              )}
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs capitalize ${badgeCls}`}>
                {statusLabel}
              </span>
              {reservation.payment_status && reservation.payment_status !== "unpaid" && (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 capitalize">
                  {reservation.payment_status.replace(/_/g, " ")}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs font-semibold text-zinc-700">
                <Users className="w-3.5 h-3.5 text-zinc-400" />
                {reservation.party_size}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-2.5">
            <p className="text-sm font-semibold text-zinc-800 truncate">{reservation.customer_name}</p>
            {reservation.customer_phone ? (
              <a
                href={`tel:${cleanPhone}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-mono text-zinc-500 hover:text-orange-700"
              >
                {reservation.customer_phone}
              </a>
            ) : null}
          </div>

          {canManage && (
            <div className="mt-1 flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-100" onClick={(e) => e.stopPropagation()}>
              {status === "pending" && (
                <>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setDialogNote("");
                      setShowConfirmDialog(true);
                    }}
                    className="min-h-[44px] flex-1 sm:flex-initial rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 transition active:scale-95 disabled:opacity-50"
                  >
                    {t("confirm")}
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setActionTargetStatus("declined");
                      setDeclineReason("fully_booked");
                      setDialogNote("");
                      setShowDeclineDialog(true);
                    }}
                    className="min-h-[44px] rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition active:scale-95 disabled:opacity-50"
                  >
                    {t("decline")}
                  </button>
                </>
              )}
              {status === "confirmed" && (
                <>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => runUpdate({ expectedCurrentStatus: "confirmed", nextStatus: "seated" })}
                    className="min-h-[44px] flex-1 sm:flex-initial rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition active:scale-95 disabled:opacity-50"
                  >
                    {t("markSeated")}
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => runUpdate({ expectedCurrentStatus: "confirmed", nextStatus: "completed" })}
                    className="min-h-[44px] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition active:scale-95 disabled:opacity-50"
                  >
                    {t("markCompleted")}
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => runUpdate({ expectedCurrentStatus: "confirmed", nextStatus: "no_show" })}
                    className="min-h-[44px] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition active:scale-95 disabled:opacity-50"
                  >
                    {t("markNoShow")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActionTargetStatus("cancelled");
                      setDeclineReason("other");
                      setDialogNote("");
                      setShowDeclineDialog(true);
                    }}
                    className="min-h-[44px] rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition"
                  >
                    {t("cancelReservation")}
                  </button>
                </>
              )}
              {status === "seated" && (
                <>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => runUpdate({ expectedCurrentStatus: "seated", nextStatus: "completed" })}
                    className="min-h-[44px] flex-1 sm:flex-initial rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-800 transition active:scale-95 disabled:opacity-50"
                  >
                    {t("markCompleted")}
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => runUpdate({ expectedCurrentStatus: "seated", nextStatus: "confirmed" })}
                    className="min-h-[44px] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition active:scale-95 disabled:opacity-50"
                  >
                    {t("undoSeated")}
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setActionTargetStatus("no_show");
                      setDeclineReason("other");
                      setDialogNote("");
                      setShowDeclineDialog(true);
                    }}
                    className="min-h-[44px] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition active:scale-95 disabled:opacity-50"
                  >
                    {t("markNoShow")}
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setActionTargetStatus("cancelled");
                      setDeclineReason("other");
                      setDialogNote("");
                      setShowDeclineDialog(true);
                    }}
                    className="min-h-[44px] rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition active:scale-95 disabled:opacity-50"
                  >
                    {t("cancelReservation")}
                  </button>
                </>
              )}
            </div>
          )}

          {!canManage && (
            <p className="text-[11px] text-zinc-400 italic pt-1 border-t border-zinc-100">{t("readOnlyNote")}</p>
          )}

          {warning && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800 font-medium">
              ⚠️ {t("doubleBookingWarning")} {warning}
            </div>
          )}
          {actionError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700 font-medium">
              {actionError}
            </div>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-zinc-100 bg-zinc-50/50 p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-xl border border-zinc-200 bg-white p-3.5 space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{t("guest")}</span>
              <p className="font-semibold text-zinc-900">{reservation.customer_name}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <a
                  href={`tel:${cleanPhone}`}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-bold text-zinc-800 hover:bg-zinc-100 transition"
                >
                  📞 {t("callGuest")}
                </a>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition"
                >
                  💬 {t("whatsappGuest")}
                </a>
                <button
                  type="button"
                  onClick={handleCopyPhone}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition"
                >
                  📋 {phoneCopied ? t("copied") : t("copyPhone")}
                </button>
              </div>
              {reservation.customer_email && <p className="text-xs text-zinc-500 pt-1">{reservation.customer_email}</p>}
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-3.5 space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{t("when")}</span>
              <p className="font-semibold text-zinc-900 text-sm">{whenFormatted}</p>
              <p className="text-xs text-zinc-600">{t("partySizeLabel", { count: reservation.party_size })}</p>
              {reservation.owner_note && (
                <p className="text-xs text-zinc-600 italic pt-1">&ldquo;{reservation.owner_note}&rdquo;</p>
              )}
              {reservation.payment_status && reservation.payment_status !== "unpaid" && (
                <div className="pt-1 flex items-center gap-1.5">
                  <span className="text-xs text-zinc-500 font-medium">{t("status")}:</span>
                  <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 capitalize">
                    {reservation.payment_status.replace(/_/g, " ")}
                  </span>
                  {reservation.deposit_amount ? (
                    <span className="text-xs text-zinc-600">
                      ({reservation.deposit_amount} {reservation.deposit_currency || ""})
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {/* Open Change Request Review Box */}
          {reservation.change_request && reservation.change_request.status === "pending" && (
            <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5 uppercase tracking-wider">
                  <AlertCircle className="w-4 h-4 text-amber-700" />
                  {t("changeRequestTitle")}
                </span>
                <span className="text-[11px] font-semibold text-amber-800">
                  {new Date(reservation.change_request.created_at).toLocaleTimeString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: siteTimezone,
                  })}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="space-y-1 bg-white/70 p-2.5 rounded-lg border border-amber-200">
                  <span className="text-[10px] uppercase font-bold text-zinc-500 block">{t("currentDetails")}</span>
                  <p className="font-semibold text-zinc-800">{whenFormatted}</p>
                  <p className="text-zinc-600">{t("partySizeLabel", { count: reservation.party_size })}</p>
                </div>
                <div className="space-y-1 bg-amber-100/60 p-2.5 rounded-lg border border-amber-300">
                  <span className="text-[10px] uppercase font-bold text-amber-900 block">{t("requestedChanges")}</span>
                  {reservation.change_request.requested_starts_at && (
                    <p className="font-semibold text-amber-950">
                      {new Date(reservation.change_request.requested_starts_at).toLocaleString(locale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: siteTimezone,
                      })}
                    </p>
                  )}
                  {reservation.change_request.requested_party_size && (
                    <p className="font-semibold text-amber-950">
                      {t("partySizeLabel", { count: reservation.change_request.requested_party_size })}
                    </p>
                  )}
                  {reservation.change_request.requested_duration_minutes && (
                    <p className="text-amber-900">
                      {reservation.change_request.requested_duration_minutes} min
                    </p>
                  )}
                </div>
              </div>

              {reservation.change_request.guest_note && (
                <p className="text-xs italic text-amber-900 bg-white/50 p-2 rounded border border-amber-200">
                  &ldquo;{reservation.change_request.guest_note}&rdquo;
                </p>
              )}

              {changeActionError && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700 font-medium">
                  {changeActionError}
                </div>
              )}

              {canManage && (
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isApprovingChange || isDecliningChange}
                    onClick={handleApproveChange}
                    className="flex-1 min-h-[36px] rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50 transition"
                  >
                    {isApprovingChange ? "…" : t("approveChange")}
                  </button>
                  <button
                    type="button"
                    disabled={isApprovingChange || isDecliningChange}
                    onClick={() => {
                      setChangeActionError(null);
                      setShowDeclineChangeDialog(true);
                    }}
                    className="flex-1 min-h-[36px] rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50 transition"
                  >
                    {t("declineChange")}
                  </button>
                </div>
              )}
            </div>
          )}

          {reservation.customer_note && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">{t("note")}</span>
              <p className="mt-1 text-xs text-amber-950 font-medium">{reservation.customer_note}</p>
            </div>
          )}

          {canManage && (
            <div className="rounded-xl border border-zinc-200 bg-white p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  {t("internalNote")}
                </span>
                {internalNoteSaved && (
                  <span className="text-[11px] font-semibold text-emerald-600">
                    {tCommon("saved") ?? "Saved"}
                  </span>
                )}
              </div>
              <textarea
                value={internalNoteText}
                maxLength={1000}
                onChange={(e) => {
                  setInternalNoteText(e.target.value);
                  setInternalNoteSaved(false);
                }}
                placeholder={t("internalNotePlaceholder")}
                className="w-full min-h-[70px] rounded-lg border border-zinc-200 p-2.5 text-xs text-zinc-800"
              />
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-zinc-400">
                  {internalNoteText.length}/1000
                </span>
                <button
                  type="button"
                  disabled={isSavingInternalNote || internalNoteText === (reservation.internal_note ?? "")}
                  onClick={handleSaveInternalNote}
                  className="min-h-[36px] rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-zinc-800 transition active:scale-95 disabled:opacity-40"
                >
                  {isSavingInternalNote ? "…" : (tCommon("save") ?? "Save")}
                </button>
              </div>
              {internalNoteError && (
                <p className="text-xs text-red-600 font-medium">{internalNoteError}</p>
              )}
            </div>
          )}

          {Array.isArray(reservation.status_history) && (reservation.status_history as unknown[]).length > 0 && (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">History</h4>
              <ul className="space-y-2 text-xs">
                {(reservation.status_history as Array<{ status?: string; at?: string; by_user_id?: string | null; reason?: string | null; note?: string | null }>).map((hist, idx) => (
                  <li key={idx} className="flex items-start justify-between gap-2 text-zinc-600 border-b border-zinc-50 pb-1.5 last:border-none">
                    <div>
                      <span className="font-semibold text-zinc-800 capitalize">{hist.status}</span>
                      <span className="text-[11px] text-zinc-400 font-medium ml-1">· {formatActorLabel(hist)}</span>
                      {hist.reason && <span className="ml-1 text-zinc-500">({hist.reason})</span>}
                      {hist.note && <span className="ml-1 text-zinc-500">— {hist.note}</span>}
                    </div>
                    {hist.at && (
                      <span className="text-[11px] text-zinc-400 shrink-0 tabular-nums">
                        {new Date(hist.at).toLocaleTimeString(locale === "fr" ? "fr-FR" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-zinc-900">{t("confirmTitle")}</h3>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500 font-medium">{t("confirmGuestMessage")}</label>
              <textarea
                value={dialogNote}
                maxLength={300}
                onChange={(e) => setDialogNote(e.target.value)}
                placeholder={t("ownerNotePlaceholder")}
                className="w-full min-h-[80px] rounded-lg border border-zinc-200 p-2.5 text-xs"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmDialog(false)}
                className="min-h-[44px] flex-1 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-700 hover:bg-zinc-50"
              >
                {t("close")}
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => runUpdate({ expectedCurrentStatus: "pending", nextStatus: "confirmed", ownerNote: dialogNote.trim() || null })}
                className="min-h-[44px] flex-1 rounded-xl bg-emerald-700 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {t("confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeclineDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-zinc-900">
              {actionTargetStatus === "no_show"
                ? t("markNoShow")
                : actionTargetStatus === "cancelled"
                  ? t("cancelTitle")
                  : t("declineTitle")}
            </h3>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500 font-medium">{t("declineReasonLabel")}</label>
              <select
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value as DeclineReasonCode)}
                className="w-full min-h-[44px] rounded-lg border border-zinc-200 px-3 text-xs"
              >
                {DECLINE_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {tDynamic(DECLINE_LABEL_KEY[reason])}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500 font-medium">{t("ownerNote")}</label>
              <textarea
                value={dialogNote}
                maxLength={300}
                onChange={(e) => setDialogNote(e.target.value)}
                placeholder={t("ownerNotePlaceholder")}
                className="w-full min-h-[80px] rounded-lg border border-zinc-200 p-2.5 text-xs"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeclineDialog(false)}
                className="min-h-[44px] flex-1 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-700 hover:bg-zinc-50"
              >
                {t("close")}
              </button>
              <button
                type="button"
                disabled={
                  isSubmitting ||
                  (status === "seated" &&
                    (actionTargetStatus === "cancelled" || actionTargetStatus === "no_show") &&
                    !dialogNote.trim() &&
                    !declineReason)
                }
                onClick={() => {
                  const effectiveReason = dialogNote.trim() || (declineReason ? String(declineReason) : null);
                  runUpdate({
                    expectedCurrentStatus: status,
                    nextStatus: actionTargetStatus,
                    ownerNote:
                      actionTargetStatus === "cancelled" || actionTargetStatus === "declined"
                        ? dialogNote.trim() || null
                        : null,
                    declineReason: actionTargetStatus === "declined" ? declineReason : null,
                    reason: effectiveReason,
                  });
                }}
                className="min-h-[44px] flex-1 rounded-xl bg-red-600 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {actionTargetStatus === "no_show"
                  ? t("markNoShow")
                  : actionTargetStatus === "cancelled"
                    ? t("cancelReservation")
                    : t("decline")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decline Change Request Dialog */}
      {showDeclineChangeDialog && reservation.change_request && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl space-y-4">
            <h4 className="text-sm font-bold text-zinc-900">{t("declineChangeTitle")}</h4>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500 font-medium">{t("decisionNote")}</label>
              <textarea
                value={declineChangeNote}
                maxLength={300}
                onChange={(e) => setDeclineChangeNote(e.target.value)}
                placeholder={t("declineNotePlaceholder")}
                className="w-full min-h-[80px] rounded-lg border border-zinc-200 p-2.5 text-xs focus:border-orange-500 focus:outline-none"
              />
            </div>
            {changeActionError && (
              <p className="text-xs text-red-600 font-medium">{changeActionError}</p>
            )}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeclineChangeDialog(false)}
                className="min-h-[44px] flex-1 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-700 hover:bg-zinc-50"
              >
                {t("close")}
              </button>
              <button
                type="button"
                disabled={isDecliningChange}
                onClick={handleDeclineChange}
                className="min-h-[44px] flex-1 rounded-xl bg-red-600 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isDecliningChange ? "…" : t("declineChange")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
