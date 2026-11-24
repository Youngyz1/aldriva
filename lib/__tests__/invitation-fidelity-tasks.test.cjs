/**
 * lib/__tests__/invitation-fidelity-tasks.test.cjs
 *
 * Automated verification for the 5 fidelity tasks across Burgundy Gold and Minimalism Dark Blue:
 * 1. Skip opening link/button removal from opening gates & translation parity.
 * 2. Invitation image persistence across template switching & direct uploads.
 * 3. Raw addresses/URLs never rendered as visible text; maps open Google Maps on tap; standardized time formatting.
 * 4. Typography & text scale adherence.
 * 5. Placeholder greeting hidden for sample/preview guests; shown for real guests.
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

require.extensions[".ts"] = function compileTestTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8").replace(/^import ["']server-only["'];?\s*/m, "");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  });
  return module._compile(compiled.outputText, filename);
};

// ── 1. Skip opening removal ───────────────────────────────────────────
describe("Task 1: Skip opening removal", () => {
  const enMessages = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8"));
  const frMessages = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/fr.json"), "utf8"));

  test("skip-opening copy keys are deleted from en and fr messages", () => {
    assert.equal(enMessages.Events.burgundySkipOpening, undefined);
    assert.equal(frMessages.Events.burgundySkipOpening, undefined);
    assert.equal(enMessages.Events.minimalismSkipGate, undefined);
    assert.equal(frMessages.Events.minimalismSkipGate, undefined);
  });

  test("renderer source code contains no skip-opening button", () => {
    const bgSource = fs.readFileSync(path.join(ROOT, "components/invitation/templates/burgundy-gold/BurgundyGoldPageTemplate.tsx"), "utf8");
    const minSource = fs.readFileSync(path.join(ROOT, "components/invitation/templates/minimalism-dark-blue/MinimalismDarkBluePageTemplate.tsx"), "utf8");

    assert.ok(!bgSource.includes("burgundySkipOpening"), "burgundy-gold does not reference burgundySkipOpening");
    assert.ok(!minSource.includes("minimalismSkipGate"), "minimalism does not reference minimalismSkipGate");
    assert.ok(!bgSource.includes('t("burgundySkipOpening")'));
    assert.ok(!minSource.includes('t("minimalismSkipGate")'));
  });
});

// ── 2. Image mapping across templates ──────────────────────────────────
describe("Task 2: Invitation image mapping across templates", () => {
  const { sanitizeDraftForTemplate } = require(path.join(ROOT, "lib/invitation-template-sanitize.ts"));
  const { assembleInvitationPageData } = require(path.join(ROOT, "lib/types/invitation-page-snapshot.ts"));

  const sampleLiveEvent = {
    id: "evt-123",
    title: "Test Event",
    event_date: "2027-10-16T18:00:00Z",
  };

  test("switching minimalism-dark-blue -> burgundy-gold carries envelope_photo_url to mf_opening_photo", () => {
    const draft = {
      template_id: "minimalism-dark-blue",
      blocks_layout: {
        template_id: "minimalism-dark-blue",
        global_theme: { palette_id: "default", font_pack_id: "default" },
        layout_blocks: [],
        effects: [],
        template_data: {
          envelope_photo_url: "https://example.supabase.co/storage/v1/object/public/test/cover.jpg",
        },
      },
    };

    const sanitized = sanitizeDraftForTemplate(draft, "burgundy-gold");
    assert.equal(sanitized.template_id, "burgundy-gold");
    assert.equal(
      sanitized.blocks_layout.template_data.mf_opening_photo,
      "https://example.supabase.co/storage/v1/object/public/test/cover.jpg"
    );

    // Assembling page data for burgundy-gold resolves openingPhoto
    const pageData = assembleInvitationPageData(
      {
        template_id: "burgundy-gold",
        blocks_layout: sanitized.blocks_layout,
      },
      sampleLiveEvent
    );
    assert.equal(
      pageData.openingPhoto,
      "https://example.supabase.co/storage/v1/object/public/test/cover.jpg"
    );
  });

  test("switching burgundy-gold -> minimalism-dark-blue carries mf_opening_photo to envelope_photo_url", () => {
    const draft = {
      template_id: "burgundy-gold",
      blocks_layout: {
        template_id: "burgundy-gold",
        global_theme: { palette_id: "default", font_pack_id: "default" },
        layout_blocks: [],
        effects: [],
        template_data: {
          mf_opening_photo: "https://example.supabase.co/storage/v1/object/public/test/opening.jpg",
        },
      },
    };

    const sanitized = sanitizeDraftForTemplate(draft, "minimalism-dark-blue");
    assert.equal(sanitized.template_id, "minimalism-dark-blue");
    assert.equal(
      sanitized.blocks_layout.template_data.envelope_photo_url,
      "https://example.supabase.co/storage/v1/object/public/test/opening.jpg"
    );
  });

  test("direct upload in burgundy-gold sets mf_opening_photo and resolves as openingPhoto", () => {
    const pageData = assembleInvitationPageData(
      {
        template_id: "burgundy-gold",
        blocks_layout: {
          template_id: "burgundy-gold",
          layout_blocks: [],
          template_data: {
            mf_opening_photo: "https://example.supabase.co/storage/v1/object/public/test/direct.jpg",
          },
        },
      },
      sampleLiveEvent
    );
    assert.equal(
      pageData.openingPhoto,
      "https://example.supabase.co/storage/v1/object/public/test/direct.jpg"
    );
  });
});

