/**
 * lib/__tests__/invitation-home.test.cjs
 *
 * Round 3 COMMIT 2: preview-first invitation home + dry-run cleanup.
 * - Invitation-kind events open on the preview home; public keeps overview.
 * - Home shows the real-template iframe (sample guest, no writes) and never
 *   the template picker; status/actions/tools per spec.
 * - Builder starts at template choice for fresh drafts, skips it for pages.
 * - Cleanup deletes nothing by default and lists only all-true drafts.
 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "../..");
function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("invitation home routing", () => {
  test("event root routes invitation kind to the preview home", () => {
    const s = src("app/dashboard/events/[id]/page.tsx");
    assert.ok(s.includes("invitation-home"), "invitation kind redirects to invitation-home");
    assert.ok(s.includes("/overview"), "everything else keeps the overview");
  });

  test("public events keep the overview with no invitation entry (Round 4 Rule 1)", () => {
    const s = src("app/dashboard/events/[id]/overview/page.tsx");
    assert.ok(!s.includes("Invite special guests"), "legacy invite entry gone");
    assert.ok(s.includes("isInvitationEvent"), "Invitation card kind-gated");
    assert.ok(!s.includes("invitation-home"), "overview is not the invitation home");
  });

  test("/dashboard/events/new is a two-way choice: public or invitation", () => {
    const s = src("app/dashboard/events/new/page.tsx");
    assert.ok(s.includes("CreateInvitationCard"), "invitation option present");
    assert.ok(s.includes("Create from scratch"), "public option untouched");
    assert.ok(!s.includes("Import event"), "import card removed (Round 3 Commit 3b)");
    assert.ok(!s.includes("/import?mode=events"), "no event-import link remains");
  });
});

describe("preview-first home content", () => {
  const HOME = "app/dashboard/events/[id]/invitation-home/InvitationHomeClient.tsx";

  test("preview mounts InvitationPreviewPanel without horizontal overflow", () => {
    const s = src(HOME);
    assert.ok(s.includes("/invitation/builder-preview/"), "same iframe approach as the builder");
    assert.ok(s.includes("InvitationPreviewPanel"), "home mounts InvitationPreviewPanel");
    assert.ok(!s.includes("overflow-x-auto"), "no horizontal scrolling on invitation home");
    assert.ok(!s.includes("overflow-x-scroll"), "no horizontal scrolling on invitation home");
    assert.ok(s.includes("invitationPreviewGuestCaption"), "localized caption key is used");
    const en = JSON.parse(src("messages/en.json")).Events;
    const fr = JSON.parse(src("messages/fr.json")).Events;
    assert.ok(en.invitationPreviewGuestCaption.includes("no RSVP writes"), "no-write guarantee in EN");
    assert.ok(en.invitationPreviewGuestCaption.includes("sample QR"), "sample QR is labelled in EN");
    assert.ok(fr.invitationPreviewGuestCaption.includes("aucun enregistrement RSVP"), "no-write guarantee in FR");
    assert.ok(fr.invitationPreviewGuestCaption.includes("code QR"), "sample QR is labelled in FR");
  });

  test("home never renders the template picker", () => {
    const s = src(HOME);
    assert.ok(!s.includes("InvitationTypePicker"), "no template picker on the home");
    assert.ok(!s.includes("InvitationTemplateSelect"), "no template dropdown on the home");
  });

  test("status badge covers Draft / Published / Unpublished changes", () => {
    const s = src(HOME);
    assert.ok(s.includes("Unpublished changes"), "dirty-published state exists");
    assert.ok(s.includes('"Published"') || s.includes("Published"), "published state exists");
    assert.ok(s.includes("Draft"), "draft state exists");
    assert.ok(s.includes('data-testid="page-status"'), "status is pinnable");
  });

  test("actions: Edit, Send, share panel, Publish/Unpublish", () => {
    const s = src(HOME);
    assert.ok(s.includes(`/invitation-page`), "Edit opens the builder");
    assert.ok(s.includes("/guests"), "Send reaches guest sending");
    assert.ok(s.includes("ShareLinkPanel"), "Copy link lives in the share panel");
    assert.ok(s.includes("Unpublish") && s.includes("Publish"), "publish toggle present");
  });

  test("no-page drafts get template choice, existing pages do not re-ask", () => {
    const s = src(HOME);
    assert.ok(s.includes('data-testid="no-page-cta"'), "no-page CTA branch exists");
    assert.ok(s.includes("Choose a template"), "CTA leads with template choice");
    const client = src(
      "app/dashboard/events/[id]/invitation-page/InvitationPageDashboardClient.tsx"
    );
    assert.ok(client.includes('"basics"'), "existing pages skip to the form");
    assert.ok(client.includes('"type"'), "fresh drafts start at template choice");
    const builder = src(
      "app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder.tsx"
    );
    assert.ok(builder.includes("initialSection"), "builder accepts the initial section");
  });

  test("the invitation-page route previews saved pages first and uses edit=1 for the builder", () => {
    const route = src("app/dashboard/events/[id]/invitation-page/page.tsx");
    assert.ok(route.includes("searchParams"), "route supports the explicit edit query");
    assert.ok(route.includes('query.edit !== "1"'), "saved pages default to preview");
    assert.ok(route.includes("<InvitationHomeClient"), "saved pages reuse the invitation home");
    assert.ok(route.includes("rsvpCounts={null}"), "preview receives no real guest data");
    const home = src(HOME);
    assert.ok(home.includes('`${builderHref}?edit=1`'), "Edit invitation opens the builder");
  });

  test("a missing page goes straight to the builder template choice", () => {
    const route = src("app/dashboard/events/[id]/invitation-page/page.tsx");
    const client = src("app/dashboard/events/[id]/invitation-page/InvitationPageDashboardClient.tsx");
    assert.ok(route.includes("InvitationPageDashboardClient"), "no-page route renders the builder client");
    assert.ok(client.includes('"type"'), "new page starts at invitation type/template choice");
    const builder = src("app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder.tsx");
    assert.ok(builder.includes('data-testid="start-designing-intro"'), "start intro exists in builder");
    assert.ok(builder.includes("!initialData.draft.id"), "intro is limited to events without a page row");
  });

  test("editing has a Back to preview action and successful publish returns there", () => {
    const builder = src("app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder.tsx");
    assert.ok(builder.includes('data-testid="back-to-preview"'), "builder exposes Back to preview");
    assert.ok(builder.includes("router.push(`/dashboard/events/${eventId}/invitation-page`)") , "publish returns to preview");
  });

  test("the full-page owner preview is private, uncached, and contains only sample guest data", () => {
    const route = src("app/invitation/builder-preview/[eventId]/page.tsx");
    assert.ok(route.includes("await connection()"), "preview waits for the request and is not prerendered");
    assert.ok(route.includes("getCurrentUser"), "route requires an authenticated user");
    assert.ok(route.includes("checkInvitationPageAccess(user.id, eventId)"), "owner/team access is checked server-side");
    assert.ok(route.includes("if (!embedded && !pageData.draft.id) return notFound()"), "guest-style owner preview requires a page row");
    assert.ok(route.includes("robots: { index: false"), "preview is noindex");
    assert.ok(!route.includes('from("event_invitations")'), "preview never reads real guest rows");
    const frame = src("app/invitation/builder-preview/[eventId]/LivePreviewFrame.tsx");
    assert.ok(frame.includes("buildInvitationTemplatePreviewData"), "preview uses render-only assembled sample data");
    const previewData = src("lib/invitation-template-preview-data.ts");
    assert.ok(previewData.includes("SAMPLE_PREVIEW_GUEST"), "preview helper supplies sample guest data");
    assert.ok(previewData.includes("SAMPLE_PREVIEW_TICKET"), "preview helper supplies the sample QR ticket");
    assert.ok(frame.includes("Private: only you can see this"), "owner banner is visible");
    assert.ok(!frame.includes("onRsvp="), "preview has no RSVP write callback");
  });

  test("invitation-page preview routes require invitation kind (Round 4 Rule 1)", () => {
    const route = src("app/dashboard/events/[id]/invitation-page/page.tsx");
    assert.ok(route.includes("assertInvitationKindEvent"), "dashboard page route kind-gated");
    const preview = src("app/invitation/builder-preview/[eventId]/page.tsx");
    assert.ok(preview.includes("assertInvitationKindEvent"), "owner preview kind-gated");
    const home = src("app/dashboard/events/[id]/invitation-home/page.tsx");
    assert.ok(home.includes('kind !== "invitation"'), "invitation home rejects public kind");
    const overview = src("app/dashboard/events/[id]/overview/page.tsx");
    assert.ok(overview.includes("hasInvitationPage"), "overview finds a page row for invitation kind");
    assert.ok(overview.includes("/invitation/builder-preview/${id}"), "preview action opens full owner view");
  });

  test("overview localizes public/private labels and note in English and French", () => {
    const en = JSON.parse(src("messages/en.json")).Events;
    const fr = JSON.parse(src("messages/fr.json")).Events;
    assert.equal(en.viewPublicEvent, "View public event");
    assert.equal(en.viewPrivatePage, "View private page");
    assert.equal(en.privatePageNote, "Only you can see this. Guests see it through their personal link.");
    assert.equal(fr.viewPrivatePage, "Voir la page privée");
    assert.ok(fr.privatePageNote.includes("lien personnel"));
    const publicEvent = src("app/events/[slug]/page.tsx");
    assert.ok(publicEvent.includes('event.visibility === "private"'), "non-owner private event gate remains in place");
  });

  test("tools link to guests and seating without loading real RSVP data", () => {
    const s = src(HOME);
    assert.ok(s.includes("Manage the guest list and invitations"), "guest tool shown without counts");
    assert.ok(s.includes("/seating"), "seating linked");
    const route = src("app/dashboard/events/[id]/invitation-home/page.tsx");
    assert.ok(route.includes("rsvpCounts={null}"), "invitation home receives no real guest data");
    assert.ok(!route.includes('from("event_invitations")'), "preview does not query guest RSVP rows");
    for (const tab of ['"Team", "team"', '"Operations", "operations"', '"Check-ins", "checkins"', '"Scan", "scan"']) {
      assert.ok(s.includes(tab), `${tab} linked`);
    }
  });

  test("creation entries push to the real builder route", () => {
    for (const f of [
      "components/events/CreateInvitationButton.tsx",
      "components/events/CreateInvitationCard.tsx",
    ]) {
      const s = src(f);
      assert.ok(s.includes("/invitation-page`"), `${f} targets the builder route`);
      assert.ok(!s.includes("invitation-page/builder"), `${f} has no stale /builder suffix`);
    }
  });
});

describe("stale draft cleanup (dry run by default)", () => {
  test("eligibility requires every approved condition", () => {
    const s = src("lib/invitation-cleanup.ts");
    assert.ok(s.includes('.eq("kind", "invitation")'), "kind gate");
    assert.ok(s.includes('.eq("status", "draft")'), "draft gate");
    assert.ok(s.includes("INVITATION_DRAFT_TITLE"), "placeholder gate");
    for (const table of [
      "event_invitation_pages",
      "event_invitations",
      "ticket_orders",
      "ticket_instances",
      "event_memory_settings",
      "event_memories",
    ]) {
      assert.ok(s.includes(table), `${table} disqualifies`);
    }
    assert.ok(s.includes("assigned_invitation_id"), "seating assignments disqualify");
    assert.ok(s.includes("INVITATION_DRAFT_RETENTION_DAYS = 30"), "30-day floor");
  });

  test("dry run is the default; live needs flag plus environment guard", () => {
    const s = src("lib/invitation-cleanup.ts");
    assert.ok(s.includes("dryRun: true"), "default path reports dry run");
    assert.ok(s.includes("ENABLE_INVITATION_DRAFT_DELETE"), "separate explicit flag");
    assert.ok(s.includes("Nothing was deleted"), "refusal is explicit");
    assert.ok(s.includes("console.log"), "log goes to stdout (host log collector)");
    const route = src("app/api/cron/invitation-drafts/route.ts");
    assert.ok(route.includes("isAuthorizedCronRequest"), "cron auth kept");
    assert.ok(route.includes('get("live") === "1"'), "live is opt-in per call");
    // Not scheduled in vercel.json yet: the sentinel suite pins the cron
    // count (plan budget). One-line addition once confirmed:
    // { "path": "/api/cron/invitation-drafts", "schedule": "0 4 * * *" }
    const vercel = src("vercel.json");
    assert.ok(!vercel.includes("/api/cron/invitation-drafts"), "schedule held for confirmation");
  });
});
