/**
 * lib/section-helpers.ts
 *
 * G2 Section Envelope Helpers — single source of truth for public / builder / template preview.
 *
 * Reuses SectionEnvelope shape from lib/website-blocks.ts.
 * No duplicate metadata, no migration, no arbitrary CSS.
 */

import type { Block, SectionEnvelope, SectionSpacing, SectionBackground, SectionContainer } from "./website-blocks";
import { isBlockVisible } from "./website-blocks";
import { safeImageSrc } from "./image-url";

export const ALLOWED_SPACINGS: readonly SectionSpacing[] = ["compact", "default", "roomy"] as const;

export const ALLOWED_CONTAINERS: readonly SectionContainer[] = ["constrained", "wide", "narrow", "full"] as const;

export function isValidSpacing(v: unknown): v is SectionSpacing {
  return v === "compact" || v === "default" || v === "roomy";
}

export function isValidContainer(v: unknown): v is SectionContainer {
  return v === "constrained" || v === "wide" || v === "narrow" || v === "full";
}

/**
 * Controlled spacing → Tailwind wrapper padding.
 * Applied as outer wrapper so public / builder share same semantic.
 * Individual block renderers keep their internal py-16 but wrapper adds envelope-level spacing.
 */
export function getSpacingClass(spacing?: SectionSpacing | null): string {
  switch (spacing) {
    case "compact":
      return "py-6 sm:py-8";
    case "roomy":
      return "py-16 sm:py-24";
    case "default":
    default:
      return "py-12 sm:py-16";
  }
}

/**
 * hiddenOnMobile → Tailwind responsive visibility.
 * Desktop/tablet visible, mobile hidden: `hidden sm:block` would hide <640px.
 * Use `max-sm:hidden` fallback via `hidden sm:block` is not correct for md; Aldriva uses sm=640 as mobile cutoff.
 * We use `hidden md:block` is too aggressive. Choose `max-sm:hidden` equivalent via `hidden sm:block` is fine
 * for G2 minimal — document as `hidden sm:flex`? Simpler: use `hidden sm:block` pattern.
 * For block level we use `hidden sm:block` via conditional wrapper; builder preview shows indicator instead of hiding.
 */
export function getHiddenOnMobileClass(hiddenOnMobile?: boolean): string {
  if (!hiddenOnMobile) return "";
  // Tailwind: hide on mobile base, show from sm (640px) up
  return "hidden sm:block";
}

export function getContainerClass(container?: SectionContainer | null): string {
  switch (container) {
    case "wide":
      return "mx-auto max-w-7xl px-6";
    case "narrow":
      return "mx-auto max-w-3xl px-6";
    case "full":
      return "w-full px-6";
    case "constrained":
    default:
      return "mx-auto max-w-6xl px-6";
  }
}

export function shouldRenderPublic(block: Block): boolean {
  return isBlockVisible(block);
}

export function isHiddenOnMobile(block: Block): boolean {
  return Boolean((block as unknown as Record<string, unknown>).hiddenOnMobile);
}

export function getSpacing(block: Block): SectionSpacing | undefined {
  const s = (block as unknown as Record<string, unknown>).spacing;
  if (isValidSpacing(s)) return s;
  return undefined;
}

export function getBackground(block: Block): SectionBackground | undefined {
  const bg = (block as unknown as Record<string, unknown>).background as SectionBackground | undefined;
  if (!bg || typeof bg !== "object") return undefined;
  const out: SectionBackground = {};
  if (typeof bg.color === "string" && bg.color.trim()) out.color = bg.color.trim().slice(0, 50);
  if (typeof bg.image === "string" && safeImageSrc(bg.image)) out.image = safeImageSrc(bg.image) as string;
  if (typeof bg.overlay === "number" && [0, 0.25, 0.5, 0.75].includes(bg.overlay)) out.overlay = bg.overlay;
  if (Object.keys(out).length === 0) return undefined;
  return out;
}

export function getContainer(block: Block): SectionContainer | undefined {
  const c = (block as unknown as Record<string, unknown>).container;
  if (isValidContainer(c)) return c;
  return undefined;
}

/**
 * Inline style for background color / image.
 * For G2 we support color and image; overlay is rendered as separate overlay div by caller.
 */
export function getBackgroundStyle(bg?: SectionBackground | null): React.CSSProperties | undefined {
  if (!bg) return undefined;
  const style: React.CSSProperties = {};
  if (bg.color) (style as Record<string, string>).backgroundColor = bg.color;
  if (bg.image) {
    (style as Record<string, string>).backgroundImage = `url(${bg.image})`;
    (style as Record<string, string>).backgroundSize = "cover";
    (style as Record<string, string>).backgroundPosition = "center";
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

export function sanitizeSectionPatch(
  patch: Partial<SectionEnvelope>
): Partial<SectionEnvelope> {
  const out: Partial<SectionEnvelope> = {};
  if ("visible" in patch) {
    if (typeof patch.visible === "boolean") out.visible = patch.visible;
    else if (patch.visible === undefined) out.visible = undefined as unknown as boolean; // signal clear
  }
  if ("hiddenOnMobile" in patch) {
    if (typeof patch.hiddenOnMobile === "boolean") out.hiddenOnMobile = patch.hiddenOnMobile;
    else if (patch.hiddenOnMobile === undefined) out.hiddenOnMobile = undefined as unknown as boolean;
  }
  if ("spacing" in patch) {
    if (isValidSpacing(patch.spacing)) out.spacing = patch.spacing;
    else if (patch.spacing === undefined || patch.spacing === null) out.spacing = undefined as unknown as SectionSpacing;
  }
  if ("background" in patch) {
    if (patch.background == null) out.background = undefined as unknown as SectionBackground;
    else if (typeof patch.background === "object") {
      const bg = patch.background as SectionBackground;
      const sanitized = getBackground({ background: bg } as unknown as Block);
      if (sanitized) out.background = sanitized;
      else out.background = undefined as unknown as SectionBackground;
      // If patch was explicitly {} we treat as clear
      if (Object.keys(bg).length === 0) out.background = undefined as unknown as SectionBackground;
    }
  }
  if ("container" in patch) {
    if (isValidContainer(patch.container)) out.container = patch.container;
    else if (patch.container === undefined || patch.container === null) out.container = undefined as unknown as SectionContainer;
  }
  return out;
}
