/**
 * lib/__tests__/minimalism-dark-blue-content-width.test.cjs
 *
 * Source-level guard for the shared content-width rule
 * (components/invitation/templates/minimalism-dark-blue/MinimalismDarkBluePageTemplate.tsx).
 *
 * Every section card/container uses one constant (CONTENT_WIDTH) taken from the
 * guestbook card, so no section keeps its own narrower/wider max width. The
 * banned patterns from the background guard remain absent.
 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "../..");
const TEMPLATE_PATH = path.join(
  ROOT,
  "components/invitation/templates/minimalism-dark-blue/MinimalismDarkBluePageTemplate.tsx"
);
const source = fs.readFileSync(TEMPLATE_PATH, "utf8");

function withoutComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("MinimalismDarkBluePageTemplate — shared content width", () => {
  test("defines a single shared width constant taken from the guestbook card", () => {
    const code = withoutComments(source);
    assert.match(code, /const CONTENT_WIDTH = "mx-auto w-full max-w-sm";/, "one shared width constant exists");
  });

  test("uses the shared width in every section listed in stage 4c item 2", () => {
    const code = withoutComments(source);
    // Constant definition + at least one usage per listed section.
    const usages = (code.match(/CONTENT_WIDTH/g) || []).length;
    assert.ok(usages >= 9, `CONTENT_WIDTH must be used by all sections (found ${usages})`);
    // Ceremony, reception, programme, venue (map + itinerary + fallback), dress code,
    // gallery heading, guestbook, RSVP.
    assert.match(code, /inv-details[\s\S]*?\$\{CONTENT_WIDTH\}/, "ceremony card uses shared width");
    assert.match(code, /inv-reception[\s\S]*?\$\{CONTENT_WIDTH\}/, "reception block uses shared width");
    assert.match(code, /minimalismVenueHeading[\s\S]*?\$\{CONTENT_WIDTH\}/, "venue/map uses shared width");
    assert.match(code, /minimalismDressCodeHeading[\s\S]*?\$\{CONTENT_WIDTH\}/, "dress code uses shared width");
    assert.match(code, /minimalismProgramHeading[\s\S]*?\$\{CONTENT_WIDTH\}/, "programme uses shared width");
    assert.match(code, /minimalismGalleryHeading[\s\S]*?\$\{CONTENT_WIDTH\}/, "gallery uses shared width");
    assert.match(code, /minimalismGuestbookHeading[\s\S]*?\$\{CONTENT_WIDTH\}/, "guestbook uses shared width");
    assert.match(code, /minimalismRsvpHeading[\s\S]*?\$\{CONTENT_WIDTH\}/, "RSVP uses shared width");
  });

  test("no section keeps its own narrower or wider max width", () => {
    const code = withoutComments(source);
    assert.doesNotMatch(code, /w-\[62%\]/, "ceremony's 62% width is gone");
    assert.doesNotMatch(code, /w-\[85%\]/, "reception/programme 85% width is gone");
    assert.doesNotMatch(code, /min-w-\[220px\]/, "ceremony min-width is gone");
    assert.doesNotMatch(code, /max-w-md/, "per-section max-w-md is gone");
  });

  test("RSVP card shows floral through (no solid white fill) with a thin border (stage 4e)", () => {
    const code = withoutComments(source);
    const rsvpBlock = code.slice(code.indexOf("minimalismRsvpHeading"), code.indexOf("minimalismRsvpHeading") + 600);
    assert.doesNotMatch(rsvpBlock, /bg-white/, "RSVP card must not have solid white fill");
    assert.match(rsvpBlock, /rgba\(239, 236, 229/, "RSVP card uses translucent cream");
    assert.match(code, /minimalismRsvpHeading[\s\S]*?rounded-xl/, "RSVP card is rounded-xl");
  });

  test("banned patterns from the background guard are still absent", () => {
    const code = withoutComments(source);
    assert.match(code, /background-floral-tall\.jpg/, "tall floral image referenced");
    assert.doesNotMatch(code, /background-floral\.jpg/, "legacy floral image not referenced");
    assert.doesNotMatch(code, /paper-texture/, "paper-texture.svg must not be referenced");
    assert.doesNotMatch(code, /castle-watermark/, "castle-watermark.svg must not be referenced");
    assert.doesNotMatch(code, /background-attachment\s*:\s*fixed/i, "no fixed attachment");
    assert.doesNotMatch(code, /backgroundAttachment\s*:\s*["']fixed["']/i, "no fixed attachment inline");
    const bodyUses = code.match(/document\.body/g) ?? [];
    assert.equal(bodyUses.length, 1, "document.body only in scroll-lock fallback");
    assert.match(code, /\?\?\s*document\.body\b/, "single body ref is the scroll-lock fallback");
    assert.doesNotMatch(code, /document\.documentElement/, "document.documentElement never touched");
    assert.doesNotMatch(code, /100vh|100dvh|h-screen/, "no viewport/screen height units");
  });
});
