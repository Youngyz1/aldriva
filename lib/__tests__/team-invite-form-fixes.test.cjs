/**
 * lib/__tests__/team-invite-form-fixes.test.cjs
 *
 * F6 (Guest Scanner Fix Round): TeamClient's invite form must:
 *  - start closed behind an "Invite staff" button
 *  - block submit with a client-side phone check before hitting the
 *    server, using the shared isValidInvitePhone validator
 *  - disable (never just auto-uncheck) the account-less checkbox for
 *    event_manager
 *  - agree the staff-name label and its `required` attribute (no
 *    "(optional)" shown when the field IS required)
 *  - reset inviteAccountless to the role default after a successful submit
 *
 * TeamClient is a heavy client component (next-intl, DashboardPageHeader,
 * AdminConfirmDialog, live fetch calls) - following the existing
 * convention (lib/__tests__/team-invite-accountless-default.test.cjs),
 * verified with source assertions.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const FILE = "app/dashboard/events/[id]/team/TeamClient.tsx";
const s = fs.readFileSync(path.join(ROOT, FILE), "utf8");

test("the invite form starts closed: inviteFormOpen defaults to false and an Invite staff button opens it", () => {
  assert.match(s, /const \[inviteFormOpen, setInviteFormOpen\] = useState\(false\)/);
  const idx = s.indexOf("{!inviteFormOpen ? (");
  assert.ok(idx > -1);
  const block = s.slice(idx, idx + 400);
  assert.match(block, /onClick=\{\(\) => setInviteFormOpen\(true\)\}/);
  assert.match(block, /t\("inviteStaffButton"\)/);
});

test("handleSendInvite blocks submit with a client-side phone check before any fetch call", () => {
  const idx = s.indexOf("async function handleSendInvite");
  const fetchIdx = s.indexOf("await fetch(", idx);
  const block = s.slice(idx, fetchIdx);
  assert.match(block, /if \(inviteAccountless && !isValidInvitePhone\(invitePhone\)\)/);
  assert.match(block, /setInvitePhoneTouched\(true\)/);
  assert.match(block, /return;/);
});

test("imports isValidInvitePhone from the shared validator module", () => {
  assert.match(s, /import \{ isValidInvitePhone \} from "@\/lib\/staff\/invite-phone-validation"/);
});

test("the phone field shows a hint always and an inline error only once touched and invalid", () => {
  const idx = s.indexOf('Phone Number (E.164)');
  const block = s.slice(idx, idx + 1200);
  assert.match(block, /onBlur=\{\(\) => setInvitePhoneTouched\(true\)\}/);
  assert.match(block, /t\("invitePhoneHint"\)/);
  assert.match(block, /invitePhoneTouched && !isValidInvitePhone\(invitePhone\)/);
  assert.match(block, /t\("invitePhoneError"\)/);
  // No auto-prefix or default country: the input's value is never rewritten
  // on change, only read straight from the event target.
  assert.match(block, /onChange=\{\(e\) => setInvitePhone\(e\.target\.value\)\}/);
});

test("the account-less checkbox is disabled for event_manager, not just auto-unchecked", () => {
  const idx = s.indexOf('type="checkbox"');
  const block = s.slice(idx, idx + 300);
  assert.match(block, /disabled=\{inviteRole === "event_manager"\}/);
});

test("the staff-name label agrees with its required attribute: no (optional) shown when accountless makes it required", () => {
  const idx = s.indexOf('{t("staffName")}');
  const block = s.slice(idx, idx + 250);
  assert.match(block, /inviteAccountless \? null : \(/);
  const requiredIdx = s.indexOf("required={inviteAccountless}", idx);
  assert.ok(requiredIdx > idx && requiredIdx < idx + 400, "required={inviteAccountless} must immediately follow this label");
});

test("after a successful submit, inviteAccountless resets to the current role's default", () => {
  const idx = s.indexOf("setInviteStaffName(\"\");");
  const block = s.slice(idx, idx + 300);
  assert.match(block, /setInviteAccountless\(inviteRole === "ticket_scanner"\)/);
});

test('messages/en.json and messages/fr.json both define the new invite-form keys', () => {
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8"));
  const fr = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/fr.json"), "utf8"));
  for (const key of ["inviteStaffButton", "closeInviteForm", "eventManagerAccountRequiredNote", "invitePhoneHint", "invitePhoneError"]) {
    assert.ok(en.Events[key], `en.json Events.${key} missing`);
    assert.ok(fr.Events[key], `fr.json Events.${key} missing`);
  }
});

test("email stays unconditionally required for both account and account-less invites (unchanged)", () => {
  const emailFieldIdx = s.indexOf('type="email"');
  const window = s.slice(emailFieldIdx, emailFieldIdx + 200);
  assert.match(window, /\brequired\b/);
  assert.ok(!window.includes("required={"), "email's required attribute must not be conditional on inviteAccountless");
});
