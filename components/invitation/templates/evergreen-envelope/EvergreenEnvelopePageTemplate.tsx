"use client";

import { Children, isValidElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { BRAND } from "@/config/branding";
import type { InvitationBlocksLayout } from "@/lib/invitation-template-schema";
import type { InvitationPageData, InvitationVenueItem } from "@/types/invitation-template";
import { formatLocalizedEventDate } from "@/lib/invitation-i18n";
import { COLOR_PALETTES } from "@/lib/invitation-page-layout";
import { EVERGREEN_PHOTO_PLACEHOLDER, resolveEvergreenPhoto, EVERGREEN_PHOTO_SLOTS } from "@/lib/evergreen-photo-resolution";
import { InvitationPageCanvas } from "@/components/invitation/blocks/InvitationPageCanvas";
import { InvitationScrollReveal } from "@/components/invitation/animation/InvitationScrollReveal";
import { invitationImageClassName } from "@/lib/invitation-image-presentation";
import { evergreenMapUrl } from "@/lib/evergreen-map";
import { EvergreenEnvelopeGate } from "@/components/invitation/templates/evergreen-envelope/EvergreenEnvelopeGate";
import styles from "@/components/invitation/templates/evergreen-envelope/EvergreenEnvelopePageTemplate.module.css";

interface EvergreenEnvelopePageProps {
  layout: InvitationBlocksLayout;
  data: InvitationPageData;
  children: ReactNode;
  mode: "preview" | "live" | "shared";
  isEditMode: boolean;
  wrapperClassName?: string;
}

function groupRenderedBlocks(children: ReactNode): Map<string, ReactNode[]> {
  const groups = new Map<string, ReactNode[]>();
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue;
    const type = (child.props as { "data-layout-block-type"?: unknown })["data-layout-block-type"];
    if (typeof type !== "string") continue;
    groups.set(type, [...(groups.get(type) ?? []), child]);
  }
  return groups;
}

