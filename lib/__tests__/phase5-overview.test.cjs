/**
 * lib/__tests__/phase5-overview.test.cjs
 *
 * Tests for Overview v2 system:
 *   - resolveOverviewModules: organizer context matrix
 *   - resolveOverviewModules: personal context
 *   - canUserManage role gate
 *   - getStartOfTodayInTimezone / isTodayInTimezone (Africa/Abidjan and America/New_York)
 *   - Legacy/stub redirect pages (file existence check)
 *   - i18n parity: no new keys added (hardcoded strings; documented in test)
 *
 * Run with: node --test lib/__tests__/phase5-overview.test.cjs
 */

"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

// ─── Helper: resolve from repo root ─────────────────────────────────────────
const ROOT = path.resolve(__dirname, "../..");

function resolveModule(relPath) {
  return path.join(ROOT, relPath);
}

// ─── Import pure functions ────────────────────────────────────────────────────

// canUserManage and resolveOverviewModules
const { canUserManage, resolveOverviewModules } = require("../../lib/overview-resolver.ts");
const { getStartOfTodayInTimezone, isTodayInTimezone, DEFAULT_SITE_TIMEZONE } = require("../../lib/date-timezone.ts");

// ─── canUserManage ───────────────────────────────────────────────────────────
describe("canUserManage", () => {
  test("owner is a manager role", () => {
    assert.equal(canUserManage("owner"), true);
  });
  test("admin is a manager role", () => {
    assert.equal(canUserManage("admin"), true);
  });
  test("manager is a manager role", () => {
    assert.equal(canUserManage("manager"), true);
  });
  test("editor is not a manager role", () => {
    assert.equal(canUserManage("editor"), false);
  });
  test("finance is not a manager role", () => {
    assert.equal(canUserManage("finance"), false);
  });
  test("viewer is not a manager role", () => {
    assert.equal(canUserManage("viewer"), false);
  });
  test("null role returns false", () => {
    assert.equal(canUserManage(null), false);
  });
  test("undefined role returns false", () => {
    assert.equal(canUserManage(undefined), false);
  });
});

// ─── date-timezone helpers ───────────────────────────────────────────────────
describe("DEFAULT_SITE_TIMEZONE", () => {
  test("is Africa/Abidjan", () => {
    assert.equal(DEFAULT_SITE_TIMEZONE, "Africa/Abidjan");
  });
});

describe("getStartOfTodayInTimezone", () => {
  // Africa/Abidjan is UTC+0 (same as UTC, no DST)
  test("Africa/Abidjan midnight == UTC midnight", () => {
    const ref = new Date("2024-06-15T10:30:00.000Z");
    const result = getStartOfTodayInTimezone("Africa/Abidjan", ref);
    // Start of day for June 15 in UTC+0 is 2024-06-15T00:00:00.000Z
    assert.equal(result.toISOString(), "2024-06-15T00:00:00.000Z");
  });

  test("America/New_York midnight (UTC-4 in summer, EDT)", () => {
    const ref = new Date("2024-06-15T10:30:00.000Z"); // 06:30 local time in EDT (UTC-4)
    const result = getStartOfTodayInTimezone("America/New_York", ref);
    // June 15 midnight in EDT = 2024-06-15T04:00:00.000Z
    assert.equal(result.toISOString(), "2024-06-15T04:00:00.000Z");
  });

  test("America/New_York midnight (UTC-5 in winter, EST)", () => {
    const ref = new Date("2024-01-15T10:30:00.000Z"); // 05:30 local time in EST (UTC-5)
    const result = getStartOfTodayInTimezone("America/New_York", ref);
    // Jan 15 midnight in EST = 2024-01-15T05:00:00.000Z
    assert.equal(result.toISOString(), "2024-01-15T05:00:00.000Z");
  });

  test("returns Date with .getTime() as integer", () => {
    const ref = new Date("2024-06-15T10:30:00.000Z");
    const result = getStartOfTodayInTimezone("Africa/Abidjan", ref);
    assert.ok(Number.isFinite(result.getTime()));
  });
});

