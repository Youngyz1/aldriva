/**
 * lib/__tests__/invitation-local-draft-image-paths.test.cjs
 *
 * Regression test for the hero-photo persistence bug: mf_hero_photos[i].url
 * (minimalism-dark-blue's only manifest photo field, an array under
 * blocks_layout.template_data) was invisible to listLocalDraftImageFields /
 * setLocalDraftImageField, so a hero photo uploaded in local mode was never
 * captured for IndexedDB persistence and never restored on reload. Covers
 * the full get/set round trip for both mf_hero_photos[i].url and the
 * pre-existing gallery[i].url path, to prove the fix didn't regress gallery.
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
  listLocalDraftImageFields,
  setLocalDraftImageField,
  captureInvitationLocalDraftImages,
  restoreInvitationLocalDraftImages,
} = require("@/lib/invitation-local-draft.ts");

/**
 * Minimal in-memory IndexedDB shim: only the surface
 * lib/invitation-local-draft.ts touches (open/upgradeneeded, transaction,
 * put/get/delete, close). Callbacks fire on a microtask, like a real IDB
 * request, so the module's promise wiring is exercised for real.
 */
function installFakeIndexedDB() {
  const stores = new Map();
  const ensureStore = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  };
  const makeRequest = () => ({ result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null });
  const db = {
    objectStoreNames: { contains: (name) => stores.has(name) },
    createObjectStore: (name) => {
      ensureStore(name);
      return {};
    },
    transaction: (name) => {
      const map = ensureStore(name);
      return {
        objectStore: () => ({
          put: (value, key) => {
            const request = makeRequest();
            map.set(key === undefined ? value.draftId : key, value);
            queueMicrotask(() => request.onsuccess && request.onsuccess());
            return request;
          },
          get: (key) => {
            const request = makeRequest();
            queueMicrotask(() => {
              request.result = map.get(key);
              if (request.onsuccess) request.onsuccess();
            });
            return request;
          },
          delete: (key) => {
            const request = makeRequest();
            map.delete(key);
            queueMicrotask(() => request.onsuccess && request.onsuccess());
            return request;
          },
        }),
      };
    },
    close: () => {},
  };
  return {
    open: () => {
      const request = makeRequest();
      queueMicrotask(() => {
        const fresh = !stores.has("envelopes") || !stores.has("images");
        ensureStore("envelopes");
        ensureStore("images");
        request.result = db;
        if (fresh && request.onupgradeneeded) request.onupgradeneeded();
        if (request.onsuccess) request.onsuccess();
      });
      return request;
    },
  };
}

describe("mf_opening_photo[i].url get/set path resolution (manifest image-list)", () => {
  test("listLocalDraftImageFields enumerates mf_opening_photo slots with their current blob: values", () => {
    const draft = {
      blocks_layout: { template_data: { mf_opening_photo: [{ url: "blob:http://localhost/opening" }] } },
    };
    const fields = listLocalDraftImageFields(draft);
    const opening = fields.find((f) => f.key === "mf_opening_photo_0");
    assert.ok(opening, "mf_opening_photo_0 must be enumerated");
    assert.strictEqual(opening.value, "blob:http://localhost/opening");
  });

  test("setLocalDraftImageField writes and replaces mf_opening_photo[i].url, preserving siblings", () => {
    const draft = {
      display_title: "Keep me",
      blocks_layout: {
        template_data: {
          mf_opening_photo: [{ url: "blob:stale-opening", alt: "keep alt" }],
          mf_opening_message: "Keep me too",
        },
      },
    };
    const next = setLocalDraftImageField(draft, "mf_opening_photo_0", "https://real.example/cms-media/opening.jpg");
    assert.strictEqual(next.blocks_layout.template_data.mf_opening_photo[0].url, "https://real.example/cms-media/opening.jpg");
    assert.strictEqual(next.blocks_layout.template_data.mf_opening_photo[0].alt, "keep alt", "sibling slot field must survive");
    assert.strictEqual(next.blocks_layout.template_data.mf_opening_message, "Keep me too");
    assert.strictEqual(next.display_title, "Keep me");
    // Immutable: the original draft object must not have been mutated.
    assert.strictEqual(draft.blocks_layout.template_data.mf_opening_photo[0].url, "blob:stale-opening");

    // Replace: a second write overwrites the same slot, no duplicate entry.
    const replaced = setLocalDraftImageField(next, "mf_opening_photo_0", "https://real.example/cms-media/opening-2.jpg");
    assert.strictEqual(replaced.blocks_layout.template_data.mf_opening_photo.length, 1);
    assert.strictEqual(replaced.blocks_layout.template_data.mf_opening_photo[0].url, "https://real.example/cms-media/opening-2.jpg");
  });

  test("an out-of-range mf_opening_photo index extends the array with the new slot", () => {
    const draft = { blocks_layout: { template_data: {} } };
    const next = setLocalDraftImageField(draft, "mf_opening_photo_0", "https://real.example/cms-media/opening.jpg");
    assert.strictEqual(next.blocks_layout.template_data.mf_opening_photo[0].url, "https://real.example/cms-media/opening.jpg");
  });
});

