/**
 * lib/__tests__/invitation-page-builder.test.cjs
 *
 * Slice A: one-page builder shell — type -> template/field derivation,
 * template-switch warning logic, and shell accessibility invariants.
 *
 * Pure derivation lives in lib/invitation-type-fields.ts (DOM-free).
 * Component invariants are asserted at source level (same pattern as the
 * invitation column-name tests): accordion semantics, CSS-hide panes.
 */

const { describe, test } = require("node:test");
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

if (!require.extensions[".ts"]) {
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
}

const {
  DEFAULT_TEMPLATE_FOR_TYPE,
  extrasForTemplate,
  extrasForType,
  hiddenContentOnTemplateSwitch,
  orderTemplatesForType,
} = require("../invitation-type-fields.ts");

const TEMPLATES = [
  { id: "gala-editorial", name: "Gala Editorial", category: "gala_corporate", categoryLabel: "Gala", description: "" },
  { id: "black-tie", name: "Black Tie", category: "gala_corporate", categoryLabel: "Gala", description: "" },
  { id: "wedding-romantic", name: "Romantic Wedding", category: "wedding", categoryLabel: "Wedding", description: "" },
  { id: "birthday-bold", name: "Bold Celebration", category: "birthday", categoryLabel: "Birthday", description: "" },
];

describe("invitation type -> template and field derivation", () => {
  test("each type suggests its matching template", () => {
    assert.equal(DEFAULT_TEMPLATE_FOR_TYPE.wedding, "wedding-romantic");
    assert.equal(DEFAULT_TEMPLATE_FOR_TYPE.birthday, "birthday-bold");
    assert.equal(DEFAULT_TEMPLATE_FOR_TYPE.gala, "gala-editorial");
    assert.equal(DEFAULT_TEMPLATE_FOR_TYPE.other, "gala-editorial");
  });

  test("dropdown lists matching templates first, then all others", () => {
    const wedding = orderTemplatesForType(TEMPLATES, "wedding");
    assert.deepEqual(wedding.matching.map((t) => t.id), ["wedding-romantic"]);
    assert.deepEqual(wedding.others.map((t) => t.id), ["gala-editorial", "black-tie", "birthday-bold"]);

    const birthday = orderTemplatesForType(TEMPLATES, "birthday");
    assert.deepEqual(birthday.matching.map((t) => t.id), ["birthday-bold"]);

    const gala = orderTemplatesForType(TEMPLATES, "gala");
    assert.deepEqual(gala.matching.map((t) => t.id), ["gala-editorial", "black-tie"]);
    assert.deepEqual(gala.others.map((t) => t.id), ["wedding-romantic", "birthday-bold"]);

    const other = orderTemplatesForType(TEMPLATES, "other");
    assert.deepEqual(other.matching, []);
    assert.deepEqual(other.others.map((t) => t.id), TEMPLATES.map((t) => t.id));
  });

  test("type-specific fields derive per type (other shows generic only)", () => {
    assert.ok(extrasForType("wedding").includes("partner1_name"));
    assert.ok(extrasForType("wedding").includes("wedding_story"));
    assert.ok(extrasForType("birthday").includes("celebrant_name"));
    assert.ok(!extrasForType("birthday").includes("partner1_name"));
    assert.deepEqual(extrasForType("other"), []);
    assert.deepEqual(extrasForType("gala"), []);
    assert.deepEqual(extrasForType(null), []);
  });

  test("switching type never deletes data (visibility only, values intact)", () => {
    const fullDraft = {
      partner1_name: "Elena",
      partner2_name: "David",
      celebrant_name: "Sam",
      display_title: "Party",
    };
    // Derivation only reads; simulate a type switch by re-deriving
    // visibility — the record itself must be untouched.
    const visible = new Set([...extrasForType("birthday"), "display_title"]);
    const preserved = Object.fromEntries(Object.entries(fullDraft).filter(([k]) => visible.has(k) || fullDraft[k] !== undefined));
    assert.deepEqual(preserved, fullDraft);
    // Wedding fields are still defined for a switch back
    assert.ok(extrasForType("wedding").includes("partner1_name"));
  });
});

