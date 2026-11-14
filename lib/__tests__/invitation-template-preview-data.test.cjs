/**
 * lib/__tests__/invitation-template-preview-data.test.cjs
 *
 * Behavioral tests for mergeInvitationTemplatePreviewData (Layer 3a):
 * calls the real function, does not grep its source text.
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

const { mergeInvitationTemplatePreviewData, applyEventMemories, DEMO_MUSIC_SAMPLE_URL } = require("@/lib/invitation-template-preview-data.ts");
const { assembleInvitationPageData } = require("@/lib/types/invitation-page-snapshot.ts");
const { SAMPLE_PREVIEW_GUEST, SAMPLE_PREVIEW_TICKET } = require("@/lib/invitation-preview-channel.ts");
const {
  MINIMALISM_DARK_BLUE_SAMPLE_DATA,
  MINIMALISM_DARK_BLUE_SAMPLE_DATA_FR,
} = require("@/components/invitation/templates/invitation-sample-data.ts");

const DEMO_BASE_PREFIX = "/images/invitations/minimalism-dark-blue/demo/";

function baseRealData(overrides = {}) {
  return {
    locale: "en",
    title: "",
    eventDate: "2026-01-01T00:00:00Z",
    guest: { name: "Honored Guest", rsvpStatus: "pending", isVip: false },
    token: "real-token-0123456789abcdef0123456789abcdef0123456789abcdef0123",
    gallery: [],
    ...overrides,
  };
}

describe("mergeInvitationTemplatePreviewData (minimalism-dark-blue only)", () => {
  test("empty gallery is filled with the sample gallery, all demo paths", () => {
    const result = mergeInvitationTemplatePreviewData("minimalism-dark-blue", baseRealData());
    assert.ok(Array.isArray(result.gallery) && result.gallery.length > 0, "gallery must be non-empty");
    for (const item of result.gallery) {
      assert.ok(item.url.startsWith(DEMO_BASE_PREFIX), `gallery url ${item.url} must start with ${DEMO_BASE_PREFIX}`);
    }
  });

  test("non-empty real gallery is returned unchanged (same urls, same order)", () => {
    const realGallery = [
      { url: "/uploads/real-1.jpg", alt: "Real photo 1" },
      { url: "/uploads/real-2.jpg", alt: "Real photo 2" },
    ];
    const result = mergeInvitationTemplatePreviewData(
      "minimalism-dark-blue",
      baseRealData({ gallery: realGallery })
    );
    assert.deepEqual(
      result.gallery.map((item) => item.url),
      realGallery.map((item) => item.url)
    );
  });

  test("real memories present (count > 0 and token set) -> memoriesSample is not true", () => {
    const result = mergeInvitationTemplatePreviewData(
      "minimalism-dark-blue",
      baseRealData({ memoriesCount: 3, memoriesToken: "real-memories-token" })
    );
    assert.notStrictEqual(result.memoriesSample, true);
  });

  test("no real memories -> memoriesSample === true", () => {
    const resultNoFields = mergeInvitationTemplatePreviewData("minimalism-dark-blue", baseRealData());
    assert.strictEqual(resultNoFields.memoriesSample, true);

    const resultZeroCount = mergeInvitationTemplatePreviewData(
      "minimalism-dark-blue",
      baseRealData({ memoriesCount: 0, memoriesToken: "some-token" })
    );
    assert.strictEqual(resultZeroCount.memoriesSample, true);

    const resultNoToken = mergeInvitationTemplatePreviewData(
      "minimalism-dark-blue",
      baseRealData({ memoriesCount: 5, memoriesToken: null })
    );
    assert.strictEqual(resultNoToken.memoriesSample, true);
  });

  test('locale "fr" returns French sample text, "en" returns English', () => {
    const en = mergeInvitationTemplatePreviewData("minimalism-dark-blue", baseRealData({ locale: "en" }));
    const fr = mergeInvitationTemplatePreviewData("minimalism-dark-blue", baseRealData({ locale: "fr" }));
    assert.strictEqual(en.title, MINIMALISM_DARK_BLUE_SAMPLE_DATA.title);
    assert.strictEqual(fr.title, MINIMALISM_DARK_BLUE_SAMPLE_DATA_FR.title);
    assert.notStrictEqual(en.title, fr.title);
  });

  test("unknown templateId -> output deep-equals input", () => {
    const input = baseRealData({ title: "Untouched" });
    const result = mergeInvitationTemplatePreviewData("some-other-template", input);
    assert.deepEqual(result, input);
  });

  test("applyEventMemories + merge: event with memoriesCount 3 and a token -> memoriesSample not true, count/token preserved", () => {
    const event = { memoriesCount: 3, memoriesToken: "event-memories-token" };
    const withEvent = applyEventMemories(baseRealData(), event);
    assert.strictEqual(withEvent.memoriesCount, 3);
    assert.strictEqual(withEvent.memoriesToken, "event-memories-token");

    const result = mergeInvitationTemplatePreviewData("minimalism-dark-blue", withEvent);
    assert.notStrictEqual(result.memoriesSample, true);
    assert.strictEqual(result.memoriesCount, 3);
    assert.strictEqual(result.memoriesToken, "event-memories-token");
  });

  test("applyEventMemories + merge: event with memoriesCount 0 and no token -> memoriesSample === true", () => {
    const event = { memoriesCount: 0, memoriesToken: null };
    const result = mergeInvitationTemplatePreviewData(
      "minimalism-dark-blue",
      applyEventMemories(baseRealData(), event)
    );
    assert.strictEqual(result.memoriesSample, true);
  });

  test("applyEventMemories + merge: event with no memories fields -> memoriesSample === true", () => {
    const event = {};
    const result = mergeInvitationTemplatePreviewData(
      "minimalism-dark-blue",
      applyEventMemories(baseRealData(), event)
    );
    assert.strictEqual(result.memoriesSample, true);
  });

  test("sampleFields lists only the filled keys, and is empty when gallery/photos/content are already real", () => {
    const partiallyReal = mergeInvitationTemplatePreviewData("minimalism-dark-blue", baseRealData());
    assert.ok(Array.isArray(partiallyReal.sampleFields) && partiallyReal.sampleFields.length > 0);
    assert.ok(partiallyReal.sampleFields.includes("gallery"));
    assert.ok(partiallyReal.sampleFields.includes("envelopePhoto"));

    const fullyRealGallery = [{ url: "/uploads/real-1.jpg", alt: "Real photo" }];
    const fullyReal = {
      ...MINIMALISM_DARK_BLUE_SAMPLE_DATA,
      gallery: fullyRealGallery,
      envelopePhoto: "/uploads/real-envelope-one.jpg",
      envelopePhotoTwo: "/uploads/real-envelope-two.jpg",
    };
    const result = mergeInvitationTemplatePreviewData("minimalism-dark-blue", fullyReal);
    assert.deepEqual(result.sampleFields, []);
    assert.deepEqual(result.gallery, fullyRealGallery);
  });

  test("demo data path (empty base + merge) returns an 8-image gallery and memoriesSample === true", () => {
    // Same empty-base pattern used by app/invitations/templates/[templateId]/demo/page.tsx
    // and components/invitation/marketplace/InvitationTemplatePreviewFrame.tsx.
    const emptySnapshot = { template_id: "minimalism-dark-blue", locale: "en" };
    const emptyLiveEvent = {
      id: "",
      title: "",
      slug: "",
      event_date: "",
      end_date: null,
      venue: null,
      street_address: null,
      city: null,
      latitude: null,
      longitude: null,
    };
    const realData = assembleInvitationPageData(
      emptySnapshot,
      emptyLiveEvent,
      { ...SAMPLE_PREVIEW_GUEST },
      { ...SAMPLE_PREVIEW_TICKET },
      null
    );
    const preview = mergeInvitationTemplatePreviewData("minimalism-dark-blue", realData);
    assert.ok(Array.isArray(preview.gallery), "gallery must be an array");
    assert.strictEqual(preview.gallery.length, 8, "demo gallery must have exactly 8 images");
    for (const item of preview.gallery) {
      assert.ok(item.url.startsWith(DEMO_BASE_PREFIX), `gallery url ${item.url} must start with ${DEMO_BASE_PREFIX}`);
    }
    assert.strictEqual(preview.memoriesSample, true);
  });

  test("every demo image path referenced by the sample data exists on disk under public/", () => {
    const referenced = new Set();
    for (const sample of [MINIMALISM_DARK_BLUE_SAMPLE_DATA, MINIMALISM_DARK_BLUE_SAMPLE_DATA_FR]) {
      if (typeof sample.envelopePhoto === "string") referenced.add(sample.envelopePhoto);
      if (typeof sample.envelopePhotoTwo === "string") referenced.add(sample.envelopePhotoTwo);
      for (const item of sample.gallery ?? []) referenced.add(item.url);
    }
    assert.ok(referenced.size > 0, "expected at least one referenced demo image path");
    for (const urlPath of referenced) {
      const onDisk = path.join(ROOT, "public", urlPath);
      assert.ok(fs.existsSync(onDisk), `missing on disk: ${onDisk}`);
    }
  });
});

describe("mergeInvitationTemplatePreviewData musicSample (layer9-step5)", () => {
  test("demoRoute:true with no organizer music sets musicSample + the sample track URL", () => {
    const result = mergeInvitationTemplatePreviewData("minimalism-dark-blue", baseRealData(), { demoRoute: true });
    assert.strictEqual(result.musicSample, true);
    assert.strictEqual(result.musicAudioUrl, DEMO_MUSIC_SAMPLE_URL);
  });

  test("no options (gallery-card / builder-preview / local-preview callers) leaves musicSample unset", () => {
    const result = mergeInvitationTemplatePreviewData("minimalism-dark-blue", baseRealData());
    assert.strictEqual(result.musicSample, undefined);
    assert.strictEqual(result.musicAudioUrl, undefined);
  });

  test("demoRoute:false explicitly behaves the same as omitting the option", () => {
    const result = mergeInvitationTemplatePreviewData("minimalism-dark-blue", baseRealData(), { demoRoute: false });
    assert.strictEqual(result.musicSample, undefined);
    assert.strictEqual(result.musicAudioUrl, undefined);
  });

  test("real uploaded musicAudioUrl wins — demoRoute never overrides it", () => {
    const result = mergeInvitationTemplatePreviewData(
      "minimalism-dark-blue",
      baseRealData({ musicAudioUrl: "https://example.com/real-track.mp3" }),
      { demoRoute: true }
    );
    assert.strictEqual(result.musicAudioUrl, "https://example.com/real-track.mp3");
    assert.strictEqual(result.musicSample, undefined);
  });

  test("a real configured provider music link wins — demoRoute never overrides it", () => {
    const result = mergeInvitationTemplatePreviewData(
      "minimalism-dark-blue",
      baseRealData({ musicLinks: [{ kind: "spotify", url: "https://open.spotify.com/track/abc" }] }),
      { demoRoute: true }
    );
    assert.strictEqual(result.musicAudioUrl, undefined);
    assert.strictEqual(result.musicSample, undefined);
  });

  test("demoRoute:true on a non-minimalism template is a no-op (early return)", () => {
    const input = baseRealData();
    const result = mergeInvitationTemplatePreviewData("some-other-template", input, { demoRoute: true });
    assert.strictEqual(result.musicSample, undefined);
    assert.strictEqual(result, input);
  });
});
