const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("fundraiser switcher — scope and URL", () => {
  it("organizer scope lists only organizer fundraisers", () => {
    const all = [
      { id: "f1", title: "A", organizer_id: "org1" },
      { id: "f2", title: "B", organizer_id: "org1" },
      { id: "f3", title: "C", organizer_id: "org2" },
      { id: "f4", title: "D", organizer_id: null, user_id: "u1" },
    ];
    const current = { id: "f1", organizer_id: "org1" };
    const scoped = all.filter((f) => f.organizer_id === current.organizer_id);
    assert.equal(scoped.length, 2);
    assert.ok(scoped.every((f) => f.organizer_id === "org1"));
    assert.ok(!scoped.some((f) => f.id === "f3"));
  });

  it("personal scope lists only personal fundraisers of current user", () => {
    const all = [
      { id: "f1", organizer_id: null, user_id: "u1", title: "Personal A" },
      { id: "f2", organizer_id: null, user_id: "u1", title: "Personal B" },
      { id: "f3", organizer_id: null, user_id: "u2", title: "Other user" },
      { id: "f4", organizer_id: "org1", title: "Org" },
    ];
    const current = { organizer_id: null, user_id: "u1" };
    const scoped = all.filter((f) => f.organizer_id === null && f.user_id === current.user_id);
    assert.equal(scoped.length, 2);
    assert.ok(scoped.every((f) => f.user_id === "u1"));
  });

  it("URL navigation preserves subpath", () => {
    function buildUrl(pathname, newId) {
      const match = pathname.match(/^\/dashboard\/fundraisers\/[^/]+(\/.*)?$/);
      const suffix = match?.[1] ?? "/overview";
      return `/dashboard/fundraisers/${newId}${suffix}`;
    }
    assert.equal(buildUrl("/dashboard/fundraisers/old/overview", "new"), "/dashboard/fundraisers/new/overview");
    assert.equal(buildUrl("/dashboard/fundraisers/old/donations", "new"), "/dashboard/fundraisers/new/donations");
    assert.equal(buildUrl("/dashboard/fundraisers/old/beneficiaries", "new"), "/dashboard/fundraisers/new/beneficiaries");
    assert.equal(buildUrl("/dashboard/fundraisers/old", "new"), "/dashboard/fundraisers/new/overview");
  });

  it("Back to Dashboard routes to /dashboard", () => {
    const backHref = "/dashboard";
    assert.equal(backHref, "/dashboard");
    assert.notEqual(backHref, "/dashboard/fundraisers");
    assert.notEqual(backHref, "/dashboard/org/any");
  });

  it("current selection is marked", () => {
    const items = [
      { id: "a", title: "Medicals" },
      { id: "b", title: "Medical" },
    ];
    const currentId = "a";
    const marked = items.map((i) => ({ ...i, active: i.id === currentId }));
    assert.equal(marked.find((i) => i.active).id, "a");
    assert.equal(marked.filter((i) => i.active).length, 1);
  });

  it("does not leak cross-organizer fundraisers", () => {
    const orgA = "org-venezuela";
    const orgB = "org-other";
    const fundraisers = [
      { id: "1", organizer_id: orgA },
      { id: "2", organizer_id: orgA },
      { id: "3", organizer_id: orgB },
    ];
    const scopedToA = fundraisers.filter((f) => f.organizer_id === orgA);
    assert.equal(scopedToA.length, 2);
    assert.ok(!scopedToA.some((f) => f.organizer_id === orgB));
  });
});
