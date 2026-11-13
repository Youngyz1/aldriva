"use client";

/**
 * components/site/reservations/GeneralBookingForm.tsx
 *
 * General Booking (appointment) request form for non-table businesses
 * (salons, clinics, rentals, service providers). Shares the hero, section,
 * field, slot-picker, and hero-art pieces with the table reservation form.
 *
 * Fields: full name (required), phone (required), email (optional),
 * service type (required select), preferred date/time (required slot picker),
 * alternative date/time (optional), special request (optional textarea),
 * two checkboxes (terms + marketing) — both required.
 *
 * Submit action: lib/actions/general-booking.ts submitGeneralBookingRequest.
 * Returns { reservationNumber, lookupToken } on success — same shape as the
 * table reservation action so the success screen can be reused.
 */

import { useMemo, useState } from "react";
import { submitGeneralBookingRequest } from "@/lib/actions/general-booking";
import {
  getReservationSlotsForDate,
  ymdInTimeZone,
  zonedTimeToUtc,
} from "@/lib/reservation-slots";
import type { ReservationSettings } from "@/lib/reservation-settings";
import {
  ReservationField,
  ReservationHeader,
  ReservationSection,
  SlotPicker,
} from "./index";

export interface StorefrontGeneralBookingConfig {
  enabled: boolean;
  slug: string;
  settings: ReservationSettings;
  timeZone: string;
  hours: unknown;
  phone?: string | null;
  email?: string | null;
}

export interface GeneralBookingFormLabels {
  title: string;
  subtext: string;
  fullName: string;
  phone: string;
  email: string;
  serviceType: string;
  chooseDate: string;
  chooseTime: string;
  specialRequest: string;
  alternativeDate: string;
  termsCheckbox: string;
  marketingCheckbox: string;
  submitLabel: string;
  submittingLabel: string;
  selectedService: string;
  requestReceived: string;
  requestReceivedSubtext: string;
  requestReference: string;
  trackRequest: string;
  copyTrackingLink: string;
  trackingLinkCopied: string;
  backToSite: string;
  closedThatDay: string;
  checkDetails: string;
  rateLimited: string;
  tooManyOpenRequests: string;
  requestFailed: string;
  errorName: string;
  errorPhone: string;
  errorService: string;
  errorTime: string;
  errorCheckboxes: string;
  guestInformation: string;
  bookingDetails: string;
  guestNotes: string;
  noTimesAvailableLabel: string;
  hoursNotSetLabel: string;
}

