/**
 * Editorially curated Hero campaigns — intentionally NOT algorithmic.
 *
 * The Hero is the magazine cover of the Fundraisers experience: chosen by a
 * human to represent the brand (people, community, hope, impact), never
 * ranked by "most raised" or "trending". Discovery/ranking lives in Featured
 * Campaigns and search, not here.
 *
 * Ordered best-first — index 0 becomes the primary (largest) photo.
 *
 * Curation rules:
 *   • Diverse causes, positive community moments — families, education,
 *     charity, community projects, animals, small business.
 *   • Medical only when balanced/hopeful (recovery), never acute-crisis imagery.
 *   • A slug whose campaign has no usable image is skipped at fetch time, so
 *     on-brand entries can stay listed and light up automatically once real
 *     imagery is added — the Hero simply shows fewer photos meanwhile.
 *
 * Phase 2 will move this selection into the CMS (admin-chosen Hero campaigns /
 * images, kept separate from Featured Campaigns). Phase 3 adds rotating,
 * editorially-controlled themed collections. Until then, edit this list.
 */
export const CURATED_HERO_FUNDRAISER_SLUGS: readonly string[] = [
  // Renders today, on-brand (ordered best-first; index 0 = primary/largest):
  "donate-to-supporting-miracle-amiris-recovery-and-rebuilding-organized-by-destiny-keith", // family · recovery · hope
  "medical", // family · warmth · hope — sunny outdoor family portrait
  "marea-blanca-2", // community solidarity — event poster (kept per earlier call); banner re-hosted to Supabase storage (was a 403-ing img.evbuc.com URL)
  // Listed but not currently rendering — kept so they light up automatically
  // once a real, optimizer-friendly image exists (each is dropped at fetch time
  // meanwhile, so none of these produce a broken frame or error):
  "we-can-do-it", // community empowerment — `banner` is a video file, not an image
  "community-schools", // education — no image yet
  "help-the-tiny-toadlets-cross-the-road-this-summer", // animals — no image yet
  "where-event-organizers-grow", // small business · community — no image yet
];
