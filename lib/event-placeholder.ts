/**
 * Deterministic color-block / gradient placeholder for events that have no
 * usable uploaded image (missing or broken). The same seed always yields the
 * same colors — no per-render or per-page-load randomness — so a given event
 * looks stable across visits.
 *
 * Colors are drawn from a Aldriva-flavored palette (orange/green anchored,
 * plus supporting brand-adjacent hues). For head-to-head / "versus" style
 * titles ("A vs B", "A at B") the block is split into two tones — the same
 * *concept* SeatGeek uses for matchups, but with our own category color system
 * rather than any team logos or flags.
 */

export type EventPlaceholder = {
  /** CSS `background` value to apply to the placeholder block. */
  background: string;
  /** Two-tone split for versus/matchup titles, else null. */
  split: { left: string; right: string } | null;
};

// Each entry is a [from, to] gradient pair. Orange and green lead (brand),
// the rest keep categories visually distinct without leaving the palette.
const PALETTE: readonly (readonly [string, string])[] = [
  ["#f97316", "#ea580c"], // orange (brand)
  ["#16a34a", "#15803d"], // green (brand)
  ["#f59e0b", "#d97706"], // amber
  ["#0d9488", "#0f766e"], // teal
  ["#e11d48", "#be123c"], // rose
  ["#7c3aed", "#6d28d9"], // violet
  ["#2563eb", "#1d4ed8"], // blue
  ["#db2777", "#be185d"], // pink
  ["#0891b2", "#0e7490"], // cyan
  ["#65a30d", "#4d7c0f"], // lime
];

/** Stable FNV-1a hash so the same seed maps to the same palette entry. */
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pairFor(seed: string): readonly [string, string] {
  const normalized = seed.toLowerCase().trim() || "event";
  return PALETTE[hashSeed(normalized) % PALETTE.length];
}

// "Team A vs Team B", "A vs. B", "A versus B", "A v B", "A at B", "A @ B".
const VERSUS_SPLIT = /\s+(?:vs\.?|versus|v\.?|@|at)\s+/i;

export function getEventPlaceholder(input: {
  title?: string | null;
  category?: string | null;
  organizer?: string | null;
}): EventPlaceholder {
  const title = (input.title ?? "").trim();

  // Split-color treatment for matchup-style titles.
  const parts = title.split(VERSUS_SPLIT);
  if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
    const left = pairFor(parts[0])[0];
    let right = pairFor(parts[1])[0];
    // Nudge the right side if both halves collide, so the split stays visible.
    if (right === left) right = pairFor(parts[1] + " ")[0];
    return {
      background: `linear-gradient(105deg, ${left} 0%, ${left} 48%, ${right} 52%, ${right} 100%)`,
      split: { left, right },
    };
  }

  // Single-tone: seed from category first (so a whole category reads
  // consistently), then organizer, then the title.
  const seed = input.category || input.organizer || title || "event";
  const [from, to] = pairFor(seed);
  return { background: `linear-gradient(135deg, ${from}, ${to})`, split: null };
}
