const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(root, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

if (!require.extensions[".ts"]) {
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
}

const { getInvitationTemplateDefinition } = require("../invitation-template-registry.ts");
const { legacyInvitationTemplateToLayout } = require("../invitation-page-layout.ts");
const { InvitationPageDraftSchema, VenueItemSchema } = require("../invitation-page-schema.ts");
const { mergeInvitationTemplatePreviewData } = require("../invitation-template-preview-data.ts");
const { assembleInvitationPageData } = require("../types/invitation-page-snapshot.ts");
const { resolveEvergreenPhoto, EVERGREEN_PHOTO_PLACEHOLDER } = require("../evergreen-photo-resolution.ts");
const { evergreenMapUrl } = require("../evergreen-map.ts");
const { InvitationBlocksLayoutSchema } = require("../invitation-template-schema.ts");
const { usesEvergreenRsvpForm } = require("../invitation-rsvp.ts");
const { buildRsvpSubmissionPayload } = require("../page-actions.ts");
const { EVERGREEN_ENVELOPE_SAMPLE_DATA } = require("../../components/invitation/templates/invitation-sample-data.ts");

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("legacy Evergreen layouts rebuild sections from the registry and drop the obsolete map block", () => {
  const definition = getInvitationTemplateDefinition("evergreen-envelope");
  const fullLayout = legacyInvitationTemplateToLayout("evergreen-envelope");
  const oldMapBlock = legacyInvitationTemplateToLayout("romantic-envelope").layout_blocks.find((block) => block.type === "location_map");
  const oldLayout = {
    ...fullLayout,
    layout_blocks: [
      ...fullLayout.layout_blocks.filter((block) => ["interactive_envelope", "romantic_hero", "details"].includes(block.type)),
      oldMapBlock,
    ],
  };

  const adapted = legacyInvitationTemplateToLayout("evergreen-envelope", oldLayout);
  const types = adapted.layout_blocks.map((block) => block.type);
  for (const type of definition.defaultBlockTypes) assert.ok(types.includes(type), `restored ${type}`);
  assert.ok(!types.includes("location_map"));
  assert.deepEqual(types.slice(0, definition.defaultBlockTypes.length), [...definition.defaultBlockTypes]);
  assert.ok(!definition.supportedBlockTypes.includes("location_map"));

  for (const templateId of ["romantic-envelope", "botanical-reverie"]) {
    const other = legacyInvitationTemplateToLayout(templateId);
    assert.ok(other.layout_blocks.some((block) => block.type === "location_map"), `${templateId} keeps its map`);
  }
});

test("preview keeps organizer venue and story values ahead of its clearly marked fixture", () => {
  const preview = mergeInvitationTemplatePreviewData("evergreen-envelope", {
    title: "Youngyz & JoyBaby",
    eventDate: "2027-04-24T16:00:00+01:00",
    locale: "en",
    venue: "Royal Ber",
    address: "Royal Ber address",
    partner1Name: "Youngyz",
    partner2Name: "JoyBaby",
    storyHeadline: "Our own story introduction",
    storyText: "Our own story copy",
  });

  assert.equal(preview.data.venue, "Royal Ber");
  assert.equal(preview.data.venues, undefined, "sample venue array cannot override the real flat venue");
  assert.equal(preview.data.partner1Name, "Youngyz");
  assert.equal(preview.data.partner2Name, "JoyBaby");
  assert.ok(!preview.sampleFields.includes("monogramInitials"), "monogram defaults from organizer names");
  assert.equal(preview.data.storyHeadline, "Our own story introduction");
  assert.equal(preview.data.storyText, "Our own story copy");
  assert.ok(preview.sampleFields.includes("closingCaption"));
  assert.ok(preview.sampleFields.length > 0, "remaining sample values carry provenance for the preview badge");
});

test("published assembly does not merge sample text or photos and empty photo frames use original local artwork", () => {
  const page = assembleInvitationPageData(
    { template_id: "evergreen-envelope", locale: "en", blocks_layout: null },
    {
      id: "fresh-test-event",
      title: "Youngyz & JoyBaby",
      slug: "fresh-test-event",
      event_date: "2027-04-24T16:00:00+01:00",
      end_date: null,
      venue: "Royal Ber",
      street_address: null,
      city: "Lagos",
      latitude: null,
      longitude: null,
    },
    null,
    null,
    null
  );

  assert.equal(page.venue, "Royal Ber");
  assert.equal(page.partner1Name, "Youngyz", "Evergreen can derive a missing partner field from the entered couple title");
  assert.equal(page.partner2Name, "JoyBaby", "Evergreen can derive a missing partner field from the entered couple title");
  const titlePreview = mergeInvitationTemplatePreviewData("evergreen-envelope", page);
  assert.ok(!titlePreview.sampleFields.includes("partner1Name"));
  assert.ok(!titlePreview.sampleFields.includes("partner2Name"));
  assert.ok(!titlePreview.sampleFields.includes("monogramInitials"), "monogram uses initials from the couple title");
  assert.equal(page.closingCaption, undefined);
  assert.equal(page.rsvpDeadline, undefined);
  assert.equal(page.wishingWellNote, undefined);
  assert.equal(page.accommodations, undefined);
  assert.equal(page.albumUrl, undefined);
  assert.equal(page.envelopePhoto, undefined);
  assert.equal(resolveEvergreenPhoto(page, "cover_photo_url"), EVERGREEN_PHOTO_PLACEHOLDER);
  assert.notEqual(page.closingCaption, EVERGREEN_ENVELOPE_SAMPLE_DATA.closingCaption);
  assert.notEqual(page.monogramInitials, EVERGREEN_ENVELOPE_SAMPLE_DATA.monogramInitials);

  const sample = EVERGREEN_ENVELOPE_SAMPLE_DATA;
  const fixturePhotos = [
    sample.heroImage,
    sample.storyImage,
    sample.envelopePhoto,
    sample.coverPhoto,
    sample.polaroidPhotoOne,
    sample.polaroidPhotoTwo,
    sample.storyPhotoOne,
    sample.storyPhotoTwo,
    sample.closingPhoto,
    sample.rsvpPhoto,
    ...(sample.gallery ?? []).map((photo) => photo.url),
    ...(sample.weddingStory ?? []).map((moment) => moment.image),
  ].filter(Boolean);
  assert.ok(fixturePhotos.length > 0);
  for (const url of fixturePhotos) assert.match(url, /^\/images\/invitations\/evergreen-envelope\//);
});

test("Evergreen accepts eight optional venues and story moments while existing templates retain their limits", () => {
  const evergreenLayout = legacyInvitationTemplateToLayout("evergreen-envelope");
  const venues = Array.from({ length: 8 }, (_, index) => ({
    label: index === 0 ? "Ceremony" : index === 1 ? "Reception" : `Venue ${index + 1}`,
    name: index === 0 ? "Royal Ber" : "",
    address: "",
    time: "",
    mapUrl: null,
  }));
  const stories = Array.from({ length: 8 }, (_, index) => ({ title: `Moment ${index + 1}`, text: null, image: null }));
  const valid = InvitationPageDraftSchema.safeParse({
    template_id: "evergreen-envelope",
    locale: "en",
    blocks_layout: evergreenLayout,
    venues,
    wedding_story: stories,
  });
  assert.equal(valid.success, true, valid.success ? "" : valid.error.message);
  assert.equal(VenueItemSchema.safeParse({ label: "Reception", time: "6:00 PM" }).success, true);

  const overEight = InvitationPageDraftSchema.safeParse({
    template_id: "evergreen-envelope",
    locale: "en",
    blocks_layout: evergreenLayout,
    wedding_story: [...stories, { title: "Moment 9" }],
  });
  assert.equal(overEight.success, false);

  const otherLayout = legacyInvitationTemplateToLayout("wedding-romantic");
  const other = InvitationPageDraftSchema.safeParse({
    template_id: "wedding-romantic",
    locale: "en",
    blocks_layout: otherLayout,
    wedding_story: [...stories.slice(0, 4), { title: "Moment 5" }],
  });
  assert.equal(other.success, false, "existing templates keep the four-moment limit");
  const otherVenue = InvitationPageDraftSchema.safeParse({
    template_id: "wedding-romantic",
    locale: "en",
    blocks_layout: otherLayout,
    venues: [{ label: "Ceremony" }],
  });
  assert.equal(otherVenue.success, false, "existing templates still require venue names");
});

test("Evergreen story photos stack in one sticky frame track and optional text sections hide when blank", () => {
  const page = read("components/invitation/templates/evergreen-envelope/EvergreenEnvelopePageTemplate.tsx");
  assert.match(page, /storyFrames\.map/);
  assert.match(page, /data-evergreen-story-frame=\{index \+ 1\}/);
  assert.match(page, /minHeight: `\$\{storyFrames\.length \* 76\}svh`/);
  assert.match(page, /className="sticky top-\[8svh\] flex h-\[76svh\]/);
  assert.match(page, /Boolean\(data\.dressCode\?\.trim\(\) \|\| data\.dressCodeNotes\?\.trim\(\) \|\| dressSwatches\.length\)/);
  assert.match(page, /Boolean\(data\.showAdultsOnly\) && Boolean\(adultsOnlyNote\)/);
  assert.match(page, /accommodations\.length \|\| data\.albumUrl\?\.trim\(\)/);
  assert.doesNotMatch(page, /min-h-\[132svh\]|min-h-\[96svh\]|min-h-\[200svh\]/);
});

test("published Evergreen copy has no translated filler for empty organizer fields", () => {
  const page = read("components/invitation/templates/evergreen-envelope/EvergreenEnvelopePageTemplate.tsx");
  assert.match(page, /const invitationLine = sectionSettings\.invitation_line\?\.trim\(\) \|\| ""/);
  assert.match(page, /invitationParentsLine \? <p/);
  assert.match(page, /invitationLine \? <p/);
  assert.match(page, /data\.storyHeadline\?\.trim\(\) \? <h2/);
  assert.doesNotMatch(page, /evergreenInvitationParentsFallback|evergreenInvitationLine|evergreenCountdownIntro/);
});

test("Evergreen RSVP passes the shared accept/decline payload and preview labels its sample pass", () => {
  assert.equal(usesEvergreenRsvpForm("evergreen-envelope"), false);
  assert.deepEqual(buildRsvpSubmissionPayload("accepted"), {
    actionType: "RSVP_SUBMISSION",
    response: "accepted",
  });
  const page = read("components/invitation/templates/evergreen-envelope/EvergreenEnvelopePageTemplate.tsx");
  const portal = read("components/invitation/blocks/ActionPortalBlock.tsx");
  assert.match(page, /invitationPreviewGuestCaption/);
  assert.match(page, /blocks\("action_portal"\)/);
  assert.match(portal, /buildRsvpSubmissionPayload\(nextResponse\)/);
  assert.doesNotMatch(page, /evergreenRsvpGuestNames|evergreenRsvpCount|evergreenRsvpWishes/);
  const registry = read("components/invitation/blocks/InvitationBlockRegistry.tsx");
  assert.match(registry, /showQrContext=\{templateId === "evergreen-envelope"\}/);
  assert.match(portal, /context=\{showQrContext \? \[invitationData\.guest\.name, invitationData\.title\]/);
});

test("envelope gate uses the timed one-tap sequence and contains no continue or more-details action", () => {
  const gate = read("components/invitation/templates/evergreen-envelope/EvergreenEnvelopeGate.tsx");
  const page = read("components/invitation/templates/evergreen-envelope/EvergreenEnvelopePageTemplate.tsx");
  assert.match(gate, /image\.decode\(\)/);
  assert.match(gate, /setTimeout\(\(\) => setImagesReady\(true\), 1500\)/);
  assert.match(gate, /setTimeout\(\(\) => setStage\("flap-opening"\), 180\)/);
  assert.match(gate, /setTimeout\(\(\) => setStage\("cards-rising"\), 700\)/);
  assert.match(gate, /setTimeout\(\(\) => setStage\("crossfade"\), 470\)/);
  assert.match(gate, /prefers-reduced-motion: reduce/);
  assert.match(gate, /onClick=\{skipOpening\}/);
  assert.match(gate, /data-evergreen-gate-card=\{index \+ 1\}/);
  assert.match(gate, /data-evergreen-envelope-flap="true"/);
  assert.match(gate, /data-evergreen-envelope-pocket="true"/);
  assert.match(gate, /aria-hidden=\{hidden\}/);
  assert.match(gate, /rotateX\(-178deg\)/);
  assert.match(gate, /transitionProperty: "transform, opacity"/);
  assert.match(gate, /reducedMotion \? "0ms" : flapOpen \? "820ms"/);
  assert.match(gate, /pointerEvents: stage === "complete" \? "none" : "auto"/);
  assert.match(gate, /translateY\(\$\{reducedMotion \? "0"/);
  assert.doesNotMatch(gate, /evergreenMoreDetails|continueToCover|onContinue/);
  assert.doesNotMatch(gate, /transition:\s*(?:all|height|top|left)|transitionProperty:\s*"[^"]*(?:height|top|left)|requestAnimationFrame\(.*scroll/);
  assert.ok(page.includes("aria-hidden={!pageIsActive}"), "pre-revealed cover stays hidden from assistive technology until the gate finishes");
  assert.ok(page.includes("inert={!pageIsActive}"), "pre-revealed cover cannot receive input while the gate is up");
  assert.doesNotMatch(page, /opacity:\s*pageIsActive\s*\?\s*1\s*:\s*0/, "the cover is already painted under the opaque gate to prevent a blank crossfade");
});

test("Evergreen gate cards persist their type, optional copy, second photo and focal point in JSON template data", () => {
  const layout = legacyInvitationTemplateToLayout("evergreen-envelope");
  const parsed = InvitationBlocksLayoutSchema.safeParse({
    ...layout,
    template_data: {
      envelope_card_one_type: "text",
      envelope_card_one_title: "Welcome",
      envelope_card_one_body: "Join us for dinner.",
      envelope_card_two_type: "photo",
      envelope_photo_two_url: "https://example.supabase.co/storage/v1/object/public/cms-media/envelope-two.jpg",
      photo_focal_points: { envelope_photo_two_url: { x: 42, y: 61 } },
    },
  });
  assert.equal(parsed.success, true, parsed.success ? "" : parsed.error.message);
  assert.equal(parsed.data.template_data.envelope_card_one_type, "text");
  assert.equal(parsed.data.template_data.envelope_card_two_type, "photo");
  assert.equal(parsed.data.template_data.envelope_photo_two_url, "https://example.supabase.co/storage/v1/object/public/cms-media/envelope-two.jpg");
  assert.deepEqual(parsed.data.template_data.photo_focal_points.envelope_photo_two_url, { x: 42, y: 61 });

  const data = { envelopePhotoTwo: "second-photo", heroImage: "cover-photo" };
  assert.equal(resolveEvergreenPhoto(data, "envelope_photo_two_url"), "second-photo");
  assert.equal(resolveEvergreenPhoto({ heroImage: "cover-photo" }, "envelope_photo_two_url"), "cover-photo");
});

test("builder distinguishes sample-only fallback cards from published guest copy", () => {
  const preview = mergeInvitationTemplatePreviewData("evergreen-envelope", { title: "A & B", locale: "en" });
  assert.ok(preview.sampleFields.includes("envelopePhoto"));
  assert.deepEqual(preview.data.sampleFields, preview.sampleFields);
  const gate = read("components/invitation/templates/evergreen-envelope/EvergreenEnvelopePageTemplate.tsx");
  assert.match(gate, /mode === "live"\s*\? reservedForName/);
  assert.match(gate, /mode === "preview"\s*\? reservedForName \|\| t\("evergreenReservedPreview"\)/);
  assert.match(gate, /guestAllowance: mode === "live" && cardTwoReservedName/);
  assert.match(gate, /sampleFields\.includes\("envelopePhoto"\)/);
  assert.match(gate, /sampleFields\.includes\("envelopePhotoTwo"\) \|\| sampleFields\.includes\("envelopePhoto"\)/);
  assert.match(gate, /setHasEntered\(false\)[\s\S]*setGateReplay/);
  assert.match(read("app/dashboard/events/[id]/invitation-page/builder/sections/EvergreenDetailsSection.tsx"), /evergreenEnvelopeCardType/);
  const photosSection = read("app/dashboard/events/[id]/invitation-page/builder/sections/EvergreenPhotosSection.tsx");
  assert.match(photosSection, /envelope_photo_two_url/);
  assert.equal((photosSection.match(/\{ key: "envelope_photo_two_url"/g) ?? []).length, 1, "second envelope photo is configured exactly once");
  assert.match(read("components/invitation/templates/evergreen-envelope/EvergreenEnvelopePageTemplate.tsx"), /mode === "shared"\s*\? null/);
});

test("Evergreen map links require HTTPS or an address and encode venue search text", () => {
  assert.equal(evergreenMapUrl({ name: "The Hall", address: "12 Main Road", mapUrl: "https://maps.example.test/place" }), "https://maps.example.test/place");
  assert.equal(evergreenMapUrl({ name: "The Hall", address: "12 Main Road", mapUrl: "javascript:alert(1)" }), "https://www.google.com/maps/search/?api=1&query=The%20Hall%2C%2012%20Main%20Road");
  assert.equal(evergreenMapUrl({ name: "The Hall", address: "", mapUrl: null }), null);
  assert.match(read("components/invitation/blocks/InvitationBlocksLayoutClient.tsx"), /closest\("a,button,input,textarea,select,\[role='button'\]"\)/);
  const page = read("components/invitation/templates/evergreen-envelope/EvergreenEnvelopePageTemplate.tsx");
  assert.match(page, /const label = venue\.label\.trim\(\) \|\| \(index === 0 \? t\("evergreenCeremony"\) : t\("evergreenReception"\)\)/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /rel="noopener noreferrer"/);
});

test("expanded Evergreen pass reuses shared vector QR and adds the guest and event context", () => {
  const portal = read("components/invitation/blocks/ActionPortalBlock.tsx");
  const qr = read("components/cards/ExpandableQr.tsx");
  const sharedDialog = read("components/ui/dialog.tsx");
  const evergreenPage = read("components/invitation/templates/evergreen-envelope/EvergreenEnvelopePageTemplate.tsx");
  assert.match(portal, /<ExpandableSvgQr/);
  assert.match(portal, /context=\{showQrContext \?/);
  assert.match(portal, /portalIntoNearestDialog=\{showQrContext\}/);
  assert.match(qr, /type: "svg"/);
  assert.match(qr, /DialogContent/);
  assert.match(qr, /triggerRef\.current\?\.closest\("dialog"\)/);
  assert.match(sharedDialog, /<DialogPortal container=\{portalContainer \?\? undefined\}>/);
  assert.match(qr, /context\.filter\(Boolean\)\.join\(" · "\)/);
  assert.ok(evergreenPage.includes("nestedDialogEscapeRef.current"), "Escape in the nested QR dialog does not close its native RSVP parent");
  assert.ok(evergreenPage.includes("onKeyDownCapture={"), "records nested Escape before native dialog cancellation");
});

test("Evergreen keeps its floating music block above the gate and uses the existing uploaded-audio and provider player", () => {
  const blockLayout = read("components/invitation/blocks/InvitationBlocksLayoutClient.tsx");
  const page = read("components/invitation/templates/evergreen-envelope/EvergreenEnvelopePageTemplate.tsx");
  const css = read("components/invitation/templates/evergreen-envelope/EvergreenEnvelopePageTemplate.module.css");
  const player = read("components/invitation/FloatingMusicControl.tsx");
  assert.match(blockLayout, /templateId === "evergreen-envelope" && block\.type === "music"\s*\?\s*content/);
  assert.match(page, /hasMusic && blocks\("music"\)/);
  assert.match(css, /top:\s*max\(1rem, env\(safe-area-inset-top/);
  assert.match(css, /z-index:\s*110/);
  assert.match(player, /audioRef\.current\s*\.play\(\)/);
  assert.match(player, /controller\.play\(\)/);
  assert.match(player, /widget\.play\(\)/);
  assert.match(player, /aria-label=\{isPlaying \? "Pause invitation music" : "Play invitation music"\}/);
  assert.doesNotMatch(player, /autoPlay/);
  assert.match(read("next.config.ts"), /\["worker-src", "'self'", "blob:"\]/);
  assert.match(read("next.config.ts"), /"media-src", "'self'", "blob:", supabaseOrigin, mediaOrigin, r2EndpointOrigin/);
});

