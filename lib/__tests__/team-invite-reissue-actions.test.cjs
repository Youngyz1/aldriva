/**
 * lib/__tests__/team-invite-reissue-actions.test.cjs
 *
 * F1 (Guest Scanner Fix Round): TeamClient's invitation-history row must
 * show the correct action per status/is_accountless combination:
 *   - revoked + account-less        -> "Re-invite"
 *   - expired/declined/locked       -> "Resend"
 *   - accepted + account-less       -> "Resend access link" (behind a
 *     confirm dialog warning that it signs the current device out)
 *   - accepted/revoked + account    -> no action at all
 *
 * TeamClient is a heavy client component (next-intl, DashboardPageHeader,
 * AdminConfirmDialog, live fetch calls) - following the existing convention
 * in lib/__tests__/invitation-delivery-source-assertions.test.cjs and
 * lib/__tests__/team-invite-accountless-default.test.cjs, this is verified
 * with source assertions.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const FILE = "app/dashboard/events/[id]/team/TeamClient.tsx";
const s = fs.readFileSync(path.join(ROOT, FILE), "utf8");

function block(marker, len = 500) {
  const idx = s.indexOf(marker);
  assert.ok(idx > -1, `marker not found: ${marker}`);
  return s.slice(idx, idx + len);
}

test("revoked + account-less invitations get a Re-invite action", () => {
  const b = block('inv.is_accountless && inv.status === "revoked"');
  assert.match(b, /onClick=\{\(\) => handleResendInvite\(inv\.id\)\}/);
  assert.match(b, /t\("reInvite"\)/);
});

test("expired/declined/locked invitations (either kind) get a Resend action", () => {
  const b = block('["expired", "declined", "locked"].includes(inv.status)');
  assert.match(b, /onClick=\{\(\) => handleResendInvite\(inv\.id\)\}/);
  assert.match(b, />\s*Resend\s*</);
});

test("accepted + account-less invitations get a Resend access link action, gated by a confirm dialog", () => {
  const b = block('inv.is_accountless && inv.status === "accepted"');
  assert.match(b, /onClick=\{\(\) => setInviteToResendAccessLink\(inv\)\}/);
  assert.match(b, /t\("resendAccessLink"\)/);
});

test("the resend-access-link confirm dialog warns about signing the current device out", () => {
  const idx = s.indexOf("inviteToResendAccessLink !== null");
  const dialogBlock = s.slice(idx, idx + 700);
  assert.match(dialogBlock, /t\("resendAccessLinkConfirmDescription"\)/);
  assert.match(dialogBlock, /handleResendInvite\(inviteId\)/);
});

test('messages/en.json and messages/fr.json both define resendAccessLinkConfirmDescription with "signs the current device out" semantics', () => {
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8"));
  const fr = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/fr.json"), "utf8"));
  assert.match(en.Events.resendAccessLinkConfirmDescription, /signs the current device out/i);
  assert.ok(fr.Events.resendAccessLinkConfirmDescription.length > 0);
  assert.ok(en.Events.reInvite);
  assert.ok(fr.Events.reInvite);
  assert.ok(en.Events.resendAccessLink);
  assert.ok(fr.Events.resendAccessLink);
});

test("account (non-account-less) accepted/revoked rows never render a resend/re-invite/access-link action", () => {
  // The history list has exactly three conditional action branches, and
  // every one is gated either by inv.is_accountless (revoked / accepted
  // cases) or by a status list that excludes 'accepted' and 'revoked'
  // entirely - so an account invitation's accepted/revoked row can never
  // match any action branch.
  const historyIdx = s.indexOf("Collapsible Invitation History");
  const historySection = s.slice(historyIdx, historyIdx + 2500);
  const buttonCount = (historySection.match(/<button/g) || []).length;
  assert.equal(buttonCount, 3, "expected exactly 3 action buttons in the invitation history list");
  const accountlessGatedCount = (historySection.match(/inv\.is_accountless && inv\.status ===/g) || []).length;
  assert.equal(accountlessGatedCount, 2, "both the revoked and accepted account-less actions must be gated by inv.is_accountless");
  assert.ok(historySection.includes('["expired", "declined", "locked"].includes(inv.status)'));
});
