const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require.extensions[".ts"] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const {
  invitationImageClassName,
  invitationMobileGalleryBleedClassName,
  invitationMobileGalleryCaptionClassName,
} = require("../invitation-image-presentation.ts");
const source = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

describe("invitation image presentation", () => {
  test("provides shared fit rules while allowing template-specific frame overrides", () => {
    assert.match(invitationImageClassName("full-bleed"), /max-w-none/);
    assert.match(invitationImageClassName("full-bleed"), /object-cover/);
    assert.match(invitationImageClassName("framed"), /invitation-image--framed/);
    assert.match(invitationImageClassName("framed"), /max-w-full/);
    assert.match(invitationImageClassName("contained"), /invitation-image--contained/);
    assert.match(invitationImageClassName("contained"), /object-contain/);
    assert.match(invitationImageClassName("thumbnail"), /invitation-image--thumbnail/);
    assert.match(invitationImageClassName("thumbnail"), /object-cover/);
    assert.doesNotMatch(invitationImageClassName("framed", "object-contain"), /object-cover/);
  });

  test("provides edge-to-edge mobile gallery gutters and restores desktop gutters", () => {
    assert.match(invitationMobileGalleryBleedClassName(4), /-mx-4/);
    assert.match(invitationMobileGalleryBleedClassName(4), /w-\[calc\(100%_\+_2rem\)\]/);
    assert.match(invitationMobileGalleryBleedClassName(6), /sm:mx-0 sm:w-full/);
    assert.match(invitationMobileGalleryCaptionClassName(11), /px-11 sm:px-0/);

    const grid = source("components/invitation/InvitationGalleryGrid.tsx");
    assert.match(grid, /columns-1 gap-4 sm:columns-2 md:columns-3/);
    assert.match(grid, /invitationImageClassName\("contained"\)/);
    assert.match(grid, /invitationMobileGalleryBleedClassName\(mobileBleedGutter\)/);
  });

  test("keeps Botanical and shared content layouts min-width-safe on mobile", () => {
    const botanical = source("components/invitation/templates/botanical-reverie/BotanicalReveriePageTemplate.tsx");
    const blocks = source("components/invitation/blocks/InvitationPresentationBlocks.tsx");
    assert.match(botanical, /grid min-w-0 w-full max-w-6xl grid-cols-1 items-center/);
    assert.match(botanical, /grid min-w-0 w-full max-w-6xl grid-cols-1 gap-5/);
    assert.match(blocks, /detailGrid: "grid min-w-0 grid-cols-1/);
    assert.match(blocks, /venueGrid: "grid min-w-0 grid-cols-1/);
    assert.match(blocks, /break-words whitespace-pre-line text-sm leading-6/);
  });

  test("uses shared semantic fitting for full-bleed, framed, and gallery template imagery", () => {
    const blocks = source("components/invitation/blocks/InvitationPresentationBlocks.tsx");
    const moments = source("components/invitation/templates/InvitationStoryMoments.tsx");
    const wedding = source("components/invitation/templates/InvitationTemplateWedding.tsx");
    const cover = source("components/invitation/templates/InvitationTemplateCover.tsx");
    const botanical = source("components/invitation/templates/botanical-reverie/BotanicalReveriePageTemplate.tsx");
    assert.match(blocks, /invitationImageClassName\("full-bleed"/);
    assert.match(blocks, /invitationImageClassName\("contained"/);
    assert.match(moments, /invitationImageClassName\("framed"\)/);
    assert.match(wedding, /invitationImageClassName\("framed"\)/);
    assert.match(cover, /invitationImageClassName\("full-bleed"\)/);
    assert.match(botanical, /invitationImageClassName\("framed"/);
  });

  test("routes unframed template galleries through viewport-matched gutters", () => {
    const fixtures = [
      ["InvitationTemplate1.tsx", 6],
      ["InvitationTemplateWedding.tsx", 6],
      ["InvitationTemplateBirthday.tsx", 6],
      ["InvitationTemplateBlackTie.tsx", 4],
      ["InvitationTemplateCover.tsx", 4],
    ];
    for (const [file, gutter] of fixtures) {
      assert.match(source(`components/invitation/templates/${file}`), new RegExp(`mobileBleedGutter=\\{${gutter}\\}`));
    }

    const blocks = source("components/invitation/blocks/InvitationPresentationBlocks.tsx");
    const registry = source("components/invitation/blocks/InvitationBlockRegistry.tsx");
    assert.match(blocks, /const gutter = botanicalReverie \? 11 : 6/);
    assert.match(blocks, /presentation === "romantic" \|\| presentation === "birthday" \? "" : invitationMobileGalleryBleedClassName\(gutter\)/);
    assert.match(blocks, /presentation === "editorial" && index === 0 \? "sm:col-span-2 sm:row-span-2"/);
    assert.match(registry, /botanicalReverie=\{botanicalReverie\}/);
  });

  test("keeps standalone invitation-card artwork contained by its card frame", () => {
    const card = source("components/invitation/InvitationCardRenderer.tsx");
    const botanicalCard = source("components/invitation/BotanicalStationeryCard.tsx");
    assert.match(card, /aspectRatio: `\$\{canvasWidth\} \/ \$\{canvasHeight\}`/);
    assert.match(card, /maxWidth: "100%"/);
    assert.match(card, /invitationImageClassName\("framed", "absolute inset-0 pointer-events-none"\)/);
    assert.match(botanicalCard, /invitationImageClassName\("framed", "absolute inset-0"\)/);
  });

  test("allows the mobile preview toolbar title to shrink before its controls", () => {
    const preview = source("app/invitation/preview/PreviewSandboxClient.tsx");
    assert.match(preview, /flex min-w-0 flex-1 items-center gap-2/);
    assert.match(preview, /flex shrink-0 items-center gap-1\.5 lg:hidden/);
  });
});
