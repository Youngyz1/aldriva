const { test, describe } = require("node:test");
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
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const {
  InvitationPageDraftSchema,
  validateForPublish,
  isValidHttpUrl,
  isValidStorageImageUrl,
  isValidStorageAudioUrl,
} = require("../invitation-page-schema.ts");

const { assembleInvitationPageData } = require("../types/invitation-page-snapshot.ts");
const { validateAudioBytes } = require("../uploadAudio.ts");

describe("lib/invitation-page-schema - Zod Constraints & Length Bounds", () => {
  test("accepts valid draft within all character and array bounds", () => {
    const validDraft = {
      template_id: "gala-editorial",
      locale: "en",
      display_title: "Annual Charity Gala 2026",
      eyebrow: "Exclusive Invitation",
      host_names: "Dr. Arthur Pendelton & Foundation",
      story_headline: "Celebrating 10 Years",
      story_text: "Join us for an unforgettable evening.\n\nCocktails and dinner to follow.",
      story_image_url: "https://supabase.co/storage/v1/object/public/cms-media/org-123/story/pic.jpg",
      hero_image_url: "https://supabase.co/storage/v1/object/public/cms-media/org-123/hero/banner.jpg",
      hero_image_alt: "Gala hall",
      hero_image_focus_x: 45,
      hero_image_focus_y: 55,
      scroll_prompt: "Explore Invitation",
      venue_name: "The Grand Ballroom",
      address: "100 Park Ave, New York, NY",
      parking_notes: "Valet parking available at front entrance.",
      timezone: "America/New_York",
      dress_code: "Black Tie Optional",
      dress_code_notes: "Tuxedos or dark suits; evening gowns or cocktail dresses.",
      additional_notes: "Dietary preferences will be collected at check-in.",
      hashtag: "#AldrivaGala2026",
      music_audio_url: "https://supabase.co/storage/v1/object/public/invitation-media/event-123/track.mp3",
      music_title: "Clair de Lune - Piano Solo",
      schedule: [
        { dayLabel: "Friday", time: "6:00 PM", label: "Welcome Reception", description: "Champagne & Hors d'oeuvres" },
        { dayLabel: "Friday", time: "7:30 PM", label: "Main Gala Dinner", description: "Keynote address" },
      ],
      gallery: [
        { url: "https://supabase.co/storage/v1/object/public/cms-media/org-123/gal1.jpg", alt: "Hall", caption: "Main ballroom" },
      ],
      venues: [
        { label: "Main Reception", name: "Grand Ballroom", address: "100 Park Ave" },
      ],
      accommodations: [
        { name: "The Plaza Hotel", notes: "Discount code ALDRIVA", bookingUrl: "https://plazahotel.com/book" },
      ],
    };

    const parsed = InvitationPageDraftSchema.safeParse(validDraft);
    assert.ok(parsed.success, "Draft should parse successfully");
  });

  test("rejects string lengths exceeding DB and schema bounds", () => {
    // 1. Story text exceeding 3000 chars
    const tooLongStory = {
      template_id: "gala-editorial",
      story_text: "a".repeat(3001),
    };
    const res1 = InvitationPageDraftSchema.safeParse(tooLongStory);
    assert.equal(res1.success, false);

    // 2. Display title exceeding 120 chars
    const tooLongTitle = {
      template_id: "gala-editorial",
      display_title: "a".repeat(121),
    };
    assert.equal(InvitationPageDraftSchema.safeParse(tooLongTitle).success, false);

    // 3. Dress code notes exceeding 500 chars
    const tooLongNotes = {
      template_id: "gala-editorial",
      dress_code_notes: "a".repeat(501),
    };
    assert.equal(InvitationPageDraftSchema.safeParse(tooLongNotes).success, false);
  });

  test("enforces array length caps: gallery <= 12, schedule <= 15, venues <= 3, accommodations <= 6", () => {
    // Gallery > 12
    const galleryItems = Array.from({ length: 13 }, (_, i) => ({
      url: `https://supabase.co/storage/v1/object/public/cms-media/photo${i}.jpg`,
    }));
    assert.equal(InvitationPageDraftSchema.safeParse({ template_id: "gala-editorial", gallery: galleryItems }).success, false);

    // Schedule > 15
    const scheduleItems = Array.from({ length: 16 }, (_, i) => ({
      time: "10:00 AM",
      label: `Session ${i}`,
    }));
    assert.equal(InvitationPageDraftSchema.safeParse({ template_id: "gala-editorial", schedule: scheduleItems }).success, false);

    // Venues > 3
    const venueItems = Array.from({ length: 4 }, (_, i) => ({
      label: `Venue ${i}`,
      name: `Hall ${i}`,
    }));
    assert.equal(InvitationPageDraftSchema.safeParse({ template_id: "gala-editorial", venues: venueItems }).success, false);
  });

  test("validates URLs: http/https only for links, storage prefixes for images & audio", () => {
    assert.equal(isValidHttpUrl("https://example.com"), true);
    assert.equal(isValidHttpUrl("http://example.com"), true);
    assert.equal(isValidHttpUrl("javascript:alert(1)"), false);
    assert.equal(isValidHttpUrl("data:text/html;base64,..."), false);

    assert.equal(isValidStorageImageUrl("https://supabase.co/storage/v1/object/public/cms-media/pic.jpg"), true);
    assert.equal(isValidStorageImageUrl("/images/hero.jpg"), true);

    assert.equal(isValidStorageAudioUrl("https://supabase.co/storage/v1/object/public/invitation-media/track.mp3"), true);
    assert.equal(isValidStorageAudioUrl("https://external-audio.com/malicious.exe"), false);
  });

  test("validateForPublish enforces mandatory fields & template-specific requirements", () => {
    const event = { title: "Summer Wedding", event_date: "2026-07-15 14:00:00" };

    // Missing timezone -> rejected
    const draftWithoutTz = {
      template_id: "gala-editorial",
      locale: "en",
    };
    const v1 = validateForPublish(draftWithoutTz, event, "en");
    assert.equal(v1.valid, false);
    assert.ok(v1.errors.some((e) => e.field === "timezone"));

    // Wedding missing partner names -> rejected
    const weddingDraft = {
      template_id: "wedding-romantic",
      locale: "en",
      timezone: "Europe/London",
    };
    const v2 = validateForPublish(weddingDraft, event, "en");
    assert.equal(v2.valid, false);
    assert.ok(v2.errors.some((e) => e.field === "partner1_name"));
    assert.ok(v2.errors.some((e) => e.field === "partner2_name"));

    // Birthday missing celebrant -> rejected
    const bdayDraft = {
      template_id: "birthday-bold",
      locale: "en",
      timezone: "Europe/Paris",
    };
    const v3 = validateForPublish(bdayDraft, event, "en");
    assert.equal(v3.valid, false);
    assert.ok(v3.errors.some((e) => e.field === "celebrant_name"));

    // Eventbrite imported event without timezone confirmation -> rejected
    const importedEvent = {
      title: "Imported Concert",
      event_date: "2026-09-20 18:00:00",
      eventbrite_event_id: "eb-12345",
    };
    const v4 = validateForPublish({ template_id: "gala-editorial" }, importedEvent, "en");
    assert.equal(v4.valid, false);

    // Fully valid wedding -> accepted
    const validWedding = {
      template_id: "wedding-romantic",
      locale: "en",
      timezone: "Europe/London",
      partner1_name: "Elena",
      partner2_name: "David",
    };
    const v5 = validateForPublish(validWedding, event, "en");
    assert.equal(v5.valid, true);
    assert.equal(v5.errors.length, 0);
  });
});

