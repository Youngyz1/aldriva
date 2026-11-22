"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconCalendar as CalendarDays } from "@tabler/icons-react";
import { setBookingsEnabled } from "@/lib/actions/bookings";
import { BookingCard, type DashboardBookingRow } from "./BookingCard";

interface ChecklistStep {
  key: "turnOn" | "hours" | "services";
  done: boolean;
  href?: string;
}

interface BookingsClientProps {
  organizerId: string;
  websiteId: string | null;
  canManage: boolean;
  enabled: boolean;
  hoursConfigured: boolean;
  hasActiveService: boolean;
  bookings: DashboardBookingRow[];
  siteTimezone: string;
}

export function BookingsClient({
  organizerId,
  websiteId,
  canManage,
  enabled,
  hoursConfigured,
  hasActiveService,
  bookings,
  siteTimezone,
}: BookingsClientProps) {
  const t = useTranslations("Bookings");
  const tDynamic = t as unknown as (key: string) => string;
  const router = useRouter();
  const [isToggling, setIsToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const handleToggle = async (next: boolean) => {
    if (!websiteId) {
      setToggleError(t("noWebsiteError"));
      return;
    }
    setIsToggling(true);
    setToggleError(null);
    try {
      const res = await setBookingsEnabled(organizerId, websiteId, next);
      if (!res.success) {
        setToggleError(res.message || t("genericError"));
        setIsToggling(false);
        return;
      }
      router.refresh();
    } catch {
      setToggleError(t("genericError"));
      setIsToggling(false);
    }
  };

  const steps: ChecklistStep[] = [
    { key: "turnOn", done: enabled },
    { key: "hours", done: hoursConfigured, href: `/dashboard/org/${organizerId}/settings` },
    { key: "services", done: hasActiveService, href: `/dashboard/org/${organizerId}/services` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-zinc-900">{t("switchLabel")}</p>
          <p className="mt-0.5 text-xs text-zinc-500">{t("switchHint")}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={!canManage || isToggling}
          onClick={() => handleToggle(!enabled)}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            enabled ? "bg-emerald-600" : "bg-zinc-300"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {toggleError ? (
        <p role="alert" className="text-xs font-medium text-red-700">{toggleError}</p>
      ) : null}

      {!enabled ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-base font-bold text-zinc-900">{t("checklistTitle")}</h2>
          <ol className="mt-4 space-y-3">
            {steps.map((step) => (
              <li key={step.key} className="flex items-center gap-3">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    step.done ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                  }`}
                >
                  {step.done ? "✓" : ""}
                </span>
                <span className="flex-1 text-sm text-zinc-700">{tDynamic(`checklistStep${step.key.charAt(0).toUpperCase() + step.key.slice(1)}`)}</span>
                {step.href ? (
                  <a href={step.href} className="text-xs font-semibold text-[var(--primary,#c2410c)] hover:underline">
                    {tDynamic(`checklistCta${step.key.charAt(0).toUpperCase() + step.key.slice(1)}`)}
                  </a>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : bookings.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-8 py-16 text-center">
          <CalendarDays className="mx-auto h-10 w-10 text-zinc-300" />
          <p className="mt-3 text-base font-medium text-zinc-800">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-zinc-500">{t("emptyBody")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              organizerId={organizerId}
              canManage={canManage}
              siteTimezone={siteTimezone}
              onChanged={() => router.refresh()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
