"use client";

import { useEffect, useState, type ReactNode } from "react";
import type {
  InvitationAccommodationItem,
  InvitationGalleryItem,
  InvitationPageData,
  InvitationScheduleItem,
  InvitationVenueItem,
} from "@/types/invitation-template";
import {
  type PageGlobalTheme,
} from "@/lib/page-composition";
import { formatLocalizedEventDate, getInvitationDictionary, localizeInvitationSystemCopy } from "@/lib/invitation-i18n";
import { normalizeInvitationColorHex } from "@/lib/invitation-colors";
import { FloatingMusicControl } from "@/components/invitation/FloatingMusicControl";

const sectionBase = "mx-auto w-full max-w-5xl px-6 py-14 sm:py-20";

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
}) {
  if (romanticEnvelope) {
    return (
      <header id="inv-hero" className={`relative isolate min-h-[100dvh] w-full overflow-hidden ${theme.classes.section ?? ""}`}>
        {image ? (
          <img
            src={image}
            alt={imageAlt || title}
            className="absolute inset-0 h-[100dvh] w-full object-cover"
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
        <div className="relative flex h-[46vh] min-h-72 w-full items-center justify-center overflow-hidden lg:h-auto lg:max-h-[80vh]">
          <img
            src={image}
            alt={imageAlt || title}
            className="h-full max-h-[680px] w-full object-cover lg:h-auto lg:max-h-[80vh] lg:w-auto lg:max-w-full lg:object-contain"
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
}) {
  const defaultEyebrow = `✦ ${localizeInvitationSystemCopy("The Holy Matrimony of", locale).toLocaleUpperCase(locale === "fr" ? "fr-FR" : "en-US")} ✦`;
  return (
    <header id="inv-hero" className={`relative isolate min-h-[100dvh] w-full overflow-hidden bg-transparent ${theme.classes.section ?? ""}`}>
      {image ? (
        <img
          src={image}
          alt={imageAlt || title}
          className="absolute inset-0 h-[100dvh] w-full object-cover"
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
    <section id="inv-story" className={theme.classes.section ?? ""}>
      <div className={`${sectionBase} text-center`}>
        {heading ? <h2 className={`mb-5 text-3xl ${theme.classes.heading ?? ""}`}>{localizeInvitationSystemCopy(heading, locale)}</h2> : null}
        {image ? <img src={image} alt={localizeInvitationSystemCopy(heading || "Event story", locale)} className="mx-auto mb-8 max-h-[34rem] w-full max-w-2xl object-contain" /> : null}
        {text ? <p className={`mx-auto max-w-3xl whitespace-pre-line text-base leading-8 ${theme.classes.body ?? ""}`}>{text}</p> : null}
        {entries.length > 0 ? (
          <div className="mt-10 grid gap-8 text-left sm:grid-cols-2">
            {entries.map((moment, index) => (
              <article key={`${moment.title ?? "story"}-${index}`} className="border-t border-current/10 pt-5">
                {moment.image ? <img src={moment.image} alt={localizeInvitationSystemCopy(moment.title || "Story moment", locale)} className="max-h-96 w-full object-contain" /> : null}
                <div className="space-y-2 pt-3">
                  {moment.title ? <h3 className={`text-lg ${theme.classes.heading ?? ""}`}>{localizeInvitationSystemCopy(moment.title, locale)}</h3> : null}
                  {moment.text ? <p className={`whitespace-pre-line text-sm leading-7 ${theme.classes.body ?? ""}`}>{moment.text}</p> : null}
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
}: {
  images?: InvitationGalleryItem[] | null;
  theme: PageGlobalTheme;
  locale?: InvitationPageData["locale"];
}) {
  const visibleImages = (images ?? []).filter((image) => image.url);
  if (visibleImages.length === 0) return null;
  return (
    <section id="inv-gallery" className={theme.classes.section ?? ""}>
      <div className={sectionBase}>
        <h2 className={`mb-8 text-center text-3xl ${theme.classes.heading ?? ""}`}>{localizeInvitationSystemCopy("Gallery", locale)}</h2>
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
          {visibleImages.map((image, index) => (
            <figure key={`${image.url}-${index}`} className="mb-4 break-inside-avoid">
              <img src={image.url} alt={image.alt || image.caption || localizeInvitationSystemCopy("Event gallery photo", locale)} className="h-auto w-full object-contain" loading="lazy" />
              {image.caption ? <figcaption className={`pt-2 text-sm ${theme.classes.body ?? ""}`}>{image.caption}</figcaption> : null}
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ScheduleBlock({
  timeline,
  theme,
  locale = "en",
  romanticEnvelope = false,
}: {
  timeline?: InvitationScheduleItem[] | null;
  theme: PageGlobalTheme;
  locale?: InvitationPageData["locale"];
  romanticEnvelope?: boolean;
}) {
  const entries = (timeline ?? []).filter((item) => item.time && (item.title || item.label));
  if (entries.length === 0) return null;
  return (
    <section id="inv-schedule" className={theme.classes.section ?? ""}>
      <div className={`${sectionBase} max-w-3xl`}>
        <h2 className={`mb-8 text-center text-3xl ${theme.classes.heading ?? ""}`}>{localizeInvitationSystemCopy("Schedule", locale)}</h2>
        <ol className={romanticEnvelope
          ? "relative mx-auto max-w-2xl space-y-0 before:absolute before:bottom-8 before:left-5 before:top-8 before:w-px before:bg-[#D9D0B7] before:content-['']"
          : "space-y-5"}>
          {entries.map((item, index) => (
            <li key={`${item.time}-${index}`} className={romanticEnvelope ? "relative z-10" : "grid gap-2 border-b border-current/10 pb-5 last:border-0 last:pb-0 sm:grid-cols-[8rem_1fr]"}>
              {romanticEnvelope ? (
                <article className="bg-white/95 border-2 border-[#D9D0B7] shadow-xl rounded-2xl p-6 my-6 max-w-2xl mx-auto transform transition-transform hover:scale-[1.01] duration-300 relative overflow-hidden">
                  <span className="mb-4 inline-flex bg-[#4A3B32] text-[#E6DEC9] font-mono text-xs px-3 py-1 rounded-full uppercase tracking-wider">
                    {item.time}{item.badge ? ` · ${localizeInvitationSystemCopy(item.badge, locale)}` : ""}
                  </span>
                  <div className="pl-8">
                    {item.day || item.dayLabel ? <p className={`mb-1 text-xs font-semibold uppercase tracking-wide ${theme.classes.body ?? ""}`}>{localizeInvitationSystemCopy(item.day || item.dayLabel || "", locale)}</p> : null}
                    <h3 className={theme.classes.heading ?? ""}>{localizeInvitationSystemCopy(item.title || item.label || "", locale)}</h3>
                    {item.description ? <p className={`mt-1 whitespace-pre-line text-sm ${theme.classes.body ?? ""}`}>{item.description}</p> : null}
                  </div>
                  <span className="absolute left-[1.05rem] top-[1.55rem] z-10 h-3 w-3 rounded-full border-2 border-[#E6DEC9] bg-[#8A4D42] shadow-sm" aria-hidden="true" />
                </article>
              ) : (
                <>
                  <p className={`flex items-center gap-2 text-sm ${theme.classes.heading ?? ""}`}>
                    <span>{item.time}{item.badge ? ` · ${localizeInvitationSystemCopy(item.badge, locale)}` : ""}</span>
                  </p>
                  <div>
                    {item.day || item.dayLabel ? <p className={`mb-1 text-xs font-semibold uppercase tracking-wide ${theme.classes.body ?? ""}`}>{localizeInvitationSystemCopy(item.day || item.dayLabel || "", locale)}</p> : null}
                    <h3 className={theme.classes.heading ?? ""}>{localizeInvitationSystemCopy(item.title || item.label || "", locale)}</h3>
                    {item.description ? <p className={`mt-1 whitespace-pre-line text-sm ${theme.classes.body ?? ""}`}>{item.description}</p> : null}
                  </div>
                </>
              )}
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
}: {
  targetDate?: string | null;
  theme: PageGlobalTheme;
  locale?: InvitationPageData["locale"];
  romanticEnvelope?: boolean;
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
  return (
    <section className={theme.classes.section ?? ""}>
      <div className={`${sectionBase} max-w-3xl text-center`}>
        <h2 className={`mb-8 text-2xl ${romanticEnvelope ? "font-serif text-[#4A3B32]" : theme.classes.heading ?? ""}`}>{localizeInvitationSystemCopy("Countdown to the celebration", locale)}</h2>
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
              <div key={unit.label} className={`border-r border-stone-300/70 last:border-0 ${romanticEnvelope ? "border-[#4A3B32]/20" : ""}`}>
                <p className={romanticEnvelope ? "font-serif text-3xl md:text-4xl text-[#4A3B32] tracking-widest tabular-nums" : `tabular-nums font-serif text-3xl sm:text-5xl ${theme.classes.heading ?? ""}`}>{String(unit.value).padStart(2, "0")}</p>
                <p className={romanticEnvelope ? "font-serif text-[10px] tracking-widest uppercase opacity-70 mt-2" : `mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] ${theme.classes.body ?? ""}`}>{unit.label}</p>
              </div>
            ))}
          </div>
        )}
        {romanticEnvelope ? <p className="font-serif text-[10px] tracking-widest uppercase opacity-70 mt-2">{localizeInvitationSystemCopy("Counting the days until we say I do", locale)}</p> : null}
      </div>
    </section>
  );
}

function Detail({ label, value, theme, locale }: { label: string; value?: string | null; theme: PageGlobalTheme; locale: InvitationPageData["locale"] }) {
  if (!value?.trim()) return null;
  return <div><dt className={`text-xs font-semibold uppercase tracking-wide ${theme.classes.body ?? ""}`}>{localizeInvitationSystemCopy(label, locale)}</dt><dd className={`mt-1 whitespace-pre-line text-sm leading-6 ${theme.classes.heading ?? ""}`}>{value}</dd></div>;
}

export function DetailsBlock({ data, theme, romanticEnvelope = false }: { data: InvitationPageData; theme: PageGlobalTheme; romanticEnvelope?: boolean }) {
  const { dateDisplay, timeDisplay } = formatLocalizedEventDate(data.eventDate, data.locale || "en", data.timezone);
  const dateText = [dateDisplay, data.timezone && timeDisplay ? timeDisplay : null].filter(Boolean).join(" · ");
  const venues: InvitationVenueItem[] = (data.venues ?? []).filter((venue) =>
    Boolean(venue?.name?.trim() || venue?.address?.trim())
  );
  const stays: InvitationAccommodationItem[] = (data.accommodations ?? []).filter((stay) =>
    Boolean(stay.name?.trim() || stay.notes?.trim() || stay.bookingUrl?.trim())
  );
  const colors = (data.colorsOfTheDay ?? []).flatMap((color) => {
    const hex = typeof color.hex === "string" ? normalizeInvitationColorHex(color.hex) : null;
    const name = typeof color.name === "string" ? color.name.trim() : "";
    return name || hex ? [{ name, hex }] : [];
  });
  const attributes = [
    data.partner1Name && data.partner2Name ? `${data.partner1Name} & ${data.partner2Name}` : null,
    data.familyNote,
    data.celebrantName,
    data.ageMilestone ? String(data.ageMilestone) : null,
    data.theme,
  ].filter((value): value is string => Boolean(value));
  const hasDetails = Boolean(
    dateText || data.venue || data.address || data.city || data.parkingNotes || data.dressCode ||
    data.dressCodeNotes || data.additionalNotes || data.registryNote || data.giftNote || data.hashtag ||
    venues.length || stays.length || attributes.length || colors.length
  );
  if (!hasDetails) return null;
  const locale = data.locale ?? "en";
  return (
    <section id="inv-details" className={theme.classes.section ?? ""}>
      <div className={sectionBase}>
        <div className="space-y-8">
          <h2 className={`text-center text-3xl ${theme.classes.heading ?? ""}`}>{localizeInvitationSystemCopy("Event details", locale)}</h2>
          <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
            <Detail label="When" value={dateText} theme={theme} locale={locale} />
            <Detail label="Venue Location" value={data.venue} theme={theme} locale={locale} />
            <Detail label="Address" value={[data.address, data.city].filter(Boolean).join(", ")} theme={theme} locale={locale} />
            <Detail label="Parking & arrival" value={data.parkingNotes} theme={theme} locale={locale} />
            <Detail label="Dress code" value={data.dressCode} theme={theme} locale={locale} />
            <Detail label="Attire notes" value={data.dressCodeNotes} theme={theme} locale={locale} />
            <Detail label="Additional information" value={data.additionalNotes} theme={theme} locale={locale} />
            <Detail label="Registry" value={data.registryNote} theme={theme} locale={locale} />
            <Detail label="Gift note" value={data.giftNote} theme={theme} locale={locale} />
            <Detail label="Hashtag" value={data.hashtag} theme={theme} locale={locale} />
            {attributes.map((attribute, index) => <Detail key={`attribute-${index}`} label="Celebration" value={attribute} theme={theme} locale={locale} />)}
          </dl>
        </div>
        {venues.length > 0 ? (
          <div className="mt-8">
            <h3 className={`mb-4 text-xl ${theme.classes.heading ?? ""}`}>{localizeInvitationSystemCopy("Locations", locale)}</h3>
            <div className={romanticEnvelope
              ? "-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0"
              : "grid gap-4 sm:grid-cols-2"}>
              {venues.map((venue, index) => (
                <article key={`${venue.label}-${index}`} className={romanticEnvelope
                  ? "min-w-[min(82vw,22rem)] snap-center rounded-xl border border-stone-200/50 bg-white/80 p-5 shadow-md sm:min-w-0"
                  : "border-t border-current/10 pt-4 first:border-0 first:pt-0"}>
                  <p className={`text-xs font-semibold uppercase tracking-wide ${theme.classes.body ?? ""}`}>{localizeInvitationSystemCopy(venue.label, locale)}</p>
                  <h4 className={`mt-1 ${theme.classes.heading ?? ""}`}>{venue.name}</h4>
                  {venue.address ? <p className={`mt-1 text-sm ${theme.classes.body ?? ""}`}>{venue.address}</p> : null}
                </article>
              ))}
            </div>
          </div>
        ) : null}
        {stays.length > 0 ? (
          <div className="mt-8">
            <h3 className={`mb-4 text-xl ${theme.classes.heading ?? ""}`}>{localizeInvitationSystemCopy("Recommended stays", locale)}</h3>
            <div className={romanticEnvelope
              ? "-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0"
              : "grid gap-x-8 sm:grid-cols-2"}>
              {stays.map((stay, index) => (
                <article key={`${stay.name}-${index}`} className={romanticEnvelope
                  ? "min-w-[min(82vw,22rem)] snap-center rounded-xl border border-stone-200/50 bg-white/80 p-5 shadow-md sm:min-w-0"
                  : "border-t border-current/10 py-4 first:border-0 first:pt-0"}>
                  <h4 className={theme.classes.heading ?? ""}>{stay.name}</h4>
                  {stay.notes ? <p className={`mt-1 text-sm ${theme.classes.body ?? ""}`}>{stay.notes}</p> : null}
                  {isSecureExternalUrl(stay.bookingUrl) ? <a className="mt-2 inline-block text-sm font-semibold underline" href={stay.bookingUrl} target="_blank" rel="noreferrer">{localizeInvitationSystemCopy("Booking information", locale)}</a> : null}
                </article>
              ))}
            </div>
          </div>
        ) : null}
        {colors.length ? (
          <div className="mt-8">
            <h3 className={`mb-4 text-xl ${theme.classes.heading ?? ""}`}>{localizeInvitationSystemCopy("Colors of the day", locale)}</h3>
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              {colors.map((color, index) => (
                <li key={`${color.hex ?? color.name}-${index}`} className="inline-flex items-center gap-2 py-1 text-sm">
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

/** Local, dismissible cover gate used by the romantic-envelope template. */
export function RomanticEnvelopeJourney({
  title,
  locale = "en",
  children,
}: {
  title: string;
  locale?: InvitationPageData["locale"];
  children: ReactNode;
}) {
  const [isOpened, setIsOpened] = useState(false);

  return (
    <div className={isOpened ? "h-auto overflow-y-auto" : "h-screen overflow-hidden bg-[#E6DEC9]"}>
      {children}
      <div
        aria-hidden={isOpened}
        className={`fixed inset-0 z-[100] flex h-screen items-center justify-center overflow-hidden bg-[#E6DEC9] px-6 text-center text-stone-900 transition-all duration-1000 ease-out ${isOpened ? "transform scale-95 opacity-0 pointer-events-none" : "scale-100 opacity-100"}`}
      >
        <div className="flex w-full max-w-md flex-col items-center">
          <p className="mb-10 font-serif text-xs font-semibold tracking-[0.35em] text-stone-700 sm:text-sm">{localizeInvitationSystemCopy("YOU'RE INVITED!!", locale)}</p>
          <div className="relative w-full max-w-sm drop-shadow-xl">
            <svg viewBox="0 0 360 230" className="w-full" fill="none">
              <rect x="12" y="15" width="336" height="200" rx="10" fill="#F8F4E9" stroke="#C8BDA6" strokeWidth="2" />
              <path d="M14 25 180 142 346 25" fill="#EEE6D7" stroke="#C8BDA6" strokeWidth="2" />
              <path d="m14 207 122-100m210 100L224 107" stroke="#D4C9B5" strokeWidth="2" />
              <path d="m16 207 164-118 164 118" fill="#E8DDCA" stroke="#C8BDA6" strokeWidth="2" />
            </svg>
            <button
              type="button"
              onClick={() => setIsOpened(true)}
              aria-label={localizeInvitationSystemCopy("Open the seal to reveal your invitation", locale)}
              className="absolute left-1/2 top-[62%] inline-flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full shadow-[0_8px_20px_rgba(74,59,50,0.3)] hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-900"
            >
              <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden="true">
                <path d="M32 2 38 7l8-1 3 8 8 3-1 8 6 7-6 7 1 8-8 3-3 8-8-1-6 5-6-5-8 1-3-8-8-3 1-8-6-7 6-7-1-8 8-3 3-8 8 1z" fill="#8A4D42" stroke="#65372F" strokeWidth="2" />
                <circle cx="32" cy="32" r="16" fill="#A96658" stroke="#D6A895" strokeWidth="1.5" />
                <path d="M32 21v22m-8-11h16m-13-6 10 12m0-12L27 38" stroke="#F4E7D9" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <p className="mt-10 font-serif text-sm uppercase tracking-[0.18em] text-stone-700">{localizeInvitationSystemCopy("CLICK THE SEAL TO OPEN THE ENVELOPE", locale)}</p>
          <p className="mt-3 max-w-xs font-serif text-lg italic text-stone-800">{title}</p>
        </div>
      </div>
    </div>
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
