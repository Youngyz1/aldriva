"use client";

/**
 * components/site/blocks/ReservationForm.tsx
 *
 * Request-based table reservation form (Phase 7). The customer asks for a
 * table; nothing is promised until the owner confirms. All wording says
 * "request".
 *
 * Slot computation is pure (lib/reservation-slots.ts) and shared with the
 * server validator — the server re-checks everything authoritatively.
 */

import { useMemo, useState } from "react";
import { submitReservationRequest } from "@/lib/actions/reservations";
import {
  getReservationSlotsForDate,
  ymdInTimeZone,
  zonedTimeToUtc,
} from "@/lib/reservation-slots";
import type { ReservationSettings } from "@/lib/reservation-settings";

export interface StorefrontReservationConfig {
  enabled: boolean;
  slug: string;
  settings: ReservationSettings;
  timeZone: string;
  /** Serialized website content hours ({ mon: { open, close, closed? }, ... }). */
  hours: unknown;
}

export interface ReservationFormLabels {
  title: string;
  subtext: string;
  fullName: string;
  phone: string;
  email: string;
  chooseDate: string;
  chooseTime: string;
  partySize: string;
  specialRequest: string;
  requestTable: string;
  requestingTable: string;
  requestReceived: string;
  requestReceivedSubtext: string;
  requestReference: string;
  trackRequest: string;
  copyTrackingLink: string;
  trackingLinkCopied: string;
  backToSite: string;
  noSlots: string;
  closedThatDay: string;
  checkDetails: string;
  requestNotAvailable: string;
  rateLimited: string;
  tooManyOpenRequests: string;
  invalidPartySize: string;
  requestFailed: string;
  settingsNotePrefix?: string;
}