describe("isTodayInTimezone", () => {
  test("timestamp in the same day returns true (Africa/Abidjan)", () => {
    const ref = new Date("2024-06-15T10:30:00.000Z");
    // 09:00 on same date
    const ts = "2024-06-15T09:00:00.000Z";
    assert.equal(isTodayInTimezone(ts, "Africa/Abidjan", ref), true);
  });

  test("timestamp from yesterday returns false (Africa/Abidjan)", () => {
    const ref = new Date("2024-06-15T10:30:00.000Z");
    const ts = "2024-06-14T23:59:59.000Z";
    assert.equal(isTodayInTimezone(ts, "Africa/Abidjan", ref), false);
  });

  test("timestamp tomorrow returns false (Africa/Abidjan)", () => {
    const ref = new Date("2024-06-15T10:30:00.000Z");
    const ts = "2024-06-16T01:00:00.000Z";
    assert.equal(isTodayInTimezone(ts, "Africa/Abidjan", ref), false);
  });

  test("timezone boundary: 23:59 UTC-4 is same local day (America/New_York)", () => {
    // ref: June 15 23:30 UTC = June 15 19:30 EDT
    const ref = new Date("2024-06-15T23:30:00.000Z");
    // ts: June 15 23:00 UTC = June 15 19:00 EDT — same local day
    const ts = "2024-06-15T23:00:00.000Z";
    assert.equal(isTodayInTimezone(ts, "America/New_York", ref), true);
  });

  test("timezone boundary: next UTC day but same local day (America/New_York)", () => {
    // ref: June 16 02:00 UTC = June 15 22:00 EDT (still June 15 local)
    const ref = new Date("2024-06-16T02:00:00.000Z");
    // ts: June 16 01:00 UTC = June 15 21:00 EDT — same local day
    const ts = "2024-06-16T01:00:00.000Z";
    assert.equal(isTodayInTimezone(ts, "America/New_York", ref), true);
  });

  test("invalid timestamp returns false", () => {
    const ref = new Date("2024-06-15T10:30:00.000Z");
    assert.equal(isTodayInTimezone("not-a-date", "Africa/Abidjan", ref), false);
  });
});

