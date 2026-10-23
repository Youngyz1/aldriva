"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type {
  InvitationAccommodationItem,
  InvitationGalleryItem,
  InvitationPageData,
  InvitationScheduleItem,
  InvitationVenueItem,
} from "@/types/invitation-template";
import type { InvitationDetailsPresentation, InvitationGalleryPresentation } from "@/lib/invitation-template-registry";
import {
  type PageGlobalTheme,
} from "@/lib/page-composition";
import { cn } from "@/lib/utils";
import { formatLocalizedEventDate, getInvitationDictionary, localizeInvitationSystemCopy } from "@/lib/invitation-i18n";
import { normalizeInvitationColorHex } from "@/lib/invitation-colors";
import { invitationImageClassName } from "@/lib/invitation-image-presentation";
import { InvitationImageAccordion } from "@/components/invitation/blocks/InvitationImageAccordion";
import { InvitationGalleryGrid } from "@/components/invitation/InvitationGalleryGrid";
import { FloatingMusicControl } from "@/components/invitation/FloatingMusicControl";

const sectionBase = "mx-auto min-w-0 w-full max-w-5xl px-6 py-14 sm:py-20";

export function HeroBlock({
  title,
  eyebrow,
  subtitle,
  image,
  imageAlt,
  imageFocus,
  scrollPrompt,
  theme,
  locale = "en",
  romanticEnvelope = false,
  luxeEditorial = false,
  eventDate,
  timezone,
  venue,
  address,
  city,
}: {
  title: string;
  eyebrow?: string | null;
  subtitle?: string | null;
  image?: string | null;
  imageAlt?: string | null;
  imageFocus?: { x: number; y: number } | null;
  scrollPrompt?: string | null;
  theme: PageGlobalTheme;
  locale?: InvitationPageData["locale"];
  romanticEnvelope?: boolean;
  luxeEditorial?: boolean;
  eventDate?: string | null;
  timezone?: string | null;
  venue?: string | null;
  address?: string | null;
  city?: string | null;
}) {
  if (luxeEditorial) {
    const date = eventDate ? formatLocalizedEventDate(eventDate, locale, timezone) : null;
    const location = [venue, address, city].map((part) => part?.trim()).filter(Boolean).join(" · ");
    return (
      <header id="inv-hero" className="relative isolate flex min-h-[100dvh] w-full items-end overflow-hidden bg-[#6a5c52] text-white">
        {image ? (
          <img
            src={image}
            alt={imageAlt || title}
            className={invitationImageClassName("full-bleed", "absolute inset-0 h-full")}
            style={{ objectPosition: imageFocus ? `${imageFocus.x}% ${imageFocus.y}%` : "50% 50%" }}
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/10" aria-hidden="true" />
        <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col items-center justify-end px-5 pb-14 pt-24 text-center sm:px-10 sm:pb-20">
          <p className="mb-5 font-serif text-[.62rem] uppercase tracking-[.32em] text-white/90 sm:text-xs">
            {localizeInvitationSystemCopy(eyebrow || "The Holy Matrimony of", locale)}
          </p>
          <h1 className="max-w-5xl break-words text-balance font-serif text-[clamp(2.4rem,8vw,6rem)] font-normal leading-[1.05] tracking-[-.035em] drop-shadow-md">
            {title}
          </h1>
          {subtitle ? <p className="mt-5 max-w-xl break-words font-serif text-sm italic text-white/90 sm:text-lg">{localizeInvitationSystemCopy(subtitle, locale)}</p> : null}
          {date?.dateDisplay ? <p className="mt-7 font-serif text-xs uppercase tracking-[.2em] text-white/90 sm:text-sm">{date.dateDisplay}{date.timeDisplay && timezone ? ` · ${date.timeDisplay}` : ""}</p> : null}
          {location ? <p className="mt-2 max-w-xl break-words font-serif text-xs text-white/80 sm:text-sm">{location}</p> : null}
          <a className="mt-10 min-h-11 rounded-sm px-4 py-3 font-sans text-[.62rem] font-semibold uppercase tracking-[.2em] text-white underline decoration-white/70 underline-offset-8 outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white" href="#luxe-invitation">
            {localizeInvitationSystemCopy(scrollPrompt || "Explore invitation", locale)}
          </a>
        </div>
      </header>
    );
  }

  if (romanticEnvelope) {
    return (
      <header id="inv-hero" className={`relative isolate min-h-[100dvh] w-full overflow-hidden ${theme.classes.section ?? ""}`}>
        {image ? (
          <img
            src={image}
            alt={imageAlt || title}
            className={invitationImageClassName("full-bleed", "absolute inset-0 h-[100dvh]")}
            style={{ objectPosition: imageFocus ? `${imageFocus.x}% ${imageFocus.y}%` : "50% 50%" }}
          />
        ) : <div className="absolute inset-0 bg-[#E6DEC9]" />}
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950/85 via-stone-950/25 to-transparent" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 z-10 mx-auto flex max-w-5xl flex-col items-center px-6 pb-14 pt-40 text-center text-white sm:pb-20">
          {eyebrow ? <p className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-white/85">{localizeInvitationSystemCopy(eyebrow, locale)}</p> : null}
          <h1 className="max-w-4xl text-balance font-serif text-4xl leading-tight sm:text-6xl">{localizeInvitationSystemCopy(title, locale)}</h1>
          {subtitle ? <p className="mt-5 max-w-2xl font-serif text-base text-white/90 sm:text-lg">{localizeInvitationSystemCopy(subtitle, locale)}</p> : null}
          {scrollPrompt ? <a className="mt-10 text-xs font-semibold uppercase tracking-[0.2em] underline underline-offset-4" href="#inv-details">{localizeInvitationSystemCopy(scrollPrompt, locale)}</a> : null}
        </div>
      </header>
    );
  }

  return (
    <header id="inv-hero" className={`relative overflow-hidden ${theme.classes.section ?? ""}`}>
      <div className={`mx-auto grid w-full max-w-7xl items-center gap-8 px-6 py-12 sm:py-16 ${image ? "lg:min-h-[80vh] lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]" : "min-h-[46vh] max-w-5xl"}`}>
        {image ? (
        <div className="relative -mx-6 flex h-[46vh] min-h-72 w-[calc(100%+3rem)] items-center justify-center overflow-hidden sm:mx-0 sm:w-full lg:h-auto lg:max-h-[80vh]">
          <img
            src={image}
            alt={imageAlt || title}
            className={invitationImageClassName("full-bleed", "max-h-[680px] lg:h-auto lg:max-h-[80vh] lg:w-auto lg:max-w-full lg:object-contain")}
            style={{ objectPosition: imageFocus ? `${imageFocus.x}% ${imageFocus.y}%` : "50% 50%" }}
          />
        </div>
      ) : null}
      <div className={`relative z-10 flex min-h-72 flex-col justify-center py-8 ${image ? "text-center lg:text-left" : "mx-auto max-w-4xl items-center text-center"}`}>
        {eyebrow ? <p className={`mb-4 text-xs font-semibold uppercase tracking-[0.28em] ${theme.classes.body ?? ""}`}>{localizeInvitationSystemCopy(eyebrow, locale)}</p> : null}
        <h1 className={`max-w-4xl text-balance text-4xl leading-tight sm:text-6xl ${theme.classes.heading ?? ""}`}>
          {localizeInvitationSystemCopy(title, locale)}
        </h1>
        {subtitle ? <p className={`mt-5 max-w-2xl text-base sm:text-lg ${theme.classes.body ?? ""}`}>{localizeInvitationSystemCopy(subtitle, locale)}</p> : null}
        {scrollPrompt ? <a className="mt-10 text-xs font-semibold uppercase tracking-[0.2em] underline underline-offset-4" href="#inv-details">{localizeInvitationSystemCopy(scrollPrompt, locale)}</a> : null}
      </div>
      </div>
    </header>
  );
}

/** Warm, unframed hero used by the romantic-envelope guest journey. */
export function RomanticHeroBlock({
  title,
  eyebrow,
  subtitle,
  image,
  imageAlt,
  imageFocus,
  scrollPrompt,
  theme,
  locale = "en",
  botanicalReverie = false,
  eventDate,
  timezone,
  familyNote,
}: {
  title: string;
  eyebrow?: string | null;
  subtitle?: string | null;
  image?: string | null;
  imageAlt?: string | null;
  imageFocus?: { x: number; y: number } | null;
  scrollPrompt?: string | null;
  theme: PageGlobalTheme;
  locale?: InvitationPageData["locale"];
  botanicalReverie?: boolean;
  eventDate?: string;
  timezone?: string | null;
  familyNote?: string | null;
}) {
  if (botanicalReverie) {
    return (
      <BotanicalHeroBlock
        title={title}
        eyebrow={eyebrow}
        subtitle={subtitle}
        image={image}
        imageAlt={imageAlt}
        imageFocus={imageFocus}
        scrollPrompt={scrollPrompt}
        eventDate={eventDate}
        timezone={timezone}
        familyNote={familyNote}
        theme={theme}
        locale={locale}
      />
    );
  }

  const defaultEyebrow = `✦ ${localizeInvitationSystemCopy("The Holy Matrimony of", locale).toLocaleUpperCase(locale === "fr" ? "fr-FR" : "en-US")} ✦`;
  return (
    <header id="inv-hero" className={`relative isolate min-h-[100dvh] w-full overflow-hidden bg-transparent ${theme.classes.section ?? ""}`}>
      {image ? (
        <img
          src={image}
          alt={imageAlt || title}
          className={invitationImageClassName("full-bleed", "absolute inset-0 h-[100dvh]")}
          style={{ objectPosition: imageFocus ? `${imageFocus.x}% ${imageFocus.y}%` : "50% 50%" }}
        />
      ) : null}
      {image ? <div className="absolute inset-0 bg-gradient-to-t from-[#E6DEC9] via-[#E6DEC9]/75 to-[#E6DEC9]/10" aria-hidden="true" /> : null}
      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-5xl flex-col items-center justify-end px-6 pb-16 pt-24 text-center text-[#4A3B32] sm:pb-20">
        <p className="font-serif text-[#4A3B32] text-xs tracking-widest uppercase mb-4">
          {localizeInvitationSystemCopy(eyebrow || defaultEyebrow, locale)}
        </p>
        <h1 className="font-serif text-[#4A3B32] italic text-4xl md:text-6xl font-normal my-4 leading-snug drop-shadow-sm">
          {localizeInvitationSystemCopy(title, locale)}
        </h1>
        {subtitle ? (
          <p className="font-serif tracking-widest text-xs uppercase opacity-80 mt-6 max-w-md mx-auto border-t border-[#4A3B32]/20 pt-4">
            {localizeInvitationSystemCopy(subtitle, locale)}
          </p>
        ) : null}
        {scrollPrompt ? <a className="mt-8 font-serif text-xs uppercase tracking-widest underline underline-offset-4" href="#inv-details">{localizeInvitationSystemCopy(scrollPrompt, locale)}</a> : null}
      </div>
    </header>
  );
}

function BotanicalHeroBlock({
  title,
  eyebrow,
  subtitle,
  image,
  imageAlt,
  imageFocus,
  scrollPrompt,
  eventDate,
  timezone,
  familyNote,
  theme,
  locale,
}: {
  title: string;
  eyebrow?: string | null;
  subtitle?: string | null;
  image?: string | null;
  imageAlt?: string | null;
  imageFocus?: { x: number; y: number } | null;
  scrollPrompt?: string | null;
  eventDate?: string;
  timezone?: string | null;
  familyNote?: string | null;
  theme: PageGlobalTheme;
  locale: InvitationPageData["locale"];
}) {
  const date = eventDate ? formatLocalizedEventDate(eventDate, locale, timezone) : null;
  const dateLine = date
    ? [date.dateDisplay, timezone ? date.timeDisplay : null].filter(Boolean).join(" · ")
    : null;
  const intro = familyNote?.trim() || eyebrow?.trim() || localizeInvitationSystemCopy("Together with their families", locale);

  return (
    <header id="inv-hero" className="relative isolate overflow-hidden px-5 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-16 lg:py-20">
      <div className="pointer-events-none absolute -right-20 top-8 hidden h-[30rem] w-[24rem] opacity-30 lg:block" aria-hidden="true">
        {/* Authored local vector ornament; decorative only. */}
        <img src="/images/invitations/botanical/corner-sprig.svg" alt="" className="h-full w-full object-contain" />
      </div>
      <div className="relative mx-auto grid min-w-0 w-full max-w-7xl grid-cols-1 items-center gap-9 lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)] lg:gap-16">
        <div className="relative mx-auto min-w-0 w-full max-w-2xl lg:mx-0">
          <div className="absolute -inset-3 rotate-[-2deg] border border-[#bca77a]/70 bg-[#ede5d4] shadow-xl" aria-hidden="true" />
          <div className="relative overflow-hidden rounded-t-[48%] border border-[#bdad87] bg-[#ece5d7] p-2 shadow-2xl sm:p-3">
            <div className="overflow-hidden rounded-t-[48%] border border-[#d3c6a8] bg-[#eee8d9]">
              <img
                src={image || "/images/invitations/botanical/garden-arch.svg"}
                alt={image ? imageAlt || title : ""}
                className={invitationImageClassName("framed", "h-[52svh] min-h-[20rem] max-h-[36rem] lg:h-[76vh] lg:max-h-[46rem] lg:object-contain")}
                style={{ objectPosition: imageFocus ? `${imageFocus.x}% ${imageFocus.y}%` : "50% 50%" }}
                fetchPriority="high"
              />
            </div>
          </div>
          <span className="botanical-bloom botanical-bloom--hero absolute -right-3 top-12 hidden h-28 w-28 md:block" aria-hidden="true">
            <img src="/images/invitations/botanical/corner-sprig.svg" alt="" className="h-full w-full object-contain" />
          </span>
          <span className="absolute -bottom-5 left-1/2 h-10 w-10 -translate-x-1/2 rounded-full border border-[#b69b64] bg-[#f4efe4] p-2 text-[#936e4b] shadow-sm" aria-hidden="true">
            <svg viewBox="0 0 32 32" className="h-full w-full" fill="none"><path d="M16 3v26M4 16h24M7.5 7.5l17 17m0-17-17 17" stroke="currentColor" strokeWidth="1.2"/><circle cx="16" cy="16" r="4" fill="#c98d88"/></svg>
          </span>
        </div>

        <div className="relative z-10 mx-auto max-w-xl text-center lg:mx-0 lg:text-left">
          <p className="mb-6 font-sans text-[0.66rem] font-semibold uppercase tracking-[0.28em] text-[#6b7d6b] sm:text-xs">
            {localizeInvitationSystemCopy(intro, locale)}
          </p>
          <span className="mb-5 inline-block h-px w-16 bg-[#b69b64]" aria-hidden="true" />
          <h1 className={`text-balance font-serif text-5xl font-normal leading-[1.05] tracking-[-0.045em] text-[#263b31] sm:text-6xl lg:text-7xl ${theme.classes.heading ?? ""}`}>
            {localizeInvitationSystemCopy(title, locale)}
          </h1>
          {subtitle ? <p className={`mt-7 font-serif text-base italic leading-7 text-[#65766a] sm:text-lg ${theme.classes.body ?? ""}`}>{subtitle}</p> : null}
          {dateLine ? <p className="mt-8 font-sans text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#566b59]">{dateLine}</p> : null}
          <a href="#inv-details" className="mt-10 inline-flex min-h-12 items-center gap-4 border-b border-[#7d8b75] pb-2 font-sans text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[#365746] outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#365746]">
            {localizeInvitationSystemCopy(scrollPrompt || (locale === "fr" ? "Découvrir les détails" : "Explore the celebration"), locale)}
            <span aria-hidden="true">↓</span>
          </a>
        </div>
      </div>
    </header>
  );
}

export function StoryBlock({
  heading,
  text,
  image,
  moments,
  theme,
  locale = "en",
}: {
  heading?: string | null;
  text?: string | null;
  image?: string | null;
  moments?: { title?: string | null; text?: string | null; image?: string | null }[] | null;
  theme: PageGlobalTheme;
  locale?: InvitationPageData["locale"];
}) {
  const entries = (moments ?? []).filter((moment) => moment.title || moment.text || moment.image);
  if (!heading && !text && !image && entries.length === 0) return null;
  return (
    <section id="inv-story" className={`min-w-0 ${theme.classes.section ?? ""}`}>
      <div className={`${sectionBase} text-center`}>
        {heading ? <h2 className={`mb-5 text-3xl ${theme.classes.heading ?? ""}`}>{localizeInvitationSystemCopy(heading, locale)}</h2> : null}
        {image ? <img src={image} alt={localizeInvitationSystemCopy(heading || "Event story", locale)} className={invitationImageClassName("full-bleed", "h-auto object-contain -mx-6 mb-8 max-h-[34rem] w-[calc(100%_+_3rem)] max-w-none sm:mx-auto sm:w-full sm:max-w-2xl")} /> : null}
        {text ? <p className={`mx-auto min-w-0 max-w-3xl break-words whitespace-pre-line text-base leading-8 ${theme.classes.body ?? ""}`}>{text}</p> : null}
        {entries.length > 0 ? (
          <div className="mt-10 grid min-w-0 grid-cols-1 gap-8 text-left sm:grid-cols-2">
            {entries.map((moment, index) => (
              <article key={`${moment.title ?? "story"}-${index}`} className="min-w-0 border-t border-current/10 pt-5">
                {moment.image ? <img src={moment.image} alt={localizeInvitationSystemCopy(moment.title || "Story moment", locale)} className={invitationImageClassName("full-bleed", "h-auto object-contain -mx-6 mb-4 max-h-96 w-[calc(100%_+_3rem)] max-w-none sm:mx-0 sm:w-full sm:max-w-full")} /> : null}
                <div className="min-w-0 space-y-2 pt-3">
                  {moment.title ? <h3 className={`text-lg ${theme.classes.heading ?? ""}`}>{localizeInvitationSystemCopy(moment.title, locale)}</h3> : null}
                  {moment.text ? <p className={`min-w-0 break-words whitespace-pre-line text-sm leading-7 ${theme.classes.body ?? ""}`}>{moment.text}</p> : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function GalleryBlock({
  images,
  theme,
  locale = "en",
  botanicalReverie = false,
  evergreenEnvelope = false,
  presentation = "editorial",
}: {
  images?: InvitationGalleryItem[] | null;
  theme: PageGlobalTheme;
  locale?: InvitationPageData["locale"];
  botanicalReverie?: boolean;
  evergreenEnvelope?: boolean;
  presentation?: InvitationGalleryPresentation;
}) {
  const visibleImages = (images ?? []).filter((image) => image.url);
  const t = useTranslations("Events");
  if (visibleImages.length === 0) return null;
  if (presentation === "accordion") {
    return (
      <section id="inv-gallery" className={theme.classes.section ?? ""}>
        <div className={`mx-auto min-w-0 w-full max-w-6xl px-6 ${evergreenEnvelope ? "py-10 sm:py-12" : "py-14 sm:py-20"}`}>
          <h2 className={`mb-8 text-center text-3xl ${theme.classes.heading ?? ""}`}>{t("invitationGalleryHeading")}</h2>
          <InvitationImageAccordion images={visibleImages} theme={theme} locale={locale} />
        </div>
      </section>
    );
  }
  const gutter = botanicalReverie ? 11 : 6;
  const gridClass = presentation === "editorial"
    ? "grid grid-cols-1 items-start gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3"
    : presentation === "black-tie"
      ? "columns-1 gap-5 sm:columns-2 lg:columns-3"
      : presentation === "birthday"
        ? "grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3"
        : "columns-1 gap-4 sm:columns-2 lg:columns-3";
  const isUnframed = presentation !== "romantic" && presentation !== "birthday";
  const imageClassName = cn(
    presentation === "black-tie" ? "contrast-110 grayscale" : "",
    presentation === "romantic" ? "border border-[#e8d5c4]/50" : "",
  );
  const captionClassName = cn(
    "break-words pt-2",
    presentation === "editorial" ? "font-serif italic text-[#6a5c52]" : "",
    theme.classes.body ?? "",
  );
  const galleryContainer = evergreenEnvelope
    ? "mx-auto min-w-0 w-full max-w-5xl px-6 py-10 sm:py-12"
    : sectionBase;
  return (
    <section id="inv-gallery" className={theme.classes.section ?? ""}>
      <div className={galleryContainer}>
        <h2 className={`mb-8 text-center text-3xl ${theme.classes.heading ?? ""}`}>{t("invitationGalleryHeading")}</h2>
        <InvitationGalleryGrid
          images={visibleImages}
          imageClassName={imageClassName}
          captionClassName={captionClassName}
          lightboxCaptionClassName={theme.classes.body ?? "text-xs text-white/80"}
          gridClassName={cn("min-w-0", gridClass)}
          figureClassName={(index) => cn(
            "min-w-0",
            presentation === "editorial" && index === 0 ? "sm:col-span-2 sm:row-span-2" : "",
            presentation === "romantic" ? "mb-5 border border-[#e8d5c4]/70 bg-white p-2 shadow-sm" : "",
            presentation === "birthday" ? "border border-amber-200 bg-white p-3 shadow-sm" : "",
          )}
          mobileBleedGutter={isUnframed ? gutter : undefined}
        />
      </div>
    </section>
  );
}

const EVERGREEN_SCHEDULE_ICON_FALLBACKS = ["dining", "champagne", "cake", "dancing", "hand"] as const;

function EvergreenScheduleIcon({ icon, index }: { icon?: InvitationScheduleItem["icon"]; index: number }) {
  const selected = icon || EVERGREEN_SCHEDULE_ICON_FALLBACKS[index % EVERGREEN_SCHEDULE_ICON_FALLBACKS.length];
  return (
    <svg viewBox="0 0 48 48" className="h-9 w-9 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {selected === "dining" ? <><circle cx="24" cy="24" r="15" /><circle cx="24" cy="24" r="10" /><path d="M8 7v13m-3-13v7c0 3 6 3 6 0V7m-3 13v21M40 7c-5 5-5 11-1 13v21M40 7v13" /></> : null}
      {selected === "champagne" ? <><path d="M8 7h13v8a6.5 6.5 0 0 1-13 0V7Zm19 0h13v8a6.5 6.5 0 0 1-13 0V7ZM14.5 21v15m-5 0h10m11-15v15m-5 0h10M14.5 36v5m11-5v5m-7 0h14" /><path d="M8 12h13m6 0h13" /></> : null}
      {selected === "cake" ? <><path d="M8 23h32v14H8zM5 41h38M12 23c0-5 5-5 5-10 0 5 5 5 5 10m3 0c0-5 5-5 5-10 0 5 5 5 5 10M15 29v3m9-3v3m9-3v3" /><path d="M17 9V6m12 3V6" /></> : null}
      {selected === "dancing" ? <><circle cx="17" cy="10" r="3" /><circle cx="32" cy="9" r="3" /><path d="m17 14-3 11 8 4 4 12m-11-16-6 10m12-6 10-9 6 3m-11 2 6 7 6 1m-16-12 8-5" /><path d="M7 41h34" /></> : null}
      {selected === "gift" ? <><path d="M7 20h34v21H7zM5 14h38v7H5zM24 14v27" /><path d="M24 14c-11 0-13-2-13-6 0-5 9-4 13 6Zm0 0c11 0 13-2 13-6 0-5-9-4-13 6Z" /></> : null}
      {selected === "hand" ? <path d="M15 23v-9a2 2 0 0 1 4 0v7-11a2 2 0 0 1 4 0v11-9a2 2 0 0 1 4 0v10-6a2 2 0 0 1 4 0v12c0 6-4 10-10 10h-2c-4 0-6-2-8-5l-4-7a2.4 2.4 0 0 1 4-2l4 4v-5Z" /> : null}
    </svg>
  );
}

export function ScheduleBlock({
  timeline,
  theme,
  locale = "en",
  romanticEnvelope = false,
  botanicalReverie = false,
  evergreenEnvelope = false,
  presentation,
}: {
  timeline?: InvitationScheduleItem[] | null;
  theme: PageGlobalTheme;
  locale?: InvitationPageData["locale"];
  romanticEnvelope?: boolean;
  botanicalReverie?: boolean;
  evergreenEnvelope?: boolean;
  presentation?: InvitationDetailsPresentation;
}) {
  const entries = (timeline ?? []).filter((item) => item.time && (item.title || item.label));
  const t = useTranslations("Events");
  if (entries.length === 0) return null;
  if (evergreenEnvelope) {
    return (
      <section id="inv-schedule" data-evergreen-section="schedule" className="relative bg-[#52643a] px-5 py-10 text-[#fffdf2] sm:py-12">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-10 text-center font-serif text-2xl uppercase tracking-[.18em] text-[#fffdf2] sm:text-3xl">{t("evergreenScheduleHeading")}</h2>
          <ol className="relative mx-auto max-w-5xl before:absolute before:bottom-6 before:left-1/2 before:top-6 before:w-px before:-translate-x-1/2 before:bg-[#f5f0d8]/70 before:content-['']">
            {entries.map((item, index) => (
              <li key={`${item.time}-${item.title}-${index}`} className="relative grid min-h-24 grid-cols-[minmax(0,1fr)_1.25rem_minmax(0,1fr)] items-center gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] sm:gap-4">
                <div className="flex min-w-0 items-center gap-2 sm:gap-4">
                  <span className="grid size-10 shrink-0 place-items-center text-[#fffdf2] sm:size-12"><EvergreenScheduleIcon icon={item.icon} index={index} /></span>
                  <p className="min-w-0 break-words font-serif text-sm tracking-wide text-white sm:text-lg">{item.time}</p>
                </div>
                <span aria-hidden="true" className="relative z-10 mx-auto size-3 rounded-full border border-[#f5f0d8] bg-[#fffdf2]" />
                <article className="min-w-0 pl-2 sm:pl-4">
                  <h3 className="break-words font-serif text-base text-[#fffdf2] sm:text-lg">{item.title || item.label}</h3>
                  {item.description ? <p className="mt-1 break-words text-sm leading-6 text-[#f5f0d8]">{item.description}</p> : null}
                </article>
              </li>
            ))}
          </ol>
        </div>
      </section>
    );
  }
  const variant = presentation ?? (botanicalReverie ? "botanical" : romanticEnvelope ? "romantic" : "editorial");
  const isTrack = variant === "botanical" || variant === "romantic" || variant === "luxe-editorial" || variant === "black-tie" || variant === "birthday";
  const trackLine = variant === "botanical"
    ? "before:bg-[#9cae99]"
      : variant === "luxe-editorial"
        ? "before:bg-[#c5a880]/65"
      : variant === "black-tie"
      ? "before:bg-amber-400/50"
      : variant === "birthday"
        ? "before:bg-fuchsia-400/70"
        : "before:bg-[#D9D0B7]";
  const itemSurface = {
    botanical: "relative mx-auto my-6 min-w-0 max-w-2xl overflow-hidden border border-[#c7cdbb] border-l-4 border-l-[#71856c] bg-[#fffdf7]/95 p-6 shadow-[0_14px_34px_rgba(47,65,48,.12)] transition-transform duration-300 hover:translate-x-1 sm:p-8",
    editorial: "grid min-w-0 grid-cols-1 gap-2 border-b border-current/15 pb-5 last:border-0 last:pb-0 sm:grid-cols-[9rem_minmax(0,1fr)]",
    "black-tie": "relative min-w-0 border-y border-zinc-700 bg-zinc-900/75 px-5 py-6 sm:px-7",
    "luxe-editorial": "relative min-w-0 border border-[#e8d5c4]/70 bg-white/90 px-5 py-6 shadow-sm sm:px-7",
    romantic: "relative mx-auto my-6 min-w-0 max-w-2xl transform overflow-hidden rounded-2xl border-2 border-[#D9D0B7] bg-white/95 p-6 shadow-xl transition-transform duration-300 hover:scale-[1.01]",
    birthday: "relative min-w-0 border-l-4 border-fuchsia-500 bg-slate-800/85 px-5 py-5 shadow-[5px_5px_0_rgba(15,23,42,.22)] sm:px-7",
    cover: "grid min-w-0 grid-cols-1 gap-2 border-b border-current/15 pb-5 last:border-0 last:pb-0 sm:grid-cols-[9rem_minmax(0,1fr)]",
  }[variant];
  const timeBadge = {
    botanical: "bg-[#365746] text-[#f4efe4]",
    editorial: "font-serif text-lg font-semibold tracking-wide",
    "black-tie": "border-b border-amber-400/50 pb-2 font-mono text-xs uppercase tracking-[0.2em] text-amber-300",
    "luxe-editorial": "rounded-full bg-[#4a4a4a] px-3 py-1 font-mono text-[.62rem] uppercase tracking-[.18em] text-[#fdfaf6]",
    romantic: "bg-[#4A3B32] text-[#E6DEC9] rounded-full px-3 py-1",
    birthday: "bg-fuchsia-500 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950",
    cover: "font-serif text-lg font-semibold tracking-wide",
  }[variant];
  return (
    <section id="inv-schedule" className={theme.classes.section ?? ""}>
      <div className={`${sectionBase} max-w-3xl`}>
        <div className={`mb-8 flex items-center justify-center gap-4 ${variant === "black-tie" ? "text-amber-300" : variant === "birthday" ? "text-fuchsia-500" : "text-current"}`} aria-hidden="true">
          <span className="h-px w-10 bg-current opacity-40" />
          <span className="size-1.5 rotate-45 border border-current" />
          <span className="h-px w-10 bg-current opacity-40" />
        </div>
        <h2 className={`mb-8 text-center text-3xl ${variant === "botanical" ? "font-serif font-normal tracking-wide text-[#365746]" : variant === "black-tie" ? "font-serif font-light uppercase tracking-[0.18em] text-zinc-100" : variant === "romantic" ? "font-serif font-normal italic text-[#4A3B32]" : variant === "luxe-editorial" ? "font-serif font-normal uppercase tracking-[.2em] text-[#4a4a4a]" : variant === "birthday" ? "font-black uppercase tracking-tight text-fuchsia-500" : `font-serif ${theme.classes.heading ?? ""}`}`}>{localizeInvitationSystemCopy("Schedule", locale)}</h2>
        <ol className={isTrack
          ? `relative mx-auto max-w-2xl space-y-0 before:absolute before:bottom-8 before:left-5 before:top-8 before:w-px before:content-[''] ${trackLine}`
          : "space-y-5"}>
          {entries.map((item, index) => (
            <li key={`${item.time}-${index}`} className={isTrack ? "relative z-10 min-w-0 py-3 pl-8" : "min-w-0"}>
              <article className={itemSurface}>
                {isTrack ? <span className={`absolute left-[1.05rem] top-[1.55rem] z-10 h-3 w-3 rounded-full border-2 ${variant === "botanical" ? "border-[#f4efe4] bg-[#bd8583]" : variant === "luxe-editorial" ? "border-[#fdfaf6] bg-[#c5a880]" : variant === "black-tie" ? "border-zinc-900 bg-amber-400" : variant === "birthday" ? "border-slate-900 bg-fuchsia-400" : "border-[#E6DEC9] bg-[#8A4D42]"} shadow-sm`} aria-hidden="true" /> : null}
                <p className={`mb-3 inline-flex items-center gap-2 ${timeBadge} ${isTrack ? "font-mono text-xs uppercase tracking-wider" : ""}`}>
                  {item.time}{item.badge ? ` · ${localizeInvitationSystemCopy(item.badge, locale)}` : ""}
                </p>
                <div className="min-w-0 break-words">
                  {item.day || item.dayLabel ? <p className={`mb-1 text-xs font-semibold uppercase tracking-wide ${theme.classes.body ?? ""}`}>{localizeInvitationSystemCopy(item.day || item.dayLabel || "", locale)}</p> : null}
                  <h3 className={`${variant === "black-tie" ? "font-serif text-zinc-100" : variant === "birthday" ? "font-bold text-white" : ""} ${theme.classes.heading ?? ""}`}>{localizeInvitationSystemCopy(item.title || item.label || "", locale)}</h3>
                  {item.description ? <p className={`mt-1 min-w-0 break-words whitespace-pre-line text-sm ${variant === "black-tie" || variant === "birthday" ? "text-zinc-300" : ""} ${theme.classes.body ?? ""}`}>{item.description}</p> : null}
                </div>
              </article>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function CountdownBlock({
  targetDate,
  theme,
  locale = "en",
  romanticEnvelope = false,
  evergreenEnvelope = false,
  showRomanticTagline = romanticEnvelope,
  botanicalReverie = false,
  luxeEditorial = false,
}: {
  targetDate?: string | null;
  theme: PageGlobalTheme;
  locale?: InvitationPageData["locale"];
  romanticEnvelope?: boolean;
  evergreenEnvelope?: boolean;
  showRomanticTagline?: boolean;
  botanicalReverie?: boolean;
  luxeEditorial?: boolean;
}) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0, isPast: false });
  const dictionary = getInvitationDictionary(locale);
  const targetTimestamp = targetDate ? new Date(targetDate).getTime() : Number.NaN;

  useEffect(() => {
    if (!Number.isFinite(targetTimestamp)) return;
    const update = () => {
      const difference = targetTimestamp - Date.now();
      if (difference <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true });
        return;
      }
      setTimeLeft({
        days: Math.floor(difference / 86_400_000),
        hours: Math.floor((difference % 86_400_000) / 3_600_000),
        minutes: Math.floor((difference % 3_600_000) / 60_000),
        seconds: Math.floor((difference % 60_000) / 1_000),
        isPast: false,
      });
    };
    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, [targetTimestamp]);

  if (!Number.isFinite(targetTimestamp)) return null;
  const countdownContainer = evergreenEnvelope
    ? "mx-auto min-w-0 w-full max-w-3xl px-6 py-0 text-center"
    : `${sectionBase} max-w-3xl text-center`;
  return (
    <section className={theme.classes.section ?? ""}>
      <div className={countdownContainer}>
        <h2 className={`mb-8 text-2xl ${botanicalReverie ? theme.classes.heading ?? "font-serif text-[#365746]" : romanticEnvelope ? "font-serif text-[#4A3B32]" : luxeEditorial ? "font-serif font-normal tracking-[.14em] text-[#4a4a4a]" : theme.classes.heading ?? ""}`}>{localizeInvitationSystemCopy("Countdown to the celebration", locale)}</h2>
        {timeLeft.isPast ? (
          <p className={`font-serif italic ${theme.classes.body ?? ""}`}>{dictionary.celebrationUnderway}</p>
        ) : (
          <div className="grid grid-cols-4 gap-3 sm:gap-6" aria-label={localizeInvitationSystemCopy("Countdown timer", locale)}>
            {([
              { label: dictionary.days, value: timeLeft.days },
              { label: dictionary.hours, value: timeLeft.hours },
              { label: locale === "fr" ? dictionary.minutes : "Mins", value: timeLeft.minutes },
              { label: locale === "fr" ? dictionary.seconds : "Secs", value: timeLeft.seconds },
            ]).map((unit) => (
              <div key={unit.label} className={`border-r border-stone-300/70 last:border-0 ${botanicalReverie ? "border-[#71856c]/35" : romanticEnvelope ? "border-[#4A3B32]/20" : ""}`}>
                <p className={botanicalReverie ? "font-serif text-3xl md:text-4xl text-[#365746] tracking-widest tabular-nums" : romanticEnvelope ? "font-serif text-3xl md:text-4xl text-[#4A3B32] tracking-widest tabular-nums" : luxeEditorial ? "font-serif text-3xl md:text-4xl text-[#4a4a4a] tracking-widest tabular-nums" : `tabular-nums font-serif text-3xl sm:text-5xl ${theme.classes.heading ?? ""}`}>{String(unit.value).padStart(2, "0")}</p>
                <p className={botanicalReverie || romanticEnvelope || luxeEditorial ? "font-serif text-[10px] tracking-widest uppercase opacity-70 mt-2" : `mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] ${theme.classes.body ?? ""}`}>{unit.label}</p>
              </div>
            ))}
          </div>
        )}
        {showRomanticTagline ? <p className="font-serif text-[10px] tracking-widest uppercase opacity-70 mt-2">{localizeInvitationSystemCopy("Counting the days until we say I do", locale)}</p> : null}
      </div>
    </section>
  );
}

interface DetailsPresentationClasses {
  container: string;
  heading: string;
  ornament: string;
  overview: string;
  datePanel: string;
  dateLabel: string;
  dateValue: string;
  dateTime: string;
  venuePanel: string;
  venueLabel: string;
  venueValue: string;
  venueAddress: string;
  detailGrid: string;
  detail: string;
  detailLabel: string;
  detailValue: string;
  venueGrid: string;
  venueCard: string;
  stayGrid: string;
  stayCard: string;
  colorList: string;
  colorItem: string;
}

const DETAILS_PRESENTATION_CLASSES: Record<InvitationDetailsPresentation, DetailsPresentationClasses> = {
  botanical: {
    container: "max-w-6xl",
    heading: "font-serif font-normal tracking-[0.08em] text-[#365746]",
    ornament: "text-[#b69b64]",
    overview: "grid grid-cols-1 gap-6 border-y border-[#b9a77c]/70 py-6 sm:grid-cols-2 sm:gap-8",
    datePanel: "text-center sm:border-r sm:border-[#b9a77c]/50 sm:pr-8",
    dateLabel: "text-[#65766a]",
    dateValue: "font-serif text-3xl leading-tight text-[#263b31] sm:text-4xl",
    dateTime: "text-[#53665a]",
    venuePanel: "text-center sm:pl-2",
    venueLabel: "text-[#65766a]",
    venueValue: "font-serif text-xl text-[#263b31]",
    venueAddress: "font-serif italic text-[#53665a]",
    detailGrid: "grid min-w-0 grid-cols-1 gap-x-8 sm:grid-cols-2",
    detail: "border-b border-[#b9a77c]/40 py-4",
    detailLabel: "text-[.62rem] tracking-[.18em] text-[#65766a]",
    detailValue: "font-serif text-[#263b31]",
    venueGrid: "grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2",
    venueCard: "border-l-2 border-[#9baf94] bg-[#fffdf7]/70 px-5 py-4",
    stayGrid: "grid min-w-0 grid-cols-1 gap-x-8 sm:grid-cols-2",
    stayCard: "border-t border-[#b9a77c]/60 py-4",
    colorList: "flex min-w-0 flex-wrap gap-x-6 gap-y-2",
    colorItem: "border-b border-[#b9a77c]/40 font-serif text-[#365746]",
  },
  "luxe-editorial": {
    container: "max-w-6xl",
    heading: "font-serif font-normal tracking-[.12em] text-[#4a4a4a]",
    ornament: "text-[#c5a880]",
    overview: "grid grid-cols-1 gap-7 border-y border-[#c5a880]/50 py-8 sm:grid-cols-2 sm:gap-10",
    datePanel: "text-center sm:border-r sm:border-[#c5a880]/40 sm:pr-8",
    dateLabel: "text-[#8c7656]",
    dateValue: "font-serif text-3xl leading-tight text-[#4a4a4a] sm:text-4xl",
    dateTime: "font-serif italic text-[#6a5c52]",
    venuePanel: "text-center sm:pl-1",
    venueLabel: "text-[#8c7656]",
    venueValue: "font-serif text-xl text-[#4a4a4a] sm:text-2xl",
    venueAddress: "font-serif italic text-[#6a5c52]",
    detailGrid: "grid min-w-0 grid-cols-1 gap-x-10 sm:grid-cols-2",
    detail: "border-b border-[#c5a880]/35 py-4",
    detailLabel: "text-[.62rem] tracking-[.2em] text-[#8c7656]",
    detailValue: "font-serif text-[#4a4a4a]",
    venueGrid: "grid min-w-0 grid-cols-1 gap-x-8 sm:grid-cols-2",
    venueCard: "border-t border-[#c5a880]/45 py-4",
    stayGrid: "grid min-w-0 grid-cols-1 gap-x-8 sm:grid-cols-2",
    stayCard: "border-t border-[#c5a880]/45 py-4",
    colorList: "flex min-w-0 flex-wrap gap-x-6 gap-y-2",
    colorItem: "border-b border-[#c5a880]/45 font-serif text-[#4a4a4a]",
  },
  editorial: {
    container: "max-w-6xl",
    heading: "font-serif font-normal tracking-wide text-zinc-100",
    ornament: "text-amber-300",
    overview: "grid grid-cols-1 gap-7 border-y border-zinc-700 py-7 sm:grid-cols-2 sm:gap-9",
    datePanel: "sm:border-r sm:border-zinc-700 sm:pr-8",
    dateLabel: "text-zinc-400",
    dateValue: "font-serif text-2xl leading-tight text-zinc-100 sm:text-3xl",
    dateTime: "font-serif italic text-zinc-300",
    venuePanel: "sm:pl-1",
    venueLabel: "text-zinc-400",
    venueValue: "font-serif text-xl text-zinc-100 sm:text-2xl",
    venueAddress: "font-serif text-zinc-300",
    detailGrid: "grid min-w-0 grid-cols-1 gap-x-10 sm:grid-cols-2",
    detail: "border-b border-zinc-800 py-4",
    detailLabel: "text-[.62rem] tracking-[.2em] text-zinc-400",
    detailValue: "font-serif text-zinc-200",
    venueGrid: "grid min-w-0 grid-cols-1 gap-x-8 sm:grid-cols-2",
    venueCard: "border-t border-zinc-800 py-4",
    stayGrid: "grid min-w-0 grid-cols-1 gap-x-8 sm:grid-cols-2",
    stayCard: "border-t border-zinc-800 py-4",
    colorList: "flex min-w-0 flex-wrap gap-x-6 gap-y-2",
    colorItem: "border-b border-zinc-700 font-serif text-zinc-200",
  },
  "black-tie": {
    container: "max-w-6xl",
    heading: "font-serif font-light uppercase tracking-[0.18em] text-zinc-100",
    ornament: "text-amber-400",
    overview: "grid grid-cols-1 gap-7 border-y border-zinc-700 py-7 sm:grid-cols-2 sm:gap-9",
    datePanel: "sm:border-r sm:border-zinc-700 sm:pr-8",
    dateLabel: "text-[.62rem] tracking-[.22em] text-amber-300",
    dateValue: "font-serif text-2xl text-zinc-100 sm:text-3xl",
    dateTime: "font-mono text-xs uppercase tracking-widest text-zinc-400",
    venuePanel: "sm:pl-1",
    venueLabel: "text-[.62rem] tracking-[.22em] text-amber-300",
    venueValue: "font-serif text-xl text-zinc-100 sm:text-2xl",
    venueAddress: "text-sm text-zinc-300",
    detailGrid: "grid min-w-0 grid-cols-1 gap-x-10 sm:grid-cols-2",
    detail: "border-b border-zinc-800 py-4",
    detailLabel: "text-[.6rem] tracking-[.2em] text-amber-300/80",
    detailValue: "font-serif text-zinc-200",
    venueGrid: "grid min-w-0 grid-cols-1 gap-x-8 sm:grid-cols-2",
    venueCard: "border-y border-zinc-800 py-4",
    stayGrid: "grid min-w-0 grid-cols-1 gap-x-8 sm:grid-cols-2",
    stayCard: "border-l border-amber-400/50 py-3 pl-5",
    colorList: "flex min-w-0 flex-wrap gap-x-6 gap-y-2",
    colorItem: "border-b border-amber-400/40 font-serif text-zinc-200",
  },
  romantic: {
    container: "max-w-6xl",
    heading: "font-serif font-normal italic tracking-wide text-[#774b4b]",
    ornament: "text-[#b7827c]",
    overview: "grid grid-cols-1 gap-7 border-y border-[#d4b2a7]/65 py-8 sm:grid-cols-2 sm:gap-10",
    datePanel: "text-center sm:border-r sm:border-[#d4b2a7]/55 sm:pr-8",
    dateLabel: "text-[#9b7069]",
    dateValue: "font-serif text-3xl italic leading-tight text-[#774b4b] sm:text-4xl",
    dateTime: "font-serif text-sm italic text-[#7c716e]",
    venuePanel: "text-center sm:pl-1",
    venueLabel: "text-[#9b7069]",
    venueValue: "font-serif text-xl text-[#513d39] sm:text-2xl",
    venueAddress: "font-serif italic text-[#7c716e]",
    detailGrid: "grid min-w-0 grid-cols-1 gap-x-10 sm:grid-cols-2",
    detail: "border-b border-[#d4b2a7]/50 py-4",
    detailLabel: "text-[.62rem] tracking-[.16em] text-[#9b7069]",
    detailValue: "font-serif text-[#513d39]",
    venueGrid: "grid min-w-0 grid-cols-1 gap-x-8 sm:grid-cols-2",
    venueCard: "border-t border-[#d4b2a7]/60 py-4",
    stayGrid: "grid min-w-0 grid-cols-1 gap-x-8 sm:grid-cols-2",
    stayCard: "border-t border-[#d4b2a7]/60 py-4",
    colorList: "flex min-w-0 flex-wrap gap-x-6 gap-y-2",
    colorItem: "border-b border-[#d4b2a7]/55 font-serif text-[#774b4b]",
  },
  birthday: {
    container: "max-w-6xl",
    heading: "font-black uppercase tracking-tight text-fuchsia-500",
    ornament: "text-fuchsia-500",
    overview: "grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5",
    datePanel: "border-2 border-slate-950 bg-white/95 p-5 shadow-[5px_5px_0_rgba(15,23,42,.24)]",
    dateLabel: "text-xs font-black uppercase tracking-[.16em] text-violet-700",
    dateValue: "font-black text-2xl leading-tight text-slate-950 sm:text-3xl",
    dateTime: "font-bold uppercase tracking-wide text-slate-700",
    venuePanel: "border-l-4 border-violet-500 bg-slate-800/85 p-5 text-white",
    venueLabel: "text-xs font-black uppercase tracking-[.16em] text-fuchsia-300",
    venueValue: "font-black text-xl text-white sm:text-2xl",
    venueAddress: "text-sm font-medium text-slate-200",
    detailGrid: "grid min-w-0 grid-cols-1 gap-x-8 sm:grid-cols-2",
    detail: "border-l-4 border-fuchsia-400 py-3 pl-4",
    detailLabel: "text-[.62rem] font-black tracking-[.14em] text-fuchsia-200",
    detailValue: "font-semibold text-slate-100",
    venueGrid: "grid min-w-0 grid-cols-1 gap-x-5 sm:grid-cols-2",
    venueCard: "border-l-4 border-violet-500 bg-slate-800/85 px-5 py-4 text-white",
    stayGrid: "grid min-w-0 grid-cols-1 gap-x-5 sm:grid-cols-2",
    stayCard: "border-b-2 border-fuchsia-400 py-4",
    colorList: "flex min-w-0 flex-wrap gap-3",
    colorItem: "border-2 border-slate-900 bg-white/90 px-3 py-2 font-bold text-slate-900 shadow-[3px_3px_0_rgba(15,23,42,.18)]",
  },
  cover: {
    container: "max-w-5xl",
    heading: "font-serif font-normal text-zinc-900",
    ornament: "text-zinc-500",
    overview: "grid grid-cols-1 gap-6 border-y border-zinc-300/80 py-6 sm:grid-cols-2",
    datePanel: "sm:border-r sm:border-zinc-300/80 sm:pr-8",
    dateLabel: "text-slate-300",
    dateValue: "font-serif text-2xl text-white sm:text-3xl",
    dateTime: "font-serif italic text-slate-200",
    venuePanel: "sm:pl-1",
    venueLabel: "text-slate-300",
    venueValue: "font-serif text-xl text-white",
    venueAddress: "text-sm text-slate-200",
    detailGrid: "grid min-w-0 grid-cols-1 gap-x-8 sm:grid-cols-2",
    detail: "border-b border-slate-700 py-3",
    detailLabel: "text-[.62rem] tracking-[.18em] text-slate-300",
    detailValue: "text-slate-100",
    venueGrid: "grid min-w-0 grid-cols-1 gap-x-8 sm:grid-cols-2",
    venueCard: "border-t border-zinc-300/80 py-4",
    stayGrid: "grid min-w-0 grid-cols-1 gap-x-8 sm:grid-cols-2",
    stayCard: "border-t border-zinc-300/80 py-4",
    colorList: "flex min-w-0 flex-wrap gap-x-6 gap-y-2",
    colorItem: "border-b border-white/30 text-white",
  },
};

function Detail({
  label,
  value,
  theme,
  locale,
  presentation,
}: {
  label: string;
  value?: string | null;
  theme: PageGlobalTheme;
  locale: InvitationPageData["locale"];
  presentation: InvitationDetailsPresentation;
}) {
  if (!value?.trim()) return null;
  const styles = DETAILS_PRESENTATION_CLASSES[presentation];
  return (
    <div className={cn("min-w-0", styles.detail)}>
      <dt className={cn("break-words text-xs font-semibold uppercase tracking-wide", theme.classes.body, styles.detailLabel)}>
        {localizeInvitationSystemCopy(label, locale)}
      </dt>
      <dd className={cn("mt-1 min-w-0 break-words whitespace-pre-line text-sm leading-6", theme.classes.heading, styles.detailValue)}>{value}</dd>
    </div>
  );
}

export function DetailsBlock({
  data,
  theme,
  romanticEnvelope = false,
  botanicalReverie = false,
  presentation,
  showOverview = true,
}: {
  data: InvitationPageData;
  theme: PageGlobalTheme;
  romanticEnvelope?: boolean;
  botanicalReverie?: boolean;
  presentation?: InvitationDetailsPresentation;
  showOverview?: boolean;
}) {
  const variant = presentation ?? (botanicalReverie ? "botanical" : romanticEnvelope ? "romantic" : "editorial");
  const styles = DETAILS_PRESENTATION_CLASSES[variant];
  const locale = data.locale ?? "en";
  const { dateDisplay, timeDisplay } = formatLocalizedEventDate(data.eventDate, locale, data.timezone);
  const showDate = Boolean(data.eventDate && dateDisplay && !botanicalReverie);
  const showTime = Boolean(showDate && data.timezone && timeDisplay);
  const sourceVenues: InvitationVenueItem[] = (data.venues ?? []).filter((venue) =>
    Boolean(venue?.name?.trim() || venue?.address?.trim())
  );
  const primaryVenueRecord = sourceVenues.find((venue) => venue.name?.trim()) ?? sourceVenues[0];
  const venueName = data.venue?.trim() || primaryVenueRecord?.name?.trim() || "";
  const providedAddress = [data.address, data.city].filter((value) => value?.trim()).join(", ");
  const venueAddress = providedAddress || primaryVenueRecord?.address?.trim() || "";
  const otherVenues = sourceVenues.filter((venue) =>
    !(venue === primaryVenueRecord || (venue.name?.trim() && venue.name.trim() === data.venue?.trim()))
  );
  const stays: InvitationAccommodationItem[] = (data.accommodations ?? []).filter((stay) =>
    Boolean(stay.name?.trim() || stay.notes?.trim() || stay.bookingUrl?.trim())
  );
  const colors = (data.colorsOfTheDay ?? []).flatMap((color) => {
    const hex = typeof color.hex === "string" ? normalizeInvitationColorHex(color.hex) : null;
    const name = typeof color.name === "string" ? color.name.trim() : "";
    return name || hex ? [{ name, hex }] : [];
  });
  const detailFields: { label: string; value?: string | null }[] = [
    { label: "Parking & arrival", value: data.parkingNotes },
    { label: "Dress code", value: data.dressCode },
    { label: "Attire notes", value: data.dressCodeNotes },
    { label: "Additional information", value: data.additionalNotes },
    { label: "Registry", value: data.registryNote },
    { label: "Gift note", value: data.giftNote },
    { label: "Hashtag", value: data.hashtag },
    { label: "Celebration", value: variant !== "luxe-editorial" && data.partner1Name && data.partner2Name ? `${data.partner1Name} & ${data.partner2Name}` : null },
    { label: "Celebration", value: variant !== "luxe-editorial" ? data.familyNote : null },
    { label: "Celebration", value: data.celebrantName },
    { label: "Celebration", value: data.ageMilestone ? String(data.ageMilestone) : null },
    { label: "Celebration", value: data.theme },
  ].filter(({ value }) => Boolean(value?.trim()));
  const hasVenue = Boolean(venueName || venueAddress);
  const hasDetails = Boolean(
    (showOverview && (showDate || hasVenue)) || detailFields.length || otherVenues.length || stays.length || colors.length
  );
  if (!hasDetails) return null;

  const hasOverview = showOverview && (showDate || hasVenue);
  return (
    <section id="inv-details" className={theme.classes.section ?? ""}>
      <div className={cn(sectionBase, styles.container)}>
        <div className="mb-7 flex items-center justify-center gap-4" aria-hidden="true">
          <span className={cn("h-px w-10 bg-current opacity-40", styles.ornament)} />
          <span className={cn("size-1.5 rotate-45 border border-current", styles.ornament)} />
          <span className={cn("h-px w-10 bg-current opacity-40", styles.ornament)} />
        </div>
        <h2 className={cn("mb-8 text-center text-3xl", theme.classes.heading, styles.heading)}>
          {localizeInvitationSystemCopy("Event details", locale)}
        </h2>

        {hasOverview ? (
          <div className={cn(styles.overview, showDate && hasVenue ? "sm:grid-cols-2" : "sm:grid-cols-1")}>
            {showDate ? (
              <div className={cn("min-w-0", styles.datePanel)}>
                <p className={cn("mb-3 text-[.65rem] font-semibold uppercase tracking-[.2em]", theme.classes.body, styles.dateLabel)}>
                  {localizeInvitationSystemCopy("When", locale)}
                </p>
                <time dateTime={data.eventDate} className={cn("block break-words", theme.classes.heading, styles.dateValue)}>
                  {dateDisplay}
                </time>
                {showTime ? <p className={cn("mt-3 break-words text-sm", theme.classes.body, styles.dateTime)}>{timeDisplay}</p> : null}
              </div>
            ) : null}
            {hasVenue ? (
              <div className={cn("min-w-0", styles.venuePanel)}>
                <p className={cn("mb-3 text-[.65rem] font-semibold uppercase tracking-[.2em]", theme.classes.body, styles.venueLabel)}>
                  {localizeInvitationSystemCopy("Venue Location", locale)}
                </p>
                {venueName ? <p className={cn("break-words", theme.classes.heading, styles.venueValue)}>{venueName}</p> : null}
                {venueAddress ? <p className={cn("mt-2 break-words text-sm leading-6", theme.classes.body, styles.venueAddress)}>{venueAddress}</p> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {detailFields.length ? (
          <dl className={cn("mt-8 min-w-0", styles.detailGrid)}>
            {detailFields.map(({ label, value }, index) => (
              <Detail key={`${label}-${index}`} label={label} value={value} theme={theme} locale={locale} presentation={variant} />
            ))}
          </dl>
        ) : null}

        {otherVenues.length ? (
          <div className="mt-10 min-w-0">
            <h3 className={cn("mb-4 text-xl", theme.classes.heading, styles.heading)}>{localizeInvitationSystemCopy("Locations", locale)}</h3>
            <div className={styles.venueGrid}>
              {otherVenues.map((venue, index) => (
                <article key={`${venue.label}-${venue.name}-${index}`} className={cn("min-w-0", styles.venueCard)}>
                  {venue.label?.trim() ? <p className={cn("break-words text-[.62rem] font-semibold uppercase tracking-[.18em]", theme.classes.body, styles.dateLabel)}>{localizeInvitationSystemCopy(venue.label, locale)}</p> : null}
                  {venue.name?.trim() ? <h4 className={cn("mt-1 break-words", theme.classes.heading, styles.venueValue)}>{venue.name}</h4> : null}
                  {venue.address?.trim() ? <p className={cn("mt-1 break-words text-sm", theme.classes.body, styles.venueAddress)}>{venue.address}</p> : null}
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {stays.length ? (
          <div className="mt-10 min-w-0">
            <h3 className={cn("mb-4 text-xl", theme.classes.heading, styles.heading)}>{localizeInvitationSystemCopy("Recommended stays", locale)}</h3>
            <div className={styles.stayGrid}>
              {stays.map((stay, index) => (
                <article key={`${stay.name}-${index}`} className={cn("min-w-0", styles.stayCard)}>
                  {stay.name?.trim() ? <h4 className={cn("break-words", theme.classes.heading, styles.venueValue)}>{stay.name}</h4> : null}
                  {stay.notes?.trim() ? <p className={cn("mt-1 break-words text-sm leading-6", theme.classes.body, styles.venueAddress)}>{stay.notes}</p> : null}
                  {isSecureExternalUrl(stay.bookingUrl) ? <a className="mt-2 inline-block min-h-11 max-w-full break-words py-2 text-sm font-semibold underline underline-offset-4" href={stay.bookingUrl} target="_blank" rel="noreferrer">{localizeInvitationSystemCopy("Booking information", locale)}</a> : null}
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {colors.length ? (
          <div className="mt-10 min-w-0">
            <h3 className={cn("mb-4 text-xl", theme.classes.heading, styles.heading)}>{localizeInvitationSystemCopy("Colors of the day", locale)}</h3>
            <ul className={styles.colorList}>
              {colors.map((color, index) => (
                <li key={`${color.hex ?? color.name}-${index}`} className={cn("inline-flex min-w-0 max-w-full items-center gap-2 break-words py-1 text-sm", styles.colorItem)}>
                  {color.hex ? <span className="h-4 w-4 shrink-0 rounded-full border border-current/20 shadow-sm" style={{ backgroundColor: color.hex }} aria-hidden="true" /> : null}
                  {color.name || color.hex}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function isSecureExternalUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function coordinate(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export function LocationMapBlock({
  latitude,
  longitude,
  venue,
  address,
  city,
  theme,
  locale = "en",
}: {
  latitude?: unknown;
  longitude?: unknown;
  venue?: string | null;
  address?: string | null;
  city?: string | null;
  theme: PageGlobalTheme;
  locale?: InvitationPageData["locale"];
}) {
  const lat = coordinate(latitude, -90, 90);
  const lng = coordinate(longitude, -180, 180);
  const location = [venue, address, city].map((part) => part?.trim()).filter(Boolean).join(", ");
  if ((lat === null || lng === null) && !location) return null;

  return (
    <section aria-label={localizeInvitationSystemCopy("Venue Location", locale)} className={theme.classes.section ?? ""}>
      <div className={sectionBase}>
        <h2 className={`mb-4 text-2xl ${theme.classes.heading ?? ""}`}>{localizeInvitationSystemCopy("Venue Location", locale)}</h2>
        <div className="w-full h-[300px] md:h-[400px] rounded-2xl shadow-inner border border-stone-200 mt-4 overflow-hidden">
          {lat !== null && lng !== null ? (
            <iframe
              title={localizeInvitationSystemCopy("Venue map", locale)}
              src={`https://www.google.com/maps?q=${lat},${lng}&z=15&output=embed`}
              className="h-full w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          ) : (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`}
              className="flex h-full w-full items-center justify-center px-6 text-center text-sm font-semibold underline underline-offset-4"
              target="_blank"
              rel="noreferrer"
            >
              {localizeInvitationSystemCopy("Open in Google Maps", locale)}: {location}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

export function MusicBlock({ data }: { data: InvitationPageData }) {
  if (!data.musicAudioUrl && !data.musicLinks?.length) return null;
  return (
    <FloatingMusicControl
      audioUrl={data.musicAudioUrl}
      title={data.musicTitle}
      links={data.musicLinks}
      musicLabel={data.locale === "fr" ? "Musique" : "Music"}
      playingLabel={data.locale === "fr" ? "Lecture" : "Playing"}
    />
  );
}
