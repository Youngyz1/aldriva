/**
 * lib/invitation-music-links.ts
 *
 * External music links for invitation pages (Spotify / SoundCloud).
 * Pure module (no I/O): safe to import from
 * builder UI, server actions, Zod schema validation, and the hermetic
 * test suite.
 *
 * Security posture:
 * - HTTPS only; hostnames matched exactly against an allowlist (bare host
 *   only — no substring matching, no user-controlled subdomains).
 * - Never renders user-supplied iframe HTML. Embed URLs are constructed
 *   from validated identifiers using each provider's documented format.
 * - `javascript:`, `data:`, and all non-allowlisted destinations rejected.
 */

export type MusicLinkProvider = "spotify" | "soundcloud";

export interface MusicLinkItem {
  provider: MusicLinkProvider;
  /** The host-pasted canonical URL (kept for display/editing). */
  url: string;
  /** Provider-documented embed URL, built from validated identifiers. */
  embedUrl: string;
  /** Tall player variant (collections) vs compact (single tracks). */
  tall: boolean;
  /** Optional host label (max 80 chars). */
  label?: string | null;
}

export type MusicLinkErrorCode =
  | "empty"
  | "malformed"
  | "not_https"
  | "unsupported_provider"
  | "unsupported_format"
  | "soundcloud_short_link";

export type MusicLinkResult =
  | { ok: true; item: MusicLinkItem }
  | { ok: false; error: MusicLinkErrorCode };

export const MAX_MUSIC_LINKS = 3;
export const MUSIC_LINK_LABEL_MAX = 80;

/** Exact-match HTTPS hosts. `www.` is never accepted implicitly. */
const SPOTIFY_HOSTS = new Set(["open.spotify.com", "embed.spotify.com"]);
const SOUNDCLOUD_HOSTS = new Set(["soundcloud.com", "m.soundcloud.com", "on.soundcloud.com"]);

const SPOTIFY_ID = /^[A-Za-z0-9]+$/;
const SPOTIFY_TYPES = new Set(["track", "album", "playlist", "episode", "show"]);
/** Regional share prefix, e.g. /intl-de/track/… — stripped, never trusted. */
const SPOTIFY_INTL_PREFIX = /^intl-[a-z]{2}([-_][a-z0-9]+)?$/i;

/** soundcloud.com app routes that are never playable tracks. */
const SOUNDCLOUD_APP_ROUTES = new Set([
  "you",
  "stream",
  "upload",
  "settings",
  "messages",
  "notifications",
  "search",
  "charts",
  "pages",
  "jobs",
  "imprint",
  "terms-of-use",
  "privacy",
  "cookies",
  "community-guidelines",
  "logout",
  "activate",
  "forgot",
  "login",
  "signup",
  "discover",
]);

export const MUSIC_PROVIDER_NAMES: Record<MusicLinkProvider, string> = {
  spotify: "Spotify",
  soundcloud: "SoundCloud",
};

/** iframe permissions per provider (documented embed requirements only). */
export const MUSIC_EMBED_ALLOW: Record<MusicLinkProvider, string> = {
  spotify: "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture",
  soundcloud: "autoplay; encrypted-media",
};

/** Restrictive sandbox compatible with each provider's documented embed. */
export const MUSIC_EMBED_SANDBOX: Record<MusicLinkProvider, string> = {
  spotify: "allow-scripts allow-same-origin",
  soundcloud: "allow-scripts allow-same-origin allow-presentation",
};

/** Player heights by provider/content (compact track vs collection). */
export function musicEmbedHeight(provider: MusicLinkProvider, tall: boolean): number {
  if (provider === "spotify") return tall ? 352 : 152;
  return 166;
}

