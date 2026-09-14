"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { TicketCard } from "@/components/cards/TicketCard";
import {
  CardEventInfo,
  CardSeatInfo,
  CardStatusType,
} from "@/components/cards/DigitalCardPrimitives";
import { CheckCircle2, Clock, Loader2, RefreshCw } from "lucide-react";

export default function TicketConfirmationPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-zinc-950">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <TicketConfirmationContent />
    </Suspense>
  );
}

interface TicketItem {
  id: string;
  qrCode: string;
  tierName: string;
  ticketId: string | null;
  price: number;
  seat: CardSeatInfo | null;
  seatLabel: string | null;
  status: CardStatusType;
  issuedAt: string | null;
}

interface OrderInfo {
  orderId: string | null;
  status: CardStatusType;
  buyerName: string | null;
  buyerEmail: string | null;
  totalAmount: number;
  currency: string;
  quantity: number;
  event: CardEventInfo;
  tickets: TicketItem[];
}

function TicketConfirmationContent() {
  const searchParams = useSearchParams();
  const paymentIntentId =
    searchParams.get("payment_intent_id") || searchParams.get("payment_intent");
  const sessionId = searchParams.get("session_id");
  const qrCode = searchParams.get("qr") || searchParams.get("code");
  const eventSlug = searchParams.get("event");
  const isFree = searchParams.get("free") === "true";

  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null);
  const [loadingState, setLoadingState] = useState<
    "loading" | "pending" | "resolved" | "timeout" | "error"
  >("loading");
  const [attemptCount, setAttemptCount] = useState(0);

  const hasIdentifier = Boolean(paymentIntentId || sessionId || qrCode);

  useEffect(() => {
    if (!hasIdentifier) {
      setLoadingState("error");
      return;
    }

    let isMounted = true;
    let timerId: NodeJS.Timeout | null = null;
    let attempts = 0;
    const maxAttempts = 10; // ~15 seconds total (10 attempts * 1.5s)

    async function loadDirectQr(code: string) {
      try {
        const res = await fetch(`/api/verify-ticket?qr=${encodeURIComponent(code)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.order && isMounted) {
            const o = data.order;
            const resolvedEvent: CardEventInfo = {
              title: o.events?.title || "Event Pass",
              slug: o.events?.slug || eventSlug || null,
              eventDate: o.events?.event_date || null,
              venue: o.events?.venue || null,
              city: o.events?.city || null,
              banner: o.events?.banner || null,
              ticketTemplate: o.events?.ticket_template || "modern",
            };

            const singleTicket: TicketItem = {
              id: o.instance_id || o.id,
              qrCode: code,
              tierName: o.tier_name || (isFree ? "Free Admission" : "General Entry"),
              ticketId: o.ticket_id || null,
              price: Number(o.total_amount ?? 0),
              seat: o.seat_label ? { label: o.seat_label } : null,
              seatLabel: o.seat_label || null,
              status: (o.status as CardStatusType) || "valid",
              issuedAt: o.created_at || new Date().toISOString(),
            };

            setOrderInfo({
              orderId: o.id || null,
              status: (o.status as CardStatusType) || "valid",
              buyerName: o.buyer_name || null,
              buyerEmail: o.buyer_email || null,
              totalAmount: Number(o.total_amount || 0),
              currency: "USD",
              quantity: o.quantity || 1,
              event: resolvedEvent,
              tickets: [singleTicket],
            });
            setLoadingState("resolved");
            return;
          }
        }
        if (isMounted) setLoadingState("error");
      } catch {
        if (isMounted) setLoadingState("error");
      }
    }

    async function pollOrder() {
      attempts++;
      if (isMounted) setAttemptCount(attempts);

      try {
        const query = new URLSearchParams();
        if (paymentIntentId) query.set("payment_intent_id", paymentIntentId);
        if (sessionId) query.set("session_id", sessionId);

        const res = await fetch(`/api/tickets/order-lookup?${query.toString()}`);

        if (!res.ok) {
          if (attempts < maxAttempts) {
            if (isMounted) {
              setLoadingState("pending");
              timerId = setTimeout(pollOrder, 1500);
            }
            return;
          }
          if (isMounted) setLoadingState("timeout");
          return;
        }

        const data = await res.json();

        if (data.pending) {
          if (attempts < maxAttempts) {
            if (isMounted) {
              setLoadingState("pending");
              timerId = setTimeout(pollOrder, 1500);
            }
          } else if (isMounted) {
            setLoadingState("timeout");
          }
          return;
        }

        if (data.tickets && data.tickets.length > 0 && isMounted) {
          const resolvedEvent: CardEventInfo = {
            title: data.event?.title || "Event Pass",
            slug: data.event?.slug || eventSlug || null,
            eventDate: data.event?.eventDate || null,
            venue: data.event?.venue || null,
            city: data.event?.city || null,
            banner: data.event?.banner || null,
            ticketTemplate: data.event?.ticketTemplate || "modern",
          };

          const resolvedTickets: TicketItem[] = data.tickets.map((t: any) => ({
            id: t.id,
            qrCode: t.qrCode,
            tierName: t.tierName || (isFree ? "Free Admission" : "General Entry"),
            ticketId: t.ticketId || null,
            price: Number(t.price ?? 0),
            seat: t.seat || null,
            seatLabel: t.seatLabel || null,
            status: (t.status as CardStatusType) || "valid",
            issuedAt: t.issuedAt || new Date().toISOString(),
          }));

          setOrderInfo({
            orderId: data.orderId || null,
            status: (data.status as CardStatusType) || "valid",
            buyerName: data.buyerName || null,
            buyerEmail: data.buyerEmail || null,
            totalAmount: Number(data.totalAmount || 0),
            currency: data.currency || "USD",
            quantity: data.quantity || resolvedTickets.length,
            event: resolvedEvent,
            tickets: resolvedTickets,
          });

          setLoadingState("resolved");
        } else if (isMounted) {
          if (attempts < maxAttempts) {
            setLoadingState("pending");
            timerId = setTimeout(pollOrder, 1500);
          } else {
            setLoadingState("timeout");
          }
        }
      } catch (err) {
        console.error("[ticket-confirmation] polling error:", err);
        if (attempts < maxAttempts) {
          if (isMounted) {
            setLoadingState("pending");
            timerId = setTimeout(pollOrder, 1500);
          }
        } else if (isMounted) {
          setLoadingState("timeout");
        }
      }
    }

    if (paymentIntentId || sessionId) {
      pollOrder();
    } else if (qrCode) {
      loadDirectQr(qrCode);
    }

    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [paymentIntentId, sessionId, qrCode, eventSlug, isFree, hasIdentifier]);

  // 1. Missing identifier state
  if (!hasIdentifier || loadingState === "error") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
        <div className="text-center text-white max-w-sm">
          <p className="text-2xl font-black">No ticket found.</p>
          <p className="text-zinc-400 text-sm mt-2">
            Please check your email confirmation link or order lookup.
          </p>
          <Link
            href="/events"
            className="mt-6 inline-block bg-orange-600 hover:bg-orange-700 text-white font-bold px-6 py-2.5 rounded-xl transition text-sm"
          >
            Browse Events
          </Link>
        </div>
      </main>
    );
  }

  // 2. Loading / Webhook Pending State (polling)
  if (loadingState === "loading" || loadingState === "pending") {
    return (
      <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-12 text-center text-white">
        <div className="w-14 h-14 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center mb-4 text-orange-400">
          <Loader2 className="w-7 h-7 animate-spin" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
          Generating Your Digital Pass…
        </h1>
        <p className="text-zinc-400 text-sm mt-2 max-w-md">
          Your payment succeeded! We are finalizing your secure ticket records and
          generating your admission pass.
        </p>
        <div className="mt-6 flex items-center gap-2 text-xs font-mono text-zinc-500 bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-full">
          <Clock className="w-3.5 h-3.5" />
          <span>Verifying transaction ({attemptCount}/10)…</span>
        </div>
      </main>
    );
  }

  // 3. Webhook Latency / Timeout State
  if (loadingState === "timeout") {
    return (
      <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-12 text-center text-white">
        <div className="w-14 h-14 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-4 text-amber-400">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
          Payment Confirmed!
        </h1>
        <p className="text-zinc-300 text-sm mt-3 max-w-md leading-relaxed">
          Your payment succeeded — your tickets are still being generated by our
          ticketing system. Check your email in a few minutes, or refresh this page.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-bold px-6 py-3 rounded-xl transition text-sm shadow-lg shadow-orange-600/20"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Page
          </button>
          {eventSlug && (
            <Link
              href={`/events/${eventSlug}`}
              className="border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white font-bold px-6 py-3 rounded-xl transition text-sm"
            >
              Back to Event
            </Link>
          )}
        </div>
      </main>
    );
  }

  // 4. Resolved State (Tickets Ready)
  const tickets = orderInfo?.tickets || [];
  const event = orderInfo?.event || {
    title: "Event Pass",
    slug: eventSlug || null,
  };
  const isMultiple = tickets.length > 1;

  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-black flex flex-col items-center justify-center px-4 py-12 print:bg-white print:py-4">
      {/* Success Notification */}
      <div className="text-center mb-8 print:hidden">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 mb-3 text-emerald-400">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          {isMultiple ? "Your Digital Passes are Ready" : "Your Digital Pass is Ready"}
        </h1>
        <p className="text-zinc-400 text-xs sm:text-sm mt-1 max-w-md mx-auto">
          {isMultiple
            ? `We have issued ${tickets.length} passes for your order. Present each QR code at the venue gate for check-in.`
            : "Present this high-contrast QR code at the venue gate for admission."}
        </p>
      </div>

      {/* Render all ticket instances */}
      <div className="flex flex-col items-center gap-8 w-full max-w-xl">
        {tickets.map((t, idx) => (
          <div key={t.id || t.qrCode} className="w-full">
            {isMultiple && (
              <div className="text-center mb-3">
                <span className="inline-block px-3.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-xs font-bold text-zinc-200">
                  Pass {idx + 1} of {tickets.length} • {t.tierName}
                </span>
              </div>
            )}
            <TicketCard
              qrCode={t.qrCode}
              orderId={orderInfo?.orderId}
              event={event}
              ticketName={t.tierName}
              price={t.price}
              quantity={1}
              seat={t.seat}
              buyerName={orderInfo?.buyerName}
              buyerEmail={orderInfo?.buyerEmail}
              status={t.status}
              issuedAt={t.issuedAt}
              initialTemplate={event.ticketTemplate || "modern"}
              allowTemplateSwitching={false}
            />
          </div>
        ))}
      </div>

      {/* Back Link */}
      {eventSlug && (
        <div className="mt-8 text-center print:hidden">
          <Link
            href={`/events/${eventSlug}`}
            className="text-zinc-400 hover:text-white text-xs font-bold transition"
          >
            ← Back to Event Page
          </Link>
        </div>
      )}
    </main>
  );
}
