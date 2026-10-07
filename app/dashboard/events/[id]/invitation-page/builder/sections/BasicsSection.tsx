"use client";

/**
 * Builder Basics section — migrated unchanged from WizardStepBasics:
 * locale, display title, eyebrow, host names, timezone.
 *
 * Invitation-kind events additionally collect the event record itself
 * (title, date/time, venue, city) here — there is no separate event form
 * for them. Saved explicitly via updateInvitationEventFields.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BuilderDraft } from "../InvitationPageBuilder";
import type { EventLiveFields } from "@/lib/types/invitation-page-snapshot";
import { INVITATION_DRAFT_TITLE } from "@/lib/invitation-events";
import { updateInvitationEventFields } from "@/lib/actions/invitation-events";

interface Props {
  draft: BuilderDraft;
  event: EventLiveFields;
  eventId: string;
  updateDraft: (patch: Partial<BuilderDraft>) => void;
  disabled?: boolean;
}

/** ISO/timestamptz → datetime-local input value (local wall time). */
function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

const COMMON_TIMEZONES = [  "UTC",
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

export function BasicsSection({ draft, event, eventId, updateDraft, disabled }: Props) {
  const isInvitationKind = event.kind === "invitation";
  const router = useRouter();
  const [eventTitle, setEventTitle] = useState(
    event.title === INVITATION_DRAFT_TITLE ? "" : event.title
  );
  const [eventDate, setEventDate] = useState(() => toDateTimeLocal(event.event_date));
  const [venue, setVenue] = useState(event.venue ?? "");
  const [city, setCity] = useState(event.city ?? "");
  const [eventSaving, setEventSaving] = useState(false);
  const [eventSaved, setEventSaved] = useState(false);
  const [eventError, setEventError] = useState("");

  async function handleSaveEvent() {
    if (eventSaving) return;
    setEventSaving(true);
    setEventError("");
    setEventSaved(false);
    try {
      const result = await updateInvitationEventFields(eventId, {
        title: eventTitle,
        event_date: eventDate || null,
        venue: venue || null,
        city: city || null,
      });
      if (!result.ok) {
        setEventError(result.error ?? "Could not save event details.");
        return;
      }
      setEventSaved(true);
      router.refresh();
    } catch {
      setEventError("Could not save event details.");
    } finally {
      setEventSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {isInvitationKind && (
        <div className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/50 p-4 sm:col-span-2">
          <p className="text-xs font-black uppercase tracking-wide text-violet-700">
            Event details (required to publish)
          </p>
          <div className="space-y-1.5">
            <label htmlFor="event_title" className="text-xs font-bold text-zinc-700">
              Event Title <span className="text-red-500">*</span>
            </label>
            <input
              id="event_title"
              type="text"
              maxLength={140}
              disabled={disabled}
              placeholder="e.g. Amara & Kwame's Wedding"
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="event_date" className="text-xs font-bold text-zinc-700">
                Date &amp; Time <span className="text-red-500">*</span>
              </label>
              <input
                id="event_date"
                type="datetime-local"
                disabled={disabled}
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="event_city" className="text-xs font-bold text-zinc-700">
                City
              </label>
              <input
                id="event_city"
                type="text"
                maxLength={120}
                disabled={disabled}
                placeholder="e.g. Abidjan"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="event_venue" className="text-xs font-bold text-zinc-700">
              Venue
            </label>
            <input
              id="event_venue"
              type="text"
              maxLength={200}
              disabled={disabled}
              placeholder="e.g. Palais des Congrès"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={disabled || eventSaving}
              onClick={handleSaveEvent}
              className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white transition hover:bg-violet-700 disabled:opacity-50"
            >
              {eventSaving ? "Saving…" : "Save event details"}
            </button>
            {eventSaved && <span className="text-xs font-bold text-emerald-600">Saved.</span>}
            {eventError && <span className="text-xs font-semibold text-red-600">{eventError}</span>}
          </div>
        </div>
      )}
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
  );
}
