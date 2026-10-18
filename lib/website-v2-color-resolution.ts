// Fixed tokens mirror the .public-site scope in app/globals.css. Dynamic accent
// token values can be passed by the caller from the active theme configuration.
const PUBLIC_SITE_FIXED_COLORS: Record<string, string> = {
  "--ps-text": "#22201c",
  "--ps-muted": "#625f58",
  "--ps-surface": "#ffffff",
  "--ps-cream": "#fbf8f0",
  "--ps-neutral": "#f3f1ec",
  "--ps-border": "#dedbd3",
  "--ps-success": "#166534",
  "--ps-error": "#b42318",
};

/** Resolve a V2 CSS color token to the exact hex color used on the public site. */
export function resolveV2ThemeColor(
  color: string,
  templateId: string,
  resolvedTokens: Readonly<Record<string, string>> = {},
  depth = 0
): string {
  const value = color.trim();
  if (/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value)) return value;
  if (depth > 8) {
    throw new Error(`Could not resolve V2 theme color "${color}" for ${templateId}.`);
  }

  const variable = /^var\((--[\w-]+)(?:\s*,\s*(.+))?\)$/.exec(value);
  if (!variable) {
    throw new Error(`Could not resolve V2 theme color "${color}" for ${templateId}.`);
  }

  const resolved = resolvedTokens[variable[1]] ?? PUBLIC_SITE_FIXED_COLORS[variable[1]];
  if (resolved) return resolveV2ThemeColor(resolved, templateId, resolvedTokens, depth + 1);
  if (variable[2]) return resolveV2ThemeColor(variable[2], templateId, resolvedTokens, depth + 1);

  throw new Error(`No public-site color token is defined for "${variable[1]}" (${templateId}).`);
}
import type { WebsiteTemplatePalette } from "./website-template-v2";
import { contrastRatio, readableOn } from "./readable-on";


export interface ResolvedWebsitePalette extends WebsiteTemplatePalette {
  subtle: string;
  muted: string;
  border: string;
  accentLight: string;
  accentDeep: string;
  onAccent: string;
  onInk: string;
  band: string;
  scrim: string;
  onBase: string;
  onSubtle: string;
  onHeader: string;
  onBand: string;
  onFooter: string;
  onScrim: string;
  hairline: string;
  headerBorder: string;
  menuLeader: string;
  dot: string;
  dotBackground: string;
  onSoft: string;
}

function rgb(hex: string): [number, number, number] {
  const value = hex.trim();
  const short = /^#([\da-f])([\da-f])([\da-f])$/i.exec(value);
  const full = short
    ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
    : value;
  if (!/^#[\da-f]{6}$/i.test(full)) {
    throw new Error(`Expected a #RGB or #RRGGBB color, received "${hex}".`);
  }
  return [
    Number.parseInt(full.slice(1, 3), 16),
    Number.parseInt(full.slice(3, 5), 16),
    Number.parseInt(full.slice(5, 7), 16),
  ];
}