// ─── resolveOverviewModules: organizer context ────────────────────────────────
describe("resolveOverviewModules organizer context", () => {
  const BASE_COMMERCE_INPUT = {
    context: "organizer",
    capabilities: ["can_have_menu"],
    offerings: ["online_ordering", "pickup"],
    features: { ordering: true, delivery: false, pickup: true, reservations: false, onlinePayment: false },
    approvalState: "active",
    counts: {
      pendingOrders: 0,
      overdueOrders: 0,
      ordersToday: 5,
      salesToday: 12000,
      paidToday: 10000,
      toCollectToday: 2000,
      currency: "XOF",
      siteTimezone: "Africa/Abidjan",
      isOpen: true,
      hoursBadgeText: "Open · Closes at 22:00",
      hasUnpublishedChanges: false,
      isSitePublished: true,
      websiteSlug: "my-restaurant",
      websiteId: "ws-1",
      businessId: "biz-1",
      menuItemCount: 10,
      serviceCount: 0,
      hasLogo: true,
      hasHours: true,
      hasOfferings: true,
      isOrderingReady: true,
      eventCount: 0,
      fundraiserCount: 0,
      followerCount: 0,
      ticketCount: 0,
      totalRaised: 0,
      averageRating: null,
      reviewCount: 0,
      recentOrders: [
        { id: "o1", orderNumber: "001", customerName: "Alice", totalAmount: 2500, currency: "XOF", status: "pending", createdAt: "2024-06-15T10:00:00Z", fulfilmentType: "pickup" },
      ],
      recentEvents: [],
    },
    role: "owner",
  };

  test("restaurant with active orders: has today_strip widget", () => {
    const widgets = resolveOverviewModules(BASE_COMMERCE_INPUT);
    const ids = widgets.map((w) => w.id);
    assert.ok(ids.includes("today_strip"), "Missing today_strip");
  });

  test("restaurant with pending orders: has attention_strip widget", () => {
    const input = { ...BASE_COMMERCE_INPUT, counts: { ...BASE_COMMERCE_INPUT.counts, pendingOrders: 3 } };
    const widgets = resolveOverviewModules(input);
    const strip = widgets.find((w) => w.id === "attention_strip");
    assert.ok(strip, "Missing attention_strip");
    const items = strip.data;
    assert.ok(Array.isArray(items), "attention_strip.data is not array");
    const hasPending = items.some((i) => i.id === "pending_orders");
    assert.ok(hasPending, "Missing pending_orders attention item");
  });

  test("restaurant with overdue orders: attention_strip has overdue item", () => {
    const input = { ...BASE_COMMERCE_INPUT, counts: { ...BASE_COMMERCE_INPUT.counts, overdueOrders: 2 } };
    const widgets = resolveOverviewModules(input);
    const strip = widgets.find((w) => w.id === "attention_strip");
    assert.ok(strip, "Missing attention_strip");
    const hasOverdue = strip.data.some((i) => i.id === "overdue_orders");
    assert.ok(hasOverdue, "Missing overdue_orders attention item");
  });

  test("approval pending: attention_strip includes approval_pending", () => {
    const input = { ...BASE_COMMERCE_INPUT, approvalState: "pending" };
    const widgets = resolveOverviewModules(input);
    const strip = widgets.find((w) => w.id === "attention_strip");
    assert.ok(strip, "Missing attention_strip");
    const hasPendingApproval = strip.data.some((i) => i.id === "approval_pending");
    assert.ok(hasPendingApproval, "Missing approval_pending attention item");
  });

  test("approval rejected: attention_strip includes approval_rejected", () => {
    const input = { ...BASE_COMMERCE_INPUT, approvalState: "rejected" };
    const widgets = resolveOverviewModules(input);
    const strip = widgets.find((w) => w.id === "attention_strip");
    assert.ok(strip, "Missing attention_strip");
    assert.ok(strip.data.some((i) => i.id === "approval_rejected"), "Missing approval_rejected");
  });

  test("brand-new business with no orders: has setup_checklist; today_strip shown with zeros for commerce", () => {
    const input = {
      ...BASE_COMMERCE_INPUT,
      counts: {
        ...BASE_COMMERCE_INPUT.counts,
        ordersToday: 0,
        salesToday: 0,
        paidToday: 0,
        toCollectToday: 0,
        recentOrders: [],
        eventCount: 0,
        fundraiserCount: 0,
        ticketCount: 0,
        totalRaised: 0,
        isSitePublished: false,
        isOrderingReady: false,
        hasLogo: false,
        hasHours: false,
        hasOfferings: false,
        menuItemCount: 0,
      },
    };
    const widgets = resolveOverviewModules(input);
    const ids = widgets.map((w) => w.id);
    // Commerce org always gets setup_checklist
    assert.ok(ids.includes("setup_checklist"), "Missing setup_checklist");
    // Commerce org always gets today_strip (even with all zeros) — suppresses empty_state
    assert.ok(ids.includes("today_strip"), "Missing today_strip for commerce org");
    // empty_state is suppressed because today_strip is present
    assert.ok(!ids.includes("empty_state"), "empty_state should not appear alongside today_strip");
  });

  test("brand-new NON-COMMERCE org (events-only, zero data): has empty_state", () => {
    const input = {
      context: "organizer",
      capabilities: [],
      offerings: [],
      features: { ordering: false, delivery: false, pickup: false, reservations: false, onlinePayment: false },
      approvalState: "active",
      counts: {
        ordersToday: 0,
        recentOrders: [],
        pendingOrders: 0,
        overdueOrders: 0,
        eventCount: 0,
        fundraiserCount: 0,
        ticketCount: 0,
        totalRaised: 0,
        isSitePublished: false,
        isOrderingReady: false,
        hasLogo: false,
        hasHours: false,
        hasOfferings: false,
        menuItemCount: 0,
        serviceCount: 0,
      },
      role: "owner",
    };
    const widgets = resolveOverviewModules(input);
    const ids = widgets.map((w) => w.id);
    assert.ok(ids.includes("setup_checklist"), "Missing setup_checklist for brand-new org");
    assert.ok(ids.includes("empty_state"), "Missing empty_state for brand-new non-commerce org");
  });

  test("events-only org (no commerce cap): no today_strip", () => {
    const input = {
      context: "organizer",
      capabilities: ["can_have_events"],
      offerings: [],
      features: { ordering: false, delivery: false, pickup: false, reservations: false, onlinePayment: false },
      approvalState: "active",
      counts: {
        ...BASE_COMMERCE_INPUT.counts,
        ordersToday: 0,
        recentOrders: [],
        pendingOrders: 0,
        overdueOrders: 0,
        eventCount: 5,
        fundraiserCount: 2,
        ticketCount: 100,
        totalRaised: 50000,
      },
      role: "owner",
    };
    const widgets = resolveOverviewModules(input);
    const ids = widgets.map((w) => w.id);
    assert.ok(!ids.includes("today_strip"), "today_strip should not appear for events-only org");
    assert.ok(ids.includes("events_metrics"), "Missing events_metrics for events-only org");
  });

  test("restaurant with events: both today_strip and events_metrics appear", () => {
    const input = {
      ...BASE_COMMERCE_INPUT,
      counts: { ...BASE_COMMERCE_INPUT.counts, eventCount: 3, totalRaised: 0, fundraiserCount: 0, ticketCount: 50 },
    };
    const widgets = resolveOverviewModules(input);
    const ids = widgets.map((w) => w.id);
    assert.ok(ids.includes("today_strip"), "Missing today_strip");
    assert.ok(ids.includes("events_metrics"), "Missing events_metrics");
  });

  test("recent_orders widget appears when recentOrders populated", () => {
    const widgets = resolveOverviewModules(BASE_COMMERCE_INPUT);
    const ids = widgets.map((w) => w.id);
    assert.ok(ids.includes("recent_orders"), "Missing recent_orders");
  });

  test("quick_actions appears for all org types", () => {
    const widgets = resolveOverviewModules(BASE_COMMERCE_INPUT);
    const ids = widgets.map((w) => w.id);
    assert.ok(ids.includes("quick_actions"), "Missing quick_actions");
  });

  test("viewer role: quick_actions still present (view links)", () => {
    const input = { ...BASE_COMMERCE_INPUT, role: "viewer" };
    const widgets = resolveOverviewModules(input);
    const ids = widgets.map((w) => w.id);
    assert.ok(ids.includes("quick_actions"), "quick_actions should still be present for viewer");
  });

  test("rental org (can_have_vehicles): no add_dish quick action", () => {
    const input = {
      context: "organizer",
      capabilities: ["can_have_vehicles"],
      offerings: [],
      features: { ordering: false, delivery: false, pickup: false, reservations: false, onlinePayment: false },
      approvalState: "active",
      counts: { ...BASE_COMMERCE_INPUT.counts, menuItemCount: 0, ordersToday: 0, recentOrders: [] },
      role: "owner",
    };
    const widgets = resolveOverviewModules(input);
    const qa = widgets.find((w) => w.id === "quick_actions");
    assert.ok(qa, "Missing quick_actions for rental");
    const actionIds = qa.data.map((a) => a.id);
    assert.ok(!actionIds.includes("add_dish"), "add_dish should not appear for rental");
  });

  test("salon/service (can_have_services): add_service quick action for owner", () => {
    const input = {
      context: "organizer",
      capabilities: ["can_have_services"],
      offerings: [],
      features: { ordering: false, delivery: false, pickup: false, reservations: false, onlinePayment: false },
      approvalState: "active",
      counts: { ...BASE_COMMERCE_INPUT.counts, menuItemCount: 0, serviceCount: 5, ordersToday: 0, recentOrders: [] },
      role: "owner",
    };
    const widgets = resolveOverviewModules(input);
    const qa = widgets.find((w) => w.id === "quick_actions");
    assert.ok(qa, "Missing quick_actions for salon");
    const actionIds = qa.data.map((a) => a.id);
    assert.ok(actionIds.includes("add_service"), "Missing add_service for salon/owner");
  });

  test("unpublished changes: attention_strip item when site already published", () => {
    const input = {
      ...BASE_COMMERCE_INPUT,
      counts: {
        ...BASE_COMMERCE_INPUT.counts,
        hasUnpublishedChanges: true,
        isSitePublished: true,
      },
    };
    const widgets = resolveOverviewModules(input);
    const strip = widgets.find((w) => w.id === "attention_strip");
    assert.ok(strip, "Missing attention_strip");
    assert.ok(strip.data.some((i) => i.id === "unpublished_changes"), "Missing unpublished_changes item");
  });

  test("unpublished changes: NOT shown when site is not published yet", () => {
    const input = {
      ...BASE_COMMERCE_INPUT,
      counts: {
        ...BASE_COMMERCE_INPUT.counts,
        hasUnpublishedChanges: true,
        isSitePublished: false,
        pendingOrders: 0,
        overdueOrders: 0,
      },
      approvalState: "active",
    };
    const widgets = resolveOverviewModules(input);
    const strip = widgets.find((w) => w.id === "attention_strip");
    // No attention item for unpublished changes when site not yet published
    if (strip) {
      assert.ok(!strip.data.some((i) => i.id === "unpublished_changes"), "unpublished_changes should not appear when site not yet published");
    }
    // If no strip at all, that's also fine
  });

  test("setup_checklist completedCount = 0 when brand new business", () => {
    const input = {
      ...BASE_COMMERCE_INPUT,
      counts: {
        ...BASE_COMMERCE_INPUT.counts,
        hasLogo: false,
        hasHours: false,
        hasOfferings: false,
        isSitePublished: false,
        isOrderingReady: false,
        menuItemCount: 0,
        serviceCount: 0,
      },
    };
    const widgets = resolveOverviewModules(input);
    const checklist = widgets.find((w) => w.id === "setup_checklist");
    assert.ok(checklist, "Missing setup_checklist");
    assert.equal(checklist.data.completedCount, 0);
    assert.ok(checklist.data.totalCount > 0);
  });

  test("setup_checklist completedCount = totalCount when everything set up", () => {
    const widgets = resolveOverviewModules(BASE_COMMERCE_INPUT);
    const checklist = widgets.find((w) => w.id === "setup_checklist");
    assert.ok(checklist, "Missing setup_checklist");
    assert.equal(checklist.data.completedCount, checklist.data.totalCount);
    assert.equal(checklist.data.isComplete, true);
  });
});

