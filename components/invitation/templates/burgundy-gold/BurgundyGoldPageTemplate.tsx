"use client";

import { Children, Fragment, isValidElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Alex_Brush, Cormorant_Garamond, EB_Garamond } from "next/font/google";
import type { InvitationBlocksLayout } from "@/lib/invitation-template-schema";
import type { InvitationPageData } from "@/types/invitation-template";
import { formatLocalizedEventDate } from "@/lib/invitation-i18n";
import { InvitationPageCanvas } from "@/components/invitation/blocks/InvitationPageCanvas";
import {
  PageBackdrop,
} from "@/components/invitation/templates/burgundy-gold/burgundy-gold-art";
import { BurgundyGoldSections } from "@/components/invitation/templates/burgundy-gold/BurgundyGoldSections";
import { burgundyHeroNames } from "@/components/invitation/templates/burgundy-gold/burgundy-gold-data";

const BURGUNDY = "#4a0d1c";
const BURGUNDY_DEEP = "#2b0710";
const GOLD = "#cdb073";
const GOLD_BRIGHT = "#e7cf98";
const CREAM = "#f6ead0";

const displayFont = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-burgundy-display",
});
const bodyFont = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-burgundy-body",
});
// Brush script: chosen from Allura / Alex Brush / Great Vibes / Pinyon Script by
// rendering each at 390px — Alex Brush keeps the brush weight and the thick/thin
// contrast of the reference at mobile size.
const scriptFont = Alex_Brush({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-burgundy-script",
});

interface BurgundyGoldPageProps {
  layout: InvitationBlocksLayout;
  data: InvitationPageData;
  children: ReactNode;
  mode: "preview" | "live" | "shared";
  isEditMode: boolean;
  wrapperClassName?: string;
  hasAction?: boolean;
}

export interface BurgundyDateParts {
  weekday: string;
  day: string;
  month: string;
  year: string;
}

/**
 * Weekday | day | month year in the event timezone. Invalid zones degrade to
 * the host zone instead of blanking the date block.
 */
export function formatBurgundyDateParts(
  iso: string | null | undefined,
  locale: "en" | "fr" = "en",
  timeZone?: string | null
): BurgundyDateParts | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const localeCode = locale === "fr" ? "fr-FR" : "en-US";

  const build = (tz: string | null): BurgundyDateParts => {
    const zone = tz ? { timeZone: tz } : {};
    return {
      weekday: new Intl.DateTimeFormat(localeCode, { weekday: "long", ...zone }).format(date).toUpperCase(),
      day: new Intl.DateTimeFormat(localeCode, { day: "numeric", ...zone }).format(date),
      month: new Intl.DateTimeFormat(localeCode, { month: "long", ...zone }).format(date).toUpperCase(),
      year: new Intl.DateTimeFormat(localeCode, { year: "numeric", ...zone }).format(date),
    };
  };

  if (timeZone?.trim()) {
    try {
      return build(timeZone.trim());
    } catch {
      // fall through to the host zone
    }
  }
  try {
    return build(null);
  } catch {
    return null;
  }
}

/**
 * Splits rendered layout children by block type so the RSVP dialog can host the
 * action_portal block. Copied from MinimalismDarkBluePageTemplate.tsx (~L234),
 * which does not export the helper and whose renderer is frozen.
 */
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

function DateBlock({ parts }: { parts: BurgundyDateParts }) {
  return (
    <div
      data-burgundy-date-block="true"
      className="mt-4 flex items-center justify-center gap-3 uppercase tracking-[0.18em]"
      style={{ color: GOLD_BRIGHT }}
    >
      <span data-burgundy-date-weekday={parts.weekday} className="text-[0.62rem] leading-4 opacity-90">{parts.weekday}</span>{" "}
      <span className="h-8 w-px" style={{ backgroundColor: `${GOLD}66` }} aria-hidden="true" />
      <span data-burgundy-date-day={parts.day} className="lining-nums tabular-nums text-2xl leading-none">{parts.day}</span>{" "}
      <span className="h-8 w-px" style={{ backgroundColor: `${GOLD}66` }} aria-hidden="true" />
      <span className="text-left text-[0.62rem] leading-4">
        <span data-burgundy-date-month={parts.month} className="block">{parts.month}</span>{" "}
        <span data-burgundy-date-year={parts.year} className="block opacity-75">{parts.year}</span>
      </span>
    </div>
  );
}