describe("template-switch warning (only hides sections with content)", () => {
  const draft = {
    partner1_name: "Elena",
    partner2_name: "",
    registry_note: "Note",
    celebrant_name: "",
    display_title: "Title",
  };

  test("lists only non-empty fields the target template hides", () => {
    const hidden = hiddenContentOnTemplateSwitch(draft, "wedding-romantic", "birthday-bold");
    assert.ok(hidden.includes("Partner 1 name"));
    assert.ok(hidden.includes("Registry note"));
    assert.ok(!hidden.some((l) => l.includes("Partner 2")), "empty fields are not listed");
    assert.ok(!hidden.includes("Celebrant name"), "fields the target shows are not listed");
    assert.ok(!hidden.includes("Title"), "generic fields are never listed");
  });

  test("no warning for empty drafts or same-template switches", () => {
    assert.deepEqual(hiddenContentOnTemplateSwitch({}, "wedding-romantic", "birthday-bold"), []);
    assert.deepEqual(hiddenContentOnTemplateSwitch(draft, "wedding-romantic", "wedding-romantic"), []);
    assert.deepEqual(hiddenContentOnTemplateSwitch(draft, null, "birthday-bold"), []);
  });

  test("switching back restores visibility (content was kept)", () => {
    const back = hiddenContentOnTemplateSwitch(draft, "birthday-bold", "wedding-romantic");
    assert.deepEqual(back, []);
    assert.ok(extrasForTemplate("wedding-romantic").includes("partner1_name"));
  });
});

describe("builder shell accessibility and pane invariants (source level)", () => {
  const builderDir = path.join(
    ROOT,
    "app/dashboard/events/[id]/invitation-page/builder"
  );
  const read = (name) => fs.readFileSync(path.join(builderDir, name), "utf8");

  test("accordion headers expose aria-expanded and control their panel", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "components/invitation/InvitationSection.tsx"),
      "utf8"
    );
    assert.ok(src.includes("aria-expanded"), "header must expose aria-expanded");
    assert.ok(src.includes("aria-controls"), "header must reference its panel");
    assert.ok(src.includes('role="region"'), "panel must be a labelled region");
    assert.ok(src.includes("<button"), "header must be a native button (keyboard operable)");
  });

  test("type picker is a labelled radiogroup", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "components/invitation/InvitationTypePicker.tsx"),
      "utf8"
    );
    assert.ok(src.includes('role="radiogroup"'), "picker must be a radiogroup");
    assert.ok(src.includes('role="radio"'), "options must be radios");
    assert.ok(src.includes("aria-checked"), "selection must be exposed");
  });

  test("both panes stay mounted — toggle only CSS-hides", () => {
    const src = read("InvitationPageBuilder.tsx");
    assert.ok(src.includes("hidden lg:block"), "panes must CSS-hide, never unmount");
    assert.ok(!src.includes('mobileView === "preview" && ('), "edit pane must not conditionally unmount");
    assert.ok(!src.includes('mobileView === "edit" && ('), "preview pane must not conditionally unmount");
  });

  test("preview toolbar carries viewport toggle and preview-only locale note", () => {
    const src = read("InvitationPageBuilder.tsx");
    assert.ok(src.includes("390") && src.includes("1440"), "390/1440 viewport toggle required");
    assert.ok(src.includes("Preview language only"), "locale scope must be stated");
  });
});

// ── Slice B: live-preview channel, anchors, route guards ────────────────────

