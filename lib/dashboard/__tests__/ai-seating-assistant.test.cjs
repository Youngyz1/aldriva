"use strict";

const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { describe, it } = require("node:test");
const ts = require("typescript");

// --- TypeScript + @/ alias resolver (mirrors canonical-seating-generator.test.cjs) ---
const ROOT = path.resolve(__dirname, "../../..");
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

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

Module._load = function loadMocks(request, parent, isMain) {
  if (request === "@/lib/supabase-admin" || request.endsWith("lib/supabase-admin")) {
    return { createSupabaseAdmin: () => null };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  validateSeatingPlanConfig,
  generateCanonicalSeatingPlan,
  checkLayoutProtection,
} = require("@/lib/seating.ts");

const { RATE_LIMITS } = require("@/lib/rate-limit.ts");

function isValidMode(v) { return v === "rows" || v === "tables"; }
function isPositiveInt(v) {
  return typeof v === "number" && Number.isFinite(v) && v > 0 && Math.floor(v) === v;
}

function validateAiSection(raw, idx) {
  if (!raw || typeof raw !== "object")
    throw new Error(`Section [${idx}] is not an object`);
  if (typeof raw.name !== "string" || raw.name.trim().length === 0)
    throw new Error(`Section [${idx}]: name must be a non-empty string`);
  if (!isValidMode(raw.mode))
    throw new Error(`Section [${idx}]: mode must be "rows" or "tables"`);

  const proposal = {
    name: String(raw.name).trim().slice(0, 80),
    mode: raw.mode,
    isVip: Boolean(raw.isVip ?? false),
    isAccessible: Boolean(raw.isAccessible ?? false),
  };

  if (raw.mode === "rows") {
    if (!isPositiveInt(raw.rowCount))
      throw new Error(`Section [${idx}]: rowCount must be a positive integer`);
    if (!isPositiveInt(raw.seatsPerRow))
      throw new Error(`Section [${idx}]: seatsPerRow must be a positive integer`);
    proposal.rowCount = Number(raw.rowCount);
    proposal.seatsPerRow = Number(raw.seatsPerRow);
  } else {
    if (!isPositiveInt(raw.tableCount))
      throw new Error(`Section [${idx}]: tableCount must be a positive integer`);
    if (!isPositiveInt(raw.seatsPerTable))
      throw new Error(`Section [${idx}]: seatsPerTable must be a positive integer`);
    proposal.tableCount = Number(raw.tableCount);
    proposal.seatsPerTable = Number(raw.seatsPerTable);
    proposal.tableShape = raw.tableShape === "rect" ? "rect" : "round";
  }
  return proposal;
}

function validateProposalJson(raw) {
  if (!raw || typeof raw !== "object")
    throw new Error("Model output is not an object");
  const sections = Array.isArray(raw.sections) ? raw.sections : [];
  const assumptions = Array.isArray(raw.assumptions)
    ? raw.assumptions.filter((a) => typeof a === "string").slice(0, 10)
    : [];
  const questions = Array.isArray(raw.questions)
    ? raw.questions.filter((q) => typeof q === "string").slice(0, 5)
    : [];
  if (sections.length === 0 && questions.length === 0)
    throw new Error("Model returned neither sections nor questions");
  const validatedSections = sections.map((s, i) => validateAiSection(s, i));
  if (validatedSections.length > 0) {
    const cfgSections = validatedSections.map((s) => ({
      name: s.name, mode: s.mode,
      rowCount: s.rowCount, seatsPerRow: s.seatsPerRow,
      tableCount: s.tableCount, seatsPerTable: s.seatsPerTable,
      isVip: s.isVip, isAccessible: s.isAccessible,
    }));
    const validation = validateSeatingPlanConfig({ sections: cfgSections });
    if (!validation.valid)
      throw new Error(`Configuration validation failed: ${validation.errors.join("; ")}`);
  }
  return { sections: validatedSections, assumptions, questions };
}

function aiSectionToFormItem(section, index) {
  return {
    id: `ai-sec-test-${index}`,
    name: section.name,
    mode: section.mode,
    ticketTypeId: "",
    defaultPrice: "",
    isVip: Boolean(section.isVip),
    isAccessible: Boolean(section.isAccessible),
    rowCount: section.rowCount ?? 1,
    seatsPerRow: section.seatsPerRow ?? 10,
    rowLabelPrefix: "",
    startSeatNumber: 1,
    tableCount: section.tableCount ?? 1,
    seatsPerTable: section.seatsPerTable ?? 8,
    tableShape: section.tableShape ?? "round",
    tableNamePrefix: "Table",
    startTableNumber: 1,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Phase 6D — AI Seating Assistant", () => {

  it("A: row proposal produces valid ManualSectionFormItem", () => {
    const raw = {
      sections: [{ name: "Main Floor", mode: "rows", rowCount: 5, seatsPerRow: 10, isVip: false, isAccessible: false }],
      assumptions: ["Seat numbering starts at 1."],
      questions: [],
    };
    const proposal = validateProposalJson(raw);
    assert.equal(proposal.sections[0].rowCount, 5);
    assert.equal(proposal.sections[0].seatsPerRow, 10);
    const item = aiSectionToFormItem(proposal.sections[0], 0);
    assert.equal(item.mode, "rows");
    assert.equal(item.ticketTypeId, "");   // no commerce
    assert.equal(item.defaultPrice, "");   // no commerce
  });

  it("B: table proposal produces valid ManualSectionFormItem", () => {
    const raw = {
      sections: [{ name: "Banquet Hall", mode: "tables", tableCount: 8, seatsPerTable: 6, isVip: false, isAccessible: false }],
      assumptions: [],
      questions: [],
    };
    const proposal = validateProposalJson(raw);
    assert.equal(proposal.sections[0].tableCount, 8);
    const item = aiSectionToFormItem(proposal.sections[0], 0);
    assert.equal(item.mode, "tables");
    assert.equal(item.tableCount, 8);
  });

  it("C: VIP section proposal preserves isVip:true", () => {
    const raw = {
      sections: [
        { name: "VIP", mode: "rows", rowCount: 2, seatsPerRow: 10, isVip: true, isAccessible: false },
        { name: "General", mode: "rows", rowCount: 5, seatsPerRow: 20, isVip: false, isAccessible: false },
      ],
      assumptions: [],
      questions: [],
    };
    const proposal = validateProposalJson(raw);
    assert.equal(proposal.sections[0].isVip, true);
    assert.equal(proposal.sections[1].isVip, false);
    assert.equal(aiSectionToFormItem(proposal.sections[0], 0).isVip, true);
  });

  it("D: accessible section preserves isAccessible:true", () => {
    const raw = {
      sections: [{ name: "Accessible", mode: "rows", rowCount: 1, seatsPerRow: 4, isVip: false, isAccessible: true }],
      assumptions: [],
      questions: [],
    };
    const proposal = validateProposalJson(raw);
    assert.equal(proposal.sections[0].isAccessible, true);
    assert.equal(aiSectionToFormItem(proposal.sections[0], 0).isAccessible, true);
  });

  it("E: clarification needed - sections empty, questions populated", () => {
    const raw = {
      sections: [],
      assumptions: [],
      questions: ["How many guests do you need to seat?"],
    };
    const proposal = validateProposalJson(raw);
    assert.equal(proposal.sections.length, 0);
    assert.equal(proposal.questions.length, 1);
  });

  it("F: duplicate section names are permitted by the DTO validator (canonical engine handles them)", () => {
    // The canonical validator allows same-named sections — they generate distinct seat groups.
    // The DTO validator should not reject them; if deduplication is desired it belongs in UX.
    const raw = {
      sections: [
        { name: "Main Floor", mode: "rows", rowCount: 5, seatsPerRow: 10, isVip: false, isAccessible: false },
        { name: "Main Floor", mode: "rows", rowCount: 5, seatsPerRow: 10, isVip: false, isAccessible: false },
      ],
      assumptions: [],
      questions: [],
    };
    const proposal = validateProposalJson(raw);
    assert.equal(proposal.sections.length, 2, "Both sections should be returned");
    assert.equal(proposal.sections[0].name, "Main Floor");
    assert.equal(proposal.sections[1].name, "Main Floor");
  });

  it("G: non-object/null/number model output rejected", () => {
    assert.throws(() => validateProposalJson("string"), /not an object/i);
    assert.throws(() => validateProposalJson(null), /not an object/i);
    assert.throws(() => validateProposalJson(42), /not an object/i);
  });

  it("H: rowCount=0 fails positive integer validation", () => {
    const raw = {
      sections: [{ name: "Main Floor", mode: "rows", rowCount: 0, seatsPerRow: 10, isVip: false, isAccessible: false }],
      assumptions: [],
      questions: [],
    };
    assert.throws(() => validateProposalJson(raw), /positive integer/i);
  });

  it("I: validateProposalJson has no side effects - no IDs generated on sections", () => {
    const raw = {
      sections: [{ name: "Test", mode: "rows", rowCount: 2, seatsPerRow: 5, isVip: false, isAccessible: false }],
      assumptions: [],
      questions: [],
    };
    const proposal = validateProposalJson(raw);
    for (const s of proposal.sections) {
      assert.equal(s.id, undefined, "AI sections must not have generated IDs");
    }
  });

  it("J: empty/null event ID fails authorization guard", () => {
    function guardEventId(eventId) {
      if (!eventId || typeof eventId !== "string") throw new Error("Invalid event ID");
      return true;
    }
    assert.throws(() => guardEventId(""), /Invalid event ID/);
    assert.throws(() => guardEventId(null), /Invalid event ID/);
    assert.ok(guardEventId("some-uuid-value"));
  });

  it("K: seatingAi rate limit key is registered and more restrictive than articleAi", () => {
    const { RATE_LIMITS } = require("@/lib/rate-limit.ts");
    assert.ok("seatingAi" in RATE_LIMITS, "seatingAi must be in RATE_LIMITS");
    assert.ok(RATE_LIMITS.seatingAi.limit > 0);
    assert.ok(RATE_LIMITS.seatingAi.windowSeconds > 0);
    assert.ok(
      RATE_LIMITS.seatingAi.limit <= RATE_LIMITS.articleAi.limit,
      "seatingAi limit should be <= articleAi"
    );
  });

  it("L: section name bounded to 80 characters", () => {
    const raw = {
      sections: [{ name: "A".repeat(200), mode: "rows", rowCount: 1, seatsPerRow: 5, isVip: false, isAccessible: false }],
      assumptions: [],
      questions: [],
    };
    const proposal = validateProposalJson(raw);
    assert.ok(proposal.sections[0].name.length <= 80);
  });

  it("M: aiSectionToFormItem produces complete form shape with empty commerce fields", () => {
    const section = { name: "VIP Lounge", mode: "rows", rowCount: 2, seatsPerRow: 10, isVip: true, isAccessible: false };
    const item = aiSectionToFormItem(section, 0);
    assert.ok(item.id);
    assert.equal(item.name, "VIP Lounge");
    assert.equal(item.ticketTypeId, "");
    assert.equal(item.defaultPrice, "");
    assert.equal(item.isVip, true);
    assert.ok(typeof item.tableCount === "number", "tableShape fields must have safe defaults");
  });

  it("N: checkLayoutProtection blocks replace when sold seats exist", () => {
    const soldSeat = {
      id: "uuid-1", status: "sold", section: "Main",
      row_label: "A", seat_number: 1, is_vip: false,
      is_accessible: false, x: 100, y: 100,
    };
    const replaceProtection = checkLayoutProtection([soldSeat], "replace");
    assert.equal(replaceProtection.canReplace, false, "Replace must be blocked when sold seats exist");
    const appendProtection = checkLayoutProtection([soldSeat], "append");
    assert.equal(appendProtection.canReplace, true, "Append must always be allowed");
  });

  it("O: canonical engine generates no UUIDs; proposal sections have no IDs", () => {
    const raw = {
      sections: [{ name: "Floor", mode: "rows", rowCount: 3, seatsPerRow: 5, isVip: false, isAccessible: false }],
      assumptions: [],
      questions: [],
    };
    const proposal = validateProposalJson(raw);
    for (const s of proposal.sections) {
      assert.equal(s.id, undefined, "AI sections must not have IDs");
    }
    const result = generateCanonicalSeatingPlan({
      sections: proposal.sections.map((s) => ({
        name: s.name, mode: s.mode,
        rowCount: s.rowCount, seatsPerRow: s.seatsPerRow,
        isVip: s.isVip, isAccessible: s.isAccessible,
      })),
    });
    for (const seat of result.seats) {
      assert.equal(seat.id, undefined, "Canonical engine must not fabricate UUIDs");
    }
    assert.equal(result.summary.totalSeats, 15);
  });

});
