const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const ts = require("typescript");

if (!require.extensions[".ts"]) {
  require.extensions[".ts"] = function compileTs(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
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
}

const {
  parseEventDateParts,
  wallClockToUtc,
  toWallClockInTimezone,
  formatWallClockDisplay,
  formatUtcToIcsString,
  generateIcsContent,
  generateGoogleCalendarUrl,
} = require("../event-time.ts");

describe("lib/event-time - Explicit Date Parsing & Display", () => {
  test("parseEventDateParts correctly extracts numerical components without Date() offset shifts", () => {
    const p1 = parseEventDateParts("2026-11-14 19:30:45");
    assert.deepEqual(p1, {
      year: 2026,
      month: 11,
      day: 14,
      hour: 19,
      minute: 30,
      second: 45,
      isUtc: false,
      rawString: "2026-11-14 19:30:45",
    });

    const p2 = parseEventDateParts("2026-07-04T10:00");
    assert.equal(p2.year, 2026);
    assert.equal(p2.month, 7);
    assert.equal(p2.day, 4);
    assert.equal(p2.hour, 10);
    assert.equal(p2.minute, 0);
    assert.equal(p2.second, 0);
    assert.equal(p2.isUtc, false);

    const p3 = parseEventDateParts("2026-12-31T23:59:59Z");
    assert.equal(p3.isUtc, true);

    assert.equal(parseEventDateParts(""), null);
    assert.equal(parseEventDateParts(null), null);
    assert.equal(parseEventDateParts("invalid-date-string"), null);
  });

  test("formatWallClockDisplay formats date and time numbers faithfully in EN and FR", () => {
    const en = formatWallClockDisplay("2026-11-14 19:00:00", "en", "Europe/London");
    assert.ok(en.dateDisplay.includes("Saturday, November 14, 2026"));
    assert.ok(en.timeDisplay.includes("7:00 PM"));

    const fr = formatWallClockDisplay("2026-11-14 19:00:00", "fr", "Europe/Paris");
    assert.ok(fr.dateDisplay.toLowerCase().includes("samedi 14 novembre 2026"));
    assert.ok(fr.timeDisplay.includes("19h00"));

    const fallback = formatWallClockDisplay(null, "en");
    assert.equal(fallback.dateDisplay, "Date TBA");
    assert.equal(fallback.timeDisplay, "Time TBA");
  });
});

describe("lib/event-time - DST & Timezone Conversion via date-fns-tz", () => {
  test("Europe/London DST: summer (BST: UTC+1) and winter (GMT: UTC+0)", () => {
    // Summer: July 15, 2026 at 19:00 BST -> 18:00 UTC
    const summerUtc = wallClockToUtc("2026-07-15 19:00:00", "Europe/London");
    assert.ok(summerUtc);
    assert.equal(summerUtc.toISOString(), "2026-07-15T18:00:00.000Z");

    // Winter: November 15, 2026 at 19:00 GMT -> 19:00 UTC
    const winterUtc = wallClockToUtc("2026-11-15 19:00:00", "Europe/London");
    assert.ok(winterUtc);
    assert.equal(winterUtc.toISOString(), "2026-11-15T19:00:00.000Z");
  });

  test("America/Los_Angeles across Spring-Forward DST (PST UTC-8 -> PDT UTC-7 in March 2026)", () => {
    // Before spring change: March 7, 2026 at 19:00 PST -> March 8 at 03:00 UTC (offset -8)
    const beforeSpring = wallClockToUtc("2026-03-07 19:00:00", "America/Los_Angeles");
    assert.ok(beforeSpring);
    assert.equal(beforeSpring.toISOString(), "2026-03-08T03:00:00.000Z");

    // After spring change: March 9, 2026 at 19:00 PDT -> March 10 at 02:00 UTC (offset -7)
    const afterSpring = wallClockToUtc("2026-03-09 19:00:00", "America/Los_Angeles");
    assert.ok(afterSpring);
    assert.equal(afterSpring.toISOString(), "2026-03-10T02:00:00.000Z");
  });

  test("America/Los_Angeles across Fall-Back DST (PDT UTC-7 -> PST UTC-8 in Nov 2026)", () => {
    // Before fall change: Oct 31, 2026 at 19:00 PDT -> Nov 1 at 02:00 UTC (offset -7)
    const beforeFall = wallClockToUtc("2026-10-31 19:00:00", "America/Los_Angeles");
    assert.ok(beforeFall);
    assert.equal(beforeFall.toISOString(), "2026-11-01T02:00:00.000Z");

    // After fall change: Nov 2, 2026 at 19:00 PST -> Nov 3 at 03:00 UTC (offset -8)
    const afterFall = wallClockToUtc("2026-11-02 19:00:00", "America/Los_Angeles");
    assert.ok(afterFall);
    assert.equal(afterFall.toISOString(), "2026-11-03T03:00:00.000Z");
  });

  test("toWallClockInTimezone converts UTC Z-suffix strings (Eventbrite) to local wall-clock", () => {
    // "2026-11-14T19:00:00Z" in Europe/London (winter = GMT = UTC+0): stays 19:00
    const londonWinter = toWallClockInTimezone("2026-11-14T19:00:00Z", "Europe/London");
    assert.equal(londonWinter, "2026-11-14T19:00:00", "UTC Z in London winter should equal wall-clock 19:00");

    // "2026-07-14T18:00:00Z" in Europe/London (summer = BST = UTC+1): becomes 19:00
    const londonSummer = toWallClockInTimezone("2026-07-14T18:00:00Z", "Europe/London");
    assert.equal(londonSummer, "2026-07-14T19:00:00", "UTC Z in London summer (BST +1) should be 19:00 wall-clock");

    // "2026-11-14T19:00:00Z" in America/New_York (winter = EST = UTC-5): becomes 14:00
    const nyWinter = toWallClockInTimezone("2026-11-14T19:00:00Z", "America/New_York");
    assert.equal(nyWinter, "2026-11-14T14:00:00", "UTC Z in NY winter (EST -5) should be 14:00 wall-clock");

    // Naive wall-clock (no Z) returned unchanged
    const naive = toWallClockInTimezone("2026-11-14 19:00:00", "America/New_York");
    assert.equal(naive, "2026-11-14 19:00:00", "Naive wall-clock string should be returned unchanged");

    // Invalid input returns null
    assert.equal(toWallClockInTimezone(null, "UTC"), null);
    assert.equal(toWallClockInTimezone("", "UTC"), null);
  });
});

describe("lib/event-time - Shared Calendar Utilities (.ics & Google Calendar)", () => {
  test("formatUtcToIcsString formats Date as compact UTC Z string", () => {
    const d = new Date("2026-11-14T19:00:00.000Z");
    assert.equal(formatUtcToIcsString(d), "20261114T190000Z");
  });

  test("generateIcsContent produces RFC 5545 calendar text with UTC DTSTART/DTEND when end date provided", () => {
    const ics = generateIcsContent({
      title: "Elena & David's Gala",
      description: "Honored Guest Pass for Jane Doe",
      venue: "Grand Ballroom",
      address: "100 Westminster Bridge Rd",
      startDate: "2026-07-15 19:00:00", // BST (UTC+1) -> 18:00:00Z
      endDate: "2026-07-15 23:00:00",   // BST (UTC+1) -> 22:00:00Z
      timezone: "Europe/London",
      url: "https://aldriva.com/invitation/abc123",
    });

    assert.ok(ics.includes("BEGIN:VCALENDAR"));
    assert.ok(ics.includes("VERSION:2.0"));
    assert.ok(ics.includes("SUMMARY:Elena & David's Gala"));
    assert.ok(ics.includes("DTSTART:20260715T180000Z"), "DTSTART must be formatted in UTC Z");
    assert.ok(ics.includes("DTEND:20260715T220000Z"), "DTEND must be present when end date supplied");
    assert.ok(ics.includes("LOCATION:Grand Ballroom\\, 100 Westminster Bridge Rd"));
    assert.ok(ics.includes("END:VCALENDAR"));
  });

  test("generateIcsContent omits DTEND when no end date is provided", () => {
    const ics = generateIcsContent({
      title: "Birthday Bash",
      startDate: "2026-08-20 18:00:00",
      timezone: "America/New_York",
    });

    assert.ok(ics.includes("DTSTART:"), "DTSTART must always be present");
    assert.ok(!ics.includes("DTEND:"), "DTEND must be absent when no end date supplied");
    assert.ok(ics.includes("SUMMARY:Birthday Bash"));
  });

  test("generateGoogleCalendarUrl produces URL with UTC dates", () => {
    const url = generateGoogleCalendarUrl({
      title: "Elena & David's Gala",
      description: "VIP Pass",
      venue: "Grand Ballroom",
      startDate: "2026-07-15 19:00:00",
      endDate: "2026-07-15 23:00:00",
      timezone: "Europe/London",
    });

    assert.ok(url.startsWith("https://calendar.google.com/calendar/render?"));
    assert.ok(url.includes("dates=20260715T180000Z%2F20260715T220000Z"), "Google calendar dates must be UTC");
    assert.ok(url.includes("text=Elena+%26+David%27s+Gala"));
  });
});


describe("lib/event-time - Explicit Date Parsing & Display", () => {
  test("parseEventDateParts correctly extracts numerical components without Date() offset shifts", () => {
    const p1 = parseEventDateParts("2026-11-14 19:30:45");
    assert.deepEqual(p1, {
      year: 2026,
      month: 11,
      day: 14,
      hour: 19,
      minute: 30,
      second: 45,
      isUtc: false,
      rawString: "2026-11-14 19:30:45",
    });

    const p2 = parseEventDateParts("2026-07-04T10:00");
    assert.equal(p2.year, 2026);
    assert.equal(p2.month, 7);
    assert.equal(p2.day, 4);
    assert.equal(p2.hour, 10);
    assert.equal(p2.minute, 0);
    assert.equal(p2.second, 0);
    assert.equal(p2.isUtc, false);

    const p3 = parseEventDateParts("2026-12-31T23:59:59Z");
    assert.equal(p3.isUtc, true);

    assert.equal(parseEventDateParts(""), null);
    assert.equal(parseEventDateParts(null), null);
    assert.equal(parseEventDateParts("invalid-date-string"), null);
  });

  test("formatWallClockDisplay formats date and time numbers faithfully in EN and FR", () => {
    const en = formatWallClockDisplay("2026-11-14 19:00:00", "en", "Europe/London");
    assert.ok(en.dateDisplay.includes("Saturday, November 14, 2026"));
    assert.ok(en.timeDisplay.includes("7:00 PM"));

    const fr = formatWallClockDisplay("2026-11-14 19:00:00", "fr", "Europe/Paris");
    assert.ok(fr.dateDisplay.toLowerCase().includes("samedi 14 novembre 2026"));
    assert.ok(fr.timeDisplay.includes("19h00"));

    const fallback = formatWallClockDisplay(null, "en");
    assert.equal(fallback.dateDisplay, "Date TBA");
    assert.equal(fallback.timeDisplay, "Time TBA");
  });
});

describe("lib/event-time - DST & Timezone Conversion via date-fns-tz", () => {
  test("Europe/London DST: summer (BST: UTC+1) and winter (GMT: UTC+0)", () => {
    // Summer: July 15, 2026 at 19:00 BST -> 18:00 UTC
    const summerUtc = wallClockToUtc("2026-07-15 19:00:00", "Europe/London");
    assert.ok(summerUtc);
    assert.equal(summerUtc.toISOString(), "2026-07-15T18:00:00.000Z");

    // Winter: November 15, 2026 at 19:00 GMT -> 19:00 UTC
    const winterUtc = wallClockToUtc("2026-11-15 19:00:00", "Europe/London");
    assert.ok(winterUtc);
    assert.equal(winterUtc.toISOString(), "2026-11-15T19:00:00.000Z");
  });

  test("America/Los_Angeles across Spring-Forward DST (PST UTC-8 -> PDT UTC-7 in March 2026)", () => {
    // Before spring change: March 7, 2026 at 19:00 PST -> March 8 at 03:00 UTC (offset -8)
    const beforeSpring = wallClockToUtc("2026-03-07 19:00:00", "America/Los_Angeles");
    assert.ok(beforeSpring);
    assert.equal(beforeSpring.toISOString(), "2026-03-08T03:00:00.000Z");

    // After spring change: March 9, 2026 at 19:00 PDT -> March 10 at 02:00 UTC (offset -7)
    const afterSpring = wallClockToUtc("2026-03-09 19:00:00", "America/Los_Angeles");
    assert.ok(afterSpring);
    assert.equal(afterSpring.toISOString(), "2026-03-10T02:00:00.000Z");
  });

  test("America/Los_Angeles across Fall-Back DST (PDT UTC-7 -> PST UTC-8 in Nov 2026)", () => {
    // Before fall change: Oct 31, 2026 at 19:00 PDT -> Nov 1 at 02:00 UTC (offset -7)
    const beforeFall = wallClockToUtc("2026-10-31 19:00:00", "America/Los_Angeles");
    assert.ok(beforeFall);
    assert.equal(beforeFall.toISOString(), "2026-11-01T02:00:00.000Z");

    // After fall change: Nov 2, 2026 at 19:00 PST -> Nov 3 at 03:00 UTC (offset -8)
    const afterFall = wallClockToUtc("2026-11-02 19:00:00", "America/Los_Angeles");
    assert.ok(afterFall);
    assert.equal(afterFall.toISOString(), "2026-11-03T03:00:00.000Z");
  });
});

describe("lib/event-time - Shared Calendar Utilities (.ics & Google Calendar)", () => {
  test("formatUtcToIcsString formats Date as compact UTC Z string", () => {
    const d = new Date("2026-11-14T19:00:00.000Z");
    assert.equal(formatUtcToIcsString(d), "20261114T190000Z");
  });

  test("generateIcsContent produces RFC 5545 calendar text with UTC DTSTART/DTEND", () => {
    const ics = generateIcsContent({
      title: "Elena & David's Gala",
      description: "Honored Guest Pass for Jane Doe",
      venue: "Grand Ballroom",
      address: "100 Westminster Bridge Rd",
      startDate: "2026-07-15 19:00:00", // BST (UTC+1) -> 18:00:00Z
      endDate: "2026-07-15 23:00:00", // BST (UTC+1) -> 22:00:00Z
      timezone: "Europe/London",
      url: "https://aldriva.com/invitation/abc123",
    });

    assert.ok(ics.includes("BEGIN:VCALENDAR"));
    assert.ok(ics.includes("VERSION:2.0"));
    assert.ok(ics.includes("SUMMARY:Elena & David's Gala"));
    assert.ok(ics.includes("DTSTART:20260715T180000Z"), "DTSTART must be formatted in UTC Z");
    assert.ok(ics.includes("DTEND:20260715T220000Z"), "DTEND must be formatted in UTC Z");
    assert.ok(ics.includes("LOCATION:Grand Ballroom\\, 100 Westminster Bridge Rd"));
    assert.ok(ics.includes("END:VCALENDAR"));
  });

  test("generateGoogleCalendarUrl produces URL with UTC dates", () => {
    const url = generateGoogleCalendarUrl({
      title: "Elena & David's Gala",
      description: "VIP Pass",
      venue: "Grand Ballroom",
      startDate: "2026-07-15 19:00:00",
      endDate: "2026-07-15 23:00:00",
      timezone: "Europe/London",
    });

    assert.ok(url.startsWith("https://calendar.google.com/calendar/render?"));
    assert.ok(url.includes("dates=20260715T180000Z%2F20260715T220000Z"), "Google calendar dates must be UTC");
    assert.ok(url.includes("text=Elena+%26+David%27s+Gala"));
  });
});