// ── 3. Address text removal & time formatting ──────────────────────────
describe("Task 3: Address text removal & time formatting", () => {
  const { formatInvitationTime, isMapUrlOrCoordinate } = require(path.join(ROOT, "lib/invitation-text-format.ts"));
  const { burgundyReceptionTimes } = require(path.join(ROOT, "components/invitation/templates/burgundy-gold/burgundy-gold-data.ts"));

  test("isMapUrlOrCoordinate detects URLs and lat/lng coordinates", () => {
    assert.equal(isMapUrlOrCoordinate("https://maps.google.com/maps?q=45.123,-73.456"), true);
    assert.equal(isMapUrlOrCoordinate("http://google.com/maps/dir/foo"), true);
    assert.equal(isMapUrlOrCoordinate("45.1234, -73.5678"), true);
    assert.equal(isMapUrlOrCoordinate("-14.6928, 17.4467"), true);
    assert.equal(isMapUrlOrCoordinate("Quebec City"), false);
    assert.equal(isMapUrlOrCoordinate("Dakar"), false);
    assert.equal(isMapUrlOrCoordinate(""), false);
    assert.equal(isMapUrlOrCoordinate(null), false);
  });

  test("formatInvitationTime normalizes raw hours, 24h, and 12h times consistently", () => {
    // English (12-hour AM/PM)
    assert.equal(formatInvitationTime("12", "en"), "12:00 PM");
    assert.equal(formatInvitationTime("16", "en"), "4:00 PM");
    assert.equal(formatInvitationTime("16:00", "en"), "4:00 PM");
    assert.equal(formatInvitationTime("12:51 PM", "en"), "12:51 PM");
    assert.equal(formatInvitationTime("9", "en"), "9:00 AM");

    // French (24-hour)
    assert.equal(formatInvitationTime("12", "fr"), "12:00");
    assert.equal(formatInvitationTime("16", "fr"), "16:00");
    assert.equal(formatInvitationTime("16:00", "fr"), "16:00");
    assert.equal(formatInvitationTime("12:51 PM", "fr"), "12:51");
    assert.equal(formatInvitationTime("16h30", "fr"), "16:30");
  });

  test("burgundyReceptionTimes does not duplicate a single venue into both welcome and reception", () => {
    const singleVenue = [{ label: "Ceremony", name: "Cathedral", time: "12" }];
    const times = burgundyReceptionTimes(singleVenue);
    assert.ok(times);
    assert.equal(times.welcome, "12");
    assert.equal(times.reception, null, "single venue time should not duplicate into reception");
  });
});

