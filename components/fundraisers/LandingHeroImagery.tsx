"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

/**
 * Decorative campaign-photo fan — real photos only, no overlays or claims.
 *
 * Cards are laid out as a fanned arch: uniform horizontal gaps (so no photo is
 * covered by its neighbor), a parabolic arc where the center card sits highest
 * and the outer cards drop lower, and rotation that increases toward the edges.
 * Images are assigned center-out: image 0 is the peak, the rest fan outward
 * alternating sides.
 *
 * A URL can pass the caller's stock/fallback filter and still fail to load
 * (dead link, 403, blocked host). Failed sources are dropped and backfilled with
 * high-quality community fallbacks so the photo fan always maintains a complete
 * fanned layout across all devices.
 */

type FanLayout = {
  /** Max photos shown at this width (space-limited, independent of how many exist). */
  max: number;
  /** Card width in px (height is 4:3 of this). */
  cardWidth: number;
  /** Horizontal gap between adjacent cards in px. */
  gap: number;
  /** Total vertical travel of the arch (peak to outer edge) in px. */
  arcDepth: number;
  /** Rotation of the outermost cards in degrees. */
  maxRotate: number;
  /** Container height in px. */
  height: number;
};

const LAYOUTS: Record<"mobile" | "tablet" | "desktop", FanLayout> = {
  mobile: { max: 3, cardWidth: 144, gap: 16, arcDepth: 40, maxRotate: 8, height: 260 },
  tablet: { max: 3, cardWidth: 168, gap: 40, arcDepth: 74, maxRotate: 11, height: 340 },
  desktop: { max: 5, cardWidth: 168, gap: 40, arcDepth: 112, maxRotate: 15, height: 380 },
};

const DEFAULT_FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1593113598332-cd288d649433?w=800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1509099836639-18ba1795216d?w=800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1542810634-71277d95dcbb?w=800&auto=format&fit=crop",
];

type Placement = { x: number; y: number; rotate: number; z: number };

/**
 * Distribute `n` cards along the arch, ordered center-out (index 0 = peak).
 * Horizontal step is a fixed card-width + gap, so spacing stays uniform for any
 * count; the arc lift and rotation follow the card's normalized position.
 */
function arcPlacements(n: number, layout: FanLayout): Placement[] {
  if (n <= 1) return [{ x: 0, y: 0, rotate: 0, z: n }];

  const step = layout.cardWidth + layout.gap;
  const mid = (n - 1) / 2;

  const slots = Array.from({ length: n }, (_, i) => {
    const offset = i - mid; // even integer/half steps left→right, 0 at center
    const t = offset / mid; // normalized position, -1 (left) … 0 (center) … 1 (right)
    return {
      x: offset * step,
      // Balanced parabola: peak (t=0) lifts up, outer edges (|t|=1) drop down.
      y: (t * t - 0.5) * layout.arcDepth,
      rotate: t * layout.maxRotate,
      distanceFromPeak: Math.abs(t),
    };
  });

  return slots
    .sort((a, b) => a.distanceFromPeak - b.distanceFromPeak)
    .map(({ x, y, rotate }, index) => ({ x, y, rotate, z: n - index }));
}

function layoutForWidth(width: number): FanLayout {
  if (width >= 1024) return LAYOUTS.desktop;
  if (width >= 640) return LAYOUTS.tablet;
  return LAYOUTS.mobile;
}

export default function LandingHeroImagery({ images }: { images: string[] }) {
  const [failed, setFailed] = useState<Set<string>>(new Set());
  // Default to desktop so the server and first client render agree; corrected
  // to the real breakpoint on mount and on resize.
  const [layout, setLayout] = useState<FanLayout>(LAYOUTS.desktop);

  useEffect(() => {
    const update = () => setLayout(layoutForWidth(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const markFailed = (src: string) =>
    setFailed((prev) => {
      const next = new Set(prev);
      next.add(src);
      return next;
    });

  // Filter out any failed passed images
  const validPassed = (images || []).filter((src) => !failed.has(src));

  // Combine passed images with high-quality fallback pool so fan is never empty/collapsing
  const pool = [...validPassed];
  for (const fb of DEFAULT_FALLBACK_IMAGES) {
    if (!failed.has(fb) && !pool.includes(fb)) {
      pool.push(fb);
    }
  }

  const shown = pool.slice(0, layout.max);
  if (shown.length === 0) return null;

  const placements = arcPlacements(shown.length, layout);

  return (
    <div
      className="relative mx-auto w-full max-w-md sm:max-w-2xl lg:max-w-5xl"
      style={{ height: layout.height }}
    >
      {/* Soft brand glow — decorative only, no claim */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-48 w-3/4 -translate-x-1/2 -translate-y-1/2 rounded-[3rem] bg-emerald-100/50 blur-3xl"
      />

      {shown.map((src, i) => {
        const { x, y, rotate, z } = placements[i];
        return (
          <div
            key={src}
            className="absolute left-1/2 top-1/2 overflow-hidden rounded-2xl shadow-xl ring-1 ring-black/5"
            style={{
              width: layout.cardWidth,
              transform: `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${rotate}deg)`,
              zIndex: z,
            }}
          >
            <div className="relative aspect-[3/4]">
              <Image
                src={src}
                alt=""
                fill
                sizes="(max-width: 640px) 40vw, (max-width: 1024px) 22vw, 12rem"
                className="object-cover"
                priority={i === 0}
                onError={() => markFailed(src)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
