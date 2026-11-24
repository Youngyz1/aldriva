"use client";

/**
 * components/invitation/templates/burgundy-gold/BurgundyGoldSections.tsx
 *
 * Stage 2B post-ceremony sections for Burgundy Gold: photo gallery, reception
 * info (welcome/reception times, countdown, month calendar, add-to-calendar,
 * confirm presence), venue, dress code, day programme, guestbook and the guest
 * memories gallery.
 *
 * DUPLICATION NOTE (stage 2B): the interactive pieces below are inline-only in
 * MinimalismDarkBluePageTemplate.tsx and that renderer is frozen, so the logic
 * is re-implemented here for burgundy-gold rather than imported:
 *   - countdown ticker        — minimalism L109 useCountdown
 *   - native <dialog> RSVP    — minimalism L946 (rsvpOpen/rsvpDialogRef/scroll lock)
 *   - guestbook form + feed   — minimalism L864
 *   - add-to-calendar row     — minimalism L780
 * The reusable pieces are imported instead: downloadIcsFile /
 * generateGoogleCalendarUrl (lib/event-time), MusicBlock and MemoriesGallery.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { IconPhoto } from "@tabler/icons-react";
import type { InvitationPageData } from "@/types/invitation-template";
import type { PageActionHandler } from "@/lib/page-actions";
import { getInvitationDictionary } from "@/lib/invitation-i18n";
import { downloadIcsFile, generateGoogleCalendarUrl, type CalendarEventPayload } from "@/lib/event-time";
import { MusicBlock } from "@/components/invitation/blocks/InvitationPresentationBlocks";
import { SAMPLE_MEMORY_ITEMS } from "@/lib/memories/sample-memories";
import type { MemoryGalleryPage } from "@/lib/memories/gallery-types";
import {
  GiftBoxArt,
  HeartMark,
  MusicButtonFace,
  BurgundyGoldGalleryViewer,
  type GalleryPhoto,
} from "@/components/invitation/templates/burgundy-gold/burgundy-gold-art";
import {
  burgundyCountdownTarget,
  burgundyWelcomeTime,
  burgundyDressSwatches,
  burgundyGalleryTiles,
  burgundyHasMusic,
  burgundyMonthCalendar,
  burgundyReceptionTimes,
  burgundyScheduleEntries,
  burgundyShowGuestbook,
  burgundyShowMemories,
  burgundyVenue,
  burgundyWeekdayHeaders,
} from "@/components/invitation/templates/burgundy-gold/burgundy-gold-data";
import { formatInvitationTime, isMapUrlOrCoordinate } from "@/lib/invitation-text-format";

const GOLD = "#cdb073";
const GOLD_BRIGHT = "#e7cf98";
const CREAM = "#f6ead0";
const BURGUNDY_DEEP = "#2b0710";

const SECTION_WIDTH = "mx-auto w-full max-w-md sm:max-w-[480px]";

/**
 * Unfilled section shell: no fill, no border, no shadow — the page backdrop
 * shows through with 1px gold hairlines down both sides and a divider across
 * the top, matching the ceremony panel. Corners are opt-in (reception only).
 */
function SectionFrame({
  children,
  align = "center",
}: {
  children: ReactNode;
  align?: "center" | "left";
}) {
  return (
    <div className={`${SECTION_WIDTH} px-5 pb-10 pt-12 sm:px-8`}>
      <div className={align === "center" ? "text-center" : undefined}>{children}</div>
    </div>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-center text-base font-semibold uppercase tracking-[0.22em] sm:text-lg" style={{ color: GOLD_BRIGHT }}>
      {children}
  </h2>
  );
}

/** Post-mount-only countdown, mirroring minimalism's useCountdown. */
function useBurgundyCountdown(targetIso: string | null | undefined) {
  const [state, setState] = useState<{ days: number; hours: number; minutes: number; seconds: number; isPast: boolean } | null>(null);
  const target = burgundyCountdownTarget(targetIso);
  useEffect(() => {
    if (target === null) {
      setState(null);
      return;
    }
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        setState({ days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true });
        return;
      }
      setState({
        days: Math.floor(diff / 86_400_000),
        hours: Math.floor((diff % 86_400_000) / 3_600_000),
        minutes: Math.floor((diff % 3_600_000) / 60_000),
        seconds: Math.floor((diff % 60_000) / 1_000),
        isPast: false,
      });
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [target]);
  return state;
}

/**
 * Floating music control for uploaded audio: the burgundy face on a round gold
 * button. The shared FloatingMusicControl keeps its own pill, so this is scoped
 * to burgundy-gold and only takes the audio path it can style.
 */
