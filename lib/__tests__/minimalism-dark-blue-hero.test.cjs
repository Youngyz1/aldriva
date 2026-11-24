/**
 * lib/__tests__/minimalism-dark-blue-hero.test.cjs
 *
 * Source-level guard for the Stage 5a/5b hero.
 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "../..");
const HERO_PATH = path.join(ROOT, "components/invitation/templates/minimalism-dark-blue/MinimalismHero.tsx");
const COLLAGE_PATH = path.join(ROOT, "components/invitation/templates/minimalism-dark-blue/HeroCollage.tsx");
const TEMPLATE_PATH = path.join(ROOT, "components/invitation/templates/minimalism-dark-blue/MinimalismDarkBluePageTemplate.tsx");
const heroSource = fs.readFileSync(HERO_PATH, "utf8");
const collageSource = fs.readFileSync(COLLAGE_PATH, "utf8");
const templateSource = fs.readFileSync(TEMPLATE_PATH, "utf8");
const combined = heroSource + "\n" + collageSource;

function withoutComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("MinimalismDarkBluePageTemplate - Stage 5 hero", () => {
  test("hero uses motion and react-wrap-balancer", () => {
    const code = withoutComments(heroSource);
    assert.match(code, /from\s+["']motion\/react["']/, "hero imports motion");
    assert.match(code, /from\s+["']react-wrap-balancer["']/, "hero imports Balancer");
    assert.match(code, /<Balancer>/, "title/description use Balancer");
  });

  test("hero has no CTAs, links, Button or Cta imports", () => {
    const code = withoutComments(combined);
    assert.doesNotMatch(code, /<a\b/, "no <a> element in the hero");
    assert.doesNotMatch(code, /\bhref\b/, "no href in the hero");
    assert.doesNotMatch(code, /\bButton\b/, "no Button in the hero");
    assert.doesNotMatch(code, /\bCta\b/, "no Cta in the hero");
    assert.doesNotMatch(code, /components\/ui/, "no components/ui import in the hero");
  });

  test("hero removes the washImage layer", () => {
    const code = withoutComments(combined);
    assert.doesNotMatch(code, /washImage/, "no washImage reference");
  });

  test("hero uses next/image and navy palette", () => {
    const code = withoutComments(combined);
    assert.match(code, /from\s+["']next\/image["']/, "hero uses next/image");
    assert.match(code, /#00214a/, "hero uses navy #00214a");
  });

  test("hero respects reduced motion and never stays hidden", () => {
    const code = withoutComments(heroSource);
    assert.match(code, /useReducedMotion/, "hero respects reduced motion");
    assert.match(code, /initial=\{animate \? "hidden" : false\}/, "initial hidden only when animating");
    assert.match(code, /animate=\{animate \? "visible" : false\}/, "animates on mount");
    assert.doesNotMatch(code, /whileInView/, "no whileInView (could leave content hidden)");
  });

  test("template uses the new hero and dropped the envelope markup", () => {
    const code = withoutComments(templateSource);
    assert.match(code, /MinimalismHero/, "template renders MinimalismHero");
    assert.doesNotMatch(code, /envelope\.svg/, "old envelope hero markup removed");
    assert.doesNotMatch(code, /wax-seal\.svg/, "old wax seal removed from hero");
  });

  test("collage has one big photo and one smaller photo on top", () => {
    const code = withoutComments(collageSource);
    assert.match(code, /w-\[78%\]/, "big photo is ~78% of the container");
    assert.match(code, /aspect-\[4\/5\]/, "big photo is 4/5 portrait");
    assert.match(code, /rounded-2xl/, "big photo is rounded-2xl");
    assert.match(code, /w-\[44%\]/, "small photo is ~44% of the container");
    assert.match(code, /aspect-\[3\/4\]/, "small photo is 3/4");
    assert.match(code, /rounded-xl/, "small photo is rounded-xl");
    assert.match(code, /z-10/, "small photo sits on top (z-10)");
    assert.match(code, /rotate-3|rotate\(3deg\)/, "small photo rotated ~3deg");
    assert.match(code, /absolute bottom-0 right-0/, "small photo anchored bottom-right, overlapping");
  });

  test("collage handles the single-photo and no-photo cases", () => {
    const code = withoutComments(collageSource);
    assert.match(code, /return null;/, "no photos renders nothing");
    assert.match(code, /if \(hasPrimary && !hasSecondary\)/, "single photo fallback branch");
  });

  test("images use next/image with sizes and priority on the big photo", () => {
    const code = withoutComments(collageSource);
    assert.match(code, /sizes="\(max-width: 640px\) 80vw, 420px"/, "big photo has responsive sizes");
    assert.match(code, /priority/, "big photo is priority");
  });

  test("banned patterns remain absent", () => {
    const code = withoutComments(combined + "\n" + templateSource);
    assert.doesNotMatch(code, /paper-texture/, "paper-texture.svg must not be referenced");
    assert.doesNotMatch(code, /castle-watermark/, "castle-watermark.svg must not be referenced");
    assert.doesNotMatch(code, /background-attachment\s*:\s*fixed/i, "no fixed attachment");
    assert.doesNotMatch(code, /100vh|100dvh|h-screen/, "no viewport/screen height units");
    assert.doesNotMatch(code, /document\.documentElement/, "document.documentElement never touched");
  });
});
