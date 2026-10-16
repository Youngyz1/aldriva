"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  Phone,
  XCircle,
  RotateCw,
  ArrowLeft,
  Users,
} from "lucide-react";
import { cancelReservationByToken } from "@/lib/actions/reservations";

export interface ReservationTrackingData {
  reservationNumber: string;
  businessName: string;
  businessPhone: string | null;
  siteSlug: string;
  status: string;
  partySize: number;
  startsAt: string;
  siteTimezone: string;
  customerNote: string | null;
  ownerNote: string | null;
  declineReason: string | null;
  createdAt: string;
  maskedCustomerName: string;
  maskedCustomerPhone: string;
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
  const canCancel =
    (order.status === "pending" || order.status === "confirmed") &&
    new Date(order.startsAt).getTime() > Date.now();

  const cleanBusinessPhone = order.businessPhone ? order.businessPhone.replace(/[^\d+]/g, "") : null;

  let whenFormatted = order.startsAt;
  try {
    whenFormatted = new Date(order.startsAt).toLocaleString(locale === "fr" ? "fr-FR" : "en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: order.siteTimezone,
    });
  } catch {
    // Fall back to the raw value.
  }

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
