"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconLoader2 as Loader2, IconClock as Clock, IconArrowRight as ArrowRight } from "@tabler/icons-react";
import {
  getOperationalSettings,
  saveSiteTimezone,
  type OperationalSettingsData,
} from "@/lib/actions/website-content";
import { SITE_TIMEZONE_OPTIONS } from "@/lib/date-timezone";
import type { ContentDayHours } from "@/lib/website-content";
import { shouldShowOperationalSettings } from "@/lib/website-content";

const DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
] as const;

type DayKey = (typeof DAYS)[number]["key"];

function formatDaySummary(slot: ContentDayHours | undefined): string {
  if (!slot) return "Not set";
  if (slot.closed) return "Closed";
  if (slot.open && slot.close) return `${slot.open} – ${slot.close}`;
  return "Not set";
}

/**
 * "Opening hours" (read-only) + "Time zone" (editable) section for
 * organizer Settings. The website builder is now the single place hours
 * are edited — content.hours (website_content, draft-first) — so this
 * section only displays the current value and links there, instead of
 * duplicating an editable copy that could drift from the builder's own.
 * Rendered only when the org has a business or website.
 */
export function OperationalSettingsSection({ organizerId }: { organizerId: string }) {
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const [hoursByDay, setHoursByDay] = useState<Record<DayKey, ContentDayHours | undefined>>({
    mon: undefined, tue: undefined, wed: undefined, thu: undefined, fri: undefined, sat: undefined, sun: undefined,
  });
  const [todayTag, setTodayTag] = useState("");
  const [hasHours, setHasHours] = useState(false);
  const [websiteId, setWebsiteId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("");
  const [timezoneDefault, setTimezoneDefault] = useState("Africa/Abidjan");
  const [hoursSource, setHoursSource] = useState<OperationalSettingsData["hoursSource"]>(null);
  const [savingTz, setSavingTz] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await getOperationalSettings(organizerId);
      if (cancelled) return;
      if (!res.success || !res.data) {
        setLoading(false);
        return;
      }
      const data = res.data;
      setVisible(shouldShowOperationalSettings({ hasBusiness: data.hasBusiness, hasWebsite: data.hasWebsite }));
      if (data.hours) {
        const next: Record<DayKey, ContentDayHours | undefined> = {
          mon: undefined, tue: undefined, wed: undefined, thu: undefined, fri: undefined, sat: undefined, sun: undefined,
        };
        for (const { key } of DAYS) {
          const slot = (data.hours as Record<string, ContentDayHours | undefined>)[key];
          if (slot && typeof slot === "object") next[key] = slot;
        }
        setHoursByDay(next);
        setHasHours(true);
        if (typeof (data.hours as { today_tag?: unknown }).today_tag === "string") {
          setTodayTag((data.hours as { today_tag: string }).today_tag);
        }
      } else {
        setHasHours(false);
      }
      setWebsiteId(data.websiteId ?? null);
      setTimezone(data.timezone ?? "");
      setTimezoneDefault(data.timezoneDefault);
      setHoursSource(data.hoursSource);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [organizerId]);

  if (loading || !visible) return null;

  async function handleSaveTimezone() {
    if (!timezone) return;
    setSavingTz(true);
    setError("");
    setNotice("");
    const res = await saveSiteTimezone({ organizerId, timezone });
    setSavingTz(false);
    if (!res.success) {
      setError(res.error || "Could not save the time zone.");
      return;
    }
    setNotice(`Time zone set to ${res.data?.timezone ?? timezone}.`);
  }

  const builderHref = websiteId
    ? `/dashboard/org/${organizerId}/website/builder`
    : `/dashboard/org/${organizerId}/website`;

  return (
    <section id="hours" className="space-y-4 border-t border-zinc-200 pt-6 scroll-mt-6">
      <div>
        <h2 className="text-lg font-black text-zinc-950">Opening hours</h2>
        <p className="mt-1 text-xs font-medium text-zinc-500">
          Set in the website builder — the single source for your hours. This is a read-only summary.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-500">
            <Clock className="h-3.5 w-3.5 text-zinc-400" />
            Current hours
            {hoursSource === "draft" ? " (unpublished draft)" : ""}
          </p>
          <Link
            href={builderHref}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
          >
            Edit in website builder
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {hasHours ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
            {DAYS.map(({ key, label }) => (
              <div key={key} className="min-w-0">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  {label.slice(0, 3)}
                </dt>
                <dd className="text-xs font-semibold text-zinc-800">{formatDaySummary(hoursByDay[key])}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-xs text-zinc-400 italic">No opening hours set yet.</p>
        )}

        {todayTag && (
          <p className="text-xs text-zinc-500">
            <span className="font-semibold text-zinc-600">Today highlight:</span> {todayTag}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{notice}</div>
      )}

      <div className="space-y-2 border-t border-zinc-100 pt-4">
        <h3 className="text-sm font-black text-zinc-900">Time zone</h3>
        <p className="text-xs font-medium text-zinc-500">
          Used for Today windows, order scheduling, and reservations. Platform default: {timezoneDefault}.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Site time zone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-orange-500 focus:bg-white"
          >
            <option value="">Use default ({timezoneDefault})</option>
            {SITE_TIMEZONE_OPTIONS.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleSaveTimezone}
            disabled={savingTz || !timezone}
            className="inline-flex min-h-[44px] items-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            {savingTz ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save time zone"}
          </button>
        </div>
      </div>
    </section>
  );
}
