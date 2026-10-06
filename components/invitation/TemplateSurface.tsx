"use client";

/**
 * components/invitation/TemplateSurface.tsx
 *
 * Shared surface primitives for invitation page templates.
 *
 * Architecture (card-free default): template content sits directly on the
 * page background. Separation comes from whitespace and hairline dividers
 * (`TemplateDivider`), never from boxed/bordered/tinted card containers.
 * Future templates inherit this default by simply not wrapping content.
 *
 * Explicit opt-in: the rare moment that genuinely needs a box (QR quiet
 * zone, a ticket-stub motif that IS the design) uses `TemplateCard`.
 */

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DividerProps {
  className?: string;
  style?: CSSProperties;
}

/** Hairline separator. Pass the template's rule color via style or className. */
export function TemplateDivider({ className = "", style }: DividerProps) {
  return <div aria-hidden="true" className={cn("border-t", className)} style={style} />;
}

interface CardProps {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Explicit boxed-surface opt-in. Do NOT use for ordinary content grouping —
 * reach for spacing + TemplateDivider first. Legitimate uses: QR quiet
 * zones (scannability), ticket-stub motifs where the box is the design.
 */
export function TemplateCard({ className = "", style, children }: CardProps) {
  return (
    <div className={cn("rounded-xl border shadow-xs", className)} style={style}>
      {children}
    </div>
  );
}
