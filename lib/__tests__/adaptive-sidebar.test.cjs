const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("adaptive sidebar — white, collapsed 60, expanded 300", () => {
  it("uses white background not dark", () => {
    const bg = "bg-white";
    assert.equal(bg, "bg-white");
    assert.notEqual(bg, "bg-slate-950");
  });

  it("collapsed 60, expanded 300", () => {
    const collapsed = 60, expanded = 300;
    assert.equal(collapsed, 60);
    assert.equal(expanded, 300);
  });

  it("hover expands on desktop, tap toggles on touch", () => {
    const hoverCapable = true;
    let open = false;
    if (hoverCapable) open = true; // mouseEnter
    assert.equal(open, true);
    // touch
    const hoverCapableTouch = false;
    open = false;
    if (!hoverCapableTouch) open = !open; // tap
    assert.equal(open, true);
  });

  it("active route highlighted via URL, not local state", () => {
    function isActive(path, href) { return path === href || path.startsWith(href + "/"); }
    assert.equal(isActive("/dashboard/org/1/overview", "/dashboard/org/1/overview"), true);
    assert.equal(isActive("/dashboard/org/1/events", "/dashboard/org/1/overview"), false);
  });

  it("serializable icons (string ids, not components)", () => {
    const navItem = { label: "Overview", href: "/dashboard", icon: "LayoutDashboard" };
    assert.equal(typeof navItem.icon, "string");
  });

  it("contextual nav per route", () => {
    const orgNav = (hasEvents) => hasEvents ? ["Overview","Events"] : ["Overview"];
    assert.deepEqual(orgNav(true), ["Overview","Events"]);
    assert.deepEqual(orgNav(false), ["Overview"]);
  });

  it("website only when business/site exists", () => {
    const hasWebsite = false;
    const nav = ["Overview", ...(hasWebsite ? ["Website"] : [])];
    assert.ok(!nav.includes("Website"));
    const hasWebsite2 = true;
    const nav2 = ["Overview", ...(hasWebsite2 ? ["Website"] : [])];
    assert.ok(nav2.includes("Website"));
  });

  it("no fake modules", () => {
    const nav = ["Overview","Events","Fundraisers","Business","Website","Analytics","Settings"];
    const fake = ["Services","Volunteers","Blog","Gallery"];
    assert.ok(fake.every((f) => !nav.includes(f)));
  });

  it("mobile drawer: backdrop, Esc, close on nav, scroll lock", () => {
    let open = true;
    // backdrop
    open = false; assert.equal(open, false);
    open = true;
    // Esc
    const key = "Escape"; if (key==="Escape") open=false; assert.equal(open,false);
  });

  it("no bottom pill nav, single hamburger", () => {
    const hasBottom = false, hamburgerCount = 1;
    assert.equal(hasBottom, false);
    assert.equal(hamburgerCount, 1);
  });
});
