"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { TicketCard } from "@/components/cards/TicketCard";
import { CardEventInfo, CardSeatInfo, CardStatusType } from "@/components/cards/DigitalCardPrimitives";

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

function TicketConfirmationContent() {
  const searchParams = useSearchParams();
  const qrCode = searchParams.get("qr");
  const eventSlug = searchParams.get("event");
  const isFree = searchParams.get("free") === "true";

  const [loading, setLoading] = useState(false);
  const [ticketDetails, setTicketDetails] = useState<{
    event: CardEventInfo;
    ticketName: string;
    price: number;
    seat: CardSeatInfo | null;
    buyerName: string | null;
    buyerEmail: string | null;
    status: CardStatusType;
    orderId: string | null;
    issuedAt: string | null;
  }>({
    event: {
      title: "Event Pass",
      slug: eventSlug,
    },
    ticketName: isFree ? "Free Admission" : "General Entry",
    price: isFree ? 0 : 0,
    seat: null,
    buyerName: null,
    buyerEmail: null,
    status: "valid",
    orderId: null,
    issuedAt: new Date().toISOString(),
  });

  useEffect(() => {
    if (!qrCode) return;

    let isMounted = true;
    async function loadDetails() {
      try {
        setLoading(true);
        const res = await fetch(`/api/verify-ticket?qr=${encodeURIComponent(qrCode!)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.ticket && isMounted) {
            const t = data.ticket;
            setTicketDetails({
              event: {
                title: t.events?.title || "Event Pass",
                slug: t.events?.slug || eventSlug,
                eventDate: t.events?.event_date || null,
                venue: t.events?.venue || null,
                city: t.events?.city || null,
                banner: t.events?.banner || null,
              },
              ticketName: t.tickets?.name || (isFree ? "Free Admission" : "General Entry"),
              price: Number(t.tickets?.price ?? (t.ticket_orders?.total_amount ?? 0)),
              seat: t.seat_label
                ? {
                    label: t.seat_label,
                    isVip: Boolean(t.seats?.is_vip),
                    section: t.seats?.section,
                    row: t.seats?.row_label,
                    seatNumber: t.seats?.seat_number,
                    tableNumber: t.seats?.table_number,
                    tableName: t.seats?.table_name,
                  }
                : null,
              buyerName: t.ticket_orders?.buyer_name || null,
              buyerEmail: t.ticket_orders?.buyer_email || null,
              status: (t.status as CardStatusType) || "valid",
              orderId: t.order_id || null,
              issuedAt: t.created_at || null,
            });
          }
        }
      } catch (e) {
        // Fallback gracefully to default state
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadDetails();
    return () => {
      isMounted = false;
    };
  }, [qrCode, eventSlug, isFree]);

  if (!qrCode) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
        <div className="text-center text-white max-w-sm">
          <p className="text-2xl font-black">No ticket found.</p>
          <p className="text-zinc-400 text-sm mt-2">Please check your email confirmation link or order lookup.</p>
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

  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-black flex flex-col items-center justify-center px-4 py-12 print:bg-white print:py-4">
      {/* Success Notification */}
      <div className="text-center mb-6 print:hidden">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 mb-3 text-emerald-400">
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Your Digital Pass is Ready</h1>
        <p className="text-zinc-400 text-xs sm:text-sm mt-1">Present this high-contrast QR code at the venue gate for admission.</p>
      </div>

      {/* Unified Ticket Card */}
      <TicketCard
        qrCode={qrCode}
        orderId={ticketDetails.orderId}
        event={ticketDetails.event}
        ticketName={ticketDetails.ticketName}
        price={ticketDetails.price}
        seat={ticketDetails.seat}
        buyerName={ticketDetails.buyerName}
        buyerEmail={ticketDetails.buyerEmail}
        status={ticketDetails.status}
        issuedAt={ticketDetails.issuedAt}
        initialTemplate="modern"
        allowTemplateSwitching={true}
      />

      {/* Back Link */}
      {eventSlug && (
        <div className="mt-6 text-center print:hidden">
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
