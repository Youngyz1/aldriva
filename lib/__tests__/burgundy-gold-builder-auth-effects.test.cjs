/**
 * lib/__tests__/burgundy-gold-builder-auth-effects.test.cjs
 *
 * Automated regression suite for:
 * 1. Bug A (Auth): Signed-in visitor adoption, route session check, hydration fallback.
 * 2. Bug B (Images): Validation and storage rules, local blob vs storage URLs.
 * 3. Bug C (Effects): Auto-clearing unsupported effects, DesignSection effect picker scoping.
 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

require.extensions[".ts"] = function compileTs(module, filename) {
  const raw = fs.readFileSync(filename, "utf8").replace(/^import\s+["']server-only["'];?\s*/m, "");
  const output = ts.transpileModule(raw, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const Module = require("node:module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { legacyInvitationTemplateToLayout } = require("@/lib/invitation-page-layout.ts");
const { getInvitationTemplateDefinition } = require("@/lib/invitation-template-registry.ts");
const { validateForPublish } = require("@/lib/invitation-page-schema.ts");
const { isValidStorageImageUrl } = require("@/lib/invitation-image-url.ts");

describe("Bug C (Effects) — Auto-clearing and picker scoping", () => {
  test("burgundy-gold definition supports only scroll-reveal", () => {
    const def = getInvitationTemplateDefinition("burgundy-gold");
    assert.ok(def, "burgundy-gold definition must exist");
    assert.deepEqual(def.supportedEffects, ["scroll-reveal"]);
    assert.deepEqual(def.defaultEffects, [{ type: "scroll-reveal", enabled: false, durationMs: 650 }]);
  });

  test("minimalism-dark-blue supports envelope-reveal and scroll-reveal, not falling-petals", () => {
    const def = getInvitationTemplateDefinition("minimalism-dark-blue");
    assert.ok(def, "minimalism-dark-blue definition must exist");
    assert.deepEqual(def.supportedEffects, ["envelope-reveal", "scroll-reveal"]);
    assert.ok(!def.supportedEffects.includes("falling-petals"), "falling-petals must not be in minimalism-dark-blue");
  });

  test("legacyInvitationTemplateToLayout automatically strips falling-petals from burgundy-gold layout", () => {
    const savedLayout = {
      version: 1,
      global_theme: { classes: {} },
      layout_blocks: [],
      effects: [
        { type: "falling-petals", enabled: true, density: 8 },
        { type: "scroll-reveal", enabled: true, durationMs: 600 },
      ],
    };
    const layout = legacyInvitationTemplateToLayout("burgundy-gold", savedLayout);
    assert.ok(Array.isArray(layout.effects), "effects must be an array");
    const effectTypes = layout.effects.map((e) => e.type);
    assert.ok(!effectTypes.includes("falling-petals"), "falling-petals must be stripped from burgundy-gold");
    assert.deepEqual(effectTypes, ["scroll-reveal"], "only supported scroll-reveal must remain");
  });

  test("switching from minimalism-dark-blue to burgundy-gold auto-clears envelope-reveal and unsupported effects", () => {
    const minimalismSaved = {
      version: 1,
      global_theme: { classes: {} },
      layout_blocks: [],
      effects: [
        { type: "envelope-reveal", enabled: true, transitionDurationMs: 900 },
        { type: "scroll-reveal", enabled: false, durationMs: 650 },
      ],
    };
    const burgundyLayout = legacyInvitationTemplateToLayout("burgundy-gold", minimalismSaved);
    const effectTypes = burgundyLayout.effects.map((e) => e.type);
    assert.deepEqual(effectTypes, ["scroll-reveal"]);
  });

  test("switching from burgundy-gold to minimalism-dark-blue preserves supported effects without errors", () => {
    const burgundySaved = {
      version: 1,
      global_theme: { classes: {} },
      layout_blocks: [],
      effects: [
        { type: "scroll-reveal", enabled: true, durationMs: 500 },
      ],
    };
    const minimalismLayout = legacyInvitationTemplateToLayout("minimalism-dark-blue", burgundySaved);
    const effectTypes = minimalismLayout.effects.map((e) => e.type);
    // The saved layout has only scroll-reveal; switching to minimalism preserves it
    // (hasSavedEffects=true path: saved effects filtered through minimalism's supported set).
    // envelope-reveal is NOT auto-added since we do not inject missing supported defaults.
    assert.deepEqual(effectTypes, ["scroll-reveal"]);
  });

  test("DesignSection derives supportedEffects from template definition, not hardcoded array", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "app/dashboard/events/[id]/invitation-page/builder/sections/DesignSection.tsx"),
      "utf8"
    );
    assert.ok(
      src.includes("templateDef?.supportedEffects ?? []"),
      "DesignSection must derive supportedEffects from getInvitationTemplateDefinition"
    );
    assert.ok(
      !src.includes('const supportedEffects: InvitationEffectType[] = ["envelope-reveal", "scroll-reveal", "falling-petals"]'),
      "DesignSection must not hardcode supportedEffects with falling-petals"
    );
  });
});

