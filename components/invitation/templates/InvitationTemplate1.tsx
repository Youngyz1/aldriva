"use client";

/**
 * components/invitation/templates/InvitationTemplate1.tsx
 *
 * Invitation Page Template — "Gala Editorial"
 * Revision 4: i18n support (EN/FR dictionaries & localized date/time formatting),
 * lining numerals in countdown, compact layout, canvas QR pass.
 */

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import Image from "next/image";
import { Cormorant_Garamond, Lora } from "next/font/google";
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
const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-display",
});

const text = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-text",
});

// ── Design Tokens ─────────────────────────────────────────────────────────────
const CSS_VARS = {
  "--inv-bg": "#F8F5F0",
  "--inv-bg-alt": "#F1EDE6",
  "--inv-ink": "#1C1A18",
  "--inv-ink-muted": "#5A5650",
  "--inv-ink-subtle": "#8C887F",
  "--inv-accent": "#7A5C3A",
  "--inv-accent-light": "#C4A882",
  "--inv-rule": "#D8D2C8",
  "--inv-white": "#FFFFFF",
} as const;

const FF_DISPLAY = `var(--font-display), 'Georgia', serif`;
const FF_TEXT = `var(--font-text), 'Georgia', serif`;

interface Props {
  data: InvitationPageData;
  onRsvp?: (response: "accepted" | "declined") => Promise<void>;
  className?: string;
}

