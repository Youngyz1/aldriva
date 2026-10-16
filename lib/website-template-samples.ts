/**
 * lib/website-template-samples.ts
 *
 * Sample placeholder content for flagship v2 templates (Stage S3).
 *
 * Fill-empties-only doctrine (copied from
 * lib/invitation-template-preview-data.ts): samples render for empty slots,
 * flagged via sampleFields[], and are NEVER written into the content doc.
 * Image paths are same-origin local placeholders, which safeImageSrc allows
 * (lib/image-url.ts) — no hotlinking, no copyrighted stock.
 */

import type { ContentDoc } from "./website-content";
import type { StorefrontProductPreviewItem } from "./website-blocks";

export const PLACEHOLDER_BASE = "/placeholders";

function ph(template: string, file: string): string {
  return `${PLACEHOLDER_BASE}/${template}/${file}`;
}

// ── Restaurant: Table & Flame ───────────────────────────────────────────────

export const RESTAURANT_SAMPLES: ContentDoc = {
  business_name: "Table & Flame",
  tagline: "Wood-fired kitchen & neighborhood bar",
  hero_image: ph("restaurant", "hero.svg"),
  hero_headline: "Fire-kissed dishes, served with warmth",
  hero_subtext: "Seasonal ingredients, an open flame, and a table that always feels like home.",
  primary_cta_label: "Order Now",
  secondary_cta_label: "View Menu",
  about_image: ph("restaurant", "about.svg"),
  about_text:
    "Since 2012 we have cooked the food we love to eat: simple plates, bold flavors, and produce picked every morning.",
  gallery_images: [
    ph("restaurant", "gallery-1.svg"),
    ph("restaurant", "gallery-2.svg"),
    ph("restaurant", "gallery-3.svg"),
    ph("restaurant", "gallery-4.svg"),
    ph("restaurant", "gallery-5.svg"),
    ph("restaurant", "gallery-6.svg"),
  ],
  highlights: [
    { title: "Fresh daily", description: "Produce picked every morning." },
    { title: "Seasonal favorites", description: "Thoughtful dishes inspired by the season." },
    { title: "A warm welcome", description: "A relaxed neighborhood setting for good company." },
  ],
  stats: [
    { label: "Since", value: "2012" },
    { label: "Dishes", value: "48" },
    { label: "Happy guests", value: "120k" },
  ],
  testimonials: [
    { quote: "The best meal we have had all year.", author: "Maya R." },
    { quote: "Cozy room, flawless service.", author: "Daniel K." },
    { quote: "Order the flatbread. Trust us.", author: "Priya S." },
  ],
  hours: {
    mon: { open: "11:00", close: "22:00" },
    tue: { open: "11:00", close: "22:00" },
    wed: { open: "11:00", close: "22:00" },
    thu: { open: "11:00", close: "23:00" },
    fri: { open: "11:00", close: "23:00" },
    sat: { open: "10:00", close: "23:00" },
    sun: { open: "10:00", close: "21:00" },
    today_tag: "Made with fresh ingredients",
  },
  address: "12 Ember Lane, Portland, OR",
  phone: "+1 (555) 012-3456",
  email: "hello@tableandflame.example",
  directions_url: "https://maps.example.com/?q=table-and-flame",
  socials: {
    instagram: "https://instagram.com/tableandflame",
    facebook: "https://facebook.com/tableandflame",
  },
  nav_labels: { home: "Home", menu: "Menu", about: "About", contact: "Contact" },
  footer_note: "Family-run since 2012.",
};

// ── Car rental: DriveLine ───────────────────────────────────────────────────

