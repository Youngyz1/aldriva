/**
 * lib/__tests__/copy-button-clipboard-fallback.test.cjs
 *
 * F3 (Guest Scanner Fix Round): TeamClient, KitchenManagementClient,
 * CourierManagementClient, and GuestsClient must all use the shared
 * copyTextToClipboard(lib/clipboard.ts) instead of calling
 * navigator.clipboard.writeText directly, set their "copied" state from
 * its boolean return value, and on failure show "Copy failed - select the
 * link and copy it manually" alongside a read-only input that selects its
 * text on focus. These are heavy client components (live fetch calls,
 * next-intl, dialogs) - following the existing convention
 * (lib/__tests__/invitation-delivery-source-assertions.test.cjs), this is
 * verified with source assertions.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const FILES = [
  "app/dashboard/events/[id]/team/TeamClient.tsx",
  "components/dashboard/kitchen/KitchenManagementClient.tsx",
  "components/dashboard/kitchen/CourierManagementClient.tsx",
  "app/dashboard/events/[id]/guests/GuestsClient.tsx",
];

for (const file of FILES) {
  test(`${file}: imports copyTextToClipboard and never calls navigator.clipboard.writeText directly`, () => {
    const s = src(file);
    assert.match(s, /import \{ copyTextToClipboard \} from "@\/lib\/clipboard"/);
    assert.ok(!s.includes("navigator.clipboard.writeText"), "must not call navigator.clipboard.writeText directly");
  });

  test(`${file}: shows the Copy failed message and a read-only, select-on-focus input on failure`, () => {
    const s = src(file);
    assert.match(s, /Copy failed - select the link and copy it manually/);
    assert.match(s, /readOnly/);
    assert.match(s, /onFocus=\{\(e\) => e\.(?:currentTarget|target)\.select\(\)\}/);
  });
}

test("TeamClient: copyToClipboard sets copiedUrl/copyFailed from copyTextToClipboard's boolean result", () => {
  const s = src("app/dashboard/events/[id]/team/TeamClient.tsx");
  const idx = s.indexOf("async function copyToClipboard");
  const block = s.slice(idx, idx + 250);
  assert.match(block, /const succeeded = await copyTextToClipboard\(text\);/);
  assert.match(block, /setCopiedUrl\(succeeded\)/);
  assert.match(block, /setCopyFailed\(!succeeded\)/);
});

test("GuestsClient: copyInviteLink sets copiedInviteLink/inviteLinkCopyFailed from copyTextToClipboard's boolean result", () => {
  const s = src("app/dashboard/events/[id]/guests/GuestsClient.tsx");
  const idx = s.indexOf("async function copyInviteLink");
  const block = s.slice(idx, idx + 250);
  assert.match(block, /const succeeded = await copyTextToClipboard\(url\);/);
  assert.match(block, /setCopiedInviteLink\(succeeded\)/);
  assert.match(block, /setInviteLinkCopyFailed\(!succeeded\)/);
});

test("KitchenManagementClient: copyLink sets copied/copyFailed from copyTextToClipboard's boolean result", () => {
  const s = src("components/dashboard/kitchen/KitchenManagementClient.tsx");
  const idx = s.indexOf("async function copyLink");
  const block = s.slice(idx, idx + 250);
  assert.match(block, /const succeeded = await copyTextToClipboard\(oneTimeLink\.url\);/);
  assert.match(block, /setCopied\(succeeded\)/);
  assert.match(block, /setCopyFailed\(!succeeded\)/);
});

test("CourierManagementClient: copyLink sets copied/copyFailed from copyTextToClipboard's boolean result", () => {
  const s = src("components/dashboard/kitchen/CourierManagementClient.tsx");
  const idx = s.indexOf("async function copyLink");
  const block = s.slice(idx, idx + 250);
  assert.match(block, /const succeeded = await copyTextToClipboard\(oneTimeLink\.url\);/);
  assert.match(block, /setCopied\(succeeded\)/);
  assert.match(block, /setCopyFailed\(!succeeded\)/);
});