function CeremonyIcon({ reception = false }: { reception?: boolean }) {
  return reception ? (
    <svg viewBox="0 0 48 48" className="h-8 w-8" fill="none" aria-hidden="true">
      <path d="M16 7h8v6l-2 3v9h-4v-9l-2-3V7Zm10 0h8v6l-2 3v9h-4v-9l-2-3V7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M20 25v8m10-8v8m-16 0h22M24 33v8m-5 0h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m20 7 0 4m10-4 0 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 48 48" className="h-8 w-8" fill="none" aria-hidden="true">
      <path d="M7 41h34M11 41V21h26v20M18 21V12l6-5 6 5v9m-8 20V30h4v11m5-17h4v4h-4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M22 17h4m-2-3v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function DressFigures() {
  return (
    <svg viewBox="0 0 180 120" className="mx-auto h-28 w-44 text-[#596344]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="54" cy="20" r="9" /><path d="M46 31h16l8 19-8 6-2 27h-7l-3-20-3 20h-7l3-29-8-4 11-19Zm8 9 8 8 7-4M43 82h17l6 29H38z" />
      <circle cx="125" cy="19" r="9" /><path d="M119 30h13l8 24-9 7-4 7 15 25H106l15-25-5-8-10-6 8-24Zm-8 56h30M120 39l-12 13m23-13 9 11" />
      <path d="M32 112h35m36 0h42" />
    </svg>
  );
}

function InformationIcon({ kind }: { kind: "envelope" | "heart" | "hotel" | "camera" }) {
  return (
    <svg viewBox="0 0 48 48" className="h-9 w-9 text-[#647344]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === "envelope" ? <><rect x="6" y="12" width="36" height="25" rx="2" /><path d="m7 15 17 13 17-13" /></> : null}
      {kind === "heart" ? <path d="M24 40S7 30 7 18c0-10 13-13 17-4 4-9 17-6 17 4 0 12-17 22-17 22Z" /> : null}
      {kind === "hotel" ? <><path d="M8 41V8h20v33M28 18h12v23M4 41h40M14 14h7m-7 8h7m-7 8h7m14-5h3m-3 7h3" /><path d="M16 41v-6h5v6" /></> : null}
      {kind === "camera" ? <><path d="M6 15h9l4-5h10l4 5h9v25H6z" /><circle cx="24" cy="27" r="8" /><circle cx="24" cy="27" r="3" /><path d="M35 20h1" /></> : null}
    </svg>
  );
}

function LacePhoto({ photo, alt, names, focus }: { photo: string; alt: string; names: string; focus?: { x: number; y: number } }) {
  return (
    <figure className="relative mx-auto aspect-square w-[min(78vw,23rem)] max-w-full">
      <Image
        src={photo}
        alt={alt || `${names} together`}
        width={800}
        height={800}
        sizes="(max-width: 768px) 78vw, 360px"
        unoptimized
        loading="lazy"
        className="absolute inset-[9%] h-[82%] w-[82%] rounded-[2rem] object-cover"
        style={{ objectPosition: focus ? `${focus.x}% ${focus.y}%` : "50% 50%" }}
      />
      <Image src="/images/invitations/evergreen-envelope/lace-frame.svg" alt="" width={800} height={800} className="pointer-events-none absolute inset-0 h-full w-full" loading="lazy" />
      <span aria-hidden="true" className="absolute left-[8%] top-[8%] size-2 rounded-full bg-[#32412a]" />
      <span aria-hidden="true" className="absolute right-[8%] top-[8%] size-2 rounded-full bg-[#32412a]" />
      <span aria-hidden="true" className="absolute bottom-[8%] left-[8%] size-2 rounded-full bg-[#32412a]" />
      <span aria-hidden="true" className="absolute bottom-[8%] right-[8%] size-2 rounded-full bg-[#32412a]" />
    </figure>
  );
}

function venueTime(data: InvitationPageData, venue: InvitationVenueItem): string | null {
  return venue.time?.trim() || (data.timezone
    ? formatLocalizedEventDate(data.eventDate, data.locale, data.timezone).timeDisplay || null
    : null);
}

function defaultMonogram(data: InvitationPageData): string {
  const initials = [data.partner1Name, data.partner2Name]
    .map((name) => name?.trim().split(/\s+/)[0]?.[0]?.toLocaleUpperCase() ?? "")
    .filter(Boolean);
  return initials.length === 2 ? initials.join(" & ") : "";
}

function VenueCard({
  venue,
  time,
  index,
}: {
  venue: InvitationVenueItem;
  time: string | null;
  index: number;
}) {
  const t = useTranslations("Events");
  const mapUrl = evergreenMapUrl(venue);
  const label = venue.label.trim() || (index === 0 ? t("evergreenCeremony") : t("evergreenReception"));
  return (
    <article
      data-evergreen-section="venue-card"
      className={`relative mx-auto min-w-0 w-full max-w-xl border border-[#d8d4c5] bg-[#fffdf6] px-6 py-7 text-center text-[#46513a] shadow-[0_5px_12px_rgba(46,53,36,.09)] sm:px-10 sm:py-8 ${index === 0 ? "z-20" : "z-10 -mt-8 translate-x-2 translate-y-3 rotate-[1deg]"}`}
      style={index === 0 ? undefined : { width: "96%" }}
    >
      <span className={`absolute top-2 h-14 w-12 opacity-70 ${index === 0 ? "left-2" : "right-2 -scale-x-100"}`} aria-hidden="true">
        <Image src="/images/invitations/evergreen-envelope/corner-florals.svg" alt="" width={64} height={72} className="h-full w-full object-contain" loading="lazy" />
      </span>
      <div className="mx-auto mb-3 grid size-10 place-items-center text-[#6b7a36]"><CeremonyIcon reception={index > 0} /></div>
      <h3 className="font-serif text-[.7rem] tracking-[.2em] text-[#697347]">{label.toLocaleUpperCase()}</h3>
      {time ? <p className="mt-2 font-serif text-sm text-[#68705d]">{time}</p> : null}
      {venue.name?.trim() ? <p className="mt-2 break-words font-serif text-lg font-semibold leading-6">{venue.name}</p> : null}
      {venue.address ? <p className="mt-1 break-words font-serif text-sm leading-5 text-[#68705d]">{venue.address}</p> : null}
      {mapUrl ? (
        <a
          href={mapUrl}
          data-evergreen-map-link="true"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-[#52643a] px-6 py-2 text-xs font-semibold uppercase tracking-[.14em] text-white underline-offset-4 transition-transform hover:bg-[#3f502b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#3f502b]"
        >
          {t("evergreenViewMap")}
        </a>
      ) : null}
    </article>
  );
}

export function EvergreenEnvelopePageTemplate({ layout, data, children, mode, isEditMode, wrapperClassName }: EvergreenEnvelopePageProps) {
  const t = useTranslations("Events");
  const groups = useMemo(() => groupRenderedBlocks(children), [children]);
  const blocks = (type: string) => groups.get(type) ?? [];
  const blockTypes = new Set(layout.layout_blocks.map((block) => block.type));
  const sectionSettings = layout.template_data ?? {};
  const scrollReveal = layout.effects?.find((effect) => effect.type === "scroll-reveal");
  const scrollRevealEnabled = Boolean(scrollReveal?.enabled);
  const scrollRevealDuration = scrollReveal?.durationMs ?? 650;
  const gateBlock = layout.layout_blocks.find((block) => block.type === "interactive_envelope");
  const gateEffect = layout.effects?.find((effect) => effect.type === "envelope-reveal");
  const showGate = sectionSettings.show_gate !== false
    && Boolean(gateBlock)
    && (gateEffect?.enabled ?? gateBlock?.content.enabled !== false);
  const [hasEntered, setHasEntered] = useState(!showGate);
  const [gateReplay, setGateReplay] = useState(0);
  const [rsvpOpen, setRsvpOpen] = useState(false);
  const rsvpDialogRef = useRef<HTMLDialogElement>(null);
  const rsvpTriggerRef = useRef<HTMLButtonElement>(null);
  const nestedDialogEscapeRef = useRef(false);
  useEffect(() => setHasEntered(!showGate), [showGate]);
  useEffect(() => {
    if (!showGate || hasEntered) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [hasEntered, showGate]);
  useEffect(() => {
    if (!rsvpOpen) return;
    const dialog = rsvpDialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog?.open) dialog.close();
    };
  }, [rsvpOpen]);
  const pageIsActive = hasEntered || !showGate;
  const continueToPage = useCallback(() => setHasEntered(true), []);
  const names = [data.partner1Name, data.partner2Name].map((name) => name?.trim()).filter(Boolean).join(" & ") || data.title;
  const eventDate = formatLocalizedEventDate(data.eventDate, data.locale, data.timezone);
  const inviteDate = eventDate.dateDisplay;
  const inviteLocation = [data.city, data.address].filter((item) => item?.trim()).join(" · ");
  const gateIntro = sectionSettings.gate_intro?.trim() || t("evergreenGateIntro");
  const gateHeading = sectionSettings.gate_heading?.trim() || t("evergreenGateHeading");
  const invitationLine = sectionSettings.invitation_line?.trim() || "";
  const invitationParentsLine = data.parentsLine?.trim() || data.familyNote?.trim() || "";
  const venuesHeading = sectionSettings.venues_heading?.trim() || t("evergreenVenuesHeading");
  const wishingWellNote = data.wishingWellNote?.trim() || data.registryNote?.trim() || "";
  const storyForeverWord = data.storyForeverWord?.trim() || "";
  const photoForPage = (slot: (typeof EVERGREEN_PHOTO_SLOTS)[number]) => {
    const photo = resolveEvergreenPhoto(data, slot);
    return mode === "preview" || photo !== EVERGREEN_PHOTO_PLACEHOLDER ? photo : null;
  };
  const closingPhoto = photoForPage("closing_photo_url");
  const rsvpPhoto = photoForPage("rsvp_photo_url");
  const invitePhoto = photoForPage("envelope_photo_url");
  const secondEnvelopePhoto = photoForPage("envelope_photo_two_url");
  const coverPhoto = photoForPage("cover_photo_url");
  const polaroidOne = photoForPage("polaroid_photo_one_url");
  const polaroidTwo = photoForPage("polaroid_photo_two_url");
  const photoFocus = data.photoFocalPoints ?? {};
  const reservedForName = mode === "shared"
    ? null
    : mode === "preview"
      ? data.guest.name?.trim() || null
      : data.guest.name?.trim() && data.guest.name !== "Honored Guest"
        ? data.guest.name.trim()
        : null;
  const venueRecords: InvitationVenueItem[] = (data.venues ?? []).filter((venue) =>
    Boolean(venue.name?.trim() || venue.address?.trim() || venue.time?.trim() || venue.mapUrl?.trim() || venue.latitude || venue.longitude)
  );
  const venues = venueRecords.length > 0
    ? venueRecords
    : data.venue?.trim() || data.address?.trim()
      ? [{ label: t("evergreenCeremony"), name: data.venue?.trim() || t("evergreenCeremony"), address: [data.address, data.city].filter(Boolean).join(", "), latitude: data.latitude ?? undefined, longitude: data.longitude ?? undefined }]
      : [];
  const hasAnyPhoto = EVERGREEN_PHOTO_SLOTS.some((slot) => Boolean(photoForPage(slot)));
  const scheduleItems = (data.schedule ?? []).filter((item) => item.time && (item.title || item.label));
  const dressSwatches = data.dressCodeSwatches?.length ? data.dressCodeSwatches : data.colorsOfTheDay ?? [];
  const galleryItems = (data.gallery ?? []).filter((photo) => photo.url?.trim());
  const showGallery = blockTypes.has("gallery") && galleryItems.length > 0;
  const hasMusic = Boolean(data.musicAudioUrl?.trim() || data.musicLinks?.length);
  const storyMoments = (data.weddingStory ?? []).slice(0, 8);
  const adultsOnlyNote = data.adultsOnlyNote?.trim() || "";
  const hasStoryContent = Boolean(data.storyHeadline?.trim() || data.storyText?.trim() || data.storyImage?.trim())
    || Boolean(storyMoments.some((moment) => moment.title?.trim() || moment.text?.trim() || moment.image?.trim()))
    || Boolean(data.storyPhotoOne?.trim() || data.storyPhotoTwo?.trim());
  const showStory = sectionSettings.show_story !== false && hasStoryContent;
  const storyFrameIndexes = new Set<number>();
  if (data.storyPhotoOne?.trim() || photoForPage("story_photo_one_url")) storyFrameIndexes.add(0);
  if (data.storyPhotoTwo?.trim()) storyFrameIndexes.add(1);
  storyMoments.forEach((moment, index) => { if (moment.image?.trim()) storyFrameIndexes.add(index); });
  const storyFrames = Array.from(storyFrameIndexes).map((index) => {
    const slot = index === 1 ? "story_photo_two_url" : "story_photo_one_url";
    const dedicatedPhoto = index === 0 ? data.storyPhotoOne : index === 1 ? data.storyPhotoTwo : null;
    const momentPhoto = storyMoments[index]?.image;
    const photo = dedicatedPhoto?.trim() || momentPhoto?.trim() || photoForPage(slot);
    const focus = index === 1 ? photoFocus.story_photo_two_url : photoFocus.story_photo_one_url;
    return { index, photo, focus, moment: storyMoments[index] };
  });
  const showDressCode = sectionSettings.show_dress_code !== false
    && Boolean(data.dressCode?.trim() || data.dressCodeNotes?.trim() || dressSwatches.length);
  const showInfoCards = (Boolean(data.showWishingWell) && Boolean(wishingWellNote))
    || (Boolean(data.showAdultsOnly) && Boolean(adultsOnlyNote));
  const accommodations = (data.accommodations ?? []).filter((item) => item.name?.trim());
  const showTravel = sectionSettings.show_accommodations_photos !== false
    && Boolean(accommodations.length || data.albumUrl?.trim());
  const showRsvp = sectionSettings.show_rsvp !== false && mode !== "shared" && blocks("action_portal").length > 0;
  const photoAlt = (photo: string | null, fallback: string) => photo === EVERGREEN_PHOTO_PLACEHOLDER ? t("evergreenPhotoPlaceholderAlt") : fallback;
  const monogramInitials = data.monogramInitials?.trim() || defaultMonogram(data);
  const cardOneType = sectionSettings.envelope_card_one_type ?? "photo";
  const cardTwoType = sectionSettings.envelope_card_two_type ?? "text";
  const sampleFields = data.sampleFields ?? [];
  const cardOneTitle = sectionSettings.envelope_card_one_title?.trim() || "";
  const cardOneBody = sectionSettings.envelope_card_one_body?.trim() || "";
  const cardTwoTitle = sectionSettings.envelope_card_two_title?.trim() || "";
  const cardTwoBody = sectionSettings.envelope_card_two_body?.trim() || "";
  const cardTwoHasCustomText = Boolean(cardTwoTitle || cardTwoBody);
  const cardTwoReservedName = !cardTwoHasCustomText && mode === "live"
    ? reservedForName
    : !cardTwoHasCustomText && mode === "preview"
      ? reservedForName || t("evergreenReservedPreview")
      : null;
  const paperPalette = COLOR_PALETTES[layout.global_theme.palette_id ?? "palette-evergreen"];
  const palettePaper = paperPalette?.previewColors[0] ?? "#fff8eb";
  const paperTint = (() => {
    const hex = /^#?([\da-f]{6})$/i.exec(palettePaper)?.[1];
    if (!hex) return "#fff8eb";
    const values = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
    const base = [255, 248, 235];
    const tinted = values.map((value, index) => Math.round(base[index] * 0.84 + value * 0.16));
    return `#${tinted.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  })();

  const page = (
    <InvitationPageCanvas layout={layout} mode={mode} isEditMode={isEditMode} wrapperClassName={wrapperClassName}>
      <main
        data-evergreen-page="true"
        aria-hidden={!pageIsActive}
        inert={!pageIsActive}
        className="relative isolate min-h-screen overflow-clip bg-[#f7f5e9] text-[#48533a] outline-none"
        style={{
          backgroundImage: "radial-gradient(ellipse at 12% 18%, rgba(255,255,255,.9), transparent 31%), radial-gradient(ellipse at 82% 52%, rgba(213,218,190,.34), transparent 36%), repeating-linear-gradient(0deg, rgba(74,66,50,.018) 0 1px, transparent 1px 5px)",
        }}
      >
        {sectionSettings.show_cover !== false && blockTypes.has("romantic_hero") ? (
          <section id="inv-hero" data-evergreen-section="cover" data-evergreen-photo-slot="cover_photo_url" className="relative isolate flex min-h-[100svh] items-start justify-center overflow-hidden bg-[#667348] text-center text-white">
            {coverPhoto ? (
              <Image
                src={coverPhoto}
                alt={photoAlt(coverPhoto, t("evergreenStoryPhotoAlt", { names }))}
                width={1200}
                height={1800}
                sizes="100vw"
                unoptimized
                fetchPriority="auto"
                loading="eager"
                className={invitationImageClassName("full-bleed", "absolute inset-0 min-h-[100svh]")}
                style={{ objectPosition: photoFocus.cover_photo_url ? `${photoFocus.cover_photo_url.x}% ${photoFocus.cover_photo_url.y}%` : data.heroImageFocus ? `${data.heroImageFocus.x}% ${data.heroImageFocus.y}%` : "50% 50%" }}
              />
            ) : null}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(21,31,18,.76)_0%,rgba(21,31,18,.38)_32%,rgba(21,31,18,.05)_74%,rgba(21,31,18,.18)_100%)]" aria-hidden="true" />
            <div className="relative z-10 mx-auto flex min-h-[100svh] w-full max-w-4xl flex-col items-center px-6 pt-[12svh] text-white sm:pt-[14svh]">
              <p className="font-script text-4xl leading-none text-white sm:text-5xl">{data.eyebrow?.trim() || t("evergreenCoverEyebrow")}</p>
              <h1 className="mt-5 max-w-3xl text-balance font-serif text-3xl leading-tight tracking-[.11em] text-white drop-shadow-sm sm:text-5xl md:text-6xl">{names}</h1>
              {!coverPhoto ? <p className="mt-5 font-serif text-sm text-white/95">{data.title}</p> : null}
            </div>
          </section>
        ) : null}

        {sectionSettings.show_invitation_card !== false && blockTypes.has("details") ? (
          <section id="inv-details" data-evergreen-section="invitation-card" className="relative z-20 -mt-[10svh] px-5 pb-12 pt-0 sm:px-8">
            <InvitationScrollReveal enabled={scrollRevealEnabled} durationMs={scrollRevealDuration}>
              <div className="sticky top-[5svh] mx-auto min-h-[83svh] w-full max-w-xl pt-[3svh]">
                <div className="absolute inset-x-3 top-[5svh] h-[74svh] bg-[#788b19] shadow-[0_7px_18px_rgba(47,58,24,.16)]" aria-hidden="true">
                  <svg viewBox="0 0 360 320" className="h-full w-full" fill="none" aria-hidden="true">
                    <path d="M0 0 180 126 360 0" stroke="#65751a" strokeWidth="2" />
                    <path d="M0 320 180 185 360 320" stroke="#98a83d" strokeWidth="1.5" />
                  </svg>
                </div>
                <article className="relative z-10 mx-auto min-h-[68svh] w-[88%] border border-[#d5d1bf]/80 bg-[rgba(255,253,247,.78)] px-6 py-12 text-center shadow-[0_8px_18px_rgba(47,58,24,.14)] sm:px-12 sm:py-14">
                  <span className="absolute -top-5 left-1/2 z-20 -translate-x-1/2"><Image src="/images/invitations/evergreen-envelope/wax-seal.svg" alt="" width={42} height={42} /></span>
                  <Image src="/images/invitations/evergreen-envelope/paper-sprig.svg" alt="" width={100} height={240} className="pointer-events-none absolute bottom-2 right-0 h-[82%] w-20 opacity-45" loading="lazy" />
                  <Image src="/images/invitations/evergreen-envelope/paper-sprig.svg" alt="" width={78} height={190} className="pointer-events-none absolute right-8 top-6 h-[65%] w-16 -rotate-6 opacity-40" loading="lazy" />
                  <Image src="/images/invitations/evergreen-envelope/paper-sprig.svg" alt="" width={60} height={150} className="pointer-events-none absolute bottom-4 right-7 h-[48%] w-12 rotate-12 opacity-35" loading="lazy" />
                  <div className="pointer-events-none absolute inset-3 border border-[#9c9b7a]/45" aria-hidden="true" />
                  <div className="relative z-10 flex min-h-[56svh] flex-col items-center justify-center">
                    <h2 className="sr-only">{t("evergreenInvitationHeading")}</h2>
                    {invitationParentsLine ? <p className="font-serif text-sm leading-6 text-[#59613e]">{invitationParentsLine}</p> : null}
                    <p className="mt-5 max-w-full break-words font-serif text-2xl leading-tight tracking-[.1em] text-[#434b34] sm:text-3xl">{names}</p>
                    {invitationLine ? <p className="mt-5 max-w-xs font-serif text-sm leading-6 text-[#66705d] sm:text-base">{invitationLine}</p> : null}
                    {inviteDate ? <time dateTime={data.eventDate} className="mt-5 font-serif text-xl tracking-[.12em] text-[#515a3c] sm:text-2xl">{inviteDate}</time> : null}
                    {inviteLocation ? <p className="mt-3 max-w-full break-words font-serif text-sm text-[#66705d]">{inviteLocation}</p> : null}
                  </div>
                </article>
              </div>
            </InvitationScrollReveal>
          </section>
        ) : null}

        {sectionSettings.show_countdown_photos !== false && blockTypes.has("countdown") ? (
          <section data-evergreen-section="photos-countdown" className="relative overflow-hidden px-5 py-10 text-center sm:px-8 sm:py-12">
            <InvitationScrollReveal enabled={scrollRevealEnabled} durationMs={scrollRevealDuration}>
              {data.storyHeadline?.trim() ? <h2 className="font-serif text-2xl font-normal leading-8 text-[#4e5839] sm:text-3xl">{data.storyHeadline}</h2> : null}
              {hasAnyPhoto ? (
                <div className="relative mx-auto mt-8 flex min-h-[16rem] max-w-xl items-center justify-center gap-5 sm:min-h-[21rem] sm:gap-10">
                  {polaroidOne ? <Polaroid photo={polaroidOne} alt={photoAlt(polaroidOne, t("evergreenStoryPhotoAlt", { names }))} focus={photoFocus.polaroid_photo_one_url} tilt="left" /> : null}
                  {polaroidTwo ? <Polaroid photo={polaroidTwo} alt={photoAlt(polaroidTwo, t("evergreenStoryPhotoAlt", { names }))} focus={photoFocus.polaroid_photo_two_url} tilt="right" /> : null}
                </div>
              ) : null}
              {blocks("countdown").length ? (
                <div className="mx-auto mt-7 max-w-2xl" data-evergreen-countdown="shared-block">
                  {blocks("countdown")}
                </div>
              ) : null}
            </InvitationScrollReveal>
          </section>
        ) : null}

        {sectionSettings.show_venues !== false && blockTypes.has("details") && venues.length ? (
          <section data-evergreen-section="venues" className="relative px-5 py-10 sm:px-8 sm:py-12">
            <InvitationScrollReveal enabled={scrollRevealEnabled} durationMs={scrollRevealDuration}>
              <div className="mx-auto max-w-3xl">
                <h2 className="mb-7 text-center font-serif text-2xl font-normal uppercase tracking-[.17em] text-[#4e5839] sm:mb-9 sm:text-3xl">{venuesHeading}</h2>
                <div className="pb-12">
                    {venues.map((venue, index) => (
                    <VenueCard key={`${venue.label}-${venue.name}-${index}`} venue={venue} time={venueTime(data, venue)} index={index} />
                  ))}
                </div>
              </div>
            </InvitationScrollReveal>
          </section>
        ) : null}

        {sectionSettings.show_schedule !== false && blockTypes.has("schedule") && scheduleItems.length ? (
          <InvitationScrollReveal enabled={scrollRevealEnabled} durationMs={scrollRevealDuration}>
            {blocks("schedule")}
          </InvitationScrollReveal>
        ) : null}

        {showDressCode ? (
          <section data-evergreen-section="dress-code" className="relative z-20 -mt-8 px-5 pb-10 sm:px-8">
            <InvitationScrollReveal enabled={scrollRevealEnabled} durationMs={scrollRevealDuration}>
              <article className="sticky top-[7svh] mx-auto max-w-2xl border border-[#d8d4c5] bg-[#fffdf7] px-6 pb-9 pt-12 text-center text-[#46513a] shadow-[0_8px_18px_rgba(42,52,35,.12)] sm:px-14">
                <Image src="/images/invitations/evergreen-envelope/wax-seal.svg" alt="" width={46} height={46} className="absolute -top-5 left-1/2 -translate-x-1/2" />
                <h2 className="font-serif text-2xl uppercase tracking-[.18em]">{t("evergreenDressCodeHeading")}</h2>
                {data.dressCode?.trim() ? <p className="mt-2 font-script text-4xl text-[#708050]">{data.dressCode}</p> : null}
                <DressFigures />
                {data.dressCodeNotes?.trim() ? <p className="mx-auto mt-2 max-w-lg whitespace-pre-line text-sm leading-6 text-[#596344]">{data.dressCodeNotes}</p> : null}
                {dressSwatches.length ? (
                  <ul className="mt-6 flex flex-wrap justify-center gap-5" aria-label={t("evergreenDressCodeHeading")}>
                    {dressSwatches.slice(0, 5).map((swatch, index) => (
                      <li key={`${swatch.hex}-${index}`} className="flex flex-col items-center gap-2 text-xs text-[#4f5d3c]">
                        <span className="size-12 rounded-full border border-[#6f765b]/40 shadow-[0_2px_5px_rgba(30,40,24,.12)]" style={{ backgroundColor: swatch.hex }} aria-label={swatch.name || swatch.hex} />
                        {swatch.name?.trim() ? <span>{swatch.name}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Image src="/images/invitations/evergreen-envelope/paper-sprig.svg" alt="" width={90} height={160} className="pointer-events-none absolute -bottom-5 right-1 h-32 w-20 rotate-12 opacity-70" loading="lazy" />
              </article>
            </InvitationScrollReveal>
          </section>
        ) : null}

        {showInfoCards ? (
          <section data-evergreen-section="information-cards" className="relative z-20 px-5 py-8 sm:px-8 sm:py-10">
            <div className="mx-auto max-w-3xl space-y-0">
              {data.showWishingWell && wishingWellNote ? (
                <InvitationScrollReveal enabled={scrollRevealEnabled} durationMs={scrollRevealDuration}>
                  <article className="sticky top-[8svh] border border-[#d8d4c5] bg-[#fffdf7] px-6 py-8 text-center text-[#46513a] shadow-[0_7px_16px_rgba(42,52,35,.11)] sm:px-10">
                    <Image src="/images/invitations/evergreen-envelope/paper-sprig.svg" alt="" width={62} height={78} className="absolute left-2 top-2 h-16 w-12 opacity-70" loading="lazy" />
                    <InformationIcon kind="envelope" />
                    <h2 className="mt-3 font-serif text-xl uppercase tracking-[.16em]">{t("evergreenWishingWellHeading")}</h2>
                    <p className="mx-auto mt-3 max-w-xl whitespace-pre-line text-sm leading-6 text-[#596344]">{wishingWellNote}</p>
                  </article>
                </InvitationScrollReveal>
              ) : null}
              {data.showAdultsOnly ? (
                <InvitationScrollReveal enabled={scrollRevealEnabled} durationMs={scrollRevealDuration}>
                  <article className="sticky top-[13svh] -mt-5 border border-[#d8d4c5] bg-[#fffdf7] px-6 py-8 text-center text-[#46513a] shadow-[0_7px_16px_rgba(42,52,35,.11)] sm:px-10">
                    <Image src="/images/invitations/evergreen-envelope/paper-sprig.svg" alt="" width={62} height={78} className="absolute right-2 top-2 h-16 w-12 -scale-x-100 opacity-70" loading="lazy" />
                    <InformationIcon kind="heart" />
                    <h2 className="mt-3 font-serif text-xl uppercase tracking-[.16em]">{t("evergreenAdultsOnlyHeading")}</h2>
                    <p className="mx-auto mt-3 max-w-xl whitespace-pre-line text-sm leading-6 text-[#596344]">{adultsOnlyNote}</p>
                  </article>
                </InvitationScrollReveal>
              ) : null}
            </div>
          </section>
        ) : null}

        {showStory ? (
          <section data-evergreen-section="story" className="relative overflow-clip bg-[radial-gradient(ellipse_at_50%_20%,#526948_0%,#354735_64%,#29392f_100%)] px-5 py-10 text-[#fffdf2] sm:px-8 sm:py-12">
            <InvitationScrollReveal enabled={scrollRevealEnabled} durationMs={scrollRevealDuration}>
              <div className="mx-auto max-w-3xl">
                <h2 className="mb-5 text-center font-serif text-2xl uppercase tracking-[.18em] text-white sm:text-3xl">{t("evergreenStoryHeading")}</h2>
                {data.storyHeadline?.trim() ? <p className="mx-auto mb-3 max-w-2xl text-center font-serif text-lg leading-7 text-[#f2f0df]">{data.storyHeadline}</p> : null}
                {data.storyText?.trim() ? <p className="mx-auto mb-5 max-w-2xl whitespace-pre-line text-center font-serif text-sm leading-7 text-[#f2f0df]">{data.storyText}</p> : null}
                <div
                  data-evergreen-story-swap="true"
                  className="relative"
                  style={{ minHeight: `${storyFrames.length * 76}svh` }}
                >
                  {storyFrames.map(({ index, photo, focus }) => (
                    <div
                      key={`evergreen-story-frame-${index}`}
                      data-evergreen-story-frame={index + 1}
                      data-evergreen-photo-slot={index === 0 ? "story_photo_one_url" : index === 1 ? "story_photo_two_url" : `wedding_story_${index + 1}`}
                      className="sticky top-[8svh] flex h-[76svh] items-center justify-center"
                      style={{ zIndex: 10 + index }}
                    >
                      {photo ? <LacePhoto photo={photo} alt={photoAlt(photo, t("evergreenStoryPhotoAlt", { names }))} names={names} focus={focus} /> : null}
                    </div>
                  ))}
                </div>
                <div className="mx-auto mt-5 flex max-w-2xl flex-col text-center">
                  {storyMoments.map((moment, index) => (
                    <div key={`evergreen-story-copy-${index}`} className="mb-5 last:mb-0">
                      {moment.title?.trim() ? <h3 className="font-serif text-xl text-white">{moment.title}</h3> : null}
                      {moment.text?.trim() ? <p className="mt-3 whitespace-pre-line font-serif text-base leading-7 text-[#f2f0df]">{moment.text}</p> : null}
                    </div>
                  ))}
                </div>
                {storyForeverWord ? <p className="mt-4 text-center font-script text-5xl text-[#f3e8bf]">{storyForeverWord}</p> : null}
              </div>
            </InvitationScrollReveal>
          </section>
        ) : null}

        {showGallery ? (
          <section data-evergreen-section="gallery" className="relative px-5 sm:px-8">
            {blocks("gallery")}
          </section>
        ) : null}

        {showTravel ? (
          <section data-evergreen-section="accommodations-photos" className="relative px-5 py-10 text-center sm:px-8 sm:py-12">
            <InvitationScrollReveal enabled={scrollRevealEnabled} durationMs={scrollRevealDuration}>
              <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2 md:gap-10">
                {accommodations.length ? (
                  <article className="relative border border-[#d8d4c5] bg-[#fffdf7] px-6 py-8 text-[#46513a] shadow-[0_7px_16px_rgba(42,52,35,.10)]">
                    <Image src="/images/invitations/evergreen-envelope/paper-sprig.svg" alt="" width={62} height={80} className="absolute left-1 top-1 h-16 w-12 opacity-65" loading="lazy" />
                    <InformationIcon kind="hotel" />
                    <h2 className="mt-3 font-serif text-xl uppercase tracking-[.16em]">{t("evergreenAccommodationsHeading")}</h2>
                    <ul className="mt-5 space-y-5">
                      {accommodations.map((stay, index) => (
                        <li key={`${stay.name}-${index}`}>
                          <h3 className="font-serif text-lg">{stay.name}</h3>
                          {stay.notes?.trim() ? <p className="mt-1 text-sm leading-6 text-[#596344]">{stay.notes}</p> : null}
                          {stay.bookingUrl && /^https?:\/\//i.test(stay.bookingUrl) ? <a className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[#52643a] px-6 py-2 text-xs font-semibold uppercase tracking-[.14em] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3f502b]" href={stay.bookingUrl} target="_blank" rel="noopener noreferrer">{t("evergreenReserveHere")}</a> : null}
                        </li>
                      ))}
                    </ul>
                  </article>
                ) : null}
                {data.albumUrl?.trim() && /^https?:\/\//i.test(data.albumUrl) ? (
                  <article className="relative border border-[#d8d4c5] bg-[#fffdf7] px-6 py-8 text-[#46513a] shadow-[0_7px_16px_rgba(42,52,35,.10)]">
                    <Image src="/images/invitations/evergreen-envelope/paper-sprig.svg" alt="" width={62} height={80} className="absolute right-1 top-1 h-16 w-12 -scale-x-100 opacity-65" loading="lazy" />
                    <InformationIcon kind="camera" />
                    <h2 className="mt-3 font-serif text-xl uppercase tracking-[.16em]">{t("evergreenAlbumHeading")}</h2>
                    <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#596344]">{t("evergreenAlbumNote")}</p>
                    <a className="mt-5 inline-flex min-h-11 items-center rounded-full bg-[#52643a] px-6 py-2 text-xs font-semibold uppercase tracking-[.14em] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3f502b]" href={data.albumUrl} target="_blank" rel="noopener noreferrer">{t("evergreenGoToAlbum")}</a>
                  </article>
                ) : null}
              </div>
            </InvitationScrollReveal>
          </section>
        ) : null}

        {sectionSettings.show_closing_photo !== false && closingPhoto ? (
          <section data-evergreen-section="closing-photo" data-evergreen-photo-slot="closing_photo_url" className="relative isolate flex min-h-[62svh] items-center justify-center overflow-hidden bg-[#52643a] px-6 py-14 text-center text-white sm:min-h-[76svh]">
            <Image src={closingPhoto} alt={photoAlt(closingPhoto, t("evergreenStoryPhotoAlt", { names }))} width={1200} height={900} sizes="100vw" unoptimized loading="lazy" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: photoFocus.closing_photo_url ? `${photoFocus.closing_photo_url.x}% ${photoFocus.closing_photo_url.y}%` : "50% 50%" }} />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,#f7f5e9_0%,rgba(247,245,233,.84)_10%,rgba(247,245,233,.08)_38%,rgba(26,39,29,.34)_72%,rgba(26,39,29,.58)_100%)]" aria-hidden="true" />
            {data.closingCaption?.trim() ? <p className="relative max-w-2xl font-script text-4xl leading-tight text-white/80 drop-shadow-sm sm:text-5xl">{data.closingCaption}</p> : null}
          </section>
        ) : null}

        {showRsvp ? (
          <section data-evergreen-section="rsvp" className="relative px-5 py-10 sm:px-8 sm:py-12">
            <InvitationScrollReveal enabled={scrollRevealEnabled} durationMs={scrollRevealDuration}>
              <article className="relative mx-auto min-h-[28rem] max-w-3xl border border-[#d8d4c5] bg-[#fffdf7] px-6 py-12 text-center text-[#46513a] shadow-[0_8px_18px_rgba(42,52,35,.12)] sm:px-12">
                <Image src="/images/invitations/evergreen-envelope/wax-seal.svg" alt="" width={48} height={48} className="absolute -top-5 left-1/2 -translate-x-1/2" loading="lazy" />
                <h2 className="font-serif text-3xl uppercase tracking-[.18em]">{t("evergreenRsvpHeading")}</h2>
                {data.rsvpIntro?.trim() ? <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[#596344]">{data.rsvpIntro}</p> : null}
                {data.rsvpDeadline?.trim() ? <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#596344]">{t("evergreenRsvpDeadlineLine", { date: data.rsvpDeadline })}</p> : null}
                <button ref={rsvpTriggerRef} type="button" onClick={() => setRsvpOpen(true)} className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-[#52643a] px-7 py-2 text-xs font-semibold uppercase tracking-[.14em] text-white transition-transform hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#3f502b] motion-reduce:transition-none">{t("evergreenRsvpButton")}</button>
                {rsvpPhoto ? <figure data-evergreen-photo-slot="rsvp_photo_url" className="absolute -bottom-8 left-5 w-32 rotate-[-6deg] border border-[#e7e5dd] bg-white p-2 pb-5 shadow-[0_5px_12px_rgba(42,52,35,.14)] sm:left-10"><Image src={rsvpPhoto} alt={photoAlt(rsvpPhoto, t("evergreenStoryPhotoAlt", { names }))} width={320} height={400} sizes="128px" unoptimized loading="lazy" className="aspect-[4/5] w-full object-cover" style={{ objectPosition: photoFocus.rsvp_photo_url ? `${photoFocus.rsvp_photo_url.x}% ${photoFocus.rsvp_photo_url.y}%` : "50% 50%" }} /></figure> : null}
                {monogramInitials ? <span aria-hidden="true" className="absolute right-[-1rem] top-1/2 flex h-36 w-16 -translate-y-1/2 items-center justify-center rounded-[50%] bg-[#788b19] px-2 font-script text-sm text-white shadow-[0_4px_9px_rgba(42,52,35,.12)] whitespace-nowrap sm:right-[-1.4rem] sm:h-44 sm:w-20">{monogramInitials}</span> : null}
              </article>
            </InvitationScrollReveal>
            <div className="mx-auto mt-16 h-2 max-w-4xl bg-[#788b19]" aria-hidden="true" />
            <p className="mt-3 text-center font-serif text-xs tracking-wide text-[#596344]">{BRAND.name}</p>
          </section>
        ) : null}

      </main>
      {hasMusic && blocks("music").length ? <div className={styles.evergreenMusic} data-evergreen-music="shared-block">{blocks("music")}</div> : null}
      {showRsvp ? (
        <dialog
          ref={rsvpDialogRef}
          aria-label={t("evergreenRsvpDialogLabel")}
          className={`${styles.evergreenRsvpDialog} m-auto max-h-[94dvh] w-[min(46rem,calc(100%-1.5rem))] max-w-none overflow-hidden rounded-2xl border border-[#d8d4c5] bg-[#fffdf7] p-0 text-[#46513a] shadow-[0_18px_60px_rgba(0,0,0,.28)]`}
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
          <div className="max-h-[94dvh] overflow-y-auto overscroll-contain px-4 pb-8 pt-3 sm:px-8">
            <div className="sticky top-0 z-10 flex justify-end bg-[#fffdf7]/95 py-2">
              <button type="button" aria-label={t("evergreenRsvpClose")} autoFocus onClick={() => setRsvpOpen(false)} className="grid size-11 place-items-center rounded-full text-3xl leading-none text-[#46513a] hover:bg-[#eef0e5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3f502b]">×</button>
            </div>
            {mode === "preview" ? <p className="mx-auto mb-4 w-fit rounded-md border border-amber-300 bg-amber-50 px-3 py-1 text-center text-xs font-semibold text-amber-950">{t("invitationPreviewGuestCaption")}</p> : null}
            {blocks("action_portal")}
            <p className="mt-3 text-center font-serif text-xs tracking-wide text-[#596344]">{BRAND.name}</p>
          </div>
        </dialog>
      ) : null}
      {showGate ? (
        <EvergreenEnvelopeGate
          key={gateReplay}
          title={data.title}
          names={names}
          eventDate={inviteDate}
          intro={gateIntro}
          heading={gateHeading}
          monogram={monogramInitials}
          coverPhoto={coverPhoto}
          paperTint={paperTint}
          paperInk={paperPalette?.previewColors[1] ?? "#48533a"}
          paperAccent={paperPalette?.previewColors[2] ?? "#a7b14b"}
          cards={[
            {
              type: cardOneType,
              photo: cardOneType === "photo" && !(mode !== "preview" && invitePhoto === EVERGREEN_PHOTO_PLACEHOLDER) ? invitePhoto : null,
              photoAlt: photoAlt(invitePhoto, t("evergreenStoryPhotoAlt", { names })),
              photoFocus: photoFocus.envelope_photo_url,
              title: cardOneTitle,
              body: cardOneBody,
              sample: mode === "preview" && (cardOneType === "photo"
                ? sampleFields.includes("envelopePhoto") || invitePhoto === EVERGREEN_PHOTO_PLACEHOLDER
                : !cardOneTitle && !cardOneBody),
            },
            {
              type: cardTwoType,
              photo: cardTwoType === "photo" && !(mode !== "preview" && secondEnvelopePhoto === EVERGREEN_PHOTO_PLACEHOLDER) ? secondEnvelopePhoto : null,
              photoAlt: photoAlt(secondEnvelopePhoto, t("evergreenStoryPhotoAlt", { names })),
              photoFocus: photoFocus.envelope_photo_two_url,
              title: cardTwoTitle,
              body: cardTwoBody,
              reservedName: cardTwoReservedName,
              guestAllowance: mode === "live" && cardTwoReservedName ? data.guest.guestAllowance : null,
              sample: mode === "preview" && (cardTwoType === "photo"
                ? sampleFields.includes("envelopePhotoTwo") || sampleFields.includes("envelopePhoto") || secondEnvelopePhoto === EVERGREEN_PHOTO_PLACEHOLDER
                : !cardTwoHasCustomText),
            },
          ]}
          onRevealCover={continueToPage}
        />
      ) : null}
      {showGate && mode === "preview" && isEditMode && pageIsActive ? (
        <button
          type="button"
          data-evergreen-replay="true"
          onClick={() => {
            window.scrollTo(0, 0);
            setHasEntered(false);
            setGateReplay((value) => value + 1);
          }}
          className="fixed left-4 top-[max(1rem,env(safe-area-inset-top))] z-[90] min-h-11 rounded-full border border-[#687448] bg-[#fffdf7]/95 px-4 py-2 text-xs font-semibold text-[#46513a] shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3f502b]"
        >
          {t("evergreenReplayOpening")}
        </button>
      ) : null}
    </InvitationPageCanvas>
  );

  return <div className={pageIsActive ? "min-h-screen" : "h-[100dvh] overflow-hidden"}>{page}</div>;
}

function Polaroid({ photo, alt, focus, tilt }: { photo: string; alt: string; focus?: { x: number; y: number }; tilt: "left" | "right" }) {
  return (
    <figure
      data-evergreen-photo-slot={tilt === "left" ? "polaroid_photo_one_url" : "polaroid_photo_two_url"}
      className={`relative z-10 w-[44%] max-w-[14rem] border border-[#e7e5dd] bg-white p-2 pb-7 shadow-[0_6px_16px_rgba(54,57,43,.16)] ${tilt === "left" ? "-rotate-[5deg]" : "rotate-[4deg]"}`}
    >
      <Image
        src={photo}
        alt={alt}
        width={480}
        height={600}
        sizes="(max-width: 640px) 44vw, 224px"
        unoptimized
        loading="lazy"
        className={invitationImageClassName("framed", "aspect-[4/5]")}
        style={{ objectPosition: focus ? `${focus.x}% ${focus.y}%` : "50% 50%" }}
      />
    </figure>
  );
}
