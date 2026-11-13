"use client";

/**
 * components/site/blocks/ReservationForm.tsx
 *
 * Request-based table reservation form (Phase 7). The customer asks for a
 * table; nothing is promised until the owner confirms. All wording says
 * "request".
 *
 * Layout: header band (site cover/hero image, else solid brand band), then one
 * white card pulled up over the header with three sections — guest
 * information, reservation details, guest notes. Shared pieces live in
 * components/site/reservations/ so the Service and General Booking forms can
 * reuse them later.
 *
 * Slot computation is pure (lib/reservation-slots.ts) and shared with the
 * server validator — the server re-checks everything authoritatively.
 *
 * All styling is scoped under .rsv-form.rsv-root via reservations.css so
 * global input/select/button rules (including Savannah template overrides)
 * cannot flatten these controls.
 */

import { useMemo, useState } from "react";
import { submitReservationRequest } from "@/lib/actions/reservations";
import {
  formatDurationOptionLabel,
  getReservationSlotsForDate,
  ymdInTimeZone,
  zonedTimeToUtc,
} from "@/lib/reservation-slots";
import type { ReservationSettings } from "@/lib/reservation-settings";
import {
  DurationChips,
  PartySizeSelect,
  ReservationField,
  ReservationHeader,
  ReservationSection,
  SlotPicker,
} from "../reservations";
import "../reservations/reservations.css";

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
  fullyBooked?: string;
  settingsNotePrefix?: string;
  guestInformation: string;
  reservationDetails: string;
  guestNotes: string;
  duration: string;
  reservationTime: string;
  errorName: string;
  errorPhone: string;
  errorTime: string;
}

