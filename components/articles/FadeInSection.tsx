"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Scroll-triggered fade-in-and-rise wrapper for landing-page sections.
 * `once: true` so it only plays the first time each section enters view.
 */
export default function FadeInSection({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
