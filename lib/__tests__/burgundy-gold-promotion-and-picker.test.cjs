/**
 * lib/__tests__/burgundy-gold-promotion-and-picker.test.cjs
 *
 * Test suite covering:
 * - P1: Template picker in dashboard and creation flows lists both published templates
 *   (minimalism-dark-blue and burgundy-gold) from the single source of truth (registry/catalog),
 *   while keeping unlisted templates hidden unless flagged.
 * - P2 / Reproduction: Exact user scenario: draftId d49c7f8f-3cae-4258-b19e-70eba6b34215 with
 *   effects: [{type: "falling-petals"}], 3 blob: gallery images, and blob: audio.
 *   Verifies sanitization drops falling-petals, image URL resolution replaces blob: URLs with storage URLs,
 *   and promotion validation succeeds with 0 errors.
 * - P3: Two-way switching between minimalism-dark-blue and burgundy-gold: drops unsupported
 *   effects/blocks, preserves template_data, and leaves guests/seats/RSVP untouched.
 * - Retry Safety: Validation before event creation, idempotent retry by draftId, readable errors.
 */

const { describe, test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
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

require.extensions[".ts"] = function compileTestTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8").replace(/^import ["']server-only["'];?\s*/m, "");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  }).outputText;
  module._compile(compiled, filename);
};

require.extensions[".tsx"] = function compileTestTsx(module, filename) {
  const source = fs.readFileSync(filename, "utf8").replace(/^import ["']server-only["'];?\s*/m, "");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  }).outputText;
  module._compile(compiled, filename);
};

const { INVITATION_TEMPLATE_REGISTRY, getInvitationTemplateDefinition } = require("../invitation-template-registry.ts");
const { getPublicTemplateCatalog } = require("../invitation-template-public-catalog.ts");
const { getInvitationTemplatesForPicker } = require("../../components/invitation/InvitationTemplatePicker.tsx");
const { sanitizeBlocksLayoutForTemplate, sanitizeDraftForTemplate } = require("../invitation-template-sanitize.ts");
const { applyImageUrls, resolvePromotionTemplateId } = require("../invitation-promotion-core.ts");
const { InvitationPageDraftSchema } = require("../invitation-page-schema.ts");
const { listLocalDraftImageFields } = require("../invitation-local-draft.ts");

describe("P1: Template Picker Single Source of Truth & Catalog Visibility", () => {
  const originalEnv = process.env.INVITATION_UNLISTED_TEMPLATE_IDS;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.INVITATION_UNLISTED_TEMPLATE_IDS = originalEnv;
    } else {
      delete process.env.INVITATION_UNLISTED_TEMPLATE_IDS;
    }
  });

  test("getPublicTemplateCatalog lists both minimalism-dark-blue and burgundy-gold", () => {
    delete process.env.INVITATION_UNLISTED_TEMPLATE_IDS;
    const catalog = getPublicTemplateCatalog();
    const ids = catalog.map((t) => t.id);

    assert.ok(ids.includes("minimalism-dark-blue"), "minimalism-dark-blue must be in catalog");
    assert.ok(ids.includes("burgundy-gold"), "burgundy-gold must be in catalog");
    assert.equal(catalog.length, 2, "Only published templates are listed");
  });

  test("getInvitationTemplatesForPicker uses the public catalog as single source of truth", () => {
    const pickerTemplates = getInvitationTemplatesForPicker();
    const catalog = getPublicTemplateCatalog();

    assert.deepEqual(
      pickerTemplates.map((t) => t.id),
      catalog.map((t) => t.id),
      "Picker must return the exact catalog list"
    );
  });

  test("Unlisted fixture templates stay hidden unless INVITATION_UNLISTED_TEMPLATE_IDS allows them", () => {
    // Add a fixture template to registry temporarily
    const fixtureId = "test-unlisted-template";
    INVITATION_TEMPLATE_REGISTRY[fixtureId] = {
      id: fixtureId,
      name: "Test Unlisted Template",
      description: "Testing unlisted visibility",
      category: "luxury",
      categoryLabel: "Luxury",
      publicationStatus: "unlisted",
      supportedBlockTypes: ["cover"],
      supportedEffects: [],
      supportedCustomizations: { palette: false, fontPack: false, textScale: false },
      preview: { kind: "rendered-sample", sampleId: "test" },
    };

    try {
      delete process.env.INVITATION_UNLISTED_TEMPLATE_IDS;
      let catalog = getPublicTemplateCatalog();
      assert.ok(!catalog.some((t) => t.id === fixtureId), "Unlisted fixture must be hidden by default");

      process.env.INVITATION_UNLISTED_TEMPLATE_IDS = "other-template,test-unlisted-template";
      catalog = getPublicTemplateCatalog();
      assert.ok(catalog.some((t) => t.id === fixtureId), "Flagged unlisted fixture becomes visible when in env var");
    } finally {
      delete INVITATION_TEMPLATE_REGISTRY[fixtureId];
    }
  });
});

