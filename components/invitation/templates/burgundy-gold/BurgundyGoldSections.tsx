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

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { IconPhoto } from "@tabler/icons-react";
import type { InvitationPageData } from "@/types/invitation-template";
import { getInvitationDictionary } from "@/lib/invitation-i18n";
import { downloadIcsFile, generateGoogleCalendarUrl, type CalendarEventPayload } from "@/lib/event-time";
import { MusicBlock } from "@/components/invitation/blocks/InvitationPresentationBlocks";
import { MemoriesGallery } from "@/components/memories/MemoriesGallery";
import { SAMPLE_MEMORY_ITEMS } from "@/lib/memories/sample-memories";
import type { MemoryGalleryPage } from "@/lib/memories/gallery-types";
import { HeartMark, MusicButtonFace, SectionDivider } from "@/components/invitation/templates/burgundy-gold/burgundy-gold-art";
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

const GOLD = "#cdb073";
const GOLD_BRIGHT = "#e7cf98";
const CREAM = "#f6ead0";
const BURGUNDY_DEEP = "#2b0710";
const BURGUNDY_PANEL = "#551124";

const PANEL_STYLE: CSSProperties = {
  backgroundColor: `${BURGUNDY_PANEL}f2`,
  border: `1px solid ${GOLD}99`,
  boxShadow: `inset 0 0 0 4px ${BURGUNDY_DEEP}, inset 0 0 0 5px ${GOLD}55`,
};

const SECTION_WIDTH = "mx-auto w-full max-w-md";

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
  /** Rendered action_portal block; the RSVP dialog body. */
  actionPortal: ReactNode;
  memoriesLabels: {
    title: string;
    close: string;
    loadMore: string;
    empty: string;
    error: string;
    retry: string;
    sample: string;
  };
}