export function InvitationTemplate1({ data, onRsvp, className = "" }: Props) {
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

  // ── 2. Localized Timezone-Aware Date & Time ──────────────────────────────
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
        text: response === "accepted" ? dict.attendanceConfirmed : dict.responseNoted,
      });
    } catch {
      setCurrentRsvp(response);
      setRsvpFeedback({
        type: "success",
        text: response === "accepted" ? dict.previewConfirmed : dict.previewDeclined,
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
      "PRODID:-//Aldriva//Invitation Experience//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `SUMMARY:${data.title}`,
      `DESCRIPTION:Official Invitation for ${data.guest.name}`,
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
    a.download = `invitation-${data.title.toLowerCase().replace(/[^a-z0-9]/g, "-")}.ics`;
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

    const details = `Official Invitation for ${data.guest.name}`;
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

  // ── 5. Derived Flags ──────────────────────────────────────────────────────
  const heroFocusStyle: React.CSSProperties = {
    objectPosition: data.heroImageFocus
      ? `${data.heroImageFocus.x}% ${data.heroImageFocus.y}%`
      : "50% 50%",
  };
  const hasVenueInfo = Boolean(data.venue || data.address || data.city);
  const hasMapCoordinates = Boolean(data.latitude && data.longitude) || Boolean(data.address);
  const hasMultiVenue = Boolean(data.venues && data.venues.length > 0);

  return (
    <div
      className={`min-h-screen antialiased overflow-x-hidden selection:bg-[--inv-accent-light]/30 ${display.variable} ${text.variable} ${className}`}
      style={{
        ...CSS_VARS,
        background: "var(--inv-bg)",
        color: "var(--inv-ink)",
        fontFamily: FF_TEXT,
      } as React.CSSProperties}
    >
      {/* Optional Background Music */}
      {data.musicAudioUrl && (
        <FloatingMusicPlayer
          audioUrl={data.musicAudioUrl}
          title={data.musicTitle}
          dict={dict}
        />
      )}

      {/* ── Section 1: Hero ─────────────────────────────────────────────────── */}
      <section
        aria-label="Event hero"
        style={{ background: "var(--inv-bg)" }}
        className="relative w-full"
      >
        <div className="relative w-full aspect-[4/3] sm:aspect-[16/9] max-h-[640px] overflow-hidden">
          {data.heroImage ? (
            <>
              <Image
                src={data.heroImage}
                alt={data.heroImageAlt || data.title}
                fill
                priority
                sizes="100vw"
                className="object-cover"
                style={heroFocusStyle}
              />
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(to bottom, rgba(248,245,240,0) 0%, rgba(248,245,240,0.05) 50%, rgba(248,245,240,0.85) 85%, rgba(248,245,240,1) 100%)",
                }}
              />
            </>
          ) : (
            <HeroFallback title={data.title} city={data.city} eyebrow={dict.youAreInvited} />
          )}
        </div>

        <div
          className="relative z-10 mx-auto max-w-3xl px-6 sm:px-10 text-center"
          style={{ marginTop: data.heroImage ? "-4rem" : "0", paddingBottom: "2.5rem" }}
        >
          <p
            className="text-xs tracking-[0.28em] uppercase mb-4"
            style={{ color: "var(--inv-accent)", fontFamily: FF_TEXT, letterSpacing: "0.28em" }}
          >
            {data.eyebrow || dict.youAreInvited}
          </p>

          <h1
            className="leading-[1.12] text-balance"
            style={{
              fontFamily: FF_DISPLAY,
              fontSize: "clamp(2.1rem, 5.5vw, 4rem)",
              fontWeight: 600,
              color: "var(--inv-ink)",
              letterSpacing: "-0.01em",
              wordBreak: "break-word",
            }}
          >
            {data.title}
          </h1>

          {data.hostNames && (
            <p
              className="mt-3 text-sm"
              style={{ color: "var(--inv-ink-muted)", fontFamily: FF_TEXT, fontStyle: "italic" }}
            >
              {data.hostNames}
            </p>
          )}

          <div className="flex items-center gap-4 justify-center mt-6">
            <div className="h-px flex-1 max-w-[80px]" style={{ background: "var(--inv-rule)" }} />
            <span style={{ color: "var(--inv-accent-light)", fontSize: "1.1rem" }}>✦</span>
            <div className="h-px flex-1 max-w-[80px]" style={{ background: "var(--inv-rule)" }} />
          </div>

          <div
            className="mt-5 space-y-1"
            style={{ color: "var(--inv-ink-muted)", fontFamily: FF_TEXT }}
          >
            <p
              className="text-sm sm:text-base"
              style={{
                fontFamily: FF_DISPLAY,
                fontStyle: "italic",
                fontSize: "clamp(1rem, 2.5vw, 1.2rem)",
                color: "var(--inv-ink)",
              }}
            >
              {dateDisplay}
            </p>
            <p className="text-sm" style={{ color: "var(--inv-ink-muted)" }}>
              {timeDisplay}
            </p>
            {hasVenueInfo && (
              <p className="text-sm" style={{ color: "var(--inv-ink-muted)" }}>
                {[data.venue, data.city].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>

          <p
            className="mt-6 text-[10px] tracking-[0.25em] uppercase"
            style={{ color: "var(--inv-ink-subtle)" }}
          >
            {data.scrollPrompt || dict.exploreInvitation}
          </p>
        </div>
      </section>

      {/* ── Section 2: Story / Welcome ───────────────────────────────────────── */}
      <section
        aria-label="Host message"
        className="py-16 sm:py-24 px-6"
        style={{ background: "var(--inv-bg)" }}
      >
        <div className="max-w-2xl mx-auto text-center">
          <p
            className="text-[10px] tracking-[0.3em] uppercase mb-2"
            style={{ color: "var(--inv-accent)", fontFamily: FF_TEXT }}
          >
            {isVipGuest ? dict.honoredVipGuest : dict.dearGuest}
          </p>
          <p
            className="mb-6"
            style={{
              fontFamily: FF_DISPLAY,
              fontSize: "clamp(1.5rem, 3.5vw, 2.2rem)",
              fontWeight: 500,
              fontStyle: "italic",
              color: "var(--inv-ink)",
            }}
          >
            {data.guest.name}
            {(data.guest.title || data.guest.organization) && (
              <span
                className="block mt-1"
                style={{
                  fontSize: "0.7em",
                  fontWeight: 400,
                  fontStyle: "normal",
                  color: "var(--inv-ink-muted)",
                }}
              >
                {[data.guest.title, data.guest.organization].filter(Boolean).join(" · ")}
              </span>
            )}
          </p>

          <HairlineRule />

          <h2
            className="mt-8 mb-5"
            style={{
              fontFamily: FF_DISPLAY,
              fontSize: "clamp(1.5rem, 3vw, 2rem)",
              fontWeight: 600,
              color: "var(--inv-ink)",
              letterSpacing: "-0.01em",
            }}
          >
            {data.storyHeadline || dict.messageFromHost}
          </h2>

          <div
            className="text-sm sm:text-base leading-[1.85] max-w-xl mx-auto space-y-4"
            style={{ color: "var(--inv-ink-muted)", fontFamily: FF_TEXT }}
          >
            <p className="whitespace-pre-line">
              {data.storyText ||
                "We are delighted to invite you to celebrate this special occasion with us. Your presence will make our gathering truly memorable."}
            </p>
          </div>

          {data.storyImage && (
            <div className="mt-14 relative w-full max-w-md mx-auto aspect-[3/4] rounded-none overflow-hidden shadow-sm">
              <Image
                src={data.storyImage}
                alt="Host portrait"
                fill
                sizes="(max-width: 640px) 100vw, 448px"
                className="object-cover"
              />
            </div>
          )}
        </div>
      </section>

      {/* ── Section 3: Countdown ────────────────────────────────────────────── */}
      <section
        aria-label="Event countdown"
        className="py-14 sm:py-20 px-6"
        style={{ background: "var(--inv-bg-alt)" }}
      >
        <div className="max-w-2xl mx-auto text-center">
          <SectionLabel>Counting Down</SectionLabel>
          <CountdownTicker
            targetDate={data.eventDate}
            timezone={data.timezone}
            dict={dict}
          />
        </div>
      </section>

      {/* ── Section 4: Photo Gallery (HIDE-IF-EMPTY) ───────────────────────── */}
      {data.gallery && data.gallery.length > 0 && (
        <section
          aria-label="Photo gallery"
          className="py-16 sm:py-24 px-6"
          style={{ background: "var(--inv-bg)" }}
        >
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <SectionLabel>{dict.visualHighlights}</SectionLabel>
              <SectionTitle>{dict.gallery}</SectionTitle>
            </div>
            <EditorialGallery images={data.gallery} />
          </div>
        </section>
      )}

      {/* ── Section 5: Schedule / Timeline (HIDE-IF-EMPTY) ──────────────────── */}
      {data.schedule && data.schedule.length > 0 && (
        <section
          aria-label="Event schedule"
          className="py-16 sm:py-24 px-6"
          style={{ background: "var(--inv-bg-alt)" }}
        >
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-12">
              <SectionLabel>{dict.orderOfEvents}</SectionLabel>
              <SectionTitle>{dict.itineraryAndProgram}</SectionTitle>
            </div>
            <GroupedScheduleView schedule={data.schedule} />
          </div>
        </section>
      )}

      {/* ── Section 6: Venue & Directions (HIDE-IF-EMPTY) ───────────────────── */}
      {hasVenueInfo && (
        <section
          aria-label="Venue and directions"
          className="py-16 sm:py-24 px-6"
          style={{ background: "var(--inv-bg)" }}
        >
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <SectionLabel>{dict.locationAndTravel}</SectionLabel>
              <SectionTitle>{dict.venueAndDirections}</SectionTitle>
            </div>

            <div className="space-y-2 text-center mb-8">
              {data.venue && (
                <p
                  style={{
                    fontFamily: FF_DISPLAY,
                    fontSize: "clamp(1.2rem, 2.5vw, 1.5rem)",
                    fontWeight: 600,
                    color: "var(--inv-ink)",
                  }}
                >
                  {data.venue}
                </p>
              )}
              {(data.address || data.city) && (
                <p className="text-sm" style={{ color: "var(--inv-ink-muted)", fontFamily: FF_TEXT }}>
                  {[data.address, data.city].filter(Boolean).join(", ")}
                </p>
              )}
              <div className="mt-4">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    [data.venue, data.address, data.city].filter(Boolean).join(", ")
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs tracking-widest uppercase"
                  style={{ color: "var(--inv-accent)", fontFamily: FF_TEXT }}
                >
                  <span>{dict.getDirections}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {hasMapCoordinates && (
              <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--inv-rule)" }}>
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
              <p
                className="mt-6 text-center text-sm leading-relaxed"
                style={{ color: "var(--inv-ink-muted)", fontFamily: FF_TEXT }}
              >
                {data.parkingNotes}
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── Section 6b: Multi-Venue (HIDE-IF-EMPTY) ─────────────────────────── */}
      {hasMultiVenue && data.venues && (
        <section
          aria-label="Multiple venues"
          className="py-16 sm:py-24 px-6"
          style={{ background: "var(--inv-bg-alt)" }}
        >
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <SectionLabel>{dict.locationAndTravel}</SectionLabel>
              <SectionTitle>{dict.venues}</SectionTitle>
            </div>
            <div className="space-y-8">
              {data.venues.map((v: InvitationVenueItem, idx: number) => (
                <div key={idx} className="text-center">
                  <p
                    className="text-[10px] tracking-[0.28em] uppercase mb-1"
                    style={{ color: "var(--inv-accent)", fontFamily: FF_TEXT }}
                  >
                    {v.label}
                  </p>
                  <p
                    style={{
                      fontFamily: FF_DISPLAY,
                      fontSize: "clamp(1.1rem, 2.5vw, 1.4rem)",
                      fontWeight: 600,
                      color: "var(--inv-ink)",
                    }}
                  >
                    {v.name}
                  </p>
                  {v.address && (
                    <p className="text-sm mt-0.5" style={{ color: "var(--inv-ink-muted)" }}>
                      {v.address}
                    </p>
                  )}
                  {idx < (data.venues?.length ?? 0) - 1 && (
                    <div className="mt-6 flex items-center justify-center gap-4">
                      <div className="h-px flex-1 max-w-[60px]" style={{ background: "var(--inv-rule)" }} />
                      <span style={{ color: "var(--inv-accent-light)", fontSize: "0.85rem" }}>✦</span>
                      <div className="h-px flex-1 max-w-[60px]" style={{ background: "var(--inv-rule)" }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Section 7: Dress Code & Accommodations (HIDE-IF-EMPTY) ─────────── */}
      {(data.dressCode ||
        (data.accommodations && data.accommodations.length > 0) ||
        data.additionalNotes) && (
        <section
          aria-label="Attire and accommodations"
          className="py-16 sm:py-24 px-6"
          style={{ background: "var(--inv-bg)" }}
        >
          <div className="max-w-2xl mx-auto space-y-14">
            {data.dressCode && (
              <div className="text-center">
                <SectionLabel>{dict.attire}</SectionLabel>
                <p
                  style={{
                    fontFamily: FF_DISPLAY,
                    fontSize: "clamp(1.3rem, 2.5vw, 1.7rem)",
                    fontWeight: 600,
                    color: "var(--inv-ink)",
                  }}
                >
                  {data.dressCode}
                </p>
                {data.dressCodeNotes && (
                  <p
                    className="mt-2 text-sm leading-relaxed max-w-lg mx-auto"
                    style={{ color: "var(--inv-ink-muted)", fontFamily: FF_TEXT }}
                  >
                    {data.dressCodeNotes}
                  </p>
                )}
              </div>
            )}

            {data.accommodations && data.accommodations.length > 0 && (
              <div>
                <SectionLabel className="text-center block mb-6">{dict.recommendedStays}</SectionLabel>
                <div className="space-y-4">
                  {data.accommodations.map((hotel, idx) => (
                    <div
                      key={idx}
                      className="flex items-start justify-between gap-4 py-4 border-b"
                      style={{ borderColor: "var(--inv-rule)" }}
                    >
                      <div>
                        <p
                          className="text-sm font-semibold"
                          style={{ color: "var(--inv-ink)", fontFamily: FF_TEXT }}
                        >
                          {hotel.name}
                        </p>
                        {hotel.notes && (
                          <p className="text-xs mt-0.5" style={{ color: "var(--inv-ink-muted)" }}>
                            {hotel.notes}
                          </p>
                        )}
                      </div>
                      {hotel.bookingUrl && (
                        <a
                          href={hotel.bookingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-xs tracking-widest uppercase flex items-center gap-1"
                          style={{ color: "var(--inv-accent)", fontFamily: FF_TEXT }}
                        >
                          {dict.book} <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.additionalNotes && (
              <div className="text-center">
                <SectionLabel>{dict.importantInfo}</SectionLabel>
                <p
                  className="text-sm leading-relaxed max-w-lg mx-auto whitespace-pre-line"
                  style={{ color: "var(--inv-ink-muted)", fontFamily: FF_TEXT }}
                >
                  {data.additionalNotes}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Section 8: Your Invitation Pass & RSVP ──────────────────────────── */}
      <section
        id="rsvp-section"
        aria-label="RSVP and invitation pass"
        className="py-16 sm:py-24 px-6"
        style={{ background: "var(--inv-bg-alt)" }}
      >
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-10">
            <SectionLabel>{dict.yourInvitationAndRsvp}</SectionLabel>
            <SectionTitle>{dict.yourInvitationAndRsvp}</SectionTitle>
            <p className="mt-2 text-sm" style={{ color: "var(--inv-ink-muted)", fontFamily: FF_TEXT }}>
              {dict.kindlyConfirm}
            </p>
          </div>

          <div
            className="border p-8 text-center"
            style={{
              borderColor: "var(--inv-rule)",
              background: "var(--inv-white)",
            }}
          >
            <p
              className="text-[10px] tracking-[0.3em] uppercase mb-1"
              style={{ color: "var(--inv-accent)", fontFamily: FF_TEXT }}
            >
              {isVipGuest ? dict.vipGuestPass : dict.officialInvitation}
            </p>
            <p
              style={{
                fontFamily: FF_DISPLAY,
                fontSize: "clamp(1.5rem, 3.5vw, 2rem)",
                fontWeight: 600,
                fontStyle: "italic",
                color: "var(--inv-ink)",
              }}
            >
              {data.guest.name}
            </p>
            {(data.guest.title || data.guest.organization) && (
              <p className="text-xs mt-0.5" style={{ color: "var(--inv-ink-muted)", fontFamily: FF_TEXT }}>
                {[data.guest.title, data.guest.organization].filter(Boolean).join(" · ")}
              </p>
            )}

            {data.seat && (
              <div className="mt-4">
                <HairlineRule />
                <p
                  className="mt-3 text-xs tracking-widest uppercase"
                  style={{ color: "var(--inv-accent)", fontFamily: FF_TEXT }}
                >
                  {dict.reservedSeat}: {data.seat.label}
                  {data.seat.tableName && ` — ${data.seat.tableName}`}
                </p>
              </div>
            )}

            {rsvpFeedback && (
              <div
                className={`mt-5 p-3 text-xs flex items-center justify-center gap-2 ${
                  rsvpFeedback.type === "success"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-rose-50 text-rose-700 border border-rose-200"
                }`}
              >
                {rsvpFeedback.type === "success" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{rsvpFeedback.text}</span>
              </div>
            )}

            <div className="mt-6 mb-4">
              <p
                className="text-[10px] tracking-[0.25em] uppercase mb-4"
                style={{ color: "var(--inv-ink-subtle)", fontFamily: FF_TEXT }}
              >
                {dict.willYouJoinUs}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xs mx-auto">
                <button
                  type="button"
                  onClick={() => handleRsvpAction("accepted")}
                  disabled={submittingRsvp || currentRsvp === "accepted"}
                  className="py-3 px-4 text-xs tracking-widest uppercase transition-all flex items-center justify-center gap-2 border"
                  style={{
                    fontFamily: FF_TEXT,
                    background: currentRsvp === "accepted" ? "var(--inv-ink)" : "transparent",
                    color: currentRsvp === "accepted" ? "var(--inv-bg)" : "var(--inv-ink)",
                    borderColor: "var(--inv-ink)",
                    cursor: currentRsvp === "accepted" ? "default" : "pointer",
                  }}
                >
                  {submittingRsvp ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : currentRsvp === "accepted" ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>{currentRsvp === "accepted" ? dict.attending : dict.accept}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleRsvpAction("declined")}
                  disabled={submittingRsvp || currentRsvp === "declined"}
                  className="py-3 px-4 text-xs tracking-widest uppercase transition-all flex items-center justify-center gap-2 border"
                  style={{
                    fontFamily: FF_TEXT,
                    background: "transparent",
                    color: currentRsvp === "declined" ? "var(--inv-ink-subtle)" : "var(--inv-ink-muted)",
                    borderColor: "var(--inv-rule)",
                    cursor: currentRsvp === "declined" ? "default" : "pointer",
                    textDecoration: currentRsvp === "declined" ? "line-through" : "none",
                  }}
                >
                  {submittingRsvp ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  <span>{currentRsvp === "declined" ? dict.declined : dict.decline}</span>
                </button>
              </div>
            </div>

            {data.ticketInstance?.qrCode && currentRsvp !== "declined" && (
              <div className="mt-4">
                <HairlineRule />
                <div className="mt-4 inline-block">
                  <CanvasQRCode value={data.ticketInstance.qrCode} size={160} />
                </div>
                <p
                  className="mt-2 text-[9px] tracking-[0.2em] uppercase"
                  style={{ color: "var(--inv-ink-subtle)", fontFamily: FF_TEXT }}
                >
                  {dict.presentForAdmission}
                </p>
              </div>
            )}

            <div
              className="mt-6 pt-5 border-t flex flex-wrap items-center justify-center gap-3"
              style={{ borderColor: "var(--inv-rule)" }}
            >
              <button
                type="button"
                onClick={downloadIcsFile}
                className="inline-flex items-center gap-1.5 text-xs tracking-widest uppercase"
                style={{ color: "var(--inv-accent)", fontFamily: FF_TEXT }}
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                <span>{dict.addToCalendar}</span>
              </button>
              <span style={{ color: "var(--inv-rule)" }}>·</span>
              <a
                href={getGoogleCalendarUrl()}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs tracking-widest uppercase"
                style={{ color: "var(--inv-accent)", fontFamily: FF_TEXT }}
              >
                <span>{dict.googleCalendar}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <span style={{ color: "var(--inv-rule)" }}>·</span>
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex items-center gap-1.5 text-xs tracking-widest uppercase"
                style={{ color: "var(--inv-accent)", fontFamily: FF_TEXT }}
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{copiedLink ? dict.copiedLink : dict.share}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer
        className="py-10 text-center text-xs space-y-1"
        style={{
          background: "var(--inv-bg)",
          borderTop: "1px solid var(--inv-rule)",
          color: "var(--inv-ink-subtle)",
          fontFamily: FF_TEXT,
        }}
      >
        <p style={{ color: "var(--inv-ink-muted)" }}>
          {data.title}
          {data.city ? ` · ${data.city}` : ""}
        </p>
        <p>{dict.poweredByAldriva}</p>
      </footer>
    </div>
  );
}

// ── Micro-components ──────────────────────────────────────────────────────────

function HairlineRule() {
  return (
    <div className="flex items-center gap-4 justify-center my-4">
      <div className="h-px flex-1 max-w-[60px]" style={{ background: "var(--inv-rule)" }} />
      <span style={{ color: "var(--inv-accent-light)", fontSize: "0.75rem" }}>✦</span>
      <div className="h-px flex-1 max-w-[60px]" style={{ background: "var(--inv-rule)" }} />
    </div>
  );
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={`text-[10px] tracking-[0.3em] uppercase mb-3 ${className}`}
      style={{ color: "var(--inv-accent)", fontFamily: FF_TEXT }}
    >
      {children}
    </p>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mb-2"
      style={{
        fontFamily: FF_DISPLAY,
        fontSize: "clamp(1.5rem, 3vw, 2.2rem)",
        fontWeight: 600,
        color: "var(--inv-ink)",
        letterSpacing: "-0.01em",
      }}
    >
      {children}
    </h2>
  );
}

function HeroFallback({
  title,
  city,
  eyebrow,
}: {
  title: string;
  city?: string | null;
  eyebrow: string;
}) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center overflow-hidden"
      style={{ background: "var(--inv-bg-alt)" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{ opacity: 0.12 }}
      >
        {[340, 260, 180, 100].map((size, i) => (
          <div
            key={i}
            className="absolute rounded-full border"
            style={{
              width: size,
              height: size,
              borderColor: "var(--inv-accent)",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }}
          />
        ))}
      </div>

      <p
        className="text-[9px] tracking-[0.4em] uppercase mb-5 z-10"
        style={{ color: "var(--inv-accent)", fontFamily: FF_TEXT }}
      >
        {eyebrow}
      </p>
      <h2
        className="z-10 text-balance"
        style={{
          fontFamily: FF_DISPLAY,
          fontStyle: "italic",
          fontSize: "clamp(1.6rem, 5vw, 3.2rem)",
          fontWeight: 500,
          color: "var(--inv-ink)",
          maxWidth: "22ch",
        }}
      >
        {title}
      </h2>
      {city && (
        <p
          className="mt-3 text-sm z-10"
          style={{ color: "var(--inv-ink-muted)", fontFamily: FF_TEXT }}
        >
          {city}
        </p>
      )}
    </div>
  );
}

function CanvasQRCode({ value, size = 160 }: { value: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    import("qrcode")
      .then((QRCode) => {
        if (!canvasRef.current) return;
        QRCode.toCanvas(canvasRef.current, value, {
          width: size,
          margin: 2,
          color: {
            dark: "#1C1A18",
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
      aria-label="Entry QR code"
      style={{ display: "block" }}
    />
  );
}

function CountdownTicker({
  targetDate,
  timezone,
  dict,
}: {
  targetDate: string;
  timezone?: string | null;
  dict: ReturnType<typeof getInvitationDictionary>;
}) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isPast: boolean;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0, isPast: false });

  useEffect(() => {
    function computeTime() {
      const now = Date.now();
      const target = new Date(targetDate).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds, isPast: false });
    }

    computeTime();
    const interval = setInterval(computeTime, 1000);
    return () => clearInterval(interval);
  }, [targetDate, timezone]);

  if (timeLeft.isPast) {
    return (
      <p
        className="text-sm tracking-wider"
        style={{ color: "var(--inv-ink-muted)", fontFamily: FF_TEXT, fontStyle: "italic" }}
      >
        {dict.celebrationUnderway}
      </p>
    );
  }

  const units = [
    { label: dict.days, value: timeLeft.days },
    { label: dict.hours, value: timeLeft.hours },
    { label: dict.minutes, value: timeLeft.minutes },
    { label: dict.seconds, value: timeLeft.seconds },
  ];

  return (
    <div
      className="grid grid-cols-4 gap-4 sm:gap-8 max-w-sm sm:max-w-md mx-auto"
      aria-label="Countdown timer"
    >
      {units.map((unit, idx) => (
        <div key={idx} className="flex flex-col items-center">
          <span
            aria-label={`${unit.value} ${unit.label}`}
            className="tabular-nums lining-nums"
            style={{
              fontFamily: FF_DISPLAY,
              fontSize: "clamp(2.5rem, 6vw, 4rem)",
              fontWeight: 600,
              lineHeight: 1,
              color: "var(--inv-ink)",
              fontVariantNumeric: "lining-nums tabular-nums",
              fontFeatureSettings: '"lnum" 1, "tnum" 1',
              letterSpacing: "-0.02em",
            }}
          >
            {String(unit.value).padStart(2, "0")}
          </span>
          <span
            className="mt-3 text-[9px] tracking-[0.25em] uppercase"
            style={{ color: "var(--inv-ink-subtle)", fontFamily: FF_TEXT }}
          >
            {unit.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function GroupedScheduleView({ schedule }: { schedule: InvitationScheduleItem[] }) {
  const hasDayGrouping = schedule.some((item) => Boolean(item.day));

  if (!hasDayGrouping) {
    return (
      <div
        className="space-y-6 border-l"
        style={{ borderColor: "var(--inv-rule)", marginLeft: "1.5rem", paddingLeft: "1.5rem" }}
      >
        {schedule.map((item, idx) => (
          <ScheduleItemCard key={idx} item={item} />
        ))}
      </div>
    );
  }

  const groups = schedule.reduce((acc, item) => {
    const key = item.day || "Schedule";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, InvitationScheduleItem[]>);

  return (
    <div className="space-y-10">
      {Object.entries(groups).map(([dayLabel, items], gIdx) => (
        <div key={gIdx}>
          <p
            className="text-[10px] tracking-[0.28em] uppercase mb-5"
            style={{ color: "var(--inv-accent)", fontFamily: FF_TEXT }}
          >
            {dayLabel}
          </p>
          <div
            className="space-y-6 border-l"
            style={{ borderColor: "var(--inv-rule)", marginLeft: "1rem", paddingLeft: "1.5rem" }}
          >
            {items.map((item, idx) => (
              <ScheduleItemCard key={idx} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScheduleItemCard({ item }: { item: InvitationScheduleItem }) {
  return (
    <div className="relative">
      <div
        className="absolute -left-[1.875rem] top-1.5 w-2.5 h-2.5 rounded-full border-2"
        style={{
          background: "var(--inv-bg-alt)",
          borderColor: "var(--inv-accent-light)",
        }}
      />
      <p
        className="text-[10px] tracking-[0.2em] uppercase mb-0.5"
        style={{ color: "var(--inv-accent)", fontFamily: FF_TEXT }}
      >
        {item.time}
        {item.badge && <span style={{ color: "var(--inv-ink-subtle)", marginLeft: "0.75em" }}>— {item.badge}</span>}
      </p>
      <p
        className="text-sm font-medium"
        style={{ fontFamily: FF_TEXT, color: "var(--inv-ink)" }}
      >
        {item.title}
      </p>
      {item.description && (
        <p
          className="mt-0.5 text-xs leading-relaxed"
          style={{ color: "var(--inv-ink-muted)", fontFamily: FF_TEXT }}
        >
          {item.description}
        </p>
      )}
    </div>
  );
}

function EditorialGallery({ images }: { images: InvitationGalleryItem[] }) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const touchStartX = useRef<number | null>(null);

  const handleNext = useCallback(() => {
    setActiveIdx((prev) =>
      prev !== null ? (prev < images.length - 1 ? prev + 1 : 0) : null
    );
  }, [images.length]);

  const handlePrev = useCallback(() => {
    setActiveIdx((prev) =>
      prev !== null ? (prev > 0 ? prev - 1 : images.length - 1) : null
    );
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
    const diffX = e.changedTouches[0].clientX - touchStartX.current;
    if (diffX > 40) handlePrev();
    if (diffX < -40) handleNext();
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
            className="w-full relative aspect-[16/10] overflow-hidden group cursor-pointer text-left"
          >
            <Image
              src={images[0].url}
              alt={images[0].alt || images[0].caption || "Gallery photo"}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover group-hover:scale-[1.02] transition-transform duration-700"
            />
          </button>
        </div>
      )}

      {count === 2 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl mx-auto">
          {images.map((img, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveIdx(idx)}
              className="relative aspect-[4/3] overflow-hidden group cursor-pointer text-left"
            >
              <Image
                src={img.url}
                alt={img.alt || img.caption || `Gallery photo ${idx + 1}`}
                fill
                sizes="(max-width: 640px) 100vw, 400px"
                className="object-cover group-hover:scale-[1.02] transition-transform duration-700"
              />
            </button>
          ))}
        </div>
      )}

      {count === 3 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-4xl mx-auto">
          <button
            type="button"
            onClick={() => setActiveIdx(0)}
            className="sm:col-span-2 relative aspect-[16/10] sm:aspect-auto sm:min-h-[320px] overflow-hidden group cursor-pointer text-left"
          >
            <Image
              src={images[0].url}
              alt={images[0].alt || images[0].caption || "Gallery photo 1"}
              fill
              sizes="(max-width: 640px) 100vw, 600px"
              className="object-cover group-hover:scale-[1.02] transition-transform duration-700"
            />
          </button>
          <div className="flex flex-col gap-3">
            {images.slice(1, 3).map((img, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveIdx(idx + 1)}
                className="relative aspect-[4/3] overflow-hidden group cursor-pointer text-left flex-1"
              >
                <Image
                  src={img.url}
                  alt={img.alt || img.caption || `Gallery photo ${idx + 2}`}
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
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {images.map((img, idx) => {
            const isFeatured = idx === 0 || (count >= 8 && idx === 4);
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveIdx(idx)}
                className={`group relative overflow-hidden cursor-pointer text-left ${
                  isFeatured
                    ? "col-span-2 aspect-[16/10] md:aspect-auto md:row-span-2"
                    : "aspect-square"
                }`}
              >
                <Image
                  src={img.url}
                  alt={img.alt || img.caption || `Gallery photo ${idx + 1}`}
                  fill
                  sizes="(max-width: 768px) 50vw, 33vw"
                  className="object-cover group-hover:scale-[1.02] transition-transform duration-700"
                />
              </button>
            );
          })}
        </div>
      )}

      {activeIdx !== null && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 touch-none select-none"
          style={{ background: "rgba(28,26,24,0.96)" }}
          onClick={() => setActiveIdx(null)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <button
            type="button"
            onClick={() => setActiveIdx(null)}
            className="absolute top-4 right-4 p-3 rounded-full z-50"
            style={{ background: "rgba(248,245,240,0.12)", color: "var(--inv-bg)" }}
            aria-label="Close image preview"
          >
            <X className="w-5 h-5" />
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                className="absolute left-3 sm:left-6 p-3 rounded-full z-50 hidden sm:block"
                style={{ background: "rgba(248,245,240,0.12)", color: "var(--inv-bg)" }}
                aria-label="Previous image"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleNext(); }}
                className="absolute right-3 sm:right-6 p-3 rounded-full z-50 hidden sm:block"
                style={{ background: "rgba(248,245,240,0.12)", color: "var(--inv-bg)" }}
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
                alt={images[activeIdx].alt || images[activeIdx].caption || "Gallery preview"}
                fill
                sizes="100vw"
                className="object-contain"
              />
            </div>
            {images[activeIdx].caption && (
              <p className="mt-3 text-center text-xs max-w-md" style={{ color: "rgba(248,245,240,0.7)" }}>
                {images[activeIdx].caption}
              </p>
            )}
            <p className="text-[10px] font-mono mt-1" style={{ color: "rgba(248,245,240,0.35)" }}>
              {activeIdx + 1} of {images.length}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function FloatingMusicPlayer({
  audioUrl,
  title,
  dict,
}: {
  audioUrl: string;
  title?: string | null;
  dict: ReturnType<typeof getInvitationDictionary>;
}) {
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
        className="flex items-center gap-2 px-3 py-2 rounded-full border shadow-lg transition-all"
        style={{
          background: "var(--inv-white)",
          borderColor: isPlaying ? "var(--inv-accent)" : "var(--inv-rule)",
          color: isPlaying ? "var(--inv-accent)" : "var(--inv-ink-muted)",
        }}
        aria-label={isPlaying ? "Pause invitation music" : "Play invitation music"}
      >
        {isPlaying ? (
          <Volume2 className="w-3.5 h-3.5" />
        ) : (
          <VolumeX className="w-3.5 h-3.5" />
        )}
        <span
          className="text-[11px] uppercase tracking-widest hidden sm:inline max-w-[120px] truncate"
          style={{ fontFamily: FF_TEXT }}
        >
          {isPlaying ? (title || dict.playing) : dict.music}
        </span>
        {isPlaying && (
          <span className="flex items-end gap-0.5 h-3">
            <span className="w-0.5 h-3 animate-bounce" style={{ background: "var(--inv-accent)" }} />
            <span className="w-0.5 h-2 animate-bounce" style={{ background: "var(--inv-accent)", animationDelay: "75ms" }} />
            <span className="w-0.5 h-3 animate-bounce" style={{ background: "var(--inv-accent)", animationDelay: "150ms" }} />
          </span>
        )}
      </button>
    </div>
  );
}
