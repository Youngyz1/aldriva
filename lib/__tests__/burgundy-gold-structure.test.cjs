/**
 * lib/__tests__/burgundy-gold-structure.test.cjs
 *
 * Stage 2C: reference-layout structure for Burgundy Gold.
 *   - all artwork is imported from burgundy-gold-art (one swappable module)
 *   - the hero is a full-viewport opening that shows FIRST names only
 *   - the ceremony panel has no fill, gold side rules, a top divider, corners
 *   - the backdrop is mottled burgundy with a vignette and no pinstripes
 *   - venue labels: Ceremony 18:00 / Reception 19:30, welcome only in reception info
 *   - the floating music control uses the burgundy music face
 */
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const TEMPLATE_DIR = path.join(ROOT, "components/invitation/templates/burgundy-gold");
const ART_PATH = path.join(TEMPLATE_DIR, "burgundy-gold-art.tsx");
const PAGE_PATH = path.join(TEMPLATE_DIR, "BurgundyGoldPageTemplate.tsx");
const SECTIONS_PATH = path.join(TEMPLATE_DIR, "BurgundyGoldSections.tsx");
const DATA_PATH = path.join(TEMPLATE_DIR, "burgundy-gold-data.ts");

const ORNAMENTS_PATH = path.join(TEMPLATE_DIR, "BurgundyGoldOrnaments.tsx");

const read = (file) => fs.readFileSync(file, "utf8");
const ART = read(ART_PATH);
const PAGE = read(PAGE_PATH);
const SECTIONS = read(SECTIONS_PATH);

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

if (!require.extensions[".ts"]) {
  require.extensions[".ts"] = function compileTs(module, filename) {
    const output = ts.transpileModule(read(filename), {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: filename,
    }).outputText;
    module._compile(output, filename);
  };
}

const data = require(DATA_PATH);
const samples = require(path.join(ROOT, "components/invitation/templates/invitation-sample-data.ts"));

function importSpecifiers(source) {
  const specifiers = [];
  const pattern = /from\s+"([^"]+)"/g;
  let match;
  while ((match = pattern.exec(source))) specifiers.push(match[1]);
  return specifiers;
}

const ART_PIECES = [
  "PageBackdrop",
  "TopFlourish",
  "PanelCorner",
  "SectionDivider",
  "GiftBoxArt",
  "MusicButtonFace",
];

describe("Burgundy Gold — artwork behind one module", () => {
  test("the artwork module exports the swappable pieces with a size/className contract", () => {
    const contract = /interface BurgundyArtProps \{([\s\S]*?)\}/.exec(ART);
    assert.ok(contract, "BurgundyArtProps is declared");
    assert.match(contract[1], /size\?/, "pieces accept a size");
    assert.match(contract[1], /className\?/, "pieces accept a className");

    for (const piece of ART_PIECES) {
      assert.match(ART, new RegExp(`export function ${piece}\\b`), `${piece} is exported from the artwork module`);
    }
    assert.match(ART, /export function HeartMark\b/, "the calendar heart also lives here");
  });

  test("page and sections import artwork only from burgundy-gold-art", () => {
    for (const [name, source] of [["page", PAGE], ["sections", SECTIONS]]) {
      const templateImports = importSpecifiers(source).filter((spec) => spec.includes("templates/burgundy-gold/"));
      for (const spec of templateImports) {
        assert.match(
          spec,
          /burgundy-gold\/(burgundy-gold-art|burgundy-gold-data|BurgundyGoldSections|BurgundyGoldPageTemplate)$/,
          `${name} must not import ${spec} — artwork lives in burgundy-gold-art`
        );
      }
      assert.doesNotMatch(source, /<svg\b/, `${name} draws no inline SVG artwork`);
    }

    assert.equal(fs.existsSync(ORNAMENTS_PATH), false, "the old ornaments module is gone");
    assert.doesNotMatch(PAGE, /BurgundyFlourish|BurgundyCornerOrnament|BurgundyDivider/);
    assert.match(PAGE, /import \{[\s\S]*PageBackdrop[\s\S]*\} from "@\/components\/invitation\/templates\/burgundy-gold\/burgundy-gold-art"/);
    assert.match(SECTIONS, /from "@\/components\/invitation\/templates\/burgundy-gold\/burgundy-gold-art"/);
  });
});

