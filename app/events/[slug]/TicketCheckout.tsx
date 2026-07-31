"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { StripeProvider, PaymentForm, OrderSummary } from "@/components/payments";

const SeatMap = dynamic(() => import("@/components/SeatMap"), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

type Ticket = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

type Event = {
  id: string;
  title: string;
  slug: string;
  source_url?: string | null;
  banner?: string | null;
  event_date?: string | null;
  venue?: string | null;
  city?: string | null;
};

type SeatData = {
  id: string;
  section: string;
  row_label: string;
  seat_number: number;
  status: "available" | "reserved" | "sold";
  price_override: number | null;
};

type VenueLayout = {
  id: string;
  name: string;
  sections: { name: string; rows: number; seatsPerRow: number }[];
};

type Step = "tickets" | "seats" | "review";

const FALLBACK_BANNER =
  "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=800&auto=format&fit=crop";

// ─── Main checkout component ───────────────────────────────────────────────────

export default function TicketCheckout({
  event,
  tickets,
  lowestPrice,
  defaultCountry,
}: {
  event: Event;
  tickets: Ticket[];
  lowestPrice: number | null;
  /** Server-resolved visitor country (see lib/request-geo.ts) for the Stripe PaymentElement's billing address default. */
  defaultCountry?: string;
}) {
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>("tickets");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(
    tickets[0] || null
  );
  const [quantity, setQuantity] = useState(1);
  const [paid, setPaid] = useState(searchParams.get("success") === "true");

  // Seat map state
  const [venueLayout, setVenueLayout] = useState<VenueLayout | null>(null);
  const [allSeats, setAllSeats] = useState<SeatData[]>([]);
  const [selectedSeats, setSelectedSeats] = useState<SeatData[]>([]);
  const [loadingSeats, setLoadingSeats] = useState(true);
  const [seatMapAvailable, setSeatMapAvailable] = useState(false);

  // Buyer info (collected inside PaymentForm via PaymentElement)
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");

  // Contact form submission and validation
  const [contactInfoSubmitted, setContactInfoSubmitted] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Stripe inline payment
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [preparingPayment, setPreparingPayment] = useState(false);
  const [checkoutAttemptId, setCheckoutAttemptId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "crypto">("card");
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [cryptoError, setCryptoError] = useState<string | null>(null);

  // Load seat map if venue has assigned seating
  useEffect(() => {
    if (!event.id) return;
    fetch(`/api/seats?event_id=${event.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.layout) {
          setVenueLayout(data.layout);
          setAllSeats(data.seats || []);
          setSeatMapAvailable(true);
        }
        setLoadingSeats(false);
      })
      .catch(() => setLoadingSeats(false));
  }, [event.id]);

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function formatPrice(price: number) {
    return price === 0
      ? "Free"
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(price);
  }

  const formattedDate = event.event_date
    ? new Date(event.event_date).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const locationLabel = [event.venue, event.city].filter(Boolean).join(", ");

  const effectivePrice =
    selectedSeats.length > 0
      ? selectedSeats.reduce(
          (sum, s) => sum + (s.price_override ?? selectedTicket?.price ?? 0),
          0
        )
      : selectedTicket
      ? selectedTicket.price * quantity
      : 0;

  const seatLabel =
    selectedSeats.length > 0
      ? selectedSeats
          .map((s) => `${s.section}-${s.row_label}${s.seat_number}`)
          .join(", ")
      : null;

  const summaryItems = selectedTicket
    ? [
        { label: "Ticket", value: selectedTicket.name },
        ...(seatLabel ? [{ label: "Seat(s)", value: seatLabel }] : []),
        { label: "Qty", value: String(selectedSeats.length || quantity) },
      ]
    : [];

  // ─── Prepare Stripe PaymentIntent ────────────────────────────────────────────
  async function preparePayment(attemptId: string) {
    if (effectivePrice === 0) return;
    if (clientSecret) return;
    setPreparingPayment(true);

    if (selectedSeats.length > 0) {
      const res = await fetch("/api/seats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seatIds: selectedSeats.map((s) => s.id) }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Some seats are no longer available. Please re-select.");
        setPreparingPayment(false);
        setStep("seats");
        return;
      }
    }

    const res = await fetch("/api/create-payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketName: selectedTicket?.name,
        ticketPrice: effectivePrice / (selectedSeats.length || quantity),
        eventTitle: event.title,
        eventSlug: event.slug,
        eventId: event.id,
        ticketId: selectedTicket?.id,
        seatId: selectedSeats[0]?.id || null,
        seatLabel: seatLabel || null,
        quantity: selectedSeats.length || quantity,
        buyerEmail: buyerEmail || null,
        buyerName: buyerName || null,
        currency: "usd",
        checkoutAttemptId: attemptId,
      }),
    });

    const data = await res.json();
    if (data.clientSecret) {
      setClientSecret(data.clientSecret);
      setQrCode(data.qrCode ?? null);
    } else {
      alert("Could not initialise payment. Please try again.");
    }
    setPreparingPayment(false);
  }

  async function handleCryptoTicketPurchase() {
    if (!buyerEmail) {
      setCryptoError("Please enter your email for ticket delivery.");
      return;
    }
    setCryptoError(null);
    setIsRedirecting(true);

    try {
      if (selectedSeats.length > 0) {
        const res = await fetch("/api/seats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seatIds: selectedSeats.map((s) => s.id) }),
        });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error || "Some seats are no longer available. Please re-select.");
          setIsRedirecting(false);
          setStep("seats");
          return;
        }
      }

      const res = await fetch("/api/crypto/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: effectivePrice,
          currency: "usd",
          eventId: event.id,
          donorName: buyerName,
          donorEmail: buyerEmail,
          ticketId: selectedTicket?.id,
          seatId: selectedSeats[0]?.id || null,
          seatLabel: seatLabel || null,
          quantity: selectedSeats.length || quantity,
          type: "ticket",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.paymentUrl) {
        throw new Error(data.error || "Could not start the crypto payment.");
      }
      window.location.href = data.paymentUrl;
    } catch (err) {
      setCryptoError(
        err instanceof Error ? err.message : "Could not initialise crypto payment."
      );
      setIsRedirecting(false);
    }
  }

  function goToReview() {
    setStep("review");
    setContactInfoSubmitted(false);
    setValidationError(null);
    setClientSecret(null);
    setCheckoutAttemptId(null);
    setQrCode(null);
    setPreparingPayment(false);
  }

  function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function handleProceedToPaymentClick() {
    setValidationError(null);
    if (!buyerName.trim()) {
      setValidationError("Full Name is required.");
      return;
    }
    if (!buyerEmail.trim()) {
      setValidationError("Email Address is required.");
      return;
    }
    if (!isValidEmail(buyerEmail.trim())) {
      setValidationError("Please enter a valid email address.");
      return;
    }

    setContactInfoSubmitted(true);
    const attemptId = crypto.randomUUID();
    setCheckoutAttemptId(attemptId);
    preparePayment(attemptId);
  }

  function handleFreeTicketClick() {
    setValidationError(null);
    if (!buyerName.trim()) {
      setValidationError("Full Name is required.");
      return;
    }
    if (!buyerEmail.trim()) {
      setValidationError("Email Address is required.");
      return;
    }
    if (!isValidEmail(buyerEmail.trim())) {
      setValidationError("Please enter a valid email address.");
      return;
    }

    handleFreeTicket();
  }

  // ─── Free ticket handler ─────────────────────────────────────────────────────

  async function handleFreeTicket() {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketName: selectedTicket?.name,
        ticketPrice: 0,
        eventTitle: event.title,
        eventSlug: event.slug,
        eventId: event.id,
        ticketId: selectedTicket?.id,
        seatId: selectedSeats[0]?.id || null,
        seatLabel: seatLabel || null,
        quantity: selectedSeats.length || quantity,
        buyerEmail: buyerEmail || null,
        buyerName: buyerName || null,
      }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      setPaid(true);
    }
  }

  // ─── Step indicator ──────────────────────────────────────────────────────────

  const steps: { id: Step; label: string }[] = [
    { id: "tickets", label: "Tickets" },
    ...(seatMapAvailable ? [{ id: "seats" as Step, label: "Seats" }] : []),
    { id: "review", label: "Review" },
  ];
  const currentStepIdx = steps.findIndex((s) => s.id === step);

  // ─── Success state ───────────────────────────────────────────────────────────

  if (paid) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-2xl relative">
          <button
            onClick={() => {
              window.location.href = `/events/${event.slug}`;
            }}
            className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 transition p-1 rounded-full hover:bg-zinc-100"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-2xl font-black text-zinc-950">Ticket Booked!</h2>
          <p className="text-zinc-500 mt-2 text-sm">
            Check your email for your ticket confirmation.
          </p>
          {qrCode && (
            <a
              href={`/ticket-confirmation?qr=${qrCode}&event=${event.slug}`}
              className="mt-6 inline-block w-full rounded-2xl bg-orange-500 px-6 py-3.5 text-sm font-black text-white transition hover:bg-orange-600 shadow-md"
            >
              View Ticket →
            </a>
          )}
          <button
            onClick={() => {
              window.location.href = `/events/${event.slug}`;
            }}
            className="mt-3 block w-full text-center text-sm font-bold text-zinc-500 hover:text-zinc-800 transition"
          >
            Back to Event
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Collapsed trigger card (sits in the sidebar) ──────────────────── */}
      <div className="rounded-3xl border border-zinc-200 bg-white shadow-sm lg:sticky lg:top-24 overflow-hidden p-6 sm:p-8">
        {lowestPrice !== null && (
          <>
            <p className="text-zinc-500 mb-1">Starting from</p>
            <h2 className="text-5xl font-black">{formatPrice(lowestPrice)}</h2>
          </>
        )}
        {formattedDate && (
          <p className="text-sm text-zinc-500 mt-2">{formattedDate}</p>
        )}

        {tickets.length > 0 ? (
          <button
            onClick={() => setIsOpen(true)}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-2xl font-bold text-lg mt-6 transition"
          >
            Get Tickets
          </button>
        ) : event.source_url ? (
          <a
            href={event.source_url}
            target="_blank"
            rel="noreferrer"
            className="mt-6 block w-full rounded-2xl bg-orange-500 py-4 text-center text-lg font-bold text-white transition hover:bg-orange-600"
          >
            Get Tickets
          </a>
        ) : (
          <p className="mt-6 rounded-2xl bg-zinc-100 p-4 text-center font-semibold text-zinc-500">
            Tickets are not available yet.
          </p>
        )}
      </div>

      {/* ── Checkout modal ─────────────────────────────────────────────────── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
        >
          <div className="relative grid w-full max-w-3xl max-h-[90vh] grid-cols-1 overflow-hidden rounded-3xl bg-white shadow-2xl lg:grid-cols-[1fr_300px]">
            <button
              onClick={() => setIsOpen(false)}
              aria-label="Close"
              className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-1.5 text-zinc-500 shadow hover:bg-white hover:text-zinc-800 transition"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Left: step content */}
            <div className="overflow-y-auto p-6 sm:p-8 max-h-[90vh]">
              <h2 className="text-lg font-black leading-snug pr-8">{event.title}</h2>
              {(formattedDate || locationLabel) && (
                <p className="text-sm text-zinc-500 mt-0.5">
                  {formattedDate}
                  {formattedDate && locationLabel ? " · " : ""}
                  {locationLabel}
                </p>
              )}

              {/* Step indicator */}
              <div className="flex items-center gap-2 border-b border-zinc-100 mt-4 pb-4 mb-5 flex-wrap">
                {steps.map((s, idx) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <button
                      onClick={() => idx < currentStepIdx && setStep(s.id)}
                      className={`flex items-center gap-2 text-sm font-bold transition ${
                        s.id === step
                          ? "text-orange-600"
                          : idx < currentStepIdx
                          ? "text-zinc-400 hover:text-zinc-600 cursor-pointer"
                          : "text-zinc-300 cursor-not-allowed"
                      }`}
                    >
                      <span
                        className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-black ${
                          s.id === step
                            ? "bg-orange-500 text-white"
                            : idx < currentStepIdx
                            ? "bg-green-500 text-white"
                            : "bg-zinc-200 text-zinc-500"
                        }`}
                      >
                        {idx < currentStepIdx ? "✓" : idx + 1}
                      </span>
                      {s.label}
                    </button>
                    {idx < steps.length - 1 && <span className="text-zinc-200">→</span>}
                  </div>
                ))}
              </div>

              {/* ── STEP 1: Ticket Selection ───────────────────────────────── */}
              {step === "tickets" && (
                <div className="space-y-3">
                  {tickets.map((ticket) => {
                    const isSelected = selectedTicket?.id === ticket.id;
                    const remaining = ticket.quantity;
                    const goingFast = remaining > 0 && remaining <= 5;
                    return (
                      <div
                        key={ticket.id}
                        onClick={() => {
                          setSelectedTicket(ticket);
                          setQuantity(1);
                        }}
                        className={`rounded-2xl border p-4 cursor-pointer transition ${
                          isSelected
                            ? "border-orange-400 ring-2 ring-orange-400 ring-offset-1 bg-orange-50"
                            : "border-zinc-200 hover:border-zinc-300"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <h3 className="font-bold">{ticket.name}</h3>
                          {isSelected && !seatMapAvailable && (
                            <div
                              className="flex items-center gap-3 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                className="w-8 h-8 rounded-full border border-zinc-300 bg-white font-bold hover:bg-zinc-100"
                              >
                                −
                              </button>
                              <span className="font-bold w-4 text-center">{quantity}</span>
                              <button
                                onClick={() =>
                                  setQuantity(
                                    remaining ? Math.min(remaining, quantity + 1) : quantity + 1
                                  )
                                }
                                className="w-8 h-8 rounded-full border border-zinc-300 bg-white font-bold hover:bg-zinc-100"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <p className="font-bold text-lg">
                            {formatPrice(isSelected ? ticket.price * quantity : ticket.price)}
                          </p>
                          {remaining > 0 && (
                            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600">
                              {remaining} Remaining
                            </span>
                          )}
                        </div>
                        {goingFast && (
                          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-600">
                            🔥 Going fast
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {selectedTicket && (
                    <p className="text-sm text-zinc-500 pt-1 lg:hidden">
                      Total: <span className="font-bold text-black">{formatPrice(effectivePrice)}</span>
                    </p>
                  )}

                  {selectedTicket && (
                    <button
                      onClick={() => (seatMapAvailable ? setStep("seats") : goToReview())}
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-2xl font-bold text-lg mt-2 transition"
                    >
                      {seatMapAvailable ? "Choose Your Seat →" : "Check out"}
                    </button>
                  )}
                </div>
              )}

              {/* ── STEP 2: Seat Selection ─────────────────────────────────── */}
              {step === "seats" && seatMapAvailable && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xl font-black">Choose Your Seat</h3>
                    <p className="text-zinc-500 text-sm mt-1">
                      Ticket: <strong>{selectedTicket?.name}</strong> · Click seats to select
                    </p>
                  </div>

                  {loadingSeats ? (
                    <div className="flex items-center justify-center py-16">
                      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : venueLayout ? (
                    <SeatMap
                      seats={allSeats}
                      sections={venueLayout.sections}
                      basePrice={selectedTicket?.price ?? 0}
                      maxSelectable={quantity}
                      onSelectionChange={setSelectedSeats}
                    />
                  ) : null}

                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => setStep("tickets")}
                      className="flex-1 border border-zinc-300 text-zinc-700 py-3 rounded-2xl font-bold hover:bg-zinc-50 transition"
                    >
                      ← Back
                    </button>
                    <button
                      onClick={goToReview}
                      disabled={selectedSeats.length === 0}
                      className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-200 disabled:text-zinc-400 text-white py-3 rounded-2xl font-bold transition"
                    >
                      Continue →
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 3: Review & Pay ───────────────────────────────────── */}
              {step === "review" && (
                <div className="space-y-5">
                  <h3 className="text-xl font-black">Review &amp; Pay</h3>

                  <div className="lg:hidden">
                    <OrderSummary
                      title="Order summary"
                      accentColor="#f97316"
                      items={summaryItems}
                      total={effectivePrice}
                      currency="USD"
                    />
                  </div>

                  {!contactInfoSubmitted ? (
                    <div className="space-y-4 text-left">
                      <h4 className="text-base font-bold text-zinc-900 mb-2">Contact Information</h4>
                      <div className="space-y-3">
                        <label className="block">
                          <span className="block text-sm font-semibold text-zinc-700 mb-1">
                            Full Name <span className="text-red-500">*</span>
                          </span>
                          <input
                            type="text"
                            placeholder="Enter your full name"
                            value={buyerName}
                            onChange={(e) => setBuyerName(e.target.value)}
                            className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base outline-none focus:border-orange-500 transition min-h-[48px]"
                            required
                          />
                        </label>
                        <label className="block">
                          <span className="block text-sm font-semibold text-zinc-700 mb-1">
                            Email Address <span className="text-red-500">*</span>
                          </span>
                          <input
                            type="email"
                            placeholder="you@example.com"
                            value={buyerEmail}
                            onChange={(e) => setBuyerEmail(e.target.value)}
                            className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base outline-none focus:border-orange-500 transition min-h-[48px]"
                            required
                          />
                        </label>
                      </div>

                      {validationError && (
                        <p className="text-sm font-medium text-red-600 mt-2">{validationError}</p>
                      )}

                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={() => setStep(seatMapAvailable ? "seats" : "tickets")}
                          className="flex-1 border border-zinc-300 text-zinc-700 py-3.5 rounded-2xl font-bold hover:bg-zinc-50 transition"
                        >
                          ← Back
                        </button>
                        {effectivePrice === 0 ? (
                          <button
                            onClick={handleFreeTicketClick}
                            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-3.5 rounded-2xl font-bold transition"
                          >
                            Book Free Ticket
                          </button>
                        ) : (
                          <button
                            onClick={handleProceedToPaymentClick}
                            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-3.5 rounded-2xl font-bold transition"
                          >
                            Proceed to Payment
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 text-left">
                      {/* Payment Method Selector */}
                      <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4">
                        <h3 className="text-base font-black text-zinc-950">Select Payment Method</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setPaymentMethod("card")}
                            className={`flex flex-col items-center justify-center rounded-xl border p-4 text-center transition ${
                              paymentMethod === "card"
                                ? "border-orange-500 bg-orange-50/50 text-orange-700 font-bold"
                                : "border-zinc-200 hover:border-zinc-300 text-zinc-600 font-medium"
                            }`}
                          >
                            <svg
                              className={`h-6 w-6 mb-1.5 ${paymentMethod === "card" ? "text-orange-600" : "text-zinc-400"}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                            </svg>
                            <span className="text-sm">Pay with Card</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaymentMethod("crypto")}
                            className={`flex flex-col items-center justify-center rounded-xl border p-4 text-center transition ${
                              paymentMethod === "crypto"
                                ? "border-orange-500 bg-orange-50/50 text-orange-700 font-bold"
                                : "border-zinc-200 hover:border-zinc-300 text-zinc-600 font-medium"
                            }`}
                          >
                            <svg
                              className={`h-6 w-6 mb-1.5 ${paymentMethod === "crypto" ? "text-orange-600" : "text-zinc-400"}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v10m-3-7h6" />
                            </svg>
                            <span className="text-sm">Pay with Crypto</span>
                          </button>
                        </div>
                      </div>

                      {paymentMethod === "crypto" ? (
                        <div className="space-y-4">
                          {cryptoError && (
                            <p className="text-sm text-red-500">{cryptoError}</p>
                          )}

                          <div className="flex gap-3">
                            <button
                              onClick={() => {
                                setContactInfoSubmitted(false);
                                setClientSecret(null);
                                setCheckoutAttemptId(null);
                                setQrCode(null);
                              }}
                              className="flex-1 border border-zinc-300 text-zinc-700 py-3.5 rounded-2xl font-bold hover:bg-zinc-50 transition"
                              disabled={isRedirecting}
                            >
                              ← Back
                            </button>
                            <button
                              onClick={handleCryptoTicketPurchase}
                              className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white py-3.5 rounded-2xl font-bold transition flex items-center justify-center gap-2"
                              disabled={isRedirecting}
                            >
                              {isRedirecting ? (
                                <>
                                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                  </svg>
                                  Redirecting…
                                </>
                              ) : (
                                `Pay ${formatPrice(effectivePrice)} with Crypto`
                              )}
                            </button>
                          </div>
                        </div>
                      ) : preparingPayment ? (
                        <div className="flex flex-col items-center justify-center py-10 gap-3">
                          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
                          <p className="text-sm text-zinc-400 text-center">Setting up secure payment…</p>
                        </div>
                      ) : clientSecret ? (
                        <StripeProvider clientSecret={clientSecret} accentColor="#f97316">
                          <PaymentForm
                            submitLabel={`Pay ${formatPrice(effectivePrice)}`}
                            accentColor="#f97316"
                            collectName={true}
                            collectEmail={true}
                            hideInputs={true}
                            initialName={buyerName}
                            initialEmail={buyerEmail}
                            onNameChange={setBuyerName}
                            onEmailChange={setBuyerEmail}
                            onSuccess={() => setPaid(true)}
                            onBack={() => {
                              setContactInfoSubmitted(false);
                              setClientSecret(null);
                              setCheckoutAttemptId(null);
                              setQrCode(null);
                            }}
                            defaultCountry={defaultCountry}
                          />
                        </StripeProvider>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-sm text-red-500 text-center">
                            Could not load payment form. Please go back and try again.
                          </p>
                          <button
                            onClick={() => {
                              setClientSecret(null);
                              setCheckoutAttemptId(null);
                              if (checkoutAttemptId) {
                                preparePayment(checkoutAttemptId);
                              } else {
                                const attemptId = crypto.randomUUID();
                                setCheckoutAttemptId(attemptId);
                                preparePayment(attemptId);
                              }
                            }}
                            className="w-full border border-zinc-300 text-zinc-700 py-3 rounded-2xl font-bold hover:bg-zinc-50 transition"
                          >
                            Retry
                          </button>
                          <button
                            onClick={() => {
                              setContactInfoSubmitted(false);
                              setClientSecret(null);
                              setCheckoutAttemptId(null);
                              setQrCode(null);
                            }}
                            className="w-full text-sm text-zinc-400 hover:text-zinc-600 transition text-center"
                          >
                            ← Back
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: banner + live order summary (desktop only) */}
            <div className="hidden lg:flex lg:flex-col border-l border-zinc-100 bg-zinc-50 max-h-[90vh]">
              <div className="aspect-[4/3] w-full overflow-hidden">
                <img
                  src={event.banner || FALLBACK_BANNER}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-6 flex-1 overflow-y-auto">
                {selectedTicket ? (
                  <OrderSummary
                    title="Order summary"
                    accentColor="#f97316"
                    items={summaryItems}
                    total={effectivePrice}
                    currency="USD"
                  />
                ) : (
                  <p className="text-sm text-zinc-400">
                    Select a ticket to see your order summary.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}