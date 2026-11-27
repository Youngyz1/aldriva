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

const { composeInviteLink } = require(path.resolve(__dirname, "../invitation-compose.ts"));

const TOKEN = "123e4567-e89b-12d3-a456-426614174000";

describe("composeInviteLink", () => {
  test("joins origin and fragment path, tolerating a trailing slash", () => {
    assert.equal(composeInviteLink("https://aldriva.com", TOKEN), "https://aldriva.com/staff/accept#" + TOKEN);
    assert.equal(composeInviteLink("https://aldriva.com/", TOKEN), "https://aldriva.com/staff/accept#" + TOKEN);
    assert.equal(composeInviteLink("http://localhost:3000", TOKEN), "http://localhost:3000/staff/accept#" + TOKEN);
  });
  test("keeps only the origin of the base URL", () => {
    assert.equal(composeInviteLink("https://aldriva.com/some/path?x=1", TOKEN), "https://aldriva.com/staff/accept#" + TOKEN);
  });
  test("never puts the token in the query string", () => {
    assert.equal(composeInviteLink("https://aldriva.com", TOKEN).includes("?"), false);
  });
  test("rejects non-http(s), malformed and non-string bases", () => {
    assert.equal(composeInviteLink("javascript:alert(1)", TOKEN), null);
    assert.equal(composeInviteLink("ftp://aldriva.com", TOKEN), null);
    assert.equal(composeInviteLink("not a url", TOKEN), null);
    assert.equal(composeInviteLink(null, TOKEN), null);
  });
  test("rejects a malformed token", () => {
    assert.equal(composeInviteLink("https://aldriva.com", "nope"), null);
    assert.equal(composeInviteLink("https://aldriva.com", undefined), null);
  });
});