describe("Burgundy Gold — hero", () => {
  test("hero is a full-viewport opening with flourish, eyebrow and the names", () => {
    const start = PAGE.indexOf("data-burgundy-hero=");
    assert.notEqual(start, -1, "the page declares the hero");
    const end = PAGE.indexOf("</header>", start);
    assert.ok(end > start, "the hero closes");
    const hero = PAGE.slice(start, end);

    assert.match(hero, /min-h-\[100svh\]/, "the hero fills the viewport");
    assert.match(hero, /<TopFlourish\b/, "flourish at the top");
    assert.match(hero, /\{eyebrow\}/, "small-caps eyebrow");
    assert.match(hero, /data-burgundy-hero-names="true"/);
    assert.match(hero, /heroNames\.map/, "names are rendered from the hero helper");
    assert.match(hero, /data-burgundy-hero-name=/, "each name carries its own attribute");
    assert.doesNotMatch(hero, />\s*\{names\}\s*</, "the hero never prints the joined full names");
  });

  test("first names are derived from the partners, then the host names", () => {
    assert.deepEqual(data.burgundyHeroNames(samples.BURGUNDY_GOLD_SAMPLE_DATA), ["Modou", "Ndeye"]);
    assert.deepEqual(data.burgundyHeroNames(samples.BURGUNDY_GOLD_SAMPLE_DATA_FR), ["Modou", "Ndeye"]);
    assert.deepEqual(
      data.burgundyHeroNames({ partner1Name: "Awa Diop", partner2Name: "Cheikh Fall" }),
      ["Awa", "Cheikh"]
    );
    assert.deepEqual(
      data.burgundyHeroNames({ partner1Name: null, partner2Name: null, hostNames: "Awa Diop & Cheikh Fall" }),
      ["Awa", "Cheikh"],
      "falls back to host names when partners are unset"
    );
    assert.deepEqual(
      data.burgundyHeroNames({ partner1Name: null, partner2Name: null, hostNames: "Famille Ndiaye" }),
      ["Famille"],
      "a single host name is used as the only line"
    );
    assert.deepEqual(data.burgundyHeroNames({ partner1Name: "Solo Name" }), ["Solo"]);
    assert.deepEqual(data.burgundyHeroNames({}), []);
    assert.deepEqual(
      data.burgundyHeroNames({ partner1Name: "Awa Diop", partner2Name: null, hostNames: "Awa Diop & Cheikh Fall" }),
      ["Awa"],
      "one partner does not borrow the second host name"
    );
  });

  test("the full names stay in the ceremony panel", () => {
    assert.match(PAGE, /\{data\.partner1Name\?\.trim\(\) \|\| names\}/);
    assert.match(PAGE, /\{data\.partner2Name\}/);
  });
});

