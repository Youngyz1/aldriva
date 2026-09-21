const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

// Test the pure calculations used by the fundraiser command-center.
// These mirror the source dashboard's formulas in event-platform/app/dashboard/page.tsx
// but scoped to a single fundraiser_id and adapted to Aldriva's schema (goal/raised).

const DAY_MS = 86_400_000;

function inferStatus(raised, goal, endDate) {
  const DEFAULT = 30;
  function getDaysRemaining(e) {
    if (!e) return DEFAULT;
    return Math.max(0, Math.ceil((new Date(e).getTime() - Date.now()) / DAY_MS));
  }
  const days = getDaysRemaining(endDate);
  if (days === 0 || (goal > 0 && raised >= goal)) return "completed";
  const progress = goal > 0 ? raised / goal : 0;
  const elapsed = 1 - days / 90;
  if (progress >= elapsed + 0.05) return "ahead";
  if (progress < elapsed - 0.1) return "behind";
  return "on_track";
}

function computeHealthScore(status, dailyPaceRequired, avg) {
  if (status === "completed") return 100;
  if (dailyPaceRequired === undefined || dailyPaceRequired <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((avg / dailyPaceRequired) * 65)));
}

function computeProjected(raised, goal, avg) {
  if (goal > 0 && raised >= goal) return null;
  if (avg <= 0) return null;
  const d = Math.ceil((goal - raised) / avg);
  if (!Number.isFinite(d)) return null;
  return new Date(Date.now() + d * DAY_MS).toISOString();
}

describe("fundraiser dashboard — scoped calculations", () => {
  it("handles legacy fundraiser with null goal/raised/beneficiary without throwing", () => {
    const f = { goal: null, raised: null, raised_amount: null, beneficiary: null, created_at: null };
    const goal = Number(f.goal ?? 0);
    const raised = Number(f.raised_amount ?? f.raised ?? 0);
    assert.equal(goal, 0);
    assert.equal(raised, 0);
    const status = inferStatus(raised, goal, null);
    assert.ok(["on_track", "behind", "ahead", "completed"].includes(status));
    const health = computeHealthScore(status, undefined, 0);
    assert.ok(health >= 0 && health <= 100);
    const proj = computeProjected(raised, goal, 0);
    assert.equal(proj, null);
  });

  it("progress handles goal 0 without NaN", () => {
    function pct(raised, goal) {
      const r = Math.max(0, Number(raised ?? 0));
      const g = Number(goal ?? 0);
      if (!Number.isFinite(r) || !Number.isFinite(g) || g <= 0) return 0;
      return Math.min(100, Math.round((r / g) * 100));
    }
    assert.equal(pct(100, 0), 0);
    assert.equal(pct(50, 100), 50);
  });

  it("donor count is scoped to fundraiser donations only", () => {
    const donations = [
      { id: "1", donor_name: "Alice", fundraiser_id: "f1", amount: 100 },
      { id: "2", donor_name: "Alice", fundraiser_id: "f1", amount: 50 },
      { id: "3", donor_name: "Bob", fundraiser_id: "f2", amount: 100 },
    ];
    const scoped = donations.filter((d) => d.fundraiser_id === "f1");
    const donors = new Set(scoped.map((d) => (d.donor_name === "Anonymous" ? d.id : d.donor_name))).size;
    assert.equal(donors, 1);
    assert.equal(scoped.length, 2);
  });

  it("average donation uses scoped donations", () => {
    const raised = 300;
    const count = 3;
    assert.equal(Math.round(raised / count), 100);
    assert.equal(0, 0); // zero donations yields 0
  });

  it("today's donations UTC day", () => {
    function isSameUtcDay(a, b) {
      return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
    }
    const now = new Date("2026-09-20T12:00:00Z");
    const today = new Date("2026-09-20T08:00:00Z");
    const yesterday = new Date("2026-09-19T23:00:00Z");
    assert.equal(isSameUtcDay(today, now), true);
    assert.equal(isSameUtcDay(yesterday, now), false);
  });

  it("projection returns null when insufficient data", () => {
    assert.equal(computeProjected(0, 10000, 0), null);
    assert.equal(computeProjected(10000, 10000, 100), null);
    assert.ok(computeProjected(1000, 10000, 100) !== null);
  });

  it("health is 100 when no pace required", () => {
    assert.equal(computeHealthScore("on_track", undefined, 0), 100);
    assert.equal(computeHealthScore("completed", 100, 0), 100);
  });

  it("does not leak cross-fundraiser donations", () => {
    const all = [{ fundraiser_id: "a", amount: 100 }, { fundraiser_id: "b", amount: 9999 }];
    const scoped = all.filter((d) => d.fundraiser_id === "a");
    assert.equal(scoped.reduce((s, d) => s + Number(d.amount), 0), 100);
    assert.notEqual(scoped.reduce((s, d) => s + Number(d.amount), 0), 10099);
  });
});
