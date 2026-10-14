/**
 * Pure fit-to-content math for the organizer venue builder (B1).
 * No React import: unit-testable in the node:test harness.
 */

export interface ContentBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface FitViewport {
  width: number;
  height: number;
}

export interface FitTransform {
  scale: number;
  pan: { x: number; y: number };
}

export const FIT_PAD = 24;
export const FIT_MIN_SCALE = 0.25;
export const FIT_MAX_SCALE = 1.5;
const MIN_SPAN = 100;

export function collectContentBounds(
  seats: Array<{ x?: unknown; y?: unknown; width?: unknown; height?: unknown }>,
  objects: Array<{
    x?: unknown;
    y?: unknown;
    width?: unknown;
    height?: unknown;
  }>
): ContentBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  for (const s of seats || []) {
    const w = num(s?.width, 26);
    const h = num(s?.height, 26);
    if (typeof s?.x !== "number" || typeof s?.y !== "number") continue;
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + w);
    maxY = Math.max(maxY, s.y + h);
  }
  for (const o of objects || []) {
    if (
      typeof o?.x !== "number" ||
      typeof o?.y !== "number" ||
      typeof o?.width !== "number" ||
      typeof o?.height !== "number"
    ) {
      continue;
    }
    minX = Math.min(minX, o.x);
    minY = Math.min(minY, o.y);
    maxX = Math.max(maxX, o.x + o.width);
    maxY = Math.max(maxY, o.y + o.height);
  }
  if (!isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

export function computeFitTransform(
  bounds: ContentBounds | null,
  viewport: FitViewport,
  pad: number = FIT_PAD
): FitTransform {
  if (!bounds) return { scale: 1, pan: { x: 0, y: 0 } };
  const bw = Math.max(bounds.maxX - bounds.minX + pad * 2, MIN_SPAN);
  const bh = Math.max(bounds.maxY - bounds.minY + pad * 2, MIN_SPAN);
  const sc = Math.min(
    FIT_MAX_SCALE,
    Math.max(
      FIT_MIN_SCALE,
      Math.min(viewport.width / bw, viewport.height / bh)
    )
  );
  const scale = Number(sc.toFixed(2));
  return {
    scale,
    pan: {
      x: (viewport.width - bw * scale) / 2 - (bounds.minX - pad) * scale,
      y: (viewport.height - bh * scale) / 2 - (bounds.minY - pad) * scale,
    },
  };
}
