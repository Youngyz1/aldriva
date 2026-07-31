import { unwrapKnownImageProxy } from "@/lib/image-url";

export type MediaKind = "image" | "direct-video-file" | "video-embed" | "unknown";

const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|avif|svg)(\?|#|$)/i;
const VIDEO_EXTENSIONS = /\.(mp4|mov|webm|ogv|ogg|avi|m4v)(\?|#|$)/i;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

export type EmbedInfo = { provider: "youtube" | "vimeo"; id: string; thumbnail: string };

export function extractEmbedInfo(url: URL): EmbedInfo | null {
  if (YOUTUBE_HOSTS.has(url.hostname)) {
    const pathParts = url.pathname.split("/").filter(Boolean);
    const id =
      url.hostname === "youtu.be"
        ? pathParts[0]
        : url.searchParams.get("v") ||
          (["embed", "shorts", "live"].includes(pathParts[0]) ? pathParts[1] : "");
    if (!id) return null;
    return { provider: "youtube", id, thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg` };
  }

  if (VIMEO_HOSTS.has(url.hostname)) {
    const match = url.pathname.match(/(?:video\/)?(\d+)/);
    if (!match) return null;
    // Vimeo thumbnails require an oEmbed call; resolved server-side, see route below.
    return { provider: "vimeo", id: match[1], thumbnail: "" };
  }

  return null;
}

export function classifyUrl(raw: string): { kind: MediaKind; url: URL | null; embed: EmbedInfo | null } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { kind: "unknown", url: null, embed: null };
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return { kind: "unknown", url, embed: null };
  }

  const unwrapped = unwrapKnownImageProxy(url);
  if (unwrapped) {
    try {
      url = new URL(unwrapped);
    } catch {
      return { kind: "unknown", url, embed: null };
    }
  }

  const embed = extractEmbedInfo(url);
  if (embed) return { kind: "video-embed", url, embed };

  const mediaPath = `${url.pathname}${url.search}${url.hash}`;
  if (VIDEO_EXTENSIONS.test(mediaPath)) return { kind: "direct-video-file", url, embed: null };
  if (IMAGE_EXTENSIONS.test(mediaPath)) return { kind: "image", url, embed: null };

  return { kind: "unknown", url, embed: null };
}