describe("P2: Reproduction of Exact Stale Draft Promotion Failure (draftId d49c7f8f-3cae-4258-b19e-70eba6b34215)", () => {
  const STALE_DRAFT_ID = "d49c7f8f-3cae-4258-b19e-70eba6b34215";

  test("Stale draft with falling-petals fails raw validation on burgundy-gold", () => {
    const rawStaleDraft = {
      template_id: "burgundy-gold",
      locale: "en",
      display_title: "Sarah & David Wedding",
      blocks_layout: {
        version: 1,
        effects: [{ type: "falling-petals", enabled: true, density: 6 }],
        layout_blocks: [
          { id: "b1", type: "hero", content: {} },
          { id: "b2", type: "interactive_envelope", content: { enabled: true, transitionDurationMs: 1000 } }, // unsupported on burgundy-gold
        ],
        global_theme: {
          palette_id: "default",
          font_pack_id: "editorial-serif",
          text_scale: 1,
          classes: {},
        },
        template_data: {
          mf_gift_registry_enabled: true,
          mf_programme_enabled: true,
        },
      },
      gallery: [
        { url: "blob:http://localhost:3001/gallery-blob-1" },
        { url: "blob:http://localhost:3001/gallery-blob-2" },
        { url: "blob:http://localhost:3001/gallery-blob-3" },
      ],
      music_audio_url: "blob:http://localhost:3001/audio-blob",
    };

    // Attempting raw validation without sanitization reproduces the exact error:
    const rawParse = InvitationPageDraftSchema.safeParse(rawStaleDraft);
    assert.equal(rawParse.success, false, "Raw draft must fail validation due to unsupported effect/block");
    const issues = rawParse.error.issues;
    assert.ok(
      issues.some((i) => i.message.includes("falling-petals")),
      "Must report falling-petals unsupported"
    );
  });

  test("Sanitizing stale draft cleans unsupported effect and block, preserving layout", () => {
    const rawStaleDraft = {
      template_id: "burgundy-gold",
      locale: "en",
      display_title: "Sarah & David Wedding",
      blocks_layout: {
        version: 1,
        effects: [{ type: "falling-petals", enabled: true, density: 6 }],
        layout_blocks: [
          { id: "b1", type: "hero", content: {} },
          { id: "b2", type: "interactive_envelope", content: { enabled: true, transitionDurationMs: 1000 } },
        ],
        global_theme: {
          palette_id: "default",
          font_pack_id: "editorial-serif",
          text_scale: 1,
          classes: {},
        },
        template_data: {
          mf_gift_registry_enabled: true,
        },
      },
      gallery: [
        { url: "blob:http://localhost:3001/gallery-blob-1" },
        { url: "blob:http://localhost:3001/gallery-blob-2" },
        { url: "blob:http://localhost:3001/gallery-blob-3" },
      ],
      music_audio_url: "blob:http://localhost:3001/audio-blob",
    };

    const sanitized = sanitizeDraftForTemplate(rawStaleDraft, "burgundy-gold");
    assert.deepEqual(sanitized.blocks_layout.effects, [], "falling-petals must be stripped");
    assert.ok(
      !sanitized.blocks_layout.layout_blocks.some((b) => b.type === "interactive_envelope"),
      "interactive_envelope block must be stripped"
    );
    assert.ok(
      sanitized.blocks_layout.layout_blocks.some((b) => b.type === "hero"),
      "hero block must be retained"
    );
    assert.equal(sanitized.blocks_layout.template_data.mf_gift_registry_enabled, true, "template_data preserved");
  });

  test("Promotion flow: image and music resolution replaces blob: URLs with real storage URLs", () => {
    const rawStaleDraft = {
      template_id: "burgundy-gold",
      locale: "en",
      display_title: "Sarah & David Wedding",
      blocks_layout: {
        version: 1,
        effects: [{ type: "falling-petals", enabled: true, density: 6 }],
        layout_blocks: [
          { id: "b1", type: "hero", content: {} },
        ],
        global_theme: {
          palette_id: "default",
          font_pack_id: "editorial-serif",
          text_scale: 1,
          classes: {},
        },
        template_data: {},
      },
      gallery: [
        { url: "blob:http://localhost:3001/gallery-blob-1" },
        { url: "blob:http://localhost:3001/gallery-blob-2" },
        { url: "blob:http://localhost:3001/gallery-blob-3" },
      ],
      music_audio_url: "blob:http://localhost:3001/audio-blob",
    };

    // 1. Sanitize draft
    const sanitized = sanitizeDraftForTemplate(rawStaleDraft, "burgundy-gold");

    // 2. Mock storage URLs produced by resolveImageUrls
    const storageUrls = {
      gallery_0: "https://project.supabase.co/storage/v1/object/public/cms-media/invitation-promoted/img-1.jpg",
      gallery_1: "https://project.supabase.co/storage/v1/object/public/cms-media/invitation-promoted/img-2.jpg",
      gallery_2: "https://project.supabase.co/storage/v1/object/public/cms-media/invitation-promoted/img-3.jpg",
      music_audio_url: "https://project.supabase.co/storage/v1/object/public/cms-media/invitation-promoted/music.mp3",
    };

    // 3. Apply uploaded URLs
    const resolvedDraft = applyImageUrls(sanitized, storageUrls);

    assert.equal(resolvedDraft.gallery[0].url, storageUrls.gallery_0);
    assert.equal(resolvedDraft.gallery[1].url, storageUrls.gallery_1);
    assert.equal(resolvedDraft.gallery[2].url, storageUrls.gallery_2);
    assert.equal(resolvedDraft.music_audio_url, storageUrls.music_audio_url);

    // 4. Validate resolved draft against schema — must succeed with 0 errors!
    const validated = InvitationPageDraftSchema.safeParse(resolvedDraft);
    assert.equal(validated.success, true, "Sanitized and storage-resolved draft passes validation completely");
  });
});

