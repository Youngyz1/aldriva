/**
 * lib/__tests__/minimalism-dark-blue-background.test.cjs
 *
 * Source-level guard for the floral page backdrop
 * (components/invitation/templates/minimalism-dark-blue/MinimalismDarkBluePageTemplate.tsx).
 *
 * The backdrop now uses background-floral-tall.jpg (1200 x 3538) which is the
 * floral image stacked with a vertically mirrored copy, so repeat-y tiles it
 * with no seam across the FULL page height — behind every section down to the
 * bottom of the RSVP. The old first-screen fade-out approach is gone.
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
const TALL_IMAGE = path.join(
  ROOT,
  "public/images/invitations/minimalism-dark-blue/background-floral-tall.jpg"
);

function withoutComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function backdropBlock() {
  const start = source.indexOf("data-minimalism-backdrop");
  assert.notEqual(start, -1, "the template renders a data-minimalism-backdrop layer");
  const end = source.indexOf("/>", start);
  assert.notEqual(end, -1, "the backdrop layer is a self-closing element");
  return source.slice(start, end + 2);
}

describe("MinimalismDarkBluePageTemplate — floral page backdrop", () => {
  test("references only the tall floral image and no retired texture assets", () => {
    const code = withoutComments(source);
    assert.match(code, /background-floral-tall\.jpg/, "the page references background-floral-tall.jpg");
    assert.doesNotMatch(code, /background-floral\.jpg/, "the legacy background-floral.jpg must not be referenced");
    assert.doesNotMatch(code, /paper-texture/, "paper-texture.svg must not be referenced");
    assert.doesNotMatch(code, /castle-watermark/, "castle-watermark.svg must not be referenced");
    assert.ok(fs.existsSync(TALL_IMAGE), "background-floral-tall.jpg exists in public/");
  });

  test("applies the backdrop inside the template root, not on document.body or <html>", () => {
    const block = backdropBlock();

    assert.match(block, /absolute/, "backdrop is an absolute layer inside the root");
    assert.match(block, /inset-0/, "backdrop spans the full root height");
    assert.doesNotMatch(block, /document\./, "the backdrop layer never touches document.*");

    const code = withoutComments(source);
    const bodyUses = code.match(/document\.body/g) ?? [];
    assert.equal(bodyUses.length, 1, "document.body appears only in the scroll-lock fallback");
    assert.match(code, /\?\?\s*document\.body\b/, "the single body reference is the scroll-lock fallback");
    assert.doesNotMatch(code, /document\.documentElement/, "document.documentElement is never touched");
    assert.doesNotMatch(
      code,
      /document\.body\.style\.(?:background|backgroundColor|backgroundImage|backgroundAttachment)/,
      "no background is written to document.body.style"
    );
  });

  test("avoids background-attachment: fixed and viewport/screen height units", () => {
    const code = withoutComments(source);
    assert.doesNotMatch(code, /background-attachment\s*:\s*fixed/i, "no background-attachment CSS declaration");
    assert.doesNotMatch(code, /backgroundAttachment\s*:\s*["']fixed["']/i, "no backgroundAttachment: fixed inline style");
    assert.doesNotMatch(code, /100vh|100dvh|h-screen/, "no viewport/screen height units (layer must grow with content)");
  });

  test("backdrop repeats vertically with no fixed height and a uniform cream overlay", () => {
    const block = backdropBlock();

    assert.match(block, /backgroundSize:\s*["']auto,\s*100% auto["']/, "full width, natural height");
    assert.match(block, /backgroundRepeat:\s*["']no-repeat,\s*repeat-y["']/, "vertical tiling with no seam");
    assert.match(block, /backgroundPosition:\s*["']center,\s*top center["']/, "top-centered");
    assert.match(block, /linear-gradient\(\$\{PAGE_FLORAL_OVERLAY\},\s*\$\{PAGE_FLORAL_OVERLAY\}\)/, "uniform cream overlay");
    assert.match(block, /backgroundColor:\s*CREAM/, "plain cream sits behind the image while it loads");
    assert.doesNotMatch(block, /aspectRatio|minHeight|maxHeight/, "no fixed/max height (layer grows with content)");
  });

  test("the backdrop is declared behind the page sections", () => {
    const backdropIndex = source.indexOf("data-minimalism-backdrop");
    const heroIndex = source.indexOf("<MinimalismHero");
    assert.ok(backdropIndex > 0 && heroIndex > backdropIndex, "backdrop is declared before the hero section");
  });
});
