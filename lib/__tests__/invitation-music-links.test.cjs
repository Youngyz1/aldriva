/**
 * lib/__tests__/invitation-music-links.test.cjs
 *
 * Invitation music links (Spotify / SoundCloud embeds).
 *
 * - Pure units: provider detection, HTTPS/host discipline (incl. deceptive
 *   hostnames), format validation, safe embed-URL construction, constants.
 * - Static pins: schema caps + refine, persistence chain (payload, snapshot,
 *   defaults, content keys, builder), MusicSection editor wiring, single
 *   bottom pill control in all five templates, dict + messages EN/FR parity,
 *   migration 167 files/mirror/rollback, CSP frame-src + script-src pins.
 * - Render pin: MusicLinksBlock markup carries the embed src, sandbox, and
 *   accessible title; empty links render nothing.
 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(ROOT, request.slice(2)),
      parent,
      isMain,
      options
    );
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

function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function codeOf(rel) {
  return src(rel)
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

const music = require("../invitation-music-links.ts");

describe("provider detection: valid URLs", () => {
  test("valid Spotify track/album/playlist/episode URLs", () => {
    for (const [url, type, tall] of [
      ["https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQ", "track", false],
      ["https://open.spotify.com/album/1A2B3C4D5E6F7G8H9I0J1K", "album", true],
      ["https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc", "playlist", true],
      ["https://open.spotify.com/episode/512ojhOuo1ktJprKbVcKy", "episode", false],
    ]) {
      const r = music.validateMusicLink(url);
      assert.equal(r.ok, true, url);
      assert.equal(r.item.provider, "spotify");
      assert.ok(r.item.embedUrl.startsWith(`https://open.spotify.com/embed/${type}/`), "documented embed format");
      assert.equal(r.item.tall, tall);
    }
  });

  test("pasted Spotify embed URLs normalize to the canonical embed", () => {
    const r = music.validateMusicLink("https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQ?utm_source=generator");
    assert.equal(r.ok, true);
    assert.equal(r.item.embedUrl, "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQ");
  });

  test("regional share URLs with intl prefix are accepted (prefix stripped)", () => {
    for (const url of [
      "https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQ",
      "https://open.spotify.com/intl-fr/album/1A2B3C4D5E6F7G8H9I0J1K?si=xyz",
    ]) {
      const r = music.validateMusicLink(url);
      assert.equal(r.ok, true, url);
      assert.ok(r.item.embedUrl.startsWith("https://open.spotify.com/embed/"), "canonical embed");
      assert.ok(!r.item.embedUrl.includes("intl-"), "locale prefix never leaks into the embed");
    }
  });

  test("legacy user-scoped playlist URLs normalize to the playlist embed", () => {
    const r = music.validateMusicLink("https://open.spotify.com/user/spotify/playlist/37i9dQZF1DXcBWIGoYBM5M");
    assert.equal(r.ok, true);
    assert.equal(r.item.provider, "spotify");
    assert.equal(r.item.embedUrl, "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M");
    assert.equal(r.item.tall, true);
  });

  test("SoundCloud canonical, query, and playlist URLs validate into widget URLs", () => {
    const variants = [
      [
        "https://soundcloud.com/erasedtapes/olafur-arnalds-poland",
        "https://soundcloud.com/erasedtapes/olafur-arnalds-poland",
      ],
      [
        "https://soundcloud.com/erasedtapes/olafur-arnalds-poland?si=proof123&utm_source=clipboard&utm_medium=text",
        "https://soundcloud.com/erasedtapes/olafur-arnalds-poland",
      ],
      [
        "https://soundcloud.com/forss/sets/soulhack",
        "https://soundcloud.com/forss/sets/soulhack",
      ],
    ];

    for (const [url, expectedEmbedSource] of variants) {
      const result = music.validateMusicLink(url);
      assert.equal(result.ok, true, `accept ${url}`);
      assert.equal(result.item.provider, "soundcloud");
      const embed = new URL(result.item.embedUrl);
      assert.equal(embed.origin, "https://w.soundcloud.com");
      assert.equal(embed.pathname, "/player/");
      assert.equal(embed.searchParams.get("url"), expectedEmbedSource);
    }

    const withQuery = music.validateMusicLink(variants[1][0]);
    assert.equal(withQuery.item.url, variants[1][0], "keep the pasted URL for external fallback");
  });

  test("SoundCloud short links are rejected with a builder-specific message", () => {
    assert.deepEqual(music.validateMusicLink("https://on.soundcloud.com/oxBTA32x4EgwvKVz5"), {
      ok: false,
      error: "soundcloud_short_link",
    });
    const editor = src("app/dashboard/events/[id]/invitation-page/builder/sections/MusicSection.tsx");
    assert.ok(editor.includes('checked.error === "soundcloud_short_link"'), "builder distinguishes short links");
    assert.ok(editor.includes('t("musicLinkSoundCloudShortLink")'), "builder asks for a full SoundCloud URL");
  });

  test("empty input is a clean empty error, never an exception", () => {
    for (const bad of [null, undefined, "", "   ", 5, {}]) {
      assert.deepEqual(music.validateMusicLink(bad), { ok: false, error: "empty" });
    }
  });

});

describe("rejection: malformed, insecure, deceptive, unsupported", () => {
  test("malformed URLs rejected", () => {
    for (const bad of ["not a url", "https://", "spotify:track:abc", "/track/abc"]) {
      assert.equal(music.validateMusicLink(bad).ok, false, bad);
    }
  });

  test("javascript:, data:, and http: rejected", () => {
    assert.deepEqual(music.validateMusicLink("javascript:alert(1)"), { ok: false, error: "not_https" });
    assert.deepEqual(music.validateMusicLink("data:text/html,<h1>x</h1>"), { ok: false, error: "not_https" });
    assert.deepEqual(music.validateMusicLink("http://open.spotify.com/track/abc"), { ok: false, error: "not_https" });
  });

  test("deceptive hostnames rejected (no substring matching)", () => {
    for (const bad of [
      "https://open.spotify.com.evil.com/track/abc",
      "https://evil-open.spotify.com/track/abc",
      "https://spotify.com/track/abc",
      "https://www.open.spotify.com/track/abc",
      "https://applesoundcloud.com/artist/track",
      "https://soundcloud.com@evil.com/artist/track",
      "https://fakesoundcloud.com/artist/track",
    ]) {
      const r = music.validateMusicLink(bad);
      assert.equal(r.ok, false, bad);
      assert.equal(r.error, "unsupported_provider", bad);
    }
  });

  test("unsupported providers and formats rejected with clear codes", () => {
    assert.deepEqual(music.validateMusicLink("https://www.youtube.com/watch?v=abc"), {
      ok: false,
      error: "unsupported_provider",
    });
    assert.deepEqual(music.validateMusicLink("https://vimeo.com/12345"), {
      ok: false,
      error: "unsupported_provider",
    });
    assert.equal(music.validateMusicLink("https://open.spotify.com/user/someone").error, "unsupported_format");
    assert.equal(music.validateMusicLink("https://open.spotify.com/track/").error, "unsupported_format");
    assert.equal(music.validateMusicLink("https://music.apple.com/us/album/abbey-road/12345").error, "unsupported_provider");
    assert.equal(music.validateMusicLink("https://audiomack.com/some-artist/song/some-track").error, "unsupported_provider");
    assert.equal(music.validateMusicLink("https://soundcloud.com/stream").error, "unsupported_format");
    assert.equal(music.validateMusicLink("https://soundcloud.com/login").error, "unsupported_format");
  });

  test("no user-supplied HTML is ever echoed: embed URLs are constructed, not pasted", () => {
    const r = music.validateMusicLink("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQ");
    assert.ok(r.ok);
    assert.ok(!r.item.embedUrl.includes("<") && !r.item.embedUrl.includes(">"), "no markup in embed URL");
    assert.ok(!r.item.embedUrl.includes('"'), "no attribute breaking out");
  });
});

describe("embed configuration", () => {
  test("iframe allow/sandbox constants exist for supported providers only", () => {
    for (const p of ["spotify", "soundcloud"]) {
      assert.ok(typeof music.MUSIC_EMBED_ALLOW[p] === "string" && music.MUSIC_EMBED_ALLOW[p].length > 0, p);
      assert.ok(typeof music.MUSIC_EMBED_SANDBOX[p] === "string" && music.MUSIC_EMBED_SANDBOX[p].length > 0, p);
      assert.ok(music.MUSIC_EMBED_SANDBOX[p].includes("allow-scripts"), `${p} sandbox permits the player script`);
    }
    assert.deepEqual(Object.keys(music.MUSIC_PROVIDER_NAMES), ["spotify", "soundcloud"]);
    assert.deepEqual(Object.keys(music.MUSIC_EMBED_ALLOW), ["spotify", "soundcloud"]);
    assert.deepEqual(Object.keys(music.MUSIC_EMBED_SANDBOX), ["spotify", "soundcloud"]);
  });

  test("sandbox never grants top navigation to embeds except Apple's documented value", () => {
    assert.ok(!music.MUSIC_EMBED_SANDBOX.spotify.includes("allow-top-navigation"), "spotify locked in");
    assert.ok(!music.MUSIC_EMBED_SANDBOX.soundcloud.includes("allow-top-navigation"), "soundcloud locked in");
  });

  test("player heights: compact tracks vs tall collections", () => {
    assert.equal(music.musicEmbedHeight("spotify", false), 152);
    assert.equal(music.musicEmbedHeight("spotify", true), 352);
    assert.equal(music.musicEmbedHeight("soundcloud", false), 166);
  });

  test("link cap and label cap constants", () => {
    assert.equal(music.MAX_MUSIC_LINKS, 3);
    assert.equal(music.MUSIC_LINK_LABEL_MAX, 80);
  });
});

describe("schema + persistence chain", () => {
  test("MusicLinkSchema caps at 3 and re-validates provider match", () => {
    const s = src("lib/invitation-page-schema.ts");
    assert.ok(s.includes("export const MusicLinkSchema"), "item schema exists");
    assert.ok(s.includes("validateMusicLink(item.url)"), "server-side re-validation");
    assert.ok(s.includes("checked.item.provider === item.provider"), "provider must match detected");
    assert.ok(s.includes("music_links"), "draft field exists");
    assert.ok(s.includes("MAX_MUSIC_LINKS"), "cap constant reused");
    assert.ok(s.includes("at most 80 characters"), "label length bound kept server-side");
  });

  test("snapshot row, snapshot, assemble, contract, and content keys carry music_links", () => {
    assert.ok(src("lib/types/invitation-page-snapshot.ts").includes("music_links"), "row + snapshot + assemble");
    assert.ok(src("types/invitation-template.ts").includes("musicLinks"), "template contract");
    assert.ok(src("lib/invitation-page-helpers.ts").includes('"music_links"'), "draft-change detection");
  });

  test("save payload, publish snapshot, and empty defaults include music_links (no wipe)", () => {
    const actions = src("lib/actions/invitation-page.ts");
    assert.ok(actions.includes("music_links: valid.music_links || null"), "draft payload");
    assert.ok(actions.includes("music_links: publishMusic.links.length > 0 ? publishMusic.links : null"), "publish snapshot uses filtered links");
    assert.equal(
      (actions.match(/music_links: null,/g) || []).length,
      2,
      "both empty-draft defaults present"
    );
    assert.ok(src("app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder.tsx").includes("music_links: d.music_links ?? null"), "builder mapping");
    assert.ok(src("app/invitation/preview/[token]/page.tsx").includes("music_links: draft.music_links"), "preview mapping");
  });

  test("existing invitations unaffected: column nullable, pill HIDE-IF-EMPTY", () => {
    assert.ok(codeOf("db/migration_167_invitation_music_links.sql").includes("ADD COLUMN IF NOT EXISTS music_links JSONB"), "nullable column only");
    assert.ok(
      src("components/invitation/FloatingMusicControl.tsx").includes("if (!hasAudio && !primary) return null"),
      "pill renders nothing without music"
    );
  });
});

describe("builder MusicSection editor", () => {
  const SECTION = "app/dashboard/events/[id]/invitation-page/builder/sections/MusicSection.tsx";

  test("upload field kept; links editor validates, previews via block, caps, removes", () => {
    const s = src(SECTION);
    assert.ok(s.includes("AudioUploadField"), "existing upload untouched");
    assert.ok(s.includes("validateMusicLink(url)"), "local validation");
    assert.ok(s.includes("MAX_MUSIC_LINKS"), "cap enforced");
    assert.ok(s.includes("music_links: [...links, checked.item]"), "append via draft patch");
    assert.ok(s.includes("music_links: links.filter"), "remove via draft patch");
    assert.ok(s.includes('role="alert"'), "accessible error");
    assert.ok(s.includes('t("musicLinkInvalid")'), "localized error copy");
    assert.ok(s.includes('type="url"'), "URL keyboard on mobile");
    assert.ok(s.includes("links.length < MAX_MUSIC_LINKS"), "add form hides at cap");
  });

  test("only supported providers are selectable and unsupported links get a clear message", () => {
    const s = src(SECTION);
    assert.ok(s.includes('useTranslations("Events")'), "locale hook");
    assert.ok(s.includes('["spotify", "soundcloud"]'), "only Spotify and SoundCloud are selectable");
    assert.ok(s.includes('t("musicLinkUnsupported")'), "unsupported provider error is localized");
    assert.ok(s.includes('t("musicLinksDescription")'), "builder copy lists current supported providers");
  });
});

describe("single bottom music control (no body embeds)", () => {
  const TEMPLATES = [
    "components/invitation/templates/InvitationTemplate1.tsx",
    "components/invitation/templates/InvitationTemplateBlackTie.tsx",
    "components/invitation/templates/InvitationTemplateWedding.tsx",
    "components/invitation/templates/InvitationTemplateBirthday.tsx",
    "components/invitation/templates/InvitationTemplateCover.tsx",
  ];

  test("no template renders MusicLinksBlock in the page body", () => {
    for (const file of TEMPLATES) {
      const s = src(file);
      assert.ok(!s.includes("<MusicLinksBlock"), `${file}: no top-positioned player in the body`);
    }
  });

  test("all five templates render the shared bottom pill with audio + links", () => {
    for (const file of TEMPLATES) {
      const s = src(file);
      assert.ok(s.includes("FloatingMusicControl"), `${file} imports the single control`);
      assert.ok(s.includes("links={data.musicLinks}"), `${file} provider links reachable`);
      assert.ok(s.includes("audioUrl={data.musicAudioUrl}"), `${file} uploaded audio kept`);
    }
  });

  test("pill renders only when music exists (HIDE-IF-EMPTY preserved)", () => {
    for (const file of TEMPLATES) {
      const s = src(file);
      assert.ok(
        s.includes("data.musicAudioUrl || (data.musicLinks && data.musicLinks.length > 0)"),
        `${file} renders nothing without music`
      );
    }
  });

  test("no per-template pill variants remain (one control, no duplicates)", () => {
    for (const file of TEMPLATES) {
      const s = src(file);
      assert.ok(!s.includes("function FloatingMusicPlayer("), `${file}: local variant removed`);
      assert.ok(!s.includes("function FloatingWeddingMusic("), `${file}: local variant removed`);
      assert.ok(!s.includes("function FloatingBirthdayMusic("), `${file}: local variant removed`);
    }
  });

  test("shared control: legacy audio toggle, hidden SDK embeds, external fallback", () => {
    const s = src("components/invitation/FloatingMusicControl.tsx");
    assert.ok(s.includes("sessionStorage.setItem"), "legacy play state remembered");
    assert.ok(s.includes("visibilitychange"), "tab-hide pause kept");
    assert.ok(!s.includes("Sheet") && !s.includes("MusicLinksBlock"), "no sheet, no visible player");
    assert.ok(s.includes("loadSpotifyIframeApi") && s.includes("createController"), "Spotify driven via iFrame API");
    assert.ok(s.includes("loadSoundCloudWidgetApi") && s.includes("api.Widget(soundcloudFrameRef.current)"), "SoundCloud driven via Widget API");
    assert.ok(s.includes("openProviderFallback(target.displayUrl, target.kind)"), "supported-player failures open the validated link externally");
    assert.ok(s.includes('window.open(validated.item.url, "_blank", "noopener,noreferrer")'), "external fallback opens only validated provider URLs");
    assert.ok(s.includes("HIDDEN_EMBED_STYLE"), "hidden-but-rendered embeds");
    const hiddenStyle = s.match(/const HIDDEN_EMBED_STYLE:[^=]+\s*=\s*\{([^}]+)\}/);
    assert.ok(hiddenStyle, "hidden embed style exists");
    assert.ok(!/\bdisplay\s*:\s*["']?none/.test(hiddenStyle[1]), "hidden embed is not display:none");
    assert.ok(s.includes("width: 152") && s.includes("height: 152"), "Spotify hidden embed keeps a real size");
    assert.ok(s.includes("width={166}") && s.includes("height={166}"), "SoundCloud uses its documented minimum size");
    assert.ok(s.includes("opacity: 0.001") && s.includes("top: 0"), "provider embed remains rendered in the viewport layer");
    assert.ok(s.includes("if (!hasAudio && !primary) return null"), "renders nothing without music");
  });

  test("Spotify and SoundCloud wait for their hidden controller instead of opening a player", () => {
    const s = src("components/invitation/FloatingMusicControl.tsx");
    assert.ok(s.includes('created.addListener("ready"'), "Spotify readiness tracked");
    assert.ok(s.includes('created.addListener("playback_started"'), "Spotify pill state waits for provider playback_started event");
    assert.ok(s.includes("widget.bind(events.READY, onReady)"), "SoundCloud uses the SDK READY event constant");
    assert.ok(s.includes("widget.bind(events.PLAY, onPlay)"), "SoundCloud state waits for the SDK PLAY event");
    assert.ok(s.includes("widget.bind(events.ERROR, onError)"), "SoundCloud SDK errors make the link unavailable");
    assert.ok(s.includes("SOUNDCLOUD_PLAY_START_TIMEOUT_MS") && s.includes("setFailedTargetKey(key)"), "a ready but non-playing embed falls back instead of staying silent");
    assert.ok(s.includes("disabled={providerLoading || providerStarting}"), "pill prevents duplicate taps while playback is starting");
    assert.ok(s.includes("if (providerFailed)"), "SDK failures use the external link fallback");
    assert.ok(s.includes("controller?.destroy()"), "Spotify controller is destroyed during cleanup");
    assert.ok(s.includes("widget?.unbind(events.PLAY, onPlay)"), "SoundCloud listeners are removed during cleanup");
    assert.ok(s.includes("Loading…"), "loading state is visible");
    assert.ok(s.includes("Starting…"), "starting state is visible");
    assert.ok(s.includes("Unavailable"), "unavailable state is visible");
    assert.match(s, /Unavailable.{0,60}\$\{providerName\}/, "unavailable fallback names the provider");
    assert.ok(s.includes("cookiePromptOffset"), "link pill stays tappable above the first-visit consent prompt");
  });

  test("invitation page builder scrolls the form independently beside a sticky, fit preview", () => {
    const s = src("app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder.tsx");
    assert.ok(s.includes("xl:h-[calc(100dvh-10rem)]"), "desktop builder columns fit the available viewport");
    assert.ok(s.includes("xl:overflow-y-auto xl:overscroll-contain"), "desktop edit form has its own scroll container");
    const gridStart = s.indexOf('data-testid="invitation-builder-columns"');
    const formStart = s.indexOf('data-testid="invitation-builder-form-column"');
    const previewStart = s.indexOf('data-testid="invitation-builder-preview-column"');
    const previewPanelStart = s.indexOf("<InvitationPreviewPanel", previewStart);
    const gridMarkup = s.slice(gridStart, formStart);
    const formMarkup = s.slice(formStart, previewStart);
    const previewMarkup = s.slice(previewStart, previewPanelStart);
    for (const token of ["xl:sticky", "xl:top-4", "xl:self-start", "xl:h-full", "xl:max-h-[calc(100dvh-2rem)]"]) {
      assert.ok(previewMarkup.includes(token), "desktop preview includes " + token);
    }
    assert.ok(s.includes("grid min-w-0 max-w-full"), "grid can shrink to its containing page width");
    assert.ok(previewMarkup.includes("xl:w-full xl:max-w-[640px]"), "preview fills its shrinkable track with a 640px cap");
    assert.ok(!s.includes("overflow-x-clip"), "sticky preview has no overflow clipping wrapper");
    assert.ok(gridMarkup.includes("xl:grid-cols-[minmax(0,520px)_minmax(0,640px)]"), "desktop tracks can shrink within the available width");
    assert.ok(!gridMarkup.includes("overflow-x-hidden"), "sticky preview ancestor is not clipped");
    assert.ok(formMarkup.includes("xl:overflow-x-hidden"), "horizontal clipping is confined to the form sibling");
    assert.ok(gridStart >= 0 && formStart > gridStart && previewStart > formStart, "browser verification can measure both columns");
  });

  test("pill precedence: uploaded audio wins (zero regression for existing invitations)", () => {
    const s = src("components/invitation/FloatingMusicControl.tsx");
    assert.ok(s.includes("if (hasAudio) {"), "audio path first");
    assert.ok(s.includes("toggleAudio"), "legacy toggle kept");
  });
});

describe("Spotify URI derivation for the iFrame API controller", () => {
  test("embed URLs map to spotify:{type}:{id} URIs; anything else is null", () => {
    assert.equal(
      music.spotifyUriFromEmbed("https://open.spotify.com/embed/track/7qiZfU4dY1lWllzX7mPBI3"),
      "spotify:track:7qiZfU4dY1lWllzX7mPBI3"
    );
    assert.equal(
      music.spotifyUriFromEmbed("https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M"),
      "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M"
    );
    assert.equal(music.spotifyUriFromEmbed("https://open.spotify.com/track/abc"), null, "non-embed rejected");
    assert.equal(music.spotifyUriFromEmbed("https://evil.com/embed/track/abc"), null, "foreign host rejected");
    assert.equal(music.spotifyUriFromEmbed(null), null, "non-string safe");
  });
});

describe("hidden-embed player SDK wiring", () => {
  test("pill loads only the two documented player SDKs (minimum required)", () => {
    const s = src("components/invitation/FloatingMusicControl.tsx");
    assert.ok(s.includes("https://open.spotify.com/embed/iframe-api/v1"), "Spotify iFrame API loader");
    assert.ok(s.includes("https://w.soundcloud.com/player/api.js"), "SoundCloud Widget API loader");
    assert.ok(!s.includes("music.apple.com") && !s.includes("audiomack.com"), "removed providers have no player branch");
  });

  test("playback starts only from the pill tap (no autoplay on mount)", () => {
    const s = src("components/invitation/FloatingMusicControl.tsx");
    assert.ok(!s.includes("autoPlay") && !s.includes("autoplay="), "no autoplay attribute or prop");
    const playCalls = (s.match(/\.play\(\)/g) || []).length;
    assert.ok(playCalls >= 1, "play reachable");
    assert.ok(s.includes("onClick={toggleLink}"), "play originates from the tap handler");
    const toggle = s.slice(s.indexOf("function toggleLink()"), s.indexOf("// Legacy path: uploaded audio"));
    assert.ok(toggle.includes("controller.play()") && toggle.includes("widget.play()"), "provider calls are synchronous in the tap handler");
    assert.ok(!/\bawait\b/.test(toggle), "no awaited gap loses user activation");
  });

  test("Spotify ready callback is installed before the API script is appended", () => {
    const s = src("components/invitation/FloatingMusicControl.tsx");
    const callback = s.indexOf("w.onSpotifyIframeApiReady =");
    const scriptLoad = s.indexOf("loadScriptOnce(SPOTIFY_IFRAME_API)");
    assert.ok(callback >= 0 && scriptLoad > callback, "ready callback precedes script load");
    assert.ok(s.includes("const mountPoint = document.createElement(\"div\")"), "Spotify receives a stable API replacement element");
  });

  test("CSP script-src covers the observed SDK hosts only (tightened, not widened)", () => {
    const s = src("next.config.ts");
    const scriptSrc = s.slice(s.indexOf('"script-src"'), s.indexOf('"script-src"') + 900);
    assert.ok(scriptSrc.includes("https://open.spotify.com"), "Spotify SDK allowed");
    assert.ok(scriptSrc.includes("https://embed-cdn.spotifycdn.com"), "observed Spotify runtime host allowed");
    assert.ok(scriptSrc.includes("https://w.soundcloud.com"), "SoundCloud SDK allowed");
    assert.ok(!scriptSrc.includes("audiomack") && !scriptSrc.includes("apple.com"), "no removed provider SDK hosts");
  });

  test("CSP connect-src stays unchanged because provider requests are inside their cross-origin iframes", () => {
    const s = src("next.config.ts");
    const connectSrc = s.slice(s.indexOf('"connect-src"'), s.indexOf('"frame-src"'));
    assert.ok(!connectSrc.includes("spotify") && !connectSrc.includes("soundcloud"), "no unobserved parent-page connection hosts added");
  });
});

describe("music i18n parity", () => {
  test("builder keys exist identically in en and fr, translated", () => {
    const en = JSON.parse(src("messages/en.json")).Events;
    const fr = JSON.parse(src("messages/fr.json")).Events;
    const keys = [
      "musicLinksHeading",
      "musicLinksDescription",
      "musicLinkProvider",
      "musicLinkUrl",
      "musicLinkUrlPlaceholder",
      "musicLinkAdd",
      "musicLinkRemove",
      "musicLinkSoundCloudShortLink",
      "musicLinkInvalid",
      "musicLinkProviderMismatch",
      "musicLinkUnsupported",
      "musicLinkLegacyProviderNotice",
      "musicLinkDismissNotice",
    ];
    for (const k of keys) {
      assert.ok(typeof en[k] === "string" && en[k].length > 0, `en ${k}`);
      assert.ok(typeof fr[k] === "string" && fr[k].length > 0, `fr ${k}`);
      assert.notEqual(fr[k], en[k], `${k} translated`);
    }
  });

  test("invitation dictionary carries music keys in both locales", () => {
    const { getInvitationDictionary } = require("../invitation-i18n.ts");
    for (const locale of ["en", "fr"]) {
      const dict = getInvitationDictionary(locale);
      for (const k of ["musicLinksTitle", "musicPlayerLabel", "musicEmbedUnavailable"]) {
        assert.ok(typeof dict[k] === "string" && dict[k].length > 0, `${k} for ${locale}`);
      }
    }
    const en = getInvitationDictionary("en");
    const fr = getInvitationDictionary("fr");
    assert.notEqual(fr.musicLinksTitle, en.musicLinksTitle);
  });
});

describe("CSP frame-src allows only the pill-controlled provider players", () => {
  test("next.config frame-src allows the two supported providers", () => {
    const s = src("next.config.ts");
    const frameSrc = s.slice(s.indexOf('"frame-src"'), s.indexOf('"frame-src"') + 1200);
    for (const host of ["https://open.spotify.com", "https://w.soundcloud.com"]) {
      assert.ok(frameSrc.includes(host), `frame-src allows ${host}`);
    }
    assert.ok(!frameSrc.includes("music.apple.com") && !frameSrc.includes("audiomack.com"), "removed providers have no embed origins");
  });

  test("builder preview grants autoplay to the invitation iframe", () => {
    const s = src("components/invitation/InvitationDevicePreviewFrame.tsx");
    assert.ok(s.includes('allow="autoplay"'), "nested provider playback receives autoplay delegation");
  });

  test("CSP stays otherwise tight: no wildcard audio hosts, no frame-src *", () => {
    const s = src("next.config.ts");
    const frameSrc = s.slice(s.indexOf('"frame-src"'), s.indexOf('"frame-src"') + 1200);
    assert.ok(!frameSrc.includes("frame-src *,") && !frameSrc.includes("frame-src *\""), "no frame-src wildcard");
    assert.ok(!frameSrc.includes("https://*.spotify.com"), "exact provider hosts only");
  });
});

describe("migration 167 files + content", () => {
  const FORWARD = "db/migration_167_invitation_music_links.sql";
  const ROLLBACK = "db/migration_167_invitation_music_links_rollback.sql";
  const MIRROR = "supabase/migrations/20261010000003_migration_167_invitation_music_links.sql";

  test("forward, rollback twin and mirror exist; mirror byte-identical; no rollback in supabase", () => {
    assert.ok(fs.existsSync(path.join(ROOT, FORWARD)));
    assert.ok(fs.existsSync(path.join(ROOT, ROLLBACK)));
    assert.ok(fs.existsSync(path.join(ROOT, MIRROR)));
    assert.equal(src(MIRROR), src(FORWARD), "mirror byte-identical");
    const dir = fs.readdirSync(path.join(ROOT, "supabase/migrations"));
    assert.ok(!dir.some((f) => f.includes("167") && f.includes("rollback")));
  });

  test("nullable JSONB column only: no RLS, no NOT NULL, no audio handling", () => {
    const s = codeOf(FORWARD);
    assert.ok(s.includes("ADD COLUMN IF NOT EXISTS music_links JSONB"), "single additive column");
    assert.ok(!s.includes("NOT NULL"), "existing rows untouched");
    assert.ok(!s.includes("ROW LEVEL SECURITY") && !s.includes("POLICY"), "no RLS change");
    assert.ok(!s.toLowerCase().includes("audio"), "no audio pipeline touched");
  });

  test("rollback aborts while links are referenced, then drops the column", () => {
    const s = fs.readFileSync(path.join(ROOT, ROLLBACK), "utf8");
    assert.ok(s.includes("ROLLBACK_ABORTED"), "loud abort");
    assert.ok(s.includes("WHERE music_links IS NOT NULL"), "draft guard");
    assert.ok(s.includes("published_snapshot"), "snapshot guard");
    assert.ok(s.includes("DROP COLUMN IF EXISTS music_links"), "column dropped");
  });
});
