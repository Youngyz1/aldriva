const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;

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
      jsx: filename.endsWith(".tsx") ? ts.JsxEmit.ReactJSX : undefined,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
require.extensions[".tsx"] = require.extensions[".ts"];

let database;

class FakeQuery {
  constructor(table) {
    this.table = table;
    this.filters = {};
  }

  select() {
    return this;
  }

  eq(column, value) {
    this.filters[column] = value;
    return this;
  }

  async maybeSingle() {
    const id = this.filters.event_id || this.filters.id;
    return {
      data: this.table === "events" ? database.events.get(id) ?? null : database.drafts.get(id) ?? null,
      error: null,
    };
  }

  async upsert(payload) {
    database.lastPayload = payload;
    if (database.missingMusicLinksColumn) {
      return {
        error: {
          code: "PGRST204",
          message: "Could not find the 'music_links' column of 'event_invitation_pages' in the schema cache",
        },
      };
    }

    database.drafts.set(payload.event_id, {
      id: "draft-row-1",
      event_id: payload.event_id,
      template_id: "gala-editorial",
      locale: "en",
      page_status: "draft",
      published_at: null,
      published_snapshot: null,
      created_at: "2026-10-11T00:00:00.000Z",
      ...database.drafts.get(payload.event_id),
      ...payload,
    });
    return { error: null };
  }
}

const mocks = {
  "next/image": {
    __esModule: true,
    default: ({ fill, ...props }) => {
      void fill;
      return require("react").createElement("img", props);
    },
  },
  "@/lib/auth": {
    getCurrentUser: async () => ({ id: "host-user-1" }),
    isAdmin: async () => true,
  },
  "@/lib/event-auth": { hasEventOrOrganizerAccess: async () => true },
  "@/lib/entity-auth": { ENTITY_ROLES_MANAGE: ["event_manager"] },
  "@/lib/supabase-admin": {
    createSupabaseAdmin: () => ({ from: (table) => new FakeQuery(table) }),
  },
  "@/lib/invitation-events": { isInvitationEvent: (event) => event?.kind === "invitation" },
  "@/lib/memories/cover-art-policy": { isAllowedCoverHeroUrl: () => true },
  "@/lib/uploadAudio": { cleanupOrphanInvitationAudio: async () => {} },
};

Module._load = function loadMocks(request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
  return originalLoad.call(this, request, parent, isMain);
};

const { saveInvitationPageDraft, getInvitationPageDraft, getPublishedInvitationPage } = require("../actions/invitation-page.ts");
const { validateMusicLink } = require("../invitation-music-links.ts");
const {
  MISSING_MUSIC_LINKS_COLUMN_ERROR,
  isMissingMusicLinksColumnError,
} = require("../invitation-page-persistence.ts");
const { summarizeInvitationMusic } = require("../invitation-page-helpers.ts");
const { buildInvitationTemplatePreviewData } = require("../invitation-template-preview-data.ts");
const { normalizeInvitationColorHex } = require("../invitation-colors.ts");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { InvitationStoryMoments } = require("../../components/invitation/templates/InvitationStoryMoments.tsx");

function resetDatabase() {
  database = {
    events: new Map([
      ["event-1", { id: "event-1", kind: "invitation", title: "Test invitation", slug: "music-roundtrip" }],
    ]),
    drafts: new Map(),
    lastPayload: null,
    missingMusicLinksColumn: false,
  };
}

const spotifyLink = validateMusicLink(
  "https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3?si=round-trip"
);
assert.equal(spotifyLink.ok, true);