// ─── resolveOverviewModules: personal context ────────────────────────────────
describe("resolveOverviewModules personal context", () => {
  test("empty personal context: returns empty_state widget", () => {
    const widgets = resolveOverviewModules({
      context: "personal",
      capabilities: [],
      counts: {},
    });
    const ids = widgets.map((w) => w.id);
    assert.ok(ids.includes("empty_state"), "Missing empty_state for new user");
  });

  test("personal with managed organizers: returns personal_organizers widget", () => {
    const widgets = resolveOverviewModules({
      context: "personal",
      capabilities: [],
      counts: {
        managedOrganizers: [{ id: "org-1", name: "My Org" }],
      },
    });
    const ids = widgets.map((w) => w.id);
    assert.ok(ids.includes("personal_organizers"), "Missing personal_organizers");
    assert.ok(!ids.includes("empty_state"), "Should not show empty_state with managed organizers");
  });

  test("personal with tickets: returns personal_tickets widget", () => {
    const widgets = resolveOverviewModules({
      context: "personal",
      capabilities: [],
      counts: {
        personalTickets: [{ id: "t1", title: "Event", subtitle: "2 tickets", status: "valid", createdAt: "2024-01-01T00:00:00Z", href: "/events" }],
      },
    });
    const ids = widgets.map((w) => w.id);
    assert.ok(ids.includes("personal_tickets"), "Missing personal_tickets");
  });

  test("personal with donations: returns personal_donations widget", () => {
    const widgets = resolveOverviewModules({
      context: "personal",
      capabilities: [],
      counts: {
        personalDonations: [{ id: "d1", title: "Campaign", subtitle: "$50", status: "succeeded", createdAt: "2024-01-01T00:00:00Z", href: "/donate" }],
      },
    });
    const ids = widgets.map((w) => w.id);
    assert.ok(ids.includes("personal_donations"), "Missing personal_donations");
  });

  test("personal with personalBusinessesCount > 0: no empty_state", () => {
    const widgets = resolveOverviewModules({
      context: "personal",
      capabilities: [],
      counts: {
        personalBusinessesCount: 1,
      },
    });
    const ids = widgets.map((w) => w.id);
    assert.ok(!ids.includes("empty_state"), "Should not show empty_state with personalBusinessesCount > 0");
  });
});

