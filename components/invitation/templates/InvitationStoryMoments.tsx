"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { invitationImageClassName } from "@/lib/invitation-image-presentation";

export interface InvitationStoryMoment {
  title?: string | null;
  text?: string | null;
  image?: string | null;
}

interface StoryImageProps {
  src: string;
  alt: string;
  className?: string;
  onError: () => void;
}

function StoryImage({ src, alt, className, onError }: StoryImageProps) {
  return (
    <div className={cn("relative aspect-[4/3] w-full shrink-0 overflow-hidden", className)}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 768px) 100vw, 480px"
        className={invitationImageClassName("framed")}
        onError={onError}
      />
    </div>
  );
}

interface InvitationStoryMomentsProps {
  items?: InvitationStoryMoment[] | null;
  fallbackImage?: string | null;
  layout?: "cards" | "alternating";
  className?: string;
  imageClassName?: string;
  itemClassName?: string;
  contentClassName?: string;
  titleClassName?: string;
  textClassName?: string;
  imageAlt?: string;
}

/** Renders saved story moments and hides any image that fails to load. */
export function InvitationStoryMoments({
  items,
  fallbackImage,
  layout = "cards",
  className,
  imageClassName,
  itemClassName,
  contentClassName,
  titleClassName,
  textClassName,
  imageAlt = "Story moment",
}: InvitationStoryMomentsProps) {
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});
  const saved = (items ?? []).filter(
    (item) => Boolean(item.image || item.title?.trim() || item.text?.trim())
  );
  const moments = saved.length > 0 ? saved : fallbackImage ? [{ image: fallbackImage }] : [];
  if (moments.length === 0) return null;

  return (
    <div
      className={cn(
        layout === "alternating"
          ? "space-y-10 sm:space-y-12"
          : "grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2",
        className
      )}
    >
      {moments.map((moment, index) => ({ moment, index }))
        .filter(({ moment, index }) => !failedImages[index] || Boolean(moment.title?.trim() || moment.text?.trim()))
        .map(({ moment, index }) => {
        const hasText = Boolean(moment.title?.trim() || moment.text?.trim());
        const image = moment.image?.trim();
        return (
          <article
            key={`${index}-${moment.title ?? "story"}`}
            className={cn(
              "min-w-0",
              layout === "alternating"
                ? `flex flex-col items-center gap-6 md:flex-row ${index % 2 ? "md:flex-row-reverse" : ""}`
                : "overflow-hidden rounded-xl border border-zinc-200/70 bg-white/80 shadow-xs",
              itemClassName
            )}
          >
            {image && (
              <StoryImage
                src={image}
                alt={moment.title?.trim() || imageAlt}
                onError={() => setFailedImages((previous) => ({ ...previous, [index]: true }))}
                className={cn(
                  layout === "alternating" ? "md:w-1/2 md:max-w-[50%]" : "",
                  imageClassName
                )}
              />
            )}
            {hasText && (
              <div className={cn(layout === "cards" ? "space-y-2 p-4" : "min-w-0 flex-1 space-y-2 text-center md:text-left", contentClassName)}>
                {moment.title?.trim() && (
                  <h3 className={cn("text-base font-semibold", titleClassName)}>{moment.title}</h3>
                )}
                {moment.text?.trim() && (
                  <p className={cn("whitespace-pre-line text-sm leading-relaxed", textClassName)}>{moment.text}</p>
                )}
              </div>
            )}
          </article>
        );
        })}
    </div>
  );
}
