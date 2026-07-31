"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function TicketConfirmationPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </main>
    }>
      <TicketConfirmationContent />
    </Suspense>
  );
}

function TicketConfirmationContent() {
  const searchParams = useSearchParams();
  const qrCode = searchParams.get("qr");
  const eventSlug = searchParams.get("event");
  const isFree = searchParams.get("free") === "true";

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrGenerated, setQrGenerated] = useState(false);
  const [copied, setCopied] = useState(false);
  const verifyUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/verify/${qrCode}`
      : `/verify/${qrCode}`;

  useEffect(() => {
    if (!qrCode || !canvasRef.current) return;

    import("qrcode").then((QRCode) => {
      QRCode.toCanvas(
        canvasRef.current!,
        verifyUrl,
        {
          width: 260,
          margin: 2,
          color: { dark: "#1a1a2e", light: "#ffffff" },
        },
        (err) => {
          if (!err) setQrGenerated(true);
        }
      );
    });
  }, [qrCode, verifyUrl]);

  function downloadQR() {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `ticket-${qrCode?.slice(0, 8)}.png`;
    a.click();
  }

  function copyLink() {
    navigator.clipboard.writeText(verifyUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function printTicket() {
    window.print();
  }

  if (!qrCode) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="text-center text-white">
          <p className="text-2xl font-black">No ticket found.</p>
          <Link href="/events" className="mt-4 inline-block text-orange-400 underline">
            Browse Events
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-950 via-indigo-950 to-zinc-950 flex items-center justify-center px-4 py-16 print:bg-white print:py-4">
      <div className="w-full max-w-md">
        {/* Success Banner */}
        <div className="text-center mb-8 print:hidden">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/20 border border-green-500/40 mb-4">
            <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-black text-white">You&apos;re In!</h1>
          <p className="text-zinc-400 mt-2">Your ticket is confirmed. Show this QR code at the door.</p>
        </div>

        {/* Ticket Card */}
        <div className="relative bg-white rounded-3xl overflow-hidden shadow-2xl print:shadow-none print:rounded-none">
          {/* Top strip */}
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-8 py-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-100 text-xs font-bold uppercase tracking-widest">Aldriva</p>
                <h2 className="text-white text-xl font-black mt-0.5">Event Ticket</h2>
              </div>
              <div className="text-white text-4xl">🎟️</div>
            </div>
          </div>

          {/* Perforated line */}
          <div className="flex items-center px-4">
            <div className="w-6 h-6 rounded-full bg-zinc-950 -ml-3 flex-shrink-0" />
            <div className="flex-1 border-t-2 border-dashed border-zinc-200 mx-2" />
            <div className="w-6 h-6 rounded-full bg-zinc-950 -mr-3 flex-shrink-0" />
          </div>

          {/* QR Code Section */}
          <div className="px-8 py-6 flex flex-col items-center">
            <div className="relative">
              {!qrGenerated && (
                <div className="absolute inset-0 flex items-center justify-center bg-white">
                  <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <canvas ref={canvasRef} className="rounded-xl" />
            </div>

            <p className="mt-4 text-xs text-zinc-400 font-mono tracking-widest text-center break-all">
              {qrCode?.match(/.{1,8}/g)?.join(" ")}
            </p>

            <div className="mt-4 text-center">
              <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${isFree ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                {isFree ? "Free Ticket — Valid" : "Paid Ticket — Valid"}
              </span>
            </div>
          </div>

          {/* Perforated line */}
          <div className="flex items-center px-4">
            <div className="w-6 h-6 rounded-full bg-zinc-950 -ml-3 flex-shrink-0" />
            <div className="flex-1 border-t-2 border-dashed border-zinc-200 mx-2" />
            <div className="w-6 h-6 rounded-full bg-zinc-950 -mr-3 flex-shrink-0" />
          </div>

          {/* Ticket Details */}
          <div className="px-8 py-6 bg-zinc-50">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500 font-semibold">Ticket ID</span>
                <span className="font-mono text-zinc-800 font-bold">{qrCode?.slice(0, 12)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 font-semibold">Status</span>
                <span className="text-green-600 font-black">✓ VALID</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 font-semibold">Issued</span>
                <span className="text-zinc-800 font-semibold">
                  {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
            </div>
          </div>

          {/* Bottom strip */}
          <div className="bg-zinc-900 px-8 py-4">
            <p className="text-zinc-500 text-xs text-center">
              This QR code is your entry pass. Do not share it.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 grid grid-cols-3 gap-3 print:hidden">
          <button
            onClick={downloadQR}
            className="flex flex-col items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl py-4 text-white transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span className="text-xs font-bold">Download</span>
          </button>

          <button
            onClick={copyLink}
            className="flex flex-col items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl py-4 text-white transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-xs font-bold">{copied ? "Copied!" : "Copy Link"}</span>
          </button>

          <button
            onClick={printTicket}
            className="flex flex-col items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl py-4 text-white transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span className="text-xs font-bold">Print</span>
          </button>
        </div>

        {/* Back to event */}
        {eventSlug && (
          <div className="mt-6 text-center print:hidden">
            <Link
              href={`/events/${eventSlug}`}
              className="text-zinc-400 hover:text-white text-sm font-semibold transition"
            >
              ← Back to Event
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
