"use client";

// Contract/scaffold only — no final styling yet; see docs/INVITATION-TEMPLATE-MINIMALISM-DARK-BLUE-SPEC.md.

import { Children, isValidElement, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Cormorant_Garamond, EB_Garamond, Parisienne } from "next/font/google";
import { IconPhoto, IconVolume2, IconVolumeOff } from "@tabler/icons-react";
import type { InvitationBlocksLayout } from "@/lib/invitation-template-schema";
import type { InvitationPageData } from "@/types/invitation-template";
import type { MemoryGalleryPage } from "@/lib/memories/gallery-types";
import { formatLocalizedEventDate, getInvitationDictionary } from "@/lib/invitation-i18n";
import { downloadIcsFile, generateGoogleCalendarUrl, type CalendarEventPayload } from "@/lib/event-time";
import { buildVenueMapSearchUrl } from "@/lib/evergreen-map";
import { isMapUrlOrCoordinate } from "@/lib/invitation-text-format";
import { InvitationPageCanvas } from "@/components/invitation/blocks/InvitationPageCanvas";
import { BohoCoverflowGallery } from "@/components/invitation/blocks/BohoCoverflowGallery";
import { MinimalismHero } from "@/components/invitation/templates/minimalism-dark-blue/MinimalismHero";
import { MemoriesGallery } from "@/components/memories/MemoriesGallery";
import { SAMPLE_MEMORY_ITEMS } from "@/lib/memories/sample-memories";

// Fidelity colours measured against docs/minimalism-dark-blue screenshots.
const NAVY = "#00214a";
const GATE_NAVY = "#022857";
const CREAM = "#efece5";
const CREAM_TEXT = "#f5f0e6";

// Single shared content width for every section/card — taken from the guestbook
// card (the reference). One rule, applied everywhere; do not re-introduce
// per-section max widths. Side margins come from the section's px-5 padding.
const CONTENT_WIDTH = "mx-auto w-full max-w-sm";

// Font choice reported in docs/INVITATION-TEMPLATE-MINIMALISM-DARK-BLUE-SPEC.md §5.
const displayFont = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-minimalism-display" });
const bodyFont = EB_Garamond({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-minimalism-body" });
const scriptFont = Parisienne({ subsets: ["latin"], weight: "400", variable: "--font-minimalism-script" });

interface MinimalismDarkBluePageProps {
  layout: InvitationBlocksLayout;
  data: InvitationPageData;
  children: ReactNode;
  mode: "preview" | "live" | "shared";
  isEditMode: boolean;
  wrapperClassName?: string;
  hasAction?: boolean;
}

const ASSET_BASE = "/images/invitations/minimalism-dark-blue";
const DEMO_ENVELOPE_PHOTO_ONE = `${ASSET_BASE}/demo/envelope-photo-one.jpg`;
const DEMO_ENVELOPE_PHOTO_TWO = `${ASSET_BASE}/demo/envelope-photo-two.jpg`;

/**
 * Post-gate page backdrop — the soft floral wash behind EVERY section, all the
 * way down to the bottom of the RSVP. Uses background-floral-tall.jpg (1200 x
 * 3538), which is the floral image stacked with a vertically mirrored copy, so
 * repeat-y tiles it with no seam. Applied as a CSS background on a layer inside
 * the template root that grows with the page content; never on document.body/html.
 */
const PAGE_FLORAL_BACKDROP = `${ASSET_BASE}/background-floral-tall.jpg`;
// 58 % cream keeps the navy headings, navy cards and the white guestbook card
// fully legible while the pastel flowers still read. The tall asset repeats
// vertically with a mirrored seam, so the overlay is uniform across the whole
// page rather than fading out.
const PAGE_FLORAL_OVERLAY = "rgba(239, 236, 229, 0.58)";

// Fixed positions (% of the gate) for the drifting sparkle glyphs — spec §6.7.
const GATE_SPARKLES = [
  { left: "12%", top: "18%", size: 10, delay: "0s" },
  { left: "82%", top: "14%", size: 8, delay: "1.1s" },
  { left: "22%", top: "72%", size: 9, delay: "2.3s" },
  { left: "76%", top: "68%", size: 11, delay: "0.6s" },
  { left: "50%", top: "10%", size: 7, delay: "1.8s" },
  { left: "88%", top: "48%", size: 9, delay: "0.3s" },
  { left: "8%", top: "46%", size: 8, delay: "2.6s" },
];
// Outward-burst sparkle offsets played once when the gate card flies away.
const BURST_SPARKLES = [
  { dx: -60, dy: -50 }, { dx: 55, dy: -60 }, { dx: -70, dy: 30 },
  { dx: 65, dy: 35 }, { dx: 0, dy: -75 }, { dx: 0, dy: 60 },
];

function SparkleGlyph({ className, style, size = 10 }: { className?: string; style?: CSSProperties; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} style={style} aria-hidden="true">
      <path d="M12 0 L14.5 9.5 L24 12 L14.5 14.5 L12 24 L9.5 14.5 L0 12 L9.5 9.5 Z" fill="#8c8260" />
    </svg>
  );
}

function HeartGlyph({ className, style, size = 10 }: { className?: string; style?: CSSProperties; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} style={style} aria-hidden="true" fill="currentColor">
      <path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z" />
    </svg>
  );
}

/** Line–ornament–line divider — spec §3.1/§6.7, fidelity fix §2. */
function OrnamentDivider({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div className={`flex items-center justify-center gap-2 ${className ?? ""}`} style={style} aria-hidden="true">
      <span className="h-px w-8 bg-current opacity-30" />
      <HeartGlyph size={8} className="opacity-60" />
      <span className="h-px w-8 bg-current opacity-30" />
    </div>
  );
}

/** Post-mount-only countdown; unit labels come from the shared invitation dictionary (lib/invitation-i18n.ts). */
function useCountdown(targetIso: string | null | undefined) {
  const [state, setState] = useState<{ days: number; hours: number; minutes: number; seconds: number; isPast: boolean } | null>(null);
  useEffect(() => {
    if (!targetIso) { setState(null); return; }
    const target = new Date(targetIso).getTime();
    if (Number.isNaN(target)) { setState(null); return; }
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) { setState({ days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true }); return; }
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
  }, [targetIso]);
  return state;
}