describe("invitation music draft persistence", () => {
  test("save/reload keeps the story upload URL and renders the saved image, caption, and text", async () => {
    resetDatabase();
    const link = spotifyLink.item;
    const story = [
      {
        image: "https://media.aldriva.com/invitation-story/event-1/moment-one.webp",
        title: "Our first dance",
        text: "The first moment we shared on the dance floor.",
      },
    ];

    const saved = await saveInvitationPageDraft("event-1", {
      template_id: "gala-editorial",
      locale: "en",
      music_audio_url: null,
      music_title: null,
      music_links: [link],
      wedding_story: story,
    });

    assert.deepEqual(saved, { ok: true });
    assert.ok(Object.keys(database.lastPayload).includes("music_links"), "upsert object includes the column");
    assert.deepEqual(database.lastPayload.music_links, [link]);
    assert.deepEqual(database.lastPayload.wedding_story, story, "story image items use the existing JSONB column");

    const loaded = await getInvitationPageDraft("event-1");
    assert.deepEqual(loaded.draft.music_links, [{ ...link, label: null }]);
    assert.equal(loaded.draft.music_links[0].url, "https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3?si=round-trip");
    assert.deepEqual(loaded.draft.wedding_story, story, "story items survive a save/reload round trip");

    const preview = buildInvitationTemplatePreviewData("wedding-romantic", loaded.draft, {
      id: "event-1",
      title: "Test invitation",
      event_date: "2026-12-01T18:00:00.000Z",
    });
    assert.deepEqual(preview.data.weddingStory, story, "reloaded story data reaches the template model");
    assert.ok(!preview.sampleFields.includes("weddingStory"), "preview does not replace an empty editor story with samples");

    const rendered = renderToStaticMarkup(
      React.createElement(InvitationStoryMoments, { items: preview.data.weddingStory })
    );
    assert.match(rendered, /media\.aldriva\.com\/invitation-story\/event-1\/moment-one\.webp/);
    assert.match(rendered, /Our first dance/);
    assert.match(rendered, /first moment we shared/);

    const section = fs.readFileSync(
      path.join(ROOT, "app/dashboard/events/[id]/invitation-page/builder/sections/StorySection.tsx"),
      "utf8"
    );
    assert.match(section, /onUploaded=\{\(url\) => updateStory\(index, \{ image: url \}\)\}/);
    assert.match(section, /wedding_story: next, story_image_url: null/);
    assert.match(section, /MAX_STORY_MOMENTS = 4/);
    assert.match(section, /moveStory\(index, -1\)/);
    assert.match(section, /stories\.filter\(\(_, i\) => i !== index\)/);

    const storyRenderer = fs.readFileSync(
      path.join(ROOT, "components/invitation/templates/InvitationStoryMoments.tsx"),
      "utf8"
    );
    assert.match(storyRenderer, /onError=\{onError\}/);
    assert.match(storyRenderer, /failedImages\[index\]/, "failed image-only moments are hidden");
    for (const template of [
      "InvitationTemplateWedding.tsx",
      "InvitationTemplate1.tsx",
      "InvitationTemplateBirthday.tsx",
      "InvitationTemplateBlackTie.tsx",
      "InvitationTemplateCover.tsx",
    ]) {
      const templateSource = fs.readFileSync(
        path.join(ROOT, "components/invitation/templates", template),
        "utf8"
      );
      assert.match(templateSource, /<InvitationStoryMoments/ , `${template} renders story moments`);
    }
  });

  test("palette hex values normalize for builder preview and template CSS", () => {
    assert.equal(normalizeInvitationColorHex("F4B266"), "#F4B266");
    assert.equal(normalizeInvitationColorHex("#f4b266"), "#F4B266");
    assert.equal(normalizeInvitationColorHex("#not-a-color"), null);

    const snapshotTypes = fs.readFileSync(path.join(ROOT, "lib/types/invitation-page-snapshot.ts"), "utf8");
    assert.match(snapshotTypes, /hex: normalizeInvitationColorHex\(color\.hex\) \?\? color\.hex/);
    const weddingTemplate = fs.readFileSync(
      path.join(ROOT, "components/invitation/templates/InvitationTemplateWedding.tsx"),
      "utf8"
    );
    assert.match(weddingTemplate, /backgroundColor: normalizeInvitationColorHex\(color\.hex\)/);
  });

  test("missing music_links column returns a visible migration-specific save error", async () => {
    resetDatabase();
    database.missingMusicLinksColumn = true;

    const result = await saveInvitationPageDraft("event-1", {
      template_id: "gala-editorial",
      locale: "en",
      music_links: [spotifyLink.item],
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, MISSING_MUSIC_LINKS_COLUMN_ERROR);
    assert.equal(isMissingMusicLinksColumnError({
      code: "42703",
      message: "column event_invitation_pages.music_links does not exist",
    }), true);
  });

  test("a draft row without the selected music_links field fails load loudly", async () => {
    resetDatabase();
    const row = {
      id: "draft-row-1",
      event_id: "event-1",
      template_id: "gala-editorial",
      locale: "en",
      page_status: "draft",
      published_snapshot: null,
    };
    database.drafts.set("event-1", row);

    await assert.rejects(
      getInvitationPageDraft("event-1"),
      (error) => error.message === MISSING_MUSIC_LINKS_COLUMN_ERROR
    );
  });

  test("legacy Apple Music and Audiomack links are filtered from draft and published reads", async () => {
    resetDatabase();
    database.drafts.set("event-1", {
      id: "draft-row-1",
      event_id: "event-1",
      template_id: "gala-editorial",
      locale: "en",
      page_status: "published",
      published_at: "2026-10-10T00:00:00.000Z",
      music_links: [{ provider: "apple", url: "https://music.apple.com/us/album/example/123", embedUrl: "https://embed.music.apple.com/us/album/example/123", tall: false }],
      published_snapshot: {
        template_id: "gala-editorial",
        locale: "en",
        timezone: "UTC",
        music_links: [{ provider: "audiomack", url: "https://audiomack.com/artist/song/track", embedUrl: "https://audiomack.com/embed/artist/song/track", tall: false }],
      },
    });

    const draft = await getInvitationPageDraft("event-1");
    assert.deepEqual(draft.draft.music_links, []);
    assert.deepEqual(draft.draft.published_snapshot.music_links, []);
    assert.equal(draft.removedUnsupportedMusicLinks, true, "builder can show its one-time legacy notice");

    const published = await getPublishedInvitationPage("event-1");
    assert.deepEqual(published.published_snapshot.music_links, []);
  });

  test("collapsed Music summary includes link counts with and without uploaded audio", () => {
    const count = (n) => `${n} ${n === 1 ? "link" : "links"}`;
    assert.equal(summarizeInvitationMusic(null, null, 1, count), "1 link");
    assert.equal(summarizeInvitationMusic("uploaded.mp3", "First dance", 2, count), "First dance · 2 links");
    assert.equal(summarizeInvitationMusic(null, null, 0, count), "No music");
  });

  test("builder guest preview keeps link-only music instead of substituting sample audio", () => {
    const preview = buildInvitationTemplatePreviewData(
      "gala-editorial",
      { template_id: "gala-editorial", locale: "en", music_audio_url: null, music_links: [spotifyLink.item] },
      { id: "event-1", title: "Test invitation", slug: "music-roundtrip" }
    );

    assert.equal(preview.data.musicAudioUrl, undefined);
    assert.deepEqual(preview.data.musicLinks, [{ ...spotifyLink.item, label: null }]);
  });
});

Module._load = originalLoad;
Module._resolveFilename = originalResolveFilename;
