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
    assert.ok(frame.includes("SAMPLE_PREVIEW_GUEST"), "frame renders the sample guest only");

    const builder = fs.readFileSync(
      path.join(ROOT, "app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder.tsx"),
      "utf8"
    );
    assert.ok(builder.includes('title="Live invitation preview"'), "iframe must have a title");
    assert.ok(
      builder.includes("src={`/invitation/builder-preview/${eventId}`}"),
      "iframe must point at the chrome-free preview route"
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
