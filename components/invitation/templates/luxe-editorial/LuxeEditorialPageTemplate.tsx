"use client";

import { Children, isValidElement, useMemo, type ReactNode } from "react";
import type { InvitationBlocksLayout } from "@/lib/invitation-template-schema";
import type { InvitationPageData } from "@/types/invitation-template";
import { formatLocalizedEventDate, localizeInvitationSystemCopy } from "@/lib/invitation-i18n";
import { InvitationPageCanvas } from "@/components/invitation/blocks/InvitationPageCanvas";

interface LuxeEditorialPageProps {
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
    const props = child.props as { "data-layout-block-type"?: unknown };
    const type = props["data-layout-block-type"];
    if (typeof type !== "string") continue;
    groups.set(type, [...(groups.get(type) ?? []), child]);
  }
  return groups;
}

/** Editorial stationery composition over the existing, authorized block output. */
export function LuxeEditorialPageTemplate({
  layout,
  data,
  children,
  mode,
  isEditMode,
  wrapperClassName,
}: LuxeEditorialPageProps) {
  const groups = useMemo(() => groupRenderedBlocks(children), [children]);
  const blocks = (type: string) => groups.get(type) ?? [];
  const names = [data.partner1Name, data.partner2Name].filter((name) => name?.trim());
  const couple = names.length ? names.join(" & ") : data.title;
  const hostLine = data.familyNote?.trim() || data.hostNames?.trim() || localizeInvitationSystemCopy("Together with their families", data.locale);
  const eventDate = data.eventDate ? formatLocalizedEventDate(data.eventDate, data.locale, data.timezone) : null;
  const location = [data.venue, data.address, data.city].map((part) => part?.trim()).filter(Boolean).join(" · ");
  const hasStory = Boolean(
    data.storyHeadline?.trim() ||
    data.storyText?.trim() ||
    data.storyImage ||
    data.weddingStory?.some((moment) => moment.title?.trim() || moment.text?.trim() || moment.image)
  );
  const hasSchedule = Boolean(data.schedule?.some((item) => item.time && (item.title || item.label)));
  const hasGallery = Boolean(data.gallery?.some((item) => item.url));
  const hasCoordinates = [data.latitude, data.longitude].every((value, index) => {
    const coordinate = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
    const minimum = index === 0 ? -90 : -180;
    const maximum = index === 0 ? 90 : 180;
    return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum;
  });
  const hasLocation = Boolean(location || hasCoordinates);
  const hasMusic = Boolean(data.musicAudioUrl || data.musicLinks?.length);

  return (
    <InvitationPageCanvas layout={layout} mode={mode} isEditMode={isEditMode} wrapperClassName={wrapperClassName}>
      <div className="min-w-0">
        {blocks("hero")}

        <section id="luxe-invitation" className="scroll-mt-8 px-5 py-16 sm:px-8 sm:py-24">
          <div className="relative mx-auto max-w-4xl border border-[#c5a880]/65 bg-white px-6 py-12 shadow-sm sm:px-12 sm:py-16 md:px-20">
            <div className="pointer-events-none absolute inset-3 border border-[#e8d5c4]/80 sm:inset-5" aria-hidden="true" />
            <div className="relative mx-auto max-w-2xl text-center">
              <p className="text-[.62rem] font-medium uppercase tracking-[.3em] text-[#8c7656] sm:text-xs">{hostLine}</p>
              <div className="mx-auto my-7 h-px w-12 bg-[#c5a880]" aria-hidden="true" />
              <p className="font-serif text-sm uppercase tracking-[.13em] text-[#5d5148] sm:text-base">
                {localizeInvitationSystemCopy("Request the honor of your presence", data.locale)}
              </p>
              <h2 className="mt-6 break-words text-balance font-serif text-4xl font-normal leading-tight text-[#4a4a4a] sm:text-5xl md:text-6xl">{couple}</h2>
              <p className="mt-5 font-serif text-base italic text-[#8c7656]">{localizeInvitationSystemCopy("As they celebrate their marriage", data.locale)}</p>
              {eventDate?.dateDisplay || (eventDate?.timeDisplay && data.timezone) || location ? (
                <div className="mt-9 space-y-2 border-t border-[#e8d5c4] pt-6 font-serif text-sm text-[#6a5c52] sm:text-base">
                  {eventDate?.dateDisplay ? <p>{eventDate.dateDisplay}{eventDate.timeDisplay && data.timezone ? ` · ${eventDate.timeDisplay}` : ""}</p> : null}
                  {location ? <p className="break-words italic">{location}</p> : null}
                </div>
              ) : null}
              {blocks("details")}
            </div>
          </div>
        </section>

        {hasStory ? <section className="border-t border-[#e8d5c4]/70 px-0 py-6 sm:px-5 sm:py-12">{blocks("story")}</section> : null}

        {data.eventDate && blocks("countdown").length ? (
          <section className="border-y border-[#c5a880]/45 bg-[#f8f3eb] px-5 py-8 sm:py-12">{blocks("countdown")}</section>
        ) : null}

        {hasSchedule ? <section className="px-0 py-6 sm:px-5 sm:py-12">{blocks("schedule")}</section> : null}

        {hasLocation ? <section className="border-y border-[#e8d5c4]/70 bg-white/60 px-0 py-6 sm:px-5 sm:py-12">{blocks("location_map")}</section> : null}

        {hasGallery ? <section className="px-0 py-6 sm:px-5 sm:py-12">{blocks("gallery")}</section> : null}

        {blocks("action_portal").length ? (
          <section id="rsvp-section" className="border-y border-[#e8d5c4]/80 bg-[#f8f3eb] px-0 py-6 sm:px-5 sm:py-12">
            <div className="mx-auto max-w-4xl px-5 text-center sm:px-8">
              <p className="mb-3 font-serif text-[.62rem] uppercase tracking-[.28em] text-[#8c7656]">{localizeInvitationSystemCopy("Celebrate with us", data.locale)}</p>
              {blocks("action_portal")}
            </div>
          </section>
        ) : null}

        {hasMusic ? <div>{blocks("music")}</div> : null}

        <footer className="px-5 py-14 text-center">
          <span className="mx-auto mb-5 block h-px w-12 bg-[#c5a880]" aria-hidden="true" />
          <p className="break-words font-serif text-3xl italic text-[#4a4a4a]">{couple}</p>
          {eventDate?.dateDisplay ? <p className="mt-3 font-sans text-[.6rem] uppercase tracking-[.24em] text-[#8c7656]">{eventDate.dateDisplay}</p> : null}
        </footer>
      </div>
    </InvitationPageCanvas>
  );
}
