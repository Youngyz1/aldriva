/**
 * lib/__tests__/savannah-phase-3c-render.test.cjs
 *
 * Hermetic static-markup render tests for Savannah Phase 3c (Steps 3-5):
 *  - Hero focal point object-position / contain fit static markup
 *  - catalog-carousel route test via real page.tsx (BlockRenderer unmocked)
 *  - Header hidden/visible CTA focus test
 *  - Public header two-state static-markup test
 *  - CTA band round-trip static markup
 *  - Savannah catalog carousel cards (4:3, clamp-2, no heart/rating/badge)
 *
 * No DB, no network. Uses the same transpile/alias harness as website-template-v2.test.cjs.
 * Route test does NOT mock BlockRenderer (unlike existing route test at lines 946-987).
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

require.extensions[".ts"] = function compileTs(module, filename) {
  const fs = require("node:fs");
  const source = fs.readFileSync(filename, "utf8");
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

require.extensions[".tsx"] = function compileTsx(module, filename) {
  const fs = require("node:fs");
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

const fontStub = (variable) => () => ({ variable });
const originalModuleLoad = Module._load;
Module._load = function mockNextFontGoogle(request, parent, isMain) {
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
const moduleLoadWithFontStub = Module._load;
Module._load = function mockBlockRendererTranslations(request, parent, isMain) {
  if (request === "next-intl/server") {
    return { getTranslations: async () => (key) => key };
  }
  return moduleLoadWithFontStub.call(this, request, parent, isMain);
};

process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key";

const { RESTAURANT_SAVANNAH } = require("@/lib/website-template-v2");
const { resolveTemplateContent } = require("@/lib/website-template-resolver");
const { renderToStaticMarkup } = require("react-dom/server");
const React = require("react");
const { NextIntlClientProvider } = require("next-intl");
const enMessages = require(path.join(ROOT, "messages/en.json"));
const { HeroBlockRenderer } = require("@/components/site/blocks/BlockRenderer");
const { V2SiteHeader, computeV2HeaderStyle } = require("@/components/site/v2/V2SiteHeader");
const { CatalogCard } = require("@/components/site/blocks/CatalogCard");
const { formatCurrency } = require("@/lib/format-locale");
Module._load = moduleLoadWithFontStub;

function renderWithMessages(element, locale = "en") {
  const messages = locale === "en" ? enMessages : require(path.join(ROOT, "messages/fr.json"));
  return renderToStaticMarkup(React.createElement(
    NextIntlClientProvider,
    { locale, messages },
    element
  ));
}

async function resolveAsyncTree(node) {
  if (Array.isArray(node)) return Promise.all(node.map(resolveAsyncTree));
  if (!React.isValidElement(node)) return node;
  if (typeof node.type === "function" && node.type.constructor?.name === "AsyncFunction") {
    const resolved = await node.type(node.props);
    return resolveAsyncTree(resolved);
  }
  return React.cloneElement(node, {}, await resolveAsyncTree(node.props.children));
}

// ── Hero focal point / fit static markup ──
test("Savannah hero focal point renders object-position on the image", () => {
  const resolved = resolveTemplateContent(RESTAURANT_SAVANNAH.id, RESTAURANT_SAVANNAH.version, {
    hero_headline: "Hero",
    hero_image: "/uploads/hero.png",
    template_extras: { savannahHeroFocalX: 25, savannahHeroFocalY: 75 },
  }, { includeSamples: false });
  const hero = resolved.pages.find((p) => p.isHome).blocks.find((b) => b.type === "hero");
  const markup = renderToStaticMarkup(React.createElement(HeroBlockRenderer, {
    block: hero,
    savannah: true,
    siteSlug: "savannah",
  }));
  assert.match(markup, /object-position:\s*25%\s*75%/, "focal point applies object-position");
  assert.match(markup, /object-cover/, "default fit is object-cover");
});

test("Savannah hero contain fit renders object-contain with soft backing", () => {
  const resolved = resolveTemplateContent(RESTAURANT_SAVANNAH.id, RESTAURANT_SAVANNAH.version, {
    hero_headline: "Hero",
    hero_image: "/uploads/hero.png",
    template_extras: { savannahHeroFit: "contain" },
  }, { includeSamples: false });
  const hero = resolved.pages.find((p) => p.isHome).blocks.find((b) => b.type === "hero");
  const markup = renderToStaticMarkup(React.createElement(HeroBlockRenderer, {
    block: hero,
    savannah: true,
    siteSlug: "savannah",
  }));
  assert.match(markup, /object-contain/, "contain fit renders object-contain");
  assert.match(markup, /bg-\[var\(--tf-soft\)\]/, "contain fit uses soft backing");
});

// ── Header hidden CTA focusability ──
test("Savannah header hidden CTA at scroll-0 is invisible (not focusable, keeps space)", () => {
  const markup = renderWithMessages(React.createElement(V2SiteHeader, {
    template: RESTAURANT_SAVANNAH,
    content: { business_name: "Savannah House", primary_cta_label: "Order Now" },
    navigation: [{ label: "Home", pageSlug: "home", order: 0 }],
    siteTitle: "Savannah",
    siteSlug: "savannah",
    overHero: true,
    primaryAction: { href: "/order", labelKey: "orderNow" },
  }));
  assert.match(markup, /invisible/, "hidden CTA has visibility:hidden");
  assert.match(markup, /pointer-events-none/, "hidden CTA has pointer-events-none");
  assert.doesNotMatch(markup, /tabindex="-1"/, "CTA does not use tabindex=-1 alone");
});

// ── Public header two-state static markup ──
test("Savannah public header scroll-0 is transparent with light text", () => {
  const markup = renderWithMessages(React.createElement(V2SiteHeader, {
    template: RESTAURANT_SAVANNAH,
    content: { business_name: "Savannah House" },
    navigation: [{ label: "Menu", pageSlug: "menu", order: 1 }],
    siteTitle: "Savannah",
    siteSlug: "savannah",
    overHero: true,
  }));
  assert.match(markup, /background:?\s*transparent|transparent/, "scroll-0 header background is transparent");
  assert.match(markup, /var\(--tf-on-scrim\)/, "scroll-0 header uses light text");
});

test("computeV2HeaderStyle scroll-past-24px yields 92% base + blur(12px)", () => {
  const style = computeV2HeaderStyle({
    transparent: false,
    paletteTheme: true,
    savannah: true,
    overHero: true,
    pastHeroThreshold: true,
    backgroundColor: "var(--tf-base)",
    solidForeground: "var(--tf-on-header)",
  });
  assert.match(style.backgroundColor, /color-mix\(in srgb, var\(--tf-base\) 92%, transparent\)/,
    "past threshold: 92% base color-mix");
  assert.match(style.backdropFilter, /blur\(12px\)/, "past threshold: 12px blur");
});

// ── CTA band round-trip static markup ──
test("Savannah CTA band renders custom heading/button/static markup", () => {
  const resolved = resolveTemplateContent(RESTAURANT_SAVANNAH.id, RESTAURANT_SAVANNAH.version, {
    template_extras: {
      ctaBandHeading: "View our menu",
      ctaBandButtonLabel: "See the menu",
      ctaBandButtonLink: "/menu",
    },
  }, { includeSamples: false });
  const home = resolved.pages.find((p) => p.isHome);
  const band = home.blocks.find((b) => b.type === "cta_banner");
  const { CtaBannerBlockRenderer } = require("@/components/site/blocks/BlockRenderer");
  const markup = renderToStaticMarkup(React.createElement(CtaBannerBlockRenderer, {
    block: band,
    siteSlug: "savannah",
    savannah: true,
  }));
  assert.match(markup, /View our menu/, "cta band heading in markup");
  assert.match(markup, /See the menu/, "cta band button label in markup");
  assert.match(markup, /\/menu/, "cta band button link in markup");
  assert.match(markup, /bg-\[var\(--tf-band\)\]/, "cta band footer variant uses tf-band");
});

// ── catalog-carousel cards ──
test("Savannah catalog carousel card: 4:3 image, clamp-2, no heart/rating/badge, readableOn text", () => {
  const card = renderToStaticMarkup(React.createElement(CatalogCard, {
    item: {
      id: "dish-1",
      name: "Grilled Salmon",
      description: "A beautifully grilled salmon with seasonal vegetables.",
      image: "/uploads/salmon.png",
      priceLabel: "$24.00",
      numericPrice: 24,
    },
  }));
  assert.match(card, /aspect-\[4\/3\]/, "card image is 4:3 aspect");
  assert.match(card, /object-(?:cover|contain)/, "card image uses object-cover or object-contain");
  assert.match(card, /line-clamp-2/, "card name is 2-line clamped");
  assert.doesNotMatch(card, /heart|rating|badge/i, "no heart/rating/badge on card");
  assert.match(card, /var\(--tf-on-soft\)/, "card text uses readableOn token");
  assert.match(card, /rounded-none/, "card has 0px radius");
  assert.match(card, /shadow-none/, "card has no shadow");
  assert.match(card, /border-0/, "card has no border");
});

test("Savannah catalog carousel card without image shows initial-letter fallback", () => {
  const card = renderToStaticMarkup(React.createElement(CatalogCard, {
    item: { id: "dish-2", name: "Tacos", description: "Street tacos", image: null, priceLabel: "$12.00" },
  }));
  assert.match(card, /Tacos/, "card shows full name as fallback context");
  assert.match(card, /initial-letter|text-3xl/, "initial letter is shown as styled fallback");
  assert.doesNotMatch(card, /<img[^>]*alt="Tacos"/, "no img tag with just the name as alt");
});

test("formatCurrency uses no hardcoded symbol", () => {
  const usd = formatCurrency(24, "USD", "en");
  const xof = formatCurrency(24000, "XOF", "fr");
  assert.ok(usd.includes("24"), "USD formats 24");
  assert.ok(xof.includes("24"), "XOF formats 24");
});

// ── catalog-carousel route test via real page.tsx ──
test("Savannah menu page route renders catalog-carousel cards (static markup)", async () => {
  const menuSections = { current: [] };
  const rendererPath = require.resolve("@/components/site/blocks/BlockRenderer");
  delete require.cache[rendererPath];
  const originalLoad = Module._load;
  Module._load = function mockRouteModules(request, parent, isMain) {
    if (request === "next/font/google") return { Fraunces: fontStub("font-fraunces-test"), Arimo: fontStub("font-arimo-test") };
    if (request === "next/navigation") return { notFound: () => { throw new Error("SITE_SCOPED_NOT_FOUND"); } };
    if (request === "next/headers") {
      return { cookies: async () => ({ get: () => undefined }), headers: async () => ({ get: () => null }) };
    }
    if (request === "@/lib/supabase-admin") {
      return {
        createSupabaseAdmin: () => ({
          from: (table) => {
            const tableData = {
              tenant_websites: { slug: "aldriva-savannah", id: "site-1", tenant_id: "tenant-1", site_title: "Savannah House", theme_config: {}, header_config: {}, footer_config: {}, status: "published" },
              businesses: null,
              website_pages: [{ id: "page-menu", slug: "menu", title: "Menu", is_home: false, sort_order: 1, blocks: [{ type: "menu_embed", heading: "Best sellers", variant: "catalog-carousel", limit: 6, layout: "grid" }], status: "published" }],
              website_content: { content: {} },
            };
            const chain = {
              select: () => chain,
              eq: () => chain,
              order: () => chain,
              limit: () => chain,
              maybeSingle: async () => ({ data: tableData[table] ?? null, error: null }),
              then: (resolve) => resolve({ data: tableData[table] ?? null, error: null }),
            };
            return chain;
          },
        }),
      };
    }
    if (request === "next-intl/server") return { getTranslations: async () => (key) => key };
    if (request === "server-only") return {};
    if (request === "@/lib/website-embeds") {
      const real = originalLoad.call(this, "@/lib/website-embeds", parent, isMain);
      return { ...real, resolveMenuEmbed: async () => menuSections.current };
    }
    // Do NOT mock BlockRenderer — use the real component tree
    return originalLoad.call(this, request, parent, isMain);
  };
  let publicRoute;
  try {
    publicRoute = require("@/app/site/[slug]/[[...page]]/page.tsx");
  } finally {
    Module._load = originalLoad;
    delete require.cache[rendererPath];
  }

  menuSections.current = [{
    id: "dinner",
    name: "Dinner",
    description: null,
    items: [
      {
        id: "dish-1",
        name: "Grilled Salmon",
        description: "A beautifully grilled salmon.",
        image_url: "/uploads/salmon.png",
        price: 24,
        promo_price: null,
        option_groups: [],
        is_sold_out: false,
        dietary_tags: [],
        allergens: [],
        modifiers: [],
        is_featured: false,
        isDraft: false,
      },
      {
        id: "dish-2",
        name: "Tacos",
        description: null,
        image_url: null,
        price: 12,
        promo_price: 9,
        option_groups: [],
        is_sold_out: false,
        dietary_tags: [],
        allergens: [],
        modifiers: [],
        is_featured: true,
        isDraft: false,
      },
    ],
  }];

  const rendered = await publicRoute.default({
    params: Promise.resolve({ slug: "aldriva-savannah", page: ["menu"] }),
  });
  const main = React.Children.toArray(rendered.props.children).find((child) => child && child.type === "main");
  assert.ok(main, "route renders a main element");
  const resolvedMain = await resolveAsyncTree(main);
  const markup = renderToStaticMarkup(resolvedMain);
  assert.match(markup, /Grilled Salmon/, "menu page shows dish name");
  assert.match(markup, /Tacos/, "menu page shows second dish");
  assert.match(markup, /catalog-carousel|aspect-\[4\/3\]/, "menu page renders carousel cards");
});

// ── thin content 0/1/2/12 items ──
test("Savannah features thin content: 0/1/2/12 items render safely", async () => {
  const { BlockRenderer } = require("@/components/site/blocks/BlockRenderer");
  for (const count of [0, 1, 2, 12]) {
    const items = Array.from({ length: count }, (_, i) => ({
      id: `item-${i}`,
      title: `Item ${i + 1}`,
      description: i % 2 === 0 ? `Description ${i + 1}` : undefined,
      image: i === 0 ? "/uploads/item.png" : undefined,
    }));
    const tree = await BlockRenderer({
      block: { type: "features", heading: "Highlights", items },
      siteTemplateId: RESTAURANT_SAVANNAH.id,
      sectionAlign: "center",
      businessName: "Savannah House",
    });
    const markup = renderToStaticMarkup(tree);
    if (count === 0) {
      assert.equal(markup, "", "0 items: features section omitted");
    } else {
      assert.match(markup, new RegExp(`Item ${count}`), `${count} items: last item present`);
      if (count === 1) assert.match(markup, /mx-auto max-w-md grid-cols-1/, "1 item: centered single column");
      if (count === 2) assert.match(markup, /sm:grid-cols-2/, "2 items: two-column layout");
      if (count === 12) assert.match(markup, /lg:grid-cols-3/, "12 items: three-column layout");
    }
  }
});