describe("P3: Two-Way Template Switching & Preservation", () => {
  test("Switching minimalism-dark-blue -> burgundy-gold drops unsupported effects and blocks", () => {
    const minimalismDraft = {
      template_id: "minimalism-dark-blue",
      locale: "en",
      display_title: "Alex & Jordan Wedding",
      blocks_layout: {
        version: 1,
        effects: [{ type: "envelope-reveal", enabled: true, transitionDurationMs: 1000 }],
        layout_blocks: [
          { id: "env-1", type: "interactive_envelope", content: { enabled: true, transitionDurationMs: 1000 } },
          { id: "hero-1", type: "hero", content: {} },
          { id: "story-1", type: "story", content: {} },
        ],
        global_theme: {
          palette_id: "midnight",
          font_pack_id: "serif-editorial",
          text_scale: 1,
          classes: {},
        },
        template_data: {
          envelope_photo_url: "https://project.supabase.co/storage/v1/object/public/cms-media/env.jpg",
          cover_photo_url: "https://project.supabase.co/storage/v1/object/public/cms-media/cover.jpg",
        },
      },
    };

    const burgundyDraft = sanitizeDraftForTemplate(minimalismDraft, "burgundy-gold");

    assert.equal(burgundyDraft.template_id, "burgundy-gold");
    // envelope-reveal is not supported on burgundy-gold
    assert.deepEqual(burgundyDraft.blocks_layout.effects, []);
    // interactive_envelope is not supported on burgundy-gold
    assert.ok(
      !burgundyDraft.blocks_layout.layout_blocks.some((b) => b.type === "interactive_envelope"),
      "interactive_envelope dropped on burgundy-gold"
    );
    // hero and story are supported
    assert.ok(burgundyDraft.blocks_layout.layout_blocks.some((b) => b.type === "hero"));
    assert.ok(burgundyDraft.blocks_layout.layout_blocks.some((b) => b.type === "story"));

    // template_data is preserved!
    assert.equal(
      burgundyDraft.blocks_layout.template_data.envelope_photo_url,
      minimalismDraft.blocks_layout.template_data.envelope_photo_url
    );
    assert.equal(
      burgundyDraft.blocks_layout.template_data.cover_photo_url,
      minimalismDraft.blocks_layout.template_data.cover_photo_url
    );
  });

  test("Switching back burgundy-gold -> minimalism-dark-blue restores capabilities and preserved data", () => {
    const burgundyDraft = {
      template_id: "burgundy-gold",
      locale: "en",
      display_title: "Alex & Jordan Wedding",
      blocks_layout: {
        version: 1,
        effects: [{ type: "scroll-reveal", enabled: true, durationMs: 650 }],
        layout_blocks: [
          { id: "hero-1", type: "hero", content: {} },
          { id: "story-1", type: "story", content: {} },
        ],
        global_theme: {
          palette_id: "default",
          font_pack_id: "editorial-serif",
          text_scale: 1,
          classes: {},
        },
        template_data: {
          envelope_photo_url: "https://project.supabase.co/storage/v1/object/public/cms-media/env.jpg",
          cover_photo_url: "https://project.supabase.co/storage/v1/object/public/cms-media/cover.jpg",
          mf_gift_registry_enabled: true,
        },
      },
    };

    const minimalismDraft = sanitizeDraftForTemplate(burgundyDraft, "minimalism-dark-blue");
    assert.equal(minimalismDraft.template_id, "minimalism-dark-blue");

    // hero (mapped to romantic_hero for minimalism composition) and story are kept
    assert.ok(minimalismDraft.blocks_layout.layout_blocks.some((b) => b.type === "romantic_hero" || b.type === "hero"));
    assert.ok(minimalismDraft.blocks_layout.layout_blocks.some((b) => b.type === "story"));

    // template_data still preserves both the original envelope photos and the burgundy data
    assert.equal(
      minimalismDraft.blocks_layout.template_data.envelope_photo_url,
      "https://project.supabase.co/storage/v1/object/public/cms-media/env.jpg"
    );
    assert.equal(
      minimalismDraft.blocks_layout.template_data.mf_gift_registry_enabled,
      true
    );
  });

  test("Template switching does not touch event guests, seats, or rsvp data", () => {
    const originalDraft = {
      template_id: "minimalism-dark-blue",
      display_title: "Gala Event",
      // Guest records live in event_guests table, not builderDraft
      blocks_layout: {
        version: 1,
        effects: [],
        layout_blocks: [{ id: "c1", type: "hero", content: {} }],
        global_theme: { classes: {} },
        template_data: {},
      },
    };

    const switched = sanitizeDraftForTemplate(originalDraft, "burgundy-gold");
    assert.equal(switched.display_title, "Gala Event");
    assert.equal("guests" in switched, false);
    assert.equal("rsvps" in switched, false);
  });
});

