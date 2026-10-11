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

export const PLACEHOLDER_BASE = "/placeholders";

function ph(template: string, file: string): string {
  return `${PLACEHOLDER_BASE}/${template}/${file}`;
}

// ── Restaurant: Table & Flame ───────────────────────────────────────────────

export const RESTAURANT_SAMPLES: ContentDoc = {
  business_name: "Table & Flame",
  tagline: "Wood-fired kitchen & neighborhood bar",
  hero_image: ph("restaurant", "hero.jpg"),
  hero_headline: "Fire-kissed dishes, served with warmth",
  hero_subtext: "Seasonal ingredients, an open flame, and a table that always feels like home.",
  primary_cta_label: "Order Now",
  secondary_cta_label: "View Menu",
  about_image: ph("restaurant", "about.jpg"),
  about_text:
    "Since 2012 we have cooked the food we love to eat: simple plates, bold flavors, and produce picked every morning.",
  gallery_images: [
    ph("restaurant", "gallery-1.jpg"),
    ph("restaurant", "gallery-2.jpg"),
    ph("restaurant", "gallery-3.jpg"),
    ph("restaurant", "gallery-4.jpg"),
    ph("restaurant", "gallery-5.jpg"),
    ph("restaurant", "gallery-6.jpg"),
  ],
  highlights: [
    { title: "Fresh daily", description: "Produce picked every morning." },
    { title: "Pickup and delivery", description: "Hot at your door in minutes." },
    { title: "Reservations", description: "Book a table in seconds." },
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
    today_tag: "Open today until 10pm",
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
  hero_image: ph("rental", "hero.jpg"),
  hero_headline: "Rent the right car, today",
  primary_cta_label: "Book a Car",
  about_image: ph("rental", "about.jpg"),
  about_text:
    "A local fleet, transparent prices, and handover in minutes. No hidden fees, no surprises at the counter.",
  trust: [
    { title: "Free cancellation", description: "Up to 24h before pickup." },
    { title: "Insurance included", description: "Every rental, every time." },
    { title: "24/7 support", description: "Real humans, day and night." },
    { title: "No hidden fees", description: "The price you see is the price." },
  ],
  steps: [
    { title: "Choose", description: "Pick the car that fits your trip." },
    { title: "Book", description: "Reserve online in two minutes." },
    { title: "Drive", description: "Collect the keys and go." },
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
    today_tag: "Open today until 8pm",
  },
  address: "44 Harbor Street, Portland, OR",
  phone: "+1 (555) 987-6543",
  email: "book@driveline.example",
  directions_url: "https://maps.example.com/?q=driveline",
  socials: {
    instagram: "https://instagram.com/driveline",
    facebook: "https://facebook.com/driveline",
  },
  nav_labels: { fleet: "Fleet", how: "How It Works", pricing: "Pricing", faq: "FAQ", contact: "Contact" },
  footer_note: "Drive safe.",
};

export const FLAGSHIP_SAMPLES: Record<string, ContentDoc> = {
  "restaurant-table-flame": RESTAURANT_SAMPLES,
  "rental-driveline": RENTAL_SAMPLES,
};
