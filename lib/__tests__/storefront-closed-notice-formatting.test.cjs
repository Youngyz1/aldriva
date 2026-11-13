/**
 * lib/__tests__/storefront-closed-labels-formatting.test.cjs
 *
 * Regression guard for the website-builder crash:
 *   FORMATTING_ERROR: The intl string context variable "time" was not provided
 *   to the string "We're closed, opens at {time}".
 *
 * The two closed-business Storefront messages carry a {time} ICU placeholder
 * that is filled in per render. BlockRenderer built them with a bare
 * `t("closedOpensAt")`, so next-intl's development formatter (which really
 * compiles ICU messages) raised MISSING_VALUE and surfaced it as
 * FORMATTING_ERROR. `@/lib/storefront-closed-notice` now supplies the
 * placeholder value, so the template survives and StorefrontBrowse substitutes
 * the real time.
 *
 * These tests run the labels through the real next-intl formatter used by
 * `next dev` (the development build of use-intl / intl-messageformat) for both
 * English and French.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const MESSAGES_DIR = path.join(ROOT, "messages");

// Transpile the .ts helper under test.
require.extensions[".ts"] = function compileTs(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { buildClosedNoticeLabels, fillClosedNoticeTime, CLOSED_NOTICE_TIME_PLACEHOLDER } = require(
  path.join(ROOT, "lib/storefront-closed-notice.ts")
);

const MESSAGES = {
  en: JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, "en.json"), "utf8")),
  fr: JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, "fr.json"), "utf8")),
};

// next-intl 4 delegates ICU formatting to use-intl's `format-message` module.
// `next dev` loads the development build (compiles ICU, raises MISSING_VALUE);
// production loads the precompiled build (returns rule-free strings verbatim).
const DEV_FORMAT_MESSAGE = path.join(
  ROOT,
  "node_modules/use-intl/dist/esm/development/format-message/index.js"
);
const PROD_FORMAT_MESSAGE = path.join(
  ROOT,
  "node_modules/use-intl/dist/esm/production/format-message/index.js"
);
const DEV_CORE = path.join(ROOT, "node_modules/use-intl/dist/esm/development/core.js");

let formattersPromise;
function loadFormatters() {
  if (!formattersPromise) {
    assert.ok(fs.existsSync(DEV_FORMAT_MESSAGE), "use-intl development formatter is installed");
    assert.ok(fs.existsSync(DEV_CORE), "use-intl development core is installed");
    formattersPromise = (async () => {
      const dev = await import(pathToFileURL(DEV_FORMAT_MESSAGE).href);
      const prod = await import(pathToFileURL(PROD_FORMAT_MESSAGE).href);
      const core = await import(pathToFileURL(DEV_CORE).href);
      return { devFormat: dev.default, prodFormat: prod.default, createFormatter: core.createFormatter };
    })();
  }
  return formattersPromise;
}

function formatOptions(createFormatter, locale) {
  return {
    cache: { message: { create: () => ({ get: () => undefined, set() {} }) } },
    formatters: createFormatter({ locale }),
    globalFormats: undefined,
    formats: undefined,
    locale,
    timeZone: "Africa/Abidjan",
  };
}

/** Mirrors next-intl's `t`: resolve the Storefront message, then format it. */
function makeTranslator(formatMessage, createFormatter, locale) {
  const messages = MESSAGES[locale];
  return (key, values) =>
    formatMessage(
      `Storefront.${key}`,
      messages.Storefront[key],
      values,
      formatOptions(createFormatter, locale)
    );
}