describe("Burgundy Gold — ceremony panel", () => {
  test("the panel has no fill and no inner frame", () => {
    assert.match(PAGE, /data-burgundy-panel-fill="none"/);
    assert.doesNotMatch(PAGE, /BURGUNDY_PANEL/, "no filled panel colour remains");
    const start = PAGE.indexOf("data-burgundy-panel=");
    const end = PAGE.indexOf("</section>", start);
    const panel = PAGE.slice(start, end);
    assert.doesNotMatch(panel, /backgroundColor: `\$\{BURGUNDY/, "the panel paints no background");
    assert.doesNotMatch(panel, /backgroundImage/, "the panel has no fill layer");
    assert.doesNotMatch(panel, /boxShadow/, "the panel has no inner frame shadow");
    assert.doesNotMatch(panel, /border:/, "the panel has no box border");
  });

  test("gold hairlines run down both sides with a top divider and both top corners", () => {
    const start = PAGE.indexOf("data-burgundy-panel=");
    const panel = PAGE.slice(start, PAGE.indexOf("</section>", start));
    assert.equal((panel.match(/inset-y-0 left-0 w-px/g) ?? []).length, 1, "left rule");
    assert.equal((panel.match(/inset-y-0 right-0 w-px/g) ?? []).length, 1, "right rule");
    assert.match(panel, /<SectionDivider size="100%"/, "divider across the top");
    assert.equal((panel.match(/<PanelCorner\b/g) ?? []).length, 2, "one corner per top side");
    assert.match(panel, /corner="top-left"/);
    assert.match(panel, /corner="top-right"/);
    assert.match(panel, /font-bold uppercase/, "bold serif caps heading");
    assert.match(panel, /var\(--font-burgundy-display\)/, "heading uses the serif display face");
  });

  test("parents sit in two plain columns with no vertical divider", () => {
    assert.doesNotMatch(PAGE, /"border-l pl-4 text-left sm:pl-5"/);
    assert.doesNotMatch(PAGE, /"border-r pr-4 text-right sm:pr-5"/);
    assert.match(PAGE, /grid-cols-2 gap-x-6 gap-y-4/);
    const start = PAGE.indexOf("function ParentColumn");
    const column = PAGE.slice(start, PAGE.indexOf("export function BurgundyGoldPageTemplate"));
    assert.doesNotMatch(column, /border-[lr]/, "no vertical rule between the columns");
  });
});

describe("Burgundy Gold — unfilled sections", () => {
  test("no section wrapper paints a solid panel fill", () => {
    assert.doesNotMatch(SECTIONS, /PANEL_STYLE/, "the filled panel style is gone");
    assert.doesNotMatch(SECTIONS, /BURGUNDY_PANEL/, "no panel colour remains");
    assert.doesNotMatch(SECTIONS, /boxShadow/, "no section draws a box shadow");
    // The only burgundy fills left are the two guestbook inputs (b3 alpha).
    const burgundyFills = SECTIONS.match(/backgroundColor: `\$\{BURGUNDY[A-Z_]*\}[0-9a-f]{2}`/gi) ?? [];
    assert.deepEqual(burgundyFills, [
      // gallery "+N" badge, painted over a photo tile
      "backgroundColor: `${BURGUNDY_DEEP}cc`",
      // guestbook name + message inputs
      "backgroundColor: `${BURGUNDY_DEEP}b3`",
      "backgroundColor: `${BURGUNDY_DEEP}b3`",
    ], "no section wrapper keeps a solid burgundy fill");
    assert.doesNotMatch(SECTIONS, /backgroundColor: `\$\{BURGUNDY[A-Z_]*\}[e-f][0-9a-f]`/i, "no near-opaque fill remains");

    const frame = SECTIONS.slice(SECTIONS.indexOf("function SectionFrame"), SECTIONS.indexOf("function SectionHeading"));
    assert.match(frame, /inset-y-0 left-0 w-px/, "left gold hairline");
    assert.match(frame, /inset-y-0 right-0 w-px/, "right gold hairline");
    assert.match(frame, /<SectionDivider size="100%"/, "divider across the top");
    assert.match(frame, /corners = false/, "corners are opt-in");
    assert.equal((SECTIONS.match(/<SectionFrame\b/g) ?? []).length, 4, "reception, programme, guestbook and gift use the frame");
    assert.equal((SECTIONS.match(/<SectionFrame corners>/g) ?? []).length, 1, "only the reception frame has corners");
  });

  test("panel corners appear only on the ceremony panel and the reception frame", () => {
    assert.equal((PAGE.match(/<PanelCorner\b/g) ?? []).length, 2, "two corners on the ceremony panel");
    const sectionsCorners = SECTIONS.match(/<PanelCorner\b/g) ?? [];
    assert.equal(sectionsCorners.length, 2, "two corners on the reception frame");
    const giftSection = SECTIONS.slice(SECTIONS.indexOf('data-burgundy-section="gift"'));
    assert.doesNotMatch(giftSection.slice(0, 900), /<PanelCorner\b/, "the gift section has no corners");
    // Both sections-side corners live inside the shared SectionFrame.
    const frameDef = SECTIONS.slice(SECTIONS.indexOf("function SectionFrame"), SECTIONS.indexOf("function SectionHeading"));
    assert.equal((frameDef.match(/<PanelCorner\b/g) ?? []).length, 2, "corners are drawn by the frame");
    assert.equal((SECTIONS.match(/<PanelCorner\b/g) ?? []).length, 2, "nowhere else in the sections");
  });

  test("guestbook inputs stay visible with a thin gold outline and subtle fill", () => {
    assert.equal((SECTIONS.match(/border: `1px solid \$\{GOLD\}4d`/g) ?? []).length, 2, "name and message inputs");
    assert.equal((SECTIONS.match(/backgroundColor: `\$\{BURGUNDY_DEEP\}b3`/g) ?? []).length, 2, "subtle input fill");
  });
});

describe("Burgundy Gold — backdrop", () => {
  test("mottled burgundy with a darker edge vignette and no pinstripes", () => {
    assert.doesNotMatch(ART, /repeating-linear-gradient/, "the pinstripes are removed");
    assert.doesNotMatch(PAGE, /repeating-linear-gradient/);

    const start = ART.indexOf("export function PageBackdrop");
    const backdrop = ART.slice(start, ART.indexOf("function FlourishMark"));
    const gradients = backdrop.match(/radial-gradient\([^`]*?\)/g) ?? [];
    assert.ok(gradients.length >= 5, "several radial layers make the mottling");
    assert.match(backdrop, /rgba\(12,3,6,0\) 34%/, "the vignette is transparent in the middle");
    assert.match(backdrop, /#120309 100%/, "the vignette darkens the edges");
    assert.match(backdrop, /data-burgundy-backdrop="true"/);
    assert.match(backdrop, /absolute inset-0/, "backdrop stays inside the template root");
  });
});

