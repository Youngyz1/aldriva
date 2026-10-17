"use client";

import { useState, type ReactNode } from "react";
import type { InvitationBlocksLayout } from "@/lib/invitation-template-schema";
import type { InvitationPageData } from "@/types/invitation-template";
import { localizeInvitationSystemCopy } from "@/lib/invitation-i18n";
import { InvitationPageCanvas } from "@/components/invitation/blocks/InvitationPageCanvas";

/**
 * A code-owned full-page composition for the cinematic envelope journey.
 * It receives already-authorized page data and the shared block output; it
 * never loads invitation records or owns RSVP behavior.
 */
export function RomanticEnvelopePageTemplate({
  layout,
  data,
  children,
  mode,
  isEditMode,
  wrapperClassName,
}: {
  layout: InvitationBlocksLayout;
  data: InvitationPageData;
  children: ReactNode;
  mode: "preview" | "live" | "shared";
  isEditMode: boolean;
  wrapperClassName?: string;
}) {
  const envelopeBlock = layout.layout_blocks.find((block) => block.type === "interactive_envelope" || block.type === "romantic_envelope_gate");
  const envelopeEffect = layout.effects?.find((effect) => effect.type === "envelope-reveal");
  const enabled = envelopeEffect?.enabled ?? envelopeBlock?.content.enabled !== false;
  const legacyDuration = envelopeBlock?.content.transitionDurationMs;
  const transitionDurationMs = envelopeEffect?.transitionDurationMs
    ?? (typeof legacyDuration === "number" && Number.isFinite(legacyDuration)
      ? Math.min(3000, Math.max(0, legacyDuration))
      : 1000);

  const canvas = (
    <InvitationPageCanvas
      layout={layout}
      mode={mode}
      isEditMode={isEditMode}
      wrapperClassName={wrapperClassName}
    >
      {children}
    </InvitationPageCanvas>
  );

  return enabled
    ? <RomanticEnvelopeJourney title={data.title} locale={data.locale} transitionDurationMs={transitionDurationMs}>{canvas}</RomanticEnvelopeJourney>
    : canvas;
}

function RomanticEnvelopeJourney({
  title,
  locale = "en",
  transitionDurationMs = 1000,
  children,
}: {
  title: string;
  locale?: InvitationPageData["locale"];
  transitionDurationMs?: number;
  children: ReactNode;
}) {
  const [isOpened, setIsOpened] = useState(false);

  return (
    <div className={isOpened ? "h-auto overflow-y-auto" : "h-screen overflow-hidden bg-[#E6DEC9]"}>
      {children}
      <div
        aria-hidden={isOpened}
        className={`fixed inset-0 z-[100] flex h-screen items-center justify-center overflow-hidden bg-[#E6DEC9] px-6 text-center text-stone-900 transition-all ease-out motion-reduce:transition-none ${isOpened ? "transform scale-95 opacity-0 pointer-events-none" : "scale-100 opacity-100"}`}
        style={{ transitionDuration: `${Math.min(3000, Math.max(0, transitionDurationMs))}ms` }}
      >
        <div className="flex w-full max-w-md flex-col items-center">
          <p className="mb-10 font-serif text-xs font-semibold tracking-[0.35em] text-stone-700 sm:text-sm">{localizeInvitationSystemCopy("YOU'RE INVITED!!", locale)}</p>
          <div className="relative w-full max-w-sm drop-shadow-xl">
            <svg viewBox="0 0 360 230" className="w-full" fill="none" aria-hidden="true">
              <rect x="12" y="15" width="336" height="200" rx="10" fill="#F8F4E9" stroke="#C8BDA6" strokeWidth="2" />
              <path d="M14 25 180 142 346 25" fill="#EEE6D7" stroke="#C8BDA6" strokeWidth="2" />
              <path d="m14 207 122-100m210 100L224 107" stroke="#D4C9B5" strokeWidth="2" />
              <path d="m16 207 164-118 164 118" fill="#E8DDCA" stroke="#C8BDA6" strokeWidth="2" />
            </svg>
            <button
              type="button"
              onClick={() => setIsOpened(true)}
              aria-label={localizeInvitationSystemCopy("Open the seal to reveal your invitation", locale)}
              className="absolute left-1/2 top-[62%] inline-flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_8px_20px_rgba(74,59,50,0.3)] hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-900"
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