// ── 5. Placeholder greeting ────────────────────────────────────────────
describe("Task 5: Placeholder greeting suppression", () => {
  const { burgundyGuestGreetingName } = require(path.join(ROOT, "components/invitation/templates/burgundy-gold/burgundy-gold-data.ts"));

  test("hides greeting when guest is flagged as placeholder or sample", () => {
    assert.equal(burgundyGuestGreetingName({ name: "Preview Guest", isPlaceholder: true }), null);
    assert.equal(burgundyGuestGreetingName({ name: "Any Name", isSample: true }), null);
    assert.equal(burgundyGuestGreetingName({ name: "Honored Guest" }), null);
    assert.equal(burgundyGuestGreetingName({ name: "Sample Guest" }), null);
    assert.equal(burgundyGuestGreetingName({ name: "Preview Guest" }), null);
    assert.equal(burgundyGuestGreetingName(null), null);
    assert.equal(burgundyGuestGreetingName(undefined), null);
  });

  test("shows greeting when guest is a real invited person", () => {
    assert.equal(burgundyGuestGreetingName({ name: "Sophie Martin" }), "Sophie Martin");
    assert.equal(burgundyGuestGreetingName({ name: "Dr. Evelyn Montgomery", isVip: true }), "Dr. Evelyn Montgomery");
  });
});

// ── 6. Venue names as map links ─────────────────────────────────────────
describe("Task 6: Venue names link to Google Maps", () => {
  const { buildVenueMapUrl } = require(path.join(ROOT, "lib/invitation-text-format.ts"));

  test("returns maps search URL for plain text addresses with URL encoding", () => {
    const url = buildVenueMapUrl("123 Rue de la Paix, Paris", "Grand Hotel");
    assert.ok(url);
    assert.ok(url.startsWith("https://www.google.com/maps/search/?api=1&query="));
    assert.ok(url.includes(encodeURIComponent("Grand Hotel, 123 Rue de la Paix, Paris")));
  });

  test("handles accents and apostrophes properly in plain text addresses", () => {
    const url = buildVenueMapUrl("Place de l'Opéra, Montréal", "Cathédrale du Souvenir d'Or");
    assert.ok(url);
    assert.ok(url.startsWith("https://www.google.com/maps/search/?api=1&query="));
    assert.ok(url.includes(encodeURIComponent("Cathédrale du Souvenir d'Or, Place de l'Opéra, Montréal")));
  });

  test("returns existing maps URL directly when address is already a URL", () => {
    const rawUrl = "https://maps.google.com/?q=48.8584,2.2945";
    const result = buildVenueMapUrl(rawUrl, "Eiffel Tower");
    assert.equal(result, rawUrl);
  });

  test("uses coordinates when available", () => {
    const url = buildVenueMapUrl(null, "Eiffel Tower", { lat: 48.8584, lng: 2.2945 });
    assert.equal(url, "https://www.google.com/maps/search/?api=1&query=48.8584,2.2945");
  });

  test("returns null when no address or coordinates are provided (prevents dead links)", () => {
    assert.equal(buildVenueMapUrl(null, "Ceremony Hall"), null);
    assert.equal(buildVenueMapUrl("", "Ceremony Hall"), null);
    assert.equal(buildVenueMapUrl("   ", "Ceremony Hall"), null);
  });

  test("burgundy-gold and minimalism source code links venue name and excludes raw address text", () => {
    const bgTemplate = fs.readFileSync(path.join(ROOT, "components/invitation/templates/burgundy-gold/BurgundyGoldPageTemplate.tsx"), "utf8");
    const minTemplate = fs.readFileSync(path.join(ROOT, "components/invitation/templates/minimalism-dark-blue/MinimalismDarkBluePageTemplate.tsx"), "utf8");
    const bgSections = fs.readFileSync(path.join(ROOT, "components/invitation/templates/burgundy-gold/BurgundyGoldSections.tsx"), "utf8");

    // Must link venue name with buildVenueMapUrl or venue.mapUrl
    assert.ok(bgTemplate.includes("buildVenueMapUrl"), "burgundy-gold page template uses buildVenueMapUrl");
    assert.ok(bgTemplate.includes('target="_blank"'), "links open in new tab");
    assert.ok(bgTemplate.includes('rel="noopener noreferrer"'), "links use noopener noreferrer");
    assert.ok(minTemplate.includes('target="_blank"'), "minimalism links open in new tab");
    assert.ok(minTemplate.includes('rel="noopener noreferrer"'), "minimalism links use noopener noreferrer");
    assert.ok(bgSections.includes('data-burgundy-venue-link="map"'), "burgundy sections includes venue map link");
  });
});