export function BurgundyGoldSections({
  data,
  sectionSettings,
  mode,
  hasAction,
  actionPortal,
  memoriesLabels,
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
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const viewerRef = useRef<HTMLDialogElement>(null);
  const viewerOpen = viewerIndex !== null;

  useEffect(() => {
    const dialog = viewerRef.current;
    if (!dialog) return;
    if (viewerOpen && !dialog.open) dialog.showModal();
    if (!viewerOpen && dialog.open) dialog.close();
  }, [viewerOpen]);

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
  const rsvpTriggerRef = useRef<HTMLButtonElement>(null);
  const nestedDialogEscapeRef = useRef(false);

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
  const canWriteGuestbook = !hasAction && mode !== "shared";
  const [wishes, setWishes] = useState<{ name: string; text: string }[]>([]);
  const [wishName, setWishName] = useState("");
  const [wishText, setWishText] = useState("");
  const sampleWishes = useMemo(
    () => [
      { name: t("burgundyWishName0"), text: t("burgundyWishText0") },
      { name: t("burgundyWishName1"), text: t("burgundyWishText1") },
      { name: t("burgundyWishName2"), text: t("burgundyWishText2") },
    ],
    [t]
  );
  const feed = [...wishes, ...(canWriteGuestbook ? sampleWishes : [])];
  const sendWish = () => {
    const name = wishName.trim();
    const text = wishText.trim();
    if (!name || !text) return;
    setWishes((current) => [{ name, text }, ...current]);
    setWishName("");
    setWishText("");
  };

  // ── Memories ────────────────────────────────────────────────────────────────
  const showMemories = burgundyShowMemories(sectionSettings, data);
  const [memoriesOpen, setMemoriesOpen] = useState(false);
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

  const hasMusic = burgundyHasMusic(data);
  const viewerPhoto = viewerIndex !== null ? allPhotos[viewerIndex] : undefined;
  // Hide the reception section entirely when it has nothing to show.
  const hasReceptionContent = Boolean(times || countdown || calendar || calendarPayload || hasRsvp);

  return (
    <div ref={rootRef} data-burgundy-sections="true" className="relative">
      {/* 4. Photo gallery — 2 × 2 mosaic with a "+N" badge on the last tile. */}
      {galleryTiles ? (
        <section id="inv-gallery" data-burgundy-section="gallery" className="px-4 py-14 sm:px-6">
          <div className={SECTION_WIDTH}>
            <SectionHeading>{t("burgundyGalleryHeading")}</SectionHeading>
            <SectionDivider size={176} className="mx-auto mt-4" tone={GOLD} />
            <div className="mt-6 grid grid-cols-2 gap-2 sm:gap-3">
              {galleryTiles.map((tile) => (
                <button
                  key={`${tile.url}-${tile.index}`}
                  type="button"
                  onClick={() => setViewerIndex(tile.index)}
                  aria-label={`${t("burgundyGalleryOpen")} ${tile.index + 1}`}
                  data-burgundy-gallery-tile={tile.index}
                  className="group relative aspect-square overflow-hidden rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ border: `1px solid ${GOLD}66`, outlineColor: GOLD_BRIGHT }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={tile.url} alt={tile.alt} loading="lazy" className="h-full w-full object-cover" />
                  {tile.remaining > 0 ? (
                    <span
                      data-burgundy-gallery-more={tile.remaining}
                      className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-2xl"
                      style={{ backgroundColor: `${BURGUNDY_DEEP}cc`, color: GOLD_BRIGHT }}
                    >
                      <IconPhoto size={22} stroke={1.5} aria-hidden="true" />
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
      <section id="inv-reception" data-burgundy-section="reception" className="px-4 pb-14 pt-2 sm:px-6">
        <div className={`${SECTION_WIDTH} relative px-5 py-8 text-center sm:px-8 sm:py-10`} style={PANEL_STYLE}>
          <SectionHeading>{t("burgundyReceptionHeading")}</SectionHeading>

          {times ? (
            <dl className="mt-6 grid grid-cols-2 gap-3 text-xs sm:text-sm" data-burgundy-reception-times="true">
              {times.welcome ? (
                <div className="border-r pr-3" style={{ borderColor: `${GOLD}40` }}>
                  <dt className="text-[0.62rem] uppercase tracking-[0.16em]" style={{ color: `${CREAM}aa` }}>
                    {t("burgundyWelcomeLabel")}
                  </dt>
                  <dd className="mt-1 tracking-[0.12em]" style={{ color: GOLD_BRIGHT }}>{times.welcome}</dd>
                </div>
              ) : null}
              {times.reception ? (
                <div className="pl-3">
                  <dt className="text-[0.62rem] uppercase tracking-[0.16em]" style={{ color: `${CREAM}aa` }}>
                    {t("burgundyReceptionTimeLabel")}
                  </dt>
                  <dd className="mt-1 tracking-[0.12em]" style={{ color: GOLD_BRIGHT }}>{times.reception}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          {countdown ? (
            <div className="mt-7" data-burgundy-section="countdown">
              <p className="text-[0.62rem] uppercase tracking-[0.22em]" style={{ color: `${CREAM}99` }}>
                {t("burgundyCountdownLabel")}
              </p>
              {countdown.isPast ? (
                <p className="mt-3 text-sm italic" style={{ color: `${CREAM}dd` }}>{dictionary.celebrationUnderway}</p>
              ) : (
                <div className="mt-3 grid grid-cols-4 gap-2" aria-label={t("burgundyCountdownLabel")}>
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
                      <p className="text-[0.6rem] uppercase tracking-[0.1em]" style={{ color: `${CREAM}99` }}>{label}</p>
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
              <p className="text-sm">
                <span style={{ fontFamily: "var(--font-burgundy-script)" }}>{monthLabel}</span>{" "}
                <span className="lining-nums tabular-nums" style={{ fontFamily: "var(--font-burgundy-body)" }}>{calendar.year}</span>
              </p>
              <div className="mt-2 grid grid-cols-7 gap-y-1 text-[0.6rem] uppercase opacity-60">
                {burgundyWeekdayHeaders(localeCode).map((label, index) => <span key={index}>{label}</span>)}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-y-1 text-xs">
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
                          <span className="relative lining-nums tabular-nums text-[0.65rem]">{cell.date}</span>
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
            <div className="mt-7 flex flex-wrap items-center justify-center gap-4 border-t pt-5 text-xs" style={{ borderColor: `${GOLD}33` }}>
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

          {hasRsvp ? (
            <button
              ref={rsvpTriggerRef}
              type="button"
              onClick={() => setRsvpOpen(true)}
              data-burgundy-confirm-presence="true"
              className="mt-7 inline-flex min-h-11 items-center rounded-full px-7 py-2 text-sm font-semibold tracking-[0.06em]"
              style={{ backgroundColor: GOLD, color: BURGUNDY_DEEP }}
            >
              {t("burgundyConfirmPresence")}
            </button>
          ) : null}
        </div>
      </section>
      ) : null}

      {/* 6. Venue — map embed, view on map, itinerary. */}
      {venue ? (
        <section id="inv-venue" data-burgundy-section="venue" className="px-4 py-14 sm:px-6">
          <div className={SECTION_WIDTH}>
            <SectionHeading>{t("burgundyVenueHeading")}</SectionHeading>
            {venue.name ? (
              <p className="mt-3 text-center text-lg" style={{ fontFamily: "var(--font-burgundy-display)", color: GOLD_BRIGHT }}>{venue.name}</p>
            ) : null}
            {venue.address ? (
              <p className="mt-1 text-center text-xs leading-5" style={{ color: `${CREAM}b8` }}>{venue.address}</p>
            ) : null}
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
        <section id="inv-dress-code" data-burgundy-section="dress-code" className="px-4 py-14 sm:px-6">
          <div className="mx-auto w-full max-w-md text-center">
            <SectionHeading>{t("burgundyDressCodeHeading")}</SectionHeading>
            {dressCodeLine ? (
              <p className="mx-auto mt-4 max-w-sm text-sm leading-6" style={{ color: `${CREAM}dd` }}>{dressCodeLine}</p>
            ) : null}
            {swatches ? (
              <div className="mt-5 flex justify-center gap-3" data-burgundy-swatches={swatches.length}>
                {swatches.map((swatch, index) => (
                  <span
                    key={`${swatch.hex}-${index}`}
                    className="size-8 rounded-full"
                    style={{ backgroundColor: swatch.hex, border: `1px solid ${GOLD}66` }}
                    aria-label={swatch.name ?? swatch.hex}
                  />
                ))}
              </div>
            ) : null}
            {swatches ? (
              <ul className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[0.66rem] uppercase tracking-[0.12em]" style={{ color: `${CREAM}99` }}>
                {swatches.map((swatch, index) => (
                  <li key={`${swatch.hex}-label-${index}`}>{swatch.name ?? swatch.hex}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* 8. Day programme — vertical timeline, capped at 15 entries. */}
      {programme ? (
        <section id="inv-programme" data-burgundy-section="programme" className="px-4 py-14 sm:px-6">
          <div className={`${SECTION_WIDTH} relative px-5 py-8 text-left sm:px-8 sm:py-10`} style={PANEL_STYLE}>
            <SectionHeading>{t("burgundyProgramHeading")}</SectionHeading>
            <ol className="mt-6 space-y-5">
              {programme.map((entry, index) => (
                <li key={`${entry.time}-${index}`} className="relative flex gap-4 pl-1">
                  <span className="flex flex-col items-center">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: GOLD }} aria-hidden="true" />
                    {index < programme.length - 1 ? (
                      <span className="mt-1 w-px flex-1" style={{ backgroundColor: `${GOLD}40` }} aria-hidden="true" />
                    ) : null}
                  </span>
                  <span className="pb-1">
                    <span className="block lining-nums tabular-nums text-xs uppercase tracking-[0.14em]" style={{ color: GOLD_BRIGHT }}>
                      {entry.time}
                    </span>
                    <span className="mt-1 block text-sm leading-6" style={{ color: CREAM }}>{entry.title}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      {/* 9. Guestbook — typeable in preview/demo; local-only feed (no persistence yet). */}
      {showGuestbook ? (
        <section id="inv-guestbook" data-burgundy-section="guestbook" className="px-4 py-14 sm:px-6">
          <div className={`${SECTION_WIDTH} relative px-5 py-8 text-left sm:px-8`} style={PANEL_STYLE}>
            <SectionHeading>{t("burgundyGuestbookHeading")}</SectionHeading>
            <div className="mt-6 flex flex-col gap-3">
              <label className="sr-only" htmlFor="burgundy-guestbook-name">{t("burgundyGuestbookName")}</label>
              <input
                id="burgundy-guestbook-name"
                type="text"
                value={wishName}
                onChange={(event) => setWishName(event.target.value)}
                disabled={!canWriteGuestbook}
                placeholder={t("burgundyGuestbookName")}
                data-burgundy-guestbook-field="name"
                className="rounded-sm px-3 py-2 text-sm disabled:opacity-50"
                style={{ backgroundColor: `${BURGUNDY_DEEP}b3`, border: `1px solid ${GOLD}4d`, color: CREAM }}
              />
              <label className="sr-only" htmlFor="burgundy-guestbook-message">{t("burgundyGuestbookMessage")}</label>
              <textarea
                id="burgundy-guestbook-message"
                rows={3}
                value={wishText}
                onChange={(event) => setWishText(event.target.value)}
                disabled={!canWriteGuestbook}
                placeholder={t("burgundyGuestbookMessage")}
                data-burgundy-guestbook-field="message"
                className="rounded-sm px-3 py-2 text-sm disabled:opacity-50"
                style={{ backgroundColor: `${BURGUNDY_DEEP}b3`, border: `1px solid ${GOLD}4d`, color: CREAM }}
              />
              <button
                type="button"
                onClick={sendWish}
                disabled={!canWriteGuestbook || !wishName.trim() || !wishText.trim()}
                data-burgundy-guestbook-send="true"
                className="self-end rounded-full px-5 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] disabled:opacity-50"
                style={{ backgroundColor: GOLD, color: BURGUNDY_DEEP }}
              >
                {t("burgundyGuestbookSend")}
              </button>
              {canWriteGuestbook ? (
                <p className="text-xs" style={{ color: `${CREAM}99` }}>{t("burgundyGuestbookNote")}</p>
              ) : null}
            </div>
            {feed.length ? (
              <div className="mt-6 max-h-[13rem] overflow-y-auto overscroll-contain" style={{ border: `1px solid ${GOLD}33` }} data-burgundy-guestbook-feed="true">
                <ul className="flex flex-col gap-3 p-2 text-sm">
                  {feed.map((wish, index) => (
                    <li key={`${wish.name}-${index}`} className="px-3 py-2" style={{ border: `1px solid ${GOLD}26` }}>
                      <p className="font-semibold" style={{ color: GOLD_BRIGHT }}>{wish.name}</p>
                      <p className="mt-1 leading-6" style={{ color: `${CREAM}dd` }}>{wish.text}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-6 text-sm" style={{ color: `${CREAM}99` }}>{t("burgundyGuestbookEmpty")}</p>
            )}
          </div>
        </section>
      ) : null}

      {/* 10. Guest memories — only when the layout switch is on and approved photos exist. */}
      {showMemories ? (
        <section id="inv-memories" data-burgundy-section="memories" className="px-4 pb-16 sm:px-6">
          <div className="mx-auto flex w-full max-w-md justify-center">
            <button
              type="button"
              onClick={() => setMemoriesOpen(true)}
              className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.14em]"
              style={{ backgroundColor: GOLD, color: BURGUNDY_DEEP }}
            >
              <IconPhoto size={16} stroke={1.75} aria-hidden="true" />
              {memoriesLabels.title}
            </button>
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

      {/* Gallery viewer — native dialog so Escape and focus handling are free. */}
      <dialog
        ref={viewerRef}
        aria-label={t("burgundyGalleryViewerLabel")}
        data-burgundy-gallery-viewer="true"
        onClose={() => setViewerIndex(null)}
        onCancel={() => setViewerIndex(null)}
        className="m-auto max-h-[94dvh] w-[min(28rem,calc(100%-1.5rem))] max-w-none overflow-hidden rounded-sm border p-0"
        style={{ borderColor: `${GOLD}66`, backgroundColor: BURGUNDY_DEEP, color: CREAM }}
      >
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[0.66rem] uppercase tracking-[0.14em]" style={{ color: `${CREAM}aa` }}>
            {viewerIndex !== null ? `${viewerIndex + 1} / ${allPhotos.length}` : ""}
          </span>
          <button
            type="button"
            autoFocus
            onClick={() => setViewerIndex(null)}
            aria-label={t("burgundyGalleryClose")}
            className="grid size-9 place-items-center rounded-full text-2xl leading-none"
            style={{ color: GOLD_BRIGHT }}
          >
            ×
          </button>
        </div>
        {viewerPhoto ? (
          <div className="px-3 pb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewerPhoto.url} alt={viewerPhoto.alt?.trim() ?? ""} className="max-h-[70dvh] w-full object-contain" />
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3 border-t px-3 py-2" style={{ borderColor: `${GOLD}33` }}>
          <button
            type="button"
            onClick={() => setViewerIndex((current) => (current === null ? null : Math.max(0, current - 1)))}
            disabled={viewerIndex === null || viewerIndex === 0}
            className="text-xs uppercase tracking-[0.12em] disabled:opacity-40"
            style={{ color: GOLD_BRIGHT }}
          >
            {t("burgundyGalleryPrevious")}
          </button>
          <button
            type="button"
            onClick={() => setViewerIndex((current) => (current === null ? null : Math.min(allPhotos.length - 1, current + 1)))}
            disabled={viewerIndex === null || viewerIndex >= allPhotos.length - 1}
            className="text-xs uppercase tracking-[0.12em] disabled:opacity-40"
            style={{ color: GOLD_BRIGHT }}
          >
            {t("burgundyGalleryNext")}
          </button>
        </div>
      </dialog>

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
            setRsvpOpen(false);
            rsvpTriggerRef.current?.focus();
          }}
          onClose={() => { setRsvpOpen(false); rsvpTriggerRef.current?.focus(); }}
        >
          <div className="max-h-[94dvh] overflow-y-auto overscroll-contain px-4 pb-8 pt-3 sm:px-6">
            <div className="sticky top-0 z-10 flex justify-end py-2" style={{ backgroundColor: "#ffffffee" }}>
              <button
                type="button"
                aria-label={t("burgundyRsvpClose")}
                autoFocus
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

      {showMemories ? (
        <MemoriesGallery
          open={memoriesOpen}
          onClose={() => setMemoriesOpen(false)}
          loadPage={data.memoriesSample ? undefined : loadMemoriesPage}
          sampleItems={data.memoriesSample ? SAMPLE_MEMORY_ITEMS : undefined}
          labels={memoriesLabels}
        />
      ) : null}
    </div>
  );
}