function spotifyFromUrl(url: URL): MusicLinkResult {
  // /[{intl}]/{type}/{id}[?...], /embed/[{intl}]/{type}/{id}, or legacy
  // /user/{user}/playlist/{id} — all normalize to the canonical embed.
  let parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "embed") parts = parts.slice(1);
  if (parts[0] !== undefined && SPOTIFY_INTL_PREFIX.test(parts[0])) parts = parts.slice(1);
  let type = parts[0];
  let id = parts[1];
  if (type === "user" && parts[2] === "playlist") {
    type = "playlist";
    id = parts[3];
  }
  if (!type || !id || !SPOTIFY_TYPES.has(type) || !SPOTIFY_ID.test(id)) {
    return { ok: false, error: "unsupported_format" };
  }
  const tall = type !== "track" && type !== "episode";
  return {
    ok: true,
    item: {
      provider: "spotify",
      url: url.toString(),
      embedUrl: `https://open.spotify.com/embed/${type}/${id}`,
      tall,
    },
  };
}

function soundcloudFromUrl(url: URL): MusicLinkResult {
  const host = url.hostname.toLowerCase();
  if (host === "on.soundcloud.com") {
    // The Widget API does not reliably resolve on.soundcloud.com short URLs.
    // Ask the builder for the canonical soundcloud.com link instead of saving
    // an embed which renders a 404 and can never emit READY or PLAY.
    return { ok: false, error: "soundcloud_short_link" };
  }
  const canonicalHost = host === "m.soundcloud.com" ? "soundcloud.com" : host;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2 || SOUNDCLOUD_APP_ROUTES.has(parts[0].toLowerCase())) {
    return { ok: false, error: "unsupported_format" };
  }
  const canonical = `https://${canonicalHost}/${parts.join("/")}`;
  return {
    ok: true,
    item: {
      provider: "soundcloud",
      url: url.toString(),
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(canonical)}`,
      tall: false,
    },
  };
}

/**
 * Detects the provider and builds a safe embed for a host-pasted URL.
 * Never throws; returns a machine-readable error for UI messaging.
 */
export function validateMusicLink(raw: unknown): MusicLinkResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "empty" };
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "malformed" };
  }
  if (url.protocol !== "https:") return { ok: false, error: "not_https" };
  const host = url.hostname.toLowerCase();
  if (SPOTIFY_HOSTS.has(host)) return spotifyFromUrl(url);
  if (SOUNDCLOUD_HOSTS.has(host)) return soundcloudFromUrl(url);
  return { ok: false, error: "unsupported_provider" };
}

/**
 * Filters persisted provider entries against the currently supported set.
 * This keeps legacy Apple Music/Audiomack JSONB values safe to read without
 * requiring a data migration. URLs are revalidated and embed URLs rebuilt.
 */
export function filterSupportedMusicLinks(raw: unknown): {
  links: MusicLinkItem[];
  removedUnsupportedProviders: boolean;
} {
  const links: MusicLinkItem[] = [];
  let removedUnsupportedProviders = false;
  if (!Array.isArray(raw)) return { links, removedUnsupportedProviders };

  for (const candidate of raw) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    if (record.provider === "apple" || record.provider === "audiomack") {
      removedUnsupportedProviders = true;
      continue;
    }
    if (record.provider !== "spotify" && record.provider !== "soundcloud") continue;
    const checked = validateMusicLink(record.url);
    if (!checked.ok || checked.item.provider !== record.provider) continue;
    links.push({
      ...checked.item,
      label: typeof record.label === "string" ? record.label.slice(0, MUSIC_LINK_LABEL_MAX) : null,
    });
  }
  return { links: links.slice(0, MAX_MUSIC_LINKS), removedUnsupportedProviders };
}

/** Display name for a validated item (host label wins, else provider + kind). */
export function musicLinkDisplayName(item: MusicLinkItem): string {
  if (item.label && item.label.trim().length > 0) return item.label.trim();
  return MUSIC_PROVIDER_NAMES[item.provider];
}

/**
 * Derives the Spotify resource URI (spotify:track:…) from a validated
 * embed URL for the iFrame API controller. Null when unparseable — the
 * pill then falls back to opening the provider link externally.
 */
export function spotifyUriFromEmbed(embedUrl: string): string | null {
  if (typeof embedUrl !== "string") return null;
  const match = /open\.spotify\.com\/embed\/(track|album|playlist|episode|show)\/([A-Za-z0-9]+)/.exec(
    embedUrl
  );
  if (!match) return null;
  return `spotify:${match[1]}:${match[2]}`;
}
