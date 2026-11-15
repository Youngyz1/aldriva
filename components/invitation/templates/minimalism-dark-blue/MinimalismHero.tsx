"use client";

import { motion, useReducedMotion } from "motion/react";
import Balancer from "react-wrap-balancer";
import { HeroCollage } from "./HeroCollage";

const NAVY = "#00214a";

export interface MinimalismHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  primaryImage: string | null;
  secondaryImage: string | null;
  primaryAlt?: string;
  secondaryAlt?: string;
  primaryFocus?: { x: number; y: number } | null;
  secondaryFocus?: { x: number; y: number } | null;
}

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

const item = {
  hidden: { opacity: 0, y: 12, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as any },
  },
};

export function MinimalismHero({
  eyebrow,
  title,
  description,
  primaryImage,
  secondaryImage,
  primaryAlt = "",
  secondaryAlt = "",
  primaryFocus = null,
  secondaryFocus = null,
}: MinimalismHeroProps) {
  const reduce = useReducedMotion();
  const animate = !reduce;

  return (
    <section id="inv-hero" className="relative w-full overflow-hidden bg-transparent">
      <motion.div
        className="relative z-10 mx-auto flex w-full max-w-sm flex-col items-center gap-6 px-5 py-10 text-center sm:py-14"
        variants={animate ? container : undefined}
        initial={animate ? "hidden" : false}
        animate={animate ? "visible" : false}
      >
        <motion.div variants={animate ? item : undefined} className="flex flex-col items-center gap-2">
          <p className="text-xs uppercase tracking-[.3em]" style={{ color: NAVY }}>{eyebrow}</p>
          <h1
            className="text-balance text-4xl uppercase leading-tight tracking-[.02em] sm:text-5xl"
            style={{ fontFamily: "var(--font-minimalism-display)", color: NAVY }}
          >
            <Balancer>{title}</Balancer>
          </h1>
          {description ? (
            <p className="text-sm sm:text-base" style={{ fontFamily: "var(--font-minimalism-body)", color: NAVY }}>
              <Balancer>{description}</Balancer>
            </p>
          ) : null}
        </motion.div>

        <div className="w-full">
          <HeroCollage
            primaryImage={primaryImage}
            secondaryImage={secondaryImage}
            primaryAlt={primaryAlt}
            secondaryAlt={secondaryAlt}
            primaryFocus={primaryFocus}
            secondaryFocus={secondaryFocus}
          />
        </div>
      </motion.div>
    </section>
  );
}
