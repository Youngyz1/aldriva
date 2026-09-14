"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Calendar,
  MapPin,
  Armchair,
  Star,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  Printer,
  Copy,
  Check,
  Ban,
  Loader2,
  Share2,
  Sparkles,
  ShieldCheck,
  Eye,
} from "lucide-react";
import { BRAND } from "@/config/branding";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Types & Design Tokens
// ─────────────────────────────────────────────────────────────────────────────

export type CardTheme = "modern" | "elegant" | "concert" | "premium" | "minimal";

export type CardSeatInfo = {
  label: string;
  isVip?: boolean;
  section?: string | null;
  row?: string | null;
  seatNumber?: number | string | null;
  tableNumber?: string | null;
  tableName?: string | null;
  isAccessible?: boolean;
};

export type CardEventInfo = {
  title: string;
  slug?: string | null;
  eventDate?: string | null;
  endDate?: string | null;
  venue?: string | null;
  city?: string | null;
  banner?: string | null;
  ticketTemplate?: "modern" | "concert" | "premium" | "minimal" | null;
};

export type CardStatusType = "valid" | "used" | "cancelled" | "pending" | "declined" | "expired";

// ─────────────────────────────────────────────────────────────────────────────
// 2. Card Container
// ─────────────────────────────────────────────────────────────────────────────

