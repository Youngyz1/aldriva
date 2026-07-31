"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Search, Mail, Key, ArrowRight, Download, MailCheck, AlertTriangle } from "lucide-react";

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
  valid: { label: "Valid", classes: "bg-green-100 text-green-700" },
  used: { label: "Used", classes: "bg-zinc-100 text-zinc-500" },
  cancelled: { label: "Cancelled", classes: "bg-red-100 text-red-600" },
  refunded: { label: "Refunded", classes: "bg-orange-100 text-orange-600" },
};

function TicketCard({ order }: { order: Order }) {
  const status = statusStyle[order.status] ?? statusStyle.valid;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrGenerated, setQrGenerated] = useState(false);
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const verifyUrl = typeof window !== "undefined"
    ? `${window.location.origin}/verify/${order.qr_code}`
    : `/verify/${order.qr_code}`;

  useEffect(() => {
    if (!order.qr_code || !canvasRef.current) return;

    import("qrcode").then((QRCode) => {
      QRCode.toCanvas(
        canvasRef.current!,
        verifyUrl,
        {
          width: 180,
          margin: 1,
          color: { dark: "#18181b", light: "#ffffff" },
        },
        (err) => {
          if (!err) setQrGenerated(true);
        }
      );
    });
  }, [order.qr_code, verifyUrl]);

  function downloadQR() {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `ticket-${order.qr_code.slice(0, 8)}.png`;
    a.click();
  }

  async function handleResendEmail() {
    setResendStatus("sending");
    try {
      const isFree = order.total_amount === 0;
      const res = await fetch("/api/send-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerEmail: order.buyer_email,
          buyerName: order.buyer_name || "Guest Buyer",
          eventTitle: order.events?.title || "Event",
          eventSlug: order.events?.slug || "",
          qrCode: order.qr_code,
          seatLabel: order.seat_label || null,
          isFree: isFree,
        }),
      });
      if (res.ok) {
        setResendStatus("sent");
        setTimeout(() => setResendStatus("idle"), 3000);
      } else {
        setResendStatus("error");
        setTimeout(() => setResendStatus("idle"), 3000);
      }
    } catch {
      setResendStatus("error");
      setTimeout(() => setResendStatus("idle"), 3000);
    }
  }

  return (
    <div className="relative bg-white border border-zinc-200 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition">
      {/* Top Event Banner Block */}
      <div className="relative h-32 bg-zinc-900">
        <img
          src={order.events?.banner || "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=600&auto=format&fit=crop"}
          alt={order.events?.title || "Event"}
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute bottom-4 left-6 right-6 text-white">
          <span className="text-[10px] font-black uppercase tracking-wider text-orange-400">
            {order.events?.event_date
              ? new Date(order.events.event_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
              : "Date TBA"}
          </span>
          <h3 className="text-lg font-black leading-tight truncate mt-0.5">{order.events?.title || "Event"}</h3>
        </div>
      </div>

      {/* Ticket Details with Perforation */}
      <div className="p-6">
        <div className="flex flex-col md:flex-row gap-6 items-center">
          {/* QR Code Container */}
          <div className="relative w-36 h-36 flex-shrink-0 flex items-center justify-center bg-zinc-50 border border-zinc-100 rounded-2xl overflow-hidden">
            {!qrGenerated && (
              <div className="absolute inset-0 flex items-center justify-center bg-white">
                <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <canvas ref={canvasRef} className="w-32 h-32 rounded-lg" />
          </div>

          {/* Ticket Information */}
          <div className="flex-1 w-full space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Ticket Details</span>
              <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${status.classes}`}>
                {status.label}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Ticket Type</p>
                <p className="font-semibold text-zinc-900 mt-0.5">{order.tickets?.name || "General Admission"}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Quantity</p>
                <p className="font-semibold text-zinc-900 mt-0.5">{order.quantity} Ticket{order.quantity > 1 ? "s" : ""}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Order Number</p>
                <p className="font-mono text-zinc-800 font-bold mt-0.5 break-all">{order.id.slice(0, 8)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Total Paid</p>
                <p className="font-semibold text-zinc-900 mt-0.5">{order.total_amount === 0 ? "Free" : `$${order.total_amount.toFixed(2)}`}</p>
              </div>
            </div>

            {order.seat_label && (
              <div className="border-t border-zinc-100 pt-2">
                <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Assigned Seat</p>
                <p className="font-semibold text-zinc-800 mt-0.5">{order.seat_label}</p>
              </div>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="border-t border-dashed border-zinc-200 mt-6 pt-5 flex flex-wrap gap-3">
          <button
            onClick={downloadQR}
            className="flex items-center justify-center gap-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-600 font-bold px-4 py-2.5 text-xs transition"
          >
            <Download className="h-4 w-4" />
            Download Ticket
          </button>
          <button
            onClick={handleResendEmail}
            disabled={resendStatus === "sending"}
            className="flex items-center justify-center gap-2 rounded-xl border border-zinc-200 hover:bg-zinc-50 font-bold px-4 py-2.5 text-xs text-zinc-700 transition disabled:opacity-60"
          >
            <Mail className="h-4 w-4" />
            {resendStatus === "idle" && "Resend Ticket Email"}
            {resendStatus === "sending" && "Sending..."}
            {resendStatus === "sent" && "Ticket sent successfully! ✓"}
            {resendStatus === "error" && "Error. Try again!"}
          </button>
          <Link
            href={`/ticket-confirmation?qr=${order.qr_code}&event=${order.events?.slug || ""}`}
            className="flex items-center justify-center gap-1 rounded-xl text-zinc-500 hover:text-zinc-950 font-bold px-4 py-2.5 text-xs transition ml-auto"
          >
            Full View
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function FindTicketsPage() {
  const [activeTab, setActiveTab] = useState<"email" | "order">("email");
  const [email, setEmail] = useState("");
  const [orderId, setOrderId] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSearched(false);

    try {
      const param = activeTab === "email" 
        ? `email=${encodeURIComponent(email)}`
        : `orderId=${encodeURIComponent(orderId)}`;
      
      const res = await fetch(`/api/my-tickets?${param}`);
      const data = await res.json();
      
      if (data.error) {
        setError(data.error);
      } else {
        setOrders(data.orders || []);
        setSearched(true);
      }
    } catch {
      setError("Something went wrong. Please check your credentials and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950 pb-20">
      {/* Page Header */}
      <section className="bg-white border-b border-zinc-200">
        <div className="mx-auto max-w-4xl px-6 py-12 text-center sm:py-16">
          <span className="inline-block rounded-full bg-orange-50 border border-orange-200 px-3 py-1 text-xs font-black uppercase tracking-wider text-orange-600">
            Guest Area
          </span>
          <h1 className="text-4xl font-black mt-4 tracking-tight">Find My Tickets</h1>
          <p className="text-zinc-500 mt-2 max-w-lg mx-auto text-sm sm:text-base">
            Lookup your orders, download QR codes, or resend confirmation emails without signing in.
          </p>
        </div>
      </section>

      {/* Main Search Panel */}
      <section className="max-w-2xl mx-auto px-4 mt-10">
        {/* Navigation Tabs */}
        <div className="flex bg-zinc-200/60 p-1 rounded-2xl mb-6 shadow-inner">
          <button
            onClick={() => { setActiveTab("email"); setSearched(false); setOrders([]); setError(""); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition ${
              activeTab === "email"
                ? "bg-white text-zinc-950 shadow-sm"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            <Mail className="h-4 w-4" />
            Lookup by Email
          </button>
          <button
            onClick={() => { setActiveTab("order"); setSearched(false); setOrders([]); setError(""); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition ${
              activeTab === "order"
                ? "bg-white text-zinc-950 shadow-sm"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            <Key className="h-4 w-4" />
            Lookup by Order ID
          </button>
        </div>

        {/* Search form */}
        <form onSubmit={handleSearch} className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm mb-10 space-y-4">
          {activeTab === "email" ? (
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-zinc-400 mb-2">Email Address</label>
              <div className="flex gap-3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="flex-1 border border-zinc-200 bg-zinc-50 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-orange-500 focus:bg-white transition"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 text-white px-6 py-3 rounded-xl text-sm font-black transition shadow-md shadow-orange-500/10 shrink-0"
                >
                  {loading ? "Searching..." : "Retrieve Tickets"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-zinc-400 mb-2">Order ID / Ticket Reference</label>
              <div className="flex gap-3">
                <input
                  type="text"
                  required
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder="Enter order reference or ticket uuid"
                  className="flex-1 border border-zinc-200 bg-zinc-50 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-orange-500 focus:bg-white transition"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 text-white px-6 py-3 rounded-xl text-sm font-black transition shadow-md shadow-orange-500/10 shrink-0"
                >
                  {loading ? "Searching..." : "Retrieve Tickets"}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-4 text-xs font-semibold text-red-600 mt-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </form>

        {/* Results section */}
        {searched && orders.length === 0 && (
          <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-zinc-300 shadow-sm">
            <p className="text-5xl mb-4">🎟️</p>
            <h2 className="text-xl font-black">No tickets found</h2>
            <p className="text-zinc-500 mt-2 text-sm">
              We couldn&apos;t find any orders matching <strong>{activeTab === "email" ? email : orderId}</strong>.<br />
              Please verify the details or try looking up using your email.
            </p>
          </div>
        )}

        {orders.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-500 font-bold">
                {orders.length} order{orders.length !== 1 ? "s" : ""} found
              </p>
            </div>
            <div className="space-y-6">
              {orders.map((order) => (
                <TicketCard key={order.qr_code} order={order} />
              ))}
            </div>
          </div>
        )}

        {/* Footer info links */}
        <div className="mt-12 text-center space-y-2 border-t border-zinc-200 pt-8">
          <p className="text-zinc-500 text-xs sm:text-sm">
            Have an Aldriva account?{" "}
            <Link href="/my-tickets" className="text-orange-600 font-black hover:underline">
              Sign In to View All Tickets
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
