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
  INVITATION_GALLERY_PRESENTATIONS,
  isInvitationGalleryPresentation,
} = require("../invitation-template-registry.ts");
const { legacyInvitationTemplateToLayout } = require("../invitation-page-layout.ts");
const { InvitationPageDraftSchema } = require("../invitation-page-schema.ts");

const source = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const ACCORDION = "components/invitation/blocks/InvitationImageAccordion.tsx";
const BLOCKS = "components/invitation/blocks/InvitationPresentationBlocks.tsx";
const REGISTRY = "components/invitation/blocks/InvitationBlockRegistry.tsx";
const BUILDER_SECTION = "app/dashboard/events/[id]/invitation-page/builder/sections/GallerySection.tsx";

describe("invitation gallery accordion layout", () => {
  test("registry declares the accordion layout and guards unknown values", () => {
    assert.ok(INVITATION_GALLERY_PRESENTATIONS.includes("accordion"));
    assert.equal(isInvitationGalleryPresentation("accordion"), true);
    assert.equal(isInvitationGalleryPresentation("editorial"), true);
    assert.equal(isInvitationGalleryPresentation("bogus"), false);
    assert.equal(isInvitationGalleryPresentation(undefined), false);
    assert.equal(isInvitationGalleryPresentation({ presentation: "accordion" }), false);
  });

  test("organizer layout override round-trips through the block layout, and no override stays unset", () => {
    const base = legacyInvitationTemplateToLayout("gala-editorial");
    const galleryBlock = base.layout_blocks.find((block) => block.type === "gallery");
    assert.ok(galleryBlock, "registry layout must include a gallery block");
    assert.equal(galleryBlock.content.presentation, undefined, "no override by default");

    const saved = {
      ...base,
      layout_blocks: base.layout_blocks.map((block) => (
        block.type === "gallery"
          ? { ...block, content: { ...block.content, presentation: "accordion" } }
          : block
      )),
    };
    const rebuilt = legacyInvitationTemplateToLayout("gala-editorial", saved);
    const rebuiltGallery = rebuilt.layout_blocks.find((block) => block.type === "gallery");
    assert.equal(rebuiltGallery.content.presentation, "accordion");
  });

  test("a draft carrying the accordion override passes invitation draft validation", () => {
    const base = legacyInvitationTemplateToLayout("luxe-editorial");
    const layout = {
      ...base,
      layout_blocks: base.layout_blocks.map((block) => (
        block.type === "gallery"
          ? { ...block, content: { ...block.content, presentation: "accordion" } }
          : block
      )),
    };
    const parsed = InvitationPageDraftSchema.safeParse({
      template_id: "luxe-editorial",
      blocks_layout: layout,
    });
    assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues));
  });

  test("registry resolves the organizer override ahead of the template default", () => {
    const registry = source(REGISTRY);
    assert.match(registry, /isInvitationGalleryPresentation\(requested\) \? requested : galleryPresentation/);
    assert.match(registry, /const requested = text\(content\.presentation\)/);
    assert.ok(registry.includes("<GalleryBlock"), "registry must route the gallery through GalleryBlock");
  });

  test("GalleryBlock delegates the accordion to the dedicated component", () => {
    const blocks = source(BLOCKS);
    assert.match(blocks, /if \(presentation === "accordion"\)/);
    assert.match(blocks, /<InvitationImageAccordion images=\{visibleImages\} theme=\{theme\} locale=\{locale\} \/>/);
    assert.match(blocks, /presentation\?: InvitationGalleryPresentation/);
  });

  test("accordion consumes real gallery data in order and renders nothing for empty galleries", () => {
    const accordion = source(ACCORDION);
    assert.match(accordion, /images\.filter\(\(image\) => Boolean\(image\.url\)\)/);
    assert.match(accordion, /if \(panels\.length === 0\) return null/);
    assert.match(accordion, /panels\.map\(\(panel, index\)/);
    assert.match(accordion, /panel\.caption\?\.trim\(\) \|\| panel\.alt\?\.trim\(\)/);
    // No demo art or demo copy carried over from the upstream sample.
    assert.doesNotMatch(accordion, /unsplash/i);
    assert.doesNotMatch(accordion, /Image 0\d/);
    assert.doesNotMatch(accordion, /href="#"/);
  });

  test("accordion frames photos with object-cover via the shared fitting helper", () => {
    const accordion = source(ACCORDION);
    assert.match(accordion, /invitationImageClassName\(\s*"framed"/);
    assert.match(accordion, /aspect-\[4\/5\] md:aspect-auto md:h-full md:basis-0/);
    assert.match(accordion, /md:\[flex-grow:var\(--panel-grow\)\]/);
    assert.match(accordion, /overflow-hidden rounded-xl/);
  });

  test("accordion stacks on mobile and expands on desktop hover and focus", () => {
    const accordion = source(ACCORDION);
    assert.match(accordion, /flex w-full min-w-0 flex-col gap-2 md:h-\[30rem\] md:flex-row md:gap-3/);
    assert.match(accordion, /onMouseEnter=\{\(\) => setActiveIndex\(index\)\}/);
    assert.match(accordion, /onFocus=\{\(\) => setActiveIndex\(index\)\}/);
    assert.match(accordion, /onClick=\{\(\) => setActiveIndex\(index\)\}/);
    assert.match(accordion, /aria-pressed=\{isActive\}/);
    assert.match(accordion, /aria-label=\{photoLabel\(/);
  });

  test("accordion honors reduced motion and shows a visible focus indicator", () => {
    const accordion = source(ACCORDION);
    assert.match(accordion, /motion-reduce:transition-none/);
    assert.match(accordion, /motion-reduce:transition-none md:group-hover\/panel:scale-\[1\.03\]/);
    assert.match(accordion, /focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-500/);
  });

  test("builder exposes a gallery layout selector that persists the override in block content", () => {
    const section = source(BUILDER_SECTION);
    assert.match(section, /label: "Image accordion"/);
    assert.match(section, /content\.presentation = next/);
    assert.match(section, /delete content\.presentation/);
    assert.match(section, /isInvitationGalleryPresentation\(rawPresentation\) \? rawPresentation : "default"/);
    assert.match(section, /legacyInvitationTemplateToLayout\(draft\.template_id, draft\.blocks_layout\)/);
  });
});

// --- Rendered-output verification (real DOM, not just source regex) ---------
require.extensions[".tsx"] = function compileTsx(module, filename) {
  const fileSource = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(fileSource, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { InvitationImageAccordion } = require("@/components/invitation/blocks/InvitationImageAccordion.tsx");

const theme = { classes: { body: "font-body", heading: "font-heading", accent: "text-brand" } };
const render = (images, locale = "en") =>
  renderToStaticMarkup(React.createElement(InvitationImageAccordion, { images, theme, locale }));

describe("invitation gallery accordion rendered output", () => {
  test("an empty gallery renders nothing (no empty frame, no broken markup)", () => {
    assert.equal(render([]), "");
    assert.equal(render([{ url: "", alt: "missing" }]), "");
  });

  test("a single photo renders one uncropped figure instead of a one-panel accordion", () => {
    const html = render([{ url: "/only.jpg", alt: "Only shot" }]);
    assert.match(html, /^<figure/);
    assert.match(html, /object-contain/);
    assert.match(html, /src="\/only\.jpg"/);
    assert.match(html, /alt="Only shot"/);
    assert.doesNotMatch(html, /<ul/);
    assert.doesNotMatch(html, /aria-pressed/);
  });

  test("multiple photos render one framed panel each, in the organizer's order", () => {
    const html = render([
      { url: "/a.jpg", alt: "First", caption: "Ceremony" },
      { url: "/b.jpg", alt: "Second" },
      { url: "/c.jpg", alt: "Third", caption: "Reception" },
    ]);
    assert.match(html, /<ul/);
    assert.equal((html.match(/<li[\s>]/g) || []).length, 3);
    assert.equal((html.match(/aria-pressed=/g) || []).length, 3);
    const srcs = [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(srcs, ["/a.jpg", "/b.jpg", "/c.jpg"]);
    // Every panel frames its photo with object-cover (an accordion needs fixed frames).
    assert.equal((html.match(/object-cover/g) || []).length, 3);
    // Captions render verbatim; panels without a caption fall back to alt text.
    assert.match(html, /Ceremony/);
    assert.match(html, /Reception/);
    assert.match(html, /alt="Second"/);
    assert.match(html, /--panel-grow/);
    // The first panel starts expanded; the others start collapsed.
    assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
    assert.doesNotMatch(html, /unsplash/i);
  });

  test("photos without a url are skipped rather than producing an empty panel", () => {
    const html = render([
      { url: "", alt: "broken" },
      { url: "/real.jpg", alt: "Real" },
    ]);
    // Only one usable photo survives, so the single-photo fallback is used.
    assert.match(html, /^<figure/);
    assert.doesNotMatch(html, /broken/);
  });
});
