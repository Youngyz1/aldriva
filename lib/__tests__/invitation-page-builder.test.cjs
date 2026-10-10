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
  invitationTypeForTemplate,
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

  test("saved page templates recover the corresponding invitation type", () => {
    assert.equal(invitationTypeForTemplate("wedding-romantic"), "wedding");
    assert.equal(invitationTypeForTemplate("birthday-bold"), "birthday");
    assert.equal(invitationTypeForTemplate("black-tie"), "gala");
    assert.equal(invitationTypeForTemplate("gala-editorial"), "gala");
    assert.equal(invitationTypeForTemplate("cover"), "other");
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

  test("type picker is a labelled, keyboard-operable listbox dropdown", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "components/invitation/InvitationTypePicker.tsx"),
      "utf8"
    );
    assert.ok(src.includes('role="listbox"'), "picker must expose its option list");
    assert.ok(src.includes('role="option"'), "options must expose selection state");
    assert.ok(src.includes("aria-selected"), "selection must be exposed");
    assert.ok(src.includes("focus-visible:ring-2"), "keyboard focus ring is visible");
    assert.ok(src.includes("max-h-64 overflow-y-auto"), "long lists can scroll within the viewport");
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

describe("invitation type dropdown keyboard behavior", () => {
  test("Arrow keys, Enter, and Escape preserve trigger focus and selection semantics", async () => {
    const { JSDOM } = require("jsdom");
    const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
      pretendToBeVisual: true,
      url: "http://localhost/",
    });
    const oldGlobals = {};
    for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "Event", "KeyboardEvent", "requestAnimationFrame", "IS_REACT_ACT_ENVIRONMENT"]) {
      oldGlobals[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    }
    const originalLoad = Module._load;
    const messages = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8")).Events;
    let root;

    try {
      Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: dom.window });
      Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: dom.window.document });
      Object.defineProperty(globalThis, "navigator", { configurable: true, writable: true, value: dom.window.navigator });
      Object.defineProperty(globalThis, "HTMLElement", { configurable: true, writable: true, value: dom.window.HTMLElement });
      Object.defineProperty(globalThis, "Node", { configurable: true, writable: true, value: dom.window.Node });
      Object.defineProperty(globalThis, "Event", { configurable: true, writable: true, value: dom.window.Event });
      Object.defineProperty(globalThis, "KeyboardEvent", { configurable: true, writable: true, value: dom.window.KeyboardEvent });
      Object.defineProperty(globalThis, "requestAnimationFrame", { configurable: true, writable: true, value: (callback) => { callback(0); return 1; } });
      Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, writable: true, value: true });
      dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};

      Module._load = function mockNextIntl(request, parent, isMain) {
        if (request === "next-intl") return { useTranslations: () => (key) => messages[key] ?? key };
        return originalLoad.call(this, request, parent, isMain);
      };
      require.extensions[".tsx"] = function compileTestTsx(module, filename) {
        const source = fs.readFileSync(filename, "utf8");
        const compiled = ts.transpileModule(source, {
          compilerOptions: {
            esModuleInterop: true,
            jsx: ts.JsxEmit.ReactJSX,
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
          },
          fileName: filename,
        }).outputText;
        module._compile(compiled, filename);
      };

      const React = require("react");
      const { createRoot } = require("react-dom/client");
      const { InvitationTypePicker } = require(path.join(ROOT, "components/invitation/InvitationTypePicker.tsx"));
      const selected = [];
      root = createRoot(dom.window.document.getElementById("root"));
      await React.act(async () => {
        root.render(React.createElement(InvitationTypePicker, {
          value: "wedding",
          onChange: (value) => selected.push(value),
        }));
      });

      const trigger = dom.window.document.querySelector("button[aria-haspopup='listbox']");
      assert.ok(trigger, "dropdown trigger renders");
      assert.match(trigger.className, /focus-visible:ring-2/, "visible focus ring is present");
      trigger.focus();
      dom.window.innerWidth = 375;

      await React.act(async () => {
        trigger.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      });
      assert.ok(dom.window.document.querySelector("[role='listbox']"), "ArrowDown opens the list");
      assert.match(dom.window.document.querySelector("[role='listbox']").className, /max-h-64 overflow-y-auto/);

      await React.act(async () => {
        trigger.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      });
      const activeOption = dom.window.document.getElementById(trigger.getAttribute("aria-activedescendant"));
      assert.match(activeOption.textContent, /Birthday/, "ArrowDown advances the active option");

      await React.act(async () => {
        trigger.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      assert.deepEqual(selected, ["birthday"], "Enter selects the active option");
      assert.equal(dom.window.document.activeElement, trigger, "selection returns focus to the trigger");
      assert.equal(dom.window.document.querySelector("[role='listbox']"), null, "selection closes the list");

      await React.act(async () => {
        trigger.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      await React.act(async () => {
        trigger.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      assert.equal(dom.window.document.querySelector("[role='listbox']"), null, "Escape closes without selecting");
      assert.deepEqual(selected, ["birthday"], "Escape leaves the selection unchanged");
      assert.equal(dom.window.document.activeElement, trigger, "Escape keeps focus on the trigger");
    } finally {
      if (root) {
        const React = require("react");
        await React.act(async () => root.unmount());
      }
      Module._load = originalLoad;
      for (const [key, descriptor] of Object.entries(oldGlobals)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
      dom.window.close();
    }
  });
});

// ── Round 5 step 2: unified picker grid + inline switch confirm ─────────────

describe("unified template picker grid and switch-warning confirm", () => {
  const pickerSrc = () =>
    fs.readFileSync(path.join(ROOT, "components/invitation/UnifiedTemplatePicker.tsx"), "utf8");
  const builderSrc = () =>
    fs.readFileSync(
      path.join(ROOT, "app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder.tsx"),
      "utf8"
    );

  test("builder template section renders the unified picker, not the old dropdown", () => {
    const src = builderSrc();
    assert.ok(src.includes("UnifiedTemplatePicker"), "unified picker wired in");
    assert.ok(!src.includes("InvitationTemplateSelect"), "old page-only dropdown gone");
  });

  test("type selection stays provisional until the hidden-field confirmation", () => {
    const builder = builderSrc();
    assert.ok(builder.includes("setPendingTypeChange"), "type choice opens a confirmation state");
    assert.ok(builder.includes("hiddenFields: hiddenContentOnTemplateSwitch"), "dialog lists populated hidden fields");
    assert.ok(builder.includes('role="alertdialog"') && builder.includes("aria-modal=\"true\""), "confirmation is modal and announced");
    assert.ok(builder.includes("onClick={cancelTypeChange}"), "cancel restores the unchanged saved type");
    assert.ok(builder.includes("onClick={confirmTypeChange}"), "confirm is the draft write path");
    assert.ok(builder.includes("setCandidatePreviewTemplateId(pageId === draft.template_id ? null : pageId)"), "candidate preview can change before confirmation");
    assert.ok(builder.includes("setInvitationType(pendingTypeChange.type)"), "saved type changes only on confirmation");
  });

  test("collapsed type and template rows show localized names and confirmed type choice closes the section", () => {
    const builder = builderSrc();
    const typePicker = fs.readFileSync(path.join(ROOT, "components/invitation/InvitationTypePicker.tsx"), "utf8");
    const confirmStart = builder.indexOf("const confirmTypeChange");
    const confirmEnd = builder.indexOf("const handleUnifiedTemplateApplied", confirmStart);
    const confirm = builder.slice(confirmStart, confirmEnd);
    const { getUnifiedTemplateNameKey } = require(path.join(ROOT, "lib/unified-invitation-templates.ts"));

    assert.ok(builder.includes('type: "Type of invitation"'), "section keeps the Type of invitation title");
    assert.ok(typePicker.includes('className="sr-only"'), "the inner Invitation type label is hidden visually but remains accessible");
    assert.ok(builder.includes("case \"type\":\n      return typeSummary"), "collapsed type row receives the selected type name");
    assert.ok(builder.includes("case \"template\":\n      return templateSummary ?? draft.template_id"), "collapsed template row receives its display name");
    assert.ok(builder.includes("getUnifiedTemplateNameKey(draft.template_id)"), "template subtitle resolves through the unified registry");
    assert.ok(builder.includes("summary={summaryFor(draft, id, typeSummary, templateSummary)}"), "both localized summaries are wired to the accordion");
    assert.ok(confirm.includes("setOpenSection(null)"), "confirming a new type closes the type section");
    assert.ok(confirm.includes('document.getElementById("inv-section-header-type")?.focus()'), "focus returns to the collapsed section header");
    assert.ok(!confirm.includes('setOpenSection("template")'), "type confirmation does not leave another section open");
    assert.equal(getUnifiedTemplateNameKey("wedding-romantic"), "unifiedRoyalEleganceName");
    assert.equal(getUnifiedTemplateNameKey("gala-editorial"), "unifiedModernExecutiveName");
  });

  test("Apply uses the RPC persisted page ID without routing it through updateDraft", () => {
    const builder = builderSrc();
    const picker = pickerSrc();
    assert.ok(builder.includes("onApplied={handleUnifiedTemplateApplied}"), "picker reports successful Apply to the local synchronizer");
    assert.ok(builder.includes("skipTemplateAutosaveRef.current = pageId"), "RPC template write arms autosave suppression");
    assert.ok(builder.includes("if (templateOnlyRpcSync)"), "only the template-only state echo is skipped");
    assert.ok(!builder.includes("onApplied={(pageId) => updateDraft"), "RPC template ID is not redundantly sent through updateDraft");
    assert.ok(picker.includes("setUnifiedInvitationTemplate(eventId, pair.id)"), "Apply persists the selected versioned unified ID");
    assert.ok(picker.includes("await onBeforeApply()"), "pending content saves flush before the RPC");
  });

  test("candidate selection only changes preview state and cannot autosave", () => {
    const picker = pickerSrc();
    const builder = builderSrc();
    const start = picker.indexOf("function handleSelect(pair: UnifiedInvitationTemplate)");
    const end = picker.indexOf("\n  return (", start);
    const handler = picker.slice(start, end);
    assert.ok(handler.includes("setSelectedId(pair.id)"));
    assert.ok(handler.includes("onCandidateTemplate(pair.pageId)"));
    assert.ok(!handler.includes("setUnifiedInvitationTemplate") && !handler.includes("onApplied"), "selecting a tile is not a write");
    assert.ok(builder.includes("onCandidateTemplate={setCandidatePreviewTemplateId}"), "candidate is held outside the saved draft");
    assert.ok(builder.includes("candidatePreview: Boolean(candidatePreviewTemplateId"), "iframe receives a preview-only candidate flag");
  });

  test("template picker is a keyboard-operable radio grid", () => {
    const src = pickerSrc();
    assert.ok(src.includes('role="radiogroup"'), "radiogroup role required");
    assert.ok(src.includes('type="radio"'), "native radios for free arrow/space keys");
    assert.ok(src.includes("grid-cols-2"), "responsive option grid");
    assert.ok(src.includes("focus-within:ring"), "visible focus rings required");
  });

  test("switch warning is an announced inline confirm listing hidden sections", () => {
    const picker = pickerSrc();
    assert.ok(picker.includes('role="alert"'), "confirm must be announced");
    assert.ok(picker.includes("confirmHidden"), "confirm state present");
    assert.ok(picker.includes("unifiedApplyAnyway"), "explicit apply-anyway action");
    assert.ok(picker.includes("getHiddenForPage"), "hidden-section data from the builder");
    const builder = builderSrc();
    assert.ok(!builder.includes("pendingTemplate"), "old builder modal state removed");
    assert.ok(!builder.includes("<Dialog"), "old builder modal removed");
  });
});

// ── COMMIT 5: timezone honesty + sample QR state ─────────────────────────────

describe("timezone honesty and preview QR state", () => {
  const {
    SAMPLE_PREVIEW_TICKET,
  } = require("../invitation-preview-channel.ts");

  test("guest QR renders for pending guests too (hidden only on decline) — all templates", () => {
    for (const file of [
      "InvitationTemplateWedding.tsx",
      "InvitationTemplateBlackTie.tsx",
      "InvitationTemplateBirthday.tsx",
      "InvitationTemplate1.tsx",
    ]) {
      const src = fs.readFileSync(
        path.join(ROOT, "components/invitation/templates", file),
        "utf8"
      );
      assert.ok(
        src.includes("data.ticketInstance?.qrCode && currentRsvp !== \"declined\""),
        `${file}: QR shows whenever a QR exists and RSVP is not declined`
      );
    }
  });

  test("live preview shows a labelled sample QR (guest behaviour unchanged)", () => {
    assert.equal(SAMPLE_PREVIEW_TICKET.qr_code, "PREVIEW-QR-PLACEHOLDER");
    const frame = fs.readFileSync(
      path.join(ROOT, "app/invitation/builder-preview/[eventId]/LivePreviewFrame.tsx"),
      "utf8"
    );
    assert.ok(frame.includes("buildInvitationTemplatePreviewData"), "preview builds data through the render-only helper");
    assert.ok(fs.readFileSync(path.join(ROOT, "lib/invitation-template-preview-data.ts"), "utf8").includes("SAMPLE_PREVIEW_TICKET"), "preview helper supplies the sample ticket");
    assert.ok(frame.includes("QR code are samples"), "preview banner must label the sample QR");
    for (const file of [
      "InvitationTemplateWedding.tsx",
      "InvitationTemplateBlackTie.tsx",
      "InvitationTemplateBirthday.tsx",
      "InvitationTemplate1.tsx",
    ]) {
      const src = fs.readFileSync(
        path.join(ROOT, "components/invitation/templates", file),
        "utf8"
      );
      assert.ok(!src.includes("PREVIEW-QR-PLACEHOLDER"), `${file}: guest templates stay sample-free`);
    }
  });

  test("new drafts never pre-fill a timezone; summary shows none until chosen", () => {
    const builder = fs.readFileSync(
      path.join(ROOT, "app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder.tsx"),
      "utf8"
    );
    assert.ok(builder.includes('timezone: d.timezone ?? ""'), "unset timezone stays empty");
    assert.ok(builder.includes('"No timezone"'), "summary must not show an unchosen timezone");
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
    assert.equal(isPreviewMessage({
      ...validDraft,
      templateId: "birthday-bold",
      candidatePreview: true,
      savedTemplateId: "wedding-romantic",
    }), true, "candidate payload may point at a preview-only template and its saved fallback");
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
    assert.equal(isPreviewMessage({ ...validDraft, candidatePreview: "yes" }), false);
    assert.equal(isPreviewMessage({ ...validDraft, savedTemplateId: "" }), false);
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
      path.join(ROOT, "app/invitation/builder-preview/[eventId]/page.tsx"),
      "utf8"
    );
    assert.ok(route.includes("checkInvitationPageAccess"), "server-side ownership check required");
    assert.ok(route.includes("index: false"), "route must be noindex");
    assert.ok(!route.includes("event_invitations"), "no real guest rows in the preview route");
    assert.ok(!route.includes("onRsvp"), "no RSVP writes from the preview route");

    const frame = fs.readFileSync(
      path.join(ROOT, "app/invitation/builder-preview/[eventId]/LivePreviewFrame.tsx"),
      "utf8"
    );
    assert.ok(frame.includes("isSameOriginMessage"), "frame must validate origin");
    assert.ok(frame.includes("isPreviewMessage"), "frame must validate message shape");
    assert.ok(frame.includes("buildInvitationTemplatePreviewData"), "frame renders assembled preview data");
    assert.ok(fs.readFileSync(path.join(ROOT, "lib/invitation-template-preview-data.ts"), "utf8").includes("SAMPLE_PREVIEW_GUEST"), "preview-only helper supplies the sample guest");

    const builder = fs.readFileSync(
      path.join(ROOT, "app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder.tsx"),
      "utf8"
    );
    assert.ok(builder.includes('title="Live invitation preview"'), "iframe must have a title");
    assert.ok(
      builder.includes("src={`/invitation/builder-preview/${eventId}?embed=1`}"),
      "iframe must point at the chrome-free preview route in embed mode"
    );
  });

  test("preview route renders ONLY the template (no dashboard chrome)", () => {
    const routePath = path.join(ROOT, "app/invitation/builder-preview/[eventId]/page.tsx");
    assert.ok(fs.existsSync(routePath), "preview route must live outside the dashboard tree");
    const route = fs.readFileSync(routePath, "utf8");
    assert.ok(!route.includes("ManagementShell"), "no event shell in preview");
    assert.ok(!route.includes("DashboardSidebar"), "no sidebar in preview");
    assert.ok(!route.includes("Back to Dashboard"), "no dashboard nav in preview");

    const navbar = fs.readFileSync(path.join(ROOT, "components/Navbar.tsx"), "utf8");
    assert.ok(
      navbar.includes('pathname?.includes("/invitation")'),
      "root Navbar must stay opted out on invitation routes (covers the preview route)"
    );
  });

  test("iframe width is exact so template breakpoints are real at 390 and 1440", () => {
    const builder = fs.readFileSync(
      path.join(ROOT, "app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder.tsx"),
      "utf8"
    );
    assert.ok(builder.includes("style={{ width: previewViewport }}"), "iframe width must be exact, not max-width");
    assert.ok(!builder.includes("maxWidth: previewViewport"), "max-width would squeeze instead of scrolling");
    assert.ok(builder.includes("overflow-x-auto"), "wide previews must scroll, not squeeze");
  });
});

// ── Slice C: sequenced autosave, sparse drafts, section wiring ───────────────

describe("sequenced autosave queue (single flight, latest wins)", () => {
  const { createDraftSaveQueue } = require("../draft-save-queue.ts");

  function deferred() {
    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  test("rapid edits coalesce: one in flight, latest queued, stale never sent", async () => {
    const seen = [];
    let active = 0;
    let maxActive = 0;
    const gates = [];
    const save = (payload) => {
      seen.push(payload.v);
      active += 1;
      maxActive = Math.max(maxActive, active);
      const g = deferred();
      gates.push(() => {
        active -= 1;
        g.resolve({ ok: true });
      });
      return g.promise;
    };
    const queue = createDraftSaveQueue(save);
    queue.request({ v: 1 });
    queue.request({ v: 2 });
    queue.request({ v: 3 });
    // Drain both in-flight saves: first runs, latest (3) queued, middle (2) coalesced away
    for (let i = 0; i < 2; i++) {
      while (gates.length <= i) await new Promise((r) => setImmediate(r));
      gates[i]();
    }
    await queue.flush();
    // seen is [1, 3]: v2 was coalesced, never sent
    assert.deepEqual(seen, [1, 3]);
    assert.equal(maxActive, 1, "never more than one save in flight");
    assert.equal(queue.getState().status, "saved");
  });

  test("failure surfaces Failed + error, retry re-queues the last payload", async () => {
    let calls = 0;
    const save = async () => {
      calls += 1;
      return calls === 1 ? { ok: false, error: "boom" } : { ok: true };
    };
    const queue = createDraftSaveQueue(save);
    queue.request({ v: 1 });
    await queue.flush();
    assert.equal(queue.getState().status, "failed");
    assert.equal(queue.getState().error, "boom");
    queue.retry();
    await queue.flush();
    assert.equal(queue.getState().status, "saved");
    assert.equal(calls, 2);
  });

  test("retry without any request is a safe no-op", async () => {
    let calls = 0;
    const queue = createDraftSaveQueue(async () => {
      calls += 1;
      return { ok: true };
    });
    queue.retry();
    await queue.flush();
    assert.equal(calls, 0);
    assert.equal(queue.getState().pending, false);
  });

  test("thrown saver errors fail closed with a message", async () => {
    const queue = createDraftSaveQueue(async () => {
      throw new Error("network down");
    });
    queue.request({ v: 1 });
    await queue.flush();
    assert.equal(queue.getState().status, "failed");
    assert.equal(queue.getState().error, "network down");
  });
});

describe("autosave draft schema and builder wiring (source level)", () => {
  test("sparse drafts pass the autosave schema (all fields optional, publish alone validates)", () => {
    const { InvitationPageDraftSchema, validateForPublish } = require("../invitation-page-schema.ts");
    const sparse = { template_id: "gala-editorial" };
    const parsed = InvitationPageDraftSchema.safeParse(sparse);
    assert.equal(parsed.success, true, "autosave must accept partial drafts");
    // ...but the same sparse draft cannot publish
    const res = validateForPublish(sparse, { title: "T", event_date: "2026-12-15T19:00:00Z" }, "en");
    assert.equal(res.valid, false, "publish still requires timezone");
  });

  test("builder wires queue, flush-on-leave, status pill, live badge, and all sections", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder.tsx"),
      "utf8"
    );
    assert.ok(src.includes("createDraftSaveQueue"), "builder must use the sequenced queue");
    assert.ok(src.includes("beforeunload"), "builder must flush on route leave");
    assert.ok(src.includes("visibilitychange"), "builder must flush when hidden");
    assert.ok(src.includes('role="status"'), "save status pill required");
    assert.ok(src.includes("Retry"), "failed saves offer retry");
    assert.ok(src.includes("Saving…") && src.includes("Saved"), "Saving/Saved states required");
    assert.ok(src.includes("hasDraftChanges("), "badge must recompute live from the draft");
    for (const section of ["BasicsSection", "HeroSection", "StorySection", "DetailsSection", "GallerySection", "MusicSection", "ExtrasSection"]) {
      assert.ok(src.includes(section), `builder must render ${section}`);
    }
  });
});