function BurgundyMusicButton({
  audioUrl,
  title,
  playLabel,
  pauseLabel,
}: {
  audioUrl: string;
  title?: string | null;
  playLabel: string;
  pauseLabel: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    return () => audio?.pause();
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }
    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false));
  };

  return (
    <div className="fixed bottom-4 right-4 z-40" data-burgundy-section="music" data-burgundy-music-control="true">
      <audio ref={audioRef} src={audioUrl} loop preload="none" />
      <button
        type="button"
        onClick={toggle}
        aria-pressed={isPlaying}
        aria-label={isPlaying ? pauseLabel : playLabel}
        title={title?.trim() || undefined}
        className="block rounded-full transition-transform hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ outlineColor: GOLD_BRIGHT }}
      >
        <MusicButtonFace size={56} playing={isPlaying} />
      </button>
    </div>
  );
}

export interface BurgundyGoldSectionsProps {
  data: InvitationPageData;
  sectionSettings: Record<string, unknown>;
  mode: "preview" | "live" | "shared";
  hasAction?: boolean;
  onAction?: PageActionHandler;
  /** Rendered action_portal block; the RSVP dialog body. */
  actionPortal: ReactNode;
};

export function BurgundyGoldSections({
  data,
  sectionSettings,
  mode,
  hasAction,
  onAction,
  actionPortal,
}: BurgundyGoldSectionsProps) {
  const t = useTranslations("Events");
  const dictionary = getInvitationDictionary(data.locale ?? "en");
  const localeCode = data.locale === "fr" ? "fr-FR" : "en-US";
  const rootRef = useRef<HTMLDivElement>(null);

  const getScrollLockTarget = useCallback((): HTMLElement | null => {
    if (typeof document === "undefined") return null;
    return rootRef.current?.closest<HTMLElement>('[data-testid="invitation-preview"]') ?? document.body;
  }, []);

  // ── Gallery ────────────────────────────────────────────────────────────────
  const galleryTiles = burgundyGalleryTiles(data.gallery);
  const allPhotos = useMemo(
    () => (data.gallery ?? []).filter((item) => item?.url?.trim()),
    [data.gallery]
  );
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerPhotos, setViewerPhotos] = useState<GalleryPhoto[]>([]);
  const [viewerTrigger, setViewerTrigger] = useState<HTMLElement | null>(null);
  /** Gallery tiles whose `src` failed to load; used to render a visible fallback. */
  const [failedGalleryTiles, setFailedGalleryTiles] = useState<Set<string>>(new Set());

  // ── Reception: countdown, calendar, add-to-calendar ─────────────────────────
  const countdown = useBurgundyCountdown(data.eventDate);
  const calendar = burgundyMonthCalendar(data.eventDate, data.timezone);
  const monthLabel = calendar
    ? new Intl.DateTimeFormat(localeCode, { month: "long" }).format(new Date(calendar.year, calendar.monthIndex, 1))
    : null;
  const times = burgundyReceptionTimes(data.venues, burgundyWelcomeTime(data.schedule));
  const calendarPayload: CalendarEventPayload | null = data.eventDate
    ? {
        title: data.title,
        venue: data.venues?.find((venue) => /reception|réception/i.test(venue.label ?? ""))?.name
          ?? data.venue
          ?? undefined,
        address: data.address ?? undefined,
        startDate: data.eventDate,
        endDate: data.endDate ?? undefined,
        timezone: data.timezone || "UTC",
      }
    : null;

  const hasRsvp = Boolean(actionPortal);
  const [rsvpOpen, setRsvpOpen] = useState(false);
  const rsvpDialogRef = useRef<HTMLDialogElement>(null);
  const nestedDialogEscapeRef = useRef(false);

  // The gift box (burgundy-gold-art) plays its own ~1s open animation, then
  // calls this; tapping its "Confirm presence" CTA does the same. Both are
  // the only RSVP trigger on this page, matching "Confirm presence" opening
  // the same dialog as before. Closing the dialog eases the box back to
  // idle via `revealed`, so it can be replayed.
  const returnFocusRef = useRef<HTMLElement | null>(null);

  function closeRsvp() {
    setRsvpOpen(false);
    const target = returnFocusRef.current;
    if (target && typeof target.focus === "function") target.focus();
    returnFocusRef.current = null;
  }

  function activateGift() {
    if (!hasRsvp) return;
    returnFocusRef.current = rootRef.current?.querySelector<HTMLElement>("[data-burgundy-gift-open]") ?? null;
    setRsvpOpen(true);
  }

  useEffect(() => {
    if (!rsvpOpen) return;
    const dialog = rsvpDialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    const target = getScrollLockTarget();
    if (!target) return;
    const previousOverflow = target.style.overflow;
    target.style.overflow = "hidden";
    return () => {
      target.style.overflow = previousOverflow;
      if (dialog?.open) dialog.close();
    };
  }, [rsvpOpen, getScrollLockTarget]);

  // ── Venue / dress code / programme ──────────────────────────────────────────
  const venue = burgundyVenue(data);
  const swatches = burgundyDressSwatches(data.dressCodeSwatches);
  const dressCodeLine = data.dressCode?.trim() || data.dressCodeNotes?.trim() || null;
  const programme = burgundyScheduleEntries(data.schedule);

  // ── Guestbook ───────────────────────────────────────────────────────────────
  const showGuestbook = burgundyShowGuestbook(sectionSettings);
  const canWriteGuestbook = mode !== "shared";
  const [wishes, setWishes] = useState<{ name: string; text: string }[]>([]);
  const initialWishName = data.guest?.name && !data.guest.isSample && !data.guest.isPlaceholder ? data.guest.name : "";
  const [wishName, setWishName] = useState(initialWishName);
  const [wishText, setWishText] = useState("");
  const [wishBusy, setWishBusy] = useState(false);
  const [wishError, setWishError] = useState("");
  const [wishSuccess, setWishSuccess] = useState(false);
  const wishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (wishTimerRef.current) clearTimeout(wishTimerRef.current);
  }, []);
  const sampleWishes = useMemo(
    () => [
      { name: t("burgundyWishName0"), text: t("burgundyWishText0") },
      { name: t("burgundyWishName1"), text: t("burgundyWishText1") },
      { name: t("burgundyWishName2"), text: t("burgundyWishText2") },
    ],
    [t]
  );
  const feed = [...wishes, ...(mode !== "shared" && !hasAction ? sampleWishes : [])];
  const sendWish = async () => {
    const name = wishName.trim();
    const text = wishText.trim();
    if (!name || !text || text.length > 500) {
      setWishError(t("burgundyGuestbookError"));
      return;
    }

    setWishBusy(true);
    setWishError("");

    try {
      if (onAction) {
        await onAction({ actionType: "GUESTBOOK_WISH", name, message: text });
      }
      setWishes((current) => [{ name, text }, ...current]);
      setWishText("");
      setWishSuccess(true);
      if (wishTimerRef.current) clearTimeout(wishTimerRef.current);
      wishTimerRef.current = setTimeout(() => setWishSuccess(false), 4000);
    } catch {
      setWishError(t("burgundyGuestbookError"));
    } finally {
      setWishBusy(false);
    }
  };

  // ── Memories ────────────────────────────────────────────────────────────────
  const showMemories = burgundyShowMemories(sectionSettings, data);
  const [memoriesPhotos, setMemoriesPhotos] = useState<GalleryPhoto[]>([]);
  const [memoriesLoaded, setMemoriesLoaded] = useState(false);
  const loadMemoriesPage = useCallback(
    async (cursor: string | null): Promise<MemoryGalleryPage> => {
      if (!data.memoriesToken) return { items: [], nextCursor: null };
      const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const res = await fetch(`/api/invitation/${encodeURIComponent(data.memoriesToken)}/memories${qs}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load memories");
      return (await res.json()) as MemoryGalleryPage;
    },
    [data.memoriesToken]
  );

  useEffect(() => {
    if (!showMemories || memoriesLoaded) return;
    if (data.memoriesSample) {
      setMemoriesPhotos(
        SAMPLE_MEMORY_ITEMS.map((item) => ({
          url: item.url,
          alt: item.url,
          width: item.width ?? null,
          height: item.height ?? null,
        }))
      );
      setMemoriesLoaded(true);
      return;
    }
    let cancelled = false;
    loadMemoriesPage(null)
      .then((page) => {
        if (cancelled) return;
        setMemoriesPhotos(
          page.items.map((item) => ({
            url: item.url,
            alt: item.url,
            width: item.width ?? null,
            height: item.height ?? null,
          }))
        );
      })
      .catch(() => {
        // keep the grid empty on failure
      })
      .finally(() => {
        if (!cancelled) setMemoriesLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [showMemories, memoriesLoaded, data.memoriesSample, loadMemoriesPage]);

  const hasMusic = burgundyHasMusic(data);
  // Hide the reception section entirely when it has nothing to show.
  const hasReceptionContent = Boolean(times || countdown || calendar || calendarPayload || hasRsvp);

  return (
    <div ref={rootRef} data-burgundy-sections="true" className="relative">
      {/* 4. Photo gallery — 2 × 2 mosaic with a "+N" badge on the last tile. */}
      {galleryTiles ? (
        <section id="inv-gallery" data-burgundy-section="gallery" className="px-4 pb-16 sm:px-6">
          <div className={SECTION_WIDTH}>
            <SectionHeading>{t("burgundyGalleryHeading")}</SectionHeading>
            <div className="mt-8 grid grid-cols-2 gap-2 sm:gap-3">
              {galleryTiles.map((tile) => (
                <button
                  key={`${tile.url}-${tile.index}`}
                  type="button"
                  onClick={(event) => {
                    setViewerTrigger(event.currentTarget as HTMLElement);
                    setViewerPhotos(
                      allPhotos.map((photo) => ({ url: photo.url, alt: photo.alt ?? "", width: photo.width, height: photo.height }))
                    );
                    setViewerIndex(tile.index);
                    setViewerOpen(true);
                  }}
                  aria-label={`${t("burgundyGalleryOpen")} ${tile.index + 1}`}
                  data-burgundy-gallery-tile={tile.index}
                  className="group relative aspect-square overflow-hidden rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ border: `1px solid ${GOLD}66`, outlineColor: GOLD_BRIGHT }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={tile.url}
                    alt={tile.alt}
                    loading="lazy"
                    className={`h-full w-full object-cover ${failedGalleryTiles.has(tile.url) ? "hidden" : ""}`}
                    onError={() => {
                      setFailedGalleryTiles((previous) => new Set([...previous, tile.url]));
                    }}
                  />
                  {failedGalleryTiles.has(tile.url) ? (
                    <span
                      data-burgundy-gallery-more={tile.remaining}
                      className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-2xl"
                      style={{ backgroundColor: BURGUNDY_DEEP + "cc", color: GOLD_BRIGHT }}
                    >
                      <IconPhoto size={22} stroke={1.5} aria-hidden="true" />
                      {tile.remaining > 0 ? `+${tile.remaining}` : null}
                    </span>
                  ) : tile.remaining > 0 ? (
                    <span
                      data-burgundy-gallery-more={tile.remaining}
                      aria-hidden="true"
                      className="absolute inset-0 flex items-center justify-center text-2xl font-semibold"
                      style={{ backgroundColor: `${BURGUNDY_DEEP}99`, color: GOLD_BRIGHT }}
                    >
                      +{tile.remaining}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* 5. Reception info — welcome/reception times, countdown, calendar, add-to-calendar, RSVP. */}
      {hasReceptionContent ? (
      <section id="inv-reception" data-burgundy-section="reception" className="px-4 pb-16 sm:px-6">
        <SectionFrame>
          <SectionHeading>{t("burgundyReceptionHeading")}</SectionHeading>

          {times ? (
            <dl className="mt-6 grid grid-cols-2 gap-3 text-base sm:text-lg" data-burgundy-reception-times="true">
              {times.welcome ? (
                <div className="pr-3">
                  <dt className="text-sm uppercase tracking-[0.16em]" style={{ color: `${CREAM}aa` }}>
                    {t("burgundyWelcomeLabel")}
                  </dt>
                  <dd className="mt-1 tracking-[0.12em]" style={{ color: GOLD_BRIGHT }}>
                    {formatInvitationTime(times.welcome, localeCode === "fr-FR" ? "fr" : "en") || times.welcome}
                  </dd>
                </div>
              ) : null}
              {times.reception ? (
                <div className="pl-3">
                  <dt className="text-sm uppercase tracking-[0.16em]" style={{ color: `${CREAM}aa` }}>
                    {t("burgundyReceptionTimeLabel")}
                  </dt>
                  <dd className="mt-1 tracking-[0.12em]" style={{ color: GOLD_BRIGHT }}>
                    {formatInvitationTime(times.reception, localeCode === "fr-FR" ? "fr" : "en") || times.reception}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          {countdown ? (
            <div className="mt-7" data-burgundy-section="countdown">
              <p className="text-xs uppercase tracking-[0.14em]" style={{ color: `${CREAM}99` }}>
                {t("burgundyCountdownLabel")}
              </p>
              {countdown.isPast ? (
                <p className="mt-3 text-base italic" style={{ color: `${CREAM}dd` }}>{dictionary.celebrationUnderway}</p>
              ) : (
                <div className="mt-4 grid grid-cols-4 gap-3" aria-label={t("burgundyCountdownLabel")}>
                  {([
                    [countdown.days, dictionary.days],
                    [countdown.hours, dictionary.hours],
                    [countdown.minutes, dictionary.minutes],
                    [countdown.seconds, dictionary.seconds],
                  ] as const).map(([value, label]) => (
                    <div key={label}>
                      <p className="lining-nums tabular-nums text-xl sm:text-2xl" style={{ fontFamily: "var(--font-burgundy-display)", color: GOLD_BRIGHT }}>
                        {value}
                      </p>
                      <p className="text-xs uppercase tracking-[0.12em]" style={{ color: `${CREAM}99` }}>{label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {calendar && monthLabel ? (
            <div
              data-burgundy-section="month-calendar"
              data-burgundy-calendar-day={calendar.eventDay}
              className="mx-auto mt-7 w-full max-w-[260px] rounded-sm px-3 py-4"
              style={{ backgroundColor: CREAM, color: BURGUNDY_DEEP }}
            >
              <p className="text-base">
                <span style={{ fontFamily: "var(--font-burgundy-script)" }}>{monthLabel}</span>{" "}
                <span className="lining-nums tabular-nums" style={{ fontFamily: "var(--font-burgundy-body)" }}>{calendar.year}</span>
              </p>
              <div className="mt-3 grid grid-cols-7 gap-y-1 text-xs uppercase opacity-60">
                {burgundyWeekdayHeaders(localeCode).map((label, index) => <span key={index}>{label}</span>)}
              </div>
              <div className="mt-2 grid grid-cols-7 gap-y-1 text-sm">
                {calendar.weeks.flat().map((cell, index) => (
                  <span key={index} className="relative flex h-6 items-center justify-center">
                    {cell.date ? (
                      cell.isEventDay ? (
                        <span
                          data-burgundy-calendar-heart={cell.date}
                          className="relative flex size-5 items-center justify-center"
                          style={{ color: CREAM }}
                        >
                          <HeartMark size={20} className="absolute inset-0" tone={BURGUNDY_DEEP} />
                          <span className="relative lining-nums tabular-nums text-sm">{cell.date}</span>
                        </span>
                      ) : (
                        <span className="lining-nums tabular-nums">{cell.date}</span>
                      )
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {calendarPayload ? (
            <div className="mt-7 flex flex-wrap items-center justify-center gap-4 pt-5 text-xs" style={{ borderColor: `${GOLD}33` }}>
              <button
                type="button"
                disabled={mode === "preview"}
                onClick={() => mode !== "preview" && downloadIcsFile(calendarPayload)}
                className="font-semibold uppercase tracking-[0.1em] underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ color: GOLD_BRIGHT }}
              >
                {t("burgundyAddToCalendar")}
              </button>
              {mode === "preview" ? (
                <span aria-disabled="true" className="font-semibold uppercase tracking-[0.1em] underline underline-offset-4 opacity-50" style={{ color: GOLD_BRIGHT }}>
                  {t("burgundyGoogleCalendar")}
                </span>
              ) : (
                <a
                  href={generateGoogleCalendarUrl(calendarPayload)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold uppercase tracking-[0.1em] underline underline-offset-4"
                  style={{ color: GOLD_BRIGHT }}
                >
                  {t("burgundyGoogleCalendar")}
                </a>
              )}
            </div>
          ) : null}
        </SectionFrame>
      </section>
      ) : null}

      {/* 6. Venue — map embed, view on map, itinerary. */}
      {venue ? (
        <section id="inv-venue" data-burgundy-section="venue" className="px-4 pb-16 sm:px-6">
          <div className={SECTION_WIDTH}>
            <SectionHeading>{t("burgundyVenueHeading")}</SectionHeading>
            {venue.name ? (
              venue.mapUrl ? (
                <a
                  href={venue.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex min-h-[44px] items-center justify-center text-center text-lg underline underline-offset-4 decoration-[1px] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ fontFamily: "var(--font-burgundy-display)", color: GOLD_BRIGHT, textDecorationColor: `${GOLD_BRIGHT}88`, outlineColor: GOLD_BRIGHT }}
                >
                  {venue.name}
                </a>
              ) : (
                <p className="mt-3 text-center text-lg" style={{ fontFamily: "var(--font-burgundy-display)", color: GOLD_BRIGHT }}>{venue.name}</p>
              )
            ) : null}
            {data.city?.trim() && !isMapUrlOrCoordinate(data.city) && data.city.trim().toLowerCase() !== venue.name?.toLowerCase() ? (
              <p className="mt-1 text-center text-sm leading-5" style={{ color: `${CREAM}b8` }}>{data.city.trim()}</p>
            ) : null}
            {venue.mapUrl ? (
              <a
                href={venue.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-burgundy-venue-link="map-embed"
                aria-label={t("burgundyViewOnMap")}
                className="mt-5 block aspect-[4/3] w-full overflow-hidden rounded-sm cursor-pointer"
                style={{ border: `1px solid ${GOLD}66` }}
              >
                <iframe
                  title={t("burgundyMapTitle")}
                  src={venue.embedUrl ?? undefined}
                  className="h-full w-full border-0 pointer-events-none"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  tabIndex={-1}
                />
              </a>
            ) : (
              <div className="mt-5 aspect-[4/3] w-full overflow-hidden rounded-sm" style={{ border: `1px solid ${GOLD}66` }}>
                <iframe
                  title={t("burgundyMapTitle")}
                  src={venue.embedUrl ?? undefined}
                  className="h-full w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs uppercase tracking-[0.1em]">
              <a
                href={venue.mapUrl ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                data-burgundy-venue-link="map"
                className="font-semibold underline underline-offset-4"
                style={{ color: GOLD_BRIGHT }}
              >
                {t("burgundyViewOnMap")}
              </a>
              <a
                href={venue.directionsUrl ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                data-burgundy-venue-link="itinerary"
                className="font-semibold underline underline-offset-4"
                style={{ color: GOLD_BRIGHT }}
              >
                {t("burgundyItinerary")}
              </a>
            </div>
          </div>
        </section>
      ) : null}

      {/* 7. Dress code — theme line + swatches from mf_dress_code_swatches. */}
      {dressCodeLine || swatches ? (
        <section id="inv-dress-code" data-burgundy-section="dress-code" className="px-4 pb-16 sm:px-6">
          <div className="mx-auto w-full max-w-md text-center">
            <SectionHeading>{t("burgundyDressCodeHeading")}</SectionHeading>
            {dressCodeLine ? (
              <p className="mx-auto mt-4 max-w-sm text-base leading-6" style={{ color: `${CREAM}dd` }}>{dressCodeLine}</p>
            ) : null}
            {swatches ? (
              <div className="mt-5 flex justify-center gap-6" data-burgundy-swatches={swatches.length}>
                {swatches.map((swatch, index) => (
                  <div key={`${swatch.hex}-${index}`} className="flex flex-col items-center">
                    <span
                      className="w-10 h-10 rounded-full"
                      style={{ backgroundColor: swatch.hex, border: `1px solid ${GOLD}66` }}
                      aria-label={swatch.name ?? swatch.hex}
                    />
                    <span className="mt-1 text-sm uppercase tracking-[0.08em]" style={{ color: `${CREAM}99`, whiteSpace: "nowrap" }}>
                      {swatch.name ?? swatch.hex}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* 8. Today's programme — full-width timeline, left gold spine with
          dot markers; ceremony/reception read slightly stronger than the
          rest, matching the other sections' gold/cream palette. */}
      {programme ? (
        <section id="inv-programme" data-burgundy-section="programme" className="px-4 pb-16 sm:px-6">
          <SectionFrame align="left">
            <SectionHeading>{t("burgundyProgramHeading")}</SectionHeading>
            <ol className="mt-8 flex flex-col">
              {programme.map((entry, index) => (
                <li key={`prog-${index}`} className="flex gap-4">
                  <div aria-hidden="true" className="flex w-5 flex-none flex-col items-center">
                    <span
                      className="mt-2 flex-none rounded-full"
                      style={
                        entry.isKeyMoment
                          ? { width: 14, height: 14, backgroundColor: GOLD_BRIGHT, border: `2px solid ${GOLD}80` }
                          : { width: 9, height: 9, backgroundColor: `${GOLD}cc` }
                      }
                    />
                    {index < programme.length - 1 ? (
                      <span className="mt-1 w-px flex-1" style={{ backgroundColor: `${GOLD}40` }} />
                    ) : null}
                  </div>
                  <div className={`min-w-0 flex-1 ${index < programme.length - 1 ? "pb-7" : ""}`}>
                    <time
                      className="block tracking-wide"
                      style={{
                        color: GOLD_BRIGHT,
                        fontFamily: "var(--font-burgundy-display)",
                        fontSize: entry.isKeyMoment ? 22 : 20,
                        fontWeight: entry.isKeyMoment ? 700 : 600,
                      }}
                    >
                      {entry.time}
                    </time>
                    <p
                      className="mt-0.5 leading-6"
                      style={{
                        color: CREAM,
                        fontSize: entry.isKeyMoment ? 18 : 17,
                        fontWeight: entry.isKeyMoment ? 600 : 400,
                      }}
                    >
                      {entry.title}
                    </p>
                    {entry.description ? (
                      <p className="mt-1 text-sm leading-5" style={{ color: `${CREAM}b3` }}>
                        {entry.description}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </SectionFrame>
        </section>
      ) : null}

      {/* 9. Guestbook — typeable in preview/demo; local-only feed (no persistence yet). */}
      {showGuestbook ? (
        <section id="inv-guestbook" data-burgundy-section="guestbook" className="px-4 pb-16 sm:px-6">
          <SectionFrame>
            <SectionHeading>{t("burgundyGuestbookHeading")}</SectionHeading>
            <div className="mt-6 flex flex-col gap-3 items-center">
              <label className="sr-only" htmlFor="burgundy-guestbook-name">{t("burgundyGuestbookName")}</label>
              <input
                id="burgundy-guestbook-name"
                type="text"
                value={wishName}
                onChange={(event) => { setWishName(event.target.value); if (wishError) setWishError(""); }}
                disabled={!canWriteGuestbook || wishBusy}
                placeholder={t("burgundyGuestbookName")}
                data-burgundy-guestbook-field="name"
                maxLength={100}
                className="rounded-sm w-full max-w-md px-3 py-2 text-base disabled:opacity-50"
                style={{ backgroundColor: `${BURGUNDY_DEEP}b3`, border: `1px solid ${GOLD}4d`, color: CREAM }}
              />
              <label className="sr-only" htmlFor="burgundy-guestbook-message">{t("burgundyGuestbookMessage")}</label>
              <textarea
                id="burgundy-guestbook-message"
                rows={6}
                value={wishText}
                onChange={(event) => { setWishText(event.target.value); if (wishError) setWishError(""); }}
                disabled={!canWriteGuestbook || wishBusy}
                placeholder={t("burgundyGuestbookMessage")}
                data-burgundy-guestbook-field="message"
                maxLength={500}
                className="rounded-sm w-full max-w-md px-3 py-2 text-base disabled:opacity-50"
                style={{ backgroundColor: `${BURGUNDY_DEEP}b3`, border: `1px solid ${GOLD}4d`, minHeight: 140, color: CREAM }}
              />
              {wishError ? (
                <p className="text-xs text-rose-300" role="alert">{wishError}</p>
              ) : null}
              {wishSuccess ? (
                <p className="text-xs font-medium" style={{ color: GOLD_BRIGHT }} role="status">
                  {t("burgundyGuestbookSuccess")}
                </p>
              ) : null}
              <button
                type="button"
                onClick={sendWish}
                disabled={!canWriteGuestbook || wishBusy || !wishName.trim() || !wishText.trim()}
                data-burgundy-guestbook-send="true"
                className="rounded-full mx-auto px-5 min-h-[48px] py-3 text-base font-semibold uppercase tracking-[0.1em] disabled:opacity-50"
                style={{ backgroundColor: GOLD, color: BURGUNDY_DEEP }}
              >
                {t("burgundyGuestbookSend")}
              </button>
              {canWriteGuestbook ? (
                <p className="text-xs" style={{ color: `${CREAM}99` }}>{t("burgundyGuestbookNote")}</p>
              ) : null}
            </div>
            {feed.length ? (
              <div className="mt-6 max-h-[13rem] overflow-y-auto overscroll-contain scrollbar-hide" data-burgundy-guestbook-feed="true">
                <ul className="flex flex-col gap-3 p-3 text-base">
                  {feed.map((wish, index) => (
                    <li key={`${wish.name}-${index}`} className="px-3 py-2">
                      <p className="font-semibold" style={{ color: GOLD_BRIGHT }}>{wish.name}</p>
                      <p className="mt-1 leading-6" style={{ color: `${CREAM}dd` }}>{wish.text}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-6 text-base" style={{ color: `${CREAM}99` }}>{t("burgundyGuestbookEmpty")}</p>
            )}
          </SectionFrame>
        </section>
      ) : null}

      {/* 10. Guest memories — inline preview of up to 4 square tiles; nothing
          renders when there are no memories. Tapping a tile (or the +N tile)
          opens the unified viewer at that photo. */}
      {showMemories && memoriesLoaded && memoriesPhotos.length > 0 ? (
        <section id="inv-memories" data-burgundy-section="memories" className="px-4 pb-16 sm:px-6">
          <div className={SECTION_WIDTH}>
            <SectionHeading>{t("burgundyMemoriesTitle")}</SectionHeading>
            <div className="mt-6 grid grid-cols-2 gap-2 sm:gap-3">
              {memoriesPhotos.slice(0, 4).map((photo, index) => {
                const isOverflow = index === 3 && memoriesPhotos.length > 4;
                return (
                  <button
                    key={photo.url}
                    type="button"
                    onClick={(event) => {
                      setViewerTrigger(event.currentTarget as HTMLElement);
                      setViewerPhotos(memoriesPhotos);
                      setViewerIndex(index);
                      setViewerOpen(true);
                    }}
                    aria-label={`${t("burgundyGalleryOpen")} ${index + 1}`}
                    data-burgundy-memories-tile={index}
                    className="group relative aspect-square overflow-hidden rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{ border: `1px solid ${GOLD}66`, outlineColor: GOLD_BRIGHT }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.alt}
                      loading="lazy"
                      className={`h-full w-full object-cover ${failedGalleryTiles.has(photo.url) ? "hidden" : ""}`}
                      onError={() => {
                        setFailedGalleryTiles((previous) => new Set([...previous, photo.url]));
                      }}
                    />
                    {failedGalleryTiles.has(photo.url) ? (
                      <span
                        data-burgundy-memories-more={memoriesPhotos.length - 4}
                        className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-2xl"
                        style={{ backgroundColor: BURGUNDY_DEEP + "cc", color: GOLD_BRIGHT }}
                      >
                        <IconPhoto size={22} stroke={1.5} aria-hidden="true" />
                        {isOverflow ? `+${memoriesPhotos.length - 4}` : null}
                      </span>
                    ) : isOverflow ? (
                      <span
                        data-burgundy-memories-more={memoriesPhotos.length - 4}
                        className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-2xl"
                        style={{ backgroundColor: `${BURGUNDY_DEEP}cc`, color: GOLD_BRIGHT }}
                      >
                        <IconPhoto size={22} stroke={1.5} aria-hidden="true" />
                        +{memoriesPhotos.length - 4}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {/* Music — floating round gold control (burgundy face) for uploaded audio;
          provider links keep the shared control, which owns the embed SDKs. */}
      {hasMusic ? (
        data.musicAudioUrl ? (
          <BurgundyMusicButton
            audioUrl={data.musicAudioUrl}
            title={data.musicTitle}
            playLabel={t("burgundyMusicPlay")}
            pauseLabel={t("burgundyMusicPause")}
          />
        ) : (
          <MusicBlock data={data} />
        )
      ) : null}

      {/* Unified gallery viewer — shared by the photo gallery and memories preview. */}
      <BurgundyGoldGalleryViewer
        open={viewerOpen}
        photos={viewerPhotos}
        index={viewerIndex}
        onClose={() => setViewerOpen(false)}
        labels={{
          close: t("burgundyGalleryClose"),
          previous: t("burgundyGalleryPrevious"),
          next: t("burgundyGalleryNext"),
          viewerLabel: t("burgundyGalleryViewerLabel"),
        }}
        returnTo={viewerTrigger}
      />

      {/* RSVP dialog — same native <dialog> + scroll-lock pattern as minimalism. */}
      {hasRsvp ? (
        <dialog
          ref={rsvpDialogRef}
          aria-label={t("burgundyRsvpHeading")}
          data-burgundy-rsvp-dialog="true"
          className="m-auto max-h-[94dvh] w-[min(28rem,calc(100%-1.5rem))] max-w-none overflow-hidden rounded-lg border p-0"
          style={{ borderColor: `${GOLD}66`, backgroundColor: "#ffffff", color: BURGUNDY_DEEP }}
          onKeyDownCapture={(event) => {
            if (event.key !== "Escape" || !event.currentTarget.querySelector('[role="dialog"][data-state="open"]')) return;
            nestedDialogEscapeRef.current = true;
            window.setTimeout(() => { nestedDialogEscapeRef.current = false; }, 0);
          }}
          onCancel={(event) => {
            event.preventDefault();
            if (nestedDialogEscapeRef.current || event.currentTarget.querySelector('[role="dialog"][data-state="open"]')) return;
            closeRsvp();
          }}
          onClose={closeRsvp}
        >
          <div className="max-h-[94dvh] overflow-y-auto overscroll-contain px-4 pb-8 pt-3 sm:px-6">
            <div className="sticky top-0 z-10 flex justify-end py-2" style={{ backgroundColor: "#ffffffee" }}>
              <button
                type="button"
                aria-label={t("burgundyRsvpClose")}
                onClick={() => setRsvpOpen(false)}
                className="grid size-10 place-items-center rounded-full text-2xl leading-none hover:bg-black/5"
                style={{ color: BURGUNDY_DEEP }}
              >
                ×
              </button>
            </div>
            {actionPortal}
          </div>
        </dialog>
      ) : null}

      {/* 11. Gift box — last section; opens the very same RSVP dialog.
          Tapping the box or its "Confirm presence" CTA plays the same ~1s
          open animation, then opens the dialog above; closing it eases the
          box back to idle so it can be replayed. */}
      {hasRsvp ? (
        <section id="inv-gift" data-burgundy-section="gift" className="px-4 pb-16 sm:px-6">
          <SectionFrame>
            <SectionHeading>{t("burgundyGiftTitle")}</SectionHeading>
            <GiftBoxArt
              label={t("burgundyGiftOpenLabel")}
              actionLabel={t("burgundyConfirmPresence")}
              message={t("burgundyGiftClosing")}
              revealed={rsvpOpen}
              onActivate={activateGift}
              size={240}
              className="mt-7"
            />
          </SectionFrame>
        </section>
      ) : null}
    </div>
  );
}
