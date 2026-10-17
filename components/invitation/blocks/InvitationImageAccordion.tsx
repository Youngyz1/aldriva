"use client";

/**
 * components/invitation/blocks/InvitationImageAccordion.tsx
 *
 * Opt-in "image accordion" gallery layout, adapted from the MIT-licensed
 * 21st.dev "Tailwind Image Accordion" (UI Layouts / uilayout.contact).
 *
 * Rebuilt for Aldriva rather than copied:
 * - Consumes the organizer's real gallery data (url / alt / caption) in the
 *   configured order. No demo art, no demo copy, no hardcoded titles.
 * - Desktop: panels sit side-by-side and the hovered or keyboard-focused
 *   panel expands while the rest collapse. Keyboard users get a visible focus
 *   outline; nothing depends on pointer hover alone.
 * - Narrow / touch viewports: panels stack full-width and every caption is
 *   visible, so no interaction is required to read the gallery.
 * - Honors `prefers-reduced-motion` (expansion and image zoom stop animating).
 * - Degrades gracefully: empty galleries render nothing, and a single photo
 *   falls back to the project's uncropped natural-ratio figure.
 *
 * Framing note: this layout deliberately uses fixed panel frames with
 * `object-cover` (that is what makes an accordion an accordion). It is only
 * used when an organizer explicitly selects it; every other gallery
 * presentation keeps the project's natural-ratio, never-cropped rendering
 * (see `components/invitation/templates/AUTHORING.md` §6).
 */

import { useState, type CSSProperties } from "react";
import type { InvitationGalleryItem, InvitationPageData } from "@/types/invitation-template";
import type { PageGlobalTheme } from "@/lib/page-composition";
import { cn } from "@/lib/utils";
import { invitationImageClassName } from "@/lib/invitation-image-presentation";
import { localizeInvitationSystemCopy } from "@/lib/invitation-i18n";

interface Props {
  images: InvitationGalleryItem[];
  theme: PageGlobalTheme;
  locale?: InvitationPageData["locale"];
}

function photoLabel(image: InvitationGalleryItem, index: number, total: number, locale: InvitationPageData["locale"]): string {
  const text = image.caption?.trim() || image.alt?.trim();
  const base = `${localizeInvitationSystemCopy("Photo", locale)} ${index + 1} / ${total}`;
  return text ? `${base}: ${text}` : base;
}

export function InvitationImageAccordion({ images, theme, locale = "en" }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const panels = images.filter((image) => Boolean(image.url));

  if (panels.length === 0) return null;

  // A single photo has nothing to reveal; keep it whole and uncropped.
  if (panels.length === 1) {
    const only = panels[0];
    const caption = only.caption?.trim() || only.alt?.trim() || null;
    return (
      <figure className="mx-auto w-full min-w-0 max-w-3xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={only.url}
          alt={only.alt || only.caption || localizeInvitationSystemCopy("Event gallery photo", locale)}
          loading="lazy"
          className={invitationImageClassName("contained")}
        />
        {caption ? (
          <figcaption className={cn("pt-2 text-center text-sm", theme.classes.body ?? "")}>{caption}</figcaption>
        ) : null}
      </figure>
    );
  }

  const safeActive = Math.min(Math.max(activeIndex, 0), panels.length - 1);

  return (
    <ul
      className="flex w-full min-w-0 flex-col gap-2 md:h-[30rem] md:flex-row md:gap-3"
      aria-label={localizeInvitationSystemCopy("Photo gallery", locale)}
    >
      {panels.map((panel, index) => {
        const isActive = index === safeActive;
        const caption = panel.caption?.trim() || panel.alt?.trim() || null;
        return (
          <li
            key={`${panel.url}-${index}`}
            style={{ "--panel-grow": isActive ? panels.length : 1 } as CSSProperties}
            className={cn(
              "relative min-w-0 w-full overflow-hidden rounded-xl bg-zinc-900",
              "aspect-[4/5] md:aspect-auto md:h-full md:basis-0",
              "md:[flex-grow:var(--panel-grow)]",
              "transition-[flex-grow] duration-500 ease-out motion-reduce:transition-none",
            )}
          >
            <button
              type="button"
              aria-pressed={isActive}
              aria-label={photoLabel(panel, index, panels.length, locale)}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onClick={() => setActiveIndex(index)}
              className="group/panel absolute inset-0 block cursor-pointer text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-500"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={panel.url}
                alt={panel.alt || panel.caption || localizeInvitationSystemCopy("Event gallery photo", locale)}
                loading={index === 0 ? "eager" : "lazy"}
                className={invitationImageClassName(
                  "framed",
                  "transition-transform duration-500 ease-out motion-reduce:transition-none md:group-hover/panel:scale-[1.03]",
                )}
              />
              {caption ? (
                <span
                  className={cn(
                    "absolute inset-x-0 bottom-0 bg-black/60 px-3 py-2 text-xs text-white sm:text-sm",
                    "md:transition-opacity md:duration-300 md:motion-reduce:transition-none",
                    isActive ? "md:opacity-100" : "md:opacity-0",
                  )}
                >
                  {caption}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
