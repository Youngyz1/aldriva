/**
 * lib/website-template-registry.ts
 *
 * Canonical immutable code-owned template registry (Stage A).
 *
 * Defines the complete website structure for each template — not just a list
 * of blocks. Templates remain immutable once published; new versions receive a
 * new id@version entry.
 *
 * Multi-page support is part of the schema from day one, even though the
 * initial set ships with a single home page per template.
 */

import type { Block } from "./website-blocks";
import { normalizeBlocks } from "./website-blocks";
import type { ThemeConfig, HeaderConfig, FooterConfig, NavigationItem } from "./website-nav";
import { DEFAULT_THEME_CONFIG, DEFAULT_HEADER_CONFIG, DEFAULT_FOOTER_CONFIG } from "./website-nav";
import type { WebsiteCategory } from "./website-category";

// ── Template version ──────────────────────────────────────────────────────

export type TemplateVersion = string; // semver e.g. "1.0.0"

// ── Page definition ───────────────────────────────────────────────────────

export interface TemplatePageDefinition {
  slug: string;
  title: string;
  isHome: boolean;
  sortOrder: number;
  seoTitle?: string;
  seoDescription?: string;
  blocks: Block[];
}

export interface TemplateNavigationDefinition {
  label: string;
  href: string;
  pageSlug?: string | null;
  target?: "_self" | "_blank";
  order: number;
  children?: TemplateNavigationDefinition[];
}

// ── Canonical template ────────────────────────────────────────────────────

export interface CanonicalTemplate {
  /** Stable kebab id, e.g. "restaurant-delight" */
  id: string;
  /** Semver version, e.g. "1.0.0" */
  version: TemplateVersion;
  /** Human display name */
  name: string;
  description: string;
  /** Primary family / category */
  category: WebsiteCategory;
  style: "modern" | "minimal" | "bold" | "warm";
  /** Preview swatch color */
  previewColor: string;
  /**
   * Which website categories this template is compatible with.
   * Empty array means universal (compatible with any category).
   */
  supportedCategories: WebsiteCategory[];
  /** Design tokens seeded at site creation */
  theme: ThemeConfig;
  header: HeaderConfig;
  footer: FooterConfig;
  /** Pages — at least one home page required */
  pages: TemplatePageDefinition[];
  /** Navigation seeded at site creation */
  navigation: NavigationItem[];
  /** Optional tags for search */
  tags?: string[];
  /** ISO timestamp */
  createdAt?: string;
  /** Optional checksum for diff (not enforced yet) */
  checksum?: string;
}

export type WebsiteTemplateStyle = CanonicalTemplate["style"];

// ── Helpers ───────────────────────────────────────────────────────────────

function brandTheme(overrides: Partial<ThemeConfig> = {}): ThemeConfig {
  return { ...DEFAULT_THEME_CONFIG, ...overrides };
}

function brandHeader(overrides: Partial<HeaderConfig> = {}): HeaderConfig {
  return { ...DEFAULT_HEADER_CONFIG, ...overrides };
}

function brandFooter(overrides: Partial<FooterConfig> = {}): FooterConfig {
  return { ...DEFAULT_FOOTER_CONFIG, ...overrides };
}

function navItem(
  label: string,
  href: string,
  pageSlug: string | null,
  order: number,
  target: "_self" | "_blank" = "_self"
): NavigationItem {
  return {
    id: `${label.toLowerCase().replace(/\s+/g, "-")}-${order}`,
    label,
    href,
    page_id: null,
    target,
    order,
  };
}

// ── Registry ──────────────────────────────────────────────────────────────
// 6 initial templates migrated from WEBSITE_TEMPLATES (legacy single-page)
// Each now has explicit version, supportedCategories, theme/header/footer,
// and multi-page structure (single home page for now — future templates add
// more pages). Blocks are normalized to include stable ids.

