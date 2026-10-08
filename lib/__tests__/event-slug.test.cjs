/**
 * lib/__tests__/event-slug.test.cjs
 *
 * Round 3 COMMIT 3d (Part B): one shared slug helper for every event
 * creation path. The helper is TypeScript, so this test transpiles it
 * (plus its website-nav dependency) with the repo's own TypeScript and
 * executes the real functions — no database is touched, availability and
 * insert callbacks are fakes.
 * - slugify rules; same title mints different slugs when taken.
 * - forced unique violations are retried with a fresh suffix.
 * - reserved slugs (dashboard, create-event, api, admin, import, …)
 *   are never issued bare.
 * - double submits create one event: stable draft slugs per key plus a
 *   synchronous submit guard and disabled button in the public form.
 * - raw database text never reaches the UI: failures map to one
 *   localized EN/FR message and the form keeps its data.
 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const ts = require("typescript");

const ROOT = path.join(__dirname, "../..");
function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function loadTsModule(rel, requireStub) {
  const source = src(rel);
  const { outputText, diagnostics } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    reportDiagnostics: true,
  });
  const errors = (diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, `${rel} transpiles cleanly`);
  const mod = { exports: {} };
  const run = new Function(
    "module",
    "exports",
    "require",
    `${outputText}\n//# sourceURL=${rel}`
  );
  run(mod, mod.exports, requireStub ?? (() => { throw new Error("unexpected require"); }));
  return mod.exports;
}

const nav = loadTsModule("lib/website-nav.ts");
const slugs = loadTsModule("lib/event-slug.ts", (id) => {
  if (id === "@/lib/website-nav") return nav;
  throw new Error(`unexpected require: ${id}`);
});

describe("slugifyEventTitle", () => {
  test("lowercases, strips punctuation, dashes spaces", () => {
    assert.equal(slugs.slugifyEventTitle("Come As You Are!"), "come-as-you-are");
    assert.equal(slugs.slugifyEventTitle("  Fête d'Été  "), "fte-dt");
    assert.equal(slugs.slugifyEventTitle("a  --  b"), "a-b");
  });

  test("empty titles fall back to event", () => {
    assert.equal(slugs.slugifyEventTitle(""), "event");
    assert.equal(slugs.slugifyEventTitle("!!!"), "event");
  });
});

describe("reserved slugs are never issued bare", () => {
  test("required route words are reserved in the real website list", () => {
    for (const word of ["dashboard", "create-event", "api", "admin", "import"]) {
      assert.ok(nav.RESERVED_WEBSITE_SLUGS.has(word), `${word} is reserved`);
    }
  });

  test("reserved titles mint suffixed slugs", async () => {
    const minted = await slugs.ensureUniqueEventSlug(async () => false, "Admin");
    assert.notEqual(minted, "admin");
    assert.match(minted, /^admin-[a-z0-9]{4}$/);
  });

  test("event-route words are guarded too", () => {
    for (const word of ["event", "events", "invitation", "new", "edit", "shared"]) {
      assert.ok(slugs.isReservedEventSlug(word), `${word} is guarded`);
    }
    assert.ok(!slugs.isReservedEventSlug("come"), "ordinary slugs pass");
  });
});

describe("ensureUniqueEventSlug", () => {
  test("free base slug is returned as-is", async () => {
    assert.equal(await slugs.ensureUniqueEventSlug(async () => false, "Come"), "come");
  });

  test("same title gives different slugs when taken", async () => {
    const taken = new Set(["come"]);
    const exists = async (s) => taken.has(s);
    const first = await slugs.ensureUniqueEventSlug(exists, "Come");
    assert.match(first, /^come-[a-z0-9]{4}$/);
    taken.add(first);
    const second = await slugs.ensureUniqueEventSlug(exists, "Come");
    assert.match(second, /^come-[a-z0-9]{4}$/);
    assert.notEqual(first, second);
  });
});

describe("insertWithUniqueSlug", () => {
  test("a forced collision is retried with a fresh suffix", async () => {
    let calls = 0;
    const attempted = [];
    const insert = async (slug) => {
      calls += 1;
      attempted.push(slug);
      if (calls < 3) return { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "events_slug_key"' } };
      return { data: { id: "evt-1" }, error: null };
    };
    const { slug, data } = await slugs.insertWithUniqueSlug(insert, async () => false, "Come");
    assert.equal(calls, 3);
    assert.equal(new Set(attempted).size, 3, "every retry mints a fresh suffix");
    assert.match(slug, /^come-([a-z0-9]{4}-?)+$/);
    assert.equal(data.id, "evt-1");
  });

  test("non-unique errors abort without raw text", async () => {
    const insert = async () => ({ data: null, error: { code: "500", message: "secret db detail" } });
    await assert.rejects(
      slugs.insertWithUniqueSlug(insert, async () => false, "Come"),
      (err) => err instanceof slugs.EventSlugError && err.code === "unavailable"
    );
  });

  test("EventSlugError carries codes, never database text", () => {
    const err = new slugs.EventSlugError("exhausted");
    assert.equal(err.message, "event slug failure: exhausted");
    assert.ok(!err.message.includes("duplicate"));
  });
});

describe("double submit creates one event", () => {
  test("draft slugs are stable per intent key", () => {
    const s = src("lib/invitation-events.ts");
    assert.ok(s.includes("buildInvitationDraftSlug"), "key-derived slugs exist");
    const actions = src("lib/actions/invitation-events.ts");
    assert.ok(actions.includes("isUniqueViolation(error)"), "shared violation check");
    assert.ok(actions.includes("existing.user_id === user.id"), "fetch-existing verifies ownership");
    assert.ok(actions.includes("existing.kind === EVENT_KIND_INVITATION"), "fetch-existing verifies kind");
  });

  test("public form guards the submit synchronously and disables the button", () => {
    const s = src("app/create-event/CreateEventForm.tsx");
    assert.ok(s.includes("submitInFlight"), "ref guard present");
    assert.ok(s.includes("if (submitInFlight.current) return"), "second submit is a no-op");
    assert.ok(s.includes("disabled={loading}"), "button disabled while saving");
    assert.ok(s.includes("insertWithUniqueSlug"), "collision-safe insert");
  });

  test("title edits never move the slug", () => {
    const s = src("app/events/edit/[id]/page.tsx");
    assert.ok(!s.includes("slug:"), "update payload carries no slug");
    assert.ok(!s.includes("generateSlug"), "no slug minting on edit");
    assert.ok(s.includes("router.push(`/events/${slug}`)"), "redirect uses the stored slug");
  });
});

describe("failures stay localized, form data stays", () => {
  test("localized copy resolves EN and FR", () => {
    assert.match(slugs.localizedPublishError("en"), /kept/);
    assert.match(slugs.localizedPublishError("fr-FR"), /conservées/);
    assert.match(slugs.localizedPublishError("en"), /Could not publish/);
    assert.match(slugs.localizedPublishError("fr"), /Impossible de publier/);
  });

  test("form shows the localized message and never raw insert errors", () => {
    const form = src("app/create-event/CreateEventForm.tsx");
    assert.ok(form.includes("localizedPublishError()"), "form uses the localized message");
    assert.ok(!form.includes("setError(eventError"), "no raw insert error in UI");
    assert.ok(!/setForm\(\{\s*\}\)/.test(form), "failure path never wipes the form");
  });
});
