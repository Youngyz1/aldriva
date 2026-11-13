/**
 * lib/__tests__/invitation-delivery-source-assertions.test.cjs
 *
 * Source-level assertions covering the parts of the invitation-delivery fix
 * that a behavioral test can't reach cheaply:
 *  - The dashboard UI components (TeamClient.tsx, GuestsClient.tsx) are large,
 *    deeply-dependent client components (next-intl, DashboardPageHeader,
 *    AdminConfirmDialog, tabler icons, live fetch calls). This repo does have
 *    a raw jsdom + react-dom/client rendering harness (see
 *    components/dashboard/kitchen/__tests__/personnel-management-ui.test.cjs)
 *    but it is not reused here: fully mocking these two components' dependency
 *    surface would be disproportionate to the UI logic being verified (a few
 *    conditionals around existing state). Source assertions are used instead
 *    and are explicitly called out as the chosen tradeoff, per instruction.
 *  - The Stripe webhook's internal reconciliation-alert email (fire-and-forget,
 *    no emailed/acceptUrl concept) is covered by source assertion rather than
 *    a full webhook-signature test harness.
 *
 * What these assertions prove: the exact code pattern is present (error
 * checked, link shown unconditionally, no secret/link in a console call).
 * What they do NOT prove: runtime DOM behavior (click handlers firing,
 * actual rendering output). The behavioral tests in
 * invitation-delivery-team-invite.test.cjs and invitation-delivery-guest-invite.test.cjs
 * cover the server-side logic these UI files merely render.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Every console.* call site in the file, as its raw argument text. */
function consoleCallArgs(source) {
  const calls = [];
  const re = /console\.(log|warn|error)\(([\s\S]*?)\);/g;
  let m;
  while ((m = re.exec(source))) {
    calls.push(m[2]);
  }
  return calls;
}

teamInviteUiTests();
guestInviteUiTests();
stripeWebhookTests();

function teamInviteUiTests() {
  const FILE = "app/dashboard/events/[id]/team/TeamClient.tsx";

  test("TeamClient: shows the accept link whenever acceptUrl is present, not gated on !emailed", () => {
    const s = src(FILE);
    assert.ok(!s.includes("data.acceptUrl && !data.emailed"), "old email-only gate must be removed");
    assert.ok(s.includes("if (data.acceptUrl) {"), "link now shown whenever acceptUrl exists, regardless of emailed");
  });

  test("TeamClient: success/failure message branches on data.emailed", () => {
    const s = src(FILE);
    assert.ok(s.includes("data.emailed") && s.includes("Email sent to"));
    assert.ok(s.includes("Email could not be sent"));
  });

  test("TeamClient: WhatsApp button only renders when a whatsappUrl exists", () => {
    const s = src(FILE);
    assert.ok(s.includes("manualWhatsappUrl &&"), "WhatsApp button gated on whatsappUrl presence");
    assert.ok(s.includes("Send via WhatsApp"));
    assert.ok(s.includes("IconBrandWhatsapp"), "uses the approved tabler icon, not a new icon library");
  });

  test("TeamClient: no console call logs the accept link or a token", () => {
    const s = src(FILE);
    for (const args of consoleCallArgs(s)) {
      assert.ok(!args.includes("manualAcceptUrl"), "accept link must never be logged");
      assert.ok(!args.includes("acceptUrl"));
    }
  });
}

function guestInviteUiTests() {
  const FILE = "app/dashboard/events/[id]/guests/GuestsClient.tsx";

  test("GuestsClient: shows the invitation link whenever invitationUrl is present", () => {
    const s = src(FILE);
    assert.ok(s.includes("data.invitationUrl") && s.includes("setInviteLinkBanner"));
  });

  test("GuestsClient: send/resend message branches on data.emailed", () => {
    const s = src(FILE);
    assert.ok(s.includes('data.emailed ? "success" : "error"'));
    assert.ok(s.includes("Email could not be sent"));
  });

  test("GuestsClient: WhatsApp button only renders when a whatsappUrl exists", () => {
    const s = src(FILE);
    assert.ok(s.includes("inviteLinkBanner.whatsappUrl &&"));
    assert.ok(s.includes("Send via WhatsApp"));
  });

  test("GuestsClient: AddGuestModal propagates invitationUrl/whatsappUrl/emailed to its onSuccess callback", () => {
    const s = src(FILE);
    assert.ok(s.includes("invitationUrl: data.invitationUrl"));
    assert.ok(s.includes("whatsappUrl: data.whatsappUrl"));
    assert.ok(s.includes("emailed: Boolean(data.emailSent)"));
  });

  test("GuestsClient: no console call logs the invitation link", () => {
    const s = src(FILE);
    for (const args of consoleCallArgs(s)) {
      assert.ok(!args.includes("inviteLinkBanner"));
      assert.ok(!args.includes("invitationUrl"));
    }
  });
}

function stripeWebhookTests() {
  const FILE = "app/api/webhooks/stripe/route.ts";

  test("Stripe webhook: reconciliation alert checks the Resend error field instead of discarding it", () => {
    const s = src(FILE);
    const sendIdx = s.indexOf("[URGENT] Payment succeeded");
    assert.ok(sendIdx > -1, "alert email send site found");
    const window = s.slice(Math.max(0, sendIdx - 300), sendIdx + 1500);
    assert.ok(window.includes("const { error: sendErr }"), "error field must be destructured from the send result");
    assert.ok(window.includes("if (sendErr)"), "error must be checked");
  });

  test("Stripe webhook: the reconciliation-alert error log never includes the RESEND_API_KEY", () => {
    const s = src(FILE);
    for (const args of consoleCallArgs(s)) {
      assert.ok(!args.includes("RESEND_API_KEY"));
    }
  });
}
