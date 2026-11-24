/**
 * lib/__tests__/invitation-manifest-message-keys.test.cjs
 *
 * Every label / groupLabel / helper / slotLabels key declared by a template
 * manifest is rendered through `useTranslations("Events")` in
 * TemplateFieldsSection. A key missing from messages/en.json or messages/fr.json
 * therefore leaks a raw key ("Events.manifestOpeningPhoto") into the builder UI.
 *
 * This test walks every registered template manifest and asserts each key
 * resolves to a non-empty string in the Events namespace of both files.
 * Source-level only: no DB, no render, no network.
 */

const assert = require("node:assert/strict");
const { test, describe } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const Module = require("node:module");

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

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { INVITATION_TEMPLATE_REGISTRY } = require("@/lib/invitation-template-registry.ts");
const { getInvitationTemplateManifest } = require("@/lib/invitation-template-manifests.ts");

const MESSAGES = {
  en: JSON.parse(fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8")),
  fr: JSON.parse(fs.readFileSync(path.join(ROOT, "messages/fr.json"), "utf8")),
};

/** Every manifest label reference, tagged with where it came from. */
function manifestLabelRefs(manifest) {
  const refs = [];
  for (const field of manifest.fields) {
    const add = (kind, label) => {
      if (label && label.key) refs.push({ field: field.key, kind, key: label.key });
    };
    add("label", field.label);
    add("groupLabel", field.groupLabel);
    add("helper", field.helper);
    (field.slotLabels || []).forEach((slot, index) => add(`slotLabels[${index}]`, slot));
  }
  return refs;
}

describe("template manifest message keys", () => {
  const templateIds = Object.keys(INVITATION_TEMPLATE_REGISTRY).filter(
    (id) => getInvitationTemplateManifest(id) != null
  );

  test("at least one registered template declares a manifest (guard against an empty sweep)", () => {
    assert.ok(templateIds.length > 0, "no registered template has a manifest");
  });

  for (const templateId of templateIds) {
    test(`${templateId}: every manifest key exists in en.json and fr.json under Events`, () => {
      const manifest = getInvitationTemplateManifest(templateId);
      assert.ok(manifest, `missing manifest for ${templateId}`);

      const refs = manifestLabelRefs(manifest);
      assert.ok(refs.length > 0, `${templateId} manifest declares no labels`);

      const missingEn = [];
      const missingFr = [];
      const blankEn = [];
      const blankFr = [];

      for (const ref of refs) {
        const en = MESSAGES.en.Events?.[ref.key];
        const fr = MESSAGES.fr.Events?.[ref.key];
        if (typeof en !== "string") missingEn.push(`${ref.field}:${ref.kind}:${ref.key}`);
        else if (!en.trim()) blankEn.push(`${ref.field}:${ref.kind}:${ref.key}`);
        if (typeof fr !== "string") missingFr.push(`${ref.field}:${ref.kind}:${ref.key}`);
        else if (!fr.trim()) blankFr.push(`${ref.field}:${ref.kind}:${ref.key}`);
      }

      assert.deepEqual(missingEn, [], `keys missing from messages/en.json (Events): ${missingEn.join(", ")}`);
      assert.deepEqual(missingFr, [], `keys missing from messages/fr.json (Events): ${missingFr.join(", ")}`);
      assert.deepEqual(blankEn, [], `blank strings in messages/en.json (Events): ${blankEn.join(", ")}`);
      assert.deepEqual(blankFr, [], `blank strings in messages/fr.json (Events): ${blankFr.join(", ")}`);
    });
  }

  test("burgundy opening keys resolve in both locales", () => {
    const manifest = getInvitationTemplateManifest("burgundy-gold");
    assert.ok(manifest, "burgundy-gold manifest missing");
    const keys = manifestLabelRefs(manifest)
      .filter((ref) => ref.key.startsWith("manifestOpening") || ref.key === "manifestGroupOpening")
      .map((ref) => ref.key);
    assert.deepEqual(
      [...new Set(keys)].sort(),
      ["manifestGroupOpening", "manifestOpeningMessage", "manifestOpeningPhoto"]
    );
    for (const key of [...new Set(keys)]) {
      assert.equal(typeof MESSAGES.en.Events?.[key], "string", `en missing ${key}`);
      assert.equal(typeof MESSAGES.fr.Events?.[key], "string", `fr missing ${key}`);
    }
  });
});
