"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { confirmBooking, declineBooking, cancelBooking } from "@/lib/actions/bookings";
import { formatReservationTimeRange } from "@/lib/reservation-slots";

export interface DashboardBookingRow {
  id: string;
  reservation_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  customer_note: string | null;
  starts_at: string;
  status: string;
  created_at: string;
  service_title: string | null;
  alt_starts_at: string | null;
  duration_minutes: number | null;
  booking_mode: string | null;
}

interface BookingCardProps {
  booking: DashboardBookingRow;
  organizerId: string;
  canManage: boolean;
  siteTimezone: string;
  onChanged: () => void;
}

const STATUS_VARIANTS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 border-amber-200 font-semibold",
  confirmed: "bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold",
  declined: "bg-red-50 text-red-700 border-red-200 font-medium",
  completed: "bg-zinc-100 text-zinc-600 border-zinc-200 font-medium",
  no_show: "bg-red-50 text-red-600 border-red-200 font-medium",
  cancelled: "bg-zinc-100 text-zinc-500 border-zinc-200 font-medium",
};

const STATUS_LABEL_KEY: Record<string, string> = {
  pending: "statusPending",
  confirmed: "statusConfirmed",
  declined: "statusDeclined",
  completed: "statusCompleted",
  no_show: "statusNoShow",
  cancelled: "statusCancelled",
};

export function BookingCard({ booking, organizerId, canManage, siteTimezone, onChanged }: BookingCardProps) {
  const t = useTranslations("Bookings");
  const tDynamic = t as unknown as (key: string) => string;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasonMode, setReasonMode] = useState<"decline" | "cancel" | null>(null);
  const [reason, setReason] = useState("");

  const when = formatReservationTimeRange({
    startsAt: booking.starts_at,
    timeZone: siteTimezone,
    locale: "en",
  });
  const altWhen = booking.alt_starts_at
    ? formatReservationTimeRange({ startsAt: booking.alt_starts_at, timeZone: siteTimezone, locale: "en" })
    : null;

  const runAction = async (action: () => Promise<{ success: boolean; error?: string; message?: string }>) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await action();
      if (!res.success) {
        setError(res.message || t("genericError"));
        setIsSubmitting(false);
        return;
      }
      setReasonMode(null);
      setReason("");
      onChanged();
    } catch {
      setError(t("genericError"));
      setIsSubmitting(false);
    }
  };

  const canCancel = booking.status === "pending" || booking.status === "confirmed";

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-zinc-900">{booking.customer_name}</p>
          <p className="mt-0.5 text-xs text-zinc-500">#{booking.reservation_number}</p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${STATUS_VARIANTS[booking.status] ?? STATUS_VARIANTS.pending}`}>
          {tDynamic(STATUS_LABEL_KEY[booking.status] ?? "statusPending")}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{t("service")}</dt>
          <dd className="text-zinc-800">{booking.service_title || "—"}</dd>
        </div>
        {booking.booking_mode === "date_only" ? (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{t("requestedTime")}</dt>
            <dd className="text-zinc-800">{t("timeToBeConfirmed")}</dd>
          </div>
        ) : (
          <>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{t("requestedTime")}</dt>
              <dd className="text-zinc-800">{when}</dd>
            </div>
            {booking.duration_minutes != null ? (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{t("duration")}</dt>
                <dd className="text-zinc-800">{booking.duration_minutes} min</dd>
              </div>
            ) : null}
          </>
        )}
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{t("phone")}</dt>
          <dd className="text-zinc-800">
            <a href={`tel:${booking.customer_phone}`} className="hover:underline">{booking.customer_phone}</a>
          </dd>
        </div>
        {altWhen ? (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{t("alternateTime")}</dt>
            <dd className="text-zinc-800">{altWhen}</dd>
          </div>
        ) : null}
        {booking.customer_email ? (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{t("email")}</dt>
            <dd className="text-zinc-800">
              <a href={`mailto:${booking.customer_email}`} className="hover:underline">{booking.customer_email}</a>
            </dd>
          </div>
        ) : null}
        {booking.customer_note ? (
          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{t("notes")}</dt>
            <dd className="text-zinc-800">{booking.customer_note}</dd>
          </div>
        ) : null}
      </dl>

      {error ? (
        <p role="alert" className="mt-3 text-xs font-medium text-red-700">{error}</p>
      ) : null}

      {canManage && reasonMode ? (
        <div className="mt-3 space-y-2">
          <label htmlFor={`reason-${booking.id}`} className="text-xs font-semibold text-zinc-700">
            {t("reasonLabel")}
          </label>
          <textarea
            id={`reason-${booking.id}`}
            rows={2}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() =>
                runAction(() =>
                  reasonMode === "decline"
                    ? declineBooking(booking.id, organizerId, reason || null)
                    : cancelBooking(booking.id, organizerId, booking.status, reason || null)
                )
              }
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {reasonMode === "decline" ? t("decline") : t("cancel")}
            </button>
            <button
              type="button"
              onClick={() => { setReasonMode(null); setReason(""); }}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700"
            >
              {t("dismiss")}
            </button>
          </div>
        </div>
      ) : canManage && booking.status === "pending" ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => runAction(() => confirmBooking(booking.id, organizerId))}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {t("confirm")}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setReasonMode("decline")}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 disabled:opacity-50"
          >
            {t("decline")}
          </button>
        </div>
      ) : canManage && canCancel ? (
        <div className="mt-3">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setReasonMode("cancel")}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 disabled:opacity-50"
          >
            {t("cancel")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
