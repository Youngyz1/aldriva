const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const Module = require("module");
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
require.extensions[".tsx"] = require.extensions[".ts"];

describe("Invitation Card System", () => {
  it("should have all 6 required invitation template categories", () => {
    const { INVITATION_CATEGORIES, DEFAULT_INVITATION_TEMPLATES } = require("../invitation-templates");
    
    const requiredCategories = [
      "Wedding & Formal",
      "Birthday & Celebration",
      "Corporate & Conference",
      "Gala & Fundraiser",
      "Concert & Festival",
      "Casual & Community",
    ];

    assert.equal(DEFAULT_INVITATION_TEMPLATES.length, 6);
    
    for (const cat of requiredCategories) {
      const match = DEFAULT_INVITATION_TEMPLATES.find((t) => t.category === cat);
      assert.ok(match, `Category "${cat}" must have a default template`);
      assert.ok(match.layout_config, `Template "${match.name}" must have layout_config`);
      assert.ok(match.layout_config.slots.eventTitle, `Template "${match.name}" must have eventTitle slot`);
      assert.ok(match.layout_config.slots.guestName, `Template "${match.name}" must have guestName slot`);
      assert.ok(match.layout_config.slots.eventMeta, `Template "${match.name}" must have eventMeta slot`);
      assert.equal(typeof match.layout_config.slots.eventTitle.topPercent, "number");
      assert.equal(typeof match.layout_config.slots.eventTitle.leftPercent, "number");
      assert.equal(typeof match.layout_config.slots.eventTitle.widthPercent, "number");
    }
  });

  it("should verify pre-bundled font files have valid binary signatures", async () => {
    const fontDir = path.join(process.cwd(), "assets", "fonts");
    const requiredFonts = [
      "PlusJakartaSans-Regular.woff",
      "PlusJakartaSans-Bold.woff",
      "Cinzel-Regular.ttf",
      "Cinzel-Bold.ttf",
      "PlayfairDisplay-Regular.ttf",
      "PlayfairDisplay-Bold.ttf",
      "Montserrat-Regular.ttf",
      "Montserrat-Bold.ttf",
    ];

    function isValidFontBinary(buf) {
      if (!buf || buf.length < 4) return false;
      const tag = buf.toString("binary", 0, 4);
      const isTTF = buf[0] === 0x00 && buf[1] === 0x01 && buf[2] === 0x00 && buf[3] === 0x00;
      const isOTF = tag === "OTTO";
      const isWOFF = tag === "wOFF";
      return isTTF || isOTF || isWOFF;
    }

    for (const filename of requiredFonts) {
      const filePath = path.join(fontDir, filename);
      assert.ok(fs.existsSync(filePath), `Font file ${filename} must exist on disk`);
      const buf = fs.readFileSync(filePath);
      assert.ok(isValidFontBinary(buf), `Font file ${filename} must have a valid TTF/OTF/WOFF binary header`);
    }
  });

  it("should format guest display name, event location, and date properly", () => {
    const {
      formatGuestDisplayName,
      formatEventLocation,
      formatEventDateTime,
    } = require("../../components/invitation/InvitationCardRenderer");

    assert.equal(formatGuestDisplayName("Jane Doe"), "Jane Doe");
    assert.equal(formatGuestDisplayName("Jane Doe", "Dr."), "Dr. Jane Doe");
    assert.equal(formatGuestDisplayName("Jane Doe", "Dr.", "Acme Corp"), "Dr. Jane Doe (Acme Corp)");

    assert.equal(formatEventLocation("Metropolitan Hall", "New York, NY"), "Metropolitan Hall · New York, NY");
    assert.equal(formatEventLocation(null, "New York, NY"), "New York, NY");
    assert.equal(formatEventLocation(null, null), "Venue TBA");

    assert.equal(formatEventDateTime(null), "Date & Time Announced Soon");
  });

  it("should adapt font size dynamically and truncate safely for variable-length guest names", () => {
    const {
      getAdaptiveFontSize,
      truncateText,
    } = require("../../components/invitation/InvitationCardRenderer");

    // Short name: retains full base font size
    assert.equal(getAdaptiveFontSize("Alex Kim", 26), 26);
    assert.equal(getAdaptiveFontSize("Eleanor Vance", 26), 26);

    // Medium-long name: scales down slightly
    assert.equal(getAdaptiveFontSize("Keynote Speaker Eleanor Vance", 26), 21);

    // Long name with organization: scales down to maintain vertical clearance
    const longName = "Keynote Speaker Hon. Eleanor Vance (Global Tech Foundation)";
    assert.equal(getAdaptiveFontSize(longName, 26), 16);

    // Truncate helper
    assert.equal(truncateText("Alex Kim", 75), "Alex Kim");
    const hugeText = "A".repeat(100);
    const truncated = truncateText(hugeText, 75);
    assert.equal(truncated.length, 75);
    assert.ok(truncated.endsWith("…"));
  });

  it("should resolve template by id with graceful default fallback", async () => {
    const { getInvitationTemplateById, DEFAULT_INVITATION_TEMPLATES } = require("../invitation-templates");

    const tplWedding = await getInvitationTemplateById("royal-elegance");
    assert.equal(tplWedding.name, "Royal Elegance");
    assert.equal(tplWedding.category, "Wedding & Formal");

    const tplNonExistent = await getInvitationTemplateById("unknown-non-existent-template-id");
    assert.equal(tplNonExistent.id, DEFAULT_INVITATION_TEMPLATES[0].id);
  });

  it("should verify migration 120 files integrity", () => {
    const migPath = path.join(ROOT, "db", "migration_120_invitation_templates.sql");
    const rollbackPath = path.join(ROOT, "db", "migration_120_invitation_templates_rollback.sql");
    const mirrorPath = path.join(ROOT, "supabase", "migrations", "20260914000001_migration_120_invitation_templates.sql");

    assert.strictEqual(fs.existsSync(migPath), true, "db/migration_120_invitation_templates.sql must exist");
    assert.strictEqual(fs.existsSync(rollbackPath), true, "db/migration_120_invitation_templates_rollback.sql must exist");
    assert.strictEqual(fs.existsSync(mirrorPath), true, "supabase mirror migration must exist");

    const migContent = fs.readFileSync(migPath, "utf8");
    assert.strictEqual(migContent.includes("CREATE TABLE IF NOT EXISTS invitation_templates"), true);
    assert.strictEqual(migContent.includes("invitation_template_id UUID REFERENCES invitation_templates"), true);
    assert.strictEqual(migContent.includes("Wedding & Formal"), true);
    assert.strictEqual(migContent.includes("Birthday & Celebration"), true);
    assert.strictEqual(migContent.includes("Corporate & Conference"), true);
    assert.strictEqual(migContent.includes("Gala & Fundraiser"), true);
    assert.strictEqual(migContent.includes("Concert & Festival"), true);
    assert.strictEqual(migContent.includes("Casual & Community"), true);
  });

  it("should verify migration 121 files integrity and storage URLs", () => {
    const migPath = path.join(ROOT, "db", "migration_121_update_invitation_artwork.sql");
    const rollbackPath = path.join(ROOT, "db", "migration_121_update_invitation_artwork_rollback.sql");
    const mirrorPath = path.join(ROOT, "supabase", "migrations", "20260914000002_migration_121_update_invitation_artwork.sql");

    assert.strictEqual(fs.existsSync(migPath), true, "db/migration_121_update_invitation_artwork.sql must exist");
    assert.strictEqual(fs.existsSync(rollbackPath), true, "db/migration_121_update_invitation_artwork_rollback.sql must exist");
    assert.strictEqual(fs.existsSync(mirrorPath), true, "supabase mirror migration 121 must exist");

    const migContent = fs.readFileSync(migPath, "utf8");
    assert.strictEqual(migContent.includes("invitation-templates/wedding-formal-bg.jpg"), true);
    assert.strictEqual(migContent.includes("invitation-templates/birthday-celebration-bg.jpg"), true);
    assert.strictEqual(migContent.includes("invitation-templates/corporate-conference-bg.jpg"), true);
    assert.strictEqual(migContent.includes("invitation-templates/gala-fundraiser-bg.jpg"), true);
    assert.strictEqual(migContent.includes("invitation-templates/concert-festival-bg.jpg"), true);
    assert.strictEqual(migContent.includes("invitation-templates/casual-community-bg.jpg"), true);

    const { DEFAULT_INVITATION_TEMPLATES } = require("../invitation-templates");
    for (const tpl of DEFAULT_INVITATION_TEMPLATES) {
      assert.ok(tpl.background_image_url.startsWith("https://"), `Template ${tpl.slug} background must use https URL`);
      assert.ok(tpl.thumbnail_url.startsWith("https://"), `Template ${tpl.slug} thumbnail must use https URL`);
    }
  });
});