interface ReservationFormProps {
  config: StorefrontReservationConfig;
  labels: ReservationFormLabels;
  siteSlug: string;
  businessName?: string;
  coverImageUrl?: string | null;
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function ReservationRequestForm({ config, labels, siteSlug, businessName, coverImageUrl }: ReservationFormProps) {
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

  const defaultStay = settings.default_stay_minutes ?? 90;
  const maxStay = settings.max_stay_minutes ?? 120;

  const durationOptions = useMemo(() => {
    if (Array.isArray(settings.allowed_stay_minutes) && settings.allowed_stay_minutes.length > 0) {
      return [...settings.allowed_stay_minutes].sort((a, b) => a - b);
    }
    if (maxStay <= defaultStay) return [defaultStay];
    return [defaultStay, maxStay].sort((a, b) => a - b);
  }, [settings.allowed_stay_minutes, defaultStay, maxStay]);

  const [duration, setDuration] = useState<number>(() => {
    if (durationOptions.includes(defaultStay)) return defaultStay;
    return durationOptions[0] ?? 90;
  });

  const endTimeLabel = useMemo(() => {
    if (!slot) return null;
    const [h, m] = slot.split(":").map(Number);
    const total = h * 60 + m + duration;
    const endH = Math.floor((total % 1440) / 60);
    const endM = total % 60;
    const endStr = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
    const durStr = formatDurationOptionLabel(duration);
    return `${slot} – ${endStr} (${durStr})`;
  }, [slot, duration]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    reservationNumber: string;
    lookupToken: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Next-14-days quick chips, skipping dates with no bookable slots.
  const quickDates = useMemo(() => {
    const now = new Date();
    const out: Array<{ ymd: string; weekday: string; date: string; count: number }> = [];
    for (let offset = 0; offset < 14; offset++) {
      const ymd = addDaysYmd(todayYmd, offset);
      const slots = getReservationSlotsForDate(ymd, hours, settings, timeZone, now);
      if (slots.length === 0) continue;
      const dt = new Date(`${ymd}T12:00:00Z`);
      const opts = { weekday: "short", month: "numeric", day: "numeric", timeZone: "UTC" } as const;
      const parts = new Intl.DateTimeFormat("en-US", opts).formatToParts(dt);
      const weekday = parts.find(p => p.type === "weekday")?.value ?? "";
      const month = parts.find(p => p.type === "month")?.value ?? "";
      const day = parts.find(p => p.type === "day")?.value ?? "";
      out.push({
        ymd,
        weekday,
        date: `${month} ${day}`,
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
      case "invalid_duration":
        return fallback || "The selected duration is not available. Please choose another duration.";
      case "fully_booked":
        return fallback || labels.fullyBooked || "That time is fully booked. Please pick another time or call the restaurant.";
      case "too_many_open_requests":
        return labels.tooManyOpenRequests;
      default:
        return fallback || labels.requestFailed;
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});

    let invalid = false;
    if (!name.trim()) {
      setFieldErrors((p) => ({ ...p, name: labels.errorName }));
      invalid = true;
    }
    if (!phone.trim()) {
      setFieldErrors((p) => ({ ...p, phone: labels.errorPhone }));
      invalid = true;
    }
    if (invalid) return;
    if (!slot) {
      setFieldErrors((p) => ({ ...p, time: labels.errorTime }));
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
        durationMinutes: duration,
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
      <div className="rsv-form rsv-root">
        <ReservationHeader
          businessName={businessName}
          title={labels.title}
          coverImageUrl={coverImageUrl ?? null}
        />
        <div className="rsv-inner">
          <section className="rsv-card text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-[var(--rsv-text)]">{labels.requestReceived}</h3>
              <p className="mt-[var(--ps-space-1)] text-xs text-[var(--rsv-muted)]">{labels.requestReceivedSubtext}</p>
            </div>
            <div className="rounded-2xl bg-[var(--rsv-surface)] p-[var(--ps-space-4)] border border-[var(--rsv-border)]">
              <p className="text-xs font-semibold text-[var(--rsv-muted)] uppercase tracking-wider">
                {labels.requestReference}
              </p>
              <p className="text-base font-extrabold text-[var(--rsv-accent)] mt-[var(--ps-space-1)]">{success.reservationNumber}</p>
            </div>
            <div className="space-y-[var(--ps-space-2)] mt-[var(--ps-space-4)]">
              <a
                href={`/site/${siteSlug}/reservations/${success.lookupToken}`}
                className="rsv-button rsv-pill w-full flex items-center justify-center text-xs font-bold"
              >
                {labels.trackRequest}
              </a>
              <button
                type="button"
                onClick={handleCopyLink}
                className="rsv-button rsv-pill w-full text-xs font-semibold"
              >
                {copied ? labels.trackingLinkCopied : labels.copyTrackingLink}
              </button>
            </div>
            <a
              href={`/site/${siteSlug}`}
              className="rsv-button rsv-pill w-full text-xs font-bold mt-[var(--ps-space-2)]"
            >
              {labels.backToSite}
            </a>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="rsv-form rsv-root">
      <ReservationHeader
        businessName={businessName}
        title={labels.title}
        coverImageUrl={coverImageUrl ?? null}
      />
      <div className="rsv-inner">
        <form onSubmit={handleSubmit} className="rsv-card">
          <ReservationSection heading={labels.guestInformation}>
            <div className="rsv-grid">
              <ReservationField id="reservation-name" label={labels.fullName} required error={fieldErrors.name}>
                <input
                  id="reservation-name"
                  type="text"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-describedby={fieldErrors.name ? "reservation-name-error" : undefined}
                  className="rsv-input"
                  aria-invalid={fieldErrors.name ? "true" : undefined}
                />
              </ReservationField>
              <ReservationField id="reservation-phone" label={labels.phone} required error={fieldErrors.phone}>
                <input
                  id="reservation-phone"
                  type="tel"
                  required
                  placeholder="+225 07000000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  aria-describedby={fieldErrors.phone ? "reservation-phone-error" : undefined}
                  className="rsv-input"
                  aria-invalid={fieldErrors.phone ? "true" : undefined}
                />
              </ReservationField>
            </div>
            <ReservationField id="reservation-email" label={labels.email} error={fieldErrors.email}>
              <input
                id="reservation-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-describedby={fieldErrors.email ? "reservation-email-error" : undefined}
                className="rsv-input"
                aria-invalid={fieldErrors.email ? "true" : undefined}
              />
            </ReservationField>
          </ReservationSection>

          <ReservationSection heading={labels.reservationDetails}>
            <SlotPicker
              dateYmd={dateYmd}
              min={todayYmd}
              max={maxYmd}
              onDateChange={(ymd: string) => {
                setDateYmd(ymd);
                setSlot(null);
              }}
              quickDates={quickDates}
              slots={daySlots}
              selectedSlot={slot}
              onSlotChange={setSlot}
              labels={{
                chooseDate: labels.chooseDate,
                chooseTime: labels.chooseTime,
                closedThatDay: labels.closedThatDay,
              }}
            />
            {durationOptions.length > 1 && (
              <DurationChips
                options={durationOptions}
                value={duration}
                onChange={setDuration}
                label={labels.duration}
              />
            )}
            <PartySizeSelect
              id="reservation-party-size"
              label={labels.partySize}
              value={partySize}
              options={partyOptions}
              onChange={setPartySize}
            />
            {endTimeLabel && (
              <div className="rsv-time-range mt-[var(--ps-space-3)]">
                <span className="rsv-time-range__label">{labels.reservationTime}</span>
                <span className="rsv-time-range__value">{endTimeLabel}</span>
              </div>
            )}
          </ReservationSection>

          <ReservationSection heading={labels.guestNotes}>
            <ReservationField id="reservation-note" label={labels.specialRequest}>
              <textarea
                id="reservation-note"
                rows={1}
                maxLength={300}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="rsv-textarea"
                style={{ minHeight: "120px" }}
              />
            </ReservationField>
          </ReservationSection>

          {errorMessage ? (
            <div role="alert" className="rsv-error-banner">
              {errorMessage}
            </div>
          ) : null}

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

          <button
            type="submit"
            disabled={isSubmitting || daySlots.length === 0}
            className="rsv-button"
          >
            {isSubmitting ? labels.requestingTable : labels.requestTable}
          </button>
        </form>
      </div>
    </div>
  );
}