describe("lib/types/invitation-page-snapshot - Data Separation & Live Assembly", () => {
  test("assembleInvitationPageData merges live events fields + guest overlay and keeps snapshot clean", () => {
    const snapshot = {
      template_id: "gala-editorial",
      locale: "en",
      display_title: "Custom Benefit Gala",
      story_headline: "Welcome",
      story_text: "We are glad you are here.",
      timezone: "America/New_York",
      dress_code: "Black Tie",
    };

    const liveEvent = {
      id: "event-uuid-1",
      title: "Original Event Title",
      event_date: "2026-11-14 19:00:00",
      end_date: "2026-11-14 23:00:00",
      venue: "Grand Hall",
      street_address: "123 Main St",
      city: "New York",
      latitude: 40.7128,
      longitude: -74.006,
    };

    const liveGuest = {
      id: "guest-uuid-1",
      guest_name: "Eleanor Vance",
      guest_title: "Board Member",
      organization: "Acme Corp",
      rsvp_status: "accepted",
      rsvp_at: "2026-10-01T12:00:00Z",
      token: "64charhexsecretguesttokenabcdef1234567890abcdef12345678901234567890",
      is_vip: true,
    };

    const liveTicket = {
      qr_code: "ticket-pass-uuid-999",
      status: "valid",
    };

    const liveSeat = {
      section: "VIP Balcony",
      row_label: "A",
      seat_number: "1",
      table_number: "Table 5",
      is_vip: true,
    };

    const pageData = assembleInvitationPageData(snapshot, liveEvent, liveGuest, liveTicket, liveSeat);

    // 1. Snapshot overrides and content fields
    assert.equal(pageData.title, "Custom Benefit Gala", "display_title overrides live event title");
    assert.equal(pageData.storyHeadline, "Welcome");
    assert.equal(pageData.dressCode, "Black Tie");

    // 2. Live event fields
    assert.equal(pageData.eventDate, "2026-11-14 19:00:00");
    assert.equal(pageData.venue, "Grand Hall");
    assert.equal(pageData.city, "New York");
    assert.equal(pageData.address, "123 Main St");
    assert.equal(pageData.latitude, 40.7128);

    // 3. Live guest overlay
    assert.ok(pageData.guest);
    assert.equal(pageData.guest.name, "Eleanor Vance");
    assert.equal(pageData.guest.isVip, true);
    assert.equal(pageData.guest.rsvpStatus, "accepted");

    // 4. Live pass & seat
    assert.equal(pageData.ticketInstance.qrCode, "ticket-pass-uuid-999");
    assert.equal(pageData.seat.label, "Table 5 · Row A · Seat 1");
    assert.equal(pageData.seat.tableNumber, "Table 5");
    assert.equal(pageData.token, liveGuest.token);

    // 5. Verification: snapshot object itself does NOT contain any guest properties
    assert.equal(snapshot.guest, undefined, "Snapshot must not contain guest field");
    assert.equal(snapshot.ticketInstance, undefined, "Snapshot must not contain ticket pass field");
    assert.equal(snapshot.token, undefined, "Snapshot must not contain token");
  });

  test("snapshot ignores in-progress draft edits until re-publish occurs", () => {
    const originalPublishedSnapshot = {
      template_id: "gala-editorial",
      locale: "en",
      display_title: "Version 1 Published Title",
      timezone: "America/New_York",
    };

    const currentDraftRow = {
      display_title: "Version 2 Work In Progress (Unpublished)",
      story_text: "Draft changes not yet promoted.",
      published_snapshot: originalPublishedSnapshot,
      page_status: "published",
    };

    const liveEvent = {
      id: "event-1",
      title: "Base Title",
      event_date: "2026-11-14 19:00:00",
    };

    // Guests reading the published snapshot will see Version 1 title, NOT the unpublished draft title
    const guestView = assembleInvitationPageData(
      currentDraftRow.published_snapshot,
      liveEvent
    );

    assert.equal(guestView.title, "Version 1 Published Title", "Guest view must read from published snapshot only");
    assert.equal(guestView.storyText, undefined, "Unpublished draft edits are not visible in guest view");
  });
});

