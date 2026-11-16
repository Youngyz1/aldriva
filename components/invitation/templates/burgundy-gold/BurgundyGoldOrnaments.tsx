"use client";

import type { CSSProperties } from "react";

/**
 * Small, code-drawn gold ornaments for Burgundy Gold.
 * These are decorative CSS/SVG marks only — no supplied screenshot is traced or cropped.
 */

export function BurgundyFlourish({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 260 44"
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 22h62c12 0 18-7 28-7 8 0 13 4 18 7" />
      <path d="M254 22h-62c-12 0-18-7-28-7-8 0-13 4-18 7" />
      <path d="M78 22c10-9 21-14 33-14 8 0 13 4 19 14-6 10-11 14-19 14-12 0-23-5-33-14Z" />
      <path d="M182 22c-10-9-21-14-33-14-8 0-13 4-19 14 6 10 11 14 19 14 12 0 23-5 33-14Z" />
      <path d="M18 15c8-6 16-8 24-6M18 29c8 6 16 8 24 6M242 15c-8-6-16-8-24-6M242 29c-8 6-16 8-24 6" />
      <path d="M95 22c4-5 9-8 15-8M165 22c-4-5-9-8-15-8" />
      <circle cx="130" cy="22" r="2.4" fill="currentColor" stroke="none" />
      <path d="M111 11c3-4 7-6 11-6M149 11c-3-4-7-6-11-6M111 33c3 4 7 6 11 6M149 33c-3 4-7 6-11 6" />
    </svg>
  );
}

export function BurgundyCornerOrnament({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 52 52"
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2 2h32M2 2v32" />
      <path d="M9 9c10 0 17 4 22 11-7 1-13 5-17 12" />
      <path d="M9 9c0 10 4 17 11 22 1-7 5-13 12-17" />
      <path d="M16 16c5-1 9 1 12 5-4 2-7 5-8 10" />
      <circle cx="7" cy="7" r="2.2" fill="currentColor" stroke="none" />
      <path d="M31 4c-2 1-3 3-3 5M4 31c1-2 3-3 5-3" />
    </svg>
  );
}

/**
 * Solid heart used as the calendar marker on the event day. Copied from the
 * inline HeartGlyph in MinimalismDarkBluePageTemplate.tsx (~L89), which is not
 * exported and whose renderer is frozen.
 */
export function BurgundyHeartMark({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      style={style}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z" />
    </svg>
  );
}

export function BurgundyDivider({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div className={className} style={style} aria-hidden="true">
      <span className="h-px flex-1 bg-current opacity-45" />
      <svg viewBox="0 0 20 20" className="size-3 shrink-0" fill="currentColor" aria-hidden="true" focusable="false">
        <path d="M10 1.5 12 8l6.5 2-6.5 2-2 6.5-2-6.5L1.5 10 8 8 10 1.5Z" />
      </svg>
      <span className="h-px flex-1 bg-current opacity-45" />
    </div>
  );
}
