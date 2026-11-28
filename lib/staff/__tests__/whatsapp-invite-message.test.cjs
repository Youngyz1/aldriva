/**
 * lib/staff/__tests__/whatsapp-invite-message.test.cjs
 *
 * Pure unit tests for buildInviteWhatsAppUrl: no I/O, no network, no secrets.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const originalResolveFilename = Module._resolveFilename;

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { buildInviteWhatsAppUrl, ACCOUNTLESS_BROWSER_WARNING } = require("@/lib/staff/whatsapp-invite-message.ts");

test("builds a wa.me URL with URL-encoded message for a valid E.164 number", () => {
  const url = buildInviteWhatsAppUrl({
    phone: "+15551234567",
    eventTitle: "Summer Gala",
    acceptUrl: "https://aldriva.com/events/team/accept?token=abc123",
    roleLabel: "Ticket Scanner",
  });

  assert.ok(url, "url should be built");
  assert.ok(url.startsWith("https://wa.me/15551234567?text="));
  const encodedText = url.split("?text=")[1];
  const decoded = decodeURIComponent(encodedText);
  assert.ok(decoded.includes("Summer Gala"));
  assert.ok(decoded.includes("Ticket Scanner"));
  assert.ok(decoded.includes("https://aldriva.com/events/team/accept?token=abc123"));
  // Message must be properly encoded: no raw spaces or & in the query string itself.
  assert.ok(!encodedText.includes(" "));
});

test("omits the role when not provided (guest invitations)", () => {
  const url = buildInviteWhatsAppUrl({
    phone: "+15551234567",
    eventTitle: "Summer Gala",
    acceptUrl: "https://aldriva.com/invitation/tok",
  });
  const decoded = decodeURIComponent(url.split("?text=")[1]);
  assert.ok(decoded.includes("Summer Gala"));
  assert.ok(!decoded.includes("undefined"));
});

test("returns null when no phone is provided", () => {
  const url = buildInviteWhatsAppUrl({
    phone: null,
    eventTitle: "Summer Gala",
    acceptUrl: "https://aldriva.com/x",
  });
  assert.equal(url, null);
});

test("returns null for a malformed phone number", () => {
  for (const bad of ["555-1234", "not-a-phone", "123", "+0123456789"]) {
    const url = buildInviteWhatsAppUrl({
      phone: bad,
      eventTitle: "Summer Gala",
      acceptUrl: "https://aldriva.com/x",
    });
    assert.equal(url, null, `expected null for ${bad}`);
  }
});

test("strips the leading + before building the wa.me path", () => {
  const url = buildInviteWhatsAppUrl({
    phone: "+447911123456",
    eventTitle: "Launch",
    acceptUrl: "https://aldriva.com/x",
  });
  assert.ok(url.startsWith("https://wa.me/447911123456?text="));
  assert.ok(!url.includes("wa.me/+"));
});

test("an account invitation (isAccountless omitted/false) never gets the browser warning", () => {
  const url = buildInviteWhatsAppUrl({
    phone: "+15551234567",
    eventTitle: "Summer Gala",
    acceptUrl: "https://aldriva.com/events/team/accept?token=abc123",
    roleLabel: "Event Manager",
  });
  const decoded = decodeURIComponent(url.split("?text=")[1]);
  assert.ok(!decoded.includes(ACCOUNTLESS_BROWSER_WARNING.en));
  assert.ok(!decoded.includes(ACCOUNTLESS_BROWSER_WARNING.fr));
});

test("an account-less invitation appends the EN browser warning by default", () => {
  const url = buildInviteWhatsAppUrl({
    phone: "+15551234567",
    eventTitle: "Summer Gala",
    acceptUrl: "https://aldriva.com/events/team/redeem#token=abc123",
    roleLabel: "Ticket Scanner",
    isAccountless: true,
  });
  const decoded = decodeURIComponent(url.split("?text=")[1]);
  assert.ok(decoded.includes(ACCOUNTLESS_BROWSER_WARNING.en));
  assert.ok(decoded.endsWith(ACCOUNTLESS_BROWSER_WARNING.en));
});

test("an account-less invitation appends the FR browser warning when locale is fr", () => {
  const url = buildInviteWhatsAppUrl({
    phone: "+15551234567",
    eventTitle: "Summer Gala",
    acceptUrl: "https://aldriva.com/events/team/redeem#token=abc123",
    roleLabel: "Ticket Scanner",
    isAccountless: true,
    locale: "fr",
  });
  const decoded = decodeURIComponent(url.split("?text=")[1]);
  assert.ok(decoded.includes(ACCOUNTLESS_BROWSER_WARNING.fr));
  assert.ok(!decoded.includes(ACCOUNTLESS_BROWSER_WARNING.en));
});