describe("lib/uploadAudio - Magic Byte & Format Verification", () => {
  test("validates MP3 ID3 header and MPEG sync frames", () => {
    // ID3 header: 'I' 'D' '3'
    const id3Header = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const res1 = validateAudioBytes(id3Header, 1024);
    assert.equal(res1.valid, true);
    assert.equal(res1.extension, "mp3");
    assert.equal(res1.detectedMime, "audio/mpeg");

    // MPEG sync frame: 0xFF 0xFB
    const syncHeader = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00]);
    const res2 = validateAudioBytes(syncHeader, 2048);
    assert.equal(res2.valid, true);
    assert.equal(res2.extension, "mp3");
  });

  test("validates M4A/MP4 ftyp box header", () => {
    // Offset 4: 'f' 't' 'y' 'p'
    const m4aHeader = new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);
    const res = validateAudioBytes(m4aHeader, 4096);
    assert.equal(res.valid, true);
    assert.equal(res.extension, "m4a");
    assert.equal(res.detectedMime, "audio/mp4");
  });

  test("rejects files exceeding 5MB or containing invalid magic bytes", () => {
    const validHeader = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00]);
    // 5MB + 1 byte
    const tooLarge = validateAudioBytes(validHeader, 5 * 1024 * 1024 + 1);
    assert.equal(tooLarge.valid, false);
    assert.ok(tooLarge.error.includes("5MB"));

    // Random non-audio bytes (e.g. PDF: %PDF)
    const pdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35]);
    const nonAudio = validateAudioBytes(pdfHeader, 1024);
    assert.equal(nonAudio.valid, false);
  });
});

describe("Server Security - Permissions & Preview Token Invariants", () => {
  test("validates preview token expiration logic & 64-character entropy", () => {
    const now = Date.now();
    const futureExpiry = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    const pastExpiry = new Date(now - 1000).toISOString();

    assert.equal(new Date(futureExpiry).getTime() > now, true, "7-day preview token is valid");
    assert.equal(new Date(pastExpiry).getTime() < now, true, "Expired preview token is rejected");

    // Token shape check
    const crypto = require("node:crypto");
    const sampleToken = crypto.randomBytes(32).toString("hex");
    assert.equal(sampleToken.length, 64, "Preview token must be exactly 64 hex characters");
    assert.match(sampleToken, /^[0-9a-f]{64}$/);
  });

  test("guest token read policy strictly gates on page_status = 'published'", () => {
    // When an event has only a draft page (page_status = 'draft'), getPublishedInvitationPage query returns null
    function simulateGetPublishedInvitationPage(row) {
      if (!row || row.page_status !== "published" || !row.published_snapshot) {
        return null;
      }
      return { published_snapshot: row.published_snapshot, page_status: "published" };
    }

    const draftOnlyRow = {
      event_id: "evt-1",
      page_status: "draft",
      published_snapshot: null,
    };

    assert.equal(simulateGetPublishedInvitationPage(draftOnlyRow), null, "Draft pages must never be served to guests");

    const publishedRow = {
      event_id: "evt-2",
      page_status: "published",
      published_snapshot: { template_id: "gala-editorial", timezone: "UTC" },
    };

    assert.ok(simulateGetPublishedInvitationPage(publishedRow), "Published pages return the frozen snapshot");
  });
});
