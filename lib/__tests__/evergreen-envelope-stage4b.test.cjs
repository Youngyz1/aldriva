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
const { InvitationBlocksLayoutSchema } = require("../invitation-template-schema.ts");
const { ScheduleItemSchema, VenueItemSchema } = require("../invitation-page-schema.ts");
const { evergreenMapUrl } = require("../evergreen-map.ts");

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Evergreen renderer, schema, and adapter preserve unknown-ID fallbacks", () => {
  assert.equal(getInvitationTemplateDefinition("unknown-envelope-id"), undefined);
  const unknownFallback = legacyInvitationTemplateToLayout("unknown-envelope-id");
  assert.ok(unknownFallback.layout_blocks.some((block) => block.type === "hero"));

  const evergreen = legacyInvitationTemplateToLayout("evergreen-envelope");
  assert.equal(getInvitationTemplateDefinition("evergreen-envelope").pageRenderer.componentId, "evergreen-envelope");
  assert.ok(!evergreen.layout_blocks.some((block) => block.type === "location_map"));
  assert.ok(evergreen.layout_blocks.some((block) => block.type === "music"));
  const parsed = InvitationBlocksLayoutSchema.safeParse(evergreen);
  assert.equal(parsed.success, true);

  const componentRegistry = read("components/invitation/templates/InvitationPageComponentRegistry.tsx");
  assert.match(componentRegistry, /"evergreen-envelope":\s*lazy\(\(\)\s*=>\s*import\("@\/components\/invitation\/templates\/evergreen-envelope\/EvergreenEnvelopePageTemplate"\)/);
});

test("Evergreen settings hide empty sections and survive template switching away and back", () => {
  const evergreen = legacyInvitationTemplateToLayout("evergreen-envelope");
  const edited = {
    ...evergreen,
    template_data: {
      show_story: false,
      show_dress_code: false,
      show_accommodations_photos: false,
      show_closing_photo: false,
      show_rsvp: false,
      show_location_map: false,
      rsvp_intro: "Keep this custom saved copy",
    },
  };
  assert.equal(InvitationBlocksLayoutSchema.safeParse(edited).success, true);
  const switched = legacyInvitationTemplateToLayout("botanical-reverie", edited);
  const restored = legacyInvitationTemplateToLayout("evergreen-envelope", switched);
  assert.equal(restored.template_data.rsvp_intro, "Keep this custom saved copy");
  assert.equal(restored.template_data.show_story, false);
  assert.equal(restored.template_data.show_location_map, false);

  const page = read("components/invitation/templates/evergreen-envelope/EvergreenEnvelopePageTemplate.tsx");
  for (const flag of ["show_schedule", "show_dress_code", "show_story", "show_accommodations_photos", "show_closing_photo", "show_rsvp"]) {
    assert.ok(page.includes(`sectionSettings.${flag} !== false`), `${flag} is a section visibility control`);
  }
  assert.doesNotMatch(page, /show_location_map === true/, "Evergreen no longer renders the shared map block");
  assert.match(page, /hasStoryContent/);
  assert.match(page, /Boolean\(accommodations\.length \|\| data\.albumUrl\?\.trim\(\)\)/);
});

test("Evergreen map URLs accept HTTPS only and missing links use a search fallback", () => {
  const venue = { label: "Ceremony", name: "A Hall", address: "10 Main Street", mapUrl: null };
  assert.equal(VenueItemSchema.safeParse(venue).success, true);
  assert.equal(VenueItemSchema.safeParse({ ...venue, mapUrl: "https://maps.example/place" }).success, true);
  assert.equal(VenueItemSchema.safeParse({ ...venue, mapUrl: "http://maps.example/place" }).success, false, "the saved URL field accepts HTTPS only");
  assert.equal(evergreenMapUrl({ ...venue, mapUrl: "https://maps.example/place" }), "https://maps.example/place");
  assert.equal(evergreenMapUrl({ ...venue, mapUrl: "http://maps.example/place" }), "https://www.google.com/maps/search/?api=1&query=A%20Hall%2C%2010%20Main%20Street");
  assert.equal(evergreenMapUrl({ label: "Ceremony", name: "", address: "", mapUrl: null }), null);
  const page = read("components/invitation/templates/evergreen-envelope/EvergreenEnvelopePageTemplate.tsx");
  assert.match(page, /evergreenMapUrl\(venue\)/);
  assert.match(page, /data-evergreen-map-link="true"/);
  assert.match(page, /rel="noopener noreferrer"/);
});

