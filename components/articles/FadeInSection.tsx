"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import type { ReactNode } from "react";

const FALLBACK_REVEAL_MS = 3000;

/**
 * Scroll-triggered fade-in-and-rise wrapper for landing-page sections.
 *
 * Previously used `whileInView` with a uniform `margin: "-80px"` (shrinks
 * the trigger zone on all four sides). On a short mobile viewport that
 * shrunk the effective window enough that sections lower on the page could
 * stay stuck at opacity: 0 well past when they were actually scrolled into
 * view — reported as "the page is blank below the hero on mobile."
 *
 * Content must never depend on this animation succeeding to become visible,
 * so on top of a safer, bottom-only margin, there's a hard fallback: if
 * the section hasn't naturally come into view within FALLBACK_REVEAL_MS of
 * mounting, it force-reveals regardless. Worst case, a section just skips
 * its entrance animation instead of staying invisible forever.
 */
export default function FadeInSection({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -100px 0px", amount: 0 });
  const [fallbackReveal, setFallbackReveal] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFallbackReveal(true), FALLBACK_REVEAL_MS);
    return () => clearTimeout(timer);
  }, []);

  const visible = inView || fallbackReveal;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