describe("Burgundy Gold — venue labels", () => {
  for (const [locale, sample] of [
    ["EN", samples.BURGUNDY_GOLD_SAMPLE_DATA],
    ["FR", samples.BURGUNDY_GOLD_SAMPLE_DATA_FR],
  ]) {
    test(`${locale}: ceremony venue is the ceremony, not a guest welcome`, () => {
      const [ceremony, reception] = sample.venues;
      assert.ok(ceremony && reception, "two venues are configured");

      assert.ok(
        !/welcome|accueil|guest|invit/i.test(ceremony.label ?? ""),
        `the ceremony venue must not be labelled "${ceremony.label}"`
      );
      assert.match(ceremony.label ?? "", /ceremony|cérémonie/i);
      assert.equal(ceremony.time, "18:00");
      assert.match(ceremony.name ?? "", /cath[eé]drale/i);
      assert.match(reception.label ?? "", /reception|réception/i);
      assert.equal(reception.time, "19:30");
      assert.equal(reception.name, "Espace Point E");
    });

    test(`${locale}: the guest welcome time only reaches the reception info block`, () => {
      const welcomeTime = data.burgundyWelcomeTime(sample.schedule);
      assert.equal(welcomeTime, "17:00", "the welcome is a 17:00 programme moment");

      const times = data.burgundyReceptionTimes(sample.venues, welcomeTime);
      assert.deepEqual(times, { welcome: "17:00", reception: "19:30" });

      // Without the programme fallback, the first venue (the ceremony) is never
      // reported as the welcome.
      const withoutFallback = data.burgundyReceptionTimes(sample.venues);
      assert.equal(withoutFallback.reception, "19:30");
      assert.notEqual(withoutFallback.welcome, "17:00");
    });
  }

  test("no sample venue is labelled as the guest welcome", () => {
    for (const sample of [samples.BURGUNDY_GOLD_SAMPLE_DATA, samples.BURGUNDY_GOLD_SAMPLE_DATA_FR]) {
      for (const venue of sample.venues) {
        assert.doesNotMatch(venue.label ?? "", /welcome|accueil/i);
      }
    }
  });
});

describe("Burgundy Gold — music control", () => {
  test("the floating control uses the burgundy music face", () => {
    assert.match(SECTIONS, /MusicButtonFace/);
    assert.match(SECTIONS, /<MusicButtonFace size=\{56\} playing=\{isPlaying\}/);
    assert.match(SECTIONS, /data-burgundy-music-control="true"/);
    assert.match(ART, /data-burgundy-art="music-button-face"/);
    assert.match(ART, /radial-gradient\(circle at 32% 26%/, "round gold gradient face");
  });

  test("the demo placeholder track is documented", () => {
    const sample = samples.BURGUNDY_GOLD_SAMPLE_DATA;
    assert.equal(sample.musicAudioUrl, "/audio/invitations/minimalism-dark-blue/demo.mp3");
    assert.ok(fs.existsSync(path.join(ROOT, "public/audio/invitations/minimalism-dark-blue/demo.mp3")));
    const sources = read(path.join(ROOT, "public/images/invitations/burgundy-gold/SOURCES.md"));
    assert.match(sources, /minimalism-dark-blue\/demo\.mp3/);
    assert.match(sources, /placeholder/i);
  });
});

Module._resolveFilename = originalResolveFilename;
