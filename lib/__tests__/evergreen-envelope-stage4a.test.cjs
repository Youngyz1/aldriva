const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const source = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Evergreen selects only its literal allowlisted page component", () => {
  const registry = source("lib/invitation-template-registry.ts");
  const componentRegistry = source("components/invitation/templates/InvitationPageComponentRegistry.tsx");
  assert.match(registry, /"evergreen-envelope":\s*\{[\s\S]*?pageRenderer:\s*\{\s*kind:\s*"custom",\s*componentId:\s*"evergreen-envelope"\s*\}/);
  assert.match(componentRegistry, /"evergreen-envelope":\s*lazy\(\(\)\s*=>\s*import\("@\/components\/invitation\/templates\/evergreen-envelope\/EvergreenEnvelopePageTemplate"\)/);
  assert.match(componentRegistry, /satisfies Record<CustomInvitationPageComponentId, LazyExoticComponent/);
  assert.match(registry, /"botanical-reverie":\s*\{[\s\S]*?pageRenderer:\s*\{ kind: "custom", componentId: "botanical-reverie" \}/);
  assert.match(registry, /"romantic-envelope":\s*\{[\s\S]*?pageRenderer:\s*\{ kind: "custom", componentId: "romantic-envelope" \}/);
});

test("Stage 4A sections are hideable through validated Evergreen builder settings", () => {
  const schema = source("lib/invitation-template-schema.ts");
  const types = source("types/invitation-template.ts");
  const builder = source("app/dashboard/events/[id]/invitation-page/builder/sections/EvergreenDetailsSection.tsx");
  const page = source("components/invitation/templates/evergreen-envelope/EvergreenEnvelopePageTemplate.tsx");
  for (const flag of ["show_gate", "show_cover", "show_invitation_card", "show_countdown_photos", "show_venues"]) {
    assert.match(types, new RegExp(`${flag}\\?: boolean`));
    assert.match(schema, new RegExp(`${flag}: z\\.boolean\\(\\)\\.optional\\(\\)`));
    assert.match(builder, new RegExp(`\\["${flag}"`));
    assert.ok(page.includes(`sectionSettings.${flag} !== false`), `${flag} gates its section`);
  }
  for (const field of ["gate_intro", "gate_heading", "invitation_line", "venues_heading"]) {
    assert.match(types, new RegExp(`${field}\\?: string \\| null`));
    assert.match(schema, new RegExp(`${field}: z\\.string\\(\\)\\.max\\(\\d+\\)\\.nullable\\(\\)\\.optional\\(\\)`));
    assert.ok(builder.includes(`"${field}"`), `${field} is organizer-editable`);
  }
});

test("the custom page rearranges shared blocks and owns no invitation or RSVP data access", () => {
  const page = source("components/invitation/templates/evergreen-envelope/EvergreenEnvelopePageTemplate.tsx");
  assert.match(page, /EvergreenEnvelopeGate/);
  assert.match(page, /blocks\("countdown"\)/);
  assert.doesNotMatch(page, /blocks\("location_map"\)/);
  assert.match(page, /evergreenMapUrl\(venue\)/, "venue cards retain their own map links");
  assert.match(page, /blocks\("music"\)/);
  assert.doesNotMatch(page, /supabase|event_invitations|fetch\(|RSVP_SUBMISSION|onAction|onRsvp/);
  assert.match(page, /mode === "shared"\s*\?\s*null/);
  assert.match(page, /mode === "preview"/);
});

test("gate opens in one tap with reduced motion and photos reserve space with lazy loading below the fold", () => {
  const gate = source("components/invitation/templates/evergreen-envelope/EvergreenEnvelopeGate.tsx");
  const page = source("components/invitation/templates/evergreen-envelope/EvergreenEnvelopePageTemplate.tsx");
  assert.match(gate, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(gate, /setStage\("seal-press"\)/);
  assert.match(gate, /setStage\("flap-opening"\)/);
  assert.match(gate, /setStage\("crossfade"\)/);
  assert.match(gate, /onClick=\{skipOpening\}/);
  assert.doesNotMatch(gate, /stage === "continue"|evergreenMoreDetails|evergreenContinue/);
  assert.match(page, /loading="lazy"/);
  assert.match(page, /width=\{480\}/);
  assert.match(page, /aspect-\[4\/5\]/);
});

test("new Evergreen interface strings exist in English and French", () => {
  const english = JSON.parse(source("messages/en.json")).Events;
  const french = JSON.parse(source("messages/fr.json")).Events;
  const keys = [
    "evergreenSectionsVisible", "evergreenShowGate", "evergreenShowCover", "evergreenShowInvitationCard",
    "evergreenShowCountdownPhotos", "evergreenShowVenues", "evergreenGateIntro", "evergreenGateHeading",
    "evergreenGateIntroEditor", "evergreenGateHeadingEditor", "evergreenInvitationLineEditor", "evergreenVenuesHeadingEditor",
    "evergreenGateAria", "evergreenTapSealToOpen", "evergreenOpenInvitation", "evergreenReservedFor",
    "evergreenGuestAllowance", "evergreenSampleBadge", "evergreenCardSampleTitle", "evergreenCardSampleBody",
    "evergreenReplayOpening", "evergreenCoverEyebrow",
    "evergreenInvitationHeading", "evergreenVenuesHeading", "evergreenCeremony", "evergreenReception",
    "evergreenViewMap",
  ];
  for (const key of keys) {
    assert.equal(typeof english[key], "string", `English ${key}`);
    assert.equal(typeof french[key], "string", `French ${key}`);
  }
});
