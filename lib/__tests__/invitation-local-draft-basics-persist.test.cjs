/**
 * lib/__tests__/invitation-local-draft-basics-persist.test.cjs
 *
 * Regression test for the Basics-only autosave loss bug: editing only the
 * Event Title (or Date/Venue/City) in the anonymous builder's Basics
 * section must survive a reload. handleLocalBasicsUpdate lives inside a
 * React hook (useLocalInvitationBuilderAdapters.ts) and cannot run outside
 * a browser/React renderer — same constraint already documented in
 * lib/__tests__/scanner-sync-validation.test.cjs for lib/offline-scanner-db.ts.
 * So this file:
 *   1. Exercises the real, pure envelope functions
 *      (createInvitationLocalDraft/updateInvitationLocalDraft) the same way
 *      handleLocalBasicsUpdate's fixed body now does, and asserts the title
 *      survives into the envelope that loadInvitationLocalDraft would read
 *      back on reload — i.e. the exact payload shape the fix produces.
 *   2. Asserts the hook's compiled source actually calls
 *      saveInvitationLocalDraft from inside handleLocalBasicsUpdate (the
 *      previous bug: the function only updated an in-memory ref and never
 *      persisted anything by itself).
 */
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

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

const Module = require("node:module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const {
  createInvitationLocalDraft,
  updateInvitationLocalDraft,
} = require("@/lib/invitation-local-draft.ts");

describe("Basics-only local draft edits survive a reload", () => {
  test("a title-only edit, replayed through the same envelope-merge logic handleLocalBasicsUpdate now uses, persists the title", () => {
    const draftId = "test-draft-id";
    const builderDraft = { template_id: "minimalism-dark-blue", locale: "en", display_title: null };

    // Initial envelope, as if the user had never touched Basics yet.
    let envelope = createInvitationLocalDraft(draftId, {
      templateId: "minimalism-dark-blue",
      title: "",
      eventDate: null,
      venue: null,
      address: null,
      city: null,
      builderDraft,
      images: {},
    });

    // Simulate ONLY a title edit — no other field, no other draft-level
    // autosave in between. This is the exact fullPayload shape
    // handleLocalBasicsUpdate's fixed body constructs and saves immediately.
    const basicsRefCurrent = { title: "Layer4 Persistence Check", eventDate: null, venue: null, address: null, city: null };
    const fullPayload = { ...envelope.payload, ...basicsRefCurrent };
    envelope = updateInvitationLocalDraft(envelope, fullPayload);

    // What loadInvitationLocalDraft + toEvent would hand back to the
    // builder on reload:
    assert.strictEqual(envelope.payload.title, "Layer4 Persistence Check");
    // Unrelated draft content must be untouched by a basics-only edit.
    assert.deepEqual(envelope.payload.builderDraft, builderDraft);
    assert.strictEqual(envelope.payload.templateId, "minimalism-dark-blue");
  });

  test("handleLocalBasicsUpdate's source calls saveInvitationLocalDraft immediately, not only on the next draft autosave", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "components/invitation/useLocalInvitationBuilderAdapters.ts"),
      "utf8"
    );
    const fnMatch = src.match(/const handleLocalBasicsUpdate = useCallback\(\s*\(patch: Record<string, unknown>\) => \{([\s\S]*?)\},\s*\[draftId\]\s*\);/);
    assert.ok(fnMatch, "handleLocalBasicsUpdate not found in expected shape");
    const body = fnMatch[1];
    assert.ok(body.includes("basicsRef.current ="), "must still update basicsRef for the in-session UI");
    assert.ok(body.includes("void saveInvitationLocalDraft(envelopeRef.current)"), "must persist immediately, not defer to the next unrelated draft autosave");
  });
});