export interface GeneralBookingFormProps {
  config: StorefrontGeneralBookingConfig;
  labels: GeneralBookingFormLabels;
  siteSlug: string;
  businessName?: string;
  coverImageUrl?: string | null;
  /** Validated ?service=<id>: pre-fills service type as a changeable selection. */
  preselectedService?: { id: string; title: string; duration_minutes: number | null; booking_mode: "timed" | "date_only" | null } | null;
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function GeneralBookingForm({ config, labels, siteSlug, businessName, coverImageUrl, preselectedService }: GeneralBookingFormProps) {
  const { settings, timeZone, hours } = config;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [serviceType, setServiceType] = useState(preselectedService?.title ?? "");
  const [serviceId, setServiceId] = useState<string | null>(preselectedService?.id ?? null);
  const [bookingMode] = useState<"timed" | "date_only">(preselectedService?.booking_mode ?? "timed");
  const [specialRequest, setSpecialRequest] = useState("");
  const [altStartsAt, setAltStartsAt] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [idempotencyKey] = useState(
    () => `gbk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  );

  const todayYmd = useMemo(() => ymdInTimeZone(new Date(), timeZone), [timeZone]);
  const isDateOnly = bookingMode === "date_only";
  const [slot, setSlot] = useState<string | null>(null);

  const minYmd = todayYmd;
  const maxYmd = addDaysYmd(todayYmd, settings.max_days_ahead);

  const quickDates = useMemo(() => {
    const requestNow = new Date();
    const out: Array<{ ymd: string; weekday: string; date: string; count: number }> = [];
    for (let offset = 0; offset < settings.max_days_ahead; offset++) {
      const ymd = addDaysYmd(todayYmd, offset);
      const slots = getReservationSlotsForDate(ymd, hours, settings, timeZone, requestNow);
      if (slots.length === 0) continue;
      const dt = new Date(`${ymd}T12:00:00Z`);
      out.push({
        ymd,
        weekday: dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
        date: dt.toLocaleDateString("en-US", { month: "numeric", day: "numeric", timeZone: "UTC" }),
        count: slots.length,
      });
    }
    return out;
  }, [todayYmd, hours, settings, timeZone]);

  // Default date: timed mode starts at the first date in horizon with a slot;
  // date_only mode starts today (server validates the date is open/in horizon).
  const firstAvailableYmd = quickDates.length > 0 ? quickDates[0].ymd : null;
  const defaultDateYmd = isDateOnly ? todayYmd : (firstAvailableYmd ?? todayYmd);
  const [dateYmd, setDateYmd] = useState<string>(defaultDateYmd);

  const daySlots = useMemo(() => {
    if (isDateOnly) return [];
    const requestNow = new Date();
    return getReservationSlotsForDate(dateYmd, hours, settings, timeZone, requestNow);
  }, [dateYmd, hours, settings, timeZone, isDateOnly]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    reservationNumber: string;
    lookupToken: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const mapServerError = (error?: string, fallback?: string | null): string => {
    switch (error) {
      case "rate_limited":
        return labels.rateLimited;
      case "reservations_unavailable":
      case "website_not_found":
        return labels.checkDetails;
      case "invalid_customer_info":
        return labels.checkDetails;
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
    if (!serviceType) {
      setFieldErrors((p) => ({ ...p, service: labels.errorService }));
      invalid = true;
    }
    if (!isDateOnly && !slot) {
      setFieldErrors((p) => ({ ...p, time: labels.errorTime }));
      invalid = true;
    }
    if (!termsAccepted) {
      setFieldErrors((p) => ({ ...p, checkboxes: labels.errorCheckboxes }));
      invalid = true;
    }
    if (invalid) return;

    const slotUtc = isDateOnly
      ? zonedTimeToUtc(dateYmd, "12:00", timeZone)
      : zonedTimeToUtc(dateYmd, slot!, timeZone);
    if (slotUtc === null) {
      setErrorMessage(labels.checkDetails);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await submitGeneralBookingRequest({
        slug: config.slug,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        customerEmail: email.trim() || null,
        serviceType,
        serviceId,
        preferredStartsAt: new Date(slotUtc).toISOString(),
        altStartsAt: altStartsAt ? new Date(altStartsAt).toISOString() : null,
        specialRequest: specialRequest.trim() || null,
        termsAccepted,
        marketingOptIn,
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
          `aldriva_general_booking_${config.slug}`,
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
        <div className="rsv-inner">
          <ReservationHeader
            businessName={businessName}
            title={labels.title}
            coverImageUrl={coverImageUrl ?? null}
          />
          <section className="rsv-card text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold">{labels.requestReceived}</h3>
              <p className="mt-[var(--ps-space-1)] text-xs text-[var(--ps-muted)]">{labels.requestReceivedSubtext}</p>
            </div>
            <div className="rounded-2xl bg-[var(--ps-surface)] p-[var(--ps-space-4)] border border-[var(--ps-border)]">
              <p className="text-xs font-semibold text-[var(--ps-muted)] uppercase tracking-wider">
                {labels.requestReference}
              </p>
              <p className="text-base font-extrabold text-[var(--ps-accent)] mt-[var(--ps-space-1)]">{success.reservationNumber}</p>
            </div>
            <div className="space-y-[var(--ps-space-2)] mt-[var(--ps-space-4)]">
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
              className="ps-button ps-button-secondary w-full text-xs font-bold mt-[var(--ps-space-2)]"
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
      <div className="rsv-inner">
        <ReservationHeader
          businessName={businessName}
          title={labels.title}
          coverImageUrl={coverImageUrl ?? null}
        />
        {hours === null ? (
          // Product rule: hours come only from what the owner saved. Never invent
          // times — a business with no saved hours has no bookable times.
          <section className="rounded-xl border border-dashed border-[var(--ps-border)] p-[var(--ps-space-8)] text-center text-sm text-[var(--ps-muted)]">
            {labels.hoursNotSetLabel}
            {(config.phone || config.email) && (
              <p className="mt-[var(--ps-space-2)] text-xs text-[var(--ps-muted)]">
                Contact:{config.phone ? ` ${config.phone}` : ""}{config.phone && config.email ? " ·" : ""}{config.email ? ` ${config.email}` : ""}
              </p>
            )}
          </section>
        ) : (!isDateOnly && !firstAvailableYmd) ? (
          <section className="rounded-xl border border-dashed border-[var(--ps-border)] p-[var(--ps-space-8)] text-center text-sm text-[var(--ps-muted)]">
            {labels.noTimesAvailableLabel.replace("{days}", String(settings.max_days_ahead))}
          </section>
        ) : (
          <form onSubmit={handleSubmit} className="rsv-card space-y-[var(--ps-space-6)]">
          <ReservationSection heading={labels.guestInformation}>
            <div className="rsv-grid">
              <ReservationField id="general-booking-name" label={labels.fullName} required error={fieldErrors.name}>
                <input
                  id="general-booking-name"
                  type="text"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-describedby={fieldErrors.name ? "general-booking-name-error" : undefined}
                  className={`w-full min-h-[44px] rounded-xl border border-[var(--ps-border)] px-[var(--ps-space-3)] text-base bg-[var(--ps-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ps-accent-hover)] focus-visible:ring-offset-2 ${fieldErrors.name ? "border-[var(--ps-error)]" : ""} disabled:cursor-not-allowed disabled:opacity-50`}
                  aria-invalid={fieldErrors.name ? "true" : undefined}
                />
              </ReservationField>
              <ReservationField id="general-booking-phone" label={labels.phone} required error={fieldErrors.phone}>
                <input
                  id="general-booking-phone"
                  type="tel"
                  required
                  placeholder="+225 07000000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  aria-describedby={fieldErrors.phone ? "general-booking-phone-error" : undefined}
                  className={`w-full min-h-[44px] rounded-xl border border-[var(--ps-border)] px-[var(--ps-space-3)] text-base bg-[var(--ps-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ps-accent-hover)] focus-visible:ring-offset-2 ${fieldErrors.phone ? "border-[var(--ps-error)]" : ""} disabled:cursor-not-allowed disabled:opacity-50`}
                  aria-invalid={fieldErrors.phone ? "true" : undefined}
                />
              </ReservationField>
            </div>
            <ReservationField id="general-booking-email" label={labels.email} error={fieldErrors.email}>
              <input
                id="general-booking-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-describedby={fieldErrors.email ? "general-booking-email-error" : undefined}
                className={`w-full min-h-[44px] rounded-xl border border-[var(--ps-border)] px-[var(--ps-space-3)] text-base bg-[var(--ps-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ps-accent-hover)] focus-visible:ring-offset-2 ${fieldErrors.email ? "border-[var(--ps-error)]" : ""} disabled:cursor-not-allowed disabled:opacity-50`}
                aria-invalid={fieldErrors.email ? "true" : undefined}
              />
            </ReservationField>
          </ReservationSection>

          <ReservationSection heading={labels.bookingDetails}>
            <ReservationField id="general-booking-service" label={labels.serviceType} required error={fieldErrors.service}>
              {serviceId ? (
                <p className="text-xs font-semibold text-[var(--ps-muted)] uppercase tracking-wider">
                  {labels.selectedService}
                </p>
              ) : null}
              <input
                id="general-booking-service"
                type="text"
                required
                maxLength={100}
                value={serviceType}
                onChange={(e) => {
                  const value = e.target.value.trim();
                  setServiceType(value);
                  if (serviceId && value !== preselectedService?.title) setServiceId(null);
                }}
                aria-describedby={fieldErrors.service ? "general-booking-service-error" : undefined}
                className={`w-full min-h-[44px] rounded-xl border border-[var(--ps-border)] px-[var(--ps-space-3)] text-base bg-[var(--ps-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ps-accent-hover)] focus-visible:ring-offset-2 ${fieldErrors.service ? "border-[var(--ps-error)]" : ""} disabled:cursor-not-allowed disabled:opacity-50`}
                aria-invalid={fieldErrors.service ? "true" : undefined}
              />
            </ReservationField>

            {isDateOnly ? (
              <ReservationField id="general-booking-date" label={labels.chooseDate} required error={fieldErrors.date}>
                <input
                  id="general-booking-date"
                  type="date"
                  required
                  min={minYmd}
                  max={maxYmd}
                  value={dateYmd}
                  onChange={(e) => setDateYmd(e.target.value)}
                  aria-describedby={fieldErrors.date ? "general-booking-date-error" : undefined}
                  className={`w-full min-h-[44px] rounded-xl border border-[var(--ps-border)] px-[var(--ps-space-3)] text-base bg-[var(--ps-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ps-accent-hover)] focus-visible:ring-offset-2 ${fieldErrors.date ? "border-[var(--ps-error)]" : ""} disabled:cursor-not-allowed disabled:opacity-50`}
                  aria-invalid={fieldErrors.date ? "true" : undefined}
                />
              </ReservationField>
            ) : (
              <SlotPicker
                dateYmd={dateYmd}
                min={minYmd}
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
            )}

            <ReservationField id="general-booking-alt-date" label={labels.alternativeDate}>
              <input
                id="general-booking-alt-date"
                type="datetime-local"
                value={altStartsAt || ""}
                onChange={(e) => setAltStartsAt(e.target.value || null)}
                className={`w-full min-h-[44px] rounded-xl border border-[var(--ps-border)] px-[var(--ps-space-3)] text-base bg-[var(--ps-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ps-accent-hover)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50`}
              />
            </ReservationField>

            <ReservationField id="general-booking-note" label={labels.specialRequest}>
              <textarea
                id="general-booking-note"
                rows={1}
                maxLength={300}
                value={specialRequest}
                onChange={(e) => setSpecialRequest(e.target.value)}
                className={`w-full min-h-[44px] rounded-xl border border-[var(--ps-border)] px-[var(--ps-space-3)] py-[var(--ps-space-2)] text-base bg-[var(--ps-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ps-accent-hover)] focus-visible:ring-offset-2`}
              />
            </ReservationField>

            <div className="rsv-field" style={{ marginBottom: "var(--rsv-field-gap)" }}>
              <label className="rsv-checkbox-label">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  required
                />
                {labels.termsCheckbox}
              </label>
            </div>
            <div className="rsv-field" style={{ marginBottom: "var(--rsv-field-gap)" }}>
              <label className="rsv-checkbox-label">
                <input
                  type="checkbox"
                  checked={marketingOptIn}
                  onChange={(e) => setMarketingOptIn(e.target.checked)}
                />
                {labels.marketingCheckbox}
              </label>
            </div>
          </ReservationSection>

          {errorMessage ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-[var(--ps-space-3)] text-xs font-medium text-red-700">
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
            disabled={isSubmitting || (!isDateOnly && daySlots.length === 0)}
            className="ps-button ps-button-primary w-full text-center text-sm font-bold shadow-xs disabled:opacity-40 transition"
          >
            {isSubmitting ? labels.submittingLabel : labels.submitLabel}
          </button>
          </form>
        )}
      </div>
    </div>
  );
}
