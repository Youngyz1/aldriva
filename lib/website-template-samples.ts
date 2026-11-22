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
import type {
  PreviewMenuPromotion,
  PreviewMenuSection,
  StorefrontProductPreviewItem,
} from "./website-blocks";

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

export const SAVANNAH_SAMPLES: ContentDoc = {
  business_name: "Savannah",
  tagline: "A table for every occasion",
  hero_headline: "Seasonal cooking, thoughtfully served",
  hero_subtext: "A considered menu, a welcoming room, and time well spent around the table.",
  primary_cta_label: "Order Now",
  secondary_cta_label: "View Menu",
  about_text: "Savannah brings seasonal ingredients and generous hospitality together in a calm, contemporary dining room.",
  highlights: [
    { title: "Seasonal menu", description: "Thoughtful plates guided by what is fresh." },
    { title: "Made with care", description: "A kitchen led by craft and good ingredients." },
  ],
  stats: [],
  testimonials: [{ quote: "A thoughtful meal from the first course to the last.", author: "A guest" }],
  nav_labels: { home: "Home", menu: "Menu", order: "Order", reservations: "Reservations", about: "About", contact: "Contact" },
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

export const SHOWCASE_SAMPLES: ContentDoc = {
  business_name: "Your business",
  tagline: "Seasonal plates, every day",
  hero_image: ph("showcase", "promo-dining-room.webp"),
  hero_headline: "A table in the neighbourhood",
  hero_subtext: "Fresh, seasonal plates in a warm room.",
  about_caption: "Our kitchen",
  about_headline: "Cooked fresh, every day",
  about_image: ph("showcase", "about-chef.webp"),
  about_text:
    "We cook simple food with ingredients we are proud of, in a room made for long lunches and late dinners. Every dish is prepared to order, and there is always something new to try.",
  primary_cta_label: "View menu",
  trust: [
    { title: "Pickup & delivery", description: "Order ahead and collect when it suits you." },
    { title: "Fresh ingredients", description: "Cooked to order from seasonal produce." },
    { title: "Dietary options", description: "Vegetarian and vegan dishes are marked." },
    { title: "Open 7 days", description: "Lunch and dinner, every day of the week." },
  ],
  hours: {
    mon: { open: "11:30", close: "22:00" },
    tue: { open: "11:30", close: "22:00" },
    wed: { open: "11:30", close: "22:00" },
    thu: { open: "11:30", close: "22:00" },
    fri: { open: "11:30", close: "23:00" },
    sat: { open: "11:00", close: "23:00" },
    sun: { open: "11:00", close: "21:00" },
    today_tag: "Open today",
  },
  address: "123 Sample Street, Springfield",
  phone: "+1 (555) 010-0100",
  email: "hello@example.com",
  nav_labels: { home: "Home", menu: "Menu", contact: "Contact" },
  footer_note: "Sample content shown while this template preview is empty.",
};

export const SHOWCASE_SAMPLES_FR: ContentDoc = {
  business_name: "Votre entreprise",
  tagline: "Des plats de saison, chaque jour",
  hero_image: ph("showcase", "promo-dining-room.webp"),
  hero_headline: "Une table dans le quartier",
  hero_subtext: "Des plats frais et de saison, dans une salle chaleureuse.",
  about_caption: "Notre cuisine",
  about_headline: "Cuisiné frais, chaque jour",
  about_image: ph("showcase", "about-chef.webp"),
  about_text:
    "Nous cuisinons simplement avec des ingrédients dont nous sommes fiers, dans une salle pensée pour les longs déjeuners et les dîners tardifs. Chaque plat est préparé à la commande.",
  primary_cta_label: "Voir le menu",
  trust: [
    { title: "À emporter et livraison", description: "Commandez à l'avance et récupérez quand vous voulez." },
    { title: "Ingrédients frais", description: "Préparé à la commande avec des produits de saison." },
    { title: "Options alimentaires", description: "Les plats végétariens et végétaliens sont indiqués." },
    { title: "Ouvert 7 jours", description: "Déjeuner et dîner, tous les jours de la semaine." },
  ],
  hours: {
    mon: { open: "11:30", close: "22:00" },
    tue: { open: "11:30", close: "22:00" },
    wed: { open: "11:30", close: "22:00" },
    thu: { open: "11:30", close: "22:00" },
    fri: { open: "11:30", close: "23:00" },
    sat: { open: "11:00", close: "23:00" },
    sun: { open: "11:00", close: "21:00" },
    today_tag: "Ouvert aujourd'hui",
  },
  address: "123 Rue de l'Exemple, Springfield",
  phone: "+1 (555) 010-0100",
  email: "hello@example.com",
  nav_labels: { home: "Accueil", menu: "Menu", contact: "Contact" },
  footer_note: "Contenu d'exemple affiché tant que cet aperçu du modèle est vide.",
};

/**
 * Render-only sample menu for the Showcase template preview.
 *
 * Marked `isSample` and never written to a business's content document: the
 * resolver only attaches it to blocks while `includeSamples` is true, and a
 * published site resolves its own tenant menu instead (section 10e).
 */
const showcaseMenuSection = (
  id: string,
  name: string,
  description: string,
  items: PreviewMenuSection["items"]
): PreviewMenuSection => ({
  id,
  name,
  description,
  is_active: true,
  isDraft: false,
  isSample: true,
  // Back-reference so "You might also like" (Task 3) can group preview
  // items by category the same way a real tenant's section_id does.
  items: items.map((item) => ({ ...item, section_id: id })),
});

const showcaseMenuItem = (item: {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  image_url?: string | null;
  dietary_tags?: string[];
  allergens?: string[];
  is_featured?: boolean;
  is_popular?: boolean;
  effective_price?: number;
  original_price?: number;
  discount_per_unit?: number;
  option_groups?: PreviewMenuSection["items"][number]["option_groups"];
}): PreviewMenuSection["items"][number] => ({
  id: item.id,
  name: item.name,
  description: item.description ?? null,
  price: item.price,
  image_url: item.image_url ?? null,
  dietary_tags: item.dietary_tags ?? [],
  allergens: item.allergens ?? [],
  modifiers: [],
  is_active: true,
  isDraft: false,
  is_featured: Boolean(item.is_featured),
  is_popular: item.is_popular,
  isSample: true,
  ...(item.effective_price !== undefined ? { effective_price: item.effective_price } : {}),
  ...(item.original_price !== undefined ? { original_price: item.original_price } : {}),
  ...(item.discount_per_unit !== undefined ? { discount_per_unit: item.discount_per_unit } : {}),
  ...(item.option_groups !== undefined ? { option_groups: item.option_groups } : {}),
});

/**
 * Sample option groups for the Showcase item sheet preview (Task 2):
 * a required size variant plus two optional add-on groups. Render-only —
 * never written to a business's content document (see isSample above).
 */
function showcaseSizeAndAddons(basePrice: number): PreviewMenuSection["items"][number]["option_groups"] {
  return [
    {
      id: "sample-group-size",
      name: "Choose a size",
      required: true,
      min: 1,
      max: 1,
      kind: "variant",
      options: [
        { id: "sample-size-small", name: "Small", price: basePrice, price_delta: 0, is_default: true, is_available: true },
        { id: "sample-size-large", name: "Large", price: basePrice + 4, price_delta: 0, is_available: true },
      ],
    },
    {
      id: "sample-group-extras",
      name: "Extras",
      required: false,
      min: 0,
      max: 3,
      kind: "addon",
      options: [
        { id: "sample-extra-meat", name: "Extra meat", price_delta: 3, max_qty: 2, is_available: true },
        { id: "sample-extra-fish", name: "Extra fish", price_delta: 4, max_qty: 2, is_available: true },
        { id: "sample-extra-plantain", name: "Fried plantain", price_delta: 2, max_qty: 2, is_available: true },
      ],
    },
    {
      id: "sample-group-drinks",
      name: "Drinks",
      required: false,
      min: 0,
      max: 2,
      kind: "addon",
      options: [
        { id: "sample-drink-cola", name: "Coca-Cola", price_delta: 2, is_available: true },
        { id: "sample-drink-water", name: "Water", price_delta: 1, is_available: true },
      ],
    },
  ];
}

export const SHOWCASE_PREVIEW_MENU: PreviewMenuSection[] = [
  showcaseMenuSection("sample-soups-rice", "Soups & Rice", "Comfort bowls, made to order.", [
    showcaseMenuItem({
      id: "sample-roasted-tomato-soup",
      name: "Roasted tomato soup",
      description: "Slow-roasted tomatoes, basil and a swirl of cream.",
      price: 9,
      image_url: ph("showcase", "menu-soup.webp"),
      dietary_tags: ["Vegetarian"],
      allergens: ["Milk"],
    }),
    showcaseMenuItem({
      id: "sample-garden-rice-bowl",
      name: "Garden rice bowl",
      description: "Herbed rice, roasted vegetables and lemon dressing.",
      price: 13.5,
      image_url: ph("showcase", "menu-rice-bowl.webp"),
      dietary_tags: ["Vegan"],
      allergens: [],
    }),
    showcaseMenuItem({
      id: "sample-chicken-fried-rice",
      name: "Chicken fried rice",
      description: "Wok-fried rice with chicken, peas and spring onion.",
      price: 14,
      image_url: ph("showcase", "menu-fried-rice.webp"),
      dietary_tags: [],
      allergens: ["Soy", "Egg"],
      is_featured: true,
      is_popular: true,
      option_groups: showcaseSizeAndAddons(14),
    }),
  ]),
  showcaseMenuSection("sample-grills-mains", "Grills & Mains", "From the grill and the plancha.", [
    showcaseMenuItem({
      id: "sample-seared-steak-salad",
      name: "Seared steak salad",
      description: "Sliced steak, bitter leaves and a mustard dressing.",
      price: 21,
      effective_price: 16.8,
      original_price: 21,
      discount_per_unit: 4.2,
      image_url: ph("showcase", "menu-steak.webp"),
      dietary_tags: [],
      allergens: ["Mustard"],
      is_featured: true,
    }),
    showcaseMenuItem({
      id: "sample-grilled-chicken-plate",
      name: "Grilled chicken plate",
      description: "Charred chicken, flatbread and grilled vegetables.",
      price: 18,
      image_url: ph("showcase", "menu-grilled-chicken.webp"),
      dietary_tags: [],
      allergens: ["Gluten"],
      is_featured: true,
    }),
    showcaseMenuItem({
      id: "sample-classic-cheeseburger",
      name: "Classic cheeseburger",
      description: "Beef patty, cheddar, pickles and house sauce.",
      price: 15,
      image_url: ph("showcase", "menu-burger.webp"),
      dietary_tags: [],
      allergens: ["Gluten", "Milk", "Egg"],
      option_groups: showcaseSizeAndAddons(15),
    }),
  ]),
  showcaseMenuSection("sample-sweets-drinks", "Sweets & Drinks", "Something sweet, something hot.", [
    showcaseMenuItem({
      id: "sample-chocolate-layer-cake",
      name: "Chocolate layer cake",
      description: "Dark chocolate sponge, cream and cherries.",
      price: 8,
      image_url: ph("showcase", "menu-chocolate-cake.webp"),
      dietary_tags: ["Vegetarian"],
      allergens: ["Gluten", "Milk", "Egg"],
    }),
    showcaseMenuItem({
      id: "sample-flat-white",
      name: "Flat white",
      description: "Double shot of espresso with steamed milk.",
      price: 4.5,
      image_url: ph("showcase", "menu-latte.webp"),
      dietary_tags: ["Vegetarian"],
      allergens: ["Milk"],
    }),
  ]),
];

/** Render-only sample promotions for the Showcase template preview. */
export const SHOWCASE_PREVIEW_PROMOTIONS: PreviewMenuPromotion[] = [
  {
    id: "sample-promo-dining-room",
    organizer_id: "sample",
    name: "A table in the neighbourhood",
    headline: "A table in the neighbourhood",
    description: "Seasonal plates and a warm room, every day.",
    image_url: ph("showcase", "promo-dining-room.webp"),
    offer_type: "highlight",
    status: "active",
    layout: "banner",
    cta_label: "View menu",
    destination_type: "menu",
    destination_href: "/menu",
    destination_external: false,
    isSample: true,
  },
  {
    id: "sample-promo-sharing-table",
    organizer_id: "sample",
    name: "Made for sharing",
    headline: "Made for sharing",
    description: "Small plates and big platters for the whole table.",
    image_url: ph("showcase", "promo-sharing-table.webp"),
    offer_type: "highlight",
    status: "active",
    layout: "banner",
    cta_label: "See what is on",
    destination_type: "menu",
    destination_href: "/menu",
    destination_external: false,
    isSample: true,
  },
  {
    id: "sample-promo-cocktail",
    organizer_id: "sample",
    name: "Something new at the bar",
    headline: "Something new at the bar",
    description: "Fresh drinks, mixed to order.",
    image_url: ph("showcase", "promo-cocktail.webp"),
    offer_type: "highlight",
    status: "active",
    layout: "banner",
    cta_label: "Explore the menu",
    destination_type: "menu",
    destination_href: "/menu",
    destination_external: false,
    isSample: true,
  },
];

// ── Home cleaning: Fresh Home ───────────────────────────────────────────────

export const CLEANING_FRESH_SAMPLES: ContentDoc = {
  business_name: "Fresh Home",
  logo_url: "/placeholders/cleaning/logo.svg",
  hero_image: "/placeholders/cleaning/hero.svg",
  hero_headline: "A cleaner, calmer home, ready when you are.",
  hero_subtext: "Professional home cleaning booked around your schedule. Add your postcode and we will find your local team.",
  tagline: "Fresh Home",
  primary_cta_label: "Book now",
  secondary_cta_label: "Call us",
  trust: [
    { title: "Insured service", description: "Fully insured cleaning team." },
    { title: "Eco-friendly products", description: "Safe products for your home and family." },
    { title: "Vetted local team", description: "Professional, reference-checked cleaners." },
    { title: "Satisfaction guarantee", description: "We make it right if you are not happy." },
  ],
  benefits: [
    { title: "Flexible scheduling", description: "Choose the day and time that works for you." },
    { title: "Detailed checklists", description: "Every room covered, every visit." },
    { title: "Consistent team", description: "The same familiar cleaners where possible." },
    { title: "Easy rebooking", description: "Set up recurring visits in seconds." },
  ],
  steps: [
    { title: "Tell us your postcode", description: "We confirm we cover your area." },
    { title: "Choose your service", description: "Pick a cleaning type and frequency." },
    { title: "Confirm your visit", description: "Select a date and time slot." },
    { title: "Enjoy a cleaner home", description: "We handle the rest." },
  ],
  areas: [
    { title: "Central district", description: "City centre and nearby neighbourhoods." },
    { title: "East side", description: "East side suburbs and surrounding towns." },
    { title: "West side", description: "West side residential areas." },
    { title: "North district", description: "North side and outer suburbs." },
  ],
  gallery_images: [
    "/placeholders/cleaning/gallery-1.svg",
    "/placeholders/cleaning/gallery-2.svg",
    "/placeholders/cleaning/gallery-3.svg",
    "/placeholders/cleaning/gallery-4.svg",
  ],
  testimonials: [
    { quote: "Add your review here", author: "A happy homeowner" },
  ],
  faq: [
    { question: "How is pricing shown?", answer: "Services with no set price read 'Price on request' until you request a quote." },
    { question: "Do you bring supplies?", answer: "Yes, the team brings eco-friendly products and equipment." },
    { question: "Can I cancel a visit?", answer: "Yes, cancel or reschedule up to 24 hours before your appointment." },
  ],
  services_heading: "Our cleaning services",
  services_limit: 6,
  services_layout: "grid",
  values: [
    { title: "Reliable", description: "We arrive on time, every visit." },
    { title: "Thorough", description: "Detail-focused cleaning you can see." },
    { title: "Kind to homes", description: "Products chosen for safety and care." },
    { title: "Local", description: "Cleaners from your own community." },
  ],
  team: [
    { title: "Meet the team", description: "Add a short note about your cleaning team here." },
  ],
  about_text: "Fresh Home helps households reclaim their time with dependable, professional home cleaning. Add your story here.",
  hours: {
    mon: { open: "08:00", close: "18:00" },
    tue: { open: "08:00", close: "18:00" },
    wed: { open: "08:00", close: "18:00" },
    thu: { open: "08:00", close: "18:00" },
    fri: { open: "08:00", close: "18:00" },
    sat: { open: "09:00", close: "14:00" },
    sun: { closed: true },
  },
  address: "Add your business address",
  phone: "Add your phone number",
  directions_url: "https://maps.example.com/",
  email: "hello@example.com",
  socials: {},
  nav_labels: { home: "Home", services: "Services", about: "About", contact: "Contact", book: "Book" },
  footer_note: "Placeholder footer note.",
  template_extras: { ctaBandHeading: "Ready for a cleaner home?", ctaBandButtonLabel: "Book now", ctaBandButtonLink: "/book" },
};

export const FLAGSHIP_SAMPLES: Record<string, ContentDoc> = {
  "restaurant-table-flame": RESTAURANT_SAMPLES,
  "restaurant-savannah": SAVANNAH_SAMPLES,
  "rental-driveline": RENTAL_SAMPLES,
  "food-order": FOOD_ORDER_SAMPLES,
  store: STORE_SAMPLES,
  "cleaning-fresh": CLEANING_FRESH_SAMPLES,
  showcase: SHOWCASE_SAMPLES,
};