test("Evergreen schedule accepts the hand icon and every new RSVP label is localized", () => {
  assert.equal(ScheduleItemSchema.safeParse({ time: "6:00 PM", title: "Thanks for coming", icon: "hand" }).success, true);
  assert.equal(ScheduleItemSchema.safeParse({ time: "6:00 PM", title: "Thanks for coming", icon: "gift" }).success, true);
  const sampleData = read("components/invitation/templates/invitation-sample-data.ts");
  assert.match(sampleData, /title: "Thanks for coming!", icon: "hand"/);
  const english = JSON.parse(read("messages/en.json")).Events;
  const french = JSON.parse(read("messages/fr.json")).Events;
  for (const key of [
    "evergreenScheduleIconHand",
    "evergreenRsvpGuestNames",
    "evergreenRsvpResponse",
    "evergreenRsvpChooseResponse",
    "evergreenRsvpAccept",
    "evergreenRsvpDecline",
    "evergreenRsvpCount",
    "evergreenRsvpChooseCount",
    "evergreenRsvpWishes",
    "evergreenRsvpSubmit",
    "evergreenAdultsOnlyFallback",
    "evergreenAccommodationNote",
    "evergreenAlbumNote",
    "guestColumnsUnavailable",
    "guestAllowanceBadge",
    "viewGuestRsvpDetails",
    "viewGuestRsvpDetailsFor",
    "guestAllowanceLabel",
    "guestAllowanceHint",
    "guestRsvpHeading",
    "closeGuestRsvpDetails",
    "guestRsvpResponseLabel",
    "guestRsvpCountLabel",
    "guestRsvpNamesLabel",
    "guestRsvpMessageLabel",
    "guestRsvpNotProvided",
    "readGuestRsvpMessage",
    "guestRsvpNoMessage",
  ]) {
    assert.equal(typeof english[key], "string", `English ${key}`);
    assert.equal(typeof french[key], "string", `French ${key}`);
  }
  const actionPortal = read("components/invitation/blocks/ActionPortalBlock.tsx");
  assert.doesNotMatch(actionPortal, /Full names of all guests attending|Noms complets de tous les invités présents/);
});

test("Evergreen story, gallery, RSVP, reduced-motion, and shared-mode contracts stay isolated", () => {
  const page = read("components/invitation/templates/evergreen-envelope/EvergreenEnvelopePageTemplate.tsx");
  const gate = read("components/invitation/templates/evergreen-envelope/EvergreenEnvelopeGate.tsx");
  const reveal = read("components/invitation/animation/InvitationScrollReveal.tsx");
  const blockRegistry = read("components/invitation/blocks/InvitationBlockRegistry.tsx");
  const presentationBlocks = read("components/invitation/blocks/InvitationPresentationBlocks.tsx");
  assert.match(page, /blocks\("schedule"\)/);
  assert.match(presentationBlocks, /data-evergreen-section="schedule"/);
  assert.match(presentationBlocks, /EVERGREEN_SCHEDULE_ICON_FALLBACKS/);
  assert.match(blockRegistry, /evergreenEnvelope=\{templateId === "evergreen-envelope"\}/);
  assert.match(page, /data-evergreen-section="dress-code"/);
  assert.match(page, /data-evergreen-section="information-cards"/);
  assert.match(page, /data-evergreen-section="story"/);
  const storySectionClass = page.match(/<section data-evergreen-section="story" className="([^"]+)"/)?.[1] ?? "";
  assert.match(storySectionClass, /overflow-clip/);
  assert.doesNotMatch(storySectionClass, /overflow-hidden/);
  assert.match(page, /data-evergreen-story-swap="true"/);
  assert.match(page, /storyFrames\.map/);
  assert.match(page, /data-evergreen-story-frame=\{index \+ 1\}/);
  assert.match(page, /className="sticky top-\[8svh\] flex h-\[76svh\]/);
  assert.match(page, /data-evergreen-section="accommodations-photos"/);
  assert.match(page, /data-evergreen-section="closing-photo"/);
  assert.match(page, /data-evergreen-section="rsvp"/);
  assert.match(page, /blocks\("action_portal"\)/);
  assert.match(page, /mode !== "shared"/);
  assert.match(blockRegistry, /evergreenRsvp=\{usesEvergreenRsvpForm\(templateId\)\}/);
  assert.match(page, /invitationPreviewGuestCaption/);
  assert.match(gate, /stage === "closed" \|\| stage === "complete"/);
  assert.match(gate, /setStage\("flap-opening"\)/);
  assert.match(gate, /setStage\("crossfade"\)/);
  assert.match(gate, /onClick=\{skipOpening\}/);
  assert.doesNotMatch(gate, /stage === "continue"|evergreenMoreDetails/);
  assert.match(reveal, /prefers-reduced-motion: reduce/);
  assert.match(reveal, /IntersectionObserver/);
  assert.doesNotMatch(page, /requestAnimationFrame\([^)]*scroll|addEventListener\("scroll"/);
});

test("Evergreen countdown omits the legacy romantic subtitle without changing other templates", () => {
  const registry = read("components/invitation/blocks/InvitationBlockRegistry.tsx");
  const blocks = read("components/invitation/blocks/InvitationPresentationBlocks.tsx");
  assert.match(registry, /showRomanticTagline=\{templateId !== "evergreen-envelope" && romanticEnvelope\}/);
  assert.match(blocks, /showRomanticTagline = romanticEnvelope/);
  assert.match(blocks, /\{showRomanticTagline \?/);
});

