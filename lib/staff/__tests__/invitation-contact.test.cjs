const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const {
  normalizeInviteEmail,
  normalizeInvitePhone,
  validateInviteContact,
} = require(path.resolve(__dirname, "../invitation-contact.ts"));

describe("normalizeInviteEmail", () => {
  test("trims and lower-cases", () => {
    assert.equal(normalizeInviteEmail("  Ada@Example.COM "), "ada@example.com");
  });
  test("empty, whitespace, null and undefined become null", () => {
    assert.equal(normalizeInviteEmail(""), null);
    assert.equal(normalizeInviteEmail("   "), null);
    assert.equal(normalizeInviteEmail(null), null);
    assert.equal(normalizeInviteEmail(undefined), null);
  });
});

describe("normalizeInvitePhone", () => {
  test("keeps digits only, dropping +, spaces, dashes and brackets", () => {
    assert.equal(normalizeInvitePhone("+234 (090) 875-423"), "234090875423");
  });
  test("no digits becomes null", () => {
    assert.equal(normalizeInvitePhone("abc"), null);
    assert.equal(normalizeInvitePhone(null), null);
  });
});

describe("validateInviteContact", () => {
  test("email only, default channel is link", () => {
    const r = validateInviteContact({ email: "A@b.co" });
    assert.equal(r.ok, true);
    assert.deepEqual(r.value, { email: "a@b.co", phone: null, channel: "link" });
  });
  test("phone only is normalised to digits", () => {
    const r = validateInviteContact({ phone: "+234 090 875 423", channel: "whatsapp" });
    assert.equal(r.ok, true);
    assert.equal(r.value.phone, "234090875423");
  });
  test("neither contact is refused", () => {
    const r = validateInviteContact({});
    assert.equal(r.ok, false);
    assert.equal(r.error.code, "invite_contact_required");
  });
  test("malformed email is refused", () => {
    const r = validateInviteContact({ email: "not-an-email" });
    assert.equal(r.ok, false);
    assert.equal(r.error.code, "invite_email_invalid");
  });
  test("phone length boundaries: 6 refused, 7 and 15 accepted, 16 refused", () => {
    assert.equal(validateInviteContact({ phone: "123456" }).ok, false);
    assert.equal(validateInviteContact({ phone: "1234567" }).ok, true);
    assert.equal(validateInviteContact({ phone: "123456789012345" }).ok, true);
    const r = validateInviteContact({ phone: "1234567890123456" });
    assert.equal(r.ok, false);
    assert.equal(r.error.code, "invite_phone_invalid");
  });
  test("unknown channel is refused", () => {
    const r = validateInviteContact({ email: "a@b.co", channel: "pigeon" });
    assert.equal(r.ok, false);
    assert.equal(r.error.code, "invite_channel_invalid");
  });
  test("email channel needs an email; sms and whatsapp need a phone", () => {
    assert.equal(validateInviteContact({ phone: "1234567", channel: "email" }).ok, false);
    assert.equal(validateInviteContact({ email: "a@b.co", channel: "sms" }).ok, false);
    assert.equal(validateInviteContact({ email: "a@b.co", channel: "whatsapp" }).ok, false);
  });
  test("link channel accepts either contact", () => {
    assert.equal(validateInviteContact({ email: "a@b.co", channel: "link" }).ok, true);
    assert.equal(validateInviteContact({ phone: "1234567", channel: "link" }).ok, true);
  });
});
