import "server-only";
/**
 * lib/invitation-cover-art.ts
 *
 * Cover card hero fetch for the card.png OG route — Round 5, step 3.
 *
 * The hero MUST come from the published snapshot (guests never see draft
 * edits). The fetch is hostile-input hardened: allowlisted storage hosts
 * only, one same-host redirect hop max, image/* content-type required,
 * 5 MB response cap, 3 s timeout. ANY failure returns null and the route
 * renders the solid palette fallback identically to the no-image case.
 */

import {
  COVER_HERO_FETCH_TIMEOUT_MS,
  COVER_HERO_MAX_BYTES,
  isAllowedCoverHeroUrl,
} from "@/lib/memories/cover-art-policy";

/**
 * Fetches hero bytes for OG embedding. Returns a data URI, or null when
 * anything is off (timeout, status, type, size, host). Never throws.
 */
export async function fetchCoverHeroDataUri(heroUrl: string): Promise<string | null> {
  try {
    if (!isAllowedCoverHeroUrl(heroUrl)) return null;

    let current = heroUrl;
    let response: Response | null = null;
    const timeoutSignal = AbortSignal.timeout(COVER_HERO_FETCH_TIMEOUT_MS);
    // One same-host redirect hop max (Supabase signed-URL rotation, etc.).
    for (let hop = 0; hop < 2; hop++) {
      const res = await fetch(current, {
        signal: timeoutSignal,
        redirect: "manual",
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return null;
        const currentUrl = new URL(current);
        const nextUrl = new URL(location, currentUrl);
        if (nextUrl.host !== currentUrl.host || !isAllowedCoverHeroUrl(nextUrl.toString())) return null;
        current = nextUrl.toString();
        continue;
      }
      response = res;
      break;
    }
    if (!response || !response.ok || !response.body) return null;

    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("image/")) return null;

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > COVER_HERO_MAX_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // Best effort — the oversize response is already rejected.
        }
        return null;
      }
      chunks.push(value);
    }
    if (total === 0) return null;

    const base64 = Buffer.from(bytesConcat(chunks, total)).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

function bytesConcat(chunks: Uint8Array[], total: number): Uint8Array {
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
