"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";


type Order = {
  id: string;
  qr_code: string;
  status: string;
  seat_label: string | null;
  quantity: number;
  total_amount: number;
  created_at: string;
  checked_in_at: string | null;
  events: {
    title: string;
    event_date: string | null;
    venue: string | null;
    city: string | null;
    banner: string | null;
    slug: string | null;
  } | null;
};

const statusStyle: Record<string, { label: string; classes: string }> = {
  valid: { label: "Valid", classes: "bg-green-100 text-green-700" },
  used: { label: "Used", classes: "bg-zinc-100 text-zinc-500" },
  cancelled: { label: "Cancelled", classes: "bg-red-100 text-red-600" },
  refunded: { label: "Refunded", classes: "bg-orange-100 text-orange-600" },
};

export default function MyTicketsPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login?redirect=/my-tickets");
        return;
      }

      setUserEmail(user.email || null);

      const res = await fetch(`/api/my-tickets?email=${encodeURIComponent(user.email!)}`);
      const data = await res.json();
      setOrders(data.orders || []);
      setLoading(false);
    }

    load();
  }, [router]);

  const upcoming = orders.filter((o) =>
    o.events?.event_date ? new Date(o.events.event_date) >= new Date() : true
  );
  const past = orders.filter((o) =>
    o.events?.event_date ? new Date(o.events.event_date) < new Date() : false
  );

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
       

      <section className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <p className="text-sm font-black uppercase tracking-wide text-orange-600">Account</p>
          <h1 className="text-4xl font-black mt-2">My Tickets</h1>
          {userEmail && (
            <p className="text-zinc-500 mt-2">Showing tickets for <strong>{userEmail}</strong></p>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && orders.length === 0 && (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-zinc-300">
            <p className="text-5xl mb-4">🎟️</p>
            <h2 className="text-2xl font-black">No tickets yet</h2>
            <p className="text-zinc-500 mt-2">When you buy tickets they&apos;ll appear here.</p>
            <Link
              href="/events"
              className="mt-6 inline-block bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-xl font-bold transition"
            >
              Browse Events
            </Link>
          </div>
        )}

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <div className="mb-10">
            <h2 className="text-xl font-black mb-4">Upcoming</h2>
            <div className="space-y-4">
              {upcoming.map((order) => (
                <TicketRow key={order.id} order={order} />
              ))}
            </div>
          </div>
        )}

        {/* Past */}
        {past.length > 0 && (
          <div>
            <h2 className="text-xl font-black mb-4 text-zinc-400">Past Events</h2>
            <div className="space-y-4 opacity-70">
              {past.map((order) => (
                <TicketRow key={order.id} order={order} />
              ))}
            </div>
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
      <div className="flex gap-4">
        {/* Banner */}
        <div className="w-28 flex-shrink-0 bg-zinc-100">
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
        <div className="flex-1 py-4 pr-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-black text-zinc-900 leading-tight">
              {order.events?.title || "Event"}
            </h3>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${status.classes}`}>
              {status.label}
            </span>
          </div>

          {order.events?.event_date && (
            <p className="text-sm text-orange-600 font-semibold mt-1">
              {new Date(order.events.event_date).toLocaleDateString("en-US", {
                weekday: "short", month: "short", day: "numeric",
              })}
            </p>
          )}

          {(order.events?.venue || order.events?.city) && (
            <p className="text-sm text-zinc-500 mt-0.5">
              {[order.events.venue, order.events.city].filter(Boolean).join(", ")}
            </p>
          )}

          <div className="flex items-center justify-between mt-3">
            <p className="text-sm text-zinc-400">
              {order.quantity} ticket{order.quantity > 1 ? "s" : ""}
              {order.seat_label && ` · ${order.seat_label}`}
              {" · "}
              {order.total_amount === 0 ? "Free" : `$${order.total_amount.toFixed(2)}`}
            </p>
            <Link
              href={`/ticket-confirmation?qr=${order.qr_code}&event=${order.events?.slug || ""}`}
              className="text-sm font-bold text-orange-500 hover:text-orange-600 transition"
            >
              View Ticket →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
