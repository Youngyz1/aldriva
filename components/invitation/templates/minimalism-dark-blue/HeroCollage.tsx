"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";

export interface HeroCollageProps {
  primaryImage: string | null;
  secondaryImage: string | null;
  primaryAlt?: string;
  secondaryAlt?: string;
  primaryFocus?: { x: number; y: number } | null;
  secondaryFocus?: { x: number; y: number } | null;
}

export function HeroCollage({
  primaryImage,
  secondaryImage,
  primaryAlt = "",
  secondaryAlt = "",
  primaryFocus = null,
  secondaryFocus = null,
}: HeroCollageProps) {
  const reduce = useReducedMotion();
  const hasPrimary = Boolean(primaryImage);
  const hasSecondary = Boolean(secondaryImage) && secondaryImage !== primaryImage;

  if (!hasPrimary && !hasSecondary) {
    return null;
  }

  const primaryPosition = primaryFocus
    ? `${primaryFocus.x}% ${primaryFocus.y}%`
    : "50% 50%";
  const secondaryPosition = secondaryFocus
    ? `${secondaryFocus.x}% ${secondaryFocus.y}%`
    : "50% 50%";

  if (hasPrimary && !hasSecondary) {
    return (
      <div className="relative mx-auto w-full max-w-[420px]">
        <motion.div
          className="relative mx-auto w-[78%] aspect-[4/5] overflow-hidden rounded-2xl border-4 border-white shadow-md"
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={reduce ? false : { opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as any }}
        >
          <Image
            src={primaryImage as string}
            alt={primaryAlt}
            fill
            priority
            sizes="(max-width: 640px) 80vw, 420px"
            className="object-cover"
            style={{ objectPosition: primaryPosition }}
          />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-[420px] pb-[14%]">
      <motion.div
        className="relative w-[78%] aspect-[4/5] overflow-hidden rounded-2xl border-4 border-white shadow-md"
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={reduce ? false : { opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as any }}
      >
        <Image
          src={primaryImage as string}
          alt={primaryAlt}
          fill
          priority
          sizes="(max-width: 640px) 80vw, 420px"
          className="object-cover"
          style={{ objectPosition: primaryPosition }}
        />
      </motion.div>
      {hasSecondary && secondaryImage ? (
        <motion.div
          className="absolute bottom-0 right-0 z-10 w-[44%] aspect-[3/4] overflow-hidden rounded-xl border-4 border-white shadow-lg"
          style={{ transform: "rotate(3deg)" }}
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={reduce ? false : { opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] as any }}
        >
          <Image
            src={secondaryImage}
            alt={secondaryAlt}
            fill
            sizes="(max-width: 640px) 45vw, 185px"
            className="object-cover"
            style={{ objectPosition: secondaryPosition }}
          />
        </motion.div>
      ) : null}
    </div>
  );
}
