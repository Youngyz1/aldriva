"use client";

import { Children, isValidElement, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { InvitationBlocksLayout } from "@/lib/invitation-template-schema";
import type { InvitationPageData } from "@/types/invitation-template";
import { formatLocalizedEventDate, localizeInvitationSystemCopy } from "@/lib/invitation-i18n";
import { InvitationPageCanvas } from "@/components/invitation/blocks/InvitationPageCanvas";
import { invitationImageClassName } from "@/lib/invitation-image-presentation";

interface BotanicalPageProps {
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

/**
 * Garden-stationery composition that only rearranges the shared, already
 * authorized block output. RSVP callbacks, tokens, and guest data stay owned
 * by the invitation route and shared ActionPortalBlock.
 */
export function BotanicalReveriePageTemplate({
  layout,
  data,
  children,
  mode,
  isEditMode,
  wrapperClassName,
}: BotanicalPageProps) {
  const groups = useMemo(() => groupRenderedBlocks(children), [children]);
  const blocks = (type: string) => groups.get(type) ?? [];
  const storyAvailable = Boolean(data.storyHeadline || data.storyText || data.storyImage || data.weddingStory?.length);
  const hasSchedule = Boolean(data.schedule?.some((item) => item.time && (item.title || item.label)));
  const hasGallery = Boolean(data.gallery?.some((item) => item.url));
  const hasVenue = Boolean(data.venue || data.address || data.city || data.latitude != null || data.longitude != null || data.venues?.length);
  const hasMusic = Boolean(data.musicAudioUrl || data.musicLinks?.length);
  const gateBlock = layout.layout_blocks.find((block) => block.type === "interactive_envelope");
  const gateEffect = layout.effects?.find((effect) => effect.type === "envelope-reveal");
  const gateEnabled = gateEffect?.enabled ?? Boolean(gateBlock && gateBlock.content.enabled !== false);
  const gateDuration = gateEffect?.type === "envelope-reveal"
    ? gateEffect.transitionDurationMs
    : typeof gateBlock?.content.transitionDurationMs === "number"
      ? Math.max(0, Math.min(3000, gateBlock.content.transitionDurationMs))
      : 900;
  const [isOpened, setIsOpened] = useState(!gateEnabled);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => setIsOpened(!gateEnabled), [gateEnabled]);
  useEffect(() => {
    if (isOpened) mainRef.current?.focus({ preventScroll: true });
  }, [isOpened]);

  const date = formatLocalizedEventDate(data.eventDate, data.locale, data.timezone);
  const title = [data.partner1Name, data.partner2Name].filter((name) => name?.trim()).join(" & ") || data.title;
  const venueLine = [data.venue, data.city].filter(Boolean).join(" · ");

  const page = (
    <InvitationPageCanvas layout={layout} mode={mode} isEditMode={isEditMode} wrapperClassName={wrapperClassName}>
      <div
        ref={mainRef}
        tabIndex={-1}
        aria-hidden={!isOpened}
        inert={!isOpened}
        className="relative isolate overflow-hidden bg-[#f4efe4] text-[#263b31] outline-none"
        style={{
          backgroundImage: "radial-gradient(ellipse at 12% 10%, rgba(208,185,143,.16), transparent 31%), radial-gradient(ellipse at 88% 38%, rgba(193,137,132,.09), transparent 27%), repeating-linear-gradient(0deg, rgba(74,66,50,.018) 0px, rgba(74,66,50,.018) 1px, transparent 1px, transparent 5px)",
        }}
      >
        <div className="pointer-events-none absolute -left-24 top-[34rem] z-0 hidden h-[30rem] w-64 opacity-[.16] md:block" aria-hidden="true">
          <img src="/images/invitations/botanical/corner-sprig.svg" alt="" className="h-full w-full object-contain" />
        </div>

        <div className="relative z-10">
          {blocks("romantic_hero").length ? blocks("romantic_hero") : blocks("hero")}
        </div>

        {storyAvailable ? (
          <section className="relative z-10 mx-auto grid min-w-0 w-full max-w-6xl grid-cols-1 items-center gap-8 px-0 py-16 sm:px-10 sm:py-24 lg:grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)] lg:gap-16">
            <div className="relative mx-auto min-w-0 max-w-xs lg:order-2">
              <div className="rotate-[3deg] border border-[#c9b98f] bg-[#fffdf7] p-3 shadow-xl">
                <img src="/images/invitations/botanical/corner-sprig.svg" alt="" className="h-72 w-full object-contain sm:h-80" loading="lazy" />
                <p className="border-t border-[#d9d0bb] pt-3 text-center font-serif text-xs italic text-[#65766a]">{localizeInvitationSystemCopy("A note from the couple", data.locale)}</p>
              </div>
              <span className="botanical-bloom botanical-bloom--section absolute -left-12 -top-10 h-28 w-28" aria-hidden="true">
                <img src="/images/invitations/botanical/corner-sprig.svg" alt="" className="h-full w-full object-contain" loading="lazy" />
              </span>
            </div>
            <div className="min-w-0 lg:order-1">{blocks("story")}</div>
          </section>
        ) : null}

        <section className="relative z-10 mx-auto grid min-w-0 w-full max-w-6xl grid-cols-1 gap-5 px-5 py-12 sm:px-10 sm:py-16 lg:grid-cols-[minmax(13rem,.52fr)_minmax(0,1.48fr)] lg:items-start lg:gap-10">
          <aside className="relative min-w-0 overflow-hidden border-y border-[#b9a77c] bg-[#e9e2d2]/80 px-6 py-8 text-center lg:mt-10 lg:border lg:px-8 lg:py-10">
            <span className="absolute left-1/2 top-0 h-1 w-16 -translate-x-1/2 bg-[#b89c62]" aria-hidden="true" />
            <p className="font-sans text-[.62rem] font-semibold uppercase tracking-[.23em] text-[#65766a]">{localizeInvitationSystemCopy("The date", data.locale)}</p>
            <p className="mt-4 break-words font-serif text-4xl leading-tight text-[#263b31]">{date.dateDisplay}</p>
            {data.timezone ? <p className="mt-3 font-sans text-xs uppercase tracking-[.16em] text-[#53665a]">{date.timeDisplay}</p> : null}
            {venueLine ? <p className="mt-6 break-words border-t border-[#c8b995] pt-5 font-serif text-sm italic text-[#53665a]">{venueLine}</p> : null}
          </aside>
          <div className="relative min-w-0 border border-[#d7cfbb] bg-[#fffdf7]/85 px-1 py-2 shadow-[0_18px_42px_rgba(62,69,48,.10)] sm:px-3 sm:py-4">
            <span className="absolute -right-2 -top-2 h-12 w-12 rotate-12 border-r border-t border-[#b89c62]" aria-hidden="true" />
            <span className="absolute -bottom-2 -left-2 h-12 w-12 -rotate-12 border-b border-l border-[#b89c62]" aria-hidden="true" />
            {blocks("details")}
          </div>
        </section>

        {blocks("countdown").length ? (
          <section className="relative z-10 mx-auto my-8 max-w-5xl border-y border-[#b9a77c]/70 px-4 sm:my-14 sm:px-8">
            <div className="mx-auto max-w-4xl">{blocks("countdown")}</div>
          </section>
        ) : null}

        {hasSchedule ? (
          <section className="relative z-10 overflow-hidden bg-[#e9e2d2]/65 py-8 sm:py-12">
            <div className="botanical-bloom botanical-bloom--section absolute right-[7%] top-4 h-32 w-24 opacity-50" aria-hidden="true">
              <img src="/images/invitations/botanical/corner-sprig.svg" alt="" className="h-full w-full object-contain" loading="lazy" />
            </div>
            <div className="relative mx-auto max-w-6xl px-2 sm:px-8">{blocks("schedule")}</div>
          </section>
        ) : null}

        {hasVenue ? <div className="relative z-10 mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">{blocks("location_map")}</div> : null}

        {hasGallery ? (
          <section className="relative z-10 mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-20">
            <div className="mb-3 flex items-center justify-center gap-4" aria-hidden="true"><span className="h-px w-12 bg-[#b9a77c]"/><span className="h-2 w-2 rotate-45 border border-[#b9a77c]"/><span className="h-px w-12 bg-[#b9a77c]"/></div>
            {blocks("gallery")}
          </section>
        ) : null}

        {blocks("action_portal").length ? (
          <section className="relative z-10 overflow-hidden border-y border-[#c9b98f] bg-[#e9e2d2]/70 px-5 py-14 sm:px-8 sm:py-20">
            <div className="pointer-events-none absolute -bottom-14 -right-10 h-64 w-52 opacity-20" aria-hidden="true">
              <img src="/images/invitations/botanical/corner-sprig.svg" alt="" className="h-full w-full object-contain" loading="lazy" />
            </div>
            <div className="relative mx-auto max-w-3xl">{blocks("action_portal")}</div>
          </section>
        ) : null}

        {hasMusic ? <div className="relative z-10">{blocks("music")}</div> : null}

        <footer className="relative z-10 px-5 py-10 text-center font-sans text-[.6rem] uppercase tracking-[.22em] text-[#718071]">
          <span className="mx-auto mb-3 block h-px w-16 bg-[#b9a77c]" aria-hidden="true" />
          {data.locale === "fr" ? "Avec amour · Aldriva" : "With love · Aldriva"}
        </footer>
      </div>
    </InvitationPageCanvas>
  );

  return (
    <div className={isOpened ? "h-auto overflow-y-auto" : "h-[100dvh] overflow-hidden bg-[#f4efe4]"}>
      <div aria-hidden={!isOpened} inert={!isOpened}>
        {page}
      </div>
      {gateEnabled ? (
        <EnvelopeGate
          opened={isOpened}
          durationMs={gateDuration}
          title={title}
          locale={data.locale}
          onOpen={() => setIsOpened(true)}
        />
      ) : null}
    </div>
  );
}

function EnvelopeGate({
  opened,
  durationMs,
  title,
  locale = "en",
  onOpen,
}: {
  opened: boolean;
  durationMs: number;
  title: string;
  locale?: InvitationPageData["locale"];
  onOpen: () => void;
}) {
  const french = locale === "fr";
  return (
    <div
      aria-label={french ? "Invitation scellée" : "Sealed invitation"}
      aria-hidden={opened}
      inert={opened}
      className={`fixed inset-0 z-[100] flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#f4efe4] px-5 py-8 text-center transition-all ease-[cubic-bezier(.2,.75,.25,1)] motion-reduce:transition-none ${opened ? "pointer-events-none scale-[1.025] opacity-0" : "scale-100 opacity-100"}`}
      style={{ transitionDuration: `${Math.min(3000, Math.max(0, durationMs))}ms` }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[.34]" style={{ backgroundImage: "radial-gradient(ellipse at 20% 22%, rgba(185,167,124,.25), transparent 30%), radial-gradient(ellipse at 83% 76%, rgba(201,141,136,.16), transparent 26%)" }} aria-hidden="true" />
      <img src="/images/invitations/botanical/corner-sprig.svg" alt="" className="pointer-events-none absolute -left-20 -top-12 h-72 w-56 -rotate-12 opacity-50 sm:-left-10 sm:top-0 sm:h-96" />
      <img src="/images/invitations/botanical/corner-sprig.svg" alt="" className="pointer-events-none absolute -bottom-24 -right-16 h-80 w-60 rotate-[165deg] opacity-45 sm:-right-4 sm:h-[26rem]" />
      <div className="relative z-10 flex w-full max-w-xl flex-col items-center">
        <p className="mb-8 font-serif text-[.67rem] font-medium uppercase tracking-[.32em] text-[#53665a] sm:mb-10 sm:text-xs">
          {french ? "Une invitation fleurit" : "An invitation in bloom"}
        </p>
        <div className="relative w-full max-w-[24rem] px-4">
          <div className="absolute -inset-4 rotate-[-3deg] border border-[#b9a77c]/70 bg-[#e9e2d2] shadow-xl" aria-hidden="true" />
          <div className="absolute inset-x-8 -top-7 h-16 border border-[#d2c6a9] bg-[#fffdf7] shadow-sm" aria-hidden="true" />
          <div className="relative overflow-hidden border border-[#c9b98f] bg-[#e9e2d2] p-3 shadow-[0_22px_52px_rgba(55,66,49,.18)]">
            <div className="relative flex h-52 items-center justify-center overflow-hidden border border-[#d8cfbb] bg-[#f9f6ed] sm:h-60">
              <img src="/images/invitations/botanical/garden-arch.svg" alt="" className={invitationImageClassName("framed", "absolute inset-0 opacity-75")} />
              <div className="absolute inset-0 bg-[#f4efe4]/25" aria-hidden="true" />
              <div className="relative mx-7 flex h-[82%] w-[78%] flex-col items-center justify-center border border-[#b9a77c] bg-[#fffdf7]/85 px-4 shadow-md">
                <span className="mb-3 text-[.55rem] uppercase tracking-[.22em] text-[#6b7d6b]">{french ? "Le mariage" : "The wedding of"}</span>
                <span className="font-serif text-xl italic leading-tight text-[#263b31] sm:text-2xl">{title}</span>
                <span className="mt-4 h-px w-10 bg-[#b9a77c]" aria-hidden="true" />
              </div>
              <div className="absolute inset-x-0 bottom-0 h-[45%] bg-[#e2d8c4]/95" aria-hidden="true" />
              <svg viewBox="0 0 420 120" className="absolute inset-x-0 bottom-0 h-[46%] w-full" aria-hidden="true">
                <path d="M0 0 210 102 420 0v120H0Z" fill="#eee7d8" stroke="#c9b98f" strokeWidth="1.2" />
                <path d="M0 120 155 39m265 81L265 39" stroke="#d4c8ad" strokeWidth="1" />
              </svg>
              <button
                type="button"
                onClick={onOpen}
                aria-label={french ? "Ouvrir l'invitation" : "Open the invitation"}
                className="absolute bottom-[19%] left-1/2 z-10 grid size-[4.4rem] -translate-x-1/2 place-items-center rounded-full border border-[#b88657] bg-[#9b6156] text-[#f8ebd6] shadow-[0_8px_20px_rgba(74,59,50,0.3)] transition-all duration-300 hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#365746] motion-reduce:transition-none"
              >
                <svg viewBox="0 0 64 64" className="h-10 w-10" fill="none" aria-hidden="true">
                  <path d="M32 5c4 6 8 8 15 7-1 7 1 11 7 15-6 4-8 8-7 15-7-1-11 1-15 7-4-6-8-8-15-7 1-7-1-11-7-15 6-4 8-8 7-15 7 1 11-1 15-7Z" fill="currentColor" stroke="#e5c795" strokeWidth="1.2" />
                  <path d="M32 20v24m-9-12h18m-15-7 12 14m0-14L26 39" stroke="#7c4d44" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <p className="mt-9 font-sans text-[.6rem] font-semibold uppercase tracking-[.22em] text-[#53665a] sm:mt-11 sm:text-xs">
          {french ? "Touchez le sceau pour découvrir l'invitation" : "Touch the seal to unfold your invitation"}
        </p>
        <button type="button" onClick={onOpen} className="mt-4 min-h-11 rounded-sm px-4 py-2 font-serif text-sm italic text-[#526e59] underline decoration-[#a99a73] underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#365746]">
          {french ? "Passer l'animation" : "Skip the animation"}
        </button>
      </div>
    </div>
  );
}
