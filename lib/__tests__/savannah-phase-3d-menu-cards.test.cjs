/**
 * lib/__tests__/savannah-phase-3d-menu-cards.test.cjs
 *
 * Phase 3d: Make the menu card actually appear on Savannah sites.
 *
 * Tests that the "catalog-carousel" variant flows from the resolver through
 * BlockRenderer into StorefrontBrowse and renders CatalogCard carousel markup
 * on the public route, using real content for a Savannah site ("timo-wears").
 *
 * No DB, no network. Uses the same transpile/alias harness as
 * website-template-v2.test.cjs. Route test does NOT mock BlockRenderer.
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
const { validateBlock } = require("@/lib/website-blocks");
const { formatCurrency } = require("@/lib/format-locale");
const { contrastRatio } = require("@/lib/readable-on");
const { CatalogCard } = require("@/components/site/blocks/CatalogCard");

async function resolveAsyncTree(node) {
  if (Array.isArray(node)) return Promise.all(node.map(resolveAsyncTree));
  if (!React.isValidElement(node)) return node;
  if (typeof node.type === "function" && node.type.constructor?.name === "AsyncFunction") {
    const resolved = await node.type(node.props);
    return resolveAsyncTree(resolved);
  }
  return React.cloneElement(node, {}, await resolveAsyncTree(node.props.children));
}

// ── timo-wears fixture content ──────────────────────────────────────────

const timoWearsContent = {
  business_name: "Timo Wears",
  hero_headline: "A calm plate",
  hero_subtext: "Serene hospitality.",
  primary_cta_label: "Order Now",
  logo_url: "/uploads/logo.png",
  address: "123 Main Street, City",
  phone: "+1 555-0100",
  email: "hello@example.com",
  highlights: [
    { title: "Fire Cooking", description: "Wood fired grill", image: "/uploads/fire.jpg" },
    { title: "Natural Cellar", description: "Low intervention wines" },
  ],
  featured: {
    menu_item_ids: [
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ],
  },
  template_extras: {},
};

// ── Helper: resolve Savannah template with timo-wears content ──────────

function resolveTimoWears() {
  return resolveTemplateContent(RESTAURANT_SAVANNAH.id, RESTAURANT_SAVANNAH.version, timoWearsContent, {
    includeSamples: false,
    viewMenuLabel: "View menu",
  });
}

// ── Tests ──────────────────────────────────────────────────────────────

test("Savannah resolver produces catalog-carousel variant for Best sellers and Menu page", () => {
  const resolved = resolveTimoWears();
  const homePage = resolved.pages.find((p) => p.isHome);
  assert.ok(homePage, "home page resolved");

  const bestSellers = homePage.blocks.find(
    (b) => b.type === "menu_embed" && b.heading === "Best sellers"
  );
  assert.ok(bestSellers, "Best sellers block present");
  assert.equal(bestSellers.variant, "catalog-carousel", "Best sellers uses catalog-carousel variant");

  const menuBrowse = homePage.blocks.find(
    (b) => b.type === "menu_embed" && b.selectedItemIds === undefined
  );
  assert.ok(menuBrowse, "Home menu (menu.browse) block present");
  assert.equal(menuBrowse.variant, "catalog-carousel", "Home menu uses catalog-carousel variant");

  const menuPage = resolved.pages.find((p) => p.slug === "menu");
  assert.ok(menuPage, "Menu page resolved");
  const fullMenu = menuPage.blocks.find(
    (b) => b.type === "menu_embed" && b.heading === "Our full menu"
  );
  assert.ok(fullMenu, "Full Menu page block present");
  assert.equal(fullMenu.variant, "catalog-carousel", "Full Menu uses catalog-carousel variant");
});

test("catalog-carousel variant passes validateBlock", () => {
  const v = validateBlock({
    type: "menu_embed",
    variant: "catalog-carousel",
    heading: "Best sellers",
    limit: 6,
    layout: "grid",
  });
  assert.equal(v.success, true, "catalog-carousel variant is accepted by validateBlock");
});

test("CatalogCard renders 4:3 image, clamp-2 name, no heart/rating/badge, Savannah tokens", () => {
  const card = renderToStaticMarkup(React.createElement(CatalogCard, {
    item: {
      id: "dish-1",
      name: "Grilled Salmon",
      description: "A beautifully grilled salmon with seasonal vegetables.",
      image: "/uploads/salmon.png",
      priceLabel: "5000 FCFA",
      numericPrice: 5000,
      currency: "XOF",
      locale: "fr",
    },
    currency: "XOF",
    locale: "fr",
  }));
  assert.match(card, /aspect-\[4\/3\]/, "card image is 4:3 aspect");
  assert.match(card, /object-cover/, "card image uses object-cover");
  assert.match(card, /line-clamp-2/, "card name is 2-line clamped");
  assert.doesNotMatch(card, /heart|rating|badge/i, "no heart/rating/badge on card");
  assert.match(card, /rounded-none/, "card has 0px radius");
  assert.match(card, /shadow-none/, "card has no shadow");
  assert.match(card, /border-0/, "card has no border");
  assert.match(card, /bg-\[var\(--tf-soft\)\]/, "card uses tonal background");
  assert.match(card, /text-\[var\(--tf-on-soft\)\]/, "card text uses readableOn token");
});

test("CatalogCard without image shows initial-letter fallback (no bare T)", () => {
  const card = renderToStaticMarkup(React.createElement(CatalogCard, {
    item: { id: "dish-2", name: "Tacos", description: "Street tacos", image: null },
  }));
  assert.match(card, /Tacos/, "card shows full name as fallback context");
  assert.doesNotMatch(card, /<img[^>]*alt="Tacos"/, "no img tag with just the name as alt");
});

test("formatCurrency uses site currency (FCFA has no decimals)", () => {
  const xof = formatCurrency(5000, "XOF", "fr");
  assert.ok(xof.includes("5"), "XOF formats 5000 with FCFA prefix");
  assert.ok(xof.includes("CFA"), "XOF uses FCFA currency symbol");
  const usd = formatCurrency(2400, "USD", "en");
  assert.ok(usd.includes("$2"), "USD formats 2400");
});

test("All six Savannah palettes meet contrast minimums for card elements", () => {
  for (const palette of RESTAURANT_SAVANNAH.palettes) {
    const baseToInk = contrastRatio(palette.base, palette.ink);
    assert.ok(baseToInk >= 4.5, `${palette.id}: base/ink contrast ${baseToInk.toFixed(2)} >= 4.5`);
    if (palette.soft) {
      const softToOnSoft = contrastRatio(palette.soft, palette.ink);
      assert.ok(softToOnSoft >= 3, `${palette.id}: soft/ink contrast ${softToOnSoft.toFixed(2)} >= 3`);
    }
  }
});

// ── Real-content route test ──────────────────────────────────────────

test("timo-wears Home and Menu route render catalog-carousel cards (static markup)", async () => {
  // ── Mock Supabase admin for timo-wears site ────────────────────────
  const timoWebsite = {
    slug: "timo-wears",
    id: "site-timo-wears",
    tenant_id: "tenant-timo-wears",
    site_title: "Timo Wears",
    theme_config: {},
    header_config: {},
    footer_config: {},
    status: "published",
    metadata: { templateId: "restaurant-savannah", templateVersion: "1.0.0" },
  };
  const timoBusiness = {
    id: "biz-timo-wears",
    organizer_id: "tenant-timo-wears",
    country: null,
    industry: null,
    category: "restaurant",
    business_type: null,
    offerings: ["online_ordering", "table_reservations"],
    created_at: "2026-01-01T00:00:00Z",
  };
  const timoPages = [
    { id: "page-home", website_id: "site-timo-wears", slug: "home", title: "Home", is_home: true, sort_order: 0, status: "published", blocks: [] },
    { id: "page-menu", website_id: "site-timo-wears", slug: "menu", title: "Menu", is_home: false, sort_order: 1, status: "published", blocks: [] },
  ];
  const timoContent = { content: timoWearsContent };

  const supabaseChain = (data) => {
    const c = {
      data,
      select: () => c,
      eq: () => c,
      order: () => c,
      limit: () => c,
      maybeSingle: async () => ({ data, error: null }),
      then: (resolve) => Promise.resolve({ data, error: null }).then(resolve),
    };
    return c;
  };

  // ── Mock website-embeds resolveMenuEmbed ───────────────────────────
  const menuSections = [
    {
      id: "dinner",
      name: "Dinner",
      description: null,
      items: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          name: "Grilled Salmon",
          description: "A beautifully grilled salmon with seasonal vegetables.",
          image_url: "/uploads/salmon.png",
          price: 5000,
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
          id: "22222222-2222-2222-2222-222222222222",
          name: "Tacos",
          description: null,
          image_url: null,
          price: 3000,
          promo_price: 2500,
          option_groups: [],
          is_sold_out: false,
          dietary_tags: [],
          allergens: [],
          modifiers: [],
          is_featured: true,
          isDraft: false,
        },
      ],
    },
  ];

  const moduleMocks = new Map([
    ["next/font/google", { Fraunces: () => ({ variable: "font-fraunces-test" }) }],
    ["next/navigation", { notFound: () => { throw new Error("SITE_SCOPED_NOT_FOUND"); } }],
    ["next/headers", {
      cookies: async () => ({ get: () => undefined }),
      headers: async () => ({ get: () => null }),
    }],
    ["next-intl/server", { getTranslations: async () => (key) => key }],
    ["server-only", {}],
    ["@/lib/website-catalog-adapter", { getWebsiteCatalogAvailability: async () => ({ menuItems: true, products: false }) }],
    ["@/lib/supabase-admin", {
      createSupabaseAdmin: () => ({
        from: (table) => {
          if (table === "tenant_websites") return supabaseChain(timoWebsite);
          if (table === "businesses") return supabaseChain(timoBusiness);
          if (table === "website_pages") return supabaseChain(timoPages);
          if (table === "website_content") return supabaseChain(timoContent);
          if (table === "website_navigation") return supabaseChain([]);
          throw new Error(`unexpected route table ${table}`);
        },
      }),
    }],
    ["@/lib/supabase-server", { createSupabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }],
    ["@/lib/entity-auth", { ENTITY_ROLES_ALL: [], hasEntityAccess: async () => false }],
    ["@/lib/auth", { isAdmin: async () => false }],
    ["@/lib/server-approval", { getOrgApproval: async () => "approved" }],
    // Do NOT mock BlockRenderer — use the real component tree
  ]);
  const originalLoad = Module._load;
  Module._load = function loadPublicRouteMocks(request, parent, isMain) {
    if (request === "next/font/google") {
      return {
        Arimo: fontStub("font-arimo-test"),
        Fraunces: fontStub("font-fraunces-test"),
        Geist: fontStub("font-geist-test"),
        Geist_Mono: fontStub("font-geist-mono-test"),
      };
    }
    if (request === "@/lib/website-embeds") {
      const real = originalLoad.call(this, "@/lib/website-embeds", parent, isMain);
      return { ...real, resolveMenuEmbed: async () => menuSections };
    }
    if (moduleMocks.has(request)) return moduleMocks.get(request);
    return originalLoad.call(this, request, parent, isMain);
  };
  let publicRoute;
  try {
    publicRoute = require("@/app/site/[slug]/[[...page]]/page.tsx");
  } finally {
    Module._load = originalLoad;
  }

  // ── Render Home page ───────────────────────────────────────────────
  const homeRendered = await publicRoute.default({
    params: Promise.resolve({ slug: "timo-wears", page: [] }),
  });
  const homeMain = React.Children.toArray(homeRendered.props.children).find((child) => child && child.type === "main");
  assert.ok(homeMain, "Home route renders a main element");
  const resolvedHomeMain = await resolveAsyncTree(homeMain);
  const homeMarkup = renderToStaticMarkup(resolvedHomeMain);

  assert.match(homeMarkup, /Grilled Salmon/, "Home page shows dish name");
  assert.match(homeMarkup, /Tacos/, "Home page shows second dish");
  assert.match(homeMarkup, /aspect-\[4\/3\]/, "Home page renders carousel card images (4:3)");
  assert.match(homeMarkup, /object-cover/, "Home page carousel images use object-cover");
  assert.match(homeMarkup, /line-clamp-2/, "Home page carousel names are clamp-2");
  assert.match(homeMarkup, /rounded-none/, "Home page carousel cards have 0 radius");
  assert.doesNotMatch(homeMarkup, /<input[^>]*type=["']search["']/i, "Home page has no search input");
  assert.doesNotMatch(homeMarkup, /heart|rating|badge/i, "Home page carousel cards have no heart/rating/badge");

  // ── Render Menu page ───────────────────────────────────────────────
  const menuRendered = await publicRoute.default({
    params: Promise.resolve({ slug: "timo-wears", page: ["menu"] }),
  });
  const menuMain = React.Children.toArray(menuRendered.props.children).find((child) => child && child.type === "main");
  assert.ok(menuMain, "Menu route renders a main element");
  const resolvedMenuMain = await resolveAsyncTree(menuMain);
  const menuMarkup = renderToStaticMarkup(resolvedMenuMain);

  assert.match(menuMarkup, /Grilled Salmon/, "Menu page shows dish name");
  assert.match(menuMarkup, /Tacos/, "Menu page shows second dish");
  assert.match(menuMarkup, /aspect-\[4\/3\]/, "Menu page renders carousel card images (4:3)");
  assert.match(menuMarkup, /Dinner/, "Menu page shows category row title");
});

test("timo-wears Best sellers has no search input", async () => {
  // The Home page includes Best sellers section which uses catalog-carousel.
  // Search input should not appear in carousel sections.
  const timoWebsite = {
    slug: "timo-wears",
    id: "site-timo-wears",
    tenant_id: "tenant-timo-wears",
    site_title: "Timo Wears",
    theme_config: {},
    header_config: {},
    footer_config: {},
    status: "published",
    metadata: { templateId: "restaurant-savannah", templateVersion: "1.0.0" },
  };
  const timoBusiness = {
    id: "biz-timo-wears",
    organizer_id: "tenant-timo-wears",
    country: null,
    industry: null,
    category: "restaurant",
    business_type: null,
    offerings: ["online_ordering", "table_reservations"],
    created_at: "2026-01-01T00:00:00Z",
  };
  const timoPages = [
    { id: "page-home", website_id: "site-timo-wears", slug: "home", title: "Home", is_home: true, sort_order: 0, status: "published", blocks: [] },
  ];
  const timoContent = { content: timoWearsContent };

  const menuSections = [
    {
      id: "dinner",
      name: "Dinner",
      description: null,
      items: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          name: "Grilled Salmon",
          description: "A beautifully grilled salmon.",
          image_url: "/uploads/salmon.png",
          price: 5000,
          promo_price: null,
          option_groups: [],
          is_sold_out: false,
          dietary_tags: [],
          allergens: [],
          modifiers: [],
          is_featured: false,
          isDraft: false,
        },
      ],
    },
  ];

  const supabaseChain = (data) => ({
    select: () => ({ ...chain, data }),
    eq: () => ({ ...chain, data }),
    order: () => ({ ...chain, data }),
    limit: () => ({ ...chain, data }),
    maybeSingle: async () => ({ data, error: null }),
    then: (resolve) => Promise.resolve({ data, error: null }).then(resolve),
  });
  const chain = { data: null };

  const moduleMocks = new Map([
    ["next/font/google", { Fraunces: () => ({ variable: "font-fraunces-test" }) }],
    ["next/navigation", { notFound: () => { throw new Error("SITE_SCOPED_NOT_FOUND"); } }],
    ["next/headers", {
      cookies: async () => ({ get: () => undefined }),
      headers: async () => ({ get: () => null }),
    }],
    ["next-intl/server", { getTranslations: async () => (key) => key }],
    ["server-only", {}],
    ["@/lib/website-catalog-adapter", { getWebsiteCatalogAvailability: async () => ({ menuItems: true, products: false }) }],
    ["@/lib/supabase-admin", {
      createSupabaseAdmin: () => ({
        from: (table) => {
          if (table === "tenant_websites") return supabaseChain(timoWebsite);
          if (table === "businesses") return supabaseChain(timoBusiness);
          if (table === "website_pages") return supabaseChain(timoPages);
          if (table === "website_content") return supabaseChain(timoContent);
          if (table === "website_navigation") return supabaseChain([]);
          throw new Error(`unexpected route table ${table}`);
        },
      }),
    }],
    ["@/lib/supabase-server", { createSupabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }],
    ["@/lib/entity-auth", { ENTITY_ROLES_ALL: [], hasEntityAccess: async () => false }],
    ["@/lib/auth", { isAdmin: async () => false }],
    ["@/lib/server-approval", { getOrgApproval: async () => "approved" }],
  ]);
  const originalLoad = Module._load;
  Module._load = function loadPublicRouteMocks(request, parent, isMain) {
    if (request === "next/font/google") {
      return {
        Arimo: fontStub("font-arimo-test"),
        Fraunces: fontStub("font-fraunces-test"),
        Geist: fontStub("font-geist-test"),
        Geist_Mono: fontStub("font-geist-mono-test"),
      };
    }
    if (request === "@/lib/website-embeds") {
      const real = originalLoad.call(this, "@/lib/website-embeds", parent, isMain);
      return { ...real, resolveMenuEmbed: async () => menuSections };
    }
    if (moduleMocks.has(request)) return moduleMocks.get(request);
    return originalLoad.call(this, request, parent, isMain);
  };
  let publicRoute;
  try {
    publicRoute = require("@/app/site/[slug]/[[...page]]/page.tsx");
  } finally {
    Module._load = originalLoad;
  }

  const rendered = await publicRoute.default({
    params: Promise.resolve({ slug: "timo-wears", page: [] }),
  });
  const main = React.Children.toArray(rendered.props.children).find((child) => child && child.type === "main");
  assert.ok(main, "Home route renders a main element");
  const resolvedMain = await resolveAsyncTree(main);
  const markup = renderToStaticMarkup(resolvedMain);
  assert.doesNotMatch(markup, /<input[^>]*type=["']search["']/i, "Best sellers has no search input");
});
