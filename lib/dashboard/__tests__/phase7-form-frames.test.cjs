"use strict";

// Phase 7 — legacy edit-form frames removed, open-section convention kept.
//
// The two legacy edit pages must not reintroduce page/section-level boxes;
// shared primitives must stay as the investigation found them (Card = entity
// box, SettingsCard/FormSection/CreatorPanel = open). Source-level pins:
// these files' logic is client-side form behavior with no dedicated harness.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const EVENT_EDIT = "app/events/edit/[id]/page.tsx";
const FUND_EDIT = "app/fundraisers/edit/[id]/page.tsx";

describe("Phase 7 — event edit is frameless", () => {
  it("A: no page-level form frame", () => {
    const s = src(EVENT_EDIT);
    assert.ok(!s.includes("rounded-3xl border"), "no rounded-3xl frame");
    assert.ok(!s.includes("bg-white p-8"), "no white padded form box");
    assert.ok(!s.includes("shadow-sm"), "no form shadow");
    assert.ok(s.includes('<form onSubmit={handleSubmit} className="space-y-8">'), "open form keeps spacing");
  });

  it("B: banner section is open, upload stack intact", () => {
    const s = src(EVENT_EDIT);
    assert.ok(s.includes("Event Banner"), "banner heading kept");
    assert.ok(s.includes("ImageUploadWithCrop"), "upload component kept");
    assert.ok(s.includes('bucket="event-banners"'), "banner bucket kept");
    assert.ok(s.includes("onRemove={() => update("), "remove handler kept");
  });

  it("C: imported-org block keeps its semantic tint", () => {
    const s = src(EVENT_EDIT);
    assert.ok(s.includes("Imported Organization Details"), "conditional block kept");
    assert.ok(s.includes("rounded-2xl bg-orange-50 p-5"), "tint retained, no border/shadow added");
    assert.ok(s.includes("isImported &&"), "conditional kept");
  });

  it("D: business logic untouched", () => {
    const s = src(EVENT_EDIT);
    assert.ok(s.includes("async function handleSubmit"), "submit kept");
    assert.ok(s.includes("async function upsertTicket"), "ticket upsert kept");
    assert.ok(s.includes("event.user_id !== session.user.id"), "ownership check kept");
    assert.ok(s.includes("RichTextEditor"), "description editor kept");
    assert.ok(s.includes("Save Event"), "save action kept");
  });
});

describe("Phase 7 — fundraiser edit is frameless", () => {
  it("E: no page/section/field frames", () => {
    const s = src(FUND_EDIT);
    assert.ok(!s.includes("rounded-3xl border"), "no rounded-3xl frames");
    assert.ok(!s.includes("bg-white p-8"), "no white padded form box");
    assert.ok(!s.includes("bg-white p-4"), "no depth-2 photo row box");
    assert.ok(!s.includes("shadow-sm"), "no form shadow");
    assert.ok(s.includes('<form onSubmit={handleSubmit} className="space-y-8">'), "open form keeps spacing");
  });

  it("F: gallery controls fully intact", () => {
    const s = src(FUND_EDIT);
    assert.ok(s.includes("updateGalleryItem"), "caption/url updates kept");
    assert.ok(s.includes("removeGalleryItem"), "photo remove kept");
    assert.ok(s.includes("addGalleryItem"), "photo add kept");
    assert.ok(s.includes("disabled={galleryItems.length === 1}"), "remove guard kept");
    assert.ok(s.includes("ImageUploadWithCrop"), "upload kept");
    assert.ok(s.includes("SearchableSelect"), "category select kept");
    assert.ok(s.includes("BeneficiarySelector") && s.includes("BeneficiaryInvite"), "beneficiary flow kept");
    assert.ok(s.includes("Save Fundraiser"), "save action kept");
  });
});

describe("Phase 7 — shared primitives and create pages unchanged", () => {
  it("G: shared primitives keep their verified shapes", () => {
    const card = src("components/ui/card.tsx");
    assert.ok(card.includes("rounded-xl border"), "Card stays an entity box");
    const settings = src("components/ui/settings-card.tsx");
    assert.ok(settings.includes("border-t border-zinc-200 pt-6"), "SettingsCard stays open");
    const creator = src("components/CreatorWorkspace.tsx");
    assert.ok(creator.includes("Previously this rendered a white bordered card"), "CreatorPanel stays flat");
  });

  it("H: create pages still use the flat convention", () => {
    assert.ok(src("app/create-event/page.tsx").includes("CreatorPanel"), "create event flat");
    assert.ok(src("app/create-fundraiser/page.tsx").includes("CreatorPanel"), "create fundraiser flat");
  });
});