export const RENTAL_SAMPLES: ContentDoc = {
  business_name: "DriveLine",
  tagline: "The right car, ready when you are",
  hero_image: ph("rental", "hero.svg"),
  hero_headline: "Rent the right car, today",
  primary_cta_label: "Ask about availability",
  about_image: ph("rental", "about.svg"),
  about_text:
    "A local fleet, transparent prices, and handover in minutes. No hidden fees, no surprises at the counter.",
  trust: [
    { title: "Clear rental details", description: "Review the terms with the team before you travel." },
    { title: "Insurance included", description: "Every rental, every time." },
    { title: "24/7 support", description: "Real humans, day and night." },
    { title: "No hidden fees", description: "The price you see is the price." },
  ],
  steps: [
    { title: "Ask", description: "Contact the team with your preferred dates and vehicle." },
    { title: "Confirm", description: "Review availability and collection details together." },
    { title: "Prepare", description: "Confirm the arrangements before your trip." },
  ],
  testimonials: [
    { quote: "Spotless car, five-minute pickup.", author: "Jonas P." },
    { quote: "Cheaper than the airport counters.", author: "Amara O." },
    { quote: "Support answered at midnight.", author: "Leo M." },
  ],
  faq: [
    { question: "What deposit do I pay?", answer: "A refundable deposit is held on your card and released after return." },
    { question: "Which driver's license do I need?", answer: "A valid license held for at least one year." },
    { question: "What is the minimum age?", answer: "21 for Economy, 25 for SUV and Luxury." },
    { question: "What is the fuel policy?", answer: "Return with the same level: full-to-full." },
  ],
  locations: [
    { name: "Downtown Hub", address: "44 Harbor Street", hours: "Mon–Sun 8:00–20:00" },
    { name: "Airport Desk", address: "Terminal 2, Arrivals", hours: "Mon–Sun 6:00–23:00" },
  ],
  hours: {
    mon: { open: "08:00", close: "20:00" },
    tue: { open: "08:00", close: "20:00" },
    wed: { open: "08:00", close: "20:00" },
    thu: { open: "08:00", close: "20:00" },
    fri: { open: "08:00", close: "20:00" },
    sat: { open: "09:00", close: "18:00" },
    sun: { closed: true },
    today_tag: "Your next journey starts here",
  },
  address: "44 Harbor Street, Portland, OR",
  phone: "+1 (555) 987-6543",
  email: "hello@driveline.example",
  directions_url: "https://maps.example.com/?q=driveline",
  socials: {
    instagram: "https://instagram.com/driveline",
    facebook: "https://facebook.com/driveline",
  },
  nav_labels: { fleet: "Fleet", how: "How It Works", pricing: "Pricing", faq: "FAQ", contact: "Contact" },
  footer_note: "Drive safe.",
};

// ── Category-neutral food ordering: Food Order ──────────────────────────────

export const FOOD_ORDER_SAMPLES: ContentDoc = {
  business_name: "Your business",
  tagline: "A thoughtful place to begin",
  hero_headline: "Find something that fits the moment",
  hero_subtext: "Explore what is available, learn about the people behind it, and choose a next step that works for you.",
  primary_cta_label: "Explore options",
  secondary_cta_label: "Get in touch",
  steps: [
    { title: "Explore", description: "Look through the options this business offers." },
    { title: "Choose", description: "Share what you are interested in." },
    { title: "Confirm", description: "The business will confirm the details with you." },
  ],
  about_text: "Learn about the people, ideas, and care behind this business.",
  testimonials: [],
  nav_labels: {
    home: "Home",
    menu: "Explore",
    order: "Order",
    reservations: "Reservations",
    about: "About",
    contact: "Contact",
  },
};

// Render-only sample cards for Store previews. No reference photos, category,
// price, or claim is invented; published product cards always come from the
// tenant-scoped products resolver.
export const STORE_PREVIEW_PRODUCTS: StorefrontProductPreviewItem[] = [
  {
    id: "store-preview-example-item",
    name: "Example item",
    slug: "",
    description: "Product details will appear here.",
    images: [],
    price_type: "one_time",
    stock_quantity: null,
    status: "active",
    isDraft: false,
    category: null,
    tags: [],
    stripe_price_id: null,
  },
  {
    id: "store-preview-everyday-find",
    name: "Everyday find",
    slug: "",
    description: "Explore the details shared by this business.",
    images: [],
    price_type: "one_time",
    stock_quantity: null,
    status: "active",
    isDraft: false,
    category: null,
    tags: [],
    stripe_price_id: null,
  },
  {
    id: "store-preview-new-favorite",
    name: "A new favorite",
    slug: "",
    description: "Choose an item that fits your needs.",
    images: [],
    price_type: "one_time",
    stock_quantity: null,
    status: "active",
    isDraft: false,
    category: null,
    tags: [],
    stripe_price_id: null,
  },
];

export const STORE_SAMPLES: ContentDoc = {
  business_name: "Your business",
  tagline: "A thoughtful place to begin",
  hero_headline: "Find something that fits your day",
  hero_subtext: "Explore the collection, read the details, and choose what feels right for you.",
  primary_cta_label: "Shop now",
  template_extras: { storeTrustText: "Explore at your pace. Product details are shared by this business." },
  testimonials: [],
  nav_labels: { home: "Home", shop: "Shop", contact: "Contact" },
};

export const FLAGSHIP_SAMPLES: Record<string, ContentDoc> = {
  "restaurant-table-flame": RESTAURANT_SAMPLES,
  "rental-driveline": RENTAL_SAMPLES,
  "food-order": FOOD_ORDER_SAMPLES,
  store: STORE_SAMPLES,
};
