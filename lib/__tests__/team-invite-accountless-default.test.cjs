/**
 * lib/__tests__/team-invite-accountless-default.test.cjs
 *
 * TeamClient.tsx is a heavy client component (next-intl, DashboardPageHeader,
 * AdminConfirmDialog, live fetch calls) - following the existing convention
 * in lib/__tests__/invitation-delivery-source-assertions.test.cjs, its
 * default-toggle logic is verified with source assertions.
 *
 * The invite form's account-less checkbox must default to ON for
 * ticket_scanner (the common door-staff invite) and OFF for event_manager
 * (which requires an Aldriva account), and switching the role select must
 * reset the checkbox to each role's own default rather than leaving
 * whatever the organizer last picked for the other role.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const FILE = "app/dashboard/events/[id]/team/TeamClient.tsx";
const s = fs.readFileSync(path.join(ROOT, FILE), "utf8");

test("inviteRole defaults to ticket_scanner and inviteAccountless defaults to true (on)", () => {
  assert.match(s, /useState<"event_manager" \| "ticket_scanner">\("ticket_scanner"\)/);
  assert.match(s, /const \[inviteAccountless, setInviteAccountless\] = useState\(true\)/);
});

test("switching the role select resets inviteAccountless to that role's default", () => {
  const idx = s.indexOf("onChange={(e) => {");
  assert.ok(idx > -1);
  const block = s.slice(idx, idx + 400);
  assert.match(block, /setInviteRole\(role\)/);
  assert.match(block, /setInviteAccountless\(role === "ticket_scanner"\)/);
});

test("the email input is still always required, independent of inviteAccountless", () => {
  const emailFieldIdx = s.indexOf('type="email"');
  const window = s.slice(emailFieldIdx, emailFieldIdx + 200);
  assert.match(window, /\brequired\b/);
  assert.ok(!window.includes("required={"), "email's required attribute must not be conditional on inviteAccountless");
});