// ─── Redirect pages (file existence check) ───────────────────────────────────
describe("Legacy and stub redirect pages exist", () => {
  test("app/dashboard/organizations/[slug]/overview/page.tsx exists", () => {
    const filePath = path.join(ROOT, "app/dashboard/organizations/[slug]/overview/page.tsx");
    assert.ok(fs.existsSync(filePath), `File not found: ${filePath}`);
  });

  test("app/dashboard/organizations/[slug]/page.tsx exists", () => {
    const filePath = path.join(ROOT, "app/dashboard/organizations/[slug]/page.tsx");
    assert.ok(fs.existsSync(filePath), `File not found: ${filePath}`);
  });

  test("app/dashboard/businesses/[id]/overview/page.tsx exists", () => {
    const filePath = path.join(ROOT, "app/dashboard/businesses/[id]/overview/page.tsx");
    assert.ok(fs.existsSync(filePath), `File not found: ${filePath}`);
  });

  test("Canonical org overview page exists", () => {
    const filePath = path.join(ROOT, "app/dashboard/org/[id]/overview/page.tsx");
    assert.ok(fs.existsSync(filePath), `File not found: ${filePath}`);
  });

  test("Legacy slug overview redirects to canonical (contains redirect call)", () => {
    const filePath = path.join(ROOT, "app/dashboard/organizations/[slug]/overview/page.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(content.includes("redirect("), "Legacy slug overview should call redirect()");
    assert.ok(content.includes("/dashboard/org/"), "Legacy slug overview should redirect to canonical /dashboard/org/ path");
  });

  test("Business stub overview redirects to canonical when organizer_id set", () => {
    const filePath = path.join(ROOT, "app/dashboard/businesses/[id]/overview/page.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(content.includes("redirect("), "Business stub should call redirect()");
    assert.ok(content.includes("organizer_id"), "Business stub should check organizer_id");
  });
});

// ─── New component files exist ────────────────────────────────────────────────
describe("Overview v2 component files exist", () => {
  const COMPONENT_FILES = [
    "components/dashboard/overview/OverviewShell.tsx",
    "components/dashboard/overview/AttentionStrip.tsx",
    "components/dashboard/overview/TodayStrip.tsx",
    "components/dashboard/overview/SetupChecklist.tsx",
    "components/dashboard/overview/QuickActions.tsx",
    "components/dashboard/overview/RecentOrdersWidget.tsx",
    "components/dashboard/overview/EventMetricsWidget.tsx",
    "components/dashboard/overview/OrgOverviewClient.tsx",
  ];

  for (const file of COMPONENT_FILES) {
    test(`${path.basename(file)} exists`, () => {
      const filePath = path.join(ROOT, file);
      assert.ok(fs.existsSync(filePath), `Missing component: ${file}`);
    });
  }
});

// ─── lib/date-timezone.ts exports expected functions ─────────────────────────
describe("date-timezone module exports", () => {
  test("exports getStartOfTodayInTimezone as function", () => {
    assert.equal(typeof getStartOfTodayInTimezone, "function");
  });

  test("exports isTodayInTimezone as function", () => {
    assert.equal(typeof isTodayInTimezone, "function");
  });

  test("exports DEFAULT_SITE_TIMEZONE as string", () => {
    assert.equal(typeof DEFAULT_SITE_TIMEZONE, "string");
  });
});

// ─── i18n parity note (documentation test) ───────────────────────────────────
// NOTE: All new overview components use hardcoded English strings.
// This is intentional — Phase 5 does not add i18n keys to messages/en.json or messages/fr.json.
// i18n extraction is deferred to Phase 6 to keep scope contained.
// This test documents that intention and can be updated when i18n is added.
describe("i18n parity", () => {
  test("Overview v2 components use hardcoded strings (i18n deferred to Phase 6)", () => {
    // This test is a documentation marker. It always passes.
    // When i18n is added, this test should be updated to verify EN/FR key parity.
    assert.ok(true, "i18n extraction deferred to Phase 6 — documented");
  });
});
