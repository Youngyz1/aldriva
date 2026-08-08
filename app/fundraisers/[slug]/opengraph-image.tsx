import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { getFundraiserCardData } from "@/lib/fundraiser-data";
import { getFundraisingProgressColor } from "@/lib/fundraising-progress";
import { safeImageSrc } from "@/lib/image-url";
import { money } from "@/lib/format";
import { getSiteUrl } from "@/lib/site-url";
import { truncateWords } from "@/lib/text";

// Node.js runtime (not edge) so we can read the local font/logo files below.
export const runtime = "nodejs";
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
  const buffer = await readFile(join(process.cwd(), "assets", "og-logo.png"));
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function resolveCardPhoto(url?: string | null): Promise<string | null> {
  const safe = safeImageSrc(url);
  if (!safe) return null;

  try {
    const proxyUrl = `${getSiteUrl()}/_next/image?url=${encodeURIComponent(safe)}&w=640&q=75`;
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
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
  const progressColor = getFundraisingProgressColor(card.percentage);

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
                    stroke={progressColor}
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
