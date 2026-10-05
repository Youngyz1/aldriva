"use client";

/**
 * components/invitation/templates/InvitationTemplateWedding.tsx
 *
 * Wedding Invitation Template — "Romantic"
 *
 * Design Decisions:
 * - Palette: Soft blush (#E8D5CE, #D4B2A7) and muted sage (#7C9082, #5A6B5C) on cream (#FAF8F5),
 *   with deep espresso-plum ink (#2C2220) and warm rose accent (#A37068).
 * - Typography: Great_Vibes calligraphic script for partner names and accents, paired with
 *   Playfair_Display serif for headlines and Lora for quiet body text.
 * - Hero Composition: Arch-shaped photo frame (rounded-t-[160px]), couple names centered
 *   above, "Together with their families" line, date/time/ceremony venue visible on 390x844.
 * - Multi-Venue: Dedicated Ceremony and Reception side-by-side / stacked cards using venues[].
 * - Colors of the Day: Interactive color swatch palette circles with names & dress code notes.
 * - Our Story: Alternating story milestones (image + text sequence).
 * - Gallery: Soft rounded photo-album styling with full lightbox & touch swipe support.
 * - RSVP: Formal wedding response card styling with canvas QR pass.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Image from "next/image";
import { Great_Vibes, Playfair_Display, Lora } from "next/font/google";
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
  Heart,
} from "lucide-react";
import {
  InvitationPageData,
  InvitationGalleryItem,
  InvitationScheduleItem,
  InvitationVenueItem,
} from "@/types/invitation-template";
import {
  getInvitationDictionary,
  formatLocalizedEventDate,
  InvitationLocale,
} from "@/lib/invitation-i18n";
import VenueMapClient from "@/components/VenueMapClient";

// ── Typography ────────────────────────────────────────────────────────────────
const scriptFont = Great_Vibes({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  variable: "--font-script",
});

const displayFont = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-display",
});

const bodyFont = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-body",
});

// ── Romantic Design Tokens ───────────────────────────────────────────────────
const WEDDING_VARS = {
  "--wed-bg": "#FAF8F5",
  "--wed-bg-alt": "#F3EFEA",
  "--wed-card-bg": "#FFFFFF",
  "--wed-ink": "#2C2220",
  "--wed-ink-muted": "#6B5C57",
  "--wed-ink-subtle": "#9E8E89",
  "--wed-blush": "#D4B2A7",
  "--wed-blush-light": "#F2E6E2",
  "--wed-sage": "#7C9082",
  "--wed-sage-light": "#E5EBE6",
  "--wed-rose": "#A37068",
  "--wed-gold": "#BFA06B",
  "--wed-rule": "#E5DED8",
} as const;

const FF_SCRIPT = `var(--font-script), 'Brush Script MT', cursive`;
const FF_DISPLAY = `var(--font-display), 'Playfair Display', Georgia, serif`;
const FF_BODY = `var(--font-body), 'Lora', Georgia, serif`;

interface Props {
  data: InvitationPageData;
  onRsvp?: (response: "accepted" | "declined") => Promise<void>;
  className?: string;
}

export function InvitationTemplateWedding({ data, onRsvp, className = "" }: Props) {
  const locale: InvitationLocale = data.locale || "en";
  const dict = useMemo(() => getInvitationDictionary(locale), [locale]);

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

  // ── 2. Localized Timezone-Aware Date & Time Formatter ────────────────────
  const { dateDisplay, timeDisplay } = useMemo(
    () => formatLocalizedEventDate(data.eventDate, locale, data.timezone),
    [data.eventDate, locale, data.timezone]
  );

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
            ? "Your joy has been received! We cannot wait to celebrate with you."
            : "Your response has been noted with warm appreciation. Thank you.",
      });
    } catch {
      setCurrentRsvp(response);
      setRsvpFeedback({
        type: "success",
        text:
          response === "accepted"
            ? "Attendance confirmed (preview mode)."
            : "Declined response recorded (preview mode).",
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
      : new Date(startDate.getTime() + 6 * 60 * 60 * 1000);

    const pad = (n: number) => (n < 10 ? "0" + n : String(n));
    const formatICSDate = (d: Date) =>
      `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

    const locationStr = [data.venue, data.address, data.city].filter(Boolean).join(", ");

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Aldriva//Wedding Invitation//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `SUMMARY:${data.title}`,
      `DESCRIPTION:Wedding Celebration of ${data.partner1Name || "Elena"} & ${data.partner2Name || "David"}`,
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
    a.download = `wedding-${data.title.toLowerCase().replace(/[^a-z0-9]/g, "-")}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getGoogleCalendarUrl() {
    if (!data.eventDate) return "#";
    const startDate = new Date(data.eventDate);
    const endDate = data.endDate
      ? new Date(data.endDate)
      : new Date(startDate.getTime() + 6 * 60 * 60 * 1000);

    const pad = (n: number) => (n < 10 ? "0" + n : String(n));
    const fmt = (d: Date) =>
      `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

    const details = `Wedding Celebration of ${data.partner1Name || "Elena"} & ${data.partner2Name || "David"}`;
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

  // ── 5. Wedding Subtype Headings & Defaults ─────────────────────────────────
  const subtypeWording = useMemo(() => {
    const stKey = data.weddingSubtype || "default";
    const conf = dict.subtypes[stKey] || dict.subtypes.default;
    return {
      eyebrow: conf.eyebrow,
      ceremonyLabel: conf.ceremony,
      receptionLabel: conf.reception,
    };
  }, [data.weddingSubtype, dict]);

  const coupleDisplay = useMemo(() => {
    if (data.partner1Name && data.partner2Name) {
      return { p1: data.partner1Name, p2: data.partner2Name };
    }
    // Fallback parsing from title if partner names not explicitly set
    if (data.title.includes("&")) {
      const parts = data.title.split("&");
      return { p1: parts[0].trim(), p2: parts[1].replace(/wedding|celebration/gi, "").trim() };
    }
    return { p1: data.partner1Name || data.title, p2: data.partner2Name || "" };
  }, [data.partner1Name, data.partner2Name, data.title]);

  const hasVenueInfo = Boolean(data.venue || data.address || data.city);
  const hasMapCoordinates = Boolean(data.latitude && data.longitude) || Boolean(data.address);
  const hasMultiVenue = Boolean(data.venues && data.venues.length > 0);

  const heroFocusStyle: React.CSSProperties = {
    objectPosition: data.heroImageFocus
      ? `${data.heroImageFocus.x}% ${data.heroImageFocus.y}%`
      : "50% 50%",
  };

  return (
    <div
      className={`min-h-screen antialiased overflow-x-hidden ${scriptFont.variable} ${displayFont.variable} ${bodyFont.variable} ${className}`}
      style={{
        ...WEDDING_VARS,
        background: "var(--wed-bg)",
        color: "var(--wed-ink)",
        fontFamily: FF_BODY,
      } as React.CSSProperties}
    >
      {/* Optional Background Music */}
      {data.musicAudioUrl && (
        <FloatingWeddingMusic audioUrl={data.musicAudioUrl} title={data.musicTitle} />
      )}

      {/* ── Section 1: Hero Composition (Arch Photo & Calligraphic Names) ──── */}
      <section
        aria-label="Wedding Hero"
        className="relative w-full pt-10 sm:pt-16 pb-16 px-4 sm:px-6 flex flex-col items-center text-center"
      >
        {/* Decorative Floral Top Motif */}
        <div className="flex items-center gap-3 justify-center mb-4">
          <div className="h-px w-12 sm:w-16" style={{ background: "var(--wed-rule)" }} />
          <span className="text-xs tracking-[0.25em] uppercase text-[--wed-rose] font-medium">
            {data.eyebrow || subtypeWording.eyebrow}
          </span>
          <div className="h-px w-12 sm:w-16" style={{ background: "var(--wed-rule)" }} />
        </div>

        {/* Couple Names in Script & Display */}
        <div className="max-w-2xl mx-auto px-2 mb-4">
          {coupleDisplay.p2 ? (
            <h1 className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-4 leading-tight">
              <span
                className="text-4xl sm:text-6xl text-[--wed-ink] tracking-normal"
                style={{ fontFamily: FF_SCRIPT }}
              >
                {coupleDisplay.p1}
              </span>
              <span
                className="text-xl sm:text-2xl text-[--wed-rose] italic"
                style={{ fontFamily: FF_DISPLAY }}
              >
                &amp;
              </span>
              <span
                className="text-4xl sm:text-6xl text-[--wed-ink] tracking-normal"
                style={{ fontFamily: FF_SCRIPT }}
              >
                {coupleDisplay.p2}
              </span>
            </h1>
          ) : (
            <h1
              className="text-3xl sm:text-5xl text-[--wed-ink] leading-tight font-medium"
              style={{ fontFamily: FF_DISPLAY }}
            >
              {data.title}
            </h1>
          )}

          {/* Family note (Hide-if-empty) */}
          {data.familyNote && (
            <p
              className="mt-3 text-xs sm:text-sm italic text-[--wed-ink-muted]"
              style={{ fontFamily: FF_BODY }}
            >
              {data.familyNote}
            </p>
          )}
        </div>

        {/* Arch Photo Frame (Distinctive Wedding Shape) */}
        <div className="relative my-6 w-full max-w-[320px] sm:max-w-[380px] aspect-[3/4] rounded-t-[160px] sm:rounded-t-[190px] rounded-b-2xl overflow-hidden border-4 border-white shadow-xl shadow-[--wed-blush]/30 bg-[--wed-bg-alt]">
          {data.heroImage ? (
            <Image
              src={data.heroImage}
              alt={data.heroImageAlt || data.title}
              fill
              priority
              sizes="(max-width: 640px) 320px, 380px"
              className="object-cover"
              style={heroFocusStyle}
            />
          ) : (
            /* Designed Fallback: Monogram Arch & Botanical Ornament */
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-[--wed-bg-alt] text-center">
              <div className="w-16 h-16 rounded-full border border-[--wed-blush] bg-white flex items-center justify-center text-[--wed-rose] mb-3 shadow-sm">
                <Heart className="w-7 h-7 fill-[--wed-blush-light] text-[--wed-rose]" />
              </div>
              <p className="text-3xl text-[--wed-ink]" style={{ fontFamily: FF_SCRIPT }}>
                {coupleDisplay.p1[0]} &amp; {coupleDisplay.p2 ? coupleDisplay.p2[0] : "A"}
              </p>
              <p
                className="text-xs uppercase tracking-widest text-[--wed-sage] mt-2 font-medium"
                style={{ fontFamily: FF_BODY }}
              >
                {data.city || "Wedding Celebration"}
              </p>
            </div>
          )}
        </div>

        {/* First Viewport Date / Time / Ceremony Line (Visible on 390x844 without scrolling) */}
        <div className="mt-2 space-y-1.5 max-w-md mx-auto">
          <p
            className="text-base sm:text-lg font-medium text-[--wed-ink]"
            style={{ fontFamily: FF_DISPLAY }}
          >
            {dateDisplay}
          </p>
          <p className="text-xs sm:text-sm text-[--wed-ink-muted]">
            {timeDisplay}
          </p>
          {hasVenueInfo && (
            <p className="text-xs sm:text-sm text-[--wed-ink-muted]">
              {[data.venue, data.city].filter(Boolean).join(" · ")}
            </p>
          )}

          {data.hashtag && (
            <p className="pt-2 text-xs tracking-wider text-[--wed-rose] font-medium">
              {data.hashtag}
            </p>
          )}
        </div>
      </section>

      {/* ── Section 2: Welcome / Guest Greeting ────────────────────────────── */}
      <section
        aria-label="Welcome and Guest Message"
        className="py-14 sm:py-20 px-6 bg-[--wed-bg-alt]"
      >
        <div className="max-w-2xl mx-auto text-center">
          {/* Personalized Greeting */}
          <p
            className="text-[10px] tracking-[0.3em] uppercase text-[--wed-rose] font-semibold mb-2"
            style={{ fontFamily: FF_BODY }}
          >
            {isVipGuest ? "Honored Wedding Guest" : "Dearest"}
          </p>
          <h2
            className="text-2xl sm:text-3xl text-[--wed-ink] font-medium mb-2"
            style={{ fontFamily: FF_DISPLAY, fontStyle: "italic" }}
          >
            {data.guest.name}
          </h2>
          {(data.guest.title || data.guest.organization) && (
            <p className="text-xs text-[--wed-ink-muted] mb-6">
              {[data.guest.title, data.guest.organization].filter(Boolean).join(" · ")}
            </p>
          )}

          <WeddingHairline />

          <h3
            className="text-xl sm:text-2xl text-[--wed-ink] font-medium mt-6 mb-4"
            style={{ fontFamily: FF_DISPLAY }}
          >
            {data.storyHeadline || "A Message of Welcome"}
          </h3>

          <div
            className="text-sm sm:text-base leading-[1.85] text-[--wed-ink-muted] max-w-xl mx-auto space-y-4"
            style={{ fontFamily: FF_BODY }}
          >
            <p className="whitespace-pre-line">
              {data.storyText ||
                "With grateful hearts, we invite you to share in our joy as we begin this new chapter. Your love and friendship have shaped our lives, and we could not imagine this celebration without you."}
            </p>
          </div>
        </div>
      </section>

      {/* ── Section 3: Our Story (Alternating Milestones) ──────────────────── */}
      {(data.weddingStory && data.weddingStory.length > 0) ? (
        <section aria-label="Our Story" className="py-16 sm:py-24 px-6 bg-[--wed-bg]">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <WeddingLabel>Chapter By Chapter</WeddingLabel>
              <h2
                className="text-2xl sm:text-3xl text-[--wed-ink] font-medium"
                style={{ fontFamily: FF_DISPLAY }}
              >
                Our Story
              </h2>
            </div>

            <div className="space-y-12">
              {data.weddingStory.map((storyItem, idx) => {
                const isEven = idx % 2 === 0;
                return (
                  <div
                    key={idx}
                    className={`flex flex-col ${
                      isEven ? "md:flex-row" : "md:flex-row-reverse"
                    } items-center gap-6 sm:gap-10 p-6 rounded-2xl bg-white border border-[--wed-rule] shadow-sm`}
                  >
                    {storyItem.image && (
                      <div className="relative w-full md:w-1/2 aspect-[4/3] rounded-xl overflow-hidden shadow-inner shrink-0">
                        <Image
                          src={storyItem.image}
                          alt={storyItem.title || "Story moment"}
                          fill
                          sizes="(max-width: 768px) 100vw, 360px"
                          className="object-cover"
                        />
                      </div>
                    )}
                    <div className="flex-1 text-center md:text-left space-y-2">
                      {storyItem.title && (
                        <h3
                          className="text-lg sm:text-xl font-medium text-[--wed-ink]"
                          style={{ fontFamily: FF_DISPLAY }}
                        >
                          {storyItem.title}
                        </h3>
                      )}
                      <p
                        className="text-xs sm:text-sm text-[--wed-ink-muted] leading-relaxed whitespace-pre-line"
                        style={{ fontFamily: FF_BODY }}
                      >
                        {storyItem.text}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : data.storyImage ? (
        <section aria-label="Couple Portrait" className="py-12 px-6 bg-[--wed-bg]">
          <div className="max-w-md mx-auto aspect-[4/5] relative rounded-2xl overflow-hidden shadow-lg border-4 border-white">
            <Image
              src={data.storyImage}
              alt="Couple portrait"
              fill
              sizes="(max-width: 640px) 100vw, 448px"
              className="object-cover"
            />
          </div>
        </section>
      ) : null}

      {/* ── Section 4: Countdown (Lining Numerals, Tabular) ────────────────── */}
      <section aria-label="Wedding Countdown" className="py-14 sm:py-20 px-6 bg-[--wed-bg-alt]">
        <div className="max-w-2xl mx-auto text-center">
          <WeddingLabel>Counting Down to the Big Day</WeddingLabel>
          <WeddingCountdownTicker targetDate={data.eventDate} timezone={data.timezone} />
        </div>
      </section>

      {/* ── Section 5: Venues (Ceremony & Reception) ───────────────────────── */}
      {(hasMultiVenue || hasVenueInfo) && (
        <section aria-label="Wedding Locations" className="py-16 sm:py-24 px-6 bg-[--wed-bg]">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <WeddingLabel>When &amp; Where</WeddingLabel>
              <h2
                className="text-2xl sm:text-3xl text-[--wed-ink] font-medium"
                style={{ fontFamily: FF_DISPLAY }}
              >
                Ceremony &amp; Celebration
              </h2>
            </div>

            {hasMultiVenue && data.venues ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                {data.venues.map((venue: InvitationVenueItem, idx: number) => (
                  <div
                    key={idx}
                    className="p-6 sm:p-8 rounded-2xl bg-white border border-[--wed-rule] shadow-sm flex flex-col justify-between text-center space-y-4"
                  >
                    <div>
                      <span className="inline-block text-[10px] tracking-[0.25em] uppercase text-[--wed-rose] font-semibold mb-2">
                        {venue.label || (idx === 0 ? subtypeWording.ceremonyLabel : subtypeWording.receptionLabel)}
                      </span>
                      <h3
                        className="text-xl font-medium text-[--wed-ink]"
                        style={{ fontFamily: FF_DISPLAY }}
                      >
                        {venue.name}
                      </h3>
                      {venue.address && (
                        <p className="mt-1 text-xs sm:text-sm text-[--wed-ink-muted]">
                          {venue.address}
                        </p>
                      )}
                    </div>

                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        [venue.name, venue.address].filter(Boolean).join(", ")
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 text-xs tracking-wider uppercase text-[--wed-sage] hover:underline font-semibold"
                    >
                      <span>Directions</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              /* Single venue fallback */
              <div className="max-w-2xl mx-auto p-8 rounded-2xl bg-white border border-[--wed-rule] shadow-sm text-center space-y-4">
                <h3
                  className="text-2xl font-medium text-[--wed-ink]"
                  style={{ fontFamily: FF_DISPLAY }}
                >
                  {data.venue || "Wedding Venue"}
                </h3>
                {(data.address || data.city) && (
                  <p className="text-sm text-[--wed-ink-muted]">
                    {[data.address, data.city].filter(Boolean).join(", ")}
                  </p>
                )}
                {hasMapCoordinates && (
                  <div className="mt-4 rounded-xl overflow-hidden border border-[--wed-rule]">
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
                  <p className="text-xs text-[--wed-ink-muted] mt-3">
                    {data.parkingNotes}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Section 6: Colors of the Day & Attire (HIDE-IF-EMPTY) ─────────── */}
      {(data.colorsOfTheDay || data.dressCode) && (
        <section
          aria-label="Attire and Colors"
          className="py-14 sm:py-20 px-6 bg-[--wed-bg-alt]"
        >
          <div className="max-w-2xl mx-auto text-center space-y-6">
            <WeddingLabel>{dict.attireGuidelines}</WeddingLabel>

            {data.dressCode && (
              <div>
                <h3
                  className="text-xl sm:text-2xl text-[--wed-ink] font-medium"
                  style={{ fontFamily: FF_DISPLAY }}
                >
                  {data.dressCode}
                </h3>
                {data.dressCodeNotes && (
                  <p className="mt-2 text-xs sm:text-sm text-[--wed-ink-muted] max-w-md mx-auto leading-relaxed">
                    {data.dressCodeNotes}
                  </p>
                )}
              </div>
            )}

            {/* Color swatches */}
            {data.colorsOfTheDay && data.colorsOfTheDay.length > 0 && (
              <div className="pt-4">
                <p className="text-xs uppercase tracking-widest text-[--wed-ink-subtle] mb-4">
                  {dict.colorsOfTheDay}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
                  {data.colorsOfTheDay.map((color, cIdx) => (
                    <div key={cIdx} className="flex flex-col items-center gap-1.5">
                      <div
                        className="w-10 h-10 rounded-full border-2 border-white shadow-md transition-transform hover:scale-110"
                        style={{ backgroundColor: color.hex }}
                        title={color.name || color.hex}
                      />
                      {color.name && (
                        <span className="text-[10px] text-[--wed-ink-muted] tracking-wide">
                          {color.name}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Section 7: Schedule / Timeline (HIDE-IF-EMPTY) ─────────────────── */}
      {data.schedule && data.schedule.length > 0 && (
        <section aria-label="Order of Events" className="py-16 sm:py-24 px-6 bg-[--wed-bg]">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-12">
              <WeddingLabel>{dict.timeline}</WeddingLabel>
              <h2
                className="text-2xl sm:text-3xl text-[--wed-ink] font-medium"
                style={{ fontFamily: FF_DISPLAY }}
              >
                {dict.orderOfEvents}
              </h2>
            </div>

            <WeddingScheduleView schedule={data.schedule} />
          </div>
        </section>
      )}

      {/* ── Section 8: Photo Album Gallery (HIDE-IF-EMPTY) ─────────────────── */}
      {data.gallery && data.gallery.length > 0 && (
        <section aria-label="Photo Album" className="py-16 sm:py-24 px-6 bg-[--wed-bg-alt]">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <WeddingLabel>{dict.capturedMoments}</WeddingLabel>
              <h2
                className="text-2xl sm:text-3xl text-[--wed-ink] font-medium"
                style={{ fontFamily: FF_DISPLAY }}
              >
                {dict.galleryAndMemories}
              </h2>
            </div>

            <WeddingGallery images={data.gallery} />
          </div>
        </section>
      )}

      {/* ── Section 9: Registry & Accommodations (HIDE-IF-EMPTY) ───────────── */}
      {(data.registryNote || (data.accommodations && data.accommodations.length > 0)) && (
        <section aria-label="Registry and Lodging" className="py-16 px-6 bg-[--wed-bg]">
          <div className="max-w-2xl mx-auto space-y-12 text-center">
            {data.registryNote && (
              <div className="p-8 rounded-2xl bg-white border border-[--wed-rule] shadow-sm space-y-3">
                <div className="w-10 h-10 rounded-full bg-[--wed-blush-light] text-[--wed-rose] flex items-center justify-center mx-auto">
                  <Gift className="w-5 h-5" />
                </div>
                <h3
                  className="text-xl font-medium text-[--wed-ink]"
                  style={{ fontFamily: FF_DISPLAY }}
                >
                  {dict.giftRegistry}
                </h3>
                <p className="text-xs sm:text-sm text-[--wed-ink-muted] leading-relaxed max-w-md mx-auto whitespace-pre-line">
                  {data.registryNote}
                </p>
              </div>
            )}

            {data.accommodations && data.accommodations.length > 0 && (
              <div>
                <WeddingLabel>{dict.whereToStay}</WeddingLabel>
                <h3
                  className="text-xl font-medium text-[--wed-ink] mb-6"
                  style={{ fontFamily: FF_DISPLAY }}
                >
                  {dict.recommendedAccommodations}
                </h3>
                <div className="space-y-4">
                  {data.accommodations.map((hotel, hIdx) => (
                    <div
                      key={hIdx}
                      className="p-4 rounded-xl bg-white border border-[--wed-rule] flex items-center justify-between gap-4 text-left"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[--wed-ink]">{hotel.name}</p>
                        {hotel.notes && (
                          <p className="text-xs text-[--wed-ink-muted] mt-0.5">{hotel.notes}</p>
                        )}
                      </div>
                      {hotel.bookingUrl && (
                        <a
                          href={hotel.bookingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-xs tracking-wider uppercase text-[--wed-rose] font-semibold hover:underline flex items-center gap-1"
                        >
                          {dict.book} <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Section 10: Response Card (RSVP & Pass) ────────────────────────── */}
      <section
        id="rsvp-section"
        aria-label="Wedding Response Card"
        className="py-16 sm:py-24 px-6 bg-[--wed-bg-alt]"
      >
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-10">
            <WeddingLabel>{dict.kindlyRespond}</WeddingLabel>
            <h2
              className="text-2xl sm:text-4xl text-[--wed-ink] font-medium"
              style={{ fontFamily: FF_DISPLAY }}
            >
              {dict.yourInvitationAndRsvp}
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-[--wed-ink-muted]">
              {dict.kindlyRespond}
            </p>
          </div>

          {/* Formal Response Card Envelope/Card */}
          <div className="p-8 sm:p-10 rounded-2xl bg-white border-2 border-[--wed-blush]/40 shadow-xl text-center space-y-6">
            <div>
              <span className="text-[10px] tracking-[0.25em] uppercase text-[--wed-rose] font-semibold">
                {isVipGuest ? dict.honoredWeddingGuest : dict.officialResponse}
              </span>
              <h3
                className="text-2xl sm:text-3xl text-[--wed-ink] font-medium mt-1"
                style={{ fontFamily: FF_DISPLAY, fontStyle: "italic" }}
              >
                {data.guest.name}
              </h3>
              {(data.guest.title || data.guest.organization) && (
                <p className="text-xs text-[--wed-ink-muted] mt-0.5">
                  {[data.guest.title, data.guest.organization].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>

            {/* Seat assignment */}
            {data.seat && (
              <div className="py-2.5 px-4 rounded-xl bg-[--wed-bg-alt] inline-block">
                <span className="text-xs font-semibold text-[--wed-rose] tracking-wide">
                  {dict.assignedSeat}: {data.seat.label}
                  {data.seat.tableName && ` (${data.seat.tableName})`}
                </span>
              </div>
            )}

            {/* RSVP Feedback Banner */}
            {rsvpFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-medium flex items-center justify-center gap-2 ${
                  rsvpFeedback.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-rose-50 text-rose-800 border border-rose-200"
                }`}
              >
                {rsvpFeedback.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="w-4 h-4 shrink-0 text-rose-600" />
                )}
                <span>{rsvpFeedback.text}</span>
              </div>
            )}

            {/* Interactive RSVP Decision */}
            <div className="space-y-3 pt-2">
              <p className="text-xs uppercase tracking-wider text-[--wed-ink-subtle] font-medium">
                {dict.willYouCelebrate}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-sm mx-auto">
                <button
                  type="button"
                  onClick={() => handleRsvpAction("accepted")}
                  disabled={submittingRsvp || currentRsvp === "accepted"}
                  className="py-3 px-4 rounded-xl text-xs uppercase tracking-wider font-semibold transition-all flex items-center justify-center gap-2 border"
                  style={{
                    background:
                      currentRsvp === "accepted" ? "var(--wed-rose)" : "transparent",
                    color: currentRsvp === "accepted" ? "#FFFFFF" : "var(--wed-ink)",
                    borderColor:
                      currentRsvp === "accepted" ? "var(--wed-rose)" : "var(--wed-rule)",
                  }}
                >
                  {submittingRsvp ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {currentRsvp === "accepted" ? dict.joyfullyAttending : dict.joyfullyAccept}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleRsvpAction("declined")}
                  disabled={submittingRsvp || currentRsvp === "declined"}
                  className="py-3 px-4 rounded-xl text-xs uppercase tracking-wider font-semibold transition-all flex items-center justify-center gap-2 border"
                  style={{
                    background: "transparent",
                    color:
                      currentRsvp === "declined"
                        ? "var(--wed-ink-subtle)"
                        : "var(--wed-ink-muted)",
                    borderColor: "var(--wed-rule)",
                    textDecoration: currentRsvp === "declined" ? "line-through" : "none",
                  }}
                >
                  {submittingRsvp ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {currentRsvp === "declined" ? dict.regretfullyDeclined : dict.regretfullyDecline}
                  </span>
                </button>
              </div>
            </div>

            {/* Canvas QR Code Pass */}
            {data.ticketInstance?.qrCode && currentRsvp !== "declined" && (
              <div className="pt-4 border-t border-[--wed-rule]">
                <div className="p-3 bg-[--wed-bg-alt] rounded-xl inline-block shadow-inner">
                  <WeddingCanvasQR value={data.ticketInstance.qrCode} size={150} />
                </div>
                <p className="mt-2 text-[9px] uppercase tracking-widest text-[--wed-ink-subtle]">
                  {dict.scanForAdmission}
                </p>
              </div>
            )}

            {/* Calendar & Share links */}
            <div className="pt-4 border-t border-[--wed-rule] flex flex-wrap items-center justify-center gap-4 text-xs">
              <button
                type="button"
                onClick={downloadIcsFile}
                className="inline-flex items-center gap-1.5 text-[--wed-rose] uppercase tracking-wider font-semibold hover:underline"
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                <span>{dict.downloadIcal}</span>
              </button>
              <span className="text-[--wed-rule]">·</span>
              <a
                href={getGoogleCalendarUrl()}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[--wed-rose] uppercase tracking-wider font-semibold hover:underline"
              >
                <span>{dict.googleCalendar}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <span className="text-[--wed-rule]">·</span>
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex items-center gap-1.5 text-[--wed-rose] uppercase tracking-wider font-semibold hover:underline"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{copiedLink ? dict.copiedLink : dict.share}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="py-12 border-t border-[--wed-rule] text-center text-xs text-[--wed-ink-subtle] space-y-1 bg-[--wed-bg]">
        <p className="text-[--wed-ink-muted] font-medium">
          {coupleDisplay.p1} {coupleDisplay.p2 ? `& ${coupleDisplay.p2}` : ""}
          {data.city ? ` · ${data.city}` : ""}
        </p>
        <p>{dict.poweredByAldriva}</p>
      </footer>
    </div>
  );
}

// ── Wedding Micro-Components ──────────────────────────────────────────────────

function WeddingHairline() {
  return (
    <div className="flex items-center gap-4 justify-center my-4">
      <div className="h-px flex-1 max-w-[60px]" style={{ background: "var(--wed-rule)" }} />
      <span className="text-[--wed-rose] text-xs">❦</span>
      <div className="h-px flex-1 max-w-[60px]" style={{ background: "var(--wed-rule)" }} />
    </div>
  );
}

function WeddingLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[10px] tracking-[0.28em] uppercase text-[--wed-rose] font-semibold mb-2"
      style={{ fontFamily: FF_BODY }}
    >
      {children}
    </p>
  );
}

function WeddingCanvasQR({ value, size = 150 }: { value: string; size?: number }) {
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
            dark: "#2C2220",
            light: "#FAF8F5",
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
      aria-label="Wedding QR code pass"
      className="rounded-lg"
    />
  );
}

// ── Countdown with Lining Numerals & Consistent Baseline ─────────────────────
function WeddingCountdownTicker({
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
      <p className="text-sm italic text-[--wed-ink-muted]">
        The wedding celebration has arrived!
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
    <div className="grid grid-cols-4 gap-3 sm:gap-6 max-w-sm sm:max-w-md mx-auto">
      {units.map((unit, idx) => (
        <div key={idx} className="flex flex-col items-center">
          <span
            className="tabular-nums lining-nums leading-none font-semibold text-[--wed-ink]"
            style={{
              fontFamily: FF_DISPLAY,
              fontSize: "clamp(2.2rem, 5.5vw, 3.5rem)",
              fontVariantNumeric: "lining-nums tabular-nums",
              fontFeatureSettings: '"lnum" 1, "tnum" 1',
            }}
          >
            {String(unit.value).padStart(2, "0")}
          </span>
          <span
            className="mt-3 text-[9px] uppercase tracking-[0.25em] text-[--wed-ink-subtle] font-medium"
            style={{ fontFamily: FF_BODY }}
          >
            {unit.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Wedding Schedule Subcomponent ───────────────────────────────────────────
function WeddingScheduleView({ schedule }: { schedule: InvitationScheduleItem[] }) {
  const hasDayGrouping = schedule.some((item) => Boolean(item.day));

  if (!hasDayGrouping) {
    return (
      <div className="space-y-6 border-l-2 border-[--wed-blush] ml-4 pl-6">
        {schedule.map((item, idx) => (
          <WeddingScheduleItemCard key={idx} item={item} />
        ))}
      </div>
    );
  }

  const groups = schedule.reduce((acc, item) => {
    const key = item.day || "Wedding Day";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, InvitationScheduleItem[]>);

  return (
    <div className="space-y-10">
      {Object.entries(groups).map(([dayLabel, items], gIdx) => (
        <div key={gIdx}>
          <p className="text-xs uppercase tracking-widest text-[--wed-rose] font-semibold mb-4 ml-4">
            {dayLabel}
          </p>
          <div className="space-y-6 border-l-2 border-[--wed-blush] ml-4 pl-6">
            {items.map((item, idx) => (
              <WeddingScheduleItemCard key={idx} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function WeddingScheduleItemCard({ item }: { item: InvitationScheduleItem }) {
  return (
    <div className="relative">
      <div className="absolute -left-[31px] top-1.5 w-3 h-3 rounded-full bg-white border-2 border-[--wed-rose]" />
      <span className="text-[10px] uppercase tracking-wider text-[--wed-rose] font-semibold">
        {item.time}
        {item.badge && <span className="text-[--wed-ink-subtle] ml-2">— {item.badge}</span>}
      </span>
      <h4
        className="text-base font-medium text-[--wed-ink] mt-0.5"
        style={{ fontFamily: FF_DISPLAY }}
      >
        {item.title}
      </h4>
      {item.description && (
        <p className="text-xs text-[--wed-ink-muted] leading-relaxed mt-0.5 font-light">
          {item.description}
        </p>
      )}
    </div>
  );
}

// ── Wedding Photo-Album Gallery with Lightbox ────────────────────────────────
function WeddingGallery({ images }: { images: InvitationGalleryItem[] }) {
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

  const count = images.length;

  return (
    <>
      {count === 1 && (
        <div className="max-w-2xl mx-auto">
          <button
            type="button"
            onClick={() => setActiveIdx(0)}
            className="w-full relative aspect-[16/10] rounded-2xl overflow-hidden shadow-md border-4 border-white group cursor-pointer text-left"
          >
            <Image
              src={images[0].url}
              alt={images[0].alt || images[0].caption || "Wedding photo"}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover group-hover:scale-[1.02] transition-transform duration-700"
            />
          </button>
        </div>
      )}

      {count === 2 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
          {images.map((img, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveIdx(idx)}
              className="relative aspect-[4/3] rounded-2xl overflow-hidden shadow-md border-4 border-white group cursor-pointer text-left"
            >
              <Image
                src={img.url}
                alt={img.alt || img.caption || `Wedding photo ${idx + 1}`}
                fill
                sizes="(max-width: 640px) 100vw, 400px"
                className="object-cover group-hover:scale-[1.02] transition-transform duration-700"
              />
            </button>
          ))}
        </div>
      )}

      {count === 3 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
          <button
            type="button"
            onClick={() => setActiveIdx(0)}
            className="sm:col-span-2 relative aspect-[16/10] sm:aspect-auto sm:min-h-[300px] rounded-2xl overflow-hidden shadow-md border-4 border-white group cursor-pointer text-left"
          >
            <Image
              src={images[0].url}
              alt={images[0].alt || images[0].caption || "Wedding photo 1"}
              fill
              sizes="(max-width: 640px) 100vw, 600px"
              className="object-cover group-hover:scale-[1.02] transition-transform duration-700"
            />
          </button>
          <div className="flex flex-col gap-4">
            {images.slice(1, 3).map((img, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveIdx(idx + 1)}
                className="relative aspect-[4/3] rounded-2xl overflow-hidden shadow-md border-4 border-white group cursor-pointer text-left flex-1"
              >
                <Image
                  src={img.url}
                  alt={img.alt || img.caption || `Wedding photo ${idx + 2}`}
                  fill
                  sizes="(max-width: 640px) 100vw, 300px"
                  className="object-cover group-hover:scale-[1.02] transition-transform duration-700"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {count >= 4 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {images.map((img, idx) => {
            const isFeatured = idx === 0 || (count >= 8 && idx === 4);
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveIdx(idx)}
                className={`group relative rounded-2xl overflow-hidden shadow-md border-4 border-white cursor-pointer text-left ${
                  isFeatured
                    ? "col-span-2 aspect-[16/10] md:aspect-auto md:row-span-2"
                    : "aspect-square"
                }`}
              >
                <Image
                  src={img.url}
                  alt={img.alt || img.caption || `Wedding photo ${idx + 1}`}
                  fill
                  sizes="(max-width: 768px) 50vw, 33vw"
                  className="object-cover group-hover:scale-[1.02] transition-transform duration-700"
                />
              </button>
            );
          })}
        </div>
      )}

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
                alt={images[activeIdx].alt || images[activeIdx].caption || "Wedding preview"}
                fill
                sizes="100vw"
                className="object-contain"
              />
            </div>
            {images[activeIdx].caption && (
              <p className="mt-3 text-center text-xs text-white/80 max-w-md">
                {images[activeIdx].caption}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Floating Wedding Music Player ────────────────────────────────────────────
function FloatingWeddingMusic({ audioUrl, title }: { audioUrl: string; title?: string | null }) {
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
        className="flex items-center gap-2 px-3 py-2 rounded-full border shadow-lg bg-white transition-all text-xs"
        style={{
          borderColor: isPlaying ? "var(--wed-rose)" : "var(--wed-rule)",
          color: isPlaying ? "var(--wed-rose)" : "var(--wed-ink-muted)",
        }}
        aria-label={isPlaying ? "Pause wedding music" : "Play wedding music"}
      >
        {isPlaying ? (
          <Volume2 className="w-3.5 h-3.5 text-[--wed-rose]" />
        ) : (
          <VolumeX className="w-3.5 h-3.5" />
        )}
        <span className="uppercase tracking-wider hidden sm:inline max-w-[120px] truncate">
          {isPlaying ? (title || "Wedding Strings") : "Music"}
        </span>
        {isPlaying && (
          <span className="flex items-end gap-0.5 h-3">
            <span className="w-0.5 h-3 bg-[--wed-rose] animate-bounce" />
            <span className="w-0.5 h-2 bg-[--wed-rose] animate-bounce delay-75" />
            <span className="w-0.5 h-3 bg-[--wed-rose] animate-bounce delay-150" />
          </span>
        )}
      </button>
    </div>
  );
}