export function CardContainer({
  children,
  theme = "modern",
  className = "",
}: {
  children: React.ReactNode;
  theme?: CardTheme;
  className?: string;
}) {
  const themeClasses: Record<CardTheme, string> = {
    modern: "bg-zinc-900 border border-zinc-800 text-zinc-100 shadow-2xl shadow-orange-950/20",
    elegant: "bg-stone-950 border border-amber-500/30 text-stone-100 shadow-2xl shadow-amber-950/20 font-serif",
    concert: "bg-zinc-950 border-2 border-zinc-800 text-white shadow-2xl",
    premium: "bg-gradient-to-b from-zinc-900 via-zinc-950 to-black border border-amber-400/40 text-white shadow-2xl shadow-amber-500/10",
    minimal: "bg-white border border-zinc-200 text-zinc-900 shadow-xl",
  };

  return (
    <div
      className={`relative w-full max-w-lg rounded-3xl overflow-hidden transition-all duration-300 ${themeClasses[theme]} ${className}`}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Card Header & Banner
// ─────────────────────────────────────────────────────────────────────────────

export function CardHeader({
  event,
  badgeText,
  theme = "modern",
}: {
  event: CardEventInfo;
  badgeText?: string;
  theme?: CardTheme;
}) {
  const isMinimal = theme === "minimal";
  const isElegant = theme === "elegant" || theme === "premium";
  const isConcert = theme === "concert";

  return (
    <div className="relative">
      {/* Banner image or styled header */}
      {event.banner ? (
        <div className="relative h-48 sm:h-56 w-full overflow-hidden bg-zinc-800">
          <Image
            src={event.banner}
            alt={event.title}
            fill
            sizes="(max-width: 640px) 100vw, 512px"
            className="object-cover object-center brightness-90 transition-transform duration-700 hover:scale-105"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
        </div>
      ) : (
        <div
          className={`h-32 w-full flex items-center justify-between px-6 ${
            isElegant
              ? "bg-gradient-to-r from-amber-950 via-stone-900 to-amber-950 border-b border-amber-500/30 text-amber-100"
              : isMinimal
              ? "bg-zinc-100 border-b border-zinc-200 text-zinc-900"
              : isConcert
              ? "bg-zinc-950 border-b-2 border-dashed border-zinc-700 text-white"
              : "bg-gradient-to-r from-orange-600 via-amber-600 to-orange-700 text-white"
          }`}
        >
          <div>
            <span className="text-[11px] font-black uppercase tracking-widest opacity-80">
              {BRAND.name} Official Pass
            </span>
            <h3 className="text-xl font-black mt-0.5 tracking-tight">{event.title}</h3>
          </div>
          <Sparkles className="w-6 h-6 opacity-75" />
        </div>
      )}

      {/* Floating Badge */}
      {badgeText && (
        <div className="absolute top-4 right-4 z-10">
          <span
            className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider backdrop-blur-md shadow-md ${
              isElegant
                ? "bg-amber-500/20 border border-amber-400/40 text-amber-200"
                : isMinimal
                ? "bg-zinc-900 text-white"
                : isConcert
                ? "bg-white text-zinc-950"
                : "bg-orange-500/90 text-white"
            }`}
          >
            {badgeText}
          </span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Card Event Metadata (Date, Location)
// ─────────────────────────────────────────────────────────────────────────────

export function CardEventMeta({
  event,
  theme = "modern",
}: {
  event: CardEventInfo;
  theme?: CardTheme;
}) {
  const isMinimal = theme === "minimal";
  const dateColor = isMinimal ? "text-orange-600" : "text-amber-400";
  const labelColor = isMinimal ? "text-zinc-600" : "text-zinc-300";

  return (
    <div className="space-y-3 py-4 border-y border-zinc-800/60 my-4">
      {event.eventDate && (
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 p-2 rounded-xl ${isMinimal ? "bg-orange-50" : "bg-zinc-800/80"}`}>
            <Calendar className={`w-4 h-4 ${dateColor}`} />
          </div>
          <div>
            <p className={`text-xs font-bold uppercase tracking-wider ${labelColor}`}>Date & Time</p>
            <p className={`text-sm font-semibold ${isMinimal ? "text-zinc-900" : "text-white"}`}>
              {new Date(event.eventDate).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
              {" · "}
              {new Date(event.eventDate).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })}
            </p>
          </div>
        </div>
      )}

      {(event.venue || event.city) && (
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 p-2 rounded-xl ${isMinimal ? "bg-orange-50" : "bg-zinc-800/80"}`}>
            <MapPin className={`w-4 h-4 ${dateColor}`} />
          </div>
          <div>
            <p className={`text-xs font-bold uppercase tracking-wider ${labelColor}`}>Venue</p>
            <p className={`text-sm font-semibold ${isMinimal ? "text-zinc-900" : "text-white"}`}>
              {[event.venue, event.city].filter(Boolean).join(" — ")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Card Seating Badge
// ─────────────────────────────────────────────────────────────────────────────

export function CardSeatBadge({
  seat,
  theme = "modern",
}: {
  seat: CardSeatInfo | null;
  theme?: CardTheme;
}) {
  if (!seat) return null;

  const isMinimal = theme === "minimal";
  const isVip = Boolean(seat.isVip);

  return (
    <div
      className={`p-4 rounded-2xl flex items-center justify-between gap-4 transition-all ${
        isVip
          ? "bg-gradient-to-r from-amber-500/20 via-yellow-500/15 to-amber-500/20 border border-amber-500/40 text-amber-200"
          : isMinimal
          ? "bg-zinc-100 border border-zinc-200 text-zinc-800"
          : "bg-zinc-800/70 border border-zinc-700/60 text-zinc-200"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`p-2.5 rounded-xl ${
            isVip ? "bg-amber-500/30 text-amber-300" : isMinimal ? "bg-white text-zinc-700" : "bg-zinc-700 text-zinc-300"
          }`}
        >
          <Armchair className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-wider opacity-75">
              {seat.tableNumber ? "Reserved Table & Seat" : "Assigned Seat"}
            </p>
            {isVip && (
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-400 text-zinc-950">
                <Star className="w-2.5 h-2.5 fill-current" /> VIP
              </span>
            )}
          </div>
          <p className="text-base font-black tracking-tight mt-0.5">{seat.label}</p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Card QR Code Section
// ─────────────────────────────────────────────────────────────────────────────

export function CardQRCode({
  qrCode,
  status = "valid",
  theme = "modern",
}: {
  qrCode: string;
  status?: CardStatusType;
  theme?: CardTheme;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
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
          width: 200,
          margin: 1,
          color: {
            dark: "#09090b",
            light: "#ffffff",
          },
        },
        (err) => {
          if (!err) setLoaded(true);
        }
      );
    });
  }, [qrCode, verifyUrl]);

  function downloadQR() {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `aldriva-pass-${qrCode.slice(0, 8)}.png`;
    a.click();
  }

  function copyPassUrl() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(verifyUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const isValid = status === "valid";
  const isUsed = status === "used";
  const isCancelled = status === "cancelled" || status === "expired";

  return (
    <div className="flex flex-col items-center py-6">
      {/* QR Container */}
      <div className="relative p-4 bg-white rounded-2xl shadow-xl flex flex-col items-center">
        {!loaded && (
          <div className="w-[200px] h-[200px] flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
          </div>
        )}
        <canvas ref={canvasRef} className={`rounded-lg ${loaded ? "block" : "hidden"}`} />

        {isCancelled && (
          <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center text-red-400 p-4 text-center">
            <Ban className="w-10 h-10 mb-2" />
            <p className="text-sm font-black uppercase">Pass Invalid</p>
          </div>
        )}

        {isUsed && (
          <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center text-emerald-400 p-4 text-center">
            <ShieldCheck className="w-10 h-10 mb-2" />
            <p className="text-sm font-black uppercase">Already Checked In</p>
          </div>
        )}
      </div>

      {/* Code Text */}
      <p className="mt-3 text-[11px] font-mono tracking-widest text-zinc-400 text-center break-all">
        {qrCode.match(/.{1,8}/g)?.join(" ") || qrCode}
      </p>

      {/* Status Pill */}
      <div className="mt-3">
        <span
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider ${
            isValid
              ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-400"
              : isUsed
              ? "bg-zinc-700/50 border border-zinc-600 text-zinc-400"
              : "bg-rose-500/20 border border-rose-500/40 text-rose-400"
          }`}
        >
          {isValid && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
          {isValid ? "Active Entry Pass" : isUsed ? "Admitted" : "Invalid / Revoked"}
        </span>
      </div>

      {/* Quick Action Buttons */}
      <div className="mt-5 flex items-center gap-2">
        <button
          onClick={downloadQR}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Save QR</span>
        </button>

        <button
          onClick={copyPassUrl}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
          <span>{copied ? "Copied" : "Copy Link"}</span>
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Perforated Ticket Divider (Stub look)
// ─────────────────────────────────────────────────────────────────────────────

export function CardPerforatedDivider({
  theme = "modern",
}: {
  theme?: CardTheme;
}) {
  const isMinimal = theme === "minimal";
  const punchHoleBg = isMinimal ? "bg-zinc-100" : "bg-zinc-950";

  return (
    <div className="relative flex items-center my-2 -mx-6 px-6 overflow-hidden">
      <div className={`w-6 h-6 rounded-full ${punchHoleBg} -ml-9 flex-shrink-0`} />
      <div className="flex-1 border-t-2 border-dashed border-zinc-700/60 mx-3" />
      <div className={`w-6 h-6 rounded-full ${punchHoleBg} -mr-9 flex-shrink-0`} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Card Branding & Footer
// ─────────────────────────────────────────────────────────────────────────────

export function CardFooterBranding({
  theme = "modern",
}: {
  theme?: CardTheme;
}) {
  const isMinimal = theme === "minimal";

  return (
    <div
      className={`px-6 py-4 text-center text-xs font-semibold ${
        isMinimal ? "bg-zinc-50 text-zinc-500 border-t border-zinc-200" : "bg-zinc-950/60 text-zinc-400 border-t border-zinc-800/80"
      }`}
    >
      <p className="tracking-wide">
        Powered by <span className="font-bold text-orange-400">{BRAND.name}</span> · Non-transferable Digital Pass
      </p>
    </div>
  );
}