for (const locale of ["en", "fr"]) {
  test(`${locale}: closed notices need a time value (the FORMATTING_ERROR the builder hit)`, async () => {
    const { devFormat, createFormatter } = await loadFormatters();
    const t = makeTranslator(devFormat, createFormatter, locale);
    const raw = MESSAGES[locale].Storefront;

    for (const key of ["orderWhileClosed", "closedOpensAt"]) {
      assert.match(raw[key], /\{time\}/, `${locale} ${key} keeps the {time} placeholder`);
      assert.throws(
        () => t(key),
        (error) => {
          // intl-messageformat's MISSING_VALUE; next-intl reports it as FORMATTING_ERROR.
          assert.match(String(error.message), /time/);
          assert.match(String(error.message), /not provided/);
          return true;
        },
        `${locale} ${key} must fail when time is omitted`
      );
    }
  });

  test(`${locale}: buildClosedNoticeLabels renders through the real formatter without FORMATTING_ERROR`, async () => {
    const { devFormat, createFormatter } = await loadFormatters();
    const t = makeTranslator(devFormat, createFormatter, locale);
    const raw = MESSAGES[locale].Storefront;

    const labels = buildClosedNoticeLabels(t);

    assert.equal(labels.closedOpensAt, raw.closedOpensAt, "template survives ICU formatting");
    assert.equal(labels.orderWhileClosed, raw.orderWhileClosed, "template survives ICU formatting");
    assert.equal(CLOSED_NOTICE_TIME_PLACEHOLDER, "{time}");

    // StorefrontBrowse's substitution produces the final customer copy.
    assert.equal(
      fillClosedNoticeTime(labels.closedOpensAt, locale === "fr" ? "lun. 09:00" : "Mon 09:00"),
      raw.closedOpensAt.replace("{time}", locale === "fr" ? "lun. 09:00" : "Mon 09:00")
    );
    assert.doesNotMatch(fillClosedNoticeTime(labels.orderWhileClosed, "Mon 09:00"), /\{time\}/);
  });
}

test("the precompiled production formatter cannot catch this: it leaves {time} untouched", async () => {
  const { prodFormat, createFormatter } = await loadFormatters();
  const t = makeTranslator(prodFormat, createFormatter, "en");
  assert.equal(t("closedOpensAt"), MESSAGES.en.Storefront.closedOpensAt);
});

test("BlockRenderer builds both closed notices through the shared helper, never bare", () => {
  const source = fs.readFileSync(path.join(ROOT, "components/site/blocks/BlockRenderer.tsx"), "utf8");
  assert.match(
    source,
    /import \{ buildClosedNoticeLabels \} from "@\/lib\/storefront-closed-notice";/
  );
  assert.match(source, /\.\.\.buildClosedNoticeLabels\(t\),/);
  assert.doesNotMatch(source, /t\("orderWhileClosed"\)/);
  assert.doesNotMatch(source, /t\("closedOpensAt"\)/);
});

test("no message with an ICU placeholder is translated without values anywhere in app/components/lib", async () => {
  const placeholderByKey = new Map();
  (function collectKeys(node) {
    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === "object") collectKeys(value);
      else if (typeof value === "string" && /\{[a-zA-Z0-9_]+\}/.test(value)) {
        placeholderByKey.set(key, value);
      }
    }
  })(MESSAGES.en);
  assert.ok(placeholderByKey.size > 0, "the English catalog still has placeholder messages");

  const files = [];
  for (const root of ["app", "components", "lib"]) {
    (function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const target = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (["node_modules", "__tests__", ".next"].includes(entry.name)) continue;
          walk(target);
        } else if (/\.(tsx|ts)$/.test(entry.name)) {
          files.push(target);
        }
      }
    })(path.join(ROOT, root));
  }

  const sources = await Promise.all(
    files.map(async (file) => ({
      relative: path.relative(ROOT, file).split(path.sep).join("/"),
      source: await fs.promises.readFile(file, "utf8"),
    }))
  );

  const bare = [];
  for (const { relative, source } of sources) {
    const call = /\b(t|tr|translator)\(\s*"([\w.]+)"/g;
    let match;
    while ((match = call.exec(source))) {
      const key = match[2];
      if (!placeholderByKey.has(key)) continue;
      const next = source.slice(match.index + match[0].length).trimStart()[0];
      if (next !== ",") {
        const line = source.slice(0, match.index).split("\n").length;
        bare.push(`${relative}:${line} t("${key}") -> ${placeholderByKey.get(key)}`);
      }
    }
  }
  assert.deepEqual(bare, [], `placeholder messages must be called with values:\n${bare.join("\n")}`);

  // French carries the same placeholders, so the guard covers both locales.
  const frPlaceholderKeys = new Map();
  (function collectFrench(node) {
    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === "object") collectFrench(value);
      else if (typeof value === "string" && /\{[a-zA-Z0-9_]+\}/.test(value)) {
        frPlaceholderKeys.set(key, value);
      }
    }
  })(MESSAGES.fr);
  for (const key of placeholderByKey.keys()) {
    assert.ok(frPlaceholderKeys.has(key), `fr catalog translates ${key} with a placeholder`);
  }
});
