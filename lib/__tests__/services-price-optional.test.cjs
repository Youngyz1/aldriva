/**
 * lib/__tests__/services-price-optional.test.cjs
 *
 * Source-level tests for Phase 2: services catalogue on public sites,
 * optional service price, double-submit guard, and services_embed in
 * service-pro template (new sites only).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

require.extensions[".ts"] = function compileTs(module, filename) {
  const raw = fs.readFileSync(filename, "utf8").replace(/^import\s+["']server-only["'];?\s*/m, "");
  const output = ts.transpileModule(raw, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    request = path.join(ROOT, request.slice(2));
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// ── Tests ───────────────────────────────────────────────────────────────────

test("services price nullable: createService insert uses NULL for missing price", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/actions/services.ts"), "utf8");
  assert.ok(src.includes("price: input.price === null || input.price === undefined ? null : Number(input.price)"),
    "createService must store NULL price when not provided");
});

test("services price nullable: updateService uses NULL for missing price", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/actions/services.ts"), "utf8");
  assert.ok(src.includes("updates.price = input.price === null || input.price === undefined ? null : Number(input.price)"),
    "updateService must store NULL price when cleared");
});

test("services price nullable: resolveServicesEmbed returns null price (not 0)", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/website-embeds.ts"), "utf8");
  assert.ok(src.includes("price: item.price === null || item.price === undefined ? null : Number(item.price)"),
    "resolveServicesEmbed must preserve null price instead of converting to 0");
});

test("services price nullable: public renderer hides price when empty (null or 0), never \"Price on request\"", () => {
  const src = fs.readFileSync(path.join(ROOT, "components/site/blocks/BlockRenderer.tsx"), "utf8");
  assert.ok(!src.includes('svc.price === null ? "Price on request"'),
    "BlockRenderer must not render \"Price on request\" for empty price");
  assert.ok(src.includes("isPriceEmpty(svc.price)"),
    "BlockRenderer must hide empty price via isPriceEmpty (null or 0)");
});

test("services price nullable: dashboard list shows Price on request for null", () => {
  const src = fs.readFileSync(path.join(ROOT, "components/dashboard/services/ServicesManager.tsx"), "utf8");
  assert.ok(src.includes('s.price === null ? "Price on request" :'),
    "ServicesManager must show \"Price on request\" for null price");
});

test("ServiceForm double-submit guard: early return when saving", () => {
  const src = fs.readFileSync(path.join(ROOT, "components/dashboard/services/ServiceForm.tsx"), "utf8");
  assert.ok(src.includes("if (submittingRef.current) return;"),
    "ServiceForm handleSubmit must guard against repeat submits while saving");
});

test("ServiceForm price field optional: no asterisk, no required", () => {
  const src = fs.readFileSync(path.join(ROOT, "components/dashboard/services/ServiceForm.tsx"), "utf8");
  assert.ok(src.includes('<Label htmlFor="price">Price</Label>'),
    "ServiceForm price label must not have asterisk");
  assert.ok(src.includes('placeholder="Optional"'),
    "ServiceForm price input must have Optional placeholder");
  assert.ok(!src.includes('<Input id="price" type="number" step="0.01" min={0} max={999999.99} value={price} onChange={(e) => setPrice(e.target.value)} required />'),
    "ServiceForm price input must not be required");
});

test("ServiceForm payload sends null for empty price", () => {
  const src = fs.readFileSync(path.join(ROOT, "components/dashboard/services/ServiceForm.tsx"), "utf8");
  assert.ok(src.includes('price: price === "" || price === null || price === undefined ? null : Number(price)'),
    "ServiceForm payload must send null for empty price");
});

test("services_embed in service-pro template (new sites only)", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/website-template-registry.ts"), "utf8");
  // Find service-pro template block
  const serviceProStart = src.indexOf('id: "service-pro"');
  const serviceProEnd = src.indexOf('id: "creative-portfolio"', serviceProStart);
  const serviceProSection = src.slice(serviceProStart, serviceProEnd);
  assert.ok(serviceProSection.includes('{ type: "services_embed", heading: "Our Services", limit: 6, layout: "grid" }'),
    "service-pro template must include services_embed block");
  assert.ok(serviceProSection.includes('heading: "Professional Services"'),
    "Must be service-pro template (not another template)");
});

test("services_embed NOT added to other templates", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/website-template-registry.ts"), "utf8");
  // Other templates should not have services_embed added
  const creativeStart = src.indexOf('id: "creative-portfolio"');
  const creativeEnd = src.indexOf('id: "organization-impact"', creativeStart);
  const creativeSection = src.slice(creativeStart, creativeEnd);
  assert.ok(!creativeSection.includes('services_embed'),
    "creative-portfolio template must not include services_embed");
});

