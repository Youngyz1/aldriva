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
  CalendarPlus,
  Building,
} from "lucide-react";
import {
  CardContainer,
  CardHeader,
  CardEventMeta,
  CardSeatBadge,
  CardQRCode,
  CardFooterBranding,
  CardTheme,
  CardSeatInfo,
  CardEventInfo,
} from "./DigitalCardPrimitives";
import { BRAND } from "@/config/branding";

export type InvitationCardProps = {
  token: string;
  guest: {
    name: string;
    title: string | null;
    organization: string | null;
    invitationStatus: string;
    rsvpStatus: string;
    rsvpAt: string | null;
  };
  event: CardEventInfo;
  ticketInstance: {
    qrCode: string;
    status: string;
    checkedInAt: string | null;
  } | null;
  seat: CardSeatInfo | null;
  onRsvp: (response: "accepted" | "declined") => Promise<void>;
  submittingRsvp: boolean;
  rsvpFeedback: { type: "success" | "error"; text: string } | null;
  initialTemplate?: "elegant" | "modern" | "minimal";
  allowTemplateSwitching?: boolean;
  hideHeader?: boolean;
};

export function InvitationCard({
  token,
  guest,
  event,
  ticketInstance,
  seat,
  onRsvp,
  submittingRsvp,
  rsvpFeedback,
  initialTemplate = "elegant",
  allowTemplateSwitching = true,
  hideHeader = false,
}: InvitationCardProps) {
  const [template, setTemplate] = useState<"elegant" | "modern" | "minimal">(initialTemplate);
  const [copiedLink, setCopiedLink] = useState(false);

  const qrCode = ticketInstance?.qrCode;
  const isCancelled = guest.invitationStatus === "cancelled" || ticketInstance?.status === "cancelled";
  const isCheckedIn = ticketInstance?.status === "used";
  const isAccepted = guest.rsvpStatus === "accepted";
  const isDeclined = guest.rsvpStatus === "declined";

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
      "PRODID:-//Aldriva//Digital Invitation//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `SUMMARY:${event.title}`,
      `DESCRIPTION:Official Invitation for ${guest.name} - ${BRAND.name}`,
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
    a.download = `invitation-${event.slug || "event"}.ics`;
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
      {allowTemplateSwitching && !hideHeader && (
        <div className="flex items-center gap-1.5 p-1 bg-zinc-900/90 border border-zinc-800 rounded-2xl mb-4 backdrop-blur-md shadow-lg print:hidden">
          <button
            onClick={() => setTemplate("elegant")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              template === "elegant"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Elegant
          </button>
          <button
            onClick={() => setTemplate("modern")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              template === "modern"
                ? "bg-orange-500/20 text-orange-300 border border-orange-500/30"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Modern
          </button>
          <button
            onClick={() => setTemplate("minimal")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              template === "minimal"
                ? "bg-white text-zinc-950 font-black shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Minimal
          </button>
        </div>
      )}

      {/* Main Card */}
      <CardContainer theme={template}>
        {!hideHeader && (
          <CardHeader
            event={event}
            badgeText={seat?.isVip ? "VIP Guest Pass" : "Honored Guest"}
            theme={template}
          />
        )}

        <div className="p-6 sm:p-8">
          {/* Guest Personalization (shown only if header not replaced by template artwork) */}
          {!hideHeader && (
            <div className="text-center pb-6 border-b border-zinc-800/60">
              <span
                className={`text-[11px] font-black uppercase tracking-widest ${
                  template === "elegant"
                    ? "text-amber-400"
                    : template === "minimal"
                    ? "text-orange-600"
                    : "text-orange-400"
                }`}
              >
                Exclusive Invitation
              </span>
              <h1
                className={`text-2xl sm:text-3xl font-black mt-1 tracking-tight ${
                  template === "minimal" ? "text-zinc-900" : "text-white"
                }`}
              >
                {guest.name}
              </h1>
              {(guest.title || guest.organization) && (
                <p
                  className={`text-sm font-medium mt-1 flex items-center justify-center gap-1.5 ${
                    template === "minimal" ? "text-zinc-500" : "text-zinc-400"
                  }`}
                >
                  {guest.organization && <Building className="w-3.5 h-3.5" />}
                  {[guest.title, guest.organization].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          )}

          {/* Event Metadata (shown only if header not replaced) */}
          {!hideHeader && <CardEventMeta event={event} theme={template} />}

          {/* Seating Assignment */}
          {seat && (
            <div className="my-4">
              <CardSeatBadge seat={seat} theme={template} />
            </div>
          )}

          {/* RSVP Feedback Banner */}
          {rsvpFeedback && (
            <div
              className={`p-4 rounded-2xl mb-5 text-xs font-bold flex items-center gap-2.5 animate-fade-in ${
                rsvpFeedback.type === "success"
                  ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
                  : "bg-rose-500/15 border border-rose-500/30 text-rose-400"
              }`}
            >
              {rsvpFeedback.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 flex-shrink-0" />
              )}
              <span>{rsvpFeedback.text}</span>
            </div>
          )}

          {/* Cancelled Banner */}
          {isCancelled && (
            <div className="p-4 rounded-2xl mb-5 bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-2.5">
              <Ban className="w-4 h-4 flex-shrink-0" />
              <span>This invitation has been revoked or cancelled by the organizer.</span>
            </div>
          )}

          {/* RSVP Response Actions */}
          {!isCancelled && !isCheckedIn && (
            <div className="my-6 p-5 rounded-2xl bg-zinc-800/40 border border-zinc-800 text-center print:hidden">
              <p
                className={`text-xs font-black uppercase tracking-wider mb-3.5 ${
                  template === "minimal" ? "text-zinc-600" : "text-zinc-300"
                }`}
              >
                Will you be attending?
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => onRsvp("accepted")}
                  disabled={submittingRsvp || isAccepted}
                  className={`py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                    isAccepted
                      ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/30"
                      : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30"
                  }`}
                >
                  {submittingRsvp ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isAccepted ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>{isAccepted ? "Attending" : "Accept RSVP"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onRsvp("declined")}
                  disabled={submittingRsvp || isDeclined}
                  className={`py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                    isDeclined
                      ? "bg-rose-600 text-white shadow-lg shadow-rose-900/30"
                      : "bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30"
                  }`}
                >
                  {submittingRsvp ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isDeclined ? (
                    <XCircle className="w-3.5 h-3.5" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  <span>{isDeclined ? "Declined" : "Decline"}</span>
                </button>
              </div>
            </div>
          )}

          {/* QR Code Pass (Shown when QR is available and not declined) */}
          {qrCode && !isDeclined && (
            <div className="mt-4">
              <CardQRCode
                qrCode={qrCode}
                status={isCancelled ? "cancelled" : isCheckedIn ? "used" : "valid"}
                theme={template}
              />
            </div>
          )}

          {/* Utility Action Buttons */}
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
              <span>Print Pass</span>
            </button>

            <button
              onClick={handleShare}
              className="p-3 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 text-xs font-bold flex flex-col items-center gap-1.5 transition"
            >
              <Share2 className="w-4 h-4 text-orange-400" />
              <span>{copiedLink ? "Copied!" : "Share Link"}</span>
            </button>
          </div>
        </div>

        <CardFooterBranding theme={template} />
      </CardContainer>
    </div>
  );
}
