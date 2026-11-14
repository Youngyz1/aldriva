/**
 * lib/__tests__/minimalism-dark-blue-stage4e.test.cjs
 *
 * Source-level guard for Stage 4e:
 * - RSVP card has no solid white fill (translucent cream only).
 * - Guestbook wishes list has a max-height + overflow-y auto, no viewport units.
 * - Gallery centre slide uses the larger (large) width.
 * - Banned patterns remain absent.
 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "../..");
const TEMPLATE_PATH = path.join(ROOT, "components/invitation/templates/minimalism-dark-blue/MinimalismDarkBluePageTemplate.tsx");
const GALLERY_PATH = path.join(ROOT, "components/invitation/blocks/BohoCoverflowGallery.tsx");
const templateSource = fs.readFileSync(TEMPLATE_PATH, "utf8");
const gallerySource = fs.readFileSync(GALLERY_PATH, "utf8");

function withoutComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("MinimalismDarkBluePageTemplate - Stage 4e", () => {
  test("RSVP card has no solid white fill", () => {
    const code = withoutComments(templateSource);
    // The RSVP card line must not contain bg-white.
    const rsvpIdx = code.indexOf("minimalismRsvpHeading");
    assert.ok(rsvpIdx > 0);
    const rsvpBlock = code.slice(rsvpIdx, rsvpIdx + 400);
    assert.doesNotMatch(rsvpBlock, /bg-white/, "RSVP card must not have solid white fill");
    assert.match(rsvpBlock, /rgba\(239, 236, 229/, "RSVP card uses translucent cream");
  });

  test("guestbook wishes list has a max-height and overflow-y auto with no viewport units", () => {
    const code = withoutComments(templateSource);
    assert.match(code, /max-h-\[13rem\]/, "wishes list has a max-height in rem");
    assert.match(code, /overflow-y-auto/, "wishes list scrolls internally");
    assert.match(code, /overscroll-contain/, "wishes list contains overscroll");
    const wishesLine = code.split("\n").find((l) => l.includes("max-h-[13rem]"));
    assert.ok(wishesLine, "wishes list line present");
    assert.doesNotMatch(wishesLine, /vh|dvh/, "wishes list uses no viewport units");
  });

  test("guestbook form is typeable in preview/demo", () => {
    const code = withoutComments(templateSource);
    assert.match(code, /disabled=\{hasAction \|\| mode === "shared"\}/, "inputs enabled in preview/demo");
    assert.match(code, /minimalismGuestbookPreviewNote/, "preview note present");
  });

  test("gallery uses the larger slide size for minimalism", () => {
    const code = withoutComments(templateSource);
    assert.match(code, /slideSize="large"/, "minimalism passes slideSize large");
    const gcode = withoutComments(gallerySource);
    assert.match(gcode, /slideSize \?\?\s*"default"|slideSize = "default"/, "slideSize prop exists with default");
    assert.match(gcode, /h-\[300px\] w-\[260px\]/, "large slide is ~260px wide at base");
  });

  test("banned patterns are still absent", () => {
    const code = withoutComments(templateSource + "\n" + gallerySource);
    assert.doesNotMatch(code, /paper-texture/, "no paper-texture");
    assert.doesNotMatch(code, /castle-watermark/, "no castle-watermark");
    assert.doesNotMatch(code, /background-attachment\s*:\s*fixed/i, "no fixed attachment");
    assert.doesNotMatch(code, /100vh|100dvh|h-screen/, "no 100vh/100dvh/h-screen");
    assert.doesNotMatch(code, /document\.documentElement/, "no documentElement");
    const bodyUses = code.match(/document\.body/g) ?? [];
    // template file has the one scroll-lock fallback; gallery has none
    assert.ok(bodyUses.length <= 1, "document.body only in scroll-lock fallback");
  });
});