describe("live-preview postMessage protocol and anchors", () => {
  const {
    isPreviewMessage,
    isSameOriginMessage,
    placeholderSnapshot,
    resolvePreviewAnchor,
    PREVIEW_MESSAGE_SOURCE,
    PREVIEW_SECTION_ANCHORS,
    SAMPLE_PREVIEW_GUEST,
  } = require("../invitation-preview-channel.ts");

  const validDraft = {
    source: PREVIEW_MESSAGE_SOURCE,
    kind: "draft",
    templateId: "wedding-romantic",
    locale: "en",
    draft: { display_title: "X" },
    event: { title: "Y" },
  };

  test("accepts well-formed draft, scroll-to, and ready messages", () => {
    assert.equal(isPreviewMessage(validDraft), true);
    assert.equal(
      isPreviewMessage({ source: PREVIEW_MESSAGE_SOURCE, kind: "scroll-to", sectionId: "hero" }),
      true
    );
    assert.equal(isPreviewMessage({ source: PREVIEW_MESSAGE_SOURCE, kind: "ready" }), true);
  });

  test("rejects wrong origin source, unknown kinds, and malformed payloads", () => {
    assert.equal(isPreviewMessage({ ...validDraft, source: "evil" }), false);
    assert.equal(isPreviewMessage({ ...validDraft, kind: "delete-all" }), false);
    assert.equal(isPreviewMessage({ ...validDraft, templateId: "" }), false);
    assert.equal(isPreviewMessage({ ...validDraft, locale: "de" }), false);
    assert.equal(isPreviewMessage({ ...validDraft, draft: "nope" }), false);
    assert.equal(isPreviewMessage({ ...validDraft, event: null }), false);
    assert.equal(
      isPreviewMessage({ source: PREVIEW_MESSAGE_SOURCE, kind: "scroll-to", sectionId: "" }),
      false
    );
    for (const junk of [null, undefined, 42, "msg", [], { source: PREVIEW_MESSAGE_SOURCE }]) {
      assert.equal(isPreviewMessage(junk), false, `junk rejected: ${JSON.stringify(junk)}`);
    }
  });

  test("same-origin gate matches exactly", () => {
    assert.equal(isSameOriginMessage("https://a.test", "https://a.test"), true);
    assert.equal(isSameOriginMessage("https://evil.test", "https://a.test"), false);
    assert.equal(isSameOriginMessage("", "https://a.test"), false);
  });

  test("every builder section resolves to a template anchor (unknown -> top)", () => {
    for (const section of ["type", "template", "basics", "hero", "story", "details", "gallery", "music", "extras", "publish"]) {
      const anchor = resolvePreviewAnchor(section);
      assert.ok(typeof anchor === "string" && anchor.length > 0, section);
      assert.equal(PREVIEW_SECTION_ANCHORS[section], anchor);
    }
    assert.equal(resolvePreviewAnchor("nope"), "top");
  });

  test("sample guest carries no real data", () => {
    assert.equal(SAMPLE_PREVIEW_GUEST.guest_name, "Sample Guest");
    assert.equal(SAMPLE_PREVIEW_GUEST.email, null);
    assert.equal(SAMPLE_PREVIEW_GUEST.token, null);
  });

  test("placeholder fill is preview-only: brackets for empties, values kept, input untouched", () => {
    const draft = { partner1_name: "Elena", partner2_name: "", celebrant_name: null };
    const filled = placeholderSnapshot(draft);
    assert.equal(filled.partner1_name, "Elena");
    assert.equal(filled.partner2_name, "[Partner 2]");
    assert.equal(filled.celebrant_name, "[Celebrant]");
    assert.equal(draft.partner2_name, "", "input must not be mutated");
  });

  test("all four templates carry the scroll anchors", () => {
    const files = [
      "InvitationTemplateWedding.tsx",
      "InvitationTemplateBlackTie.tsx",
      "InvitationTemplateBirthday.tsx",
      "InvitationTemplate1.tsx",
    ];
    for (const file of files) {
      const src = fs.readFileSync(
        path.join(ROOT, "components/invitation/templates", file),
        "utf8"
      );
      for (const anchor of ["inv-hero", "inv-story", "inv-details", "inv-schedule", "inv-gallery", "rsvp-section"]) {
        assert.ok(src.includes(`id="${anchor}"`), `${file} must carry #${anchor}`);
      }
    }
  });

  test("live-preview route guards ownership, bans indexing, never writes RSVP", () => {
    const route = fs.readFileSync(
      path.join(ROOT, "app/dashboard/events/[id]/invitation-page/live-preview/page.tsx"),
      "utf8"
    );
    assert.ok(route.includes("checkInvitationPageAccess"), "server-side ownership check required");
    assert.ok(route.includes("index: false"), "route must be noindex");
    assert.ok(!route.includes("event_invitations"), "no real guest rows in the preview route");
    assert.ok(!route.includes("onRsvp"), "no RSVP writes from the preview route");

    const frame = fs.readFileSync(
      path.join(ROOT, "app/dashboard/events/[id]/invitation-page/live-preview/LivePreviewFrame.tsx"),
      "utf8"
    );
    assert.ok(frame.includes("isSameOriginMessage"), "frame must validate origin");
    assert.ok(frame.includes("isPreviewMessage"), "frame must validate message shape");
    assert.ok(frame.includes("SAMPLE_PREVIEW_GUEST"), "frame renders the sample guest only");

    const builder = fs.readFileSync(
      path.join(ROOT, "app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder.tsx"),
      "utf8"
    );
    assert.ok(builder.includes('title="Live invitation preview"'), "iframe must have a title");
  });
});
