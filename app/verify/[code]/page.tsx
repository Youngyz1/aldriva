"use client";

import { useEffect, useRef, useState } from "react";
import { BRAND } from "@/config/branding";

type TicketOrder = {
  id: string;
  status: string;
  seat_label: string | null;
  quantity: number;
  buyer_name: string | null;
  buyer_email: string | null;
  total_amount: number;
  created_at: string;
  checked_in_at: string | null;
  events: {
    title: string;
    event_date: string | null;
    venue: string | null;
    city: string | null;
    banner: string | null;
  } | null;
};

export default function VerifyTicketPage({ params }: { params: Promise<{ code: string }> }) {
  const [code, setCode] = useState<string>("");
  const [order, setOrder] = useState<TicketOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{ success: boolean; message: string } | null>(null);
  const [canCheckIn, setCanCheckIn] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    params.then(({ code: c }) => {
      setCode(c);
      fetch(`/api/verify-ticket?code=${c}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            setError(data.error);
          } else {
            setOrder(data.order);
            setCanCheckIn(Boolean(data.can_check_in));
            setAuthenticated(Boolean(data.authenticated));
          }
          setLoading(false);
        })
        .catch(() => {
          setError("Failed to load ticket.");
          setLoading(false);
        });
    });
  }, [params]);

  // Draw mini QR on canvas for visual reference
  useEffect(() => {
    if (!code || !canvasRef.current) return;
    const verifyUrl = `${window.location.origin}/verify/${code}`;
    import("qrcode").then((QRCode) => {
      QRCode.toCanvas(canvasRef.current!, verifyUrl, { width: 120, margin: 1 });
    });
  }, [code]);

  async function handleCheckIn() {
    setChecking(true);
    const res = await fetch("/api/verify-ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, action: "checkin" }),
    });
    const data = await res.json();
    setCheckResult({
      success: Boolean(data.success),
      message: data.message || data.error || "Could not check in this ticket.",
    });
    if (data.success && order) {
      setOrder({ ...order, status: "used", checked_in_at: new Date().toISOString() });
    }
    setChecking(false);
  }

  const statusConfig: Record<string, { color: string; bg: string; border: string; icon: string; label: string }> = {
    valid: {
      color: "text-green-700",
      bg: "bg-green-50",
      border: "border-green-300",
      icon: "✅",
      label: "VALID — Ready for Entry",
    },
    used: {
      color: "text-zinc-600",
      bg: "bg-zinc-100",
      border: "border-zinc-300",
      icon: "✔️",
      label: "ALREADY CHECKED IN",
    },
    cancelled: {
      color: "text-red-700",
      bg: "bg-red-50",
      border: "border-red-300",
      icon: "❌",
      label: "CANCELLED",
    },
    refunded: {
      color: "text-orange-700",
      bg: "bg-orange-50",
      border: "border-orange-300",
      icon: "↩️",
      label: "REFUNDED",
    },
  };

  const cfg = order ? (statusConfig[order.status] ?? statusConfig.valid) : null;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/25 rounded-2xl px-4 py-2 mb-4">
            <img src="/logo.png" alt="Aldriva Logo" className="h-5 w-5 object-contain rounded-md" />
            <span className="text-orange-400 font-black text-sm tracking-widest uppercase">{BRAND.name}</span>
          </div>
          <h1 className="text-white text-2xl font-black">Ticket Verification</h1>
          <p className="text-slate-400 text-sm mt-1">Door Staff Portal</p>
        </div>

        {loading && (
          <div className="bg-white rounded-3xl p-8 text-center shadow-2xl">
            <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-zinc-500 font-semibold">Verifying ticket...</p>
          </div>
        )}

        {error && (
          <div className="bg-white rounded-3xl p-8 text-center shadow-2xl">
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-2xl font-black text-red-600">Invalid Ticket</h2>
            <p className="text-zinc-500 mt-2">{error}</p>
            <p className="text-xs text-zinc-400 font-mono mt-4 break-all">{code}</p>
          </div>
        )}

        {order && cfg && (
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl">
            {/* Status Banner */}
            <div className={`${cfg.bg} ${cfg.border} border-b px-6 py-5 text-center`}>
              <div className="text-4xl mb-2">{cfg.icon}</div>
              <p className={`text-lg font-black ${cfg.color}`}>{cfg.label}</p>
            </div>

            {/* QR + Event Info */}
            <div className="px-6 py-5">
              <div className="flex gap-4 items-start">
                <canvas ref={canvasRef} className="rounded-xl flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider mb-1">Event</p>
                  <h2 className="font-black text-zinc-900 text-base leading-tight">
                    {order.events?.title ?? "—"}
                  </h2>
                  {order.events?.event_date && (
                    <p className="text-zinc-500 text-sm mt-1">
                      {new Date(order.events.event_date).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  )}
                  {(order.events?.venue || order.events?.city) && (
                    <p className="text-zinc-500 text-sm">
                      {[order.events.venue, order.events.city].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-dashed border-zinc-200 my-4" />

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {order.buyer_name && (
                  <div>
                    <p className="text-zinc-400 font-semibold text-xs uppercase">Name</p>
                    <p className="font-bold text-zinc-900">{order.buyer_name}</p>
                  </div>
                )}
                <div>
                  <p className="text-zinc-400 font-semibold text-xs uppercase">Qty</p>
                  <p className="font-bold text-zinc-900">{order.quantity} ticket{order.quantity > 1 ? "s" : ""}</p>
                </div>
                {order.seat_label && (
                  <div className="col-span-2">
                    <p className="text-zinc-400 font-semibold text-xs uppercase">Seat</p>
                    <p className="font-bold text-zinc-900">{order.seat_label}</p>
                  </div>
                )}
                {order.checked_in_at && (
                  <div className="col-span-2">
                    <p className="text-zinc-400 font-semibold text-xs uppercase">Checked In</p>
                    <p className="font-bold text-zinc-900">
                      {new Date(order.checked_in_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                )}
              </div>

              {/* Ticket code */}
              <p className="text-center text-xs text-zinc-300 font-mono mt-4 break-all">{code}</p>
            </div>

            {/* Check In Button */}
            {order.status === "valid" && canCheckIn && (
              <div className="px-6 pb-6">
                {checkResult ? (
                  <div className={`rounded-2xl p-4 text-center font-black ${checkResult.success ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {checkResult.message}
                  </div>
                ) : (
                  <button
                    onClick={handleCheckIn}
                    disabled={checking}
                    className="w-full bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white font-black py-4 rounded-2xl text-lg transition"
                  >
                    {checking ? "Checking in..." : "✓ Check In Guest"}
                  </button>
                )}
              </div>
            )}

            {order.status === "valid" && !canCheckIn && (
              <div className="px-6 pb-6">
                <div className="rounded-2xl bg-amber-50 p-4 text-center text-sm font-semibold text-amber-800">
                  {authenticated
                    ? "Only this event's organizer can check in guests."
                    : "This ticket is valid. Organization staff must log in to check in guests."}
                </div>
              </div>
            )}

            {order.status !== "valid" && (
              <div className="px-6 pb-6">
                <div className="rounded-2xl bg-zinc-100 p-4 text-center text-zinc-500 font-semibold">
                  {order.status === "used" ? "This ticket has already been scanned." : `Ticket status: ${order.status}`}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
