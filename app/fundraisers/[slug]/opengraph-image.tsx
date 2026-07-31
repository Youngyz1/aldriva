import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import {
  FUNDRAISER_FALLBACK_IMAGE,
  getFundraiserCardData,
} from "@/lib/fundraiser-data";
import { money } from "@/lib/format";
import { getSiteUrl } from "@/lib/site-url";
import { truncateWords } from "@/lib/text";

// Node.js runtime (not edge) so we can read the local font/logo files below.
export const runtime = "nodejs";
// Time-based revalidation — a donation total a few minutes stale on a social
// card is unnoticeable, and this avoids wiring cache invalidation through the
// Stripe/crypto webhooks for v1.
export const revalidate = 300;

export const alt = "Aldriva fundraiser campaign card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BRAND = {
  backdrop: "#062A22",
  card: "#FFFFFF",
  ink: "#0B0F0E",
  muted: "#6B7280",
  emerald: "#059669",
  emeraldSoft: "#ECFDF5",
  track: "#E5E7EB",
};

async function readFontFile(filename: string) {
  return readFile(join(process.cwd(), "assets", "fonts", filename));
}

async function readLogoDataUri() {
  // Pre-resized to the card's actual display height (see assets/og-logo.png
  // vs. the multi-hundred-KB public/logo.png shared with the rest of the
  // site) — this file gets read on every request regardless of which
  // fundraiser is being rendered, so it's optimized once ahead of time
  // rather than resized per-request like the campaign photo below.
  const buffer = await readFile(join(process.cwd(), "assets", "og-logo.png"));
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

/**
 * Fetches a remote image already downsized to the card's actual rendered
 * width via Next's own built-in image optimizer (/_next/image) and inlines
 * it as a data URI so Satori always has real bytes to render. Routed
 * through /_next/image rather than calling sharp directly in this file (or
 * even in a separate route): sharp's native module (libvips) and next/og's
 * own native rasterizer (resvg) cannot coexist in the same running Node
 * process — once sharp has been loaded anywhere in-process, ImageResponse
 * crashes the worker at runtime with a native colourspace error, even when
 * they're only ever invoked from completely separate requests/routes.
 * Next's own image optimizer already uses sharp internally but is
 * engineered by the framework to coexist safely with everything else
 * Next does, including next/og, so this sidesteps the conflict entirely.
 * Without downsizing, ImageResponse rasterizes the whole card losslessly
 * as PNG regardless of source format, so an unresized original photo
 * (often several MB straight off a phone) bloats the final file far past
 * WhatsApp's stricter size/timeout budget even though Facebook's own
 * debugger tolerates it. There's no onError DOM event in a server-rendered
 * image, so a missing/broken/unprocessable campaign photo falls back to
 * the same stock placeholder FundraiserMediaSlider.tsx uses, resolved the
 * same way.
 */
async function resolveCardPhoto(url: string): Promise<string | null> {
  for (const candidate of [url, FUNDRAISER_FALLBACK_IMAGE]) {
    try {
      const proxyUrl = `${getSiteUrl()}/_next/image?url=${encodeURIComponent(candidate)}&w=640&q=75`;
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const contentType = res.headers.get("content-type") || "image/jpeg";
      const buffer = Buffer.from(await res.arrayBuffer());
      return `data:${contentType};base64,${buffer.toString("base64")}`;
    } catch {
      continue;
    }
  }
  return null;
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [card, logo, fontRegular, fontBold] = await Promise.all([
    getFundraiserCardData(slug),
    readLogoDataUri(),
    readFontFile("PlusJakartaSans-Regular.woff"),
    readFontFile("PlusJakartaSans-Bold.woff"),
  ]);

  const fonts = [
    { name: "Plus Jakarta Sans", data: fontRegular, weight: 400 as const, style: "normal" as const },
    { name: "Plus Jakarta Sans", data: fontBold, weight: 700 as const, style: "normal" as const },
  ];

  const outerStyle = {
    display: "flex" as const,
    width: "100%",
    height: "100%",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    background: BRAND.backdrop,
    fontFamily: "Plus Jakarta Sans",
  };

  // Fundraiser not found (deleted/unpublished slug) — a minimal branded
  // fallback rather than a broken image or a 500 on a shared link.
  if (!card) {
    return new ImageResponse(
      (
        <div style={outerStyle}>
          <img src={logo} height={64} style={{ objectFit: "contain" }} />
        </div>
      ),
      { ...size, fonts }
    );
  }

  const photo = await resolveCardPhoto(card.coverImage);
  const title = truncateWords(card.title, 70);
  const organizerLabel = truncateWords(card.organizerName, 40);
  const raisedLabel = money(card.raised);
  const goalLabel = money(card.goal);

  return new ImageResponse(
    (
      <div style={outerStyle}>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            width: 1104,
            height: 542,
            borderRadius: 28,
            overflow: "hidden",
            background: BRAND.card,
          }}
        >
          <div style={{ display: "flex", width: 460, height: "100%", position: "relative" }}>
            {photo ? (
              <img
                src={photo}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  width: "100%",
                  height: "100%",
                  background: BRAND.emeraldSoft,
                }}
              />
            )}

            {/* Circular progress ring overlapping bottom-left corner of photo */}
            <div
              style={{
                position: "absolute",
                bottom: 24,
                left: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#FFFFFF",
                borderRadius: 999,
                padding: 8,
                border: "1px solid #E5E7EB",
              }}
            >
              <div style={{ display: "flex", position: "relative", alignItems: "center", justifyContent: "center" }}>
                <svg
                  width="90"
                  height="90"
                  viewBox="0 0 90 90"
                  style={{ transform: "rotate(-90deg)", display: "flex" }}
                >
                  <circle cx="45" cy="45" r="40" fill="none" stroke="#E5E7EB" strokeWidth="6" />
                  <circle
                    cx="45" cy="45" r="40"
                    fill="none"
                    stroke="#22C55E"
                    strokeWidth="6"
                    strokeDasharray={String(2 * Math.PI * 40)}
                    strokeDashoffset={String(2 * Math.PI * 40 - (Math.min(card.percentage, 100) / 100) * 2 * Math.PI * 40)}
                    strokeLinecap="round"
                  />
                </svg>
                <div
                  style={{
                    position: "absolute",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    top: 0, left: 0, right: 0, bottom: 0,
                    fontSize: 20,
                    fontWeight: 700,
                    color: "#0B0F0E",
                  }}
                >
                  {card.percentage}%
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 36,
              flex: 1,
              padding: "40px 48px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  fontSize: 40,
                  fontWeight: 700,
                  color: BRAND.ink,
                  lineHeight: 1.2,
                }}
              >
                {title}
              </div>
              <div style={{ display: "flex", fontSize: 21, color: BRAND.muted }}>
                Organised by {organizerLabel}
              </div>
            </div>

            {/* Pill badge + goal label — matching FundraiserShare desktop stats row */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  display: "flex",
                  background: BRAND.emerald,
                  color: "#FFFFFF",
                  padding: "8px 18px",
                  borderRadius: 999,
                  fontSize: 22,
                  fontWeight: 700,
                }}
              >
                {raisedLabel} raised
              </div>
              <div style={{ display: "flex", fontSize: 22, color: BRAND.muted }}>
                of {goalLabel} goal
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
