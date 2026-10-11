/**
 * lib/__tests__/expandable-qr.test.cjs
 *
 * Expandable QR overlay (admission passes + Memories QR).
 *
 * - Static pins: shared Radix Dialog shell (focus trap, Escape,
 *   backdrop-close, scroll-lock, focus restoration via defaults),
 *   solid-white high-contrast panel, quiet-zone margin, large SVG
 *   size, same-value re-render through the existing `qrcode` lib,
 *   reduced-motion class, brightness hint, accessible trigger + dialog
 *   names, no token generation, no payload mutation.
 * - Integration pins: CardQRCode, all five invitation templates,
 *   Memories QrPanel, and find-tickets route through the shared
 *   component; the door scanner consumes QRs unchanged.
 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");

function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const COMPONENT = "components/cards/ExpandableQr.tsx";

describe("shared component shape", () => {
  test("built on the shared Radix Dialog (no bespoke modal)", () => {
    const s = src(COMPONENT);
    assert.ok(s.includes('from "@/components/ui/dialog"'), "shared dialog primitives");
    assert.ok(s.includes("DialogTrigger") && s.includes("asChild"), "trigger wraps existing QR");
    assert.ok(s.includes("DialogContent") && s.includes("DialogTitle") && s.includes("DialogDescription"), "named dialog parts");
  });

  test("dialog behavior inherited from Radix defaults (no overrides that break it)", () => {
    const s = src(COMPONENT);
    assert.ok(!s.includes("onEscapeKeyDown") && !s.includes("onPointerDownOutside"), "Escape + backdrop close intact");
    assert.ok(!s.includes("modal={false}"), "modal stays modal (scroll lock + focus trap)");
  });

  test("white high-contrast panel with quiet-zone margin and large size", () => {
    const s = src(COMPONENT);
    assert.ok(s.includes("bg-white"), "solid white panel");
    assert.ok(s.includes("EXPANDABLE_QR_MARGIN = 2"), "quiet zone never zero");
    assert.ok(s.includes("EXPANDABLE_QR_LARGE_SIZE = 512"), "enlarged render size");
    assert.ok(s.includes("margin: EXPANDABLE_QR_MARGIN"), "margin threaded to renderer");
  });

  test("same payload rendered as responsive inline SVG; no modal canvas or image request", () => {
    const s = src(COMPONENT);
    assert.ok(s.includes('import("qrcode")'), "existing library reused (lazy, bundle-safe)");
    assert.ok(s.includes('type: "svg"'), "vector render, not canvas");
    assert.ok(s.includes("dangerouslySetInnerHTML"), "svg injected as markup");
    const modalRender = s.slice(s.indexOf("export function ExpandableSvgQr"), s.indexOf("export async function downloadQrPng"));
    assert.ok(!modalRender.includes("toCanvas") && !modalRender.includes("<canvas"), "dialog renderer has no canvas paint timing");
    assert.ok(!modalRender.includes("<img") && !modalRender.includes("largeSrc"), "modal renderer has no img-src dependency");
    assert.ok(s.includes('style="display:block;width:100%;height:auto"'), "SVG scales within the responsive panel");
    assert.ok(!s.includes("randomUUID(") && !s.includes("randomBytes("), "nothing minted on open");
    assert.ok(!/require\(["'](node:)?crypto["']\)/.test(s), "no crypto source for new secrets");
  });

  test("accessible trigger + dialog names, keyboard support, reduced motion", () => {
    const s = src(COMPONENT);
    assert.ok(s.includes("<button") && s.includes('type="button"'), "native keyboard-operable trigger");
    assert.ok(s.includes("aria-label={openLabel}"), "trigger named");
    assert.ok(s.includes("focus-visible:ring-2"), "visible focus ring");
    assert.ok(s.includes("motion-reduce:animate-none"), "reduced motion honored");
    assert.ok(s.includes("cursor-zoom-in"), "affordance hint");
  });

  test("brightness hint threaded (no system-brightness control attempted)", () => {
    const s = src(COMPONENT);
    assert.ok(s.includes("{hint}"), "hint rendered in dialog");
    assert.ok(!s.includes("brightness(") && !s.includes("screen.brightness") && !s.includes("wakeLock"), "no device control APIs");
  });

  test("dialog QR itself closes the overlay on tap", () => {
    const s = src(COMPONENT);
    assert.ok(s.includes("DialogClose asChild"), "large QR is a close target");
    assert.ok(s.includes("cursor-zoom-out"), "close-on-tap affordance");
  });
});

describe("admission integrations route through the shared component", () => {
  test("CardQRCode (ticket-confirmation + invitation cards) keeps payload, colors, download", () => {
    const s = src("components/cards/DigitalCardPrimitives.tsx");
    assert.ok(s.includes("ExpandableSvgQr"), "shared component used");
    assert.ok(s.includes("value={verifyUrl}"), "identical verify-URL payload");
    assert.ok(s.includes('dark="#09090b"'), "original colors preserved");
    assert.ok(s.includes("downloadQrPng(verifyUrl"), "PNG download via off-screen helper");
    assert.ok(s.includes("downloadQR") && s.includes("copyPassUrl"), "save/copy actions kept");
  });

  test("all five invitation templates forward the original payload to inline SVG", () => {
    for (const [file, dark] of [
      ["components/invitation/templates/InvitationTemplate1.tsx", "#1C1A18"],
      ["components/invitation/templates/InvitationTemplateBlackTie.tsx", "#09090b"],
      ["components/invitation/templates/InvitationTemplateWedding.tsx", "#2C2220"],
      ["components/invitation/templates/InvitationTemplateBirthday.tsx", "#141218"],
      ["components/invitation/templates/InvitationTemplateCover.tsx", null],
    ]) {
      const s = src(file);
      assert.ok(s.includes("ExpandableSvgQr"), `${file} uses shared component`);
      assert.ok(s.includes("value={data.ticketInstance.qrCode}"), `${file} raw payload unchanged`);
      if (dark) assert.ok(s.includes(`dark="${dark}"`), `${file} original ink preserved`);
      assert.ok(s.includes("dict.qrTapToEnlarge") && s.includes("dict.qrBrightnessHint"), `${file} localized labels`);
    }
  });

  test("BlackTie QR no longer depends on the remote QR image endpoint", () => {
    const s = src("components/invitation/templates/InvitationTemplateBlackTie.tsx");
    assert.ok(s.includes("ExpandableSvgQr"), "same shared inline-SVG renderer");
    assert.ok(s.includes("value={data.ticketInstance.qrCode}"), "exact original QR payload");
    assert.ok(!s.includes("api.qrserver.com"), "no third-party QR source to block");
  });

  test("find-tickets reuses its verify URL and keeps PNG download", () => {
    const s = src("app/find-tickets/page.tsx");
    assert.ok(s.includes("ExpandableSvgQr"), "shared component used");
    assert.ok(s.includes("value={verifyUrl}"), "identical payload");
    assert.ok(s.includes("downloadQrPng(verifyUrl"), "PNG download via off-screen helper");
    assert.ok(s.includes("downloadQR"), "download action kept");
  });

  test("declined/invalid guards still gate the QR (no misleading placeholder)", () => {
    assert.ok(
      src("components/invitation/templates/InvitationTemplateCover.tsx").includes("currentRsvp !== \"declined\""),
      "Cover still hides declined passes"
    );
    assert.ok(
      src("components/cards/DigitalCardPrimitives.tsx").includes("Pass Invalid"),
      "invalid overlay kept"
    );
  });
});

describe("Memories QR integration", () => {
  test("organizer QrPanel enlarges the identical upload URL", () => {
    const s = src("app/dashboard/events/[id]/memories/MemoriesClient.tsx");
    assert.ok(s.includes("ExpandableSvgQr"), "shared component used");
    assert.ok(s.includes("value={url}"), "identical upload URL payload");
    assert.ok(s.includes("triggerSize={160}"), "original footprint kept");
  });

  test("Memories destination and permissions untouched", () => {
    const s = src("app/dashboard/events/[id]/memories/MemoriesClient.tsx");
    const panelBody = s.slice(s.indexOf("function QrPanel"), s.indexOf("export default function MemoriesClient"));
    assert.ok(!panelBody.includes("generateMemoryToken") && !panelBody.includes("regenerateMemoryToken"), "no token minted on enlarge");
    assert.ok(s.includes("Copy link"), "share affordance kept");
  });
});

describe("scanner consumption unchanged", () => {
  test("verify-ticket still short-circuits memory codes before any check-in", () => {
    const s = src("app/api/verify-ticket/route.ts");
    assert.ok(s.includes("isMemoryQrScan(code)"), "memory guard kept");
    assert.ok(s.includes('status: "memory_code"'), "machine status kept");
  });

  test("door scanner has no overlay logic (presentation never touches validation)", () => {
    const s = src("app/dashboard/events/[id]/scan/ScannerClient.tsx");
    assert.ok(!s.includes("Expandable"), "scanner untouched");
    assert.ok(!s.includes("Dialog"), "no dialog in scanner");
  });

  test("QR payload formats untouched: raw 32-hex on invitations, verify URLs on cards", () => {
    assert.ok(
      src("components/cards/DigitalCardPrimitives.tsx").includes("`${window.location.origin}/verify/${qrCode}`"),
      "card verify-URL payload kept"
    );
    assert.ok(
      src("components/invitation/templates/InvitationTemplate1.tsx").includes("value={data.ticketInstance.qrCode}"),
      "template raw-code payload kept"
    );
  });
});

describe("QR i18n parity", () => {
  test("dictionary carries QR keys in both locales, translated", () => {
    const { getInvitationDictionary } = require("../invitation-i18n.ts");
    for (const k of ["qrTapToEnlarge", "qrBrightnessHint"]) {
      const en = getInvitationDictionary("en")[k];
      const fr = getInvitationDictionary("fr")[k];
      assert.ok(typeof en === "string" && en.length > 0, `en ${k}`);
      assert.ok(typeof fr === "string" && fr.length > 0, `fr ${k}`);
      assert.notEqual(fr, en, `${k} translated`);
    }
  });
});

describe("enlarged SVG structure (same lib, node-rendered)", () => {
  const QRCode = require("qrcode");

  test("svg carries explicit size, white module background, dark data path, crisp edges", async () => {
    const svg = await QRCode.toString("TEST-QR-PAYLOAD-0123456789ABCDEF", {
      type: "svg",
      width: 512,
      margin: 2,
      color: { dark: "#09090b", light: "#ffffff" },
    });
    assert.ok(svg.includes("<svg"), "svg root");
    assert.ok(svg.includes('width="512"') && svg.includes('height="512"'), "explicit intrinsic size");
    assert.ok(svg.includes('fill="#ffffff"'), "white background rect (quiet zone + contrast)");
    assert.ok(svg.includes('stroke="#09090b"'), "dark data modules");
    assert.ok(svg.includes("crispEdges"), "sharp edges, no blur");
    assert.ok((svg.match(/<path/g) || []).length >= 2, "background + data paths present");
  });

  test("download helper renders PNG off-screen (no trigger-canvas readback)", () => {
    const s = src(COMPONENT);
    assert.ok(s.includes("export async function downloadQrPng"), "helper exported");
    assert.ok(s.includes('document.createElement("canvas")'), "off-screen render at click time");
    assert.ok(s.includes('toDataURL("image/png")'), "PNG output kept");
  });
  test("svg string and centered responsive panel reserve enough room", () => {
    const s = src(COMPONENT);
    assert.ok(s.includes("width: largeSize"), "large render size threaded");
    assert.ok(s.includes("mx-auto w-full max-w-[512px]"), "panel supports a scan-sized QR");
    assert.ok(s.includes("max-w-[36rem]"), "dialog expands while remaining viewport constrained");
    assert.ok(!s.includes("mx-auto w-fit"), "no shrink-to-fit wrapper that collapses to zero");
  });

  test("loading placeholder has an explicit size (never an empty box)", () => {
    const s = src(COMPONENT);
    assert.ok(s.includes("width: triggerSize"), "trigger preserves its original footprint");
    assert.ok(s.includes("width: 240, height: 240"), "dialog placeholder reserves space");
  });

  test("enlarged render keeps the white panel, margin, and large size", () => {
    const s = src(COMPONENT);
    assert.ok(s.includes("bg-white"), "high-contrast panel kept");
    assert.ok(s.includes("margin: EXPANDABLE_QR_MARGIN"), "quiet zone kept");
    assert.ok(s.includes("width: largeSize"), "large render size kept");
  });
});