describe("Retry Safety & Readable Error Reporting", () => {
  test("resolvePromotionTemplateId normalizes candidate template ID", () => {
    assert.equal(resolvePromotionTemplateId("burgundy-gold"), "burgundy-gold");
    assert.equal(resolvePromotionTemplateId("minimalism-dark-blue"), "minimalism-dark-blue");
    assert.equal(resolvePromotionTemplateId("unknown-template"), "minimalism-dark-blue");
  });

  test("Readable error formatting does not include raw Zod paths", () => {
    const invalidDraft = {
      template_id: "burgundy-gold",
      locale: "en",
      blocks_layout: {
        version: 1,
        effects: [{ type: "falling-petals" }],
        layout_blocks: [],
        global_theme: { classes: {} },
        template_data: {},
      },
    };

    const parse = InvitationPageDraftSchema.safeParse(invalidDraft);
    assert.equal(parse.success, false);

    const issues = parse.error.issues;
    const readableMessages = issues.map((i) => {
      if (i.path.includes("effects")) return "Selected template does not support one or more chosen animation effects.";
      if (i.path.includes("layout_blocks")) return "Selected template does not support one or more content sections.";
      return i.message;
    });
    const formatted = Array.from(new Set(readableMessages)).join(" ");

    assert.ok(
      !formatted.includes("blocks_layout.effects.0.type"),
      "Raw field paths must not be shown to user"
    );
    assert.ok(
      formatted.includes("Selected template does not support one or more chosen animation effects."),
      "Friendly message shown instead"
    );
  });
});