function hex(channels: readonly number[]): string {
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function mix(first: string, second: string, amount: number): string {
  const a = rgb(first);
  const b = rgb(second);
  return hex(a.map((channel, index) => channel * (1 - amount) + b[index] * amount));
}

function luminance(color: string): number {
  const [red, green, blue] = rgb(color).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function alphaColor(color: string, opacity: number): string {
  return `rgba(${rgb(color).join(", ")}, ${opacity})`;
}

function composite(foreground: string, opacity: number, background: string): string {
  return mix(background, foreground, opacity);
}

function readableTint(background: string, ink: string): string {
  if (contrastRatio(background, ink) < 4.5) return ink;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 24; step += 1) {
    const middle = (low + high) / 2;
    if (contrastRatio(background, mix(background, ink, middle)) >= 4.5) high = middle;
    else low = middle;
  }
  return mix(background, ink, high);
}

/**
 * Derive Table & Flame's secondary roles from its three owner-approved
 * palette inputs. `terracotta` carries the current hand-tuned values for
 * pixel compatibility. Other palettes use fixed 5.5%/8%/18% tints; the muted
 * foreground is moved only as far toward ink as needed for 4.5:1 over the
 * worst-case 12% ink dot. Accent text and all foreground roles pass through
 * readableOn. Hero scrims are derived from ink so light palettes never put
 * dark text over photos.
 */
export function deriveWebsitePaletteRoles(palette: WebsiteTemplatePalette): ResolvedWebsitePalette {
  const dotBackground = mix(palette.base, palette.ink, 0.12);
  const dot = alphaColor(palette.ink, 0.12);

  if (palette.id === "terracotta") {
    const subtle = "#f1e9dd";
    const muted = readableOn(palette.base, ["#6b5d52", palette.ink]);
    const border = "#e6dccd";
    const accentDeep = readableOn(palette.base, ["#7c2d12", palette.ink]);
    const onAccent = readableOn(palette.accent, ["#090909", "#faf6ef"]);
    const onInk = readableOn(palette.ink, ["#ffffff", palette.base, "#090909"]);
    const band = "#23211f";
    const scrim = "#23211f";
    const onBase = readableOn(palette.base, [palette.ink, accentDeep, "#090909", "#faf6ef"]);
    const onHeader = readableOn(palette.base, ["#22201c", "#ffffff"]);
    const onBand = readableOn(band, [palette.base, palette.ink, "#faf6ef", "#090909"]);
    const onFooter = readableOn(band, ["#22201c", "#ffffff"]);
    const worstScrim = composite(scrim, 0.68, "#ffffff");
    const onScrim = readableOn(worstScrim, [palette.base, palette.ink, "#faf6ef", "#090909"]);
    return {
      ...palette,
      subtle,
      muted,
      border,
      accentLight: "#fbe9e3",
      accentDeep,
      onAccent,
      onInk,
      band,
      scrim,
      onBase,
      onSubtle: readableOn(subtle, [palette.ink, palette.base, "#090909", "#ffffff"]),
      onHeader,
      onBand,
      onFooter,
      onScrim,
      hairline: "#3a3632",
      headerBorder: "rgba(34, 32, 28, 0.12)",
      menuLeader: "#9b8d7d",
      dot,
      dotBackground,
      onSoft: readableOn(palette.soft ?? subtle, [palette.ink, palette.base, "#090909", "#ffffff"]),
    };
  }

  const subtle = mix(palette.base, palette.ink, 0.055);
  const border = mix(palette.base, palette.ink, 0.18);
  const accentLight = mix(palette.base, palette.accent, 0.1);
  const mutedCandidate = readableTint(dotBackground, palette.ink);
  const muted = readableOn(dotBackground, [mutedCandidate, palette.ink]);
  const accentDeep = readableOn(palette.base, [palette.accent, mix(palette.accent, palette.ink, 0.55), palette.ink]);
  const onAccent = readableOn(palette.accent, [palette.ink, palette.base, "#faf6ef", "#090909"]);
  const onInk = readableOn(palette.ink, ["#ffffff", palette.base, "#090909"]);
  const darkBase = luminance(palette.base) < 0.2;
  const band = darkBase
    ? mix(palette.base, palette.ink, 0.18)
    : mix(palette.ink, "#000000", 0.08);
  const scrim = mix(palette.ink, "#000000", luminance(palette.ink) > 0.35 ? 0.82 : 0.12);
  const onBase = readableOn(palette.base, [palette.ink, accentDeep, "#faf6ef", "#090909"]);
  const onHeader = readableOn(palette.base, ["#22201c", "#ffffff"]);
  const onBand = readableOn(band, [palette.ink, palette.base, "#faf6ef", "#090909"]);
  const onFooter = readableOn(band, [palette.ink, palette.base, "#22201c", "#ffffff"]);
  const worstScrim = composite(scrim, 0.68, "#ffffff");
  const onScrim = readableOn(worstScrim, [palette.ink, palette.base, "#faf6ef", "#090909"]);
  const soft = palette.soft ?? subtle;
  return {
    ...palette,
    subtle,
    muted,
    border,
    accentLight,
    accentDeep,
    onAccent,
    onInk,
    band,
    scrim,
    onBase,
    onSubtle: readableOn(subtle, [palette.ink, palette.base, "#faf6ef", "#090909"]),
    onHeader,
    onBand,
    onFooter,
    onScrim,
    hairline: mix(band, palette.base, 0.55),
    headerBorder: alphaColor(palette.ink, 0.12),
    menuLeader: mix(palette.base, palette.ink, 0.4),
    dot,
    dotBackground,
    onSoft: readableOn(soft, [palette.ink, palette.base, "#090909", "#ffffff"]),
  };
}