describe("local draft image capture/restore round trip (fake IndexedDB)", () => {
  const originalIndexedDB = global.indexedDB;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalBroadcastChannel = global.BroadcastChannel;
  let restoreCounter = 0;

  const setup = () => {
    global.indexedDB = installFakeIndexedDB();
    // Keep the per-draft BroadcastChannel from holding the test runner open.
    delete global.BroadcastChannel;
    restoreCounter = 0;
    URL.createObjectURL = () => `blob:restored/${++restoreCounter}`;
  };
  const teardown = () => {
    global.indexedDB = originalIndexedDB;
    URL.createObjectURL = originalCreateObjectURL;
    if (originalBroadcastChannel === undefined) delete global.BroadcastChannel;
    else global.BroadcastChannel = originalBroadcastChannel;
  };

  test("mf_opening_photo is captured to the blob store and restored on reload", async () => {
    setup();
    try {
      const draftId = "draft-opening";
      const draft = {
        blocks_layout: {
          template_data: {
            mf_opening_photo: [{ url: "blob:http://localhost/opening-session-1" }],
            mf_opening_message: "Welcome",
          },
        },
      };
      const blob = new Blob(["opening-bytes"], { type: "image/jpeg" });
      const images = await captureInvitationLocalDraftImages(
        draftId,
        draft,
        new Map([["mf_opening_photo_0", blob]])
      );
      assert.deepEqual(images, { mf_opening_photo_0: "mf_opening_photo_0" });

      // After a refresh the old blob: URL is dangling; restore must patch a
      // fresh object URL into the same slot and keep the rest of the draft.
      const stale = {
        blocks_layout: {
          template_data: {
            mf_opening_photo: [{ url: "blob:http://localhost/stale" }],
            mf_opening_message: "Welcome",
          },
        },
      };
      const restored = await restoreInvitationLocalDraftImages(draftId, stale, images);
      assert.match(restored.blocks_layout.template_data.mf_opening_photo[0].url, /^blob:restored\//);
      assert.strictEqual(restored.blocks_layout.template_data.mf_opening_message, "Welcome");
      assert.strictEqual(stale.blocks_layout.template_data.mf_opening_photo[0].url, "blob:http://localhost/stale", "restore must be immutable");
    } finally {
      teardown();
    }
  });

  test("existing keys (hero photos, gallery, story, evergreen) keep their exact scheme through capture and restore", async () => {
    setup();
    try {
      const draftId = "draft-legacy";
      const draft = {
        hero_image_url: "blob:http://localhost/hero",
        wedding_story: [{ image: "blob:http://localhost/story-0" }],
        gallery: [{ url: "blob:http://localhost/gallery-0" }],
        blocks_layout: {
          template_data: {
            mf_hero_photos: [{ url: "blob:http://localhost/hero-photo-0" }],
            cover_photo_url: "blob:http://localhost/cover",
          },
        },
      };
      const fields = listLocalDraftImageFields(draft);
      assert.deepEqual(
        fields.map((f) => f.key),
        [
          "hero_image_url",
          "wedding_story_0_image",
          "gallery_0",
          "envelope_photo_url",
          "envelope_photo_two_url",
          "cover_photo_url",
          "polaroid_photo_one_url",
          "polaroid_photo_two_url",
          "story_photo_one_url",
          "story_photo_two_url",
          "closing_photo_url",
          "rsvp_photo_url",
          "mf_hero_photos_0",
        ],
        "legacy key order/scheme must not change"
      );
      assert.strictEqual(fields.find((f) => f.key === "cover_photo_url").value, "blob:http://localhost/cover");

      const blobs = new Map([
        ["hero_image_url", new Blob(["h"])],
        ["wedding_story_0_image", new Blob(["s"])],
        ["gallery_0", new Blob(["g"])],
        ["cover_photo_url", new Blob(["c"])],
        ["mf_hero_photos_0", new Blob(["hp"])],
      ]);
      const images = await captureInvitationLocalDraftImages(draftId, draft, blobs);
      assert.deepEqual(Object.keys(images).sort(), [
        "cover_photo_url",
        "gallery_0",
        "hero_image_url",
        "mf_hero_photos_0",
        "wedding_story_0_image",
      ]);

      const restored = await restoreInvitationLocalDraftImages(draftId, draft, images);
      assert.match(restored.hero_image_url, /^blob:restored\//);
      assert.match(restored.wedding_story[0].image, /^blob:restored\//);
      assert.match(restored.gallery[0].url, /^blob:restored\//);
      assert.match(restored.blocks_layout.template_data.cover_photo_url, /^blob:restored\//);
      assert.match(restored.blocks_layout.template_data.mf_hero_photos[0].url, /^blob:restored\//);
    } finally {
      teardown();
    }
  });

  test("unknown keys are still a no-op for setLocalDraftImageField", () => {
    const draft = { blocks_layout: { template_data: { mf_opening_photo: [] } } };
    assert.deepEqual(setLocalDraftImageField(draft, "mf_not_an_image_field_0", "https://x"), draft);
    assert.deepEqual(setLocalDraftImageField(draft, "mf_opening_photo_extra", "https://x"), draft);
  });
});

describe("mf_hero_photos[i].url get/set path resolution", () => {
  test("listLocalDraftImageFields enumerates both hero photo slots with their current blob: values", () => {
    const draft = {
      blocks_layout: {
        template_data: {
          mf_hero_photos: [
            { url: "blob:http://localhost/aaa" },
            { url: "blob:http://localhost/bbb" },
          ],
        },
      },
    };
    const fields = listLocalDraftImageFields(draft);
    const hero0 = fields.find((f) => f.key === "mf_hero_photos_0");
    const hero1 = fields.find((f) => f.key === "mf_hero_photos_1");
    assert.ok(hero0, "mf_hero_photos_0 must be enumerated");
    assert.ok(hero1, "mf_hero_photos_1 must be enumerated");
    assert.strictEqual(hero0.value, "blob:http://localhost/aaa");
    assert.strictEqual(hero1.value, "blob:http://localhost/bbb");
  });

  test("setLocalDraftImageField writes a fresh URL into mf_hero_photos[i].url, preserving the other slot and other draft content", () => {
    const draft = {
      display_title: "Keep me",
      blocks_layout: {
        template_data: {
          mf_hero_photos: [
            { url: "blob:stale-0" },
            { url: "blob:stale-1" },
          ],
          mf_hero_eyebrow: "Keep me too",
        },
      },
    };
    const next = setLocalDraftImageField(draft, "mf_hero_photos_0", "https://real.example/cms-media/hero-0.jpg");
    assert.strictEqual(next.blocks_layout.template_data.mf_hero_photos[0].url, "https://real.example/cms-media/hero-0.jpg");
    assert.strictEqual(next.blocks_layout.template_data.mf_hero_photos[1].url, "blob:stale-1", "untouched slot must survive");
    assert.strictEqual(next.blocks_layout.template_data.mf_hero_eyebrow, "Keep me too", "sibling template_data field must survive");
    assert.strictEqual(next.display_title, "Keep me", "top-level draft content must survive");
    // Immutable: the original draft object must not have been mutated.
    assert.strictEqual(draft.blocks_layout.template_data.mf_hero_photos[0].url, "blob:stale-0");
  });

  test("an out-of-range or missing mf_hero_photos index is still handled (array extends with the new slot)", () => {
    const draft = { blocks_layout: { template_data: {} } };
    const next = setLocalDraftImageField(draft, "mf_hero_photos_0", "https://real.example/cms-media/hero-0.jpg");
    assert.strictEqual(next.blocks_layout.template_data.mf_hero_photos[0].url, "https://real.example/cms-media/hero-0.jpg");
  });
});

describe("gallery[i].url get/set path resolution (pre-existing, must not regress)", () => {
  test("listLocalDraftImageFields still enumerates gallery items by index", () => {
    const draft = { gallery: [{ url: "blob:http://localhost/g0" }, { url: "blob:http://localhost/g1" }] };
    const fields = listLocalDraftImageFields(draft);
    assert.strictEqual(fields.find((f) => f.key === "gallery_0")?.value, "blob:http://localhost/g0");
    assert.strictEqual(fields.find((f) => f.key === "gallery_1")?.value, "blob:http://localhost/g1");
  });

  test("setLocalDraftImageField writes a fresh URL into gallery[i].url, preserving the other item", () => {
    const draft = { gallery: [{ url: "blob:stale-g0", alt: "first" }, { url: "blob:stale-g1", alt: "second" }] };
    const next = setLocalDraftImageField(draft, "gallery_1", "https://real.example/cms-media/gallery-1.jpg");
    assert.strictEqual(next.gallery[1].url, "https://real.example/cms-media/gallery-1.jpg");
    assert.strictEqual(next.gallery[1].alt, "second", "sibling field on the same item must survive");
    assert.strictEqual(next.gallery[0].url, "blob:stale-g0", "untouched item must survive");
  });
});