test("migration 219 files exist", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "db/migration_219_services_price_nullable.sql")),
    "db migration 219 forward file must exist");
  assert.ok(fs.existsSync(path.join(ROOT, "db/migration_219_services_price_nullable_rollback.sql")),
    "db migration 219 rollback file must exist");
  assert.ok(fs.existsSync(path.join(ROOT, "supabase/migrations/20261105000003_migration_219_services_price_nullable.sql")),
    "supabase migration 219 mirror must exist");
});

test("migration 219: forward alters price to drop NOT NULL", () => {
  const sql = fs.readFileSync(path.join(ROOT, "db/migration_219_services_price_nullable.sql"), "utf8");
  assert.ok(sql.includes("ALTER TABLE public.services"),
    "migration 219 must ALTER TABLE public.services");
  assert.ok(sql.includes("ALTER COLUMN price DROP NOT NULL"),
    "migration 219 must DROP NOT NULL on price");
  assert.ok(!sql.includes("CREATE INDEX"), "migration 219 must not create any index");
  assert.ok(!sql.includes("216"), "migration 219 must not reference migration 216");
});

test("migration 219: rollback restores NOT NULL", () => {
  const sql = fs.readFileSync(path.join(ROOT, "db/migration_219_services_price_nullable_rollback.sql"), "utf8");
  assert.ok(sql.includes("ALTER TABLE public.services"),
    "rollback must ALTER TABLE public.services");
  assert.ok(sql.includes("ALTER COLUMN price SET NOT NULL"),
    "rollback must SET NOT NULL on price");
});

// ── Tests for Phase 3 fixes (items 1-3) ─────────────────────────────────────

test("services_embed is in BLOCK_CATALOG", () => {
  const src = fs.readFileSync(path.join(ROOT, "components/dashboard/website/builder/defaultBlocks.ts"), "utf8");
  assert.ok(src.includes('type: "services_embed"'),
    "defaultBlocks.ts must contain services_embed entry");
  assert.ok(src.includes('label: "Services"'),
    "services_embed must have label \"Services\"");
  assert.ok(src.includes('category: "content"'),
    "services_embed must have category \"content\"");
  assert.ok(src.includes('iconName: "Calendar"'),
    "services_embed must have iconName \"Calendar\"");
  assert.ok(src.includes('heading: "Our Services"'),
    "services_embed createDefault must set heading \"Our Services\"");
  assert.ok(src.includes("limit: 6"),
    "services_embed createDefault must set limit 6");
  assert.ok(src.includes('layout: "grid"'),
    "services_embed createDefault must set layout \"grid\"");
});

test("services_embed is directly before about in service-pro template", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/website-template-registry.ts"), "utf8");
  const serviceProStart = src.indexOf('id: "service-pro"');
  const serviceProEnd = src.indexOf('id: "creative-portfolio"', serviceProStart);
  const serviceProSection = src.slice(serviceProStart, serviceProEnd);
  const embedIdx = serviceProSection.indexOf('{ type: "services_embed"');
  const aboutIdx = serviceProSection.indexOf('{ type: "about"');
  assert.ok(embedIdx !== -1, "service-pro must include services_embed");
  assert.ok(aboutIdx !== -1, "service-pro must include about block");
  assert.ok(embedIdx < aboutIdx, "services_embed must be before about block");
  // services_embed must be directly before about (no other block type between them)
  const between = serviceProSection.slice(embedIdx, aboutIdx);
  const otherBlockTypes = between.match(/\{ type: "(?!services_embed")[^"]+"/g);
  assert.equal(otherBlockTypes, null, "no other block type should be between services_embed and about");
});

test("services_embed is NOT at the end after faq in service-pro template", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/website-template-registry.ts"), "utf8");
  const serviceProStart = src.indexOf('id: "service-pro"');
  const serviceProEnd = src.indexOf('id: "creative-portfolio"', serviceProStart);
  const serviceProSection = src.slice(serviceProStart, serviceProEnd);
  const faqIdx = serviceProSection.indexOf('{ type: "faq"');
  const embedIdx = serviceProSection.indexOf('{ type: "services_embed"');
  assert.ok(embedIdx < faqIdx, "services_embed must NOT be after faq block");
});

test("ServiceForm double-submit guard uses useRef flag", () => {
  const src = fs.readFileSync(path.join(ROOT, "components/dashboard/services/ServiceForm.tsx"), "utf8");
  assert.ok(src.includes("useRef"), "ServiceForm must import useRef");
  assert.ok(src.includes("submittingRef"), "ServiceForm must use a submittingRef flag");
  assert.ok(src.includes("submittingRef.current = true"),
    "ServiceForm must set submittingRef.current = true synchronously");
  assert.ok(src.includes("finally"), "ServiceForm must clear the flag in a finally block");
  assert.ok(src.includes("submittingRef.current = false"),
    "ServiceForm must reset submittingRef.current to false");
});

test("ServiceForm button stays disabled while saving", () => {
  const src = fs.readFileSync(path.join(ROOT, "components/dashboard/services/ServiceForm.tsx"), "utf8");
  assert.ok(src.includes("disabled={saving}"),
    "ServiceForm submit button must be disabled while saving");
});
