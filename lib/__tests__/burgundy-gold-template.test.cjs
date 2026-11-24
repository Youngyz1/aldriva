/**
 * lib/__tests__/burgundy-gold-template.test.cjs
 *
 * Registry/manifest/sample/wiring coverage for the burgundy-gold invitation template.
 */
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const ts = require("typescript");
const Module = require("node:module");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

if (!require.extensions[".ts"]) {
  require.extensions[".ts"] = function compileTs(module, filename) {
    const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
      fileName: filename,
    }).outputText;
    module._compile(output, filename);
  };
}

const registry = require("@/lib/invitation-template-registry.ts");
const manifests = require("@/lib/invitation-template-manifests.ts");
const samples = require("@/components/invitation/templates/invitation-sample-data.ts");

describe("burgundy-gold template registration", () => {
  test("registry entry exists, is published, and minimalism-dark-blue remains default", () => {
    const def = registry.getInvitationTemplateDefinition("burgundy-gold");
    assert.ok(def, "burgundy-gold definition must exist");
    assert.equal(def.id, "burgundy-gold");
    assert.equal(def.version, "1.0.0");
    assert.equal(def.name, "Burgundy Gold");
    assert.equal(def.category, "wedding");
    assert.equal(def.publicationStatus, "published");
    assert.equal(def.composition, "burgundy-gold");
    assert.equal(def.defaultThemePreset, "burgundyGold");
    assert.deepEqual(def.pageRenderer, { kind: "custom", componentId: "burgundy-gold" });
    assert.deepEqual(def.preview, { kind: "rendered-sample", sampleId: "burgundy-gold" });
    assert.equal(registry.DEFAULT_INVITATION_TEMPLATE_ID, "minimalism-dark-blue");
  });

  test("manifest fields and labels (en and fr)", () => {
    const manifest = manifests.getInvitationTemplateManifest("burgundy-gold");
    assert.ok(manifest, "manifest must exist");
    assert.equal(manifest.invitationType, "wedding");
    assert.deepEqual(manifest.sections, ["type", "template", "design", "basics", "template-fields", "details", "gallery", "music", "publish"]);
    assert.deepEqual(manifest.venues, { max: 3 });
    assert.deepEqual(manifest.schedule, { enabled: true, max: 15 });

    const keys = manifest.fields.map((f) => f.key);
    assert.ok(!keys.includes("mf_hero_photos"), "mf_hero_photos must be removed");
    for (const required of ["partner1_name", "partner2_name", "mf_parent_one_label", "mf_parent_one_name_one", "mf_parent_one_name_two", "mf_parent_two_label", "mf_parent_two_name_one", "mf_parent_two_name_two", "mf_hero_eyebrow", "mf_invitation_line", "mf_opening_photo", "mf_opening_message", "mf_dress_code_swatches", "show_guestbook", "mf_show_memories"]) {
      assert.ok(keys.includes(required), `missing field ${required}`);
    }

    for (const field of manifest.fields) {
      assert.equal(typeof field.label.en, "string");
      assert.equal(typeof field.label.fr, "string");
      assert.ok(field.label.en.length > 0 && field.label.fr.length > 0, `field ${field.key} must have en/fr labels`);
      if (field.groupLabel) {
        assert.equal(typeof field.groupLabel.en, "string");
        assert.equal(typeof field.groupLabel.fr, "string");
      }
    }

    const eyebrow = manifest.fields.find((f) => f.key === "mf_hero_eyebrow");
    assert.ok(eyebrow, "mf_hero_eyebrow must exist");
    assert.equal(eyebrow.sampleValue, "Le mariage de");

    const openingPhoto = manifest.fields.find((f) => f.key === "mf_opening_photo");
    assert.ok(openingPhoto, "mf_opening_photo must exist");
    assert.equal(openingPhoto.type, "image-list");
    assert.equal(openingPhoto.min, 0);
    assert.equal(openingPhoto.max, 1);
    assert.deepEqual(openingPhoto.storage, { kind: "template_data", path: "mf_opening_photo" });

    const openingMessage = manifest.fields.find((f) => f.key === "mf_opening_message");
    assert.ok(openingMessage, "mf_opening_message must exist");
    assert.equal(openingMessage.type, "textarea");
    assert.equal(openingMessage.maxLength, 240);
    assert.deepEqual(openingMessage.storage, { kind: "template_data", path: "mf_opening_message" });
  });

  test("sample data EN/FR", () => {
    const en = samples.BURGUNDY_GOLD_SAMPLE_DATA;
    const fr = samples.BURGUNDY_GOLD_SAMPLE_DATA_FR;
    assert.ok(en && fr, "EN and FR sample data must exist");
    assert.equal(en.locale, "en");
    assert.equal(fr.locale, "fr");
    assert.equal(fr.partner1Name, "Modou Gueye");
    assert.equal(fr.partner2Name, "Ndeye Sarr");
    assert.equal(fr.eyebrow, "Le mariage de");
    assert.ok(Array.isArray(fr.venues) && fr.venues.length >= 2);
    assert.equal(fr.venues[0].name, "Cathédrale du Souvenir Africain");
    assert.equal(fr.venues[0].label, "Cérémonie");
    assert.equal(fr.venues[0].time, "18:00");
    assert.equal(fr.venues[1].name, "Espace Point E");
    assert.equal(fr.venues[1].time, "19:30");
    assert.match(fr.eventDate, /^2027-10-16/);
    assert.equal(fr.city, "Dakar");
    assert.equal(fr.gallery.length, 6, "stage 2B sample gallery uses placeholder photos");
    assert.equal(fr.heroImage, null);
    assert.equal(fr.envelopePhoto, null);
  });

  test("renderer dispatch is wired for burgundy-gold", () => {
    const clientPath = path.join(ROOT, "components/invitation/blocks/InvitationBlocksLayoutClient.tsx");
    const src = fs.readFileSync(clientPath, "utf8");
    assert.match(src, /BurgundyGoldPageTemplate/);
    assert.match(src, /burgundy-gold\/BurgundyGoldPageTemplate/);
    assert.match(src, /resolvedTemplateId === "burgundy-gold"/);
    const rendererPath = path.join(ROOT, "components/invitation/templates/burgundy-gold/BurgundyGoldPageTemplate.tsx");
    assert.ok(fs.existsSync(rendererPath), "burgundy-gold renderer file must exist");
    const rendererSrc = fs.readFileSync(rendererPath, "utf8");
    assert.match(rendererSrc, /data-burgundy-page="true"/);
    assert.match(rendererSrc, /data-burgundy-gate="true"/);
    // The backdrop now lives in the artwork module; the renderer mounts it.
    assert.match(rendererSrc, /<PageBackdrop\s*\/>/);
    assert.doesNotMatch(rendererSrc, /translate=/);
  });
});
