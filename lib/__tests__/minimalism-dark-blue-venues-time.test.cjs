/**
 * Behaviour tests for minimalism-dark-blue venue/time/schedule fixes.
 * Real calls via CJS + TS transpile + @/ alias resolution.
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
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
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

const { assembleInvitationPageData } = require("../types/invitation-page-snapshot.ts");
const { formatLocalizedEventDate, isValidIanaTimeZone } = require("../invitation-i18n.ts");
const { buildVenueMapSearchUrl } = require("../evergreen-map.ts");

function baseEvent(overrides = {}) {
  return {
    id: "e1",
    title: "Event",
    event_date: "2027-01-17T02:34:00Z",
    end_date: null,
    venue: "Event Venue",
    street_address: "123 Event St",
    city: "Lagos",
    latitude: null,
    longitude: null,
    timezone: "Africa/Lagos",
    ...overrides,
  };
}

function baseSnapshot(overrides = {}) {
  return {
    template_id: "minimalism-dark-blue",
    locale: "en",
    timezone: "Africa/Lagos",
    venues: null,
    schedule: null,
    venue_name: null,
    address: null,
    blocks_layout: null,
    ...overrides,
  };
}

describe("minimalism-dark-blue venues/time/schedule", () => {
  test("venue precedence 1: Multiple Locations entries take display priority via venues array", () => {
    const data = assembleInvitationPageData(
      baseSnapshot({
        venues: [{ label: "Ceremony", name: "Multi Hall", address: "1 Multi Rd", time: "2:00 PM" }],
        venue_name: "Override Venue",
        address: "Override Addr",
      }),
      baseEvent()
    );
    assert.ok(Array.isArray(data.venues) && data.venues.length === 1);
    assert.equal(data.venues[0].name, "Multi Hall");
    // flat effective venue remains override > event (assembly contract)
    assert.equal(data.venue, "Override Venue");
    assert.equal(data.address, "Override Addr");
  });

  test("venue precedence 2: venue/address override beats event venue when no flat override conflicts", () => {
    const data = assembleInvitationPageData(
      baseSnapshot({ venue_name: "All seasons hotel", address: "99 Override St", venues: [] }),
      baseEvent({ venue: "Welthral catholic church", street_address: "Church Rd" })
    );
    assert.equal(data.venue, "All seasons hotel");
    assert.equal(data.address, "99 Override St");
  });

  test("venue precedence 3: event venue+city/address used when no override and no multi venues", () => {
    const data = assembleInvitationPageData(
      baseSnapshot({ venue_name: null, address: null, venues: [] }),
      baseEvent({ venue: "Welthral catholic church", street_address: "Church Rd", city: "Abuja" })
    );
    assert.equal(data.venue, "Welthral catholic church");
    assert.equal(data.address, "Church Rd");
  });

  test("empty venue data is preserved as empty/absent (no sample injection in assembly)", () => {
    const data = assembleInvitationPageData(
      baseSnapshot({ venue_name: null, address: null, venues: [] }),
      baseEvent({ venue: "", street_address: "", city: "" })
    );
    assert.equal(data.venue, "");
    assert.deepEqual(data.venues, []);
  });

  test("map URL builder encodes name+address and returns null when both empty", () => {
    const url = buildVenueMapSearchUrl("The Hall", "12 Main Road & Ave");
    assert.ok(url);
    assert.match(url, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
    assert.ok(url.includes("The%20Hall"));
    assert.ok(url.includes("12%20Main%20Road%20%26%20Ave"));
    assert.equal(buildVenueMapSearchUrl("", ""), null);
    assert.equal(buildVenueMapSearchUrl("   ", null), null);
    assert.ok(buildVenueMapSearchUrl("Name Only", ""));
  });

  test("event time rendering: valid ISO + valid timezone shows real time", () => {
    const r = formatLocalizedEventDate("2027-01-17T02:34:00Z", "en", "America/New_York");
    assert.ok(!/TBA/i.test(r.timeDisplay));
    assert.match(r.timeDisplay, /\d/);
  });

  test("invalid timezone does not throw and still shows a time (degrades gracefully)", () => {
    assert.doesNotThrow(() => formatLocalizedEventDate("2027-01-17T02:34:00Z", "en", "lagos niaja"));
    const r = formatLocalizedEventDate("2027-01-17T02:34:00Z", "en", "lagos niaja");
    assert.ok(!/TBA/i.test(r.timeDisplay), `expected real time, got ${r.timeDisplay}`);
    assert.match(r.timeDisplay, /\d/);
    assert.equal(isValidIanaTimeZone("lagos niaja"), false);
    assert.equal(isValidIanaTimeZone("Africa/Lagos"), true);
  });

  test("schedule rows from draft reach assembled template data (no sample replacement)", () => {
    const data = assembleInvitationPageData(
      baseSnapshot({
        schedule: [
          { time: "7:15 PM", title: "My Distinctive Row", label: "My Distinctive Row" },
        ],
      }),
      baseEvent()
    );
    assert.ok(Array.isArray(data.schedule));
    assert.equal(data.schedule[0].title, "My Distinctive Row");
    assert.equal(data.schedule[0].time, "7:15 PM");
  });

  test("timezone fallback uses event timezone when snapshot timezone is empty", () => {
    const data = assembleInvitationPageData(
      baseSnapshot({ timezone: "" }),
      baseEvent({ timezone: "Africa/Accra" })
    );
    assert.equal(data.timezone, "Africa/Accra");
  });

  test("defaults are empty: DetailsSection add handlers do not seed Grand Ballroom or Reception & Cocktails", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "app/dashboard/events/[id]/invitation-page/builder/sections/DetailsSection.tsx"),
      "utf8"
    );
    assert.equal(src.includes('"Grand Ballroom"'), false, "seeded Grand Ballroom must be removed");
    assert.equal(src.includes('"Reception & Cocktails"'), false, "seeded Reception & Cocktails must be removed");
    assert.equal(src.includes('time: ""'), true, "new schedule rows should start empty");
  });
});