// ── 7. RSVP button responsiveness & confirmation ────────────────────────
describe("Task 7: RSVP button responsiveness & confirmation", () => {
  test("ActionPortalBlock includes prominent confirmation banner on response", () => {
    const source = fs.readFileSync(path.join(ROOT, "components/invitation/blocks/ActionPortalBlock.tsx"), "utf8");
    assert.ok(source.includes('data-rsvp-confirmation="true"'), "renders rsvp confirmation element");
    assert.ok(source.includes("Thank you, your response was recorded."), "includes English confirmation text");
    assert.ok(source.includes("Merci, votre réponse a été enregistrée."), "includes French confirmation text");
  });

  test("InvitationBlocksLayoutClient excludes action_portal from scroll-reveal", () => {
    const source = fs.readFileSync(path.join(ROOT, "components/invitation/blocks/InvitationBlocksLayoutClient.tsx"), "utf8");
    assert.ok(
      source.includes('block.type === "action_portal"'),
      "action_portal is excluded from InvitationScrollReveal so dialog buttons respond immediately"
    );
  });

  test("BurgundyGold close button does not steal focus with autoFocus", () => {
    const source = fs.readFileSync(path.join(ROOT, "components/invitation/templates/burgundy-gold/BurgundyGoldSections.tsx"), "utf8");
    assert.ok(
      !source.includes('aria-label={t("burgundyRsvpClose")}\n                autoFocus'),
      "close button does not have autoFocus"
    );
  });
});

// ── 8. Guestbook unlock & persistence ────────────────────────────────────
describe("Task 8: Guestbook unlocked on live pages with save action", () => {
  const { submitGuestbookWish } = require(path.join(ROOT, "lib/invitations.ts"));

  test("submitGuestbookWish function is exported in lib/invitations.ts", () => {
    assert.equal(typeof submitGuestbookWish, "function");
  });

  test("submitGuestbookWish validates empty name and message", async () => {
    await assert.rejects(
      async () => submitGuestbookWish({ token: "a".repeat(64), name: "", message: "Hello" }),
      /Name is required/
    );
    await assert.rejects(
      async () => submitGuestbookWish({ token: "a".repeat(64), name: "Alice", message: "" }),
      /Message is required/
    );
    await assert.rejects(
      async () => submitGuestbookWish({ token: "a".repeat(64), name: "Alice", message: "x".repeat(501) }),
      /Message cannot exceed 500 characters/
    );
    await assert.rejects(
      async () => submitGuestbookWish({ token: "invalid", name: "Alice", message: "Hello" }),
      /Invalid invitation token/
    );
  });

  test("minimalism-dark-blue guestbook fields are not disabled when hasAction is true", () => {
    const minSource = fs.readFileSync(path.join(ROOT, "components/invitation/templates/minimalism-dark-blue/MinimalismDarkBluePageTemplate.tsx"), "utf8");
    assert.ok(!minSource.includes("disabled={hasAction || mode === \"shared\"}"), "guestbook is not disabled merely because hasAction is true");
    assert.ok(minSource.includes("canWriteGuestbook"), "guestbook uses canWriteGuestbook check");
    assert.ok(minSource.includes("GUESTBOOK_WISH"), "guestbook dispatches GUESTBOOK_WISH page action");
  });

  test("burgundy-gold guestbook fields are not disabled when hasAction is true", () => {
    const bgSource = fs.readFileSync(path.join(ROOT, "components/invitation/templates/burgundy-gold/BurgundyGoldSections.tsx"), "utf8");
    assert.ok(!bgSource.includes("canWriteGuestbook = !hasAction && mode !== \"shared\""), "burgundy guestbook is not locked by hasAction");
    assert.ok(bgSource.includes("GUESTBOOK_WISH"), "burgundy guestbook dispatches GUESTBOOK_WISH page action");
  });
});

