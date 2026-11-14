"use client";

import { useState, useEffect, useTransition, useId } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  IconCalendar as CalendarIcon,
  IconMapPin as MapPinIcon,
  IconClock as ClockIcon,
  IconCar as CarIcon,
  IconCheck as CheckIcon,
  IconAlertCircle as AlertIcon,
  IconShieldCheck as ShieldIcon,
  IconArrowRight as ArrowRightIcon,
  IconArrowLeft as ArrowLeftIcon,
} from "@tabler/icons-react";
import type { StorefrontRentalConfig } from "./types";
import {
  getRentalQuote,
  submitPublicRentalBooking,
  type RentalQuote,
} from "@/lib/actions/rental-public";

interface BookingFormBlockProps {
  rentalConfig?: StorefrontRentalConfig;
  siteSlug?: string;
  heading?: string;
  subheading?: string;
}

export function BookingFormBlock({
  rentalConfig,
  siteSlug,
  heading = "Complete Your Reservation",
  subheading = "Enter driver information and review the rental quote to reserve your vehicle.",
}: BookingFormBlockProps) {
  const searchParams = useSearchParams();

  // Honeypot ID
  const hpId = useId();

  // Defaults
  const defaultStart = new Date(Date.now() + 86400000);
  defaultStart.setHours(10, 0, 0, 0);
  const defaultEnd = new Date(Date.now() + 86400000 * 4);
  defaultEnd.setHours(10, 0, 0, 0);

  const initialCatId = searchParams.get("category") || rentalConfig?.categories[0]?.id || "";
  const initialStartDate = searchParams.get("startDate") || defaultStart.toISOString().slice(0, 10);
  const initialStartTime = searchParams.get("startTime") || "10:00";
  const initialEndDate = searchParams.get("endDate") || defaultEnd.toISOString().slice(0, 10);
  const initialEndTime = searchParams.get("endTime") || "10:00";

  const defaultBranchId = rentalConfig?.branches[0]?.id || "";
  const initialPickupBranch = searchParams.get("pickupBranch") || defaultBranchId;
  const initialReturnBranch = searchParams.get("returnBranch") || defaultBranchId;

  // Form State
  const [categoryId, setCategoryId] = useState(initialCatId);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [endTime, setEndTime] = useState(initialEndTime);
  const [pickupBranchId, setPickupBranchId] = useState(initialPickupBranch);
  const [returnBranchId, setReturnBranchId] = useState(initialReturnBranch);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [driverLicenseNumber, setDriverLicenseNumber] = useState("");
  const [driverLicenseCountry, setDriverLicenseCountry] = useState("US");
  const [driverDob, setDriverDob] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [hp, setHp] = useState("");

  // Live Quote & UI State
  const [quote, setQuote] = useState<RentalQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [isSubmitting, startSubmit] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [completedBooking, setCompletedBooking] = useState<{
    bookingNumber: string;
    lookupToken: string;
    confirmationMode: "approval" | "instant";
  } | null>(null);

  const categories = rentalConfig?.categories || [];
  const branches = rentalConfig?.branches || [];
  const settings = rentalConfig?.settings;
  const requireLicenseDob = settings?.requireLicenseDob ?? true;
  const minDriverAge = settings?.minDriverAge ?? 21;

  // Recalculate quote whenever dates or category change
  useEffect(() => {
    if (!rentalConfig?.organizerId || !rentalConfig?.businessId || !categoryId || !startDate || !endDate) {
      return;
    }

    const startsAt = new Date(`${startDate}T${startTime}:00`).toISOString();
    const endsAt = new Date(`${endDate}T${endTime}:00`).toISOString();

    if (new Date(endsAt) <= new Date(startsAt)) {
      setQuote(null);
      setQuoteError("Return date must be strictly after pickup date.");
      return;
    }

    let active = true;
    setIsQuoteLoading(true);
    setQuoteError(null);

    getRentalQuote({
      organizerId: rentalConfig.organizerId,
      businessId: rentalConfig.businessId,
      categoryId,
      startsAt,
      endsAt,
    }).then((res) => {
      if (!active) return;
      setIsQuoteLoading(false);
      if (res.quote) {
        setQuote(res.quote);
      } else {
        setQuote(null);
        setQuoteError(res.error || "Failed to calculate quote.");
      }
    });

    return () => {
      active = false;
    };
  }, [rentalConfig?.organizerId, rentalConfig?.businessId, categoryId, startDate, startTime, endDate, endTime]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!rentalConfig?.organizerId || !rentalConfig?.businessId) {
      setSubmitError("System configuration error.");
      return;
    }

    const startsAt = new Date(`${startDate}T${startTime}:00`).toISOString();
    const endsAt = new Date(`${endDate}T${endTime}:00`).toISOString();

    startSubmit(async () => {
      const result = await submitPublicRentalBooking({
        organizerId: rentalConfig.organizerId,
        businessId: rentalConfig.businessId,
        categoryId,
        siteSlug,
        startsAt,
        endsAt,
        pickupBranchId: pickupBranchId || null,
        returnBranchId: returnBranchId || null,
        customerName,
        customerEmail,
        customerPhone: customerPhone || null,
        driverLicenseNumber: driverLicenseNumber || null,
        driverLicenseCountry: driverLicenseCountry || null,
        driverDob: driverDob || null,
        termsAccepted,
        hp,
      });

      if (!result.success) {
        setSubmitError(result.message || "Failed to complete reservation request.");
        return;
      }

      if (result.confirmationMode === "instant" && result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }

      if (result.bookingNumber && result.lookupToken) {
        setCompletedBooking({
          bookingNumber: result.bookingNumber,
          lookupToken: result.lookupToken,
          confirmationMode: result.confirmationMode || "approval",
        });
      }
    });
  };

  if (!rentalConfig?.enabled) {
    return null;
  }

  // Success view (Approval mode or completed instant request)
  if (completedBooking) {
    const businessHome = siteSlug ? `/site/${siteSlug}` : "/";
    const businessLabel = rentalConfig?.businessName || "business";
    return (
      <section id="rental-booking-form" className="w-full max-w-3xl mx-auto py-8 sm:py-10 px-4 sm:px-6">
        {siteSlug && (
          <div className="mb-4">
            <Link
              href={businessHome}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back to {businessLabel}
            </Link>
          </div>
        )}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
            <CheckIcon className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
          </div>

          <h2 className="mt-4 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            {completedBooking.confirmationMode === "instant"
              ? "Reservation Confirmed!"
              : "Booking Request Received"}
          </h2>

          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {completedBooking.confirmationMode === "instant"
              ? "Your vehicle rental is confirmed. A receipt and confirmation email have been sent to you."
              : "Your request is pending owner review. We will notify you once your booking is confirmed."}
          </p>

          <div className="mt-6 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 p-4 inline-block text-left">
            <div className="text-xs uppercase font-semibold text-zinc-400">Booking Reference</div>
            <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {completedBooking.bookingNumber}
            </div>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href={`/rentals/lookup/${completedBooking.lookupToken}`}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-brand-800 transition"
            >
              <span>View & Track Booking</span>
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const businessHome = siteSlug ? `/site/${siteSlug}` : "/";
  const businessLabel = rentalConfig?.businessName || "business";
  return (
    <section id="rental-booking-form" className="w-full max-w-3xl mx-auto py-8 sm:py-10 px-4 sm:px-6 lg:px-8">
      {siteSlug && (
        <div className="mb-4">
          <Link
            href={businessHome}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to {businessLabel}
          </Link>
        </div>
      )}
      <div className="mb-8 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          {heading}
        </h2>
        {subheading && (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {subheading}
          </p>
        )}
      </div>

      {submitError && (
        <div className="mb-6 flex items-center gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertIcon className="h-5 w-5 shrink-0 text-rose-600" />
          <span>{submitError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Honeypot field for bot protection */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor={hpId}>Leave this empty</label>
          <input
            id={hpId}
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={hp}
            onChange={(e) => setHp(e.target.value)}
          />
        </div>

        {/* Step 1: Vehicle & Schedule Selection */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-5">
          <div className="flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-100">
            <CarIcon className="h-5 w-5 text-brand-700" />
            <span>1. Vehicle & Schedule</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Category selection */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                Select Vehicle Category
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-xs focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — ${c.dailyRate.toFixed(2)} / day
                  </option>
                ))}
              </select>
            </div>

            {/* Pickup Location */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                <MapPinIcon className="h-4 w-4 text-brand-700" />
                Pickup Location
              </label>
              <select
                value={pickupBranchId}
                onChange={(e) => {
                  setPickupBranchId(e.target.value);
                  if (!returnBranchId) setReturnBranchId(e.target.value);
                }}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-xs focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {branches.length === 0 ? (
                  <option value="">Main Depot</option>
                ) : (
                  branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label} {b.city ? `(${b.city})` : ""}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Return Location */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                <MapPinIcon className="h-4 w-4 text-brand-700" />
                Return Location
              </label>
              <select
                value={returnBranchId}
                onChange={(e) => setReturnBranchId(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-xs focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {branches.length === 0 ? (
                  <option value="">Main Depot</option>
                ) : (
                  branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label} {b.city ? `(${b.city})` : ""}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Pickup Date & Time */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                <CalendarIcon className="h-4 w-4 text-brand-700" />
                Pickup Date & Time
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={startDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-3/5 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-xs focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-2/5 rounded-xl border border-zinc-300 bg-white px-2 py-2.5 text-sm text-zinc-900 shadow-xs focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>

            {/* Return Date & Time */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                <ClockIcon className="h-4 w-4 text-brand-700" />
                Return Date & Time
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-3/5 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-xs focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-2/5 rounded-xl border border-zinc-300 bg-white px-2 py-2.5 text-sm text-zinc-900 shadow-xs focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Step 2: Driver & Contact Information */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-5">
          <div className="flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-100">
            <ShieldIcon className="h-5 w-5 text-brand-700" />
            <span>2. Driver Information</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                Full Legal Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="As shown on driver's license"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-xs focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                Email Address <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                required
                placeholder="confirmation@example.com"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-xs focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-xs focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            {requireLicenseDob && (
              <>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                    Driver&apos;s License Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="License number"
                    value={driverLicenseNumber}
                    onChange={(e) => setDriverLicenseNumber(e.target.value)}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-xs focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                    Issuing Country
                  </label>
                  <input
                    type="text"
                    maxLength={3}
                    placeholder="US, CA, UK, etc."
                    value={driverLicenseCountry}
                    onChange={(e) => setDriverLicenseCountry(e.target.value.toUpperCase())}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-xs focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                    Date of Birth (Min age: {minDriverAge}) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={driverDob}
                    onChange={(e) => setDriverDob(e.target.value)}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-xs focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Step 3: Quote Summary & Terms Agreement */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-5">
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            3. Price Summary & Agreement
          </h3>

          {quoteError ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">{quoteError}</p>
          ) : quote ? (
            <div className="space-y-3 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/60 text-sm">
              <div className="flex justify-between items-center text-zinc-600 dark:text-zinc-300">
                <span>Duration:</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {quote.days} {quote.days === 1 ? "day" : "days"} ({quote.billingBoundary === "rolling_24h" ? "24h blocks" : "calendar days"})
                </span>
              </div>
              <div className="flex justify-between items-center text-zinc-600 dark:text-zinc-300">
                <span>Daily rate:</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  ${quote.dailyRate.toFixed(2)}
                </span>
              </div>
              <div className="border-t border-zinc-200 dark:border-zinc-700 pt-2 flex justify-between items-baseline">
                <span className="font-bold text-base text-zinc-900 dark:text-zinc-100">
                  Rental Charge Total:
                </span>
                <span className="text-2xl font-extrabold text-brand-700 dark:text-brand-400">
                  ${quote.rentalAmount.toFixed(2)} {quote.currency}
                </span>
              </div>

              {/* Deposit notice */}
              {quote.depositRequiredAmount > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300 mt-2">
                  <span className="font-bold">Refundable Security Deposit:</span> ${quote.depositRequiredAmount.toFixed(2)} is collected separately upon physical vehicle pickup and returned in full after clean inspection. It is not charged today.
                </div>
              )}
            </div>
          ) : isQuoteLoading ? (
            <p className="text-sm text-zinc-500">Calculating rental quote...</p>
          ) : null}

          {/* Terms checkbox */}
          <div className="flex items-start gap-3 pt-2">
            <input
              id="termsAccepted"
              type="checkbox"
              required
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-zinc-300 text-brand-700 focus:ring-brand-700 dark:border-zinc-700"
            />
            <label htmlFor="termsAccepted" className="text-xs text-zinc-600 dark:text-zinc-400">
              I agree to the rental terms and conditions, confirm the primary driver is at least {minDriverAge} years of age, and understand a physical license inspection and refundable security deposit are required at pickup.
            </label>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={isSubmitting || !quote}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-700 px-6 py-3 text-sm font-semibold text-white shadow-xs hover:bg-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-700 focus:ring-offset-2 disabled:opacity-50 transition"
            >
              {isSubmitting ? (
                "Processing Reservation..."
              ) : settings?.confirmationMode === "instant" ? (
                "Continue to Secure Checkout"
              ) : (
                "Submit Booking Request"
              )}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