interface ReservationFormProps {
  config: StorefrontReservationConfig;
  labels: ReservationFormLabels;
  siteSlug: string;
  children?: React.ReactNode;
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function ReservationRequestForm({ config, labels, siteSlug, children }: ReservationFormProps) {
  const { settings, timeZone, hours } = config;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [note, setNote] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [idempotencyKey] = useState(
    () => `res_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  );

  const todayYmd = useMemo(() => ymdInTimeZone(new Date(), timeZone), [timeZone]);
  const [dateYmd, setDateYmd] = useState<string>(todayYmd);
  const [slot, setSlot] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    reservationNumber: string;
    lookupToken: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Next-14-days quick chips, skipping dates with no bookable slots.
  const quickDates = useMemo(() => {
    const now = new Date();
    const out: Array<{ ymd: string; label: string; count: number }> = [];
    for (let offset = 0; offset < 14; offset++) {
      const ymd = addDaysYmd(todayYmd, offset);
      const slots = getReservationSlotsForDate(ymd, hours, settings, timeZone, now);
      if (slots.length === 0) continue;
      const dt = new Date(`${ymd}T12:00:00Z`);
      out.push({
        ymd,
        label: dt.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric", timeZone: "UTC" }),
        count: slots.length,
      });
    }
    return out;
  }, [todayYmd, hours, settings, timeZone]);

  const daySlots = useMemo(
    () => getReservationSlotsForDate(dateYmd, hours, settings, timeZone, new Date()),
    [dateYmd, hours, settings, timeZone]
  );

  const maxYmd = addDaysYmd(todayYmd, settings.max_days_ahead);
  const partyOptions = useMemo(
    () => Array.from({ length: settings.max_party_size }, (_, i) => i + 1),
    [settings.max_party_size]
  );

  const mapServerError = (error?: string, fallback?: string | null): string => {
    switch (error) {
      case "rate_limited":
        return labels.rateLimited;
      case "reservations_unavailable":
      case "website_not_found":
        return labels.requestNotAvailable;
      case "invalid_customer_info":
        return labels.checkDetails;
      case "invalid_party_size":
        return labels.invalidPartySize;
      case "invalid_time":
        return fallback || labels.checkDetails;
      case "too_many_open_requests":
        return labels.tooManyOpenRequests;
      default:
        return fallback || labels.requestFailed;
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    if (!name.trim() || !phone.trim()) {
      setErrorMessage(labels.checkDetails);
      return;
    }
    if (!slot) {
      setErrorMessage(labels.chooseTime);
      return;
    }
    // Slot wall-clock (site timezone) -> UTC instant; the server re-validates.
    const slotUtc = zonedTimeToUtc(dateYmd, slot, timeZone);
    if (slotUtc === null) {
      setErrorMessage(labels.checkDetails);
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await submitReservationRequest({
        slug: config.slug,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        customerEmail: email.trim() || null,
        partySize,
        startsAt: new Date(slotUtc).toISOString(),
        customerNote: note.trim() || null,
        idempotencyKey,
        hp: honeypot || null,
      });
      if (!res.success) {
        setErrorMessage(mapServerError(res.error, res.message));
        setIsSubmitting(false);
        return;
      }
      try {
        localStorage.setItem(
          `aldriva_reservation_${config.slug}`,
          JSON.stringify({ token: res.lookupToken, number: res.reservationNumber, savedAt: Date.now() })
        );
      } catch {
        // Private mode — tracking link still shown on screen.
      }
      setSuccess({ reservationNumber: res.reservationNumber, lookupToken: res.lookupToken });
    } catch {
      setErrorMessage(labels.requestFailed);
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = () => {
    if (typeof window === "undefined" || !success) return;
    const url = `${window.location.origin}/site/${siteSlug}/reservations/${success.lookupToken}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  if (success) {
    return (
      <div className="mx-auto w-full max-w-lg rounded-2xl bg-[var(--ps-surface)] p-[var(--ps-space-6)] text-center shadow-xs border border-[var(--ps-border)] space-y-[var(--ps-space-4)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-[var(--ps-text)]">{labels.requestReceived}</h3>
          <p className="mt-[var(--ps-space-1)] text-xs text-[var(--ps-muted)]">{labels.requestReceivedSubtext}</p>
        </div>
        <div className="rounded-xl bg-[var(--ps-neutral)] p-[var(--ps-space-4)] border border-[var(--ps-border)]">
          <p className="text-xs font-semibold text-[var(--ps-muted)] uppercase tracking-wider">
            {labels.requestReference}
          </p>
          <p className="text-base font-extrabold text-[var(--ps-accent-hover)] mt-[var(--ps-space-1)]">{success.reservationNumber}</p>
        </div>
        <div className="space-y-[var(--ps-space-2)]">
          <a
            href={`/site/${siteSlug}/reservations/${success.lookupToken}`}
            className="ps-button ps-button-primary w-full flex items-center justify-center text-xs font-bold shadow-xs transition"
          >
            {labels.trackRequest}
          </a>
          <button
            type="button"
            onClick={handleCopyLink}
            className="ps-button ps-button-secondary w-full text-xs font-semibold transition"
          >
            {copied ? labels.trackingLinkCopied : labels.copyTrackingLink}
          </button>
        </div>
        <a
          href={`/site/${siteSlug}`}
          className="ps-button ps-button-secondary w-full text-xs font-bold transition"
        >
          {labels.backToSite}
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      {children}
      <form onSubmit={handleSubmit} className="space-y-[var(--ps-space-4)] rounded-2xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-4)] sm:p-[var(--ps-space-6)] shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-[var(--ps-text)]">{labels.title}</h2>
          <p className="mt-[var(--ps-space-1)] text-xs text-[var(--ps-muted)]">{labels.subtext}</p>
          {settings.note ? (
            <p className="mt-[var(--ps-space-2)] rounded-xl bg-amber-50 border border-amber-200 px-[var(--ps-space-3)] py-[var(--ps-space-2)] text-xs text-amber-900">
              {settings.note}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--ps-space-3)]">
          <div className="space-y-[var(--ps-space-1)]">
            <label className="text-xs font-bold text-[var(--ps-muted)]">{labels.fullName} *</label>
            <input
              type="text"
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-[var(--ps-border)] px-[var(--ps-space-3)] text-sm focus:border-[var(--ps-accent-hover)] focus:outline-none"
            />
          </div>
          <div className="space-y-[var(--ps-space-1)]">
            <label className="text-xs font-bold text-[var(--ps-muted)]">{labels.phone} *</label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+225 07000000"
              className="w-full min-h-[44px] rounded-xl border border-[var(--ps-border)] px-[var(--ps-space-3)] text-sm focus:border-[var(--ps-accent-hover)] focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-[var(--ps-space-1)]">
          <label className="text-xs font-bold text-[var(--ps-muted)]">{labels.email}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-[var(--ps-border)] px-[var(--ps-space-3)] text-sm focus:border-[var(--ps-accent-hover)] focus:outline-none"
          />
        </div>

        <div className="space-y-[var(--ps-space-2)]">
          <label className="text-xs font-bold text-[var(--ps-muted)]">{labels.chooseDate} *</label>
          <div className="flex gap-[var(--ps-space-2)] overflow-x-auto pb-[var(--ps-space-1)] -mx-[var(--ps-space-1)] px-[var(--ps-space-1)]">
            {quickDates.map((d) => (
              <button
                key={d.ymd}
                type="button"
                onClick={() => {
                  setDateYmd(d.ymd);
                  setSlot(null);
                }}
                aria-pressed={dateYmd === d.ymd}
                className={`shrink-0 rounded-xl border px-[var(--ps-space-3)] py-[var(--ps-space-2)] text-xs font-bold transition min-h-[44px] ${
                  dateYmd === d.ymd
                    ? "border-[var(--ps-accent-hover)] bg-[var(--ps-accent-light)] text-[var(--ps-accent-hover)]"
                    : "border-[var(--ps-border)] bg-[var(--ps-surface)] text-[var(--ps-muted)] hover:bg-[var(--ps-neutral)]"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <input
            type="date"
            required
            value={dateYmd}
            min={todayYmd}
            max={maxYmd}
            onChange={(e) => {
              if (e.target.value) {
                setDateYmd(e.target.value);
                setSlot(null);
              }
            }}
            className="w-full min-h-[44px] rounded-xl border border-[var(--ps-border)] px-[var(--ps-space-3)] text-sm focus:border-[var(--ps-accent-hover)] focus:outline-none"
          />
        </div>

        <div className="space-y-[var(--ps-space-2)]">
          <label className="text-xs font-bold text-[var(--ps-muted)]">{labels.chooseTime} *</label>
          {daySlots.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--ps-border)] bg-[var(--ps-neutral)] px-[var(--ps-space-3)] py-[var(--ps-space-3)] text-xs text-[var(--ps-muted)]">
              {labels.closedThatDay}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-[var(--ps-space-2)]">
              {daySlots.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSlot(s)}
                  aria-pressed={slot === s}
                  className={`rounded-xl border py-[var(--ps-space-2)] text-xs font-bold transition min-h-[44px] tabular-nums ${
                    slot === s
                      ? "border-[var(--ps-accent-hover)] bg-[var(--ps-accent-light)] text-[var(--ps-accent-hover)]"
                      : "border-[var(--ps-border)] bg-[var(--ps-surface)] text-[var(--ps-muted)] hover:bg-[var(--ps-neutral)]"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--ps-space-3)]">
          <div className="space-y-[var(--ps-space-1)]">
            <label className="text-xs font-bold text-[var(--ps-muted)]">{labels.partySize} *</label>
            <select
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
              className="w-full min-h-[44px] rounded-xl border border-[var(--ps-border)] px-[var(--ps-space-3)] text-sm bg-[var(--ps-surface)] focus:border-[var(--ps-accent-hover)] focus:outline-none"
            >
              {partyOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-[var(--ps-space-1)]">
            <label className="text-xs font-bold text-[var(--ps-muted)]">{labels.specialRequest}</label>
            <textarea
              rows={1}
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-[var(--ps-border)] px-[var(--ps-space-3)] py-[var(--ps-space-2)] text-sm focus:border-[var(--ps-accent-hover)] focus:outline-none"
            />
          </div>
        </div>

        <div style={{ display: "none" }} aria-hidden="true">
          <input
            type="text"
            name="website_url"
            tabIndex={-1}
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            autoComplete="off"
          />
        </div>

        {errorMessage ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-[var(--ps-space-3)] text-xs font-medium text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting || daySlots.length === 0}
          className="ps-button ps-button-primary w-full text-center text-sm font-bold shadow-xs disabled:opacity-40 transition"
        >
          {isSubmitting ? labels.requestingTable : labels.requestTable}
        </button>
      </form>
    </div>
  );
}