interface MonthCalendarCell { date: number | null; isEventDay: boolean }

/** Builds a Sunday-first month grid; weekday/month labels come from Intl at render time, never hardcoded. */
function buildMonthCalendar(year: number, monthIndex: number, eventDay: number | null): MonthCalendarCell[][] {
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: MonthCalendarCell[] = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push({ date: null, isEventDay: false });
  for (let day = 1; day <= daysInMonth; day += 1) cells.push({ date: day, isEventDay: day === eventDay });
  while (cells.length % 7 !== 0) cells.push({ date: null, isEventDay: false });
  const weeks: MonthCalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Narrow weekday headers (Su, Mo, ...) from Intl for the active locale — never truncated by hand. */
function weekdayHeaders(localeCode: string): string[] {
  const reference = new Date(2023, 0, 1); // a Sunday
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(reference);
    date.setDate(reference.getDate() + index);
    return new Intl.DateTimeFormat(localeCode, { weekday: "short" }).format(date);
  });
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const handler = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener?.("change", handler);
    return () => query.removeEventListener?.("change", handler);
  }, []);
  return reduced;
}

interface BigDateParts { day: string; month: string; year: string; weekday: string }

function formatBigDateParts(iso: string | null | undefined, locale: "en" | "fr" = "en", timeZone?: string | null): BigDateParts | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const localeCode = locale === "fr" ? "fr-FR" : "en-US";
  const build = (tz: string | null) => {
    const zoneOptions: Intl.DateTimeFormatOptions = tz ? { timeZone: tz } : {};
    return {
      day: new Intl.DateTimeFormat(localeCode, { day: "2-digit", ...zoneOptions }).format(date),
      month: new Intl.DateTimeFormat(localeCode, { month: "long", ...zoneOptions }).format(date).toUpperCase(),
      year: new Intl.DateTimeFormat(localeCode, { year: "numeric", ...zoneOptions }).format(date),
      weekday: new Intl.DateTimeFormat(localeCode, { weekday: "long", ...zoneOptions }).format(date).toUpperCase(),
    };
  };
  if (timeZone?.trim()) {
    try { return build(timeZone.trim()); } catch { /* fall through */ }
  }
  try { return build(null); } catch { return null; }
}

/** Date without a weekday, for the gate card — fidelity fix §2. */
function formatDateNoWeekday(iso: string | null | undefined, locale: "en" | "fr" = "en", timeZone?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const localeCode = locale === "fr" ? "fr-FR" : "en-US";
  const format = (tz: string | null) =>
    new Intl.DateTimeFormat(localeCode, {
      month: "long",
      day: "numeric",
      year: "numeric",
      ...(tz ? { timeZone: tz } : {}),
    }).format(date);
  // Invalid zones must not blank the gate date: degrade to the host zone.
  if (timeZone?.trim()) {
    try { return format(timeZone.trim()); } catch { /* fall through */ }
  }
  try { return format(null); } catch { return null; }
}

const MINIMALISM_SAMPLE_WISHES_EN = [
  { name: "The Dubois family", date: "May 18, 2027", text: "May this be the first of many beautiful days together." },
  { name: "Amara", date: "May 24, 2027", text: "So happy for you both - wishing you a lifetime of joy." },
  { name: "Liam & Sophie", date: "May 30, 2027", text: "Wishing you endless laughter and love." },
  { name: "Grandma Rose", date: "June 2, 2027", text: "My heart is so full. Congratulations, my loves." },
  { name: "The Chen family", date: "June 5, 2027", text: "What a beautiful celebration of love." },
  { name: "Marcus", date: "June 9, 2027", text: "Cheers to the happy couple!" },
  { name: "Elena", date: "June 12, 2027", text: "May your journey be as lovely as this day." },
  { name: "The Okafor twins", date: "June 15, 2027", text: "So thrilled to witness your forever." },
];
const MINIMALISM_SAMPLE_WISHES_FR = [
  { name: "La famille Dubois", date: "18 mai 2027", text: "Que ce soit le premier de nombreux jours magnifiques ensemble." },
  { name: "Amara", date: "24 mai 2027", text: "Si heureuse pour vous deux - une vie entière de bonheur." },
  { name: "Liam et Sophie", date: "30 mai 2027", text: "Je vous souhaite des rires et de l'amour sans fin." },
  { name: "Mamie Rose", date: "2 juin 2027", text: "Mon coeur déborde. Félicitations, mes amours." },
  { name: "La famille Chen", date: "5 juin 2027", text: "Quelle magnifique célébration de l'amour." },
  { name: "Marcus", date: "9 juin 2027", text: "À la santé des heureux mariés !" },
  { name: "Elena", date: "12 juin 2027", text: "Que votre chemin soit aussi beau que ce jour." },
  { name: "Les jumeaux Okafor", date: "15 juin 2027", text: "Si heureux d'assister à votre pour toujours." },
];

function groupRenderedBlocks(children: ReactNode): Map<string, ReactNode[]> {
  const groups = new Map<string, ReactNode[]>();
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue;
    const props = child.props as { "data-layout-block-type"?: unknown };
    const type = props["data-layout-block-type"];
    if (typeof type !== "string") continue;
    groups.set(type, [...(groups.get(type) ?? []), child]);
  }
  return groups;
}

