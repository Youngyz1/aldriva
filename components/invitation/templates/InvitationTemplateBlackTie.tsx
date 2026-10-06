"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Image from "next/image";
import {
  Calendar,
  Clock,
  MapPin,
  Sparkles,
  CheckCircle2,
  XCircle,
  CalendarPlus,
  Share2,
  Volume2,
  VolumeX,
  ChevronDown,
  ExternalLink,
  Car,
  Hotel,
  ShieldCheck,
  Armchair,
  Check,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  Info,
  Compass,
} from "lucide-react";
import {
  InvitationPageData,
  InvitationGalleryItem,
  InvitationScheduleItem,
} from "@/types/invitation-template";
import {
  getInvitationDictionary,
  formatLocalizedEventDate,
  InvitationLocale,
} from "@/lib/invitation-i18n";
import { downloadIcsFile as triggerIcsDownload, generateGoogleCalendarUrl } from "@/lib/event-time";
import VenueMapClient from "@/components/VenueMapClient";

interface Props {
  data: InvitationPageData;
  onRsvp?: (response: "accepted" | "declined") => Promise<void>;
  className?: string;
}

export function InvitationTemplateBlackTie({ data, onRsvp, className = "" }: Props) {
  const locale: InvitationLocale = data.locale || "en";
  const dict = useMemo(() => getInvitationDictionary(locale), [locale]);

  const [currentRsvp, setCurrentRsvp] = useState<"pending" | "accepted" | "declined">(
    data.guest.rsvpStatus || "pending"
  );
  const [submittingRsvp, setSubmittingRsvp] = useState(false);
  const [rsvpFeedback, setRsvpFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    setCurrentRsvp(data.guest.rsvpStatus || "pending");
  }, [data.guest.rsvpStatus]);

  // ── 1. VIP Determination ───────────────────────────────────────────────────
  const isVipGuest = Boolean(data.guest.isVip || data.seat?.isVip);

  // ── 2. Timezone-Aware Localized Date & Time Formatter ────────────────────────
  const { dateDisplay, timeDisplay } = useMemo(
    () => formatLocalizedEventDate(data.eventDate, locale, data.timezone),
    [data.eventDate, locale, data.timezone]
  );

  // Time is only shown once the host has explicitly chosen a timezone and
  // the event carries a date — never render a default-looking time line.
  const showTime = Boolean(data.timezone && data.eventDate);

  // ── 3. RSVP Submission Handler ─────────────────────────────────────────────
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

  // ── 4. Calendar (.ics & Google) Constructors ───────────────────────────────
  function downloadIcsFile() {
    if (!data.eventDate) return;
    triggerIcsDownload({
      title: data.title,
      description: data.guest ? `Official Invitation for ${data.guest.name}` : undefined,
      venue: data.venue,
      address: data.address,
      startDate: data.eventDate,
      endDate: data.endDate,
      timezone: data.timezone || "UTC",
    });
  }

  function getGoogleCalendarUrl() {
    if (!data.eventDate) return "#";
    return generateGoogleCalendarUrl({
      title: data.title,
      description: data.guest ? `Official Invitation for ${data.guest.name}` : undefined,
      venue: data.venue,
      address: data.address,
      startDate: data.eventDate,
      endDate: data.endDate,
      timezone: data.timezone || "UTC",
    });
  }

  function handleShare() {
    if (typeof window !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  }

  // Focal point styling for hero image
  const heroFocusStyle: React.CSSProperties = {
    objectPosition: data.heroImageFocus
      ? `${data.heroImageFocus.x}% ${data.heroImageFocus.y}%`
      : "50% 50%",
  };

  const hasVenueInfo = Boolean(data.venue || data.address || data.city);
  const hasMapCoordinates = Boolean(data.latitude && data.longitude) || Boolean(data.address);

  return (
    <div
      className={`min-h-screen bg-zinc-950 text-zinc-100 selection:bg-amber-500/30 selection:text-amber-200 antialiased overflow-x-hidden ${className}`}
      style={{
        fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* ── Optional Background Music Controller ──────────────────────────── */}
      {data.musicAudioUrl && (
        <FloatingMusicPlayer audioUrl={data.musicAudioUrl} title={data.musicTitle} />
      )}

      {/* ── Section 1: Hero Composition (Editorial & Framed) ─────────────── */}
      <section className="relative w-full max-w-5xl mx-auto px-4 pt-6 sm:pt-12 pb-10 sm:pb-16 flex flex-col items-center">
        {/* Outer Invitation Frame Container */}
        <div className="w-full rounded-3xl sm:rounded-[36px] border border-amber-500/25 bg-gradient-to-b from-zinc-900 via-zinc-900/95 to-zinc-950 p-4 sm:p-8 shadow-2xl shadow-black/80 relative overflow-hidden">
          
          {/* Subtle Corner Accents */}
          <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-amber-400/40 rounded-tl-lg pointer-events-none" />
          <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-amber-400/40 rounded-tr-lg pointer-events-none" />
          <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-amber-400/40 rounded-bl-lg pointer-events-none" />
          <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-amber-400/40 rounded-br-lg pointer-events-none" />

          {/* Top Eyebrow */}
          <div className="text-center pt-2 sm:pt-4 mb-4">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full border border-amber-400/30 bg-amber-500/10 text-[10px] sm:text-xs font-bold uppercase tracking-[0.22em] text-amber-300">
              <Sparkles className="w-3 h-3 text-amber-400" />
              {data.eyebrow || dict.youAreInvited}
            </span>
          </div>

          {/* Main Title (Fluid type scale, sentence/title case, balanced wrapping) */}
          <div className="text-center px-2 sm:px-6 max-w-3xl mx-auto mb-5">
            <h1
              className="text-[clamp(1.75rem,5vw,3.25rem)] font-bold tracking-tight text-white leading-[1.18] text-balance"
              style={{ fontFamily: "'Playfair Display', 'Cinzel', serif" }}
            >
              {data.title}
            </h1>

            {data.hostNames && (
              <p className="mt-2 text-xs sm:text-sm font-medium text-amber-200/80 tracking-wide">
                {data.hostNames}
              </p>
            )}
          </div>

          {/* Hero Media Slot (Framed with object-fit: cover and focal point) */}
          <div className="relative w-full aspect-[16/10] sm:aspect-[16/9] max-h-[440px] rounded-2xl sm:rounded-3xl overflow-hidden border border-amber-500/20 shadow-inner bg-zinc-950">
            {data.heroImage ? (
              <Image
                src={data.heroImage}
                alt={data.heroImageAlt || data.title}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 1024px"
                className="object-cover transition-transform duration-700"
                style={heroFocusStyle}
              />
            ) : (
              /* Designed Typographic / Geometric Fallback (Zero Stock Photography) */
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-[radial-gradient(ellipse_at_center,#27272a,#09090b)] text-center">
                <div className="w-16 h-16 rounded-2xl border border-amber-400/30 bg-amber-500/10 flex items-center justify-center text-amber-400 mb-3 shadow-lg">
                  <Sparkles className="w-7 h-7" />
                </div>
                <div
                  className="text-2xl sm:text-3xl font-bold text-amber-200/90 tracking-wide"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  {dict.exclusiveInvitation}
                </div>
                <div className="text-xs text-zinc-500 uppercase tracking-widest mt-1 font-mono">
                  {data.city || (locale === "fr" ? "Événement Aldriva" : "Aldriva Event")}
                </div>
              </div>
            )}
          </div>

          {/* First Viewport Date / Time / Location Strip (Visible on 390x844 without scrolling) */}
          <div className="mt-4 sm:mt-6 pt-4 border-t border-zinc-800/80 grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 text-center">
            <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-center justify-center gap-2 text-xs font-semibold text-zinc-200">
              <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="truncate">{dateDisplay}</span>
            </div>

            {showTime && (
              <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-center justify-center gap-2 text-xs font-semibold text-zinc-200">
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="truncate">{timeDisplay}</span>
              </div>
            )}

            {hasVenueInfo && (
              <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-center justify-center gap-2 text-xs font-semibold text-zinc-200 sm:col-span-1">
                <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="truncate">{data.venue || data.city}</span>
              </div>
            )}
          </div>
        </div>

        {/* Scroll Cue */}
        <div className="mt-6 flex flex-col items-center gap-1.5 text-zinc-500 text-[11px] font-semibold tracking-wider uppercase">
          <span>{data.scrollPrompt || dict.exploreInvitation}</span>
          <ChevronDown className="w-4 h-4 text-amber-400 animate-bounce" />
        </div>
      </section>

      {/* ── Section 2: Message / Story from Host ─────────────────────────── */}
      <section className="py-14 sm:py-20 px-4 bg-gradient-to-b from-zinc-950 via-zinc-900/60 to-zinc-950 border-t border-b border-amber-500/10">
        <div className="max-w-3xl mx-auto text-center">
          {/* Personalized Guest Greeting */}
          <div className="mb-6 inline-block">
            <div className="text-[11px] sm:text-xs font-bold tracking-[0.2em] uppercase text-amber-400/90 mb-1">
              {isVipGuest ? dict.honoredVipGuest : (locale === "fr" ? "Chaleureuse Bienvenue" : "Cordially Welcoming")}
            </div>
            <div
              className="text-2xl sm:text-3xl font-bold text-white tracking-tight"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {data.guest.name}
              {(data.guest.title || data.guest.organization) && (
                <span className="block text-xs font-normal text-zinc-400 mt-1">
                  {[data.guest.title, data.guest.organization].filter(Boolean).join(" · ")}
                </span>
              )}
            </div>
          </div>

          <div className="h-px w-20 bg-gradient-to-r from-transparent via-amber-400/40 to-transparent mx-auto my-5" />

          <h2
            className="text-2xl sm:text-3xl font-bold text-white tracking-tight"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            {data.storyHeadline || dict.messageFromHost}
          </h2>

          <div className="mt-5 text-zinc-300 text-sm sm:text-base leading-relaxed space-y-4 font-light max-w-2xl mx-auto">
            <p className="whitespace-pre-line">
              {data.storyText ||
                (locale === "fr"
                  ? "Nous avons le plaisir de vous inviter à célébrer cet événement exceptionnel à nos côtés. Votre présence rendra cette rencontre inoubliable."
                  : "We are delighted to invite you to celebrate this special occasion with us. Your presence will make our gathering truly memorable.")}
            </p>
          </div>

          {/* Optional Host Portrait */}
          {data.storyImage && (
            <div className="mt-8 relative max-w-[280px] mx-auto aspect-[4/5] rounded-2xl overflow-hidden shadow-2xl border border-amber-500/20">
              <Image
                src={data.storyImage}
                alt="Host portrait"
                fill
                sizes="(max-width: 640px) 280px, 320px"
                className="object-cover"
              />
            </div>
          )}
        </div>
      </section>

      {/* ── Section 3: Event Key Details Cards ───────────────────────────── */}
      <section className="py-12 px-4 max-w-4xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                {dict.when}
              </div>
              <div className="text-sm font-bold text-white mt-0.5">{dateDisplay}</div>
            </div>
          </div>

          {showTime && (
            <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                  {locale === "fr" ? "Heure" : "Time"}
                </div>
                <div className="text-sm font-bold text-white mt-0.5">{timeDisplay}</div>
              </div>
            </div>
          )}

          {hasVenueInfo && (
            <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md flex items-start gap-3.5 sm:col-span-2 lg:col-span-1">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                  {dict.location}
                </div>
                <div className="text-sm font-bold text-white mt-0.5">
                  {data.venue || data.city}
                </div>
                {data.address && <div className="text-[11px] text-zinc-400 mt-0.5">{data.address}</div>}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Section 4: Countdown to Event ────────────────────────────────── */}
      <section className="py-12 sm:py-16 px-4 bg-zinc-900/40 border-t border-b border-zinc-900">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-[11px] font-bold tracking-[0.2em] text-amber-400 uppercase mb-3">
            {locale === "fr" ? "Compte à Rebours" : "Countdown to Event"}
          </div>
          <CountdownTicker targetDate={data.eventDate} timezone={data.timezone} dict={dict} />
        </div>
      </section>

      {/* ── Section 5: Gallery (HIDE-IF-EMPTY) ───────────────────────────── */}
      {data.gallery && data.gallery.length > 0 && (
        <section className="py-16 sm:py-24 px-4 max-w-5xl mx-auto">
          <div className="text-center max-w-xl mx-auto mb-10">
            <div className="text-[11px] font-bold tracking-[0.2em] text-amber-400 uppercase mb-2">
              {dict.visualHighlights}
            </div>
            <h2
              className="text-2xl sm:text-3xl font-bold text-white tracking-tight"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {dict.galleryAndMemories}
            </h2>
          </div>

          <EditorialGallery images={data.gallery} />
        </section>
      )}

      {/* ── Section 6: Schedule / Timeline (HIDE-IF-EMPTY) ───────────────── */}
      {data.schedule && data.schedule.length > 0 && (
        <section className="py-16 sm:py-24 px-4 bg-zinc-900/60 border-t border-b border-zinc-900">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <div className="text-[11px] font-bold tracking-[0.2em] text-amber-400 uppercase mb-2">
                {dict.orderOfEvents}
              </div>
              <h2
                className="text-2xl sm:text-3xl font-bold text-white tracking-tight"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                {dict.itineraryAndProgram}
              </h2>
            </div>

            <GroupedScheduleView schedule={data.schedule} />
          </div>
        </section>
      )}

      {/* ── Section 7: Venue & Directions (HIDE-IF-EMPTY) ────────────────── */}
      {hasVenueInfo && (
        <section className="py-16 sm:py-24 px-4 max-w-4xl mx-auto">
          <div className="text-center max-w-xl mx-auto mb-10">
            <div className="text-[11px] font-bold tracking-[0.2em] text-amber-400 uppercase mb-2">
              {dict.locationAndTravel}
            </div>
            <h2
              className="text-2xl sm:text-3xl font-bold text-white tracking-tight"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {dict.venueAndDirections}
            </h2>
          </div>

          <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-zinc-800">
              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-white">
                  {data.venue || dict.venues}
                </h3>
                {data.address && (
                  <p className="text-xs sm:text-sm text-zinc-400 mt-1 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
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
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 transition shrink-0"
              >
                <span>{dict.getDirections}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Embedded Map (Only if coordinates or address exist) */}
            {hasMapCoordinates && (
              <div className="mt-6 rounded-2xl overflow-hidden border border-zinc-800">
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
              <div className="mt-5 p-4 rounded-2xl bg-zinc-800/40 border border-zinc-800 text-xs text-zinc-300 flex items-start gap-3">
                <Car className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block mb-0.5">{dict.parkingAndArrival}</strong>
                  {data.parkingNotes}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Section 8: Dress Code & Accommodations (HIDE-IF-EMPTY) ───────── */}
      {(data.dressCode || (data.accommodations && data.accommodations.length > 0) || data.additionalNotes) && (
        <section className="py-16 px-4 bg-zinc-900/40 border-t border-b border-zinc-900">
          <div className="max-w-4xl mx-auto space-y-10">
            {data.dressCode && (
              <div className="text-center max-w-xl mx-auto">
                <div className="inline-flex p-2.5 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-2.5">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="text-[10px] font-bold tracking-[0.2em] text-amber-400 uppercase">
                  {dict.attireGuidelines}
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mt-1">
                  {data.dressCode}
                </h3>
                {data.dressCodeNotes && (
                  <p className="mt-2 text-xs sm:text-sm text-zinc-400 leading-relaxed">
                    {data.dressCodeNotes}
                  </p>
                )}
              </div>
            )}

            {data.accommodations && data.accommodations.length > 0 && (
              <div>
                <h4 className="text-[10px] font-bold tracking-[0.2em] text-amber-400 uppercase text-center mb-4">
                  {dict.recommendedAccommodations}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {data.accommodations.map((hotel, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <Hotel className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-white text-sm">{hotel.name}</div>
                          {hotel.notes && (
                            <div className="text-xs text-zinc-400 mt-0.5">{hotel.notes}</div>
                          )}
                        </div>
                      </div>
                      {hotel.bookingUrl && (
                        <a
                          href={hotel.bookingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold shrink-0 flex items-center gap-1 transition"
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
              <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 max-w-2xl mx-auto flex items-start gap-3">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line">
                  <strong className="text-white block mb-0.5">{dict.importantInfo}</strong>
                  {data.additionalNotes}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Section 9 & 10: "Your Invitation" Card, Pass & RSVP ─────────── */}
      <section id="rsvp-section" className="py-16 sm:py-24 px-4 max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-400/30 bg-amber-500/10 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300 mb-2.5">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            {dict.officialGuestPass}
          </div>
          <h2
            className="text-2xl sm:text-4xl font-bold text-white tracking-tight"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            {dict.yourInvitationAndRsvp}
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1.5">
            {dict.kindlyConfirm}
          </p>
        </div>

        {/* Personalized Pass Card */}
        <div className="rounded-3xl border border-amber-500/30 bg-gradient-to-b from-zinc-900 via-zinc-900/95 to-zinc-950 p-6 sm:p-8 shadow-2xl text-center relative overflow-hidden">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">
            {isVipGuest ? dict.vipGuestPass : dict.officialGuestPass}
          </span>
          <h3
            className="text-2xl sm:text-3xl font-bold text-white mt-1 tracking-tight"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            {data.guest.name}
          </h3>
          {(data.guest.title || data.guest.organization) && (
            <p className="text-xs text-zinc-400 mt-0.5 font-medium">
              {[data.guest.title, data.guest.organization].filter(Boolean).join(" · ")}
            </p>
          )}

          {/* Seating Assignment Badge (Only if seat provided) */}
          {data.seat && (
            <div className="my-5 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs font-bold">
              <Armchair className="w-4 h-4 text-amber-400" />
              <span>{dict.assignedSeat}: {data.seat.label}</span>
            </div>
          )}

          {/* Feedback Banner */}
          {rsvpFeedback && (
            <div
              className={`my-4 p-3.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 animate-fade-in ${
                rsvpFeedback.type === "success"
                  ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
                  : "bg-rose-500/15 border border-rose-500/30 text-rose-400"
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

          {/* Interactive Decision Actions */}
          <div className="my-6 p-5 rounded-2xl bg-zinc-950/80 border border-zinc-800 text-center">
            <p className="text-[11px] font-black uppercase tracking-wider text-zinc-300 mb-3.5">
              {dict.willYouJoinUs}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-sm mx-auto">
              <button
                type="button"
                onClick={() => handleRsvpAction("accepted")}
                disabled={submittingRsvp || currentRsvp === "accepted"}
                className={`py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                  currentRsvp === "accepted"
                    ? "bg-emerald-600 text-white shadow-lg cursor-default"
                    : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40"
                }`}
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
                className={`py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                  currentRsvp === "declined"
                    ? "bg-rose-600 text-white shadow-lg cursor-default"
                    : "bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40"
                }`}
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

          {/* QR Code Pass (Only if ticketInstance provided and not declined) */}
          {data.ticketInstance?.qrCode && currentRsvp !== "declined" && (
            <div className="my-5 p-3.5 rounded-2xl bg-white/5 border border-white/10 max-w-[240px] mx-auto text-center">
              <div className="bg-white p-2.5 rounded-xl inline-block shadow-inner">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                    data.ticketInstance.qrCode
                  )}&color=09090b`}
                  alt="Entry QR Pass"
                  width={140}
                  height={140}
                  className="rounded-lg"
                />
              </div>
              <p className="mt-1.5 text-[9px] font-mono uppercase tracking-widest text-zinc-400">
                {dict.scanForAdmission}
              </p>
            </div>
          )}

          {/* ── Section 11: Calendar & Share Actions ───────────────────────── */}
          <div className="pt-5 border-t border-zinc-800/80 flex flex-wrap items-center justify-center gap-2.5 text-xs">
            <button
              type="button"
              onClick={downloadIcsFile}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold transition"
            >
              <CalendarPlus className="w-3.5 h-3.5 text-amber-400" />
              <span>{dict.downloadIcal}</span>
            </button>

            <a
              href={getGoogleCalendarUrl()}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold transition"
            >
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>{dict.googleCalendar}</span>
            </a>

            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold transition"
            >
              <Share2 className="w-3.5 h-3.5 text-amber-400" />
              <span>{copiedLink ? dict.copiedLink : dict.share}</span>
            </button>
          </div>
        </div>
      </section>

      {/* ── Section 12: Footer ───────────────────────────────────────────── */}
      <footer className="py-10 border-t border-zinc-900 text-center text-xs text-zinc-500 space-y-1.5">
        <p className="text-zinc-400 font-medium">
          {data.title} {data.city ? `· ${data.city}` : ""}
        </p>
        <p className="text-[11px] text-zinc-600">
          {dict.poweredByAldriva}
        </p>
      </footer>
    </div>
  );
}

// ── Subcomponent: Grouped Schedule View ──────────────────────────────────────
function GroupedScheduleView({ schedule }: { schedule: InvitationScheduleItem[] }) {
  const hasDayGrouping = schedule.some((item) => Boolean(item.day));

  if (!hasDayGrouping) {
    return (
      <div className="relative pl-6 sm:pl-8 border-l-2 border-amber-500/30 space-y-8 ml-4 sm:ml-8">
        {schedule.map((item, idx) => (
          <ScheduleItemCard key={idx} item={item} />
        ))}
      </div>
    );
  }

  // Group by day label
  const groups = schedule.reduce((acc, item) => {
    const key = item.day || "Event Schedule";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, InvitationScheduleItem[]>);

  return (
    <div className="space-y-10">
      {Object.entries(groups).map(([dayLabel, items], gIdx) => (
        <div key={gIdx}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs font-bold uppercase tracking-wider text-amber-300 mb-4 ml-4 sm:ml-8">
            <Compass className="w-3.5 h-3.5" />
            <span>{dayLabel}</span>
          </div>
          <div className="relative pl-6 sm:pl-8 border-l-2 border-amber-500/30 space-y-8 ml-4 sm:ml-8">
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
    <div className="relative group">
      <div className="absolute -left-[31px] sm:-left-[39px] top-1.5 w-3.5 h-3.5 rounded-full bg-amber-400 border-4 border-zinc-950 shadow-md shadow-amber-400/50 group-hover:scale-125 transition-transform" />

      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-md hover:border-amber-500/40 transition">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-md border border-amber-500/20">
            {item.time}
          </span>
          {item.badge && (
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">
              {item.badge}
            </span>
          )}
        </div>

        <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
          {item.title}
        </h3>

        {item.description && (
          <p className="mt-1.5 text-xs sm:text-sm text-zinc-300 leading-relaxed font-light">
            {item.description}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Subcomponent: Countdown Ticker ───────────────────────────────────────────
function CountdownTicker({
  targetDate,
  timezone,
  dict,
}: {
  targetDate: string;
  timezone?: string | null;
  dict?: import("@/lib/invitation-i18n").InvitationDictionary;
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
      <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold text-xs sm:text-sm">
        <Sparkles className="w-4 h-4 text-amber-400" />
        <span>{dict ? dict.celebrationUnderway : "The event celebration is currently underway!"}</span>
      </div>
    );
  }

  const units = [
    { label: dict?.days || "Days", value: timeLeft.days },
    { label: dict?.hours || "Hours", value: timeLeft.hours },
    { label: dict?.minutes || "Min", value: timeLeft.minutes },
    { label: dict?.seconds || "Sec", value: timeLeft.seconds },
  ];

  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-3.5 max-w-sm sm:max-w-md mx-auto">
      {units.map((unit, idx) => (
        <div
          key={idx}
          className="p-3 sm:p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-lg flex flex-col items-center justify-center"
        >
          <span
            className="text-xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight font-mono tabular-nums lining-nums leading-none"
            style={{
              fontVariantNumeric: "lining-nums tabular-nums",
              fontFeatureSettings: '"lnum" 1, "tnum" 1',
            }}
          >
            {String(unit.value).padStart(2, "0")}
          </span>
          <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-amber-400/90 mt-2.5">
            {unit.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Subcomponent: Editorial Mixed-Aspect Gallery ─────────────────────────────
function EditorialGallery({ images }: { images: InvitationGalleryItem[] }) {
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

  // Touch swipe support for mobile lightbox
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

  // Layout arrangement based on count rules
  const count = images.length;

  return (
    <>
      {/* 1 Image: Large Editorial Hero */}
      {count === 1 && (
        <div className="max-w-2xl mx-auto">
          <button
            type="button"
            onClick={() => setActiveIdx(0)}
            className="w-full relative aspect-[16/10] rounded-3xl overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-amber-400/50 transition cursor-pointer text-left group shadow-xl"
          >
            <Image
              src={images[0].url}
              alt={images[0].alt || images[0].caption || "Gallery photo"}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover group-hover:scale-105 transition-transform duration-500"
            />
            {images[0].caption && (
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent p-4 flex items-end">
                <span className="text-xs text-zinc-200 font-medium">{images[0].caption}</span>
              </div>
            )}
          </button>
        </div>
      )}

      {/* 2 Images: Balanced Dual Frame */}
      {count === 2 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
          {images.map((img, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveIdx(idx)}
              className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-amber-400/50 transition cursor-pointer text-left group shadow-lg"
            >
              <Image
                src={img.url}
                alt={img.alt || img.caption || `Gallery photo ${idx + 1}`}
                fill
                sizes="(max-width: 640px) 100vw, 400px"
                className="object-cover group-hover:scale-105 transition-transform duration-500"
              />
              {img.caption && (
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent p-3 flex items-end opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-xs text-zinc-200 font-medium">{img.caption}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* 3 Images: 1 Leading Portrait + 2 Stacked Landscape Tiles */}
      {count === 3 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 max-w-4xl mx-auto">
          <button
            type="button"
            onClick={() => setActiveIdx(0)}
            className="sm:col-span-2 relative aspect-[16/10] sm:aspect-auto sm:h-full rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-amber-400/50 transition cursor-pointer group shadow-lg"
          >
            <Image
              src={images[0].url}
              alt={images[0].alt || images[0].caption || "Gallery photo 1"}
              fill
              sizes="(max-width: 640px) 100vw, 600px"
              className="object-cover group-hover:scale-105 transition-transform duration-500"
            />
            {images[0].caption && (
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent p-3 flex items-end">
                <span className="text-xs text-zinc-200 font-medium">{images[0].caption}</span>
              </div>
            )}
          </button>

          <div className="flex flex-col gap-3.5">
            {images.slice(1, 3).map((img, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveIdx(idx + 1)}
                className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-amber-400/50 transition cursor-pointer group shadow-md"
              >
                <Image
                  src={img.url}
                  alt={img.alt || img.caption || `Gallery photo ${idx + 2}`}
                  fill
                  sizes="(max-width: 640px) 100vw, 300px"
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4+ Images: Responsive Editorial Mosaic Grid */}
      {count >= 4 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          {images.map((img, idx) => {
            const isFeatured = idx === 0 || (count >= 8 && idx === 4);
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveIdx(idx)}
                className={`group relative rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-amber-400/50 transition cursor-pointer text-left shadow-md ${
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
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                />
                {img.caption && (
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex items-end">
                    <span className="text-xs text-white font-medium line-clamp-2">
                      {img.caption}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Lightbox Modal with Mobile Swipe */}
      {activeIdx !== null && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in touch-none select-none"
          onClick={() => setActiveIdx(null)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <button
            type="button"
            onClick={() => setActiveIdx(null)}
            className="absolute top-4 right-4 p-3 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-white z-50"
            aria-label="Close image preview"
          >
            <X className="w-5 h-5" />
          </button>

          {images.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className="absolute left-3 sm:left-6 p-3 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-white z-50 hidden sm:block"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          {images.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="absolute right-3 sm:right-6 p-3 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-white z-50 hidden sm:block"
              aria-label="Next image"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
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
              <p className="mt-3 text-center text-xs sm:text-sm text-zinc-300 max-w-md">
                {images[activeIdx].caption}
              </p>
            )}
            <div className="text-[10px] text-zinc-500 font-mono mt-1">
              {activeIdx + 1} of {images.length} (swipe on mobile)
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Subcomponent: Music Audio Controller ─────────────────────────────────────
function FloatingMusicPlayer({ audioUrl, title }: { audioUrl: string; title?: string | null }) {
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
        className={`flex items-center gap-2 px-3 py-2 rounded-full border shadow-2xl backdrop-blur-lg transition-all ${
          isPlaying
            ? "bg-amber-500/20 border-amber-400 text-amber-300 shadow-amber-950/50"
            : "bg-zinc-900/90 border-zinc-700 text-zinc-400 hover:text-zinc-200"
        }`}
        aria-label={isPlaying ? "Pause invitation music" : "Play invitation music"}
      >
        {isPlaying ? (
          <Volume2 className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
        ) : (
          <VolumeX className="w-3.5 h-3.5" />
        )}

        <span className="text-[11px] font-bold tracking-wider uppercase hidden sm:inline max-w-[120px] truncate">
          {isPlaying ? (title || "Playing Music") : "Music"}
        </span>

        {isPlaying && (
          <span className="flex items-center gap-0.5 h-2.5">
            <span className="w-0.5 h-2.5 bg-amber-400 animate-bounce" />
            <span className="w-0.5 h-1.5 bg-amber-400 animate-bounce delay-75" />
            <span className="w-0.5 h-2.5 bg-amber-400 animate-bounce delay-150" />
          </span>
        )}
      </button>
    </div>
  );
}
