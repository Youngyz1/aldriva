"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  IconCalendarCheck as CalendarCheck,
  IconCircleCheck as CheckCircle2,
  IconClock as Clock,
  IconPhone as Phone,
  IconCircleX as XCircle,
  IconRotateClockwise as RotateCw,
  IconArrowLeft as ArrowLeft,
  IconUsers as Users,
  IconEdit as Edit,
  IconAlertCircle as AlertCircle,
} from "@tabler/icons-react";
import {
  cancelReservationByToken,
  submitChangeRequest,
  withdrawChangeRequest,
} from "@/lib/actions/reservations";
import { formatReservationTimeRange } from "@/lib/reservation-slots";

export interface ReservationTrackingChangeRequest {
  id: string;
  requestedStartsAt: string | null;
  requestedPartySize: number | null;
  requestedDurationMinutes: number | null;
  guestNote: string | null;
  status: "pending" | "approved" | "declined" | "withdrawn" | "expired";
  decisionNote: string | null;
  createdAt: string;
}

export interface ReservationTrackingData {
  reservationNumber: string;
  businessName: string;
  businessPhone: string | null;
  siteSlug: string;
  status: string;
  partySize: number;
  startsAt: string;
  durationMinutes?: number | null;
  endsAt?: string | null;
  siteTimezone: string;
  customerNote: string | null;
  ownerNote: string | null;
  declineReason: string | null;
  createdAt: string;
  maskedCustomerName: string;
  maskedCustomerPhone: string;
  cancellationCutoffMinutes?: number | null;
  changeRequest?: ReservationTrackingChangeRequest | null;
  maxPartySize?: number;
  allowedStayMinutes?: number[];
}

interface ReservationTrackingViewProps {
  order: ReservationTrackingData;
  slug: string;
  lookupToken: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  confirmed: "bg-emerald-50 text-emerald-800 border-emerald-200",
  declined: "bg-red-50 text-red-700 border-red-200",
  seated: "bg-blue-50 text-blue-800 border-blue-200",
  completed: "bg-[var(--ps-neutral)] text-[var(--ps-muted)] border-[var(--ps-border)]",
  no_show: "bg-red-50 text-red-600 border-red-200",
  cancelled: "bg-[var(--ps-neutral)] text-[var(--ps-muted)] border-[var(--ps-border)]",
};

