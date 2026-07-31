import { NextRequest, NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { classifyUrl } from "@/lib/media-detect";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import {
  DEFAULT_IMAGE_TYPES,
  DEFAULT_VIDEO_TYPES,
  uploadPublicFile,
} from "@/lib/uploads";

export const runtime = "nodejs";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/*,video/*,*/*;q=0.8",
};

const IMPORT_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const IMPORT_VIDEO_MAX_BYTES = 200 * 1024 * 1024;
const MAX_REDIRECTS = 5;

const VIDEO_IMPORT_TYPES = [
  ...DEFAULT_VIDEO_TYPES,
  "video/x-msvideo",
  "video/x-m4v",
] as const;

type ImportedMediaKind = "image" | "direct-video-file";

function jsonError(reason: string, status: number) {
  return NextResponse.json({ ok: false, reason }, { status });
}

function extensionForContentType(contentType: string) {
  const extension = contentType.split("/")[1]?.replace("jpeg", "jpg");
  return extension?.replace(/[^a-z0-9.+-]/gi, "") || "bin";
}

function maxBytesForKind(kind: ImportedMediaKind) {
  return kind === "direct-video-file" ? IMPORT_VIDEO_MAX_BYTES : IMPORT_IMAGE_MAX_BYTES;
}

function kindFromContentType(contentType: string): ImportedMediaKind | null {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "direct-video-file";
  return null;
}

function parseIpv4(address: string) {
  const parts = address.split(".");
  if (parts.length !== 4) return null;

  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null;
  }

  return ((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3];
}

function isPrivateIpv4(address: string) {
  const value = parseIpv4(address);
  if (value === null) return true;

  return (
    value >>> 24 === 10 ||
    value >>> 24 === 127 ||
    value >>> 24 === 0 ||
    value >>> 24 >= 224 ||
    value >>> 16 === 0xa9fe ||
    value >>> 16 === 0xc0a8 ||
    value >>> 20 === 0xac1
  );
}

function expandIpv6(address: string) {
  const withoutZone = address.split("%")[0].toLowerCase();
  const ipv4Match = withoutZone.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/);
  const ipv4 = ipv4Match ? parseIpv4(ipv4Match[1]) : null;
  const normalized = ipv4Match
    ? withoutZone.replace(ipv4Match[1], `${((ipv4 ?? 0) >>> 16).toString(16)}:${((ipv4 ?? 0) & 0xffff).toString(16)}`)
    : withoutZone;
  const [head, tail = ""] = normalized.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missing = 8 - headParts.length - tailParts.length;

  if (normalized.includes("::") && missing < 0) return null;
  if (!normalized.includes("::") && headParts.length !== 8) return null;

  const parts = [
    ...headParts,
    ...Array(Math.max(missing, 0)).fill("0"),
    ...tailParts,
  ];

  if (parts.length !== 8) return null;

  return parts.map((part) => Number.parseInt(part || "0", 16));
}

function isPrivateIpv6(address: string) {
  const parts = expandIpv6(address);
  if (!parts || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 0xffff)) {
    return true;
  }

  const isLoopback = parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1;
  const isUnspecified = parts.every((part) => part === 0);
  const isUniqueLocal = (parts[0] & 0xfe00) === 0xfc00;
  const isLinkLocal = (parts[0] & 0xffc0) === 0xfe80;
  const isMulticast = (parts[0] & 0xff00) === 0xff00;
  const isIpv4Mapped = parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff;

  if (isIpv4Mapped) {
    return isPrivateIpv4(`${parts[6] >>> 8}.${parts[6] & 255}.${parts[7] >>> 8}.${parts[7] & 255}`);
  }

  return isLoopback || isUnspecified || isUniqueLocal || isLinkLocal || isMulticast;
}

function isPrivateAddress(address: string) {
  const ipVersion = isIP(address);
  if (ipVersion === 4) return isPrivateIpv4(address);
  if (ipVersion === 6) return isPrivateIpv6(address);
  return true;
}

function hostnameForLookup(hostname: string) {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

async function assertPublicUrl(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https URLs can be imported.");
  }

  const hostname = hostnameForLookup(url.hostname);

  if (isIP(hostname) && isPrivateAddress(hostname)) {
    throw new Error("Private, internal, or loopback URLs cannot be imported.");
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Private, internal, or loopback URLs cannot be imported.");
  }
}