function ParentColumn({
  label,
  nameOne,
  nameTwo,
  align,
}: {
  label?: string | null;
  nameOne?: string | null;
  nameTwo?: string | null;
  align: "left" | "right";
}) {
  if (!label?.trim() && !nameOne?.trim() && !nameTwo?.trim()) return null;
  // Plain columns: the reference has no vertical rule between the two families.
  return (
    <div className={align === "right" ? "text-left" : "text-right"}>
      {label?.trim() ? <p className="text-[0.66rem] uppercase tracking-[0.16em] opacity-75">{label.trim()}</p> : null}
      {nameOne?.trim() ? <p className="mt-1 text-sm font-medium leading-5">{nameOne.trim()}</p> : null}
      {nameTwo?.trim() ? <p className="text-sm font-medium leading-5">{nameTwo.trim()}</p> : null}
    </div>
  );
}

export function BurgundyGoldPageTemplate({
  layout,
  data,
  children,
  mode,
  isEditMode,
  wrapperClassName,
  hasAction,
}: BurgundyGoldPageProps) {
  const t = useTranslations("Events");
  const rootRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupRenderedBlocks(children), [children]);
  const actionPortal = groups.get("action_portal") ?? [];
  const sectionSettings = layout.template_data ?? {};
  const [hasEntered, setHasEntered] = useState(false);

  const showGate = true;
  const pageIsActive = hasEntered || !showGate;

  const getScrollLockTarget = useCallback((): HTMLElement | null => {
    if (typeof document === "undefined") return null;
    return rootRef.current?.closest<HTMLElement>('[data-testid="invitation-preview"]') ?? document.body;
  }, []);

  useEffect(() => {
    if (!showGate || hasEntered) return;
    const target = getScrollLockTarget();
    if (!target) return;
    const previousOverflow = target.style.overflow;
    target.style.overflow = "hidden";
    return () => {
      target.style.overflow = previousOverflow;
    };
  }, [getScrollLockTarget, hasEntered, showGate]);

  const names = useMemo(() => {
    const couple = [data.partner1Name, data.partner2Name]
      .map((name) => name?.trim())
      .filter(Boolean)
      .join(" & ");
    return couple || data.hostNames?.trim() || data.title?.trim() || "";
  }, [data.hostNames, data.partner1Name, data.partner2Name, data.title]);

  // Hero shows FIRST names only; the full names stay in the ceremony panel.
  const heroNames = burgundyHeroNames(data);

  const eyebrow = data.eyebrow?.trim() || t("burgundyEyebrow");
  const openingMessage = data.openingMessage?.trim() || data.invitationLine?.trim() || "";
  const invitationLine = data.invitationLine?.trim() || t("burgundyInvitationLine");
  const openingPhoto = data.openingPhoto?.trim() || "";

  const hasParents = Boolean(
    data.parentOneNameOne?.trim()
    || data.parentOneNameTwo?.trim()
    || data.parentTwoNameOne?.trim()
    || data.parentTwoNameTwo?.trim()
  );

  const meaningfulVenues = (data.venues ?? [])
    .filter((venue) => venue.name?.trim() || venue.address?.trim() || venue.time?.trim())
    .slice(0, 3);
  const flatAddress = [data.address, data.city].filter((part) => part?.trim()).join(", ");
  const fallbackVenue = !meaningfulVenues.length && (data.venue?.trim() || flatAddress)
    ? [{
        label: t("burgundyCeremonyLabel"),
        name: data.venue ?? "",
        address: flatAddress,
        time: null as string | null,
      }]
    : [];
  const displayVenues = meaningfulVenues.length ? meaningfulVenues : fallbackVenue;

  const eventDate = data.eventDate ? formatLocalizedEventDate(data.eventDate, data.locale, data.timezone) : null;
  const dateParts = formatBurgundyDateParts(data.eventDate, data.locale, data.timezone);
  const panelHeading = t("burgundyCeremonyHeading");
  const openLabel = t("burgundyOpenInvitation");
  const skipLabel = t("burgundySkipOpening");

  const ceremonyParts = dateParts;
  const receptionParts = dateParts;

  return (
    <InvitationPageCanvas layout={layout} mode={mode} isEditMode={isEditMode} wrapperClassName={wrapperClassName}>
      <div
        ref={rootRef}
        className={`relative min-w-0 overflow-hidden ${displayFont.variable} ${bodyFont.variable} ${scriptFont.variable}`}
        style={{ fontFamily: "var(--font-burgundy-body)", backgroundColor: BURGUNDY_DEEP, color: CREAM }}
        lang={data.locale === "fr" ? "fr" : "en"}
        data-burgundy-page="true"
        data-burgundy-locale={data.locale === "fr" ? "fr" : "en"}
      >
        <PageBackdrop />

        {!pageIsActive ? (
          <section
            data-burgundy-gate="true"
            aria-label={openLabel}
            className="relative z-20 flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-5 py-12"
          >
            {openingPhoto ? (
              <img
                src={openingPhoto}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35"
              />
            ) : null}
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                backgroundImage: `linear-gradient(180deg, ${BURGUNDY_DEEP}e6 0%, ${BURGUNDY}a8 46%, ${BURGUNDY_DEEP}f2 100%)`,
              }}
            />

            <div className="relative z-10 flex w-full max-w-sm flex-col items-center text-center">
              <p className="mt-4 text-[0.68rem] uppercase tracking-[0.34em]" style={{ color: GOLD_BRIGHT }}>{eyebrow}</p>
              <h1
                className="mt-3 text-4xl leading-[1.15] sm:text-5xl"
                style={{ fontFamily: "var(--font-burgundy-script)", color: GOLD_BRIGHT }}
              >
                {names}
              </h1>
              {openingMessage ? (
                <p className="mt-5 max-w-xs text-sm leading-6" style={{ color: `${CREAM}dd` }}>{openingMessage}</p>
              ) : null}
              {data.eventDate && dateParts ? (
                <p className="mt-4 text-[0.66rem] uppercase tracking-[0.22em]" style={{ color: `${GOLD_BRIGHT}cc` }}>
                  {dateParts.day} {dateParts.month} {dateParts.year}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setHasEntered(true)}
                className="mt-7 min-h-11 rounded-full px-8 py-2.5 text-sm font-semibold tracking-[0.08em] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
                style={{ backgroundColor: GOLD, color: BURGUNDY_DEEP, outlineColor: GOLD_BRIGHT }}
              >
                {openLabel}
              </button>
            </div>

            {mode === "preview" ? (
              <button
                type="button"
                onClick={() => setHasEntered(true)}
                className="relative z-10 mt-6 text-xs underline underline-offset-4"
                style={{ color: `${CREAM}cc` }}
              >
                {skipLabel}
              </button>
            ) : null}
          </section>
        ) : (
          <main className="relative z-10" data-burgundy-main="true">
            {/* Hero: a full-viewport opening after the gate — eyebrow in the upper
                third, stacked names large in the middle, date/city + scroll arrow
                at the bottom. Vertical flex column with justify-between so nothing
                floats at the top edge and the names sit in the middle. */}
            <header
              data-burgundy-hero="true"
              className="relative flex min-h-[100svh] flex-col items-center justify-between text-center px-6 pt-8 pb-4"
            >
              <p className="mt-2 text-[0.8rem] uppercase tracking-[0.34em]" style={{ color: GOLD_BRIGHT }}>
                {eyebrow}
              </p>
              <div className="flex-grow-1 flex flex-col items-center justify-center">
                <h1
                  data-burgundy-hero-names="true"
                  className="flex flex-col items-center"
                  style={{ fontFamily: "var(--font-burgundy-script)", color: GOLD_BRIGHT }}
                >
                  {heroNames.map((name, index) => (
                    <Fragment key={`${name}-${index}`}>
                      {index > 0 ? (
                        <span className="my-2 block leading-none" style={{ color: GOLD, fontSize: "clamp(2rem, 14vw, 3rem)" }}>&amp;</span>
                      ) : null}
                      <span
                        data-burgundy-hero-name={name}
                        className="block"
                        style={{
                          fontFamily: "var(--font-burgundy-script)",
                          color: GOLD_BRIGHT,
                          fontSize: "clamp(2rem, 14vw, 4rem)",
                          lineHeight: "1.05",
                          maxWidth: "70vw",
                        }}
                      >
                        {name}
                      </span>
                    </Fragment>
                  ))}
                </h1>
              </div>
              <div className="flex flex-col items-center">
                {data.eventDate && dateParts ? (
                  <p className="mb-4 text-[0.7rem] uppercase tracking-[0.22em]" style={{ color: `${GOLD_BRIGHT}cc` }}>
                    {dateParts.day} {dateParts.month} {dateParts.year}{data.city ? ` · ${data.city}` : ""}
                  </p>
                ) : null}
                <div className="mb-4" aria-hidden="true">
                  <div
                    className="bgg-chevron"
                    style={{
                      borderTop: `8px solid ${GOLD_BRIGHT}`,
                      borderLeft: "6px solid transparent",
                      borderRight: "6px solid transparent",
                      width: 0,
                      height: 0,
                    }}
                  />
                  <style jsx>{`
                    @keyframes bgg-chevron-bounce {
                      0%, 100% { transform: translateY(0) }
                      50% { transform: translateY(-6px) }
                    }
                    .bgg-chevron { animation: bgg-chevron-bounce 2.4s ease-in-out infinite }
                    @media (prefers-reduced-motion: reduce) {
                      .bgg-chevron { animation: none }
                    }
                  `}</style>
                </div>
              </div>
            </header>

            <section id="inv-details" className="px-4 pb-20 pt-2 sm:px-6">
              {/* Ceremony panel: no filled box — the page backdrop shows through,
                  with gold hairlines down both sides and a divider across the top. */}
                <div
                  data-burgundy-panel="true"
                  data-burgundy-panel-fill="none"
                  className="relative mx-auto w-full max-w-md"
                >
                  <h2
                    className="px-6 pt-10 text-[0.95rem] font-bold uppercase tracking-[0.22em] sm:text-base"
                    style={{ fontFamily: "var(--font-burgundy-display)", color: GOLD_BRIGHT }}
                  >
                    {panelHeading}
                  </h2>

                {hasParents ? (
                  <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-4 px-6 text-xs leading-5 sm:text-sm">
                    <ParentColumn
                      align="left"
                      label={data.parentOneLabel}
                      nameOne={data.parentOneNameOne}
                      nameTwo={data.parentOneNameTwo}
                    />
                    <ParentColumn
                      align="right"
                      label={data.parentTwoLabel}
                      nameOne={data.parentTwoNameOne}
                      nameTwo={data.parentTwoNameTwo}
                    />
                  </div>
                ) : null}

                <div className="px-6 pb-12 pt-6 text-center">
                <p className="mt-6 text-sm leading-6" style={{ color: `${CREAM}e6` }}>{invitationLine}</p>

                <div className="mt-5 space-y-1">
                  <p className="text-3xl leading-tight sm:text-4xl" style={{ fontFamily: "var(--font-burgundy-display)", color: GOLD_BRIGHT }}>
                    {data.partner1Name?.trim() || names}
                  </p>
                  {data.partner1Name?.trim() && data.partner2Name?.trim() ? (
                    <p className="text-2xl leading-none" style={{ fontFamily: "var(--font-burgundy-script)", color: GOLD }}>&amp;</p>
                  ) : null}
                  {data.partner2Name?.trim() ? (
                    <p className="text-3xl leading-tight sm:text-4xl" style={{ fontFamily: "var(--font-burgundy-display)", color: GOLD_BRIGHT }}>
                      {data.partner2Name}
                    </p>
                  ) : null}
                </div>

                {displayVenues.length ? (
                  <div className="mt-8 space-y-7">
                    {displayVenues.map((venue, index) => {
                      const venueTime = venue.time?.trim() || eventDate?.timeDisplay || "";
                      const parts = index === 0 ? ceremonyParts : receptionParts;
                      const label = venue.label?.trim()
                        || (index === 0 ? t("burgundyCeremonyLabel") : t("burgundyReceptionLabel"));
                      return (
                        <div key={`${venue.label ?? "venue"}-${index}`} className="border-t pt-6" style={{ borderColor: `${GOLD}40` }}>
                          <p className="text-[0.68rem] uppercase tracking-[0.24em]" style={{ color: GOLD_BRIGHT }}>{label}</p>
                          {venue.name?.trim() ? (
                            <p className="mt-2 text-base font-medium leading-6" style={{ color: CREAM }}>{venue.name}</p>
                          ) : null}
                          {venue.address?.trim() ? (
                            <p className="mt-1 text-xs leading-5" style={{ color: `${CREAM}b8` }}>{venue.address}</p>
                          ) : null}
                          {venueTime ? (
                            <p className="mt-2 text-sm tracking-[0.14em]" style={{ color: `${GOLD_BRIGHT}dd` }}>{venueTime}</p>
                          ) : null}
                          {parts ? <DateBlock parts={parts} /> : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                </div>
              </div>
            </section>

            {/* Stage 2B: gallery, reception, venue, dress code, programme, guestbook, memories, music. */}
            <BurgundyGoldSections
              data={data}
              sectionSettings={sectionSettings}
              mode={mode}
              hasAction={hasAction}
              actionPortal={actionPortal.length ? <>{actionPortal}</> : null}
            />
          </main>
        )}
      </div>
    </InvitationPageCanvas>
  );
}
