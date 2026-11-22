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

const { isInviteToken, buildInviteAcceptPath, buildInviteLoginPath } = require(path.resolve(__dirname, "../invitation-link.ts"));
const { safeRedirectPath } = require(path.resolve(__dirname, "../../auth/safe-redirect.ts"));

const TOKEN = "123e4567-e89b-12d3-a456-426614174000";

describe("invitation links", () => {
  test("isInviteToken accepts a uuid and rejects everything else", () => {
    assert.equal(isInviteToken(TOKEN), true);
    assert.equal(isInviteToken(TOKEN.toUpperCase()), true);
    assert.equal(isInviteToken("not-a-uuid"), false);
    assert.equal(isInviteToken(""), false);
    assert.equal(isInviteToken(null), false);
    assert.equal(isInviteToken(42), false);
    assert.equal(isInviteToken(TOKEN + "&x=1"), false);
  });
  test("buildInviteAcceptPath builds the accept path", () => {
    assert.equal(buildInviteAcceptPath(TOKEN), "/staff/accept?token=" + TOKEN);
  });
  test("buildInviteAcceptPath returns null for a bad token", () => {
    assert.equal(buildInviteAcceptPath("nope"), null);
    assert.equal(buildInviteAcceptPath(undefined), null);
  });
  test("buildInviteLoginPath encodes the whole accept path", () => {
    assert.equal(
      buildInviteLoginPath(TOKEN),
      "/login?redirect=%2Fstaff%2Faccept%3Ftoken%3D" + TOKEN
    );
    assert.equal(buildInviteLoginPath("nope"), null);
  });
  test("login path round-trips and passes the login redirect validator", () => {
    const login = buildInviteLoginPath(TOKEN);
    const redirect = new URLSearchParams(login.split("?")[1]).get("redirect");
    assert.equal(redirect, "/staff/accept?token=" + TOKEN);
    assert.equal(safeRedirectPath(redirect, "/"), redirect);
  });
});