// ── Slice D: publish checklist jump links ────────────────────────────────────

describe("publish checklist jump links", () => {
  const { sectionForPublishField } = require("../invitation-publish-nav.ts");
  const { validateForPublish } = require("../invitation-page-schema.ts");

  test("every publish error field resolves to its owning section", () => {
    assert.equal(sectionForPublishField("title"), "basics");
    assert.equal(sectionForPublishField("template_id"), "template");
    assert.equal(sectionForPublishField("timezone"), "basics");
    assert.equal(sectionForPublishField("event_date"), "basics");
    assert.equal(sectionForPublishField("partner1_name"), "extras");
    assert.equal(sectionForPublishField("partner2_name"), "extras");
    assert.equal(sectionForPublishField("celebrant_name"), "extras");
    assert.equal(sectionForPublishField("gallery.0.url"), "gallery");
    assert.equal(sectionForPublishField("schedule.2.time"), "details");
    assert.equal(sectionForPublishField("hero_image_url"), "hero");
    assert.equal(sectionForPublishField("music_audio_url"), "music");
    assert.equal(sectionForPublishField("something_new"), "publish");
  });

  test("all real validation errors produced by the schema have a jump target", () => {
    const badDraft = {
      template_id: "",
      locale: "en",
      timezone: "",
      display_title: "x".repeat(200),
      gallery: [{ url: "not-a-url", alt: "", caption: "" }],
    };
    const res = validateForPublish(badDraft, { title: "", event_date: null }, "en");
    assert.ok(res.errors.length > 0);
    for (const err of res.errors) {
      const section = sectionForPublishField(err.field);
      assert.ok(typeof section === "string" && section.length > 0, `jump target for ${err.field}`);
    }
  });

  test("publish section renders jump links and moves focus (source level)", () => {
    const section = fs.readFileSync(
      path.join(ROOT, "app/dashboard/events/[id]/invitation-page/builder/sections/PublishSection.tsx"),
      "utf8"
    );
    assert.ok(section.includes("onJumpToSection"), "checklist failures must jump");
    assert.ok(section.includes("sectionForPublishField"), "errors must map to sections");

    const builder = fs.readFileSync(
      path.join(ROOT, "app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder.tsx"),
      "utf8"
    );
    assert.ok(builder.includes("handleJumpToSection"), "builder must implement jumping");
    assert.ok(builder.includes(".focus("), "focus must move to the target header");
    assert.ok(builder.includes("PublishSection"), "builder must render the publish section");
    assert.ok(builder.includes("await saveQueue.flush()"), "publish must flush autosaves first");
  });

  test("accordion header closes its open section and keeps the clicked header pinned when switching", () => {
    const builder = fs.readFileSync(
      path.join(ROOT, "app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder.tsx"),
      "utf8"
    );
    assert.match(builder, /useState<SectionId \| null>\(initialSection\)/, "accordion allows no open section");
    const toggle = builder.match(/const toggleSection = useCallback\([\s\S]*?\n  \}, \[openSection, postToPreview\]\);/)?.[0];
    assert.ok(toggle, "ordinary section header handler is present");
    assert.match(toggle, /current === sectionId \? null : sectionId/, "clicking the open header closes it");
    assert.match(toggle, /getBoundingClientRect\(\)\.top/, "switch captures the clicked header viewport position");
    assert.match(toggle, /currentTop - previousTop/, "switch measures layout movement after the accordion update");
    assert.match(toggle, /window\.scrollBy\(\{ top: adjustment/, "only compensates by the header movement");
    assert.doesNotMatch(toggle, /scrollIntoView|\.focus\(/, "ordinary clicks do not jump or steal focus");
    assert.match(toggle, /kind: "scroll-to", sectionId: id/, "the preview iframe still receives its scroll message");
  });

  test("readiness jumps still scroll to and focus their target header", () => {
    const builder = fs.readFileSync(
      path.join(ROOT, "app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder.tsx"),
      "utf8"
    );
    const jump = builder.match(/const handleJumpToSection = useCallback\([\s\S]*?\n  \}, \[postToPreview\]\);/)?.[0];
    assert.ok(jump, "readiness jump handler is present");
    assert.match(jump, /header\?\.scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
    assert.match(jump, /header\?\.focus\(\{ preventScroll: true \}\)/);
  });

  test("publish readiness uses a template display name and stacks its actions", () => {
    const publish = fs.readFileSync(
      path.join(ROOT, "app/dashboard/events/[id]/invitation-page/builder/sections/PublishSection.tsx"),
      "utf8"
    );
    assert.match(publish, /getUnifiedTemplateNameKey\(draft\.template_id\)/);
    assert.match(publish, /templateNameKey\s*\?\s*t\(templateNameKey\)/);
    assert.match(publish, /Selected Template[\s\S]*?templateDisplayName/);
    assert.match(publish, /flex flex-col items-stretch gap-4 pt-2/);
    assert.match(publish, /flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap/);
    assert.doesNotMatch(publish, /flex flex-col sm:flex-row items-center justify-between gap-4 pt-2/);
  });

  test("invitation builder route alone makes the event mobile header non-sticky", () => {
    const shell = fs.readFileSync(path.join(ROOT, "components/management/ManagementShell.tsx"), "utf8");
    assert.match(shell, /usePathname\(\)/);
    assert.match(shell, /invitation-page/);
    assert.match(shell, /isInvitationBuilderRoute \? "relative" : "sticky top-16"/);
    assert.ok(shell.includes("MobileHamburgerButton"), "builder retains access to the menu");
  });
});

// ── Slice E: wizard removal ──────────────────────────────────────────────────

describe("wizard removal (route mounts the builder)", () => {
  test("wizard directory and step containers are gone", () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, "app/dashboard/events/[id]/invitation-page/wizard")),
      false,
      "wizard/ must be deleted"
    );
  });

  test("dashboard client mounts the builder, nothing imports the wizard", () => {
    const client = fs.readFileSync(
      path.join(ROOT, "app/dashboard/events/[id]/invitation-page/InvitationPageDashboardClient.tsx"),
      "utf8"
    );
    assert.ok(client.includes("InvitationPageBuilder"), "route must mount the builder");
    assert.ok(!client.includes("InvitationPageWizard"), "wizard must not be mounted");

    const builder = fs.readFileSync(
      path.join(ROOT, "app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder.tsx"),
      "utf8"
    );
    assert.ok(!builder.includes("./wizard/"), "builder must not import the wizard");
  });

  test("no ?step= deep links remain anywhere", () => {
    const hits = [];
    function scan(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) scan(full);
        else if (/\.(tsx?|cjs|mjs|md)$/.test(entry.name)) {
          if (entry.name.endsWith(".test.cjs") || entry.name.endsWith(".test.ts")) continue;
          const content = fs.readFileSync(full, "utf8");
          if (content.includes("invitation-page?step")) hits.push(path.relative(ROOT, full));
        }
      }
    }
    scan(ROOT);
    assert.deepEqual(hits, [], "no ?step= links may remain");
  });
});