export function MinimalismDarkBluePageTemplate({
  layout,
  data,
  children,
  mode,
  isEditMode,
  wrapperClassName,
  hasAction,
}: MinimalismDarkBluePageProps) {
  const t = useTranslations("Events");
  const groups = useMemo(() => groupRenderedBlocks(children), [children]);
  const blocks = (type: string) => groups.get(type) ?? [];
  const sectionSettings = layout.template_data ?? {};

  // ── Cover gate: scroll-locked to its own container, never document.body/html ──
  const gateBlock = layout.layout_blocks.find((block) => block.type === "interactive_envelope");
  const gateEffect = layout.effects?.find((effect) => effect.type === "envelope-reveal");
  const showGate = Boolean(gateBlock) && (gateEffect?.enabled ?? gateBlock?.content.enabled !== false);
  const [hasEntered, setHasEntered] = useState(!showGate);
  const rootRef = useRef<HTMLDivElement>(null);

  // Scope the lock to the preview pane, not document.body — mirrors EvergreenEnvelopePageTemplate (commit ff7157ec5).
  const getScrollLockTarget = useCallback((): HTMLElement | null => {
    if (typeof document === "undefined") return null;
    return rootRef.current?.closest<HTMLElement>('[data-testid="invitation-preview"]') ?? document.body;
  }, []);

  useEffect(() => setHasEntered(!showGate), [showGate]);

  useEffect(() => {
    if (!showGate || hasEntered) return;
    const target = getScrollLockTarget();
    if (!target) return;
    const previousOverflow = target.style.overflow;
    target.style.overflow = "hidden";
    return () => {
      target.style.overflow = previousOverflow;
    };
  }, [hasEntered, showGate, getScrollLockTarget]);

  const pageIsActive = hasEntered || !showGate;
  const continueToPage = useCallback(() => setHasEntered(true), []);
  const reducedMotion = useReducedMotion();
  const [isLeaving, setIsLeaving] = useState(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
  }, []);

  // Demo-only sample track (data.musicSample, set by mergeInvitationTemplatePreviewData
  // for the demo route only — never for gallery-card/builder-preview/local-preview, and
  // never on a real invitation). Started from the Open tap itself so the very first
  // play() call stays inside that click's user-activation stack.
  const demoMusicRef = useRef<HTMLAudioElement | null>(null);
  const [demoMusicPlaying, setDemoMusicPlaying] = useState(false);

  useEffect(() => {
    if (!data.musicSample) return;
    function onVisibilityChange() {
      if (document.hidden && demoMusicRef.current && !demoMusicRef.current.paused) {
        demoMusicRef.current.pause();
        setDemoMusicPlaying(false);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [data.musicSample]);

  const toggleDemoMusic = useCallback(() => {
    const audio = demoMusicRef.current;
    if (!audio) return;
    if (demoMusicPlaying) {
      audio.pause();
      setDemoMusicPlaying(false);
      return;
    }
    audio.play().then(
      () => setDemoMusicPlaying(true),
      () => setDemoMusicPlaying(false)
    );
  }, [demoMusicPlaying]);

  const handleOpenClick = useCallback(() => {
    if (data.musicSample && demoMusicRef.current) {
      demoMusicRef.current.play().then(
        () => setDemoMusicPlaying(true),
        () => setDemoMusicPlaying(false)
      );
    }
    if (reducedMotion) {
      continueToPage();
      return;
    }
    setIsLeaving(true);
    leaveTimerRef.current = setTimeout(continueToPage, 550);
  }, [continueToPage, reducedMotion, data.musicSample]);

  // RSVP dialog — same native-<dialog> + scroll-lock pattern as EvergreenEnvelopePageTemplate (rsvpOpen/rsvpDialogRef/getScrollLockTarget).
  const [rsvpOpen, setRsvpOpen] = useState(false);
  const rsvpDialogRef = useRef<HTMLDialogElement>(null);
  const rsvpTriggerRef = useRef<HTMLButtonElement>(null);
  const nestedDialogEscapeRef = useRef(false);
  const [memoriesOpen, setMemoriesOpen] = useState(false);

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

  // ── Names, date, personalization ──
  const names = [data.partner1Name, data.partner2Name]
    .map((name) => name?.trim())
    .filter(Boolean)
    .join(" & ") || data.title;
  const eventDate = data.eventDate ? formatLocalizedEventDate(data.eventDate, data.locale, data.timezone) : null;
  const guestName = data.guest.name?.trim();
  const personalizationLine = t("minimalismPersonalizationLine", {
    name: guestName || t("minimalismGenericGuest"),
  });

  // ── Fallback-aware section visibility ──
  const hasParents = Boolean(
    data.parentOneNameOne?.trim() ||
    data.parentOneNameTwo?.trim() ||
    data.parentTwoNameOne?.trim() ||
    data.parentTwoNameTwo?.trim()
  );
  const meaningfulVenues = (data.venues ?? [])
    .filter((v) => v.name?.trim() || v.address?.trim() || v.time?.trim())
    .slice(0, 3);
  // Precedence: Multiple Locations (max 3) > flat override > event venue + city.
  const flatAddress = [data.address, data.city].filter((part) => part?.trim()).join(", ");
  const fallbackVenue = !meaningfulVenues.length && (data.venue?.trim() || flatAddress)
    ? [{ label: t("minimalismCeremonyLabel").replace(/\s*$/, ""), name: data.venue ?? "", address: flatAddress, time: null as string | null }]
    : [];
  const displayVenues = meaningfulVenues.length ? meaningfulVenues : fallbackVenue;
  const hasGallery = Boolean(data.gallery?.some((item) => item.url));
  const hasSchedule = Boolean(data.schedule?.some((item) => item.time && (item.title || item.label)));
  const hasDressCode = Boolean(data.dressCode?.trim() || data.dressCodeNotes?.trim());
  const hasCoordinates = [data.latitude, data.longitude].every((value, index) => {
    const coordinate = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
    const minimum = index === 0 ? -90 : -180;
    const maximum = index === 0 ? 90 : 180;
    return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum;
  });
  const hasLocation = Boolean(data.venue || data.address || data.city || hasCoordinates);
  const ceremonyBigDate = formatBigDateParts(data.eventDate, data.locale, data.timezone);
  const envelopePhotoOne = data.envelopePhoto || (mode === "preview" ? DEMO_ENVELOPE_PHOTO_ONE : null);
  const envelopePhotoTwo = data.envelopePhotoTwo || (mode === "preview" ? DEMO_ENVELOPE_PHOTO_TWO : null);
  // Demo-only sample track gets its own Open-tap-triggered control below, not
  // the regular tap-to-play pill — rendering both would double up playback.
  const hasMusic = Boolean(!data.musicSample && (data.musicAudioUrl || data.musicLinks?.length));
  const localeCode = data.locale === "fr" ? "fr-FR" : "en-US";
  const dictionary = getInvitationDictionary(data.locale ?? "en");
  const countdown = useCountdown(data.eventDate);
  const eventDateObj = data.eventDate ? new Date(data.eventDate) : null;
  const monthWeeks = eventDateObj && !Number.isNaN(eventDateObj.getTime())
    ? buildMonthCalendar(eventDateObj.getFullYear(), eventDateObj.getMonth(), eventDateObj.getDate())
    : null;
  // Script font only on the month word — its numeral glyphs are illegible at this size (e.g. "2027" reads as "9097").
  const monthNameLabel = eventDateObj && !Number.isNaN(eventDateObj.getTime())
    ? new Intl.DateTimeFormat(localeCode, { month: "long" }).format(eventDateObj)
    : null;
  const monthYearLabel = eventDateObj && !Number.isNaN(eventDateObj.getTime())
    ? new Intl.DateTimeFormat(localeCode, { year: "numeric" }).format(eventDateObj)
    : null;
  const calendarPayload: CalendarEventPayload | null = data.eventDate
    ? {
        title: data.title,
        venue: displayVenues.find((v) => /reception/i.test(v.label ?? ""))?.name ?? displayVenues[0]?.name ?? data.venue ?? undefined,
        address: data.address ?? undefined,
        startDate: data.eventDate,
        endDate: data.endDate ?? undefined,
        timezone: data.timezone || "UTC",
      }
    : null;
  const showGuestbook = sectionSettings.show_guestbook !== false;
  const hasRsvp = blocks("action_portal").length > 0;
  const memoriesEnabled = sectionSettings.mf_show_memories === true;
  const showMemoriesButton =
    memoriesEnabled &&
    (data.memoriesSample === true || ((data.memoriesCount ?? 0) > 0 && Boolean(data.memoriesToken)));
  const memoriesLabels = useMemo(
    () => ({
      title: t("minimalismMemoriesTitle"),
      close: t("minimalismMemoriesClose"),
      loadMore: t("minimalismMemoriesLoadMore"),
      empty: t("minimalismMemoriesEmpty"),
      error: t("minimalismMemoriesError"),
      retry: t("minimalismMemoriesRetry"),
      sample: t("minimalismMemoriesSample"),
    }),
    [t]
  );
  const loadMemoriesPage = useCallback(
    async (cursor: string | null): Promise<MemoryGalleryPage> => {
      if (!data.memoriesToken) return { items: [], nextCursor: null };
      const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const res = await fetch(
        `/api/invitation/${encodeURIComponent(data.memoriesToken)}/memories${qs}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Failed to load memories");
      return (await res.json()) as MemoryGalleryPage;
    },
    [data.memoriesToken]
  );
  // Fake guest messages must never appear on a real guest's own invitation (hasAction)
  // or a read-only shared link tied to a real event — only on non-interactive showcases
  // (template demo, builder preview) where there is no real guest data to show instead.
  const showSampleWishes = !hasAction && mode !== "shared";
  const sampleWishes = showSampleWishes
    ? (data.locale === "fr" ? MINIMALISM_SAMPLE_WISHES_FR : MINIMALISM_SAMPLE_WISHES_EN)
    : [];

  return (
    <InvitationPageCanvas layout={layout} mode={mode} isEditMode={isEditMode} wrapperClassName={wrapperClassName}>
      <div
        ref={rootRef}
        className={`relative min-w-0 ${displayFont.variable} ${bodyFont.variable} ${scriptFont.variable}`}
        style={{ fontFamily: "var(--font-minimalism-body)", backgroundColor: pageIsActive ? CREAM : GATE_NAVY }}
        data-minimalism-page="true"
      >
        {/* Floral page backdrop behind EVERY post-gate section, all the way down
            to the bottom of the RSVP. The tall asset (1200 x 3538) is a floral
            image stacked with a vertically mirrored copy, so repeat-y tiles it
            with no seam. Cream overlay sits above it for legibility; the cream
            base colour shows through while the image loads. Rendered only once
            the gate is open so the navy cover screen paints instantly. */}
        {pageIsActive ? (
          <div
            aria-hidden="true"
            data-minimalism-backdrop="true"
            className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
            style={{
              backgroundColor: CREAM,
              backgroundImage: `linear-gradient(${PAGE_FLORAL_OVERLAY}, ${PAGE_FLORAL_OVERLAY}), url(${PAGE_FLORAL_BACKDROP})`,
              backgroundSize: "auto, 100% auto",
              backgroundPosition: "center, top center",
              backgroundRepeat: "no-repeat, repeat-y",
            }}
          />
        ) : null}
        {/* Clamped to 0 height while the gate is up, so the gate below sizes to its own content instead of the full document height. */}
        <div className="relative z-10" style={pageIsActive ? undefined : { maxHeight: 0, overflow: "hidden" }}>
        <main aria-hidden={!pageIsActive} inert={!pageIsActive} className="outline-none">
          {/* 1. Hero — adapted from Hero04 (no CTAs, no wash image, floral shows through). */}
          <MinimalismHero
            eyebrow={data.eyebrow?.trim() || t("evergreenCoverEyebrow")}
            title={names}
            description={data.invitationLine?.trim() || t("minimalismInvitationLine")}
            primaryImage={envelopePhotoOne}
            secondaryImage={envelopePhotoTwo}
            primaryAlt=""
            secondaryAlt=""
            primaryFocus={data.heroImageFocus ?? null}
            secondaryFocus={data.heroImageFocus ?? null}
          />

          {/* 2/3. Ceremony + reception info — spec §3.3/§3.5, fidelity fix §3 (own markup, bypasses shared DetailsBlock) */}
          <section id="inv-details" className="relative px-5 py-14 text-center sm:px-8 sm:py-20">
            <div className={`${CONTENT_WIDTH} rounded-[8px] px-5 py-9 sm:px-7`} style={{ backgroundColor: NAVY, color: CREAM_TEXT }}>
              <h2 className="relative text-base font-bold uppercase tracking-[.2em] sm:text-lg">{t("minimalismCeremonyInfoHeading")}</h2>

              {hasParents ? (
                <div className="relative mt-6 grid grid-cols-2 gap-4 text-xs sm:text-sm">
                  <div className="border-r pr-4" style={{ borderColor: `${CREAM_TEXT}33` }}>
                    {data.parentOneLabel ? <p className="opacity-70">{data.parentOneLabel}</p> : null}
                    {data.parentOneNameOne ? <p className="font-semibold">{data.parentOneNameOne}</p> : null}
                    {data.parentOneNameTwo ? <p className="font-semibold">{data.parentOneNameTwo}</p> : null}
                  </div>
                  <div className="pl-4">
                    {data.parentTwoLabel ? <p className="opacity-70">{data.parentTwoLabel}</p> : null}
                    {data.parentTwoNameOne ? <p className="font-semibold">{data.parentTwoNameOne}</p> : null}
                    {data.parentTwoNameTwo ? <p className="font-semibold">{data.parentTwoNameTwo}</p> : null}
                  </div>
                </div>
              ) : null}

              <p className="relative mt-6 text-sm leading-6">{data.invitationLine?.trim() || t("minimalismInvitationLine")}</p>

              <p className="relative mt-5 text-2xl sm:text-3xl" style={{ fontFamily: "var(--font-minimalism-display)" }}>
                {data.partner1Name || names}
              </p>
              {data.partner1Name && data.partner2Name ? (
                <p className="relative text-2xl sm:text-3xl" style={{ fontFamily: "var(--font-minimalism-script)", color: `${CREAM_TEXT}cc` }}>&amp;</p>
              ) : null}
              {data.partner2Name ? (
                <p className="relative text-2xl sm:text-3xl" style={{ fontFamily: "var(--font-minimalism-display)" }}>
                  {data.partner2Name}
                </p>
              ) : null}

              {displayVenues.length ? (
                <div className="relative mt-8 space-y-6">
                  {ceremonyBigDate ? (
                    <div className="flex items-center justify-center gap-3">
                      <span className="lining-nums tabular-nums text-4xl sm:text-5xl" style={{ fontFamily: "var(--font-minimalism-display)" }}>{ceremonyBigDate.day}</span>
                      <span className="h-10 w-px" style={{ backgroundColor: `${CREAM_TEXT}4d` }} aria-hidden="true" />
                      <span className="text-left text-xs uppercase leading-4 tracking-[.1em]">
                        <span className="block">{ceremonyBigDate.month}</span>
                        <span className="block opacity-70">{ceremonyBigDate.year}</span>
                      </span>
                    </div>
                  ) : null}
                  {eventDate?.timeDisplay ? (
                    <p className="text-[.65rem] uppercase tracking-[.15em] opacity-80">{eventDate.timeDisplay}{ceremonyBigDate ? <span> · {ceremonyBigDate.weekday}</span> : null}</p>
                  ) : ceremonyBigDate ? (
                    <p className="text-[.65rem] uppercase tracking-[.15em] opacity-70">{ceremonyBigDate.weekday}</p>
                  ) : null}
                  {displayVenues.map((venue, idx) => {
                    const mapUrl = buildVenueMapSearchUrl(venue.name, venue.address);
                    const showBlock = venue.label?.trim() || venue.name?.trim() || venue.address?.trim() || venue.time?.trim();
                    if (!showBlock) return null;
                    return (
                      <div key={`${venue.label ?? "venue"}-${idx}`} className="border-t pt-5" style={{ borderColor: `${CREAM_TEXT}26` }}>
                        {venue.label?.trim() ? (
                          <p className="text-sm uppercase tracking-[.2em] opacity-80">{venue.label}</p>
                        ) : null}
                        {venue.name?.trim() ? (
                          <p className="mt-1 text-base font-semibold">{venue.name}</p>
                        ) : null}
                        {data.city?.trim() && !isMapUrlOrCoordinate(data.city) && data.city.trim().toLowerCase() !== venue.name?.toLowerCase() ? (
                          <p className="mt-1 text-sm leading-5 opacity-80">{data.city.trim()}</p>
                        ) : null}
                        {venue.time?.trim() ? (
                          <p className="mt-1 text-sm uppercase tracking-[.15em] opacity-70">{venue.time}</p>
                        ) : null}
                        {mapUrl ? (
                          <a
                            href={mapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-[.65rem] font-semibold uppercase tracking-[.12em] transition-opacity hover:opacity-90"
                            style={{ borderColor: `${CREAM_TEXT}66`, color: CREAM_TEXT }}
                          >
                            {t("invitationViewOnMap")}
                          </a>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </section>

          {/* 4. Gallery — reuses BohoCoverflowGallery directly (not the shared GalleryBlock wrapper, whose "editorial" theme classes fought the spec's cream/navy palette) — spec §3.4, fidelity fix §8 */}
          {hasGallery ? (
            <section className="px-0 py-14 text-center sm:py-20">
              <h2 className={`${CONTENT_WIDTH} px-5 text-base font-bold uppercase tracking-[.2em] sm:text-lg`} style={{ color: NAVY }}>{t("minimalismGalleryHeading")}</h2>
              <div style={{ color: NAVY }}>
                <BohoCoverflowGallery
                  images={data.gallery ?? []}
                  captionClassName="text-center text-xs"
                  lightboxCaptionClassName="text-xs text-white/80"
                  slideSize="large"
                />
              </div>
            </section>
          ) : null}

          {/* 5. Reception info — spec §3.5, fidelity fix §1/§5 */}
          <section id="inv-reception" className="relative px-5 py-14 text-center sm:px-8 sm:py-20">
            <div className={`${CONTENT_WIDTH} rounded-[8px] px-6 py-9 sm:px-8`} style={{ backgroundColor: NAVY, color: CREAM_TEXT }}>
              <h2 className="relative text-base font-bold uppercase tracking-[.2em] sm:text-lg">{t("minimalismReceptionInfoHeading")}</h2>
              <p className="relative mt-4 text-sm">{t("minimalismReceptionIntro")}</p>

              {eventDate?.timeDisplay ? (
                <p className="relative mt-3 text-xs uppercase tracking-[.15em] opacity-80">{eventDate.timeDisplay}</p>
              ) : null}

              {countdown ? (
                <div className="relative mt-6">
                  <p className="text-xs uppercase tracking-[.2em] opacity-70">{t("minimalismCountdownLabel")}</p>
                  {countdown.isPast ? (
                    <p className="mt-3 text-sm italic">{dictionary.celebrationUnderway}</p>
                  ) : (
                    <div className="mt-3 grid grid-cols-4 gap-2 text-center" aria-label={t("minimalismCountdownLabel")}>
                      {([
                        [countdown.days, dictionary.days],
                        [countdown.hours, dictionary.hours],
                        [countdown.minutes, dictionary.minutes],
                        [countdown.seconds, dictionary.seconds],
                      ] as const).map(([value, label]) => (
                        <div key={label}>
                          <p className="lining-nums tabular-nums text-xl sm:text-2xl" style={{ fontFamily: "var(--font-minimalism-display)" }}>{value}</p>
                          <p className="text-[.6rem] uppercase tracking-[.1em] opacity-70">{label}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {monthWeeks && monthNameLabel ? (
                <div className="relative mx-auto mt-6 w-full max-w-[260px] rounded-[4px] px-3 py-4" style={{ backgroundColor: CREAM, color: NAVY }}>
                  <p className="text-sm">
                    <span style={{ fontFamily: "var(--font-minimalism-script)" }}>{monthNameLabel}</span>{" "}
                    <span className="lining-nums tabular-nums" style={{ fontFamily: "var(--font-minimalism-body)" }}>{monthYearLabel}</span>
                  </p>
                  <div className="mt-2 grid grid-cols-7 gap-y-1 text-[.6rem] uppercase opacity-60">
                    {weekdayHeaders(localeCode).map((label, index) => <span key={index}>{label}</span>)}
                  </div>
                  <div className="mt-1 grid grid-cols-7 gap-y-1 text-xs">
                    {monthWeeks.flat().map((cell, index) => (
                      <span key={index} className="relative flex h-6 items-center justify-center">
                        {cell.date ? (
                          cell.isEventDay ? (
                            <span className="relative flex size-5 items-center justify-center" style={{ color: CREAM_TEXT }}>
                              <HeartGlyph size={20} className="absolute inset-0" style={{ color: NAVY } as CSSProperties} />
                              <span className="relative lining-nums tabular-nums text-[.65rem]">{cell.date}</span>
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
                <div className="relative mt-6 flex flex-wrap items-center justify-center gap-4 border-t pt-5 text-xs" style={{ borderColor: `${CREAM_TEXT}26` }}>
                  <button
                    type="button"
                    disabled={mode === "preview"}
                    onClick={() => mode !== "preview" && downloadIcsFile(calendarPayload)}
                    className="font-semibold uppercase tracking-[.1em] underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t("minimalismAddToCalendar")}
                  </button>
                  {mode === "preview" ? (
                    <a
                      aria-disabled="true"
                      className="pointer-events-none font-semibold uppercase tracking-[.1em] underline underline-offset-4 opacity-50"
                    >
                      {t("minimalismGoogleCalendar")}
                    </a>
                  ) : (
                    <a
                      href={generateGoogleCalendarUrl(calendarPayload)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold uppercase tracking-[.1em] underline underline-offset-4"
                    >
                      {t("minimalismGoogleCalendar")}
                    </a>
                  )}
                </div>
              ) : null}
              {mode === "preview" ? <p className="relative mt-3 text-[.65rem] opacity-60">{t("minimalismAddToCalendarPreviewNote")}</p> : null}
            </div>

            {showMemoriesButton ? (
              <button
                type="button"
                onClick={() => setMemoriesOpen(true)}
                className="relative mt-6 inline-flex items-center gap-2 rounded-full px-6 py-2 text-xs font-semibold uppercase tracking-[.15em] text-white"
                style={{ backgroundColor: NAVY }}
              >
                <IconPhoto size={16} stroke={1.75} aria-hidden="true" />
                {t("minimalismMemoriesTitle")}
              </button>
            ) : null}
          </section>

          {/* 6. Venue + map — shared, bare per AUTHORING.md (no frame-around-a-frame); fallback when there's no address — spec §3.6 */}
          <section className="px-5 py-14 text-center sm:px-8 sm:py-20">
            <h2 className="text-base font-bold uppercase tracking-[.2em] sm:text-lg" style={{ color: NAVY }}>{t("minimalismVenueHeading")}</h2>
            {hasLocation ? (
              <>
                <div className={`${CONTENT_WIDTH} mt-6`}>{blocks("location_map")}</div>
                {(() => {
                  const mapUrl = hasCoordinates
                    ? `https://www.google.com/maps/dir/?api=1&destination=${data.latitude},${data.longitude}`
                    : buildVenueMapSearchUrl(displayVenues[0]?.name ?? data.venue ?? "", displayVenues[0]?.address ?? flatAddress ?? null);
                  return mapUrl ? (
                    <a
                      href={mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${CONTENT_WIDTH} mt-4 inline-block underline underline-offset-2`}
                      style={{ color: NAVY }}
                    >
                      {t("minimalismItinerary")}
                    </a>
                  ) : (
                    <p className={`${CONTENT_WIDTH} mt-4 underline underline-offset-2`} style={{ color: NAVY }}>{t("minimalismItinerary")}</p>
                  );
                })()}
              </>
            ) : (
              <p className={`${CONTENT_WIDTH} mt-4 text-sm opacity-70`} style={{ color: NAVY }}>{t("minimalismNoVenueYet")}</p>
            )}
          </section>

          {/* 7. Dress code + Programme — spec §3.7/§3.8, fidelity fix §5 */}
          {hasDressCode ? (
            <section className="px-5 py-14 text-center sm:px-8 sm:py-20">
              <div className={CONTENT_WIDTH}>
                <h2 className="text-base font-bold uppercase tracking-[.2em] sm:text-lg" style={{ color: NAVY }}>{t("minimalismDressCodeHeading")}</h2>
                {data.dressCode ? <p className="mt-4 text-base" style={{ color: NAVY }}>{data.dressCode}</p> : null}
                {data.dressCodeSwatches?.length ? (
                  <div className="mt-4 flex justify-center gap-3">
                    {data.dressCodeSwatches.map((swatch, index) => (
                      <span
                        key={`${swatch.hex}-${index}`}
                        className="size-8 rounded-full border border-current/20"
                        style={{ backgroundColor: swatch.hex }}
                        aria-label={swatch.name ?? swatch.hex}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {hasSchedule ? (
            <section className="relative px-5 py-14 text-center sm:px-8 sm:py-20">
              <div className={`${CONTENT_WIDTH} rounded-[8px] px-6 py-9 text-left sm:px-8`} style={{ backgroundColor: NAVY, color: CREAM_TEXT }}>
                <h2 className="relative text-center text-base font-bold uppercase tracking-[.2em] sm:text-lg">{t("minimalismProgramHeading")}</h2>
                <ol className="relative mt-6 space-y-4">
                  {data.schedule?.filter((item) => item.time && (item.title || item.label)).map((item, index) => (
                    <li key={`${item.time}-${index}`} className="flex items-center gap-3 text-base">
                      <span className="lining-nums tabular-nums w-14 shrink-0 text-sm uppercase tracking-[.1em] opacity-80">{item.time}</span>
                      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: CREAM_TEXT }} aria-hidden="true" />
                      <span>{item.title || item.label}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          ) : null}

          {/* 9. Guestbook — persistence needs a future migration (spec §4); fake wishes only on non-interactive showcases (demo/builder preview), never on a real guest's page or a shared link, disabled form, no pencil/magic button (spec §3.9) */}
          {showGuestbook ? (
            <section className="px-5 py-10 text-center sm:px-8 sm:py-14">
              <div className={`${CONTENT_WIDTH} rounded-xl border bg-white px-6 py-8 text-left`} style={{ borderColor: `${NAVY}1a` }}>
                <h2 className="text-center text-base font-bold uppercase tracking-[.25em]" style={{ color: NAVY }}>{t("minimalismGuestbookHeading")}</h2>
                <div className="mt-6 flex flex-col gap-3">
                  <input
                    type="text"
                    disabled={hasAction || mode === "shared"}
                    placeholder={t("minimalismGuestbookNamePlaceholder")}
                    className="rounded border px-3 py-2 text-base disabled:opacity-50"
                    style={{ borderColor: `${NAVY}33`, color: NAVY }}
                  />
                  <textarea
                    disabled={hasAction || mode === "shared"}
                    placeholder={t("minimalismGuestbookWishPlaceholder")}
                    className="rounded border px-3 py-2 text-base disabled:opacity-50"
                    style={{ borderColor: `${NAVY}33`, color: NAVY }}
                  />
                  <button
                    type="button"
                    disabled
                    className="self-end rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[.1em] text-white disabled:opacity-50"
                    style={{ backgroundColor: NAVY }}
                  >
                    {t("minimalismGuestbookSubmit")}
                  </button>
                  {(!hasAction && mode !== "shared") ? (
                    <p className="text-xs opacity-60" style={{ color: NAVY }}>{t("minimalismGuestbookPreviewNote")}</p>
                  ) : null}
                </div>
                {sampleWishes.length ? (
                  <div className="mt-6 max-h-[13rem] overflow-y-auto overscroll-contain rounded border" style={{ borderColor: `${NAVY}1a` }}>
                    <ul className="flex flex-col gap-3 p-2 text-sm">
                      {sampleWishes.map((wish) => (
                        <li key={wish.name} className="rounded border px-3 py-2" style={{ borderColor: `${NAVY}1a` }}>
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="font-semibold" style={{ color: NAVY }}>{wish.name}</p>
                            <p className="shrink-0 text-xs opacity-60" style={{ color: NAVY }}>{wish.date}</p>
                          </div>
                          <p className="mt-1" style={{ color: NAVY }}>{wish.text}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="mt-4 text-center text-sm opacity-70" style={{ color: NAVY }}>{t("minimalismGuestbookUnavailable")}</p>
                )}
              </div>
            </section>
          ) : null}

          {/* RSVP — last section: heading + simple card + button opens the dialog (no gift-box drawing) */}
          {hasRsvp ? (
            <section className="px-5 py-14 text-center sm:px-8 sm:py-20">
              <h2 className="text-base font-bold uppercase tracking-[.2em] sm:text-lg" style={{ color: NAVY }}>{t("minimalismRsvpHeading")}</h2>
              <div className={`${CONTENT_WIDTH} relative mt-6 rounded-xl border px-6 py-8`} style={{ borderColor: `${NAVY}1a`, backgroundColor: "rgba(239, 236, 229, 0.3)" }}>
                <p className="text-sm" style={{ color: NAVY }}>{t("minimalismRsvpIntro")}</p>
                <button
                  ref={rsvpTriggerRef}
                  type="button"
                  onClick={() => setRsvpOpen(true)}
                  className="mt-5 inline-flex rounded-full px-7 py-2 text-xs font-semibold uppercase tracking-[.15em] text-white"
                  style={{ backgroundColor: NAVY }}
                >
                  {t("minimalismRsvpButton")}
                </button>
              </div>
            </section>
          ) : null}

          {/* Music — reuses the shared MusicBlock as-is */}
          {hasMusic ? <div>{blocks("music")}</div> : null}
        </main>
        </div>

        {showMemoriesButton ? (
          <MemoriesGallery
            open={memoriesOpen}
            onClose={() => setMemoriesOpen(false)}
            loadPage={data.memoriesSample ? undefined : loadMemoriesPage}
            sampleItems={data.memoriesSample ? SAMPLE_MEMORY_ITEMS : undefined}
            labels={memoriesLabels}
          />
        ) : null}

        {hasRsvp ? (
          <dialog
            ref={rsvpDialogRef}
            aria-label={t("minimalismRsvpHeading")}
            className="m-auto max-h-[94dvh] w-[min(28rem,calc(100%-1.5rem))] max-w-none overflow-hidden rounded-lg border p-0 shadow-xl"
            style={{ borderColor: `${NAVY}26`, backgroundColor: "#ffffff", color: NAVY }}
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
                  aria-label={t("minimalismRsvpClose")}
                  autoFocus
                  onClick={() => setRsvpOpen(false)}
                  className="grid size-10 place-items-center rounded-full text-2xl leading-none hover:bg-black/5"
                  style={{ color: NAVY }}
                >
                  ×
                </button>
              </div>
              {blocks("action_portal")}
            </div>
          </dialog>
        ) : null}

        {/* Normal flow (not absolute/fixed/vh) sized by its own content + min-h — spec §3.1, fidelity fix §1/§2 */}
        {showGate && !hasEntered ? (
          <div
            aria-hidden={pageIsActive}
            className="relative z-50 flex min-h-[900px] flex-col items-center justify-center gap-4 overflow-hidden px-6 py-16 text-center"
            style={{ background: `radial-gradient(ellipse at 50% 35%, #0c3a6b 0%, ${GATE_NAVY} 55%, #01152e 100%)` }}
          >
            {!reducedMotion
              ? GATE_SPARKLES.map((sparkle, index) => (
                  <SparkleGlyph
                    key={index}
                    size={sparkle.size}
                    className="absolute motion-safe:animate-[minimalism-sparkle-drift_6s_ease-in-out_infinite]"
                    style={{ left: sparkle.left, top: sparkle.top, animationDelay: sparkle.delay }}
                  />
                ))
              : null}

            <div
              className={`relative z-10 flex w-[320px] flex-col items-center rounded-[4px] px-8 py-6 text-center shadow-xl transition-all duration-500 ease-out sm:w-[360px] ${
                isLeaving ? "-translate-y-10 scale-90 opacity-0" : "translate-y-0 scale-100 opacity-100"
              } motion-reduce:transition-none`}
              style={{ backgroundColor: "#f3efe4" }}
            >
              <div className="flex size-11 items-center justify-center rounded-full" style={{ backgroundColor: NAVY }} aria-hidden="true">
                <HeartGlyph size={18} className="text-white" />
              </div>
              <p className="mt-4 text-2xl" style={{ fontFamily: "var(--font-minimalism-display)", color: NAVY }}>{data.partner1Name || names}</p>
              {data.partner1Name && data.partner2Name ? (
                <p className="text-lg" style={{ fontFamily: "var(--font-minimalism-script)", color: `${NAVY}cc` }}>&amp;</p>
              ) : null}
              {data.partner2Name ? (
                <p className="text-2xl" style={{ fontFamily: "var(--font-minimalism-display)", color: NAVY }}>{data.partner2Name}</p>
              ) : null}
              <OrnamentDivider className="my-2 w-full" style={{ color: NAVY } as CSSProperties} />
              {data.eventDate ? (
                <p className="text-sm" style={{ color: `${NAVY}b3` }}>{formatDateNoWeekday(data.eventDate, data.locale, data.timezone)}</p>
              ) : null}
              <p className="mt-2 text-xs" style={{ color: `${NAVY}99` }}>{personalizationLine}</p>
              <button
                type="button"
                onClick={handleOpenClick}
                className="mt-4 rounded-full px-6 py-2 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_2px_6px_rgba(0,0,0,.25)] transition-transform hover:scale-105 active:scale-95"
                style={{ background: `linear-gradient(180deg, #2a4f81 0%, ${NAVY} 55%, #001534 100%)` }}
              >
                {t("minimalismOpenButton")}
              </button>

              {isLeaving && !reducedMotion
                ? BURST_SPARKLES.map((burst, index) => (
                    <SparkleGlyph
                      key={index}
                      size={9}
                      className="pointer-events-none absolute left-1/2 top-1/2 opacity-0 motion-safe:animate-[minimalism-sparkle-burst_550ms_ease-out_forwards]"
                      style={{ "--burst-dx": `${burst.dx}px`, "--burst-dy": `${burst.dy}px` } as CSSProperties}
                    />
                  ))
                : null}
            </div>

            <style>{`
              @keyframes minimalism-sparkle-drift {
                0%, 100% { transform: translate(0, 0); opacity: 0.5; }
                50% { transform: translate(6px, -10px); opacity: 0.9; }
              }
              @keyframes minimalism-sparkle-burst {
                0% { transform: translate(-50%, -50%) translate(0, 0) scale(0.6); opacity: 1; }
                100% { transform: translate(-50%, -50%) translate(var(--burst-dx), var(--burst-dy)) scale(1.1); opacity: 0; }
              }
            `}</style>
          </div>
        ) : null}

        {data.musicSample ? (
          <>
            <audio ref={demoMusicRef} src={data.musicAudioUrl ?? undefined} loop preload="none" />
            <button
              type="button"
              onClick={toggleDemoMusic}
              aria-label={demoMusicPlaying ? "Pause invitation music" : "Play invitation music"}
              className="fixed bottom-4 right-4 z-40 flex size-11 items-center justify-center rounded-full border bg-white/95 shadow-lg transition-all hover:bg-white"
              style={{ borderColor: `${NAVY}26`, color: NAVY }}
            >
              {demoMusicPlaying ? <IconVolume2 size={18} stroke={1.75} /> : <IconVolumeOff size={18} stroke={1.75} />}
            </button>
          </>
        ) : null}
      </div>
    </InvitationPageCanvas>
  );
}
