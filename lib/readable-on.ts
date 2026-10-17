/**
 * WCAG contrast helpers for public-site foreground colors.
 * Colors must be concrete #RGB or #RRGGBB values. Resolve CSS tokens before
 * calling these functions.
 */

function parseHexColor(color: string): [number, number, number] {
  const value = color.trim();
  const short = /^#([\da-f])([\da-f])([\da-f])$/i.exec(value);
  const full = short
    ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
    : value;

  if (!/^#[\da-f]{6}$/i.test(full)) {
    throw new Error(`Expected a #RGB or #RRGGBB color, received "${color}".`);
  }

  return [
    Number.parseInt(full.slice(1, 3), 16),
    Number.parseInt(full.slice(3, 5), 16),
    Number.parseInt(full.slice(5, 7), 16),
  ];
}

function linearize(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: string): number {
  const [red, green, blue] = parseHexColor(color).map(linearize);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(background: string, foreground: string): number {
  const first = relativeLuminance(background);
  const second = relativeLuminance(foreground);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Return the first AA-readable candidate, or the candidate with most contrast. */
export function readableOn(background: string, candidates: readonly string[]): string {
  if (candidates.length === 0) {
    throw new Error("readableOn requires at least one foreground candidate.");
  }

  let best = candidates[0];
  let bestRatio = contrastRatio(background, best);

  for (const candidate of candidates) {
    const ratio = contrastRatio(background, candidate);
    if (ratio >= 4.5) return candidate;
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
  }

  return best;
}
