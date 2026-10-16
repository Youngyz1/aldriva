/**
 * lib/__tests__/data-consistency.test.cjs
 *
 * Behavior tests for the data-consistency milestone (no source-string checks):
 * - shared fundraiser stats: completed-only agreement, guest merge by email,
 *   anonymous separation, per-currency totals, cumulative zero-padded series,
 *   neutral week-change on empty windows, mock-client fetch + error path.
 * - formatMoney: XOF/XAF FCFA, USD, NGN, unknown codes, XOF+XAF separation.
 * - hours contract: normalizeHours <-> normalizeContent agreement,
 *   hoursBadgeState, Settings visibility predicate.
 * - time zone: country default, IANA validation, precedence.
 * - checklist links: hours -> settings#hours, offerings -> builder.
 */

"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
require.extensions[".ts"] = function compileTs(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const {
  COUNTED_DONATION_STATUSES,
  computeFundraiserDonationStats,
  getFundraiserDonationStats,
  computeWeekChange,
  donorGroupKey,
} = require("../fundraiser-dashboard.ts");
const {
  formatMoney,
  currencyLabel,
  isCfaCode,
} = require("../money.ts");
const {
  normalizeContent,
  normalizeHours,
  shouldShowOperationalSettings,
} = require("../website-content.ts");
const { hoursBadgeState } = require("../website-hours.ts");
const {
  DEFAULT_SITE_TIMEZONE,
  defaultTimezoneForCountry,
  isValidIanaTimezone,
  resolveSiteTimezone,
} = require("../date-timezone.ts");
const { resolveOverviewModules } = require("../overview-resolver.ts");

let _id = 0;
function gift(overrides = {}) {
  return {
    id: `g-${++_id}`,
    donor_name: "Awa Diallo",
    donor_email: "awa@example.com",
    user_id: null,
    amount: 25,
    currency: "XOF",
    status: "completed",
    created_at: "2026-09-18T10:00:00Z",
    fundraiser_id: "f1",
    ...overrides,
  };
}

// ── Shared stats ─────────────────────────────────────────────────────────────

describe("shared fundraiser stats (completed/succeeded only, everywhere)", () => {
  test("COUNTED statuses are exactly completed + succeeded", () => {
    assert.deepEqual([...COUNTED_DONATION_STATUSES].sort(), ["completed", "succeeded"]);
  });

  test("completed-only rows: overview/donations/donors computations agree (8 rows, 135 total, merged donors)", () => {
    const rows = [
      gift({ donor_name: "Awa Diallo", amount: 20 }),
      gift({ donor_name: "Awa Diallo", amount: 15 }),
      gift({ donor_name: "Kwame Mensah", donor_email: "kwame@example.com", amount: 30 }),
      gift({ donor_name: "Kwame Mensah", donor_email: "kwame@example.com", amount: 10 }),
      gift({ donor_name: "Anonymous", donor_email: null, amount: 25 }),
      gift({ donor_name: null, donor_email: null, amount: 15 }),
      gift({ donor_name: "Awa Diallo", amount: 10 }),
      gift({ donor_name: "Kwame Mensah", donor_email: "kwame@example.com", amount: 10 }),
      gift({ status: "pending", amount: 999 }),
      gift({ status: "failed", amount: 999 }),
      gift({ status: "refunded", amount: 999 }),
      gift({ status: null, amount: 999 }),
    ];
    const stats = computeFundraiserDonationStats(rows);
    assert.equal(stats.donationCount, 8);
    assert.equal(stats.totalsPerCurrency.length, 1);
    assert.equal(stats.totalsPerCurrency[0].currency, "XOF");
    assert.equal(stats.totalsPerCurrency[0].total, 135);
    // Awa + Kwame merge; the two identity-free gifts stay separate.
    assert.equal(stats.donorCount, 4);
    assert.equal(stats.averageDonation, Math.round(135 / 8));
  });

  test("null/pending/failed/refunded rows never count (no fallback to all rows)", () => {
    const stats = computeFundraiserDonationStats([
      gift({ status: "pending", amount: 100 }),
      gift({ status: "failed", amount: 100 }),
      gift({ status: null, amount: 100 }),
    ]);
    assert.equal(stats.donationCount, 0);
    assert.equal(stats.donorCount, 0);
    assert.deepEqual(stats.totalsPerCurrency, []);
    assert.deepEqual(stats.dailySeries, []);
  });

  test("succeeded rows count alongside completed", () => {
    const stats = computeFundraiserDonationStats([
      gift({ status: "completed", amount: 40 }),
      gift({ status: "succeeded", amount: 60 }),
    ]);
    assert.equal(stats.donationCount, 2);
    assert.equal(stats.totalsPerCurrency[0].total, 100);
  });

  test("guest gifts merge by normalized email", () => {
    const stats = computeFundraiserDonationStats([
      gift({ user_id: null, donor_name: "Awa D.", donor_email: "AWA@example.com", amount: 20 }),
      gift({ user_id: null, donor_name: "Awa Diallo", donor_email: "awa@example.com", amount: 30 }),
    ]);
    assert.equal(stats.donorCount, 1);
    assert.equal(stats.donorRecords[0].donationCount, 2);
    assert.equal(stats.donorRecords[0].totalGiven, 50);
  });

  test("user_id wins over email for grouping", () => {
    assert.equal(donorGroupKey(gift({ user_id: "u1", donor_email: "a@x.com" })), "user:u1");
    assert.equal(donorGroupKey(gift({ user_id: null, donor_email: "A@x.com" })), "email:a@x.com");
    assert.equal(donorGroupKey(gift({ user_id: null, donor_email: null, donor_name: "Awa" })), "named:awa");
  });

  test("anonymous gifts stay separate (one donor per row)", () => {
    const stats = computeFundraiserDonationStats([
      gift({ donor_name: "Anonymous", donor_email: null, user_id: null, amount: 25 }),
      gift({ donor_name: null, donor_email: null, user_id: null, amount: 30 }),
    ]);
    assert.equal(stats.donorCount, 2);
    assert.ok(stats.donorRecords.every((d) => d.isAnonymous));
  });

  test("mixed currencies list per-currency totals, never a combined sum", () => {
    const stats = computeFundraiserDonationStats([
      gift({ currency: "XOF", amount: 100000 }),
      gift({ currency: "USD", amount: 50 }),
    ]);
    assert.equal(stats.totalsPerCurrency.length, 2);
    const byCode = Object.fromEntries(stats.totalsPerCurrency.map((t) => [t.currency, t.total]));
    assert.equal(byCode.XOF, 100000);
    assert.equal(byCode.USD, 50);
    assert.ok(!("combinedTotal" in stats));
  });

  test("XOF + XAF gifts show two separate FCFA totals", () => {
    const stats = computeFundraiserDonationStats([
      gift({ currency: "XOF", amount: 5000 }),
      gift({ currency: "XAF", amount: 3000 }),
    ]);
    assert.equal(stats.totalsPerCurrency.length, 2);
    assert.deepEqual(
      stats.totalsPerCurrency.map((t) => t.currency).sort(),
      ["XAF", "XOF"]
    );
  });

  test("dailySeries is zero-padded and cumulative (never slopes down)", () => {
    const stats = computeFundraiserDonationStats([
      gift({ amount: 50, created_at: "2026-09-10T10:00:00Z" }),
      gift({ amount: 25, created_at: "2026-09-12T10:00:00Z" }),
    ], { now: new Date("2026-09-12T23:00:00Z") });
    assert.ok(stats.dailySeries.length >= 3);
    for (let i = 1; i < stats.dailySeries.length; i++) {
      assert.ok(stats.dailySeries[i].amount >= stats.dailySeries[i - 1].amount);
    }
    assert.equal(stats.dailySeries[stats.dailySeries.length - 1].amount, 75);
    const middle = stats.dailySeries.find((d) => d.count === 0);
    assert.ok(middle, "a gift-free day is padded with count 0");
  });

  test("computeWeekChange: empty prior window yields null (no red badge)", () => {
    assert.equal(computeWeekChange([]), null);
    assert.equal(computeWeekChange([{ date: "x", value: 5 }]), null);
    const fresh = Array.from({ length: 10 }, (_, i) => ({ date: `d${i}`, value: i < 7 ? 0 : 10 }));
    assert.equal(computeWeekChange(fresh), null);
    const growth = Array.from({ length: 14 }, (_, i) => ({ date: `d${i}`, value: i < 7 ? 10 : 20 }));
    assert.equal(computeWeekChange(growth), 100);
  });

  test("getFundraiserDonationStats works with a mock client and never throws", async () => {
    const rows = [gift({ amount: 40 }), gift({ status: "pending", amount: 999 })];
    const mock = {
      from: (table) => {
        assert.equal(table, "donations");
        return {
          select: () => ({
            eq: () => ({
              order: () => ({ limit: async () => ({ data: rows, error: null }) }),
            }),
          }),
        };
      },
    };
    const stats = await getFundraiserDonationStats(mock, "f1");
    assert.equal(stats.donationCount, 1);
    assert.equal(stats.totalsPerCurrency[0].total, 40);

    const failing = { from: () => { throw new Error("down"); } };
    const empty = await getFundraiserDonationStats(failing, "f1");
    assert.equal(empty.donationCount, 0);
    assert.equal(empty.donorCount, 0);
  });
});

// ── formatMoney ──────────────────────────────────────────────────────────────

describe("formatMoney (one helper, every surface)", () => {
  test("XOF renders FCFA with 0 decimals", () => {
    assert.equal(formatMoney(1200, "XOF"), "FCFA 1,200");
    assert.equal(formatMoney(1200.9, "XOF"), "FCFA 1,201");
  });

  test("XAF renders FCFA with 0 decimals", () => {
    assert.equal(formatMoney(3000, "XAF"), "FCFA 3,000");
  });

  test("XOF+XAF qualifier labels each line", () => {
    assert.equal(formatMoney(5000, "XOF", "en-US", { cfaQualifier: true }), "FCFA 5,000 (XOF)");
    assert.equal(formatMoney(3000, "XAF", "en-US", { cfaQualifier: true }), "FCFA 3,000 (XAF)");
    assert.equal(currencyLabel("XOF"), "FCFA");
    assert.equal(currencyLabel("XOF", { cfaQualifier: true }), "FCFA (XOF)");
    assert.equal(isCfaCode("XOF"), true);
    assert.equal(isCfaCode("USD"), false);
  });

  test("USD/NGN render via Intl", () => {
    assert.equal(formatMoney(1200, "USD"), "$1,200.00");
    assert.ok(formatMoney(5000, "NGN").includes("5,000.00"));
  });

  test("unknown codes degrade safely, never throw", () => {
    // Unknown-but-well-formed codes render with their code prefix (ICU may
    // accept them); the try/catch in formatMoney covers runtimes that throw.
    assert.ok(formatMoney(1234.5, "QXZ").startsWith("QXZ"));
    assert.equal(formatMoney(null, null), "$0.00");
    assert.equal(formatMoney(NaN, "USD"), "$0.00");
  });
});

// ── Hours contract ───────────────────────────────────────────────────────────

describe("opening-hours contract (builder <-> settings <-> dashboard)", () => {
  const builderValue = {
    mon: { open: "09:00", close: "18:00" },
    tue: { closed: true },
    today_tag: "Open late",
  };

  test("normalizeHours accepts the builder control shape", () => {
    const out = normalizeHours(builderValue);
    assert.deepEqual(out.mon, { open: "09:00", close: "18:00" });
    assert.deepEqual(out.tue, { closed: true });
    assert.equal(out.today_tag, "Open late");
  });

  test("settings value is visible to the website/dashboard reader path", () => {
    const viaReader = normalizeContent({ hours: builderValue }).hours;
    assert.deepEqual(viaReader, normalizeHours(builderValue));
  });

  test("invalid times are dropped, never stored", () => {
    const out = normalizeHours({ mon: { open: "25:99", close: "nope" }, tue: { closed: true } });
    assert.ok(!out.mon || (!out.mon.open && !out.mon.close));
    assert.deepEqual(out.tue, { closed: true });
  });

  test("hoursBadgeState: live wins, draft-only is saved-unpublished, neither is none", () => {
    assert.equal(hoursBadgeState({ mon: {} }, null), "live");
    assert.equal(hoursBadgeState({ mon: {} }, { tue: {} }), "live");
    assert.equal(hoursBadgeState(null, { mon: {} }), "saved-unpublished");
    assert.equal(hoursBadgeState(null, null), "none");
    assert.equal(hoursBadgeState(undefined, undefined), "none");
  });

  test("Settings operational section hides for orgs without business or website", () => {
    assert.equal(shouldShowOperationalSettings({ hasBusiness: false, hasWebsite: false }), false);
    assert.equal(shouldShowOperationalSettings({ hasBusiness: true, hasWebsite: false }), true);
    assert.equal(shouldShowOperationalSettings({ hasBusiness: false, hasWebsite: true }), true);
  });
});

// ── Time zone ────────────────────────────────────────────────────────────────

describe("site time zone (country default + owner override)", () => {
  test("defaults derive from the business country", () => {
    assert.equal(defaultTimezoneForCountry("Côte d'Ivoire"), "Africa/Abidjan");
    assert.equal(defaultTimezoneForCountry("CI"), "Africa/Abidjan");
    assert.equal(defaultTimezoneForCountry("Nigeria"), "Africa/Lagos");
    assert.equal(defaultTimezoneForCountry("Senegal"), "Africa/Dakar");
  });

  test("unknown/missing countries fall back to the platform default", () => {
    assert.equal(defaultTimezoneForCountry("Atlantis"), DEFAULT_SITE_TIMEZONE);
    assert.equal(defaultTimezoneForCountry(null), DEFAULT_SITE_TIMEZONE);
    assert.equal(defaultTimezoneForCountry(""), DEFAULT_SITE_TIMEZONE);
    assert.equal(DEFAULT_SITE_TIMEZONE, "Africa/Abidjan");
  });

  test("IANA validation accepts real zones and rejects junk", () => {
    assert.equal(isValidIanaTimezone("Africa/Abidjan"), true);
    assert.equal(isValidIanaTimezone("America/New_York"), true);
    assert.equal(isValidIanaTimezone("Mars/Olympus"), false);
    assert.equal(isValidIanaTimezone(""), false);
    assert.equal(isValidIanaTimezone(null), false);
  });

  test("precedence: explicit choice > country default > platform default", () => {
    assert.equal(resolveSiteTimezone("Europe/Paris", "Africa/Lagos"), "Europe/Paris");
    assert.equal(resolveSiteTimezone("  ", "Africa/Lagos"), "Africa/Lagos");
    assert.equal(resolveSiteTimezone(null, "Africa/Lagos"), "Africa/Lagos");
    assert.equal(resolveSiteTimezone(null, ""), DEFAULT_SITE_TIMEZONE);
  });
});

// ── Checklist links ──────────────────────────────────────────────────────────

describe("setup checklist links (hours -> settings, offerings -> builder)", () => {
  function checklistFor() {
    const widgets = resolveOverviewModules({
      context: "organizer",
      organizerTypes: { hasEvents: false, hasFundraisers: false, hasBusiness: true, isNone: false },
      capabilities: ["MENU"],
      counts: {
        menuItemCount: 0,
        serviceCount: 0,
        hasLogo: true,
        hasHours: false,
        hasOfferings: false,
        isSitePublished: false,
        isOrderingReady: false,
      },
      role: "owner",
    });
    const items = widgets.find((w) => w.id === "setup_checklist").data.items;
    return Object.fromEntries(items.map((i) => [i.id, i.href]));
  }

  test("hours links to settings hours section, offerings to the builder", () => {
    const hrefs = checklistFor();
    assert.ok(hrefs.hours.includes("SETTINGS_PATH#hours"), hrefs.hours);
    assert.ok(hrefs.offerings.includes("BUILDER_PATH"), hrefs.offerings);
    assert.ok(hrefs.logo.includes("SETTINGS_PATH"), hrefs.logo);
  });
});