describe("Bug A (Auth) — Adoption & route session checks", () => {
  test("create route page.tsx reads session with getCurrentUser and passes initialUserId", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "app/invitations/templates/[templateId]/create/page.tsx"),
      "utf8"
    );
    assert.ok(src.includes("getCurrentUser()"), "page.tsx must read server session");
    assert.ok(src.includes("initialUserId={user?.id ?? null}"), "page.tsx must pass initialUserId");
  });

  test("AnonymousInvitationBuilderClient forwards initialUserId to useLocalInvitationBuilderAdapters", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "app/invitations/templates/[templateId]/create/AnonymousInvitationBuilderClient.tsx"),
      "utf8"
    );
    assert.ok(src.includes("initialUserId"), "AnonymousInvitationBuilderClient must accept initialUserId prop");
    assert.ok(src.includes("useLocalInvitationBuilderAdapters(templateId, initialUserId)"), "hook must receive initialUserId");
  });

  test("useLocalInvitationBuilderAdapters checks isAuthed immediately on mount and promotes", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "components/invitation/useLocalInvitationBuilderAdapters.ts"),
      "utf8"
    );
    assert.ok(src.includes("if (isAuthed)"), "must branch on authenticated user on mount");
    assert.ok(src.includes("createInvitationLocalDraft(draftId,"), "must initialize fresh draft if envelope is absent for signed-in user");
    assert.ok(src.includes("router.replace(promoteTarget)"), "must redirect signed-in user to promote route");
  });

  test("promote page.tsx includes getUser() fallback for robust hydration", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "app/invitations/promote/page.tsx"),
      "utf8"
    );
    assert.ok(src.includes("supabase.auth.getUser()"), "promote page must fallback to getUser()");
    assert.ok(src.includes("promoteLocalDraft(draftId, user.id)"), "promote must use resolved user.id");
  });
});

describe("Bug B (Images) — Storage validation & local display filtering", () => {
  test("isValidStorageImageUrl rejects blob: and data: URLs (security guard)", () => {
    assert.equal(isValidStorageImageUrl("blob:http://localhost:3000/1234"), false);
    assert.equal(isValidStorageImageUrl("data:image/png;base64,iVBORw0KGgo="), false);
    assert.equal(isValidStorageImageUrl("javascript:alert(1)"), false);
  });

  test("isValidStorageImageUrl accepts /images/ template defaults and cms-media storage URLs", () => {
    assert.equal(isValidStorageImageUrl("/images/invitations/burgundy-gold/demo/opening-photo.jpg"), true);
    assert.equal(isValidStorageImageUrl("/images/invitations/minimalism-dark-blue/demo/gallery-01.jpg"), true);
    assert.equal(
      isValidStorageImageUrl("https://xyz.supabase.co/storage/v1/object/public/cms-media/invitation-gallery/photo.jpg"),
      true
    );
  });

  test("validateForPublish rejects blob: gallery items with 'Image URL must be from storage'", () => {
    const draft = {
      template_id: "burgundy-gold",
      locale: "en",
      display_title: "Valid Title",
      timezone: "UTC",
      gallery: [
        { url: "blob:http://localhost:3000/test-blob", alt: "Test" },
      ],
      blocks_layout: {
        global_theme: { preset_id: "burgundyGold" },
        layout_blocks: [
          { id: "details-1", type: "details", content: {} },
        ],
        effects: [{ type: "scroll-reveal", enabled: false, durationMs: 650 }],
      },
    };
    const event = { title: "Valid Title", event_date: "2027-10-16T18:00:00Z" };
    const res = validateForPublish(draft, event, "en");
    assert.equal(res.valid, false);
    const storageErr = res.errors.find((e) => e.message === "Image URL must be from storage");
    assert.ok(storageErr, "must report 'Image URL must be from storage'");
    assert.equal(storageErr.field, "gallery.0.url");
  });

  test("PublishSection filters local-mode blob gallery errors while preserving strict validation for publish", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "app/dashboard/events/[id]/invitation-page/builder/sections/PublishSection.tsx"),
      "utf8"
    );
    assert.ok(src.includes("publishErrors"), "PublishSection must use publishErrors for display");
    assert.ok(
      src.includes('err.message === "Image URL must be from storage" && err.field.startsWith("gallery.")'),
      "must filter local blob gallery errors in local mode display"
    );
  });
});
