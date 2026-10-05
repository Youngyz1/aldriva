"use client";

/**
 * components/invitation/templates/InvitationTemplateBirthday.tsx
 *
 * Birthday Invitation Template — "Bold Celebration"
 *
 * Design Decisions:
 * - Palette: Joyful, bright, modern saturated color blocks with Electric Coral (#FF5E5B),
 *   Sunshine Yellow (#FFD166), Vibrant Indigo (#3A36D4), Mint (#06D6A0), crisp white (#FFFFFF),
 *   and bold ink (#141218).
 * - Typography: Outfit heavy display for bold punchy headlines paired with Plus_Jakarta_Sans
 *   for clean readable text.
 * - Hero Composition: Large celebrant name, milestone badge (ageMilestone), tilted sticker-framed
 *   photo with playful geometric accents, date/time/venue visible on 390x844.
 * - Party Details: Chunky color-block cards for theme, dress code, location, and wishlist.
 * - Polaroid Gallery: Tilted photo cards with subtle tape stickers and touch-swipe lightbox.
 * - RSVP & Pass: VIP Party Pass with party confirmation ("Count Me In! 🎉") and canvas QR pass.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Image from "next/image";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import {
  CheckCircle2,
  XCircle,
  CalendarPlus,
  Share2,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Check,
  Loader2,
  X,
  Gift,
  PartyPopper,
  Sparkles,
  MapPin,
  Calendar,
  Clock,
} from "lucide-react";
import {
  InvitationPageData,
  InvitationGalleryItem,
  InvitationScheduleItem,
} from "@/types/invitation-template";
import VenueMapClient from "@/components/VenueMapClient";

// ── Typography ────────────────────────────────────────────────────────────────
const displayFont = Outfit({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-bday-display",
});

const textFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-bday-text",
});

// ── Saturated Birthday Tokens ────────────────────────────────────────────────
const BDAY_VARS = {
  "--bday-bg": "#FFFDF7",
  "--bday-bg-alt": "#FFF5EB",
  "--bday-ink": "#141218",
  "--bday-ink-muted": "#524B5E",
  "--bday-coral": "#FF5E5B",
  "--bday-yellow": "#FFD166",
  "--bday-indigo": "#3A36D4",
  "--bday-mint": "#06D6A0",
  "--bday-purple": "#9B5DE5",
  "--bday-card-border": "#141218",
} as const;

const FF_DISPLAY = `var(--font-bday-display), 'Outfit', sans-serif`;
const FF_TEXT = `var(--font-bday-text), 'Plus Jakarta Sans', sans-serif`;

interface Props {
  data: InvitationPageData;
  onRsvp?: (response: "accepted" | "declined") => Promise<void>;
  className?: string;
}

export function InvitationTemplateBirthday({ data, onRsvp, className = "" }: Props) {
  const [currentRsvp, setCurrentRsvp] = useState<"pending" | "accepted" | "declined">(
    data.guest.rsvpStatus || "pending"
  );
  const [submittingRsvp, setSubmittingRsvp] = useState(false);
  const [rsvpFeedback, setRsvpFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    setCurrentRsvp(data.guest.rsvpStatus || "pending");
  }, [data.guest.rsvpStatus]);

  // ── 1. VIP Determination ─────────────────────────────────────────────────
  const isVipGuest = Boolean(data.guest.isVip || data.seat?.isVip);

  // ── 2. Timezone-Aware Date & Time Formatter ──────────────────────────────
  const { dateDisplay, timeDisplay } = useMemo(() => {
    if (!data.eventDate) return { dateDisplay: "Date TBA", timeDisplay: "Time TBA" };
    try {
      const d = new Date(data.eventDate);
      const tzOptions: Intl.DateTimeFormatOptions = data.timezone
        ? { timeZone: data.timezone }
        : {};

      const dateStr = d.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        ...tzOptions,
      });

      const timeStr = d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        ...tzOptions,
      });

      const tzAbbr = data.timezone
        ? d
            .toLocaleTimeString("en-US", { timeZoneName: "short", ...tzOptions })
            .split(" ")
            .pop()
        : "";

      return {
        dateDisplay: dateStr,
        timeDisplay: tzAbbr ? `${timeStr} ${tzAbbr}` : timeStr,
      };
    } catch {
      return { dateDisplay: "Date TBA", timeDisplay: "Time TBA" };
    }
  }, [data.eventDate, data.timezone]);

  // ── 3. RSVP Handler ──────────────────────────────────────────────────────
  async function handleRsvpAction(response: "accepted" | "declined") {
    if (submittingRsvp) return;
    setSubmittingRsvp(true);
    setRsvpFeedback(null);

    try {
      if (onRsvp) {
        await onRsvp(response);
      } else {
        const res = await fetch(`/api/invitation/${data.token}/rsvp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ response }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to record RSVP");
        }
      }

      setCurrentRsvp(response);
      setRsvpFeedback({
        type: "success",
        text:
          response === "accepted"
            ? "You're in! Get ready for an unforgettable birthday celebration!"
            : "We'll miss you! Thanks for letting us know.",
      });
    } catch {
      setCurrentRsvp(response);
      setRsvpFeedback({
        type: "success",
        text:
          response === "accepted"
            ? "RSVP Confirmed! (Preview mode)"
            : "Declined recorded. (Preview mode)",
      });
    } finally {
      setSubmittingRsvp(false);
    }
  }

  // ── 4. Calendar Helpers ──────────────────────────────────────────────────
  function downloadIcsFile() {
    if (!data.eventDate) return;
    const startDate = new Date(data.eventDate);
    const endDate = data.endDate
      ? new Date(data.endDate)
      : new Date(startDate.getTime() + 4 * 60 * 60 * 1000);

    const pad = (n: number) => (n < 10 ? "0" + n : String(n));
    const formatICSDate = (d: Date) =>
      `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

    const locationStr = [data.venue, data.address, data.city].filter(Boolean).join(", ");

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Aldriva//Birthday Invitation//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `SUMMARY:${data.title}`,
      `DESCRIPTION:Birthday Party for ${data.celebrantName || data.guest.name}`,
      locationStr ? `LOCATION:${locationStr}` : "",
      `DTSTART:${formatICSDate(startDate)}`,
      `DTEND:${formatICSDate(endDate)}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .filter(Boolean)
      .join("\r\n");

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `party-${data.title.toLowerCase().replace(/[^a-z0-9]/g, "-")}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getGoogleCalendarUrl() {
    if (!data.eventDate) return "#";
    const startDate = new Date(data.eventDate);
    const endDate = data.endDate
      ? new Date(data.endDate)
      : new Date(startDate.getTime() + 4 * 60 * 60 * 1000);

    const pad = (n: number) => (n < 10 ? "0" + n : String(n));
    const fmt = (d: Date) =>
      `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

    const details = `Birthday Celebration for ${data.celebrantName || data.guest.name}`;
    const location = [data.venue, data.address, data.city].filter(Boolean).join(", ");

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
      data.title
    )}&dates=${fmt(startDate)}/${fmt(endDate)}&details=${encodeURIComponent(
      details
    )}&location=${encodeURIComponent(location)}`;
  }

  function handleShare() {
    if (typeof window !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  }

  const hasVenueInfo = Boolean(data.venue || data.address || data.city);
  const hasMapCoordinates = Boolean(data.latitude && data.longitude) || Boolean(data.address);

  const heroFocusStyle: React.CSSProperties = {
    objectPosition: data.heroImageFocus
      ? `${data.heroImageFocus.x}% ${data.heroImageFocus.y}%`
      : "50% 50%",
  };

  return (
    <div
      className={`min-h-screen antialiased overflow-x-hidden ${displayFont.variable} ${textFont.variable} ${className}`}
      style={{
        ...BDAY_VARS,
        background: "var(--bday-bg)",
        color: "var(--bday-ink)",
        fontFamily: FF_TEXT,
      } as React.CSSProperties}
    >
      {/* Background Music Player */}
      {data.musicAudioUrl && (
        <FloatingBirthdayMusic audioUrl={data.musicAudioUrl} title={data.musicTitle} />
      )}

      {/* ── Section 1: Hero Composition (Tilted Photo & Milestone Badge) ────── */}
      <section
        aria-label="Birthday Hero"
        className="relative w-full pt-8 sm:pt-14 pb-12 px-4 sm:px-6 flex flex-col items-center text-center"
      >
        {/* Top Eyebrow Sticker */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[--bday-yellow] border-2 border-[--bday-ink] shadow-[2px_2px_0px_0px_#141218] mb-4 rotate-[-1deg]">
          <PartyPopper className="w-4 h-4 text-[--bday-ink]" />
          <span className="text-xs font-black uppercase tracking-wider text-[--bday-ink]">
            {data.eyebrow || "Birthday Celebration"}
          </span>
        </div>

        {/* Milestone Age & Celebrant Name */}
        <div className="max-w-3xl mx-auto mb-5">
          {data.ageMilestone && (
            <div className="inline-block px-3.5 py-1 rounded-lg bg-[--bday-coral] text-white text-xs sm:text-sm font-extrabold uppercase tracking-widest shadow-[2px_2px_0px_0px_#141218] mb-2 rotate-1">
              {data.ageMilestone} Birthday!
            </div>
          )}

          <h1
            className="text-4xl sm:text-6xl lg:text-7xl font-black text-[--bday-ink] tracking-tight leading-[1.08] text-balance"
            style={{ fontFamily: FF_DISPLAY }}
          >
            {data.title}
          </h1>

          {data.hostNames && (
            <p className="mt-2 text-sm sm:text-base font-medium text-[--bday-ink-muted]">
              {data.hostNames}
            </p>
          )}

          {data.theme && (
            <div className="mt-3 inline-block px-3 py-1 rounded-full bg-[--bday-mint] border border-[--bday-ink] text-xs font-bold text-[--bday-ink] shadow-[2px_2px_0px_0px_#141218]">
              Theme: {data.theme}
            </div>
          )}
        </div>

        {/* Tilted Photo Frame with Sticker Badge */}
        <div className="relative my-4 w-full max-w-[340px] sm:max-w-[420px] aspect-[4/3] rounded-3xl overflow-hidden border-4 border-[--bday-ink] shadow-[6px_6px_0px_0px_#141218] rotate-[-1.5deg] motion-reduce:rotate-0 bg-[--bday-yellow]">
          {data.heroImage ? (
            <Image
              src={data.heroImage}
              alt={data.heroImageAlt || data.title}
              fill
              priority
              sizes="(max-width: 640px) 340px, 420px"
              className="object-cover"
              style={heroFocusStyle}
            />
          ) : (
            /* Designed Fallback: Retro Pop Art Celebrant Badge */
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-br from-[--bday-yellow] via-[--bday-coral] to-[--bday-purple] text-center text-white">
              <div className="w-16 h-16 rounded-2xl bg-white border-2 border-[--bday-ink] text-[--bday-coral] flex items-center justify-center shadow-[3px_3px_0px_0px_#141218] mb-3">
                <PartyPopper className="w-8 h-8" />
              </div>
              <p
                className="text-2xl sm:text-3xl font-black text-white drop-shadow-[2px_2px_0px_#141218]"
                style={{ fontFamily: FF_DISPLAY }}
              >
                Let&apos;s Party!
              </p>
              <p className="text-xs font-bold uppercase tracking-widest text-[--bday-yellow] mt-1 drop-shadow-[1px_1px_0px_#141218]">
                {data.city || "Birthday Bash"}
              </p>
            </div>
          )}
        </div>

        {/* First Viewport Date / Time / Venue Strip (Visible on 390x844 without scrolling) */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:gap-3 max-w-lg mx-auto text-xs font-bold">
          <div className="px-3.5 py-2 rounded-xl bg-white border-2 border-[--bday-ink] shadow-[2px_2px_0px_0px_#141218] flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-[--bday-coral]" />
            <span>{dateDisplay}</span>
          </div>
          <div className="px-3.5 py-2 rounded-xl bg-white border-2 border-[--bday-ink] shadow-[2px_2px_0px_0px_#141218] flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-[--bday-indigo]" />
            <span>{timeDisplay}</span>
          </div>
          {hasVenueInfo && (
            <div className="px-3.5 py-2 rounded-xl bg-white border-2 border-[--bday-ink] shadow-[2px_2px_0px_0px_#141218] flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-[--bday-mint]" />
              <span>{data.venue || data.city}</span>
            </div>
          )}
        </div>

        {data.hashtag && (
          <p className="mt-3 text-xs font-extrabold text-[--bday-indigo] tracking-wider">
            {data.hashtag}
          </p>
        )}
      </section>

      {/* ── Section 2: Celebrant Message & Guest Welcome ───────────────────── */}
      <section aria-label="Celebrant Message" className="py-14 sm:py-20 px-6 bg-[--bday-bg-alt]">
        <div className="max-w-2xl mx-auto text-center">
          {/* Guest Personalization */}
          <div className="inline-block px-4 py-1 rounded-full bg-[--bday-coral] text-white text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_#141218] mb-2">
            {isVipGuest ? "⭐ VIP Party Guest ⭐" : "Welcome, Friend!"}
          </div>

          <h2
            className="text-3xl sm:text-4xl font-black text-[--bday-ink] mt-1 mb-2"
            style={{ fontFamily: FF_DISPLAY }}
          >
            {data.guest.name}
          </h2>
          {(data.guest.title || data.guest.organization) && (
            <p className="text-xs text-[--bday-ink-muted] mb-6 font-semibold">
              {[data.guest.title, data.guest.organization].filter(Boolean).join(" · ")}
            </p>
          )}

          <div className="p-6 sm:p-8 rounded-3xl bg-white border-2 border-[--bday-ink] shadow-[4px_4px_0px_0px_#141218] text-left space-y-3">
            <h3
              className="text-xl font-black text-[--bday-ink] flex items-center gap-2"
              style={{ fontFamily: FF_DISPLAY }}
            >
              <Sparkles className="w-5 h-5 text-[--bday-yellow]" />
              {data.storyHeadline || "A Message From The Celebrant"}
            </h3>
            <p className="text-sm sm:text-base leading-relaxed text-[--bday-ink-muted] whitespace-pre-line">
              {data.storyText ||
                "Another year older and ready to celebrate with the best people in the world! Come ready to dance, drink, and make some noise. Let's make this year unforgettable!"}
            </p>
          </div>

          {/* Optional Host/Celebrant Photo */}
          {data.storyImage && (
            <div className="mt-8 max-w-sm mx-auto aspect-[4/5] relative rounded-3xl overflow-hidden border-4 border-[--bday-ink] shadow-[6px_6px_0px_0px_#141218] rotate-1">
              <Image
                src={data.storyImage}
                alt="Celebrant portrait"
                fill
                sizes="(max-width: 640px) 100vw, 384px"
                className="object-cover"
              />
            </div>
          )}
        </div>
      </section>

      {/* ── Section 3: Party Details (Chunky Color-Block Cards) ────────────── */}
      <section aria-label="Party Details" className="py-14 sm:py-20 px-6 bg-[--bday-bg]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-xs font-black uppercase tracking-widest text-[--bday-indigo]">
              Need to Know
            </span>
            <h2
              className="text-3xl sm:text-4xl font-black text-[--bday-ink] mt-1"
              style={{ fontFamily: FF_DISPLAY }}
            >
              Party Details &amp; Vibe
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* When & Time */}
            <div className="p-6 rounded-3xl bg-[--bday-yellow] border-2 border-[--bday-ink] shadow-[4px_4px_0px_0px_#141218] flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-[--bday-ink]/70">
                  When
                </span>
                <h3 className="text-lg font-black text-[--bday-ink] mt-1">{dateDisplay}</h3>
                <p className="text-xs font-bold text-[--bday-ink-muted] mt-0.5">{timeDisplay}</p>
              </div>
            </div>

            {/* Where */}
            {hasVenueInfo && (
              <div className="p-6 rounded-3xl bg-[--bday-mint] border-2 border-[--bday-ink] shadow-[4px_4px_0px_0px_#141218] flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-[--bday-ink]/70">
                    Location
                  </span>
                  <h3 className="text-lg font-black text-[--bday-ink] mt-1">
                    {data.venue || data.city}
                  </h3>
                  {data.address && (
                    <p className="text-xs font-bold text-[--bday-ink-muted] mt-0.5">
                      {data.address}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Dress Code */}
            {data.dressCode && (
              <div className="p-6 rounded-3xl bg-[--bday-coral] text-white border-2 border-[--bday-ink] shadow-[4px_4px_0px_0px_#141218] flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-white/80">
                    Attire
                  </span>
                  <h3 className="text-lg font-black text-white mt-1">{data.dressCode}</h3>
                  {data.dressCodeNotes && (
                    <p className="text-xs text-white/90 mt-0.5">{data.dressCodeNotes}</p>
                  )}
                </div>
              </div>
            )}

            {/* Wishlist / Gift Note */}
            {data.giftNote && (
              <div className="p-6 rounded-3xl bg-[--bday-purple] text-white border-2 border-[--bday-ink] shadow-[4px_4px_0px_0px_#141218] sm:col-span-2 lg:col-span-1">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-white/80 flex items-center gap-1">
                    <Gift className="w-3.5 h-3.5" /> Gift Note &amp; Wishlist
                  </span>
                  <p className="text-xs mt-2 leading-relaxed text-white/95 font-medium whitespace-pre-line">
                    {data.giftNote}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Section 4: Countdown (Bold Lining Numbers) ──────────────────────── */}
      <section aria-label="Birthday Countdown" className="py-14 sm:py-20 px-6 bg-[--bday-indigo] text-white">
        <div className="max-w-2xl mx-auto text-center">
          <span className="inline-block px-3 py-1 rounded-full bg-[--bday-yellow] text-[--bday-ink] text-xs font-black uppercase tracking-widest mb-4">
            The Countdown Is On!
          </span>
          <BirthdayCountdownTicker targetDate={data.eventDate} timezone={data.timezone} />
        </div>
      </section>

      {/* ── Section 5: Schedule / Party Timeline (HIDE-IF-EMPTY) ────────────── */}
      {data.schedule && data.schedule.length > 0 && (
        <section aria-label="Party Schedule" className="py-16 sm:py-24 px-6 bg-[--bday-bg]">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-12">
              <span className="text-xs font-black uppercase tracking-widest text-[--bday-coral]">
                Timeline
              </span>
              <h2
                className="text-3xl sm:text-4xl font-black text-[--bday-ink] mt-1"
                style={{ fontFamily: FF_DISPLAY }}
              >
                Party Lineup
              </h2>
            </div>

            <div className="space-y-4">
              {data.schedule.map((item: InvitationScheduleItem, idx: number) => (
                <div
                  key={idx}
                  className="p-5 rounded-2xl bg-white border-2 border-[--bday-ink] shadow-[3px_3px_0px_0px_#141218] flex items-start gap-4 hover:translate-x-1 transition-transform"
                >
                  <div className="px-3 py-1 rounded-xl bg-[--bday-yellow] border border-[--bday-ink] text-xs font-black text-[--bday-ink] shrink-0">
                    {item.time}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-extrabold text-[--bday-ink]">{item.title}</h4>
                      {item.badge && (
                        <span className="px-2 py-0.5 rounded-full bg-[--bday-mint] text-[10px] font-bold text-[--bday-ink]">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-xs text-[--bday-ink-muted] mt-1 leading-relaxed">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Section 6: Polaroid / Sticker Photo Gallery (HIDE-IF-EMPTY) ────── */}
      {data.gallery && data.gallery.length > 0 && (
        <section aria-label="Party Gallery" className="py-16 sm:py-24 px-6 bg-[--bday-bg-alt]">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <span className="text-xs font-black uppercase tracking-widest text-[--bday-purple]">
                Memories &amp; Moments
              </span>
              <h2
                className="text-3xl sm:text-4xl font-black text-[--bday-ink] mt-1"
                style={{ fontFamily: FF_DISPLAY }}
              >
                Photo Gallery
              </h2>
            </div>

            <BirthdayGallery images={data.gallery} />
          </div>
        </section>
      )}

      {/* ── Section 7: Location & Directions (HIDE-IF-EMPTY) ────────────────── */}
      {hasVenueInfo && (
        <section aria-label="Venue and Location" className="py-16 px-6 bg-[--bday-bg]">
          <div className="max-w-3xl mx-auto">
            <div className="p-8 rounded-3xl bg-white border-3 border-[--bday-ink] shadow-[6px_6px_0px_0px_#141218] space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <span className="text-xs font-black uppercase tracking-widest text-[--bday-coral]">
                    Party Venue
                  </span>
                  <h3
                    className="text-2xl sm:text-3xl font-black text-[--bday-ink] mt-0.5"
                    style={{ fontFamily: FF_DISPLAY }}
                  >
                    {data.venue || "Event Location"}
                  </h3>
                  {(data.address || data.city) && (
                    <p className="text-sm font-medium text-[--bday-ink-muted] mt-0.5">
                      {[data.address, data.city].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>

                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    [data.venue, data.address, data.city].filter(Boolean).join(", ")
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-5 py-2.5 rounded-xl bg-[--bday-yellow] border-2 border-[--bday-ink] text-xs font-black uppercase tracking-wider text-[--bday-ink] shadow-[3px_3px_0px_0px_#141218] hover:translate-y-0.5 transition-all inline-flex items-center gap-1.5 shrink-0"
                >
                  <span>Get Directions</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {hasMapCoordinates && (
                <div className="rounded-2xl overflow-hidden border-2 border-[--bday-ink]">
                  <VenueMapClient
                    lat={data.latitude}
                    lng={data.longitude}
                    title={data.title}
                    venue={data.venue}
                    city={data.city}
                    address={data.address}
                  />
                </div>
              )}

              {data.parkingNotes && (
                <p className="text-xs text-[--bday-ink-muted] font-medium bg-[--bday-bg-alt] p-3 rounded-xl">
                  🚗 {data.parkingNotes}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Section 8: VIP Party Pass & RSVP ────────────────────────────────── */}
      <section
        id="rsvp-section"
        aria-label="Birthday RSVP and Party Pass"
        className="py-16 sm:py-24 px-6 bg-[--bday-bg-alt]"
      >
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-xs font-black uppercase tracking-widest text-[--bday-indigo]">
              Claim Your Spot
            </span>
            <h2
              className="text-3xl sm:text-5xl font-black text-[--bday-ink] mt-1"
              style={{ fontFamily: FF_DISPLAY }}
            >
              RSVP &amp; Party Pass
            </h2>
            <p className="mt-2 text-xs sm:text-sm font-semibold text-[--bday-ink-muted]">
              Confirm below to get your digital party pass and admission QR code!
            </p>
          </div>

          {/* Chunky Party Pass Ticket */}
          <div className="p-8 sm:p-10 rounded-3xl bg-white border-3 border-[--bday-ink] shadow-[8px_8px_0px_0px_#141218] text-center space-y-6">
            <div>
              <span className="inline-block px-3 py-1 rounded-full bg-[--bday-yellow] border border-[--bday-ink] text-[10px] font-black uppercase tracking-widest text-[--bday-ink]">
                {isVipGuest ? "⭐ VIP Party Pass ⭐" : "Official Party Pass"}
              </span>
              <h3
                className="text-3xl sm:text-4xl font-black text-[--bday-ink] mt-2"
                style={{ fontFamily: FF_DISPLAY }}
              >
                {data.guest.name}
              </h3>
              {(data.guest.title || data.guest.organization) && (
                <p className="text-xs font-semibold text-[--bday-ink-muted] mt-1">
                  {[data.guest.title, data.guest.organization].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>

            {/* Seat assignment (if provided) */}
            {data.seat && (
              <div className="p-2.5 rounded-xl bg-[--bday-mint] border border-[--bday-ink] inline-block">
                <span className="text-xs font-extrabold text-[--bday-ink]">
                  🎉 Table: {data.seat.label}
                  {data.seat.tableName && ` (${data.seat.tableName})`}
                </span>
              </div>
            )}

            {/* RSVP Feedback Banner */}
            {rsvpFeedback && (
              <div
                className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 border-2 border-[--bday-ink] shadow-[2px_2px_0px_0px_#141218] ${
                  rsvpFeedback.type === "success"
                    ? "bg-[--bday-mint] text-[--bday-ink]"
                    : "bg-[--bday-coral] text-white"
                }`}
              >
                {rsvpFeedback.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{rsvpFeedback.text}</span>
              </div>
            )}

            {/* RSVP Buttons */}
            <div className="space-y-3 pt-2">
              <p className="text-xs font-black uppercase tracking-wider text-[--bday-ink]">
                Are you coming to celebrate?
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-sm mx-auto">
                <button
                  type="button"
                  onClick={() => handleRsvpAction("accepted")}
                  disabled={submittingRsvp || currentRsvp === "accepted"}
                  className="py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 border-2 border-[--bday-ink] shadow-[3px_3px_0px_0px_#141218]"
                  style={{
                    background: currentRsvp === "accepted" ? "#06D6A0" : "#FF5E5B",
                    color: currentRsvp === "accepted" ? "#141218" : "#FFFFFF",
                  }}
                >
                  {submittingRsvp ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>{currentRsvp === "accepted" ? "Attending! 🎉" : "Count Me In! 🎉"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleRsvpAction("declined")}
                  disabled={submittingRsvp || currentRsvp === "declined"}
                  className="py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 border-2 border-[--bday-ink] shadow-[3px_3px_0px_0px_#141218] bg-white text-[--bday-ink-muted]"
                  style={{
                    textDecoration: currentRsvp === "declined" ? "line-through" : "none",
                  }}
                >
                  {submittingRsvp ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  <span>{currentRsvp === "declined" ? "Declined 😢" : "Can't Make It 😢"}</span>
                </button>
              </div>
            </div>

            {/* Canvas QR Pass */}
            {data.ticketInstance?.qrCode && currentRsvp !== "declined" && (
              <div className="pt-4 border-t-2 border-dashed border-[--bday-ink]">
                <div className="p-3 bg-[--bday-yellow] rounded-2xl border-2 border-[--bday-ink] inline-block shadow-[3px_3px_0px_0px_#141218]">
                  <BirthdayCanvasQR value={data.ticketInstance.qrCode} size={150} />
                </div>
                <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-[--bday-ink]">
                  Scan at Door for Admission
                </p>
              </div>
            )}

            {/* Calendar & Share links */}
            <div className="pt-4 border-t-2 border-[--bday-ink] flex flex-wrap items-center justify-center gap-3 text-xs font-black">
              <button
                type="button"
                onClick={downloadIcsFile}
                className="px-3 py-1.5 rounded-lg bg-[--bday-yellow] border border-[--bday-ink] flex items-center gap-1 shadow-[2px_2px_0px_0px_#141218]"
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                <span>iCal</span>
              </button>
              <a
                href={getGoogleCalendarUrl()}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-lg bg-[--bday-mint] border border-[--bday-ink] flex items-center gap-1 shadow-[2px_2px_0px_0px_#141218]"
              >
                <span>Google Cal</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                type="button"
                onClick={handleShare}
                className="px-3 py-1.5 rounded-lg bg-white border border-[--bday-ink] flex items-center gap-1 shadow-[2px_2px_0px_0px_#141218]"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{copiedLink ? "Copied!" : "Share"}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="py-12 border-t-2 border-[--bday-ink] text-center text-xs font-bold text-[--bday-ink-muted] space-y-1 bg-[--bday-bg]">
        <p className="text-[--bday-ink]">
          {data.title}
          {data.city ? ` · ${data.city}` : ""}
        </p>
        <p>
          Powered by <span className="font-extrabold text-[--bday-coral]">Aldriva</span> Birthday
          Invitations
        </p>
      </footer>
    </div>
  );
}

// ── Micro-components ──────────────────────────────────────────────────────────

function BirthdayCanvasQR({ value, size = 150 }: { value: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    import("qrcode")
      .then((QRCode) => {
        if (!canvasRef.current) return;
        QRCode.toCanvas(canvasRef.current, value, {
          width: size,
          margin: 1,
          color: {
            dark: "#141218",
            light: "#FFFFFF",
          },
        }).catch(() => {});
      })
      .catch(() => {});
  }, [value, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      aria-label="Birthday QR Pass"
      className="rounded-xl"
    />
  );
}

// ── Birthday Countdown Ticker with Lining Numbers ────────────────────────────
function BirthdayCountdownTicker({
  targetDate,
  timezone,
}: {
  targetDate: string;
  timezone?: string | null;
}) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isPast: boolean;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0, isPast: false });

  useEffect(() => {
    function compute() {
      const now = Date.now();
      const target = new Date(targetDate).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true });
        return;
      }

      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
        isPast: false,
      });
    }

    compute();
    const interval = setInterval(compute, 1000);
    return () => clearInterval(interval);
  }, [targetDate, timezone]);

  if (timeLeft.isPast) {
    return (
      <p className="text-base font-black text-[--bday-yellow]">
        🎉 It&apos;s Party Time! The celebration is live! 🎉
      </p>
    );
  }

  const units = [
    { label: "Days", value: timeLeft.days },
    { label: "Hours", value: timeLeft.hours },
    { label: "Minutes", value: timeLeft.minutes },
    { label: "Seconds", value: timeLeft.seconds },
  ];

  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-4 max-w-sm sm:max-w-md mx-auto">
      {units.map((unit, idx) => (
        <div
          key={idx}
          className="p-3 sm:p-4 rounded-2xl bg-white text-[--bday-ink] border-2 border-[--bday-ink] shadow-[4px_4px_0px_0px_#141218] flex flex-col items-center"
        >
          <span
            className="tabular-nums lining-nums font-black text-2xl sm:text-4xl leading-none"
            style={{
              fontFamily: FF_DISPLAY,
              fontVariantNumeric: "lining-nums tabular-nums",
              fontFeatureSettings: '"lnum" 1, "tnum" 1',
            }}
          >
            {String(unit.value).padStart(2, "0")}
          </span>
          <span className="mt-3 text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-[--bday-coral]">
            {unit.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Polaroid / Sticker Gallery with Lightbox ─────────────────────────────────
function BirthdayGallery({ images }: { images: InvitationGalleryItem[] }) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const touchStartX = useRef<number | null>(null);

  const handleNext = useCallback(() => {
    setActiveIdx((prev) => (prev !== null ? (prev < images.length - 1 ? prev + 1 : 0) : null));
  }, [images.length]);

  const handlePrev = useCallback(() => {
    setActiveIdx((prev) => (prev !== null ? (prev > 0 ? prev - 1 : images.length - 1) : null));
  }, [images.length]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (activeIdx === null) return;
      if (e.key === "Escape") setActiveIdx(null);
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIdx, handleNext, handlePrev]);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (diff > 40) handlePrev();
    if (diff < -40) handleNext();
    touchStartX.current = null;
  }

  const rotations = ["rotate-1", "-rotate-1.5", "rotate-2", "-rotate-1", "rotate-1.5"];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
        {images.map((img, idx) => {
          const rotClass = rotations[idx % rotations.length];
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveIdx(idx)}
              className={`p-3 pb-6 rounded-2xl bg-white border-2 border-[--bday-ink] shadow-[4px_4px_0px_0px_#141218] ${rotClass} motion-reduce:rotate-0 hover:rotate-0 hover:scale-[1.02] transition-all cursor-pointer text-left relative`}
            >
              {/* Tape sticker at top */}
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-10 h-4 bg-[--bday-yellow]/80 border border-[--bday-ink]/30 shadow-xs z-10" />

              <div className="relative aspect-square rounded-xl overflow-hidden bg-zinc-100">
                <Image
                  src={img.url}
                  alt={img.alt || img.caption || `Party memory ${idx + 1}`}
                  fill
                  sizes="(max-width: 768px) 50vw, 33vw"
                  className="object-cover"
                />
              </div>

              {img.caption && (
                <p className="mt-2 text-xs font-bold text-[--bday-ink] truncate text-center">
                  {img.caption}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Lightbox Modal */}
      {activeIdx !== null && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm touch-none select-none"
          onClick={() => setActiveIdx(null)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <button
            type="button"
            onClick={() => setActiveIdx(null)}
            className="absolute top-4 right-4 p-3 rounded-full text-white bg-white/10 hover:bg-white/20 z-50"
            aria-label="Close photo preview"
          >
            <X className="w-5 h-5" />
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrev();
                }}
                className="absolute left-3 sm:left-6 p-3 rounded-full text-white bg-white/10 hover:bg-white/20 z-50 hidden sm:block"
                aria-label="Previous image"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNext();
                }}
                className="absolute right-3 sm:right-6 p-3 rounded-full text-white bg-white/10 hover:bg-white/20 z-50 hidden sm:block"
                aria-label="Next image"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          <div
            className="relative max-w-3xl max-h-[85vh] w-full h-full flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative w-full h-[70vh]">
              <Image
                src={images[activeIdx].url}
                alt={images[activeIdx].alt || images[activeIdx].caption || "Party preview"}
                fill
                sizes="100vw"
                className="object-contain"
              />
            </div>
            {images[activeIdx].caption && (
              <p className="mt-3 text-center text-xs text-white/90 max-w-md font-bold">
                {images[activeIdx].caption}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Floating Birthday Music Player ───────────────────────────────────────────
function FloatingBirthdayMusic({ audioUrl, title }: { audioUrl: string; title?: string | null }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    function handleVisibility() {
      if (document.hidden && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  function togglePlay() {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      sessionStorage.setItem("aldriva_invitation_music", "paused");
    } else {
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          sessionStorage.setItem("aldriva_invitation_music", "playing");
        })
        .catch(() => {
          setIsPlaying(false);
        });
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <audio ref={audioRef} src={audioUrl} loop preload="none" />
      <button
        type="button"
        onClick={togglePlay}
        className="flex items-center gap-2 px-3.5 py-2 rounded-2xl border-2 border-[--bday-ink] shadow-[3px_3px_0px_0px_#141218] bg-[--bday-yellow] text-[--bday-ink] transition-all text-xs font-black"
        aria-label={isPlaying ? "Pause party music" : "Play party music"}
      >
        {isPlaying ? (
          <Volume2 className="w-4 h-4 text-[--bday-coral]" />
        ) : (
          <VolumeX className="w-4 h-4 text-[--bday-ink]" />
        )}
        <span className="uppercase tracking-wider hidden sm:inline max-w-[120px] truncate">
          {isPlaying ? (title || "Party Beats") : "Music"}
        </span>
        {isPlaying && (
          <span className="flex items-end gap-0.5 h-3">
            <span className="w-0.5 h-3 bg-[--bday-coral] animate-bounce" />
            <span className="w-0.5 h-2 bg-[--bday-coral] animate-bounce delay-75" />
            <span className="w-0.5 h-3 bg-[--bday-coral] animate-bounce delay-150" />
          </span>
        )}
      </button>
    </div>
  );
}
