"use client";

import { useEffect, useRef, useState } from "react";
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
  Check,
  Ban,
  Loader2,
  AlertCircle,
  Share2,
} from "lucide-react";
import { BRAND } from "@/config/branding";

type Props = {
  token: string;
  guest: {
    name: string;
    title: string | null;
    organization: string | null;
    invitationStatus: string;
    rsvpStatus: string;
    rsvpAt: string | null;
  };
  event: {
    title: string;
    slug: string;
    eventDate: string | null;
    endDate: string | null;
    venue: string | null;
    city: string | null;
    banner: string | null;
  };
  ticketInstance: {
    qrCode: string;
    status: string;
    checkedInAt: string | null;
  } | null;
  seat: {
    label: string;
    isVip: boolean;
    tableNumber?: string | null;
    tableName?: string | null;
  } | null;
};

export default function InvitationClient({
  token,
  guest,
  event,
  ticketInstance,
  seat,
}: Props) {
  const [rsvpStatus, setRsvpStatus] = useState<string>(guest.rsvpStatus || "pending");
  const [submittingRsvp, setSubmittingRsvp] = useState(false);
  const [rsvpFeedback, setRsvpFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [qrLoaded, setQrLoaded] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const qrCode = ticketInstance?.qrCode;
  const isCancelled = guest.invitationStatus === "cancelled" || ticketInstance?.status === "cancelled";
  const isCheckedIn = ticketInstance?.status === "used";

  // ── Render QR Code on Canvas ──────────────────────────────────────────────
  useEffect(() => {
    if (!qrCode || !canvasRef.current) return;

    const verifyUrl = `${window.location.origin}/verify/${qrCode}`;

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
          if (!err) setQrLoaded(true);
        }
      );
    });
  }, [qrCode]);

  // ── Handle RSVP Response ───────────────────────────────────────────────────
  async function handleRsvp(response: "accepted" | "declined") {
    if (isCancelled || (isCheckedIn && response === "declined")) return;

    setSubmittingRsvp(true);
    setRsvpFeedback(null);

    try {
      const res = await fetch(`/api/invitation/${token}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });

      const data = await res.json();

      if (!res.ok) {
        setRsvpFeedback({ type: "error", text: data.error || "Failed to update RSVP." });
        return;
      }

      setRsvpStatus(response);
      setRsvpFeedback({
        type: "success",
        text: response === "accepted" ? "You have accepted the invitation! We look forward to seeing you." : "Your response has been recorded.",
      });
    } catch {
      setRsvpFeedback({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSubmittingRsvp(false);
    }
  }

  // ── Download QR Action ────────────────────────────────────────────────────
  function downloadQR() {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `invitation-${guest.name.toLowerCase().replace(/\s+/g, "-")}.png`;
    a.click();
  }

  function handleShare() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  }

  // ── Date Formatting ───────────────────────────────────────────────────────
  const formattedDate = event.eventDate
    ? new Date(event.eventDate).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const formattedTime = event.eventDate
    ? new Date(event.eventDate).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 sm:py-16 text-zinc-100 flex flex-col items-center justify-center print:bg-white print:p-0 print:text-zinc-900">
      <div className="w-full max-w-lg space-y-6">

        {/* ── Top Brand Bar ── */}
        <div className="flex items-center justify-between px-2 print:hidden">
          <span className="text-xs font-black tracking-widest uppercase text-violet-400">
            {BRAND.name} Digital Pass
          </span>
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs font-black text-zinc-300 hover:bg-zinc-800 transition-all"
          >
            {copiedLink ? <Check size={13} className="text-emerald-400" /> : <Share2 size={13} />}
            {copiedLink ? "Link Copied" : "Share"}
          </button>
        </div>

        {/* ── Main Invitation Card ── */}
        <div className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/90 shadow-2xl backdrop-blur-sm print:border-zinc-300 print:bg-white print:shadow-none">

          {/* Event Banner Image (if present) */}
          {event.banner && (
            <div className="relative h-44 w-full overflow-hidden bg-zinc-950 sm:h-52 print:hidden">
              <Image
                src={event.banner}
                alt={event.title}
                fill
                sizes="(max-width: 640px) 100vw, 512px"
                className="object-cover opacity-80"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent" />
            </div>
          )}

          {/* Card Header */}
          <div className={`p-6 sm:p-8 ${!event.banner ? "border-b border-zinc-800" : ""}`}>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/20 border border-violet-500/30 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-violet-300">
                Official Invitation
              </span>
              {seat?.isVip && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-500/30 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-amber-300">
                  <Star size={11} className="fill-amber-300" /> VIP
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight print:text-zinc-900">
              {event.title}
            </h1>

            {/* Event Meta Details */}
            <div className="mt-4 space-y-2 text-xs font-semibold text-zinc-300 print:text-zinc-700">
              {formattedDate && (
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-violet-400 shrink-0" />
                  <span>
                    {formattedDate} {formattedTime ? `· ${formattedTime}` : ""}
                  </span>
                </div>
              )}
              {(event.venue || event.city) && (
                <div className="flex items-center gap-2">
                  <MapPin size={14} className="text-violet-400 shrink-0" />
                  <span>{[event.venue, event.city].filter(Boolean).join(", ")}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Perforated Divider ── */}
          <div className="relative flex items-center justify-between px-2 py-1 print:hidden">
            <div className="h-6 w-3 -translate-x-3 rounded-r-full bg-zinc-950 border-r border-t border-b border-zinc-800" />
            <div className="flex-1 border-b-2 border-dashed border-zinc-800 mx-2" />
            <div className="h-6 w-3 translate-x-3 rounded-l-full bg-zinc-950 border-l border-t border-b border-zinc-800" />
          </div>

          {/* Card Body — Guest Details & Admission QR */}
          <div className="p-6 sm:p-8 space-y-6">

            {/* Guest Identity Card */}
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4 sm:p-5 print:border-zinc-200 print:bg-zinc-50">
              <p className="text-[11px] font-black uppercase tracking-wider text-zinc-500">
                Guest of Honor
              </p>
              <p className="mt-1 text-lg font-black text-white print:text-zinc-900">
                {guest.title ? `${guest.title} ` : ""}{guest.name}
              </p>
              {guest.organization && (
                <p className="mt-0.5 text-xs font-semibold text-zinc-400 print:text-zinc-600">
                  {guest.organization}
                </p>
              )}

              {/* Seating Information */}
              {seat ? (
                <div className="mt-3.5 flex items-center gap-2 pt-3 border-t border-zinc-800/60 print:border-zinc-200">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
                    <Armchair size={15} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-zinc-500">Assigned Seat</p>
                    <p className="text-xs font-black text-blue-300 print:text-blue-900">{seat.label}</p>
                  </div>
                </div>
              ) : (
                <div className="mt-3.5 pt-3 border-t border-zinc-800/60 text-xs font-semibold text-zinc-500 print:border-zinc-200">
                  General Guest Admission
                </div>
              )}
            </div>

            {/* Cancelled Notice */}
            {isCancelled ? (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/20 text-red-400">
                  <Ban size={20} />
                </div>
                <p className="text-sm font-black text-red-300">Invitation Cancelled</p>
                <p className="mt-1 text-xs font-semibold text-red-200/80">
                  This invitation is no longer active. Please contact the event organizer for inquiries.
                </p>
              </div>
            ) : (
              <>
                {/* ── Admission QR Code ── */}
                {qrCode && (
                  <div className="text-center">
                    <div className="inline-block rounded-2xl bg-white p-3.5 shadow-xl">
                      <canvas ref={canvasRef} className="mx-auto block" />
                    </div>

                    <p className="mt-3 font-mono text-xs font-semibold tracking-wider text-zinc-400">
                      {qrCode.match(/.{1,4}/g)?.join(" ") || qrCode}
                    </p>

                    <p className="mt-1.5 text-xs font-semibold text-zinc-400">
                      Show this admission QR pass at the entrance for entry.
                    </p>

                    {/* Checked-In Badge */}
                    {isCheckedIn && (
                      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-3.5 py-1 text-xs font-black text-emerald-300">
                        <CheckCircle2 size={14} /> Checked In at the Entrance
                      </div>
                    )}
                  </div>
                )}

                {/* ── RSVP Section ── */}
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 print:hidden">
                  <div className="flex items-center justify-between mb-3.5">
                    <span className="text-xs font-black uppercase tracking-wider text-zinc-400">
                      RSVP Status
                    </span>
                    {rsvpStatus === "accepted" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-black text-emerald-300">
                        <CheckCircle2 size={12} /> Accepted
                      </span>
                    ) : rsvpStatus === "declined" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 border border-zinc-700 px-2.5 py-0.5 text-xs font-black text-zinc-400">
                        <XCircle size={12} /> Declined
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-500/30 px-2.5 py-0.5 text-xs font-black text-amber-300">
                        <Clock size={12} /> Awaiting Response
                      </span>
                    )}
                  </div>

                  {/* Feedback Message */}
                  {rsvpFeedback && (
                    <div
                      className={`mb-3.5 rounded-xl border p-3 text-xs font-black ${
                        rsvpFeedback.type === "success"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : "border-red-500/30 bg-red-500/10 text-red-300"
                      }`}
                    >
                      {rsvpFeedback.type === "success" ? (
                        <Check size={13} className="mr-1 inline" />
                      ) : (
                        <AlertCircle size={13} className="mr-1 inline" />
                      )}
                      {rsvpFeedback.text}
                    </div>
                  )}

                  {/* RSVP Action Buttons */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() => handleRsvp("accepted")}
                      disabled={submittingRsvp || rsvpStatus === "accepted"}
                      className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-black transition-all ${
                        rsvpStatus === "accepted"
                          ? "bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 cursor-default"
                          : "bg-emerald-600 text-white hover:bg-emerald-500 active:scale-95 shadow-lg shadow-emerald-950"
                      } disabled:opacity-50`}
                    >
                      {submittingRsvp ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <>
                          <Check size={14} /> Accept Invitation
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleRsvp("declined")}
                      disabled={submittingRsvp || rsvpStatus === "declined" || isCheckedIn}
                      className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-black transition-all ${
                        rsvpStatus === "declined"
                          ? "bg-zinc-800 text-zinc-400 border border-zinc-700 cursor-default"
                          : "border border-zinc-700 bg-zinc-800/80 text-zinc-300 hover:bg-zinc-800 hover:text-white active:scale-95"
                      } disabled:opacity-50`}
                    >
                      {submittingRsvp ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <>
                          <XCircle size={14} /> Decline
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ── Utilities: Download QR & Print ── */}
            {!isCancelled && qrCode && (
              <div className="flex gap-2.5 pt-2 border-t border-zinc-800/80 print:hidden">
                <button
                  onClick={downloadQR}
                  disabled={!qrLoaded}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/90 py-2.5 text-xs font-black text-zinc-300 hover:bg-zinc-800 transition-all disabled:opacity-50"
                >
                  <Download size={13} /> Save QR Code
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/90 py-2.5 text-xs font-black text-zinc-300 hover:bg-zinc-800 transition-all"
                >
                  <Printer size={13} /> Print Pass
                </button>
              </div>
            )}

          </div>

        </div>

        {/* ── Footer ── */}
        <p className="text-center text-[11px] font-semibold text-zinc-500 print:hidden">
          Powered by {BRAND.name} · Official Digital Ticket & Invitation Platform
        </p>

      </div>
    </main>
  );
}
