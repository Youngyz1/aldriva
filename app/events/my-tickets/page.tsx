"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { Ticket, Search, Mail, CalendarDays, MapPin, ArrowRight, Lock, CheckCircle2 } from "lucide-react";

type Order = {
  id: string;
  qr_code: string;
  status: string;
  seat_label: string | null;
  quantity: number;
  total_amount: number;
  created_at: string;
  checked_in_at: string | null;
  buyer_email: string;
  buyer_name: string | null;
  events: {
    title: string;
    event_date: string | null;
    venue: string | null;
    city: string | null;
    banner: string | null;
    slug: string | null;
  } | null;
  tickets: {
    name: string;
    price: number;
  } | null;
};

const statusStyle: Record<string, { label: string; classes: string }> = {
  valid: { label: "Valid", classes: "bg-emerald-100 text-emerald-800 border border-emerald-200" },
  used: { label: "Used", classes: "bg-zinc-100 text-zinc-600 border border-zinc-200" },
  cancelled: { label: "Cancelled", classes: "bg-rose-100 text-rose-700 border border-rose-200" },
  refunded: { label: "Refunded", classes: "bg-amber-100 text-amber-800 border border-amber-200" },
};

export default function EventsMyTicketsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"account" | "guest">("account");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Guest lookup form state
  const [guestOrderId, setGuestOrderId] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [guestOrders, setGuestOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    async function load() {
      // Check for guest lookup query parameters in URL
      const searchParams = new URLSearchParams(window.location.search);
      const urlOrderId = searchParams.get("orderId") || searchParams.get("qr");
      const urlEmail = searchParams.get("email");

      if (urlOrderId && urlEmail) {
        setTab("guest");
        setGuestOrderId(urlOrderId);
        setGuestEmail(urlEmail);
        triggerGuestLookup(urlOrderId, urlEmail);
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!urlOrderId || !urlEmail) setTab("guest");
        setLoading(false);
        return;
      }

      setUserEmail(user.email || null);

      try {
        const res = await fetch(`/api/my-tickets?email=${encodeURIComponent(user.email!)}`);
        if (res.ok) {
          const data = await res.json();
          setOrders(data.orders || []);
        }
      } catch (e) {
        console.error("Failed to load user tickets:", e);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  async function triggerGuestLookup(orderIdVal: string, emailVal: string) {
    setGuestError(null);
    setGuestOrders(null);
    setGuestLoading(true);
    try {
      const res = await fetch(
        `/api/my-tickets?orderId=${encodeURIComponent(orderIdVal.trim())}&email=${encodeURIComponent(emailVal.trim())}`
      );
      const data = await res.json();
      if (!res.ok) {
        setGuestError(data.error || "Could not find a matching order.");
      } else if (!data.orders || data.orders.length === 0) {
        setGuestError("No matching ticket order found for the provided details.");
      } else {
        setGuestOrders(data.orders);
      }
    } catch (e) {
      setGuestError("Network error. Please try again.");
    } finally {
      setGuestLoading(false);
    }
  }

  async function handleGuestLookup(e: React.FormEvent) {
    e.preventDefault();
    setGuestError(null);
    setGuestOrders(null);

    if (!guestOrderId.trim() || !guestEmail.trim()) {
      setGuestError("Please enter both Order ID / QR code and Buyer Email.");
      return;
    }

    setGuestLoading(true);
    try {
      const res = await fetch(
        `/api/my-tickets?orderId=${encodeURIComponent(guestOrderId.trim())}&email=${encodeURIComponent(guestEmail.trim())}`
      );
      const data = await res.json();

      if (!res.ok) {
        setGuestError(data.error || "Could not find a matching order.");
      } else if (!data.orders || data.orders.length === 0) {
        setGuestError("No matching ticket order found for the provided details.");
      } else {
        setGuestOrders(data.orders);
      }
    } catch (e) {
      setGuestError("Network error. Please try again.");
    } finally {
      setGuestLoading(false);
    }
  }

  const upcoming = orders.filter((o) =>
    o.events?.event_date ? new Date(o.events.event_date) >= new Date() : true
  );
  const past = orders.filter((o) =>
    o.events?.event_date ? new Date(o.events.event_date) < new Date() : false
  );

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950 pb-24">
      {/* Hero Header */}
      <section className="bg-white border-b border-zinc-200 py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-orange-600 mb-2">
            <Ticket className="w-4 h-4" />
            <span>Aldriva Events</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-zinc-900 tracking-tight">
            My Tickets
          </h1>
          <p className="text-zinc-600 mt-2 text-sm sm:text-base max-w-2xl">
            Access your event passes, QR codes, and ticket details. View tickets associated with your account or look up guest orders.
          </p>

          {/* Mode Switcher Tabs */}
          <div className="flex gap-2 mt-8 border-b border-zinc-200">
            <button
              onClick={() => setTab("account")}
              className={`pb-3 px-4 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
                tab === "account"
                  ? "border-orange-600 text-orange-600"
                  : "border-transparent text-zinc-500 hover:text-zinc-900"
              }`}
            >
              <Lock className="w-4 h-4" />
              <span>Account Tickets</span>
            </button>
            <button
              onClick={() => setTab("guest")}
              className={`pb-3 px-4 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
                tab === "guest"
                  ? "border-orange-600 text-orange-600"
                  : "border-transparent text-zinc-500 hover:text-zinc-900"
              }`}
            >
              <Search className="w-4 h-4" />
              <span>Guest Order Lookup</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="max-w-4xl mx-auto px-6 py-10">
        {tab === "account" && (
          <div>
            {!userEmail && !loading && (
              <div className="text-center py-12 bg-white rounded-3xl border border-zinc-200 p-8 max-w-md mx-auto shadow-sm">
                <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-black">Sign in required</h2>
                <p className="text-zinc-500 text-sm mt-2">
                  Sign in to your Aldriva account to automatically view all your ticket purchases.
                </p>
                <div className="mt-6 flex flex-col gap-3">
                  <Link
                    href="/login?redirect=/events/my-tickets"
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl transition text-sm text-center"
                  >
                    Log In
                  </Link>
                  <button
                    onClick={() => setTab("guest")}
                    className="text-xs text-zinc-500 hover:text-zinc-800 font-semibold"
                  >
                    Purchased as guest? Use Guest Lookup →
                  </button>
                </div>
              </div>
            )}

            {loading && (
              <div className="flex items-center justify-center py-24">
                <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {userEmail && !loading && orders.length === 0 && (
              <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-zinc-300">
                <p className="text-5xl mb-4">🎟️</p>
                <h2 className="text-2xl font-black">No tickets found</h2>
                <p className="text-zinc-500 mt-2">
                  Tickets linked to your account will appear here.
                </p>
                <Link
                  href="/events"
                  className="mt-6 inline-block bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl font-bold transition text-sm"
                >
                  Browse Events
                </Link>
              </div>
            )}

            {/* Upcoming */}
            {userEmail && upcoming.length > 0 && (
              <div className="mb-10">
                <h2 className="text-lg font-black mb-4 text-zinc-900 flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-orange-600" />
                  Upcoming Events
                </h2>
                <div className="space-y-4">
                  {upcoming.map((order) => (
                    <TicketRow key={order.id} order={order} />
                  ))}
                </div>
              </div>
            )}

            {/* Past */}
            {userEmail && past.length > 0 && (
              <div>
                <h2 className="text-lg font-black mb-4 text-zinc-500">Past Events</h2>
                <div className="space-y-4 opacity-75">
                  {past.map((order) => (
                    <TicketRow key={order.id} order={order} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "guest" && (
          <div className="max-w-xl mx-auto">
            <div className="bg-white border border-zinc-200 rounded-3xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-xl font-black text-zinc-900 mb-2">Guest Order Lookup</h2>
              <p className="text-zinc-500 text-sm mb-6">
                Enter your Order ID (or QR Code) and the email address used during purchase to access your ticket.
              </p>

              <form onSubmit={handleGuestLookup} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1">
                    Order ID or QR Code
                  </label>
                  <div className="relative">
                    <Ticket className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. 5F9FDD737DAE40448F5E..."
                      value={guestOrderId}
                      onChange={(e) => setGuestOrderId(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-zinc-200 text-sm font-semibold outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1">
                    Buyer Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      placeholder="your@email.com"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-zinc-200 text-sm font-semibold outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>
                </div>

                {guestError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold">
                    {guestError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={guestLoading}
                  className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition text-sm flex items-center justify-center gap-2"
                >
                  {guestLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Find Order</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>

            {guestOrders && guestOrders.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-black uppercase tracking-wider text-emerald-700 mb-3 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Order Found
                </h3>
                <div className="space-y-4">
                  {guestOrders.map((order) => (
                    <TicketRow key={order.id} order={order} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function TicketRow({ order }: { order: Order }) {
  const status = statusStyle[order.status] ?? statusStyle.valid;

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition">
      <div className="flex flex-col sm:flex-row">
        {/* Banner */}
        <div className="sm:w-36 h-28 sm:h-auto flex-shrink-0 bg-zinc-100 relative">
          <img
            src={
              order.events?.banner ||
              "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=400&auto=format&fit=crop"
            }
            alt={order.events?.title || "Event"}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Info */}
        <div className="flex-1 p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-black text-zinc-900 leading-snug text-lg">
                {order.events?.title || "Event"}
              </h3>
              {order.tickets?.name && (
                <span className="inline-block mt-1 text-xs font-bold bg-zinc-100 text-zinc-700 px-2.5 py-0.5 rounded-full">
                  {order.tickets.name}
                </span>
              )}
            </div>
            <span className={`text-xs font-bold px-3 py-1 rounded-full flex-shrink-0 ${status.classes}`}>
              {status.label}
            </span>
          </div>

          {order.events?.event_date && (
            <p className="text-xs font-bold text-orange-600 mt-2 flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" />
              {new Date(order.events.event_date).toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          )}

          {(order.events?.venue || order.events?.city) && (
            <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-zinc-400" />
              {[order.events.venue, order.events.city].filter(Boolean).join(", ")}
            </p>
          )}

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-100">
            <p className="text-xs text-zinc-500 font-medium">
              {order.quantity} ticket{order.quantity > 1 ? "s" : ""}
              {order.seat_label && ` · ${order.seat_label}`}
              {" · "}
              <span className="font-bold text-zinc-800">
                {order.total_amount === 0 ? "Free" : `$${order.total_amount.toFixed(2)}`}
              </span>
            </p>
            <Link
              href={`/ticket-confirmation?qr=${order.qr_code}&event=${order.events?.slug || ""}`}
              className="text-xs font-bold text-orange-600 hover:text-orange-700 transition flex items-center gap-1"
            >
              <span>View Ticket Pass</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
