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
  completed: "bg-zinc-100 text-zinc-600 border-zinc-200",
  no_show: "bg-red-50 text-red-600 border-red-200",
  cancelled: "bg-zinc-100 text-zinc-500 border-zinc-200",
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
  const statusLabel = t(STATUS_LABEL_KEY[order.status] ?? "pending");
  const statusMessageKey: Record<string, string> = {
    pending: "statusPending",
    confirmed: "statusConfirmed",
    declined: "statusDeclined",
    seated: "statusSeated",
    completed: "statusCompleted",
    no_show: "statusNoShow",
    cancelled: "statusCancelled",
  };
  const badgeCls = STATUS_STYLES[order.status] ?? "bg-zinc-100 text-zinc-500 border-zinc-200";
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
    <div className="min-h-screen bg-zinc-50 py-8 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <a
            href={`/site/${order.siteSlug}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{order.businessName}</span>
          </a>
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-50 shadow-xs disabled:opacity-50 transition-colors min-h-[44px]"
          >
            <RotateCw className={`w-3.5 h-3.5 text-zinc-500 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>{t("refresh")}</span>
          </button>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white shadow-xs overflow-hidden">
          <div className="p-6 border-b border-zinc-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  {t("trackingTitle")}
                </p>
                <h1 className="text-2xl font-black text-zinc-900 mt-0.5 tracking-tight">
                  {order.reservationNumber}
                </h1>
              </div>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border capitalize ${badgeCls}`}>
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

            <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
              <p className="text-sm font-bold text-zinc-900">
                {td(statusMessageKey[order.status] ?? "statusPending")}
              </p>
              {order.status === "declined" && (
                <p className="mt-1 text-xs text-zinc-600">
                  {order.declineReason ? declineReasonLabel[order.declineReason] ?? order.declineReason : null}
                  {cleanBusinessPhone ? (
                    <>
                      {" · "}
                      <a href={`tel:${cleanBusinessPhone}`} className="font-bold text-orange-700 underline">
                        {t("callRestaurant")}
                      </a>
                    </>
                  ) : null}
                </p>
              )}
              {order.status === "confirmed" && order.ownerNote ? (
                <p className="mt-1 text-xs text-zinc-600 italic">&ldquo;{order.ownerNote}&rdquo;</p>
              ) : null}
            </div>
          </div>

          <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-zinc-500 font-medium">{t("when")}</p>
                <p className="font-bold text-zinc-900 mt-0.5">{whenFormatted}</p>
                <p className="mt-1 inline-flex items-center gap-1 font-semibold text-zinc-700">
                  <Users className="w-3.5 h-3.5 text-zinc-400" />
                  {td("partySizeLabel", { count: order.partySize })}
                </p>
              </div>
              <div>
                <p className="text-zinc-500 font-medium">{t("guest")}</p>
                <p className="font-semibold text-zinc-900 mt-0.5">{order.maskedCustomerName}</p>
                <p className="text-zinc-600 font-mono mt-0.5">{order.maskedCustomerPhone}</p>
              </div>
              {order.customerNote && (
                <div className="sm:col-span-2">
                  <p className="text-zinc-500 font-medium">{t("note")}</p>
                  <p className="text-zinc-700 italic mt-0.5">&ldquo;{order.customerNote}&rdquo;</p>
                </div>
              )}
            </div>
          </div>

          {canCancel && (
            <div className="p-6 border-b border-zinc-100">
              {!showCancelConfirm ? (
                <button
                  type="button"
                  onClick={() => {
                    setCancelError(null);
                    setShowCancelConfirm(true);
                  }}
                  className="w-full rounded-xl border border-red-200 bg-white py-2.5 text-xs font-bold text-red-600 hover:bg-red-50 transition min-h-[44px]"
                >
                  {t("cancelMyRequest")}
                </button>
              ) : (
                <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 space-y-3">
                  <div>
                    <p className="text-sm font-bold text-zinc-900">{t("cancelConfirmTitle")}</p>
                    <p className="mt-0.5 text-xs text-zinc-600">{t("cancelConfirmBody")}</p>
                  </div>
                  {cancelError && (
                    <p role="alert" className="text-xs font-medium text-red-700">
                      {cancelError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCancelConfirm(false)}
                      className="flex-1 rounded-xl border border-zinc-200 bg-white py-2.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition min-h-[44px]"
                    >
                      {t("keepRequest")}
                    </button>
                    <button
                      type="button"
                      disabled={isCancelling}
                      onClick={handleCancel}
                      className="flex-1 rounded-xl bg-red-600 py-2.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 transition min-h-[44px]"
                    >
                      {t("cancelConfirmAction")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {cleanBusinessPhone && (
            <div className="p-6 bg-zinc-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-center sm:text-left">
                <p className="text-xs font-bold text-zinc-800">{t("trackingTitle")}</p>
                <p className="text-xs text-zinc-500">{order.businessName}</p>
              </div>
              <a
                href={`tel:${cleanBusinessPhone}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 shadow-xs transition-colors min-h-[44px]"
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
