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

import React, { useState, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import {
  CheckCircle2,
  XCircle,
  CalendarPlus,
  Share2,
  Volume2,
  VolumeX,
  ExternalLink,
  Check,
  Loader2,
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
import {
  getInvitationDictionary,
  formatLocalizedEventDate,
  InvitationLocale,
} from "@/lib/invitation-i18n";
import { downloadIcsFile as triggerIcsDownload, generateGoogleCalendarUrl } from "@/lib/event-time";
import VenueMapClient from "@/components/VenueMapClient";
import { InvitationGalleryGrid } from "@/components/invitation/InvitationGalleryGrid";
import { SharedNote } from "@/components/invitation/SharedNote";

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
  /** General share-link mode: guest-only blocks render as a neutral note. */
  shared?: boolean;
}

export function InvitationTemplateBirthday({ data, onRsvp, className = "", shared = false }: Props) {
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
        text: response === "accepted" ? dict.birthdayConfirmed : dict.birthdayDeclined,
      });
    } catch {
      if (onRsvp) {
        setRsvpFeedback({ type: "error", text: dict.rsvpFailed });
      } else {
        setCurrentRsvp(response);
        setRsvpFeedback({
          type: "success",
          text: response === "accepted" ? dict.previewConfirmed : dict.previewDeclined,
        });
      }
    } finally {
      setSubmittingRsvp(false);
    }
  }

  // ── 4. Calendar Helpers ──────────────────────────────────────────────────
  function downloadIcsFile() {
    if (!data.eventDate) return;
    triggerIcsDownload(
      {
        title: data.title,
        description: `Birthday Celebration for ${data.celebrantName || data.guest?.name || "Party Guest"}`,
        venue: data.venue,
        address: data.address,
        startDate: data.eventDate,
        endDate: data.endDate,
        timezone: data.timezone || "UTC",
      },
      `party-${data.title.toLowerCase().replace(/[^a-z0-9]/g, "-")}.ics`
    );
  }

  function getGoogleCalendarUrl() {
    if (!data.eventDate) return "#";
    return generateGoogleCalendarUrl({
      title: data.title,
      description: `Birthday Celebration for ${data.celebrantName || data.guest?.name || "Party Guest"}`,
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
        id="inv-hero"
        aria-label="Birthday Hero"
        className="relative w-full pt-8 sm:pt-14 pb-12 px-4 sm:px-6 flex flex-col items-center text-center"
      >
        {/* Top Eyebrow Sticker (HIDE-IF-EMPTY) */}
        {data.eyebrow && data.eyebrow.trim().length > 0 && (
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border-2 border-(--bday-ink) shadow-[2px_2px_0px_0px_#141218] mb-4 rotate-[-1deg]"
            style={{ background: "var(--bday-yellow)", color: "var(--bday-ink)" }}
          >
            <PartyPopper className="w-4 h-4 text-(--bday-ink)" />
            <span className="text-xs font-black uppercase tracking-wider text-(--bday-ink)">
              {data.eyebrow}
            </span>
          </div>
        )}

        {/* Milestone Age & Celebrant Name */}
        <div className="max-w-3xl mx-auto mb-5">
          {data.ageMilestone && String(data.ageMilestone).trim().length > 0 && (
            <div
              className="inline-block px-3.5 py-1 rounded-lg text-xs sm:text-sm font-extrabold uppercase tracking-widest shadow-[2px_2px_0px_0px_#141218] mb-2 rotate-1"
              style={{ background: "var(--bday-coral)", color: "#FFFFFF" }}
            >
              {data.ageMilestone} {locale === "fr" ? "Anniversaire !" : "Birthday!"}
            </div>
          )}

          <h1
            className="text-4xl sm:text-6xl lg:text-7xl font-black text-(--bday-ink) tracking-tight leading-[1.08] text-balance"
            style={{ fontFamily: FF_DISPLAY }}
          >
            {data.title}
          </h1>

          {data.hostNames && (
            <p className="mt-2 text-sm sm:text-base font-medium text-(--bday-ink-muted)">
              {data.hostNames}
            </p>
          )}

          {data.theme && data.theme.trim().length > 0 && (
            <div
              className="mt-3 inline-block px-3 py-1 rounded-full border border-(--bday-ink) text-xs font-bold text-(--bday-ink) shadow-[2px_2px_0px_0px_#141218]"
              style={{ background: "var(--bday-mint)" }}
            >
              {locale === "fr" ? "Thème :" : "Theme:"} {data.theme}
            </div>
          )}
        </div>

        {/* Tilted Photo Frame with Sticker Badge */}
        <div className="relative my-4 w-full max-w-[340px] sm:max-w-[420px] aspect-[4/3] rounded-3xl overflow-hidden border-4 border-(--bday-ink) shadow-[6px_6px_0px_0px_#141218] rotate-[-1.5deg] motion-reduce:rotate-0 bg-(--bday-yellow)">
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
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-br from-(--bday-yellow) via-(--bday-coral) to-(--bday-purple) text-center text-white">
              <div className="w-16 h-16 rounded-2xl bg-white border-2 border-(--bday-ink) text-(--bday-coral) flex items-center justify-center shadow-[3px_3px_0px_0px_#141218] mb-3">
                <PartyPopper className="w-8 h-8" />
              </div>
              <p
                className="text-2xl sm:text-3xl font-black text-white drop-shadow-[2px_2px_0px_#141218]"
                style={{ fontFamily: FF_DISPLAY }}
              >
                {locale === "fr" ? "Faisons la Fête !" : "Let's Party!"}
              </p>
              <p className="text-xs font-bold uppercase tracking-widest text-(--bday-yellow) mt-1 drop-shadow-[1px_1px_0px_#141218]">
                {data.city || (locale === "fr" ? "Célébration" : "Birthday Bash")}
              </p>
            </div>
          )}
        </div>

        {/* First Viewport Date / Time / Venue Strip (Visible on 390x844 without scrolling) */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:gap-3 max-w-lg mx-auto text-xs font-bold">
          <div className="px-3.5 py-2 rounded-xl bg-white border-2 border-(--bday-ink) shadow-[2px_2px_0px_0px_#141218] flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-(--bday-coral)" />
            <span>{dateDisplay}</span>
          </div>
          {data.timezone && data.eventDate && (
            <div className="px-3.5 py-2 rounded-xl bg-white border-2 border-(--bday-ink) shadow-[2px_2px_0px_0px_#141218] flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-(--bday-indigo)" />
              <span>{timeDisplay}</span>
            </div>
          )}
          {hasVenueInfo && (
            <div className="px-3.5 py-2 rounded-xl bg-white border-2 border-(--bday-ink) shadow-[2px_2px_0px_0px_#141218] flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-(--bday-mint)" />
              <span>{data.venue || data.city}</span>
            </div>
          )}
        </div>

        {data.hashtag && (
          <p className="mt-3 text-xs font-extrabold text-(--bday-indigo) tracking-wider">
            {data.hashtag}
          </p>
        )}
      </section>

      {/* ── Section 2: Celebrant Message & Guest Welcome ───────────────────── */}
              <section id="inv-story" aria-label="Celebrant Message" className="py-14 sm:py-20 px-6 bg-(--bday-bg-alt)">
        <div className="max-w-2xl mx-auto text-center">
          {shared ? (
            <SharedNote locale={locale} />
          ) : (
          <>
          {/* Guest Personalization */}
          <div
            className="inline-block px-4 py-1 rounded-full text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_#141218] mb-2"
            style={{ background: "var(--bday-coral)", color: "#FFFFFF" }}
          >
            {isVipGuest ? dict.vipPartyGuest : dict.welcomeFriend}
          </div>

          <h2
            className="text-3xl sm:text-4xl font-black text-(--bday-ink) mt-1 mb-2"
            style={{ fontFamily: FF_DISPLAY }}
          >
            {data.guest.name}
          </h2>
          {(data.guest.title || data.guest.organization) && (
            <p className="text-xs text-(--bday-ink-muted) mb-6 font-semibold">
              {[data.guest.title, data.guest.organization].filter(Boolean).join(" · ")}
            </p>
          )}
          </>
          )}

          <div className="py-4 text-left space-y-3">
            <h3
              className="text-xl font-black text-(--bday-ink) flex items-center gap-2"
              style={{ fontFamily: FF_DISPLAY }}
            >
              <Sparkles className="w-5 h-5 text-(--bday-yellow)" />
              {data.storyHeadline || dict.messageFromHost}
            </h3>
            <p className="text-sm sm:text-base leading-relaxed text-(--bday-ink-muted) whitespace-pre-line">
              {data.storyText ||
                (locale === "fr"
                  ? "Une année de plus et tellement hâte de célébrer avec les meilleures personnes au monde ! Venez prêts à danser et faire la fête. Rendons cette soirée inoubliable !"
                  : "Another year older and ready to celebrate with the best people in the world! Come ready to dance, drink, and make some noise. Let's make this year unforgettable!")}
            </p>
          </div>

          {/* Optional Host/Celebrant Photo */}
          {data.storyImage && (
            <div className="mt-8 max-w-sm mx-auto aspect-[4/5] relative rounded-3xl overflow-hidden border-4 border-(--bday-ink) shadow-[6px_6px_0px_0px_#141218] rotate-1">
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
              <section id="inv-details" aria-label="Party Details" className="py-14 sm:py-20 px-6 bg-(--bday-bg)">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-xs font-black uppercase tracking-widest text-(--bday-indigo)">
              {dict.needToKnow}
            </span>
            <h2
              className="text-3xl sm:text-4xl font-black text-(--bday-ink) mt-1"
              style={{ fontFamily: FF_DISPLAY }}
            >
              {dict.partyDetails}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* When & Time */}
            <div className="py-4 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-(--bday-ink)/70">
                  {dict.when}
                </span>
                <h3 className="text-lg font-black text-(--bday-ink) mt-1">{dateDisplay}</h3>
                {data.timezone && data.eventDate && (
                  <p className="text-xs font-bold text-(--bday-ink-muted) mt-0.5">{timeDisplay}</p>
                )}
              </div>
            </div>

            {/* Where */}
            {hasVenueInfo && (
              <div className="py-4 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-(--bday-ink)/70">
                    {dict.location}
                  </span>
                  <h3 className="text-lg font-black text-(--bday-ink) mt-1">
                    {data.venue || data.city}
                  </h3>
                  {data.address && (
                    <p className="text-xs font-bold text-(--bday-ink-muted) mt-0.5">
                      {data.address}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Dress Code */}
            {data.dressCode && (
              <div className="py-4 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-(--bday-coral)">
                    {dict.attire}
                  </span>
                  <h3 className="text-lg font-black text-(--bday-ink) mt-1">{data.dressCode}</h3>
                  {data.dressCodeNotes && (
                    <p className="text-xs text-(--bday-ink-muted) mt-0.5">{data.dressCodeNotes}</p>
                  )}
                </div>
              </div>
            )}

            {/* Wishlist / Gift Note */}
            {data.giftNote && (
              <div className="py-4 sm:col-span-2 lg:col-span-1">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-(--bday-purple) flex items-center gap-1">
                    <Gift className="w-3.5 h-3.5" /> {dict.registryNoteTitle}
                  </span>
                  <p className="text-xs mt-2 leading-relaxed text-(--bday-ink-muted) font-medium whitespace-pre-line">
                    {data.giftNote}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Section 4: Countdown (Bold Lining Numbers) ──────────────────────── */}
      <section aria-label="Birthday Countdown" className="py-14 sm:py-20 px-6 bg-(--bday-indigo) text-white">
        <div className="max-w-2xl mx-auto text-center">
          <span className="inline-block px-3 py-1 rounded-full bg-(--bday-yellow) text-(--bday-ink) text-xs font-black uppercase tracking-widest mb-4">
            {locale === "fr" ? "Le Compte à Rebours est Lancé !" : "The Countdown Is On!"}
          </span>
          <BirthdayCountdownTicker targetDate={data.eventDate} timezone={data.timezone} dict={dict} />
        </div>
      </section>

      {/* ── Section 5: Schedule / Party Timeline (HIDE-IF-EMPTY) ────────────── */}
      {data.schedule && data.schedule.length > 0 && (
                  <section id="inv-schedule" aria-label="Party Schedule" className="py-16 sm:py-24 px-6 bg-(--bday-bg)">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-12">
              <span className="text-xs font-black uppercase tracking-widest text-(--bday-coral)">
                {dict.timeline}
              </span>
              <h2
                className="text-3xl sm:text-4xl font-black text-(--bday-ink) mt-1"
                style={{ fontFamily: FF_DISPLAY }}
              >
                {dict.partyLineup}
              </h2>
            </div>

            <div className="space-y-4">
              {data.schedule.map((item: InvitationScheduleItem, idx: number) => (
                <div
                  key={idx}
                  className="py-4 border-t border-(--bday-ink)/15 flex items-start gap-4"
                >
                  <div className="px-3 py-1 rounded-xl bg-(--bday-yellow) border border-(--bday-ink) text-xs font-black text-(--bday-ink) shrink-0">
                    {item.time}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-extrabold text-(--bday-ink)">{item.title}</h4>
                      {item.badge && (
                        <span className="px-2 py-0.5 rounded-full bg-(--bday-mint) text-[10px] font-bold text-(--bday-ink)">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-xs text-(--bday-ink-muted) mt-1 leading-relaxed">
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
                  <section id="inv-gallery" aria-label="Party Gallery" className="py-16 sm:py-24 px-6 bg-(--bday-bg-alt)">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <span className="text-xs font-black uppercase tracking-widest text-(--bday-purple)">
                {dict.visualHighlights}
              </span>
              <h2
                className="text-3xl sm:text-4xl font-black text-(--bday-ink) mt-1"
                style={{ fontFamily: FF_DISPLAY }}
              >
                {dict.gallery}
              </h2>
            </div>

            <BirthdayGallery images={data.gallery} />
          </div>
        </section>
      )}

      {/* ── Section 7: Location & Directions (HIDE-IF-EMPTY) ────────────────── */}
      {hasVenueInfo && (
        <section aria-label="Venue and Location" className="py-16 px-6 bg-(--bday-bg)">
          <div className="max-w-3xl mx-auto">
            <div className="py-4 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <span className="text-xs font-black uppercase tracking-widest text-(--bday-coral)">
                    {dict.venues}
                  </span>
                  <h3
                    className="text-2xl sm:text-3xl font-black text-(--bday-ink) mt-0.5"
                    style={{ fontFamily: FF_DISPLAY }}
                  >
                    {data.venue || dict.location}
                  </h3>
                  {(data.address || data.city) && (
                    <p className="text-sm font-medium text-(--bday-ink-muted) mt-0.5">
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
                  className="px-5 py-2.5 rounded-xl bg-(--bday-yellow) border-2 border-(--bday-ink) text-xs font-black uppercase tracking-wider text-(--bday-ink) shadow-[3px_3px_0px_0px_#141218] hover:translate-y-0.5 transition-all inline-flex items-center gap-1.5 shrink-0"
                >
                  <span>{dict.getDirections}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {hasMapCoordinates && (
                <div>
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
                <p className="text-xs text-(--bday-ink-muted) font-medium">
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
        className="py-16 sm:py-24 px-6 bg-(--bday-bg-alt)"
      >
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-xs font-black uppercase tracking-widest text-(--bday-indigo)">
              {dict.claimYourSpot}
            </span>
            <h2
              className="text-3xl sm:text-5xl font-black text-(--bday-ink) mt-1"
              style={{ fontFamily: FF_DISPLAY }}
            >
              {dict.yourInvitationAndRsvp}
            </h2>
            <p className="mt-2 text-xs sm:text-sm font-semibold text-(--bday-ink-muted)">
              {dict.kindlyConfirm}
            </p>
          </div>

          {/* Chunky Party Pass Ticket */}
          {shared ? (
            <SharedNote locale={locale} />
          ) : (
          <div className="py-4 text-center space-y-6">
            <div>
              <span className="inline-block px-3 py-1 rounded-full bg-(--bday-yellow) border border-(--bday-ink) text-[10px] font-black uppercase tracking-widest text-(--bday-ink)">
                {isVipGuest ? dict.vipPartyPass : dict.officialPartyPass}
              </span>
              <h3
                className="text-3xl sm:text-4xl font-black text-(--bday-ink) mt-2"
                style={{ fontFamily: FF_DISPLAY }}
              >
                {data.guest.name}
              </h3>
              {(data.guest.title || data.guest.organization) && (
                <p className="text-xs font-semibold text-(--bday-ink-muted) mt-1">
                  {[data.guest.title, data.guest.organization].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>

            {/* Seat assignment (if provided) */}
            {data.seat && (
              <div className="p-2.5 rounded-xl bg-(--bday-mint) border border-(--bday-ink) inline-block">
                <span className="text-xs font-extrabold text-(--bday-ink)">
                  🎉 {dict.table}: {data.seat.label}
                  {data.seat.tableName && ` (${data.seat.tableName})`}
                </span>
              </div>
            )}

            {/* RSVP Feedback Banner */}
            {rsvpFeedback && (
              <div
                className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 border-2 border-(--bday-ink) shadow-[2px_2px_0px_0px_#141218] ${
                  rsvpFeedback.type === "success"
                    ? "bg-(--bday-mint) text-(--bday-ink)"
                    : "bg-(--bday-coral) text-white"
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
              <p className="text-xs font-black uppercase tracking-wider text-(--bday-ink)">
                {dict.areYouComing}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-sm mx-auto">
                <button
                  type="button"
                  onClick={() => handleRsvpAction("accepted")}
                  disabled={submittingRsvp || currentRsvp === "accepted"}
                  className="py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 border-2 border-(--bday-ink) shadow-[3px_3px_0px_0px_#141218]"
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
                  <span>{currentRsvp === "accepted" ? `${dict.attending} 🎉` : `${dict.countMeIn} 🎉`}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleRsvpAction("declined")}
                  disabled={submittingRsvp || currentRsvp === "declined"}
                  className="py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 border-2 border-(--bday-ink) shadow-[3px_3px_0px_0px_#141218] bg-white text-(--bday-ink-muted)"
                  style={{
                    textDecoration: currentRsvp === "declined" ? "line-through" : "none",
                  }}
                >
                  {submittingRsvp ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  <span>{currentRsvp === "declined" ? `${dict.declined} 😢` : `${dict.cantMakeIt} 😢`}</span>
                </button>
              </div>
            </div>

            {/* Canvas QR Pass */}
            {data.ticketInstance?.qrCode && currentRsvp !== "declined" && (
              <div className="pt-4 border-t-2 border-dashed border-(--bday-ink)">
                <div className="p-3 bg-(--bday-yellow) rounded-2xl border-2 border-(--bday-ink) inline-block shadow-[3px_3px_0px_0px_#141218]">
                  <BirthdayCanvasQR value={data.ticketInstance.qrCode} size={150} />
                </div>
                <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-(--bday-ink)">
                  {dict.scanAtDoor}
                </p>
              </div>
            )}

            {/* Calendar & Share links */}
            <div className="pt-4 border-t-2 border-(--bday-ink) flex flex-wrap items-center justify-center gap-3 text-xs font-black">
              <button
                type="button"
                onClick={downloadIcsFile}
                className="px-3 py-1.5 rounded-lg bg-(--bday-yellow) border border-(--bday-ink) flex items-center gap-1 shadow-[2px_2px_0px_0px_#141218]"
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                <span>{dict.downloadIcal}</span>
              </button>
              <a
                href={getGoogleCalendarUrl()}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-lg bg-(--bday-mint) border border-(--bday-ink) flex items-center gap-1 shadow-[2px_2px_0px_0px_#141218]"
              >
                <span>{dict.googleCalendar}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                type="button"
                onClick={handleShare}
                className="px-3 py-1.5 rounded-lg bg-white border border-(--bday-ink) flex items-center gap-1 shadow-[2px_2px_0px_0px_#141218]"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{copiedLink ? dict.copiedLink : dict.share}</span>
              </button>
            </div>
          </div>
          )}
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="py-12 border-t-2 border-(--bday-ink) text-center text-xs font-bold text-(--bday-ink-muted) space-y-1 bg-(--bday-bg)">
        <p className="text-(--bday-ink)">
          {data.title}
          {data.city ? ` · ${data.city}` : ""}
        </p>
        <p>{dict.poweredByAldriva}</p>
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
      <p className="text-base font-black text-(--bday-yellow)">
        🎉 {dict ? dict.celebrationUnderway : "It's Party Time! The celebration is live!"} 🎉
      </p>
    );
  }

  const units = [
    { label: dict?.days || "Days", value: timeLeft.days },
    { label: dict?.hours || "Hours", value: timeLeft.hours },
    { label: dict?.minutes || "Min", value: timeLeft.minutes },
    { label: dict?.seconds || "Sec", value: timeLeft.seconds },
  ];

  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-4 max-w-sm sm:max-w-md mx-auto">
      {units.map((unit, idx) => (
        <div
          key={idx}
          className="p-1 flex flex-col items-center text-white"
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
          <span className="mt-3 text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-(--bday-coral)">
            {unit.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Birthday Gallery (shared natural-ratio masonry grid) ────────────────────
function BirthdayGallery({ images }: { images: InvitationGalleryItem[] }) {
  return (
    <InvitationGalleryGrid
      images={images}
      captionClassName="text-xs font-bold text-(--bday-ink) text-center"
      lightboxCaptionClassName="text-xs text-white/90 max-w-md font-bold text-center"
    />
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
        className="flex items-center gap-2 px-3.5 py-2 rounded-2xl border-2 border-(--bday-ink) shadow-[3px_3px_0px_0px_#141218] bg-(--bday-yellow) text-(--bday-ink) transition-all text-xs font-black"
        aria-label={isPlaying ? "Pause party music" : "Play party music"}
      >
        {isPlaying ? (
          <Volume2 className="w-4 h-4 text-(--bday-coral)" />
        ) : (
          <VolumeX className="w-4 h-4 text-(--bday-ink)" />
        )}
        <span className="uppercase tracking-wider hidden sm:inline max-w-[120px] truncate">
          {isPlaying ? (title || "Party Beats") : "Music"}
        </span>
        {isPlaying && (
          <span className="flex items-end gap-0.5 h-3">
            <span className="w-0.5 h-3 bg-(--bday-coral) animate-bounce" />
            <span className="w-0.5 h-2 bg-(--bday-coral) animate-bounce delay-75" />
            <span className="w-0.5 h-3 bg-(--bday-coral) animate-bounce delay-150" />
          </span>
        )}
      </button>
    </div>
  );
}
