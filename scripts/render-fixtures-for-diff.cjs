/**
 * Fixture-render script for Step 6 isolation diff.
 *
 * Resolves template content for identical fixtures across the non-Savannah
 * templates (Table & Flame, Food Order, Store, DriveLine) plus Savannah for
 * reference. Outputs serialized block data and theme style as deterministic
 * strings for diffing between the main repo and the a634f04 worktree.
 *
 * Usage: node scripts/render-fixtures-for-diff.cjs
 */

const path = require("node:path");
const ROOT = process.env.FIXTURE_ROOT || path.resolve(__dirname, "..");

require.extensions[".ts"] = function compileTs(module, filename) {
  const fs = require("node:fs");
  const source = fs.readFileSync(filename, "utf8");
  const output = require("typescript").transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: require("typescript").ModuleKind.CommonJS,
      target: require("typescript").ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

require.extensions[".tsx"] = function compileTsx(module, filename) {
  const fs = require("node:fs");
  const source = fs.readFileSync(filename, "utf8");
  const output = require("typescript").transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: require("typescript").JsxEmit.ReactJSX,
      module: require("typescript").ModuleKind.CommonJS,
      target: require("typescript").ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const originalResolveFilename = require("node:module")._resolveFilename;
require("node:module")._resolveFilename = function resolveAliases(request, parent, isMain, options) {
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

const fontStub = (variable) => () => ({ variable });
const originalModuleLoad = require("node:module")._load;
require("node:module")._load = function mockNextFontGoogle(request, parent, isMain) {
  if (request === "next/font/google") {
    return {
      Arimo: fontStub("font-arimo-test"),
      Fraunces: fontStub("font-fraunces-test"),
      Geist: fontStub("font-geist-test"),
      Geist_Mono: fontStub("font-geist-mono-test"),
    };
  }
  return originalModuleLoad.call(this, request, parent, isMain);
};

process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key";

const templateModule = require("@/lib/website-template-v2");
const {
  RESTAURANT_TABLE_FLAME,
  FOOD_ORDER_TEMPLATE,
  STORE_TEMPLATE,
  RENTAL_DRIVELINE,
} = templateModule;
let RESTAURANT_SAVANNAH;
try {
  RESTAURANT_SAVANNAH = templateModule.RESTAURANT_SAVANNAH;
} catch {}
const { resolveTemplateContent } = require("@/lib/website-template-resolver");
const { v2ThemeStyle } = require("@/lib/website-v2-theme");
const { normalizeCurrencyCode } = require("@/lib/website-blocks");

const templates = [
  RESTAURANT_TABLE_FLAME,
  FOOD_ORDER_TEMPLATE,
  STORE_TEMPLATE,
  RENTAL_DRIVELINE,
].filter(Boolean);

if (RESTAURANT_SAVANNAH) templates.push(RESTAURANT_SAVANNAH);

const content = {
  business_name: "Fixture Business",
  hero_headline: "A calm plate",
  hero_subtext: "Serene hospitality.",
  hero_image: "/uploads/hero.png",
  primary_cta_label: "Order Now",
  logo_url: "/uploads/logo.png",
  address: "123 Main Street, City",
  phone: "+1 555-0100",
  email: "hello@example.com",
  highlights: [
    { title: "Fire Cooking", description: "Wood fired grill", image: "/uploads/fire.jpg" },
    { title: "Natural Cellar", description: "Low intervention wines" },
  ],
  template_extras: {},
};

function serializeBlock(block) {
  // Strip unstable fields (ids, source map refs) for deterministic diffing
  const s = { ...block };
  delete s.id;
  return s;
}

function renderTemplateData(template) {
  const resolved = resolveTemplateContent(template.id, template.version, content, {
    includeSamples: false,
    business: {
      offerings: ["online_ordering", "table_reservations"],
      capabilities: ["ONLINE_ORDERING", "RESERVATIONS"],
    },
    reservationsApproved: true,
    viewMenuLabel: "View menu",
  });

  const themeStyle = v2ThemeStyle(template, {});

  const parts = [];
  parts.push(`THEME:${template.id}:${JSON.stringify(themeStyle)}`);

  for (const page of resolved.pages) {
    for (const block of page.blocks) {
      parts.push(`BLOCK:${template.id}:${page.slug}:${JSON.stringify(serializeBlock(block))}`);
    }
  }

  // Also capture storefrontFeatures
  parts.push(`FEATURES:${template.id}:${JSON.stringify(resolved.storefrontFeatures)}`);

  return parts.join("\n");
}

const output = [];
for (const template of templates) {
  output.push(`===TEMPLATE:${template.id}===`);
  output.push(renderTemplateData(template));
}

console.log(output.join("\n"));
