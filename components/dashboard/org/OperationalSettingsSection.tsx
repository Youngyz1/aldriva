"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  getOperationalSettings,
  saveOperationalHours,
  saveSiteTimezone,
  type OperationalSettingsData,
} from "@/lib/actions/website-content";
import { SITE_TIMEZONE_OPTIONS } from "@/lib/date-timezone";
import type { ContentHours, ContentDayHours } from "@/lib/website-content";
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

const inputCls =
  "rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-sm outline-none focus:border-orange-500 focus:bg-white disabled:opacity-40";

function emptyWeek(): Record<DayKey, ContentDayHours> {
  return {
    mon: {},
    tue: {},
    wed: {},
    thu: {},
    fri: {},
    sat: {},
    sun: {},
  };
}

/**
 * "Opening hours" + "Time zone" section for organizer Settings.
 * Rendered only when the org has a business or website. Reads and writes the
 * SAME canonical value the website builder uses
 * (website_content.content.hours, draft-first), so a change here appears in
 * the builder, the website footer, order scheduling, and reservations — and
 * vice versa.
 */
export function OperationalSettingsSection({ organizerId }: { organizerId: string }) {
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const [week, setWeek] = useState<Record<DayKey, ContentDayHours>>(emptyWeek());
  const [todayTag, setTodayTag] = useState("");
  const [timezone, setTimezone] = useState("");
  const [timezoneDefault, setTimezoneDefault] = useState("Africa/Abidjan");
  const [hoursSource, setHoursSource] = useState<OperationalSettingsData["hoursSource"]>(null);
  const [savingHours, setSavingHours] = useState(false);
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
      const base = emptyWeek();
      if (data.hours) {
        for (const { key } of DAYS) {
          const slot = (data.hours as Record<string, ContentDayHours | undefined>)[key];
          if (slot && typeof slot === "object") base[key] = { ...slot };
        }
        if (typeof (data.hours as { today_tag?: unknown }).today_tag === "string") {
          setTodayTag((data.hours as { today_tag: string }).today_tag);
        }
      }
      setWeek(base);
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

  function setDay(key: DayKey, slot: ContentDayHours) {
    setWeek((w) => ({ ...w, [key]: slot }));
  }

  async function handleSaveHours() {
    setSavingHours(true);
    setError("");
    setNotice("");
    const payload: ContentHours = {};
    for (const { key } of DAYS) {
      const slot = week[key];
      if (slot.closed) {
        payload[key] = { closed: true };
      } else if (slot.open || slot.close) {
        payload[key] = { closed: false, open: slot.open ?? "", close: slot.close ?? "" };
      }
    }
    if (todayTag.trim()) payload.today_tag = todayTag.trim();
    const res = await saveOperationalHours({ organizerId, hours: payload });
    setSavingHours(false);
    if (!res.success) {
      setError(res.error || "Could not save opening hours.");
      return;
    }
    setHoursSource("live");
    setNotice("Opening hours saved — live on your website and dashboard.");
  }

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

  return (
    <section id="hours" className="space-y-4 border-t border-zinc-200 pt-6 scroll-mt-6">
      <div>
        <h2 className="text-lg font-black text-zinc-950">Opening hours</h2>
        <p className="mt-1 text-xs font-medium text-zinc-500">
          Same hours your website builder uses — saved live to your website and dashboard.
          {hoursSource === "draft" ? " Currently showing unpublished builder changes." : ""}
        </p>
      </div>
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{notice}</div>
      )}
      <div className="space-y-2">
        {DAYS.map(({ key, label }) => {
          const slot = week[key];
          const closed = slot.closed === true;
          return (
            <div key={key} className="grid grid-cols-[1fr_auto_1fr_1fr] items-center gap-2 rounded-lg border border-zinc-200 p-2">
              <span className="text-xs font-bold text-zinc-700">{label}</span>
              <label className="flex items-center gap-1 text-[11px] text-zinc-600">
                <input
                  type="checkbox"
                  checked={closed}
                  onChange={(e) => setDay(key, e.target.checked ? { closed: true } : {})}
                />
                Closed
              </label>
              <input
                aria-label={`${label} opens`}
                className={inputCls}
                type="time"
                step={900}
                disabled={closed}
                value={typeof slot.open === "string" ? slot.open : ""}
                onChange={(e) => setDay(key, { ...slot, closed: false, open: e.target.value })}
              />
              <input
                aria-label={`${label} closes`}
                className={inputCls}
                type="time"
                step={900}
                disabled={closed}
                value={typeof slot.close === "string" ? slot.close : ""}
                onChange={(e) => setDay(key, { ...slot, closed: false, close: e.target.value })}
              />
            </div>
          );
        })}
        <label className="block text-xs font-medium text-zinc-600">
          Today highlight (optional)
          <input
            className={`${inputCls} mt-1 w-full`}
            maxLength={80}
            value={todayTag}
            onChange={(e) => setTodayTag(e.target.value)}
            placeholder="e.g. Open late tonight"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={handleSaveHours}
        disabled={savingHours}
        className="inline-flex min-h-[44px] items-center rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-zinc-800 disabled:opacity-50"
      >
        {savingHours ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save opening hours"}
      </button>

      <div className="space-y-2 border-t border-zinc-100 pt-4">
        <h3 className="text-sm font-black text-zinc-900">Time zone</h3>
        <p className="text-xs font-medium text-zinc-500">
          Used for Today windows, order scheduling, and reservations. Default from your business country ({timezoneDefault}).
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