export const TEMPLATE_REGISTRY: CanonicalTemplate[] = [
  {
    id: "business-starter",
    version: "1.0.0",
    name: "Business Starter",
    description: "Clean hero, features, testimonials and contact — great for any business.",
    category: "business",
    style: "modern",
    previewColor: "#ea580c",
    supportedCategories: ["business"],
    theme: brandTheme({ theme: "default", primaryColor: "#ea580c" }),
    header: brandHeader(),
    footer: brandFooter(),
    pages: [
      {
        slug: "home",
        title: "Home",
        isHome: true,
        sortOrder: 0,
        blocks: normalizeBlocks([
          { type: "hero", heading: "Welcome to Your Business", subheading: "We help you grow with modern solutions tailored to your needs.", ctaLabel: "Get Started", ctaHref: "/contact", variant: "center", align: "center" },
          { type: "features", heading: "What We Do", subheading: "Everything you need in one place.", columns: 3, items: [{ title: "Fast & Reliable", description: "Built for speed and uptime you can trust.", icon: "⚡" }, { title: "Expert Support", description: "Friendly help when you need it most.", icon: "💬" }, { title: "Secure & Scalable", description: "Enterprise-grade security that grows with you.", icon: "🔒" }] },
          { type: "testimonials", heading: "What Customers Say", items: [{ quote: "Amazing service — our sales doubled in 3 months.", author: "Alex Morgan", role: "Founder, Startup Co" }, { quote: "Support team is responsive and genuinely helpful.", author: "Jamie Lee", role: "Owner, Local Shop" }] },
          { type: "contact", heading: "Get in Touch", subheading: "We'd love to hear from you.", email: "hello@example.com", phone: "+1 (555) 010-0000", address: "123 Business Ave, City, ST 12345", showMap: true },
        ]),
      },
    ],
    navigation: [navItem("Home", "/", "home", 0)],
    tags: ["business", "starter"],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "restaurant-delight",
    version: "1.0.0",
    name: "Restaurant Delight",
    description: "Appetizing hero, gallery, menu highlights and hours.",
    category: "restaurant",
    style: "warm",
    previewColor: "#d97706",
    supportedCategories: ["restaurant"],
    theme: brandTheme({ theme: "warm", primaryColor: "#d97706" }),
    header: brandHeader({ ctaLabel: "Reserve Table", ctaHref: "/contact" }),
    footer: brandFooter(),
    pages: [
      {
        slug: "home",
        title: "Home",
        isHome: true,
        sortOrder: 0,
        blocks: normalizeBlocks([
          { type: "hero", heading: "Taste the Difference", subheading: "Fresh ingredients, crafted daily. Dine in or order online.", ctaLabel: "View Menu", ctaHref: "/menu", secondaryCtaLabel: "Reserve Table", secondaryCtaHref: "/contact", variant: "split", align: "left", badge: "Now Open" },
          { type: "gallery", heading: "Our Kitchen", subheading: "A glimpse inside.", columns: 3, layout: "grid", images: [{ src: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800", alt: "Restaurant interior" }, { src: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800", alt: "Dish" }, { src: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800", alt: "Dining" }] },
          { type: "features", heading: "Why Dine With Us", columns: 3, items: [{ title: "Farm Fresh", description: "Locally sourced every morning.", icon: "🥗" }, { title: "Wood-Fired", description: "Authentic flavor, every bite.", icon: "🔥" }, { title: "Family Owned", description: "30 years of hospitality.", icon: "❤️" }] },
          { type: "contact", heading: "Visit Us", email: "hello@restaurant.com", phone: "+1 (555) 123-4567", address: "42 Main St, Foodtown", hours: "Mon-Sun 11am - 10pm", showMap: true },
          { type: "faq", heading: "Good to Know", items: [{ question: "Do you take reservations?", answer: "Yes — call us or book via the contact form." }, { question: "Delivery available?", answer: "Yes, within 5 miles. Order via phone." }] },
        ]),
      },
    ],
    navigation: [navItem("Home", "/", "home", 0), navItem("Menu", "/menu", null, 1)],
    tags: ["restaurant", "food"],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "retail-boutique",
    version: "1.0.0",
    name: "Retail Boutique",
    description: "Product embeds, gallery and promotion banner for shops.",
    category: "retail",
    style: "minimal",
    previewColor: "#18181b",
    supportedCategories: ["retail"],
    theme: brandTheme({ theme: "default", primaryColor: "#18181b" }),
    header: brandHeader({ ctaLabel: "Shop Now", ctaHref: "/products" }),
    footer: brandFooter(),
    pages: [
      {
        slug: "home",
        title: "Home",
        isHome: true,
        sortOrder: 0,
        blocks: normalizeBlocks([
          { type: "hero", heading: "Curated for You", subheading: "Discover products you’ll love — hand-picked every season.", ctaLabel: "Shop Now", ctaHref: "/products", variant: "split", align: "left" },
          { type: "products_embed", heading: "Featured Products", subheading: "Our bestsellers.", limit: 6, layout: "grid" },
          { type: "gallery", heading: "Lookbook", layout: "carousel", images: [{ src: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800", alt: "Store" }] },
          { type: "testimonials", heading: "Loved by Customers", items: [{ quote: "Best boutique in town — always finds me the perfect fit.", author: "Taylor Swift", rating: 5 }] },
          { type: "cta_banner", heading: "Get 10% off your first order", subheading: "Join our newsletter.", ctaLabel: "Join Now", ctaHref: "/contact", variant: "brand" },
        ]),
      },
    ],
    navigation: [navItem("Home", "/", "home", 0), navItem("Products", "/products", null, 1)],
    tags: ["retail", "boutique"],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "service-pro",
    version: "1.0.0",
    name: "Service Pro",
    description: "Trust-building features, about and booking CTA for services.",
    category: "service",
    style: "modern",
    previewColor: "#2563eb",
    supportedCategories: ["service", "professional"],
    theme: brandTheme({ theme: "default", primaryColor: "#2563eb" }),
    header: brandHeader({ ctaLabel: "Book Now", ctaHref: "/contact" }),
    footer: brandFooter(),
    pages: [
      {
        slug: "home",
        title: "Home",
        isHome: true,
        sortOrder: 0,
        blocks: normalizeBlocks([
          { type: "hero", heading: "Professional Services", subheading: "Trusted by hundreds of happy clients. Book today.", ctaLabel: "Book Now", ctaHref: "/contact", badge: "Licensed & Insured", variant: "center" },
          { type: "features", heading: "Our Services", columns: 3, items: [{ title: "Consultation", description: "Free assessment and quote.", icon: "📋" }, { title: "On-Time", description: "We respect your schedule.", icon: "⏱️" }, { title: "Guaranteed", description: "Satisfaction guaranteed.", icon: "✅" }] },
          { type: "about", heading: "About Us", story: "We’ve served the community for over a decade with integrity and craftsmanship.", mission: "To deliver exceptional service with honesty and care.", founderName: "Jordan Smith", founderRole: "Lead Professional", highlights: [{ label: "Clients", value: "500+", icon: "👥" }, { label: "Years", value: "12", icon: "📅" }, { label: "Rating", value: "4.9/5", icon: "⭐" }] },
          { type: "contact", heading: "Book a Service", showMap: false },
          { type: "faq", heading: "FAQ", items: [{ question: "What areas do you cover?", answer: "Citywide and surrounding suburbs." }, { question: "How do I pay?", answer: "Cash, card, or bank transfer." }] },
        ]),
      },
    ],
    navigation: [navItem("Home", "/", "home", 0), navItem("Contact", "/contact", null, 1)],
    tags: ["service", "professional"],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "creative-portfolio",
    version: "1.0.0",
    name: "Creative Portfolio",
    description: "Bold hero, gallery and testimonials for creatives and portfolios.",
    category: "creative",
    style: "bold",
    previewColor: "#4f46e5",
    supportedCategories: ["creative"],
    theme: brandTheme({ theme: "default", primaryColor: "#4f46e5" }),
    header: brandHeader(),
    footer: brandFooter(),
    pages: [
      {
        slug: "home",
        title: "Home",
        isHome: true,
        sortOrder: 0,
        blocks: normalizeBlocks([
          { type: "hero", heading: "Design that Speaks", subheading: "Portfolio of work that blends art and strategy.", ctaLabel: "View Work", ctaHref: "#gallery", secondaryCtaLabel: "Contact", secondaryCtaHref: "/contact", variant: "center" },
          { type: "gallery", heading: "Selected Work", layout: "masonry", columns: 3, images: [{ src: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800", alt: "Work 1" }, { src: "https://images.unsplash.com/photo-1508923446990-8364b10a3bb5?w=800", alt: "Work 2" }, { src: "https://images.unsplash.com/photo-152254255022e-0da6a9aeefed?w=800", alt: "Work 3" }] },
          { type: "about", heading: "Hello", subheading: "I’m a designer & maker.", story: "Crafting digital experiences for 8 years." },
          { type: "contact", heading: "Let’s Work Together", subheading: "Available for freelance projects.", email: "hello@portfolio.com" },
        ]),
      },
    ],
    navigation: [navItem("Home", "/", "home", 0)],
    tags: ["creative", "portfolio"],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "organization-impact",
    version: "1.0.0",
    name: "Organization Impact",
    description: "Story, sponsors, fundraisers and contact for nonprofits.",
    category: "organization",
    style: "warm",
    previewColor: "#059669",
    supportedCategories: ["organization"],
    theme: brandTheme({ theme: "warm", primaryColor: "#059669" }),
    header: brandHeader({ ctaLabel: "Donate Now", ctaHref: "/donate" }),
    footer: brandFooter(),
    pages: [
      {
        slug: "home",
        title: "Home",
        isHome: true,
        sortOrder: 0,
        blocks: normalizeBlocks([
          { type: "hero", heading: "Make an Impact", subheading: "Join our mission to create lasting change in our community.", ctaLabel: "Donate Now", ctaHref: "/donate", variant: "center", badge: "Nonprofit" },
          { type: "about", heading: "Our Story", story: "Founded in 2015 to support local families in need.", mission: "Empowering communities through action and compassion.", highlights: [{ label: "Raised", value: "$250k", icon: "💚" }, { label: "Families", value: "1.2k", icon: "🏠" }] },
          { type: "fundraiser_embed", heading: "Active Campaigns", layout: "banner", limit: 3 },
          { type: "events_embed", heading: "Upcoming Events", layout: "grid", limit: 3 },
          { type: "contact", heading: "Get Involved", subheading: "Volunteer, donate, or spread the word." },
        ]),
      },
    ],
    navigation: [navItem("Home", "/", "home", 0), navItem("Donate", "/donate", null, 1)],
    tags: ["organization", "nonprofit"],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

// ── Registry helpers ────────────────────────────────────────────────────

export function getTemplateById(id: string): CanonicalTemplate | undefined {
  return TEMPLATE_REGISTRY.find((t) => t.id === id);
}

export function getTemplateByIdVersion(id: string, version: string): CanonicalTemplate | undefined {
  return TEMPLATE_REGISTRY.find((t) => t.id === id && t.version === version);
}

export function parseTemplateRef(ref: string): { id: string; version?: string } {
  const [id, version] = ref.split("@");
  return { id, version };
}

export function getTemplateByRef(ref: string): CanonicalTemplate | undefined {
  const { id, version } = parseTemplateRef(ref);
  if (version) return getTemplateByIdVersion(id, version);
  return getTemplateById(id);
}

export function getTemplatesByCategory(category: WebsiteCategory): CanonicalTemplate[] {
  return TEMPLATE_REGISTRY.filter((t) => t.category === category);
}

export function getAllTemplates(): CanonicalTemplate[] {
  return [...TEMPLATE_REGISTRY];
}

export function getCompatibleTemplatesForCategory(
  websiteCategory: WebsiteCategory
): CanonicalTemplate[] {
  return TEMPLATE_REGISTRY.filter((t) => {
    if (!t.supportedCategories || t.supportedCategories.length === 0) return true;
    return t.supportedCategories.includes(websiteCategory);
  });
}

export function isTemplateCompatibleWithCategory(
  template: CanonicalTemplate,
  websiteCategory: WebsiteCategory
): boolean {
  if (!template.supportedCategories || template.supportedCategories.length === 0) return true;
  return template.supportedCategories.includes(websiteCategory);
}

export function formatTemplateRef(template: CanonicalTemplate): string {
  return `${template.id}@${template.version}`;
}

// Validation

export function validateRegistry(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const t of TEMPLATE_REGISTRY) {
    const ref = formatTemplateRef(t);
    if (seen.has(ref)) errors.push(`Duplicate template ref: ${ref}`);
    seen.add(ref);
    if (!t.id || typeof t.id !== "string") errors.push(`Template missing id: ${ref}`);
    if (!t.version || typeof t.version !== "string") errors.push(`Template missing version: ${t.id}`);
    if (!t.pages || t.pages.length === 0) errors.push(`Template ${ref} has no pages`);
    if (!t.pages.some((p) => p.isHome)) errors.push(`Template ${ref} has no home page`);
    for (const p of t.pages) {
      if (!p.slug) errors.push(`Template ${ref} has page without slug`);
      if (!Array.isArray(p.blocks)) errors.push(`Template ${ref} page ${p.slug} missing blocks array`);
    }
  }

  return { valid: errors.length === 0, errors };
}
