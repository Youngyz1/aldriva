"use client";

import React, { useState } from "react";
import Link from "next/link";
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
  Ticket as TicketIcon,
  CalendarPlus,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import {
  CardContainer,
  CardHeader,
  CardEventMeta,
  CardSeatBadge,
  CardQRCode,
  CardPerforatedDivider,
  CardFooterBranding,
  CardTheme,
  CardSeatInfo,
  CardEventInfo,
  CardStatusType,
} from "./DigitalCardPrimitives";
import { BRAND } from "@/config/branding";

export type TicketCardProps = {
  qrCode: string;
  orderId?: string | null;
  event: CardEventInfo;
  ticketName?: string | null;
  price?: number;
  quantity?: number;
  seat: CardSeatInfo | null;
  buyerName?: string | null;
  buyerEmail?: string | null;
  status?: CardStatusType;
  issuedAt?: string | null;
  initialTemplate?: "modern" | "concert" | "premium" | "minimal";
  allowTemplateSwitching?: boolean;
};

export function TicketCard({
  qrCode,
  orderId,
  event,
  ticketName = "General Admission",
  price = 0,
  quantity = 1,
  seat,
  buyerName,
  buyerEmail,
  status = "valid",
  issuedAt,
  initialTemplate = "modern",
  allowTemplateSwitching = true,
}: TicketCardProps) {
  const [template, setTemplate] = useState<"modern" | "concert" | "premium" | "minimal">(initialTemplate);
  const [copiedLink, setCopiedLink] = useState(false);

  const isFree = price === 0;
  const isVip = Boolean(seat?.isVip);

  // ── Download .ics Calendar File ───────────────────────────────────────────
  function downloadCalendarFile() {
    if (!event.eventDate) return;
    const startDate = new Date(event.eventDate);
    const endDate = event.endDate ? new Date(event.endDate) : new Date(startDate.getTime() + 3 * 60 * 60 * 1000);

    const pad = (n: number) => (n < 10 ? "0" + n : n);
    const formatICSDate = (d: Date) =>
      `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Aldriva//Digital Ticket//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `SUMMARY:${event.title}`,
      `DESCRIPTION:Official Digital Ticket (${ticketName || "General Entry"}) - ${BRAND.name}`,
      event.venue || event.city ? `LOCATION:${[event.venue, event.city].filter(Boolean).join(", ")}` : "",
      `DTSTART:${formatICSDate(startDate)}`,
      `DTEND:${formatICSDate(endDate)}`,
      `STATUS:CONFIRMED`,
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .filter(Boolean)
      .join("\r\n");

    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ticket-${event.slug || "event"}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleShare() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  }

  return (
    <div className="flex flex-col items-center w-full max-w-lg mx-auto">
      {/* Optional Template Selector */}
      {allowTemplateSwitching && (
        <div className="flex items-center gap-1.5 p-1 bg-zinc-900/90 border border-zinc-800 rounded-2xl mb-4 backdrop-blur-md shadow-lg print:hidden">
          <button
            onClick={() => setTemplate("modern")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              template === "modern"
                ? "bg-orange-500/20 text-orange-300 border border-orange-500/30"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            ⚡ Modern
          </button>
          <button
            onClick={() => setTemplate("concert")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              template === "concert"
                ? "bg-zinc-700 text-white border border-zinc-600"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            🎸 Concert Stub
          </button>
          <button
            onClick={() => setTemplate("premium")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              template === "premium"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            👑 VIP Gold
          </button>
          <button
            onClick={() => setTemplate("minimal")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              template === "minimal"
                ? "bg-white text-zinc-950 font-black shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            📄 Minimal
          </button>
        </div>
      )}

      {/* Main Ticket Card */}
      <CardContainer theme={template}>
        {/* Top Strip */}
        <CardHeader
          event={event}
          badgeText={isVip ? "VIP Pass" : ticketName || "Admission Pass"}
          theme={template}
        />

        <div className="p-6 sm:p-8">
          {/* Event Header Info */}
          <div className="text-center pb-4">
            <h1
              className={`text-2xl sm:text-3xl font-black tracking-tight ${
                template === "minimal" ? "text-zinc-900" : "text-white"
              }`}
            >
              {event.title}
            </h1>
            <div className="mt-2 flex items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">
                <TicketIcon className="w-3.5 h-3.5" />
                {ticketName || "General Entry"}
              </span>
              <span
                className={`text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full ${
                  isFree ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-zinc-800 text-zinc-300"
                }`}
              >
                {isFree ? "Free Pass" : `$${price.toFixed(2)}`}
              </span>
            </div>
          </div>

          {/* Event Metadata */}
          <CardEventMeta event={event} theme={template} />

          {/* Assigned Seat */}
          {seat && (
            <div className="my-4">
              <CardSeatBadge seat={seat} theme={template} />
            </div>
          )}

          {/* Perforated Divider */}
          <CardPerforatedDivider theme={template} />

          {/* QR Code Pass */}
          <CardQRCode qrCode={qrCode} status={status} theme={template} />

          {/* Order Details & Buyer Info */}
          <div className="mt-4 pt-4 border-t border-zinc-800/60 text-xs space-y-2.5">
            <div className="flex justify-between text-zinc-400">
              <span className="font-semibold">Ticket Pass ID</span>
              <span className="font-mono text-zinc-200 font-bold">{qrCode.slice(0, 14)}...</span>
            </div>
            {orderId && (
              <div className="flex justify-between text-zinc-400">
                <span className="font-semibold">Order Reference</span>
                <span className="font-mono text-zinc-200 font-bold">{orderId.slice(0, 12)}</span>
              </div>
            )}
            {buyerName && (
              <div className="flex justify-between text-zinc-400">
                <span className="font-semibold">Attendee</span>
                <span className="text-zinc-200 font-bold">{buyerName}</span>
              </div>
            )}
            {buyerEmail && (
              <div className="flex justify-between text-zinc-400">
                <span className="font-semibold">Email</span>
                <span className="text-zinc-200 font-medium">{buyerEmail}</span>
              </div>
            )}
            <div className="flex justify-between text-zinc-400">
              <span className="font-semibold">Issued Date</span>
              <span className="text-zinc-200 font-medium">
                {issuedAt
                  ? new Date(issuedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : new Date().toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 pt-6 border-t border-zinc-800/60 grid grid-cols-3 gap-2 text-center print:hidden">
            <button
              onClick={downloadCalendarFile}
              className="p-3 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 text-xs font-bold flex flex-col items-center gap-1.5 transition"
            >
              <CalendarPlus className="w-4 h-4 text-orange-400" />
              <span>Calendar</span>
            </button>

            <button
              onClick={() => window.print()}
              className="p-3 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 text-xs font-bold flex flex-col items-center gap-1.5 transition"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span>Print Ticket</span>
            </button>

            <button
              onClick={handleShare}
              className="p-3 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 text-xs font-bold flex flex-col items-center gap-1.5 transition"
            >
              <Share2 className="w-4 h-4 text-orange-400" />
              <span>{copiedLink ? "Copied!" : "Share Pass"}</span>
            </button>
          </div>
        </div>

        <CardFooterBranding theme={template} />
      </CardContainer>
    </div>
  );
}
