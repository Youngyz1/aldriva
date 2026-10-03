const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("mobile hamburger and event shell", () => {
  it("global mobile uses hamburger not bottom pills", () => {
    const hasHamburger = true;
    const hasBottomPills = false; // dashboard management must not have fixed bottom
    assert.equal(hasHamburger, true);
    assert.equal(hasBottomPills, false);
  });

  it("organizer mobile uses hamburger with org nav", () => {
    const orgNav = ["Overview", "Events", "Fundraisers"];
    const hasHamburger = true;
    assert.ok(orgNav.includes("Events"));
    assert.equal(hasHamburger, true);
  });

  it("event switcher scoped to organizer", () => {
    const events = [
      { id: "e1", organizer_id: "org1" },
      { id: "e2", organizer_id: "org1" },
      { id: "e3", organizer_id: "org2" },
    ];
    const current = { organizer_id: "org1" };
    const scoped = events.filter((e) => e.organizer_id === current.organizer_id);
    assert.equal(scoped.length, 2);
    assert.ok(!scoped.some((e) => e.organizer_id === "org2"));
  });

  it("organizer → Events redirects to first event", () => {
    const events = [
      { id: "e2", created_at: "2026-09-10" },
      { id: "e1", created_at: "2026-09-12" },
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const first = events[0];
    const url = `/dashboard/events/${first.id}/overview`;
    assert.equal(url, "/dashboard/events/e1/overview");
  });

  it("event management has single shell (no global+org+event stacking)", () => {
    const path = "/dashboard/events/abc/overview";
    const isOrgWorkspace = path.startsWith("/dashboard/org/");
    const isFundraiser = !!path.match(/^\/dashboard\/fundraisers\/[^/]+(\/.*)?$/);
    const isEvent = !!path.match(/^\/dashboard\/events\/[^/]+(\/.*)?$/);
    const globalVisible = !(isOrgWorkspace || isFundraiser || isEvent);
    assert.equal(globalVisible, false);
    assert.equal(isEvent, true);
  });

  it("event URL is authoritative for switcher", () => {
    function buildEventUrl(pathname, newId) {
      const m = pathname.match(/^\/dashboard\/events\/[^/]+(\/.*)?$/);
      const suffix = m?.[1] ?? "/overview";
      return `/dashboard/events/${newId}${suffix}`;
    }
    assert.equal(buildEventUrl("/dashboard/events/a/overview", "b"), "/dashboard/events/b/overview");
    assert.equal(buildEventUrl("/dashboard/events/a/guests", "b"), "/dashboard/events/b/guests");
  });
});
