import { cacheLife } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

// Cleans a raw `events.city` value into a display-ready label:
//  - drops pure "STATE ZIP" junk rows (e.g. "FL 32081" — a zip code with no
//    real city name attached, not fixable, so excluded rather than guessed at)
//  - strips a trailing standalone postal-code fragment some rows carry
//    (e.g. "Jacqueville, District des Lagunes 11124" -> "..., District des Lagunes")
//  - normalizes casing (title case), while preserving short all-caps segments
//    (state/region codes like "NJ", "CI") as-is
export function normalizeCityLabel(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (/^[A-Z]{2}\s?\d{4,6}$/.test(trimmed)) return null;

  const withoutTrailingZip = trimmed.replace(/\s+\d{4,6}$/, "");
  const titleCaseSegment = (segment: string) =>
    segment
      .trim()
      .split(" ")
      .map((word) =>
        word.length <= 3 && word === word.toUpperCase()
          ? word
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join(" ");

  return withoutTrailingZip
    .split(",")
    .map(titleCaseSegment)
    .join(", ");
}

// Distinct, cleaned + deduped (case-insensitive) cities with real, approved
// public events — powers the Location autocomplete's suggestion list and city
// route slug resolution (lib/resolve-city-slug.ts).
export async function getCachedEventCities(): Promise<string[]> {
  "use cache";
  cacheLife({ revalidate: 600 });

  const adminClient = createSupabaseAdmin();
  const { data } = await adminClient
    .from("events")
    .select("city")
    .eq("visibility", "public")
    .eq("status", "approved")
    .not("city", "is", null);

  const seen = new Map<string, string>(); // lowercase key -> display label
  for (const row of data ?? []) {
    if (!row.city) continue;
    const label = normalizeCityLabel(row.city);
    if (!label) continue;
    const key = label.toLowerCase();
    if (!seen.has(key)) seen.set(key, label);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}
