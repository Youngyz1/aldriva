const { describe, test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(ROOT, request.slice(2)),
      parent,
      isMain,
      options
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

if (!require.extensions[".ts"]) {
  require.extensions[".ts"] = function compileTs(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
      fileName: filename,
    }).outputText;
    module._compile(output, filename);
  };
}

const ORIGINAL_ENV = { ...process.env };

function loadGetSiteUrl() {
  delete require.cache[require.resolve("../site-url.ts")];
  return require("../site-url.ts").getSiteUrl;
}

describe("getSiteUrl resolution and environment variable hierarchy", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_BASE_URL;
    delete process.env.SITE_URL;
    delete process.env.APP_URL;
    delete process.env.VERCEL_BRANCH_URL;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  test("prefers NEXT_PUBLIC_SITE_URL when set and strips trailing slash", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://custom-staging.aldriva.com/";
    const getSiteUrl = loadGetSiteUrl();
    assert.equal(getSiteUrl(), "https://custom-staging.aldriva.com");
  });

  test("uses NEXT_PUBLIC_APP_URL when SITE_URL is not set", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app-staging.aldriva.com";
    const getSiteUrl = loadGetSiteUrl();
    assert.equal(getSiteUrl(), "https://app-staging.aldriva.com");
  });

  test("uses server-side SITE_URL / APP_URL when NEXT_PUBLIC vars are absent", () => {
    process.env.SITE_URL = "https://server-env-staging.aldriva.com";
    const getSiteUrl = loadGetSiteUrl();
    assert.equal(getSiteUrl(), "https://server-env-staging.aldriva.com");
  });

  test("uses Vercel preview branch URL when VERCEL_ENV is preview", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_BRANCH_URL = "event-platform-git-staging-preview.vercel.app";
    const getSiteUrl = loadGetSiteUrl();
    assert.equal(getSiteUrl(), "https://event-platform-git-staging-preview.vercel.app");
  });

  test("falls back to localhost:3000 in development when unconfigured", () => {
    process.env.NODE_ENV = "development";
    const getSiteUrl = loadGetSiteUrl();
    assert.equal(getSiteUrl(), "http://localhost:3000");
  });

  test("falls back to BRAND.website in production when no env is configured", () => {
    process.env.NODE_ENV = "production";
    const getSiteUrl = loadGetSiteUrl();
    assert.equal(getSiteUrl(), "https://aldriva.com");
  });
});