async function fetchWithSafeRedirects(url: URL, headers: HeadersInit) {
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicUrl(currentUrl);

    const response = await fetch(currentUrl, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      return response;
    }

    currentUrl = new URL(location, currentUrl);
  }

  throw new Error("Too many redirects while importing media.");
}

async function fetchWithRefererRetry(url: URL) {
  const firstResponse = await fetchWithSafeRedirects(url, FETCH_HEADERS);

  if (firstResponse.status !== 403) {
    return firstResponse;
  }

  return fetchWithSafeRedirects(url, {
    ...FETCH_HEADERS,
    Referer: `${url.origin}/`,
  });
}

async function resolveVimeoThumbnail(id: string) {
  const response = await fetch(
    `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${id}`)}`,
    {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    }
  );

  if (!response.ok) return null;

  const data = (await response.json()) as { thumbnail_url?: string };
  return data.thumbnail_url ?? null;
}

async function uploadFetchedMedia({
  sourceUrl,
  forcedKind,
}: {
  sourceUrl: URL;
  forcedKind?: ImportedMediaKind;
}) {
  const response = await fetchWithRefererRetry(sourceUrl);

  if (!response.ok) {
    throw new Error(`Source returned ${response.status}. It may be blocking automated requests.`);
  }

  const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const detectedKind = kindFromContentType(contentType);
  const kind = forcedKind ?? detectedKind;

  if (!contentType || !detectedKind || !kind) {
    throw new Error(`Unexpected content type: ${contentType || "unknown"}`);
  }

  if (forcedKind && forcedKind !== detectedKind) {
    throw new Error(`Expected ${forcedKind === "image" ? "an image" : "a video"} but received ${contentType}.`);
  }

  const contentLength = Number(response.headers.get("content-length") || "0");
  const maxBytes = maxBytesForKind(kind);
  if (contentLength > maxBytes) {
    throw new Error(`File exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const file = new File([arrayBuffer], `imported.${extensionForContentType(contentType)}`, {
    type: contentType,
  });

  const uploaded = await uploadPublicFile({
    supabase: createSupabaseAdmin(),
    bucket: kind === "direct-video-file" ? "event-videos" : "event-banners",
    file,
    folder: "imported",
    kind: kind === "direct-video-file" ? "video" : "image",
    maxBytes,
    allowedTypes: kind === "direct-video-file" ? VIDEO_IMPORT_TYPES : DEFAULT_IMAGE_TYPES,
  });

  return {
    kind,
    uploaded,
  };
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("Authentication required.", 401);
  }

  let rawUrl: unknown;

  try {
    ({ url: rawUrl } = (await req.json()) as { url?: unknown });
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return jsonError("No URL provided.", 400);
  }

  const classified = classifyUrl(rawUrl);

  if (!classified.url || !["http:", "https:"].includes(classified.url.protocol)) {
    return jsonError("Only http and https URLs can be imported.", 400);
  }

  try {
    if (classified.kind === "video-embed" && classified.embed) {
      const thumbnailUrl =
        classified.embed.provider === "vimeo"
          ? await resolveVimeoThumbnail(classified.embed.id)
          : classified.embed.thumbnail;

      if (!thumbnailUrl) {
        return jsonError("Could not resolve a thumbnail for that video.", 400);
      }

      const thumbnail = new URL(thumbnailUrl);
      const { uploaded } = await uploadFetchedMedia({
        sourceUrl: thumbnail,
        forcedKind: "image",
      });

      return NextResponse.json({
        ok: true,
        kind: "video-embed",
        provider: classified.embed.provider,
        embedId: classified.embed.id,
        url: uploaded.publicUrl,
        thumbnail: uploaded.publicUrl,
        originalUrl: rawUrl,
        sourceUrl: classified.url.toString(),
      });
    }

    const { kind, uploaded } = await uploadFetchedMedia({
      sourceUrl: classified.url,
      forcedKind:
        classified.kind === "image" || classified.kind === "direct-video-file"
          ? classified.kind
          : undefined,
    });

    return NextResponse.json({
      ok: true,
      kind,
      url: uploaded.publicUrl,
      originalUrl: rawUrl,
      sourceUrl: classified.url.toString(),
      contentType: uploaded.contentType,
      size: uploaded.size,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Could not import that media URL.";
    return jsonError(reason, 502);
  }
}
