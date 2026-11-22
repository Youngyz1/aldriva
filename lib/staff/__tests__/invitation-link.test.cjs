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

const { isInviteToken, buildInviteAcceptPath, buildInviteLoginPath, parseInviteFragment } = require(path.resolve(__dirname, "../invitation-link.ts"));
const { safeRedirectPath } = require(path.resolve(__dirname, "../../auth/safe-redirect.ts"));

const TOKEN = "123e4567-e89b-12d3-a456-426614174000";

describe("invitation links", () => {
  test("isInviteToken accepts a uuid and rejects everything else", () => {
    assert.equal(isInviteToken(TOKEN), true);
    assert.equal(isInviteToken(TOKEN.toUpperCase()), true);
    assert.equal(isInviteToken("not-a-uuid"), false);
    assert.equal(isInviteToken(""), false);
    assert.equal(isInviteToken(null), false);
    assert.equal(isInviteToken(TOKEN + "&x=1"), false);
  });
  test("accept path puts the token in the fragment, never the query", () => {
    const p = buildInviteAcceptPath(TOKEN);
    assert.equal(p, "/staff/accept#" + TOKEN);
    assert.equal(p.includes("?"), false);
    assert.equal(buildInviteAcceptPath("nope"), null);
    assert.equal(buildInviteAcceptPath(undefined), null);
  });
  test("login path carries no token and passes the login redirect validator", () => {
    const login = buildInviteLoginPath();
    assert.equal(login, "/login?redirect=%2Fstaff%2Faccept");
    assert.equal(login.includes(TOKEN), false);
    const redirect = new URLSearchParams(login.split("?")[1]).get("redirect");
    assert.equal(redirect, "/staff/accept");
    assert.equal(safeRedirectPath(redirect, "/"), redirect);
  });
  test("parseInviteFragment reads #uuid and bare uuid", () => {
    assert.equal(parseInviteFragment("#" + TOKEN), TOKEN);
    assert.equal(parseInviteFragment(TOKEN), TOKEN);
  });
  test("parseInviteFragment rejects empty, malformed, extra and non-string input", () => {
    assert.equal(parseInviteFragment(""), null);
    assert.equal(parseInviteFragment("#"), null);
    assert.equal(parseInviteFragment("#bad"), null);
    assert.equal(parseInviteFragment("#" + TOKEN + "&x=1"), null);
    assert.equal(parseInviteFragment(null), null);
  });
});