export function ReservationTrackingView({ order, slug, lookupToken }: ReservationTrackingViewProps) {
  const t = useTranslations("Reservations");
  // Dynamic message keys (status-driven) bypass the literal-key typing.
  const td = t as unknown as (key: string, vars?: Record<string, unknown>) => string;
  const locale = useLocale();
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Change request state
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [changeStartsAt, setChangeStartsAt] = useState("");
  const [changePartySize, setChangePartySize] = useState("");
  const [changeDuration, setChangeDuration] = useState("");
  const [changeGuestNote, setChangeGuestNote] = useState("");
  const [isSubmittingChange, setIsSubmittingChange] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [isWithdrawingChange, setIsWithdrawingChange] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        startTransition(() => {
          router.refresh();
        });
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [router]);

  const handleManualRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const handleCancel = async () => {
    setCancelError(null);
    setIsCancelling(true);
    try {
      const res = await cancelReservationByToken({
        slug,
        lookupToken,
        expectedCurrentStatus: order.status as "pending" | "confirmed",
      });
      if (!res.success) {
        setCancelError(res.message || t("cancelled"));
        setIsCancelling(false);
        return;
      }
      setShowCancelConfirm(false);
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setCancelError(t("cancelled"));
    } finally {
      setIsCancelling(false);
    }
  };

  const handleSubmitChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangeError(null);
    setIsSubmittingChange(true);
    try {
      const res = await submitChangeRequest({
        slug,
        lookupToken,
        requestedStartsAt: changeStartsAt.trim() ? new Date(changeStartsAt).toISOString() : null,
        requestedPartySize: changePartySize.trim() ? Number(changePartySize) : null,
        requestedDurationMinutes: changeDuration.trim() ? Number(changeDuration) : null,
        guestNote: changeGuestNote.trim() || null,
      });
      if (!res.success) {
        setChangeError(res.message || "Failed to submit change request.");
        setIsSubmittingChange(false);
        return;
      }
      setShowChangeForm(false);
      setChangeStartsAt("");
      setChangePartySize("");
      setChangeDuration("");
      setChangeGuestNote("");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setChangeError("An unexpected error occurred.");
    } finally {
      setIsSubmittingChange(false);
    }
  };

  const handleWithdrawChange = async () => {
    if (!order.changeRequest) return;
    setChangeError(null);
    setIsWithdrawingChange(true);
    try {
      const res = await withdrawChangeRequest({
        slug,
        lookupToken,
        requestId: order.changeRequest.id,
      });
      if (!res.success) {
        setChangeError(res.message || "Failed to withdraw request.");
        setIsWithdrawingChange(false);
        return;
      }
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setChangeError("An unexpected error occurred.");
    } finally {
      setIsWithdrawingChange(false);
    }
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
  const statusLabel = td(STATUS_LABEL_KEY[order.status] ?? "pending");
  const statusMessageKey: Record<string, string> = {
    pending: "statusPending",
    confirmed: "statusConfirmed",
    declined: "statusDeclined",
    seated: "statusSeated",
    completed: "statusCompleted",
    no_show: "statusNoShow",
    cancelled: "statusCancelled",
  };
  const badgeCls = STATUS_STYLES[order.status] ?? "bg-[var(--ps-neutral)] text-[var(--ps-muted)] border-[var(--ps-border)]";
  const startsAtMs = new Date(order.startsAt).getTime();
  const nowMs = Date.now();
  const isCutoffPassed =
    order.cancellationCutoffMinutes !== null &&
    order.cancellationCutoffMinutes !== undefined &&
    nowMs > startsAtMs - order.cancellationCutoffMinutes * 60 * 1000;

  const canCancel =
    (order.status === "pending" || order.status === "confirmed") &&
    startsAtMs > nowMs &&
    !isCutoffPassed;

  const canRequestChange =
    (order.status === "pending" || order.status === "confirmed") &&
    startsAtMs > nowMs &&
    !order.changeRequest;

  const cleanBusinessPhone = order.businessPhone ? order.businessPhone.replace(/[^\d+]/g, "") : null;

  const whenFormatted = formatReservationTimeRange({
    startsAt: order.startsAt,
    endsAt: order.endsAt,
    durationMinutes: order.durationMinutes,
    timeZone: order.siteTimezone,
    locale,
  });

  const declineReasonLabel: Record<string, string> = {
    fully_booked: t("reasonFullyBooked"),
    closed_that_day: t("reasonClosedThatDay"),
    cannot_accommodate_party: t("reasonCannotAccommodate"),
    other: t("reasonOther"),
  };

  return (
    <div className="public-site min-h-screen bg-[var(--ps-neutral)] py-[var(--ps-space-8)] px-[var(--ps-space-4)] sm:px-[var(--ps-space-6)]">
      <div className="max-w-2xl mx-auto space-y-[var(--ps-space-6)]">
        <div className="flex items-center justify-between">
          <a
            href={`/site/${order.siteSlug}`}
            className="inline-flex items-center gap-[var(--ps-space-2)] text-xs font-semibold text-[var(--ps-muted)] hover:text-[var(--ps-text)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{order.businessName}</span>
          </a>
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="ps-button ps-button-secondary inline-flex items-center gap-[var(--ps-space-2)] text-xs font-medium shadow-xs disabled:opacity-50 transition-colors"
          >
            <RotateCw className={`w-3.5 h-3.5 text-[var(--ps-muted)] ${isRefreshing ? "animate-spin" : ""}`} />
            <span>{t("refresh")}</span>
          </button>
        </div>

        <div className="rounded-2xl border border-[var(--ps-border)] bg-[var(--ps-surface)] shadow-xs overflow-hidden">
          <div className="p-[var(--ps-space-6)] border-b border-[var(--ps-border)]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[var(--ps-space-3)]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ps-muted)]">
                  {t("trackingTitle")}
                </p>
                <h1 className="text-2xl font-black text-[var(--ps-text)] mt-[var(--ps-space-1)] tracking-tight">
                  {order.reservationNumber}
                </h1>
              </div>
              <span className={`inline-flex items-center gap-[var(--ps-space-2)] px-[var(--ps-space-3)] py-[var(--ps-space-1)] rounded-full text-xs font-semibold border capitalize ${badgeCls}`}>
                {order.status === "pending" ? (
                  <Clock className="w-3.5 h-3.5" />
                ) : order.status === "confirmed" || order.status === "seated" ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : order.status === "declined" || order.status === "cancelled" ? (
                  <XCircle className="w-3.5 h-3.5" />
                ) : (
                  <CalendarCheck className="w-3.5 h-3.5" />
                )}
                {statusLabel}
              </span>
            </div>

            <div className="mt-[var(--ps-space-6)] rounded-xl border border-[var(--ps-border)] bg-[var(--ps-neutral)]/80 p-[var(--ps-space-4)]">
              <p className="text-sm font-bold text-[var(--ps-text)]">
                {td(statusMessageKey[order.status] ?? "statusPending")}
              </p>
              {order.status === "declined" && (
                <p className="mt-[var(--ps-space-1)] text-xs text-[var(--ps-muted)]">
                  {order.declineReason ? declineReasonLabel[order.declineReason] ?? order.declineReason : null}
                  {cleanBusinessPhone ? (
                    <>
                      {" · "}
                      <a href={`tel:${cleanBusinessPhone}`} className="font-bold text-[var(--ps-accent-hover)] underline">
                        {t("callRestaurant")}
                      </a>
                    </>
                  ) : null}
                </p>
              )}
              {order.status === "confirmed" && order.ownerNote ? (
                <p className="mt-[var(--ps-space-1)] text-xs text-[var(--ps-muted)] italic">&ldquo;{order.ownerNote}&rdquo;</p>
              ) : null}
            </div>
          </div>

          <div className="p-[var(--ps-space-6)] border-b border-[var(--ps-border)] bg-[var(--ps-neutral)]/50">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--ps-space-4)] text-xs">
              <div>
                <p className="text-[var(--ps-muted)] font-medium">{t("when")}</p>
                <p className="font-bold text-[var(--ps-text)] mt-[var(--ps-space-1)]">{whenFormatted}</p>
                <p className="mt-[var(--ps-space-1)] inline-flex items-center gap-[var(--ps-space-1)] font-semibold text-[var(--ps-muted)]">
                  <Users className="w-3.5 h-3.5 text-[var(--ps-muted)]" />
                  {td("partySizeLabel", { count: order.partySize })}
                </p>
              </div>
              <div>
                <p className="text-[var(--ps-muted)] font-medium">{t("guest")}</p>
                <p className="font-semibold text-[var(--ps-text)] mt-[var(--ps-space-1)]">{order.maskedCustomerName}</p>
                <p className="text-[var(--ps-muted)] font-mono mt-[var(--ps-space-1)]">{order.maskedCustomerPhone}</p>
              </div>
              {order.customerNote && (
                <div className="sm:col-span-2">
                  <p className="text-[var(--ps-muted)] font-medium">{t("note")}</p>
                  <p className="text-[var(--ps-muted)] italic mt-[var(--ps-space-1)]">&ldquo;{order.customerNote}&rdquo;</p>
                </div>
              )}
            </div>
          </div>

          {/* Open or Recent Change Request Display */}
          {order.changeRequest && (
            <div className="p-[var(--ps-space-6)] border-b border-[var(--ps-border)] bg-zinc-50/70 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--ps-text)] flex items-center gap-1.5">
                  <Edit className="w-3.5 h-3.5 text-orange-600" />
                  {t("changeRequestTitle")}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider ${
                    order.changeRequest.status === "pending"
                      ? "bg-amber-100 text-amber-800"
                      : order.changeRequest.status === "approved"
                      ? "bg-emerald-100 text-emerald-800"
                      : order.changeRequest.status === "declined"
                      ? "bg-red-100 text-red-800"
                      : "bg-zinc-100 text-zinc-700"
                  }`}
                >
                  {td(`changeRequestStatus_${order.changeRequest.status}`)}
                </span>
              </div>

              <div className="text-xs space-y-1 text-zinc-700">
                {order.changeRequest.requestedStartsAt && (
                  <p>
                    <span className="text-[var(--ps-muted)]">{t("requestedStartsAt")}: </span>
                    <span className="font-semibold">
                      {new Date(order.changeRequest.requestedStartsAt).toLocaleString(locale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: order.siteTimezone,
                      })}
                    </span>
                  </p>
                )}
                {order.changeRequest.requestedPartySize && (
                  <p>
                    <span className="text-[var(--ps-muted)]">{t("requestedPartySize")}: </span>
                    <span className="font-semibold">{td("partySizeLabel", { count: order.changeRequest.requestedPartySize })}</span>
                  </p>
                )}
                {order.changeRequest.requestedDurationMinutes && (
                  <p>
                    <span className="text-[var(--ps-muted)]">{t("requestedDuration")}: </span>
                    <span className="font-semibold">{order.changeRequest.requestedDurationMinutes} min</span>
                  </p>
                )}
                {order.changeRequest.guestNote && (
                  <p className="italic text-zinc-600">&ldquo;{order.changeRequest.guestNote}&rdquo;</p>
                )}
                {order.changeRequest.status === "declined" && order.changeRequest.decisionNote && (
                  <p className="mt-2 text-red-700 bg-red-50 p-2 rounded-lg border border-red-200">
                    <span className="font-semibold">{t("declineNote")}: </span>
                    {order.changeRequest.decisionNote}
                  </p>
                )}
              </div>

              {order.changeRequest.status === "pending" && (
                <div className="pt-2">
                  <button
                    type="button"
                    disabled={isWithdrawingChange}
                    onClick={handleWithdrawChange}
                    className="text-xs font-semibold text-zinc-600 hover:text-red-600 transition"
                  >
                    {isWithdrawingChange ? t("withdrawing") : t("withdrawRequest")}
                  </button>
                  {changeError && <p className="text-xs text-red-600 mt-1">{changeError}</p>}
                </div>
              )}
            </div>
          )}

          {/* Request Change Section */}
          {canRequestChange && !showChangeForm && (
            <div className="p-[var(--ps-space-6)] border-b border-[var(--ps-border)]">
              <button
                type="button"
                onClick={() => {
                  setChangeError(null);
                  setShowChangeForm(true);
                }}
                className="ps-button w-full border border-zinc-200 bg-[var(--ps-surface)] text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition"
              >
                {t("requestChange")}
              </button>
            </div>
          )}

          {/* Change Request Form */}
          {showChangeForm && (
            <form onSubmit={handleSubmitChange} className="p-[var(--ps-space-6)] border-b border-[var(--ps-border)] bg-zinc-50/50 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-900">{t("requestChangeTitle")}</h3>
                <button
                  type="button"
                  onClick={() => setShowChangeForm(false)}
                  className="text-xs text-zinc-500 hover:text-zinc-700"
                >
                  {t("cancel")}
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-700 block mb-1">{t("changeTimeLabel")}</label>
                  <input
                    type="datetime-local"
                    value={changeStartsAt}
                    onChange={(e) => setChangeStartsAt(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-zinc-200 px-3 text-xs bg-white focus:border-orange-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-zinc-700 block mb-1">{t("changePartyLabel")}</label>
                    <input
                      type="number"
                      min="1"
                      max={order.maxPartySize ?? 50}
                      step="1"
                      placeholder={`1-${order.maxPartySize ?? 50}`}
                      value={changePartySize}
                      onChange={(e) => setChangePartySize(e.target.value)}
                      className="w-full min-h-[44px] rounded-xl border border-zinc-200 px-3 text-xs bg-white focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-700 block mb-1">{t("changeDurationLabel")}</label>
                    <select
                      value={changeDuration}
                      onChange={(e) => setChangeDuration(e.target.value)}
                      className="w-full min-h-[44px] rounded-xl border border-zinc-200 px-3 text-xs bg-white focus:border-orange-500 focus:outline-none"
                    >
                      <option value="">{t("keepCurrentDuration")}</option>
                      {(order.allowedStayMinutes ?? [60, 90, 120]).map((m) => (
                        <option key={m} value={m}>
                          {m} min
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-700 block mb-1">{t("changeNoteLabel")}</label>
                  <textarea
                    rows={2}
                    maxLength={300}
                    value={changeGuestNote}
                    onChange={(e) => setChangeGuestNote(e.target.value)}
                    placeholder={t("changeNotePlaceholder")}
                    className="w-full min-h-[44px] rounded-xl border border-zinc-200 px-3 py-2 text-xs bg-white focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>

              {changeError && (
                <p role="alert" className="text-xs font-medium text-red-600">
                  {changeError}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowChangeForm(false)}
                  className="ps-button ps-button-secondary flex-1 text-xs font-bold"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingChange || (!changeStartsAt && !changePartySize && !changeDuration)}
                  className="ps-button ps-button-primary flex-1 text-xs font-bold disabled:opacity-50"
                >
                  {isSubmittingChange ? t("submitting") : t("submitChangeRequest")}
                </button>
              </div>
            </form>
          )}

          {/* Cancellation Cutoff Closed Notice */}
          {isCutoffPassed && (order.status === "pending" || order.status === "confirmed") && (
            <div className="p-[var(--ps-space-6)] border-b border-[var(--ps-border)] bg-amber-50/50 flex items-center gap-2 text-xs text-amber-900 font-medium">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>{t("cancellationWindowClosed")}</span>
            </div>
          )}

          {canCancel && (
            <div className="p-[var(--ps-space-6)] border-b border-[var(--ps-border)]">
              {!showCancelConfirm ? (
                <button
                  type="button"
                  onClick={() => {
                    setCancelError(null);
                    setShowCancelConfirm(true);
                  }}
                  className="ps-button w-full border border-red-200 bg-[var(--ps-surface)] text-xs font-bold text-red-600 hover:bg-red-50 transition"
                >
                  {t("cancelMyRequest")}
                </button>
              ) : (
                <div className="rounded-xl border border-red-200 bg-red-50/60 p-[var(--ps-space-4)] space-y-[var(--ps-space-3)]">
                  <div>
                    <p className="text-sm font-bold text-[var(--ps-text)]">{t("cancelConfirmTitle")}</p>
                    <p className="mt-[var(--ps-space-1)] text-xs text-[var(--ps-muted)]">{t("cancelConfirmBody")}</p>
                  </div>
                  {cancelError && (
                    <p role="alert" className="text-xs font-medium text-red-700">
                      {cancelError}
                    </p>
                  )}
                  <div className="flex gap-[var(--ps-space-2)]">
                    <button
                      type="button"
                      onClick={() => setShowCancelConfirm(false)}
                      className="ps-button ps-button-secondary flex-1 text-xs font-bold transition"
                    >
                      {t("keepRequest")}
                    </button>
                    <button
                      type="button"
                      disabled={isCancelling}
                      onClick={handleCancel}
                      className="ps-button flex-1 bg-red-600 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 transition"
                    >
                      {t("cancelConfirmAction")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {cleanBusinessPhone && (
            <div className="p-[var(--ps-space-6)] bg-[var(--ps-neutral)]/50 flex flex-col sm:flex-row items-center justify-between gap-[var(--ps-space-3)]">
              <div className="text-center sm:text-left">
                <p className="text-xs font-bold text-[var(--ps-text)]">{t("trackingTitle")}</p>
                <p className="text-xs text-[var(--ps-muted)]">{order.businessName}</p>
              </div>
              <a
                href={`tel:${cleanBusinessPhone}`}
                className="ps-button ps-button-primary inline-flex items-center gap-[var(--ps-space-2)] text-xs font-bold shadow-xs transition-colors"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>{t("callRestaurant")}</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
