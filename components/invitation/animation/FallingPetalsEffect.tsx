"use client";

import type { CSSProperties } from "react";

const PETAL_COLORS = ["#d9a5a0", "#e8c2b8", "#c98683", "#ead8c8"] as const;

/** Decorative, pointer-transparent CSS effect with a strict 12-petal ceiling. */
export function FallingPetalsEffect({ density = 6 }: { density?: number }) {
  const count = Number.isFinite(density) ? Math.max(1, Math.min(12, Math.floor(density))) : 6;

  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden motion-reduce:hidden" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => {
        const style = {
          left: `${(index * 37 + 11) % 100}%`,
          animationDelay: `-${(index * 1.7) % 10}s`,
          animationDuration: `${14 + (index % 4) * 2}s`,
          "--invitation-petal-drift": `${((index * 19) % 17) - 8}vw`,
          "--invitation-petal-color": PETAL_COLORS[index % PETAL_COLORS.length],
        } as CSSProperties;

        return (
          <svg
            key={`petal-${index}`}
            viewBox="0 0 18 26"
            className="invitation-falling-petal"
            style={style}
            focusable="false"
          >
            <path d="M9 1C17 8 16 19 9 25 2 19 1 8 9 1Z" fill="var(--invitation-petal-color)" />
            <path d="M9 4C9 11 9 17 9 22" fill="none" stroke="#8b5e58" strokeOpacity=".3" strokeWidth=".7" />
          </svg>
        );
      })}
    </div>
  );
}
