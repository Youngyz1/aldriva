"use client";

import React from "react";
import type { WizardDraft } from "../InvitationPageWizard";
import type { EventLiveFields } from "@/lib/types/invitation-page-snapshot";

interface StepProps {
  eventId: string;
  draft: WizardDraft;
  event: EventLiveFields;
  updateDraft: (patch: Partial<WizardDraft>) => void;
  disabled?: boolean;
}

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
];

export function WizardStepBasics({ draft, event, updateDraft, disabled }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-zinc-900">Event Basics & Locale</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Set the display language, invitation title override, and event timezone.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* Locale */}
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-bold text-zinc-700">Language / Langue</label>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={disabled}
              onClick={() => updateDraft({ locale: "en" })}
              className={`flex flex-1 items-center justify-center rounded-xl border px-4 py-2.5 text-xs font-bold transition ${
                draft.locale === "en"
                  ? "border-orange-600 bg-orange-50 text-orange-700 ring-2 ring-orange-500"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              English
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => updateDraft({ locale: "fr" })}
              className={`flex flex-1 items-center justify-center rounded-xl border px-4 py-2.5 text-xs font-bold transition ${
                draft.locale === "fr"
                  ? "border-orange-600 bg-orange-50 text-orange-700 ring-2 ring-orange-500"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              Français
            </button>
          </div>
        </div>

        {/* Display Title */}
        <div className="space-y-1.5 sm:col-span-2">
          <div className="flex items-center justify-between">
            <label htmlFor="display_title" className="text-xs font-bold text-zinc-700">
              Invitation Display Title
            </label>
            <span className="text-[10px] text-zinc-400">
              {(draft.display_title || "").length} / 120
            </span>
          </div>
          <input
            id="display_title"
            type="text"
            maxLength={120}
            disabled={disabled}
            placeholder={event.title || "e.g. The Annual Luminary Gala"}
            value={draft.display_title ?? ""}
            onChange={(e) => updateDraft({ display_title: e.target.value || null })}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
          />
          <p className="text-[11px] text-zinc-500">
            Leave blank to use the main event title: <span className="font-semibold text-zinc-700">{event.title}</span>
          </p>
        </div>

        {/* Eyebrow */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="eyebrow" className="text-xs font-bold text-zinc-700">
              Eyebrow / Subtitle
            </label>
            <span className="text-[10px] text-zinc-400">
              {(draft.eyebrow || "").length} / 80
            </span>
          </div>
          <input
            id="eyebrow"
            type="text"
            maxLength={80}
            disabled={disabled}
            placeholder="e.g. Cordially Invites You To"
            value={draft.eyebrow ?? ""}
            onChange={(e) => updateDraft({ eyebrow: e.target.value || null })}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
          />
        </div>

        {/* Host Names */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="host_names" className="text-xs font-bold text-zinc-700">
              Host / Organizing Committee
            </label>
            <span className="text-[10px] text-zinc-400">
              {(draft.host_names || "").length} / 200
            </span>
          </div>
          <input
            id="host_names"
            type="text"
            maxLength={200}
            disabled={disabled}
            placeholder="e.g. Dr. & Mrs. Henderson"
            value={draft.host_names ?? ""}
            onChange={(e) => updateDraft({ host_names: e.target.value || null })}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
          />
        </div>

        {/* Timezone */}
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="timezone" className="text-xs font-bold text-zinc-700">
            Event Timezone <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              id="timezone"
              disabled={disabled}
              value={COMMON_TIMEZONES.includes(draft.timezone || "") ? draft.timezone || "" : "custom"}
              onChange={(e) => {
                if (e.target.value !== "custom") {
                  updateDraft({ timezone: e.target.value });
                }
              }}
              className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50 sm:w-1/2"
            >
              <option value="" disabled>
                Select a timezone...
              </option>
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
              <option value="custom">Other (Custom IANA Timezone)</option>
            </select>

            <input
              type="text"
              disabled={disabled}
              placeholder="e.g. Europe/London, America/Chicago"
              value={draft.timezone ?? ""}
              onChange={(e) => updateDraft({ timezone: e.target.value })}
              className="flex-1 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
            />
          </div>
          <p className="text-[11px] text-zinc-500">
            Timezone is required before publishing so guest calendar sync files (.ics / Google Calendar) calculate accurate UTC timestamps.
          </p>
        </div>
      </div>
    </div>
  );
}
