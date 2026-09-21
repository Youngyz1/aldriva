import type { Block } from "./website-blocks";

export type WebsiteTemplateCategory =
  | "business"
  | "restaurant"
  | "retail"
  | "service"
  | "professional"
  | "creative"
  | "organization";

export type WebsiteTemplateStyle = "modern" | "minimal" | "bold" | "warm";

export type WebsiteTemplate = {
  id: string;
  name: string;
  description: string;
  category: WebsiteTemplateCategory;
  style: WebsiteTemplateStyle;
  previewColor: string;
  defaultBlocks: Block[];
};

export const WEBSITE_TEMPLATES: WebsiteTemplate[] = [
  {
    id: "business-starter",
    name: "Business Starter",
    description: "Clean hero, features, testimonials and contact — great for any business.",
    category: "business",
    style: "modern",
    previewColor: "#ea580c",
    defaultBlocks: [
      { type: "hero", heading: "Welcome to Your Business", subheading: "We help you grow with modern solutions tailored to your needs.", ctaLabel: "Get Started", ctaHref: "/contact", variant: "center", align: "center" },
      { type: "features", heading: "What We Do", subheading: "Everything you need in one place.", columns: 3, items: [{ title: "Fast & Reliable", description: "Built for speed and uptime you can trust.", icon: "⚡" }, { title: "Expert Support", description: "Friendly help when you need it most.", icon: "💬" }, { title: "Secure & Scalable", description: "Enterprise-grade security that grows with you.", icon: "🔒" }] },
      { type: "testimonials", heading: "What Customers Say", items: [{ quote: "Amazing service — our sales doubled in 3 months.", author: "Alex Morgan", role: "Founder, Startup Co" }, { quote: "Support team is responsive and genuinely helpful.", author: "Jamie Lee", role: "Owner, Local Shop" }] },
      { type: "contact", heading: "Get in Touch", subheading: "We'd love to hear from you.", email: "hello@example.com", phone: "+1 (555) 010-0000", address: "123 Business Ave, City, ST 12345", showMap: true },
    ],
  },
  {
    id: "restaurant-delight",
    name: "Restaurant Delight",
    description: "Appetizing hero, gallery, menu highlights and hours.",
    category: "restaurant",
    style: "warm",
    previewColor: "#d97706",
    defaultBlocks: [
      { type: "hero", heading: "Taste the Difference", subheading: "Fresh ingredients, crafted daily. Dine in or order online.", ctaLabel: "View Menu", ctaHref: "/menu", secondaryCtaLabel: "Reserve Table", secondaryCtaHref: "/contact", variant: "split", align: "left", badge: "Now Open" },
      { type: "gallery", heading: "Our Kitchen", subheading: "A glimpse inside.", columns: 3, layout: "grid", images: [{ src: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800", alt: "Restaurant interior" }, { src: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800", alt: "Dish" }, { src: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800", alt: "Dining" }] },
      { type: "features", heading: "Why Dine With Us", columns: 3, items: [{ title: "Farm Fresh", description: "Locally sourced every morning.", icon: "🥗" }, { title: "Wood-Fired", description: "Authentic flavor, every bite.", icon: "🔥" }, { title: "Family Owned", description: "30 years of hospitality.", icon: "❤️" }] },
      { type: "contact", heading: "Visit Us", email: "hello@restaurant.com", phone: "+1 (555) 123-4567", address: "42 Main St, Foodtown", hours: "Mon-Sun 11am - 10pm", showMap: true },
      { type: "faq", heading: "Good to Know", items: [{ question: "Do you take reservations?", answer: "Yes — call us or book via the contact form." }, { question: "Delivery available?", answer: "Yes, within 5 miles. Order via phone." }] },
    ],
  },
  {
    id: "retail-boutique",
    name: "Retail Boutique",
    description: "Product embeds, gallery and promotion banner for shops.",
    category: "retail",
    style: "minimal",
    previewColor: "#18181b",
    defaultBlocks: [
      { type: "hero", heading: "Curated for You", subheading: "Discover products you’ll love — hand-picked every season.", ctaLabel: "Shop Now", ctaHref: "/products", variant: "split", align: "left" },
      { type: "products_embed", heading: "Featured Products", subheading: "Our bestsellers.", limit: 6, layout: "grid" },
      { type: "gallery", heading: "Lookbook", layout: "carousel", images: [{ src: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800", alt: "Store" }] },
      { type: "testimonials", heading: "Loved by Customers", items: [{ quote: "Best boutique in town — always finds me the perfect fit.", author: "Taylor Swift", rating: 5 }] },
      { type: "cta_banner", heading: "Get 10% off your first order", subheading: "Join our newsletter.", ctaLabel: "Join Now", ctaHref: "/contact", variant: "brand" },
    ],
  },
  {
    id: "service-pro",
    name: "Service Pro",
    description: "Trust-building features, about and booking CTA for services.",
    category: "service",
    style: "modern",
    previewColor: "#2563eb",
    defaultBlocks: [
      { type: "hero", heading: "Professional Services", subheading: "Trusted by hundreds of happy clients. Book today.", ctaLabel: "Book Now", ctaHref: "/contact", badge: "Licensed & Insured", variant: "center" },
      { type: "features", heading: "Our Services", columns: 3, items: [{ title: "Consultation", description: "Free assessment and quote.", icon: "📋" }, { title: "On-Time", description: "We respect your schedule.", icon: "⏱️" }, { title: "Guaranteed", description: "Satisfaction guaranteed.", icon: "✅" }] },
      { type: "about", heading: "About Us", story: "We’ve served the community for over a decade with integrity and craftsmanship.", mission: "To deliver exceptional service with honesty and care.", founderName: "Jordan Smith", founderRole: "Lead Professional", highlights: [{ label: "Clients", value: "500+", icon: "👥" }, { label: "Years", value: "12", icon: "📅" }, { label: "Rating", value: "4.9/5", icon: "⭐" }] },
      { type: "contact", heading: "Book a Service", showMap: false },
      { type: "faq", heading: "FAQ", items: [{ question: "What areas do you cover?", answer: "Citywide and surrounding suburbs." }, { question: "How do I pay?", answer: "Cash, card, or bank transfer." }] },
    ],
  },
  {
    id: "creative-portfolio",
    name: "Creative Portfolio",
    description: "Bold hero, gallery and testimonials for creatives and portfolios.",
    category: "creative",
    style: "bold",
    previewColor: "#4f46e5",
    defaultBlocks: [
      { type: "hero", heading: "Design that Speaks", subheading: "Portfolio of work that blends art and strategy.", ctaLabel: "View Work", ctaHref: "#gallery", secondaryCtaLabel: "Contact", secondaryCtaHref: "/contact", variant: "center" },
      { type: "gallery", heading: "Selected Work", layout: "masonry", columns: 3, images: [{ src: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800", alt: "Work 1" }, { src: "https://images.unsplash.com/photo-1508923446990-8364b10a3bb5?w=800", alt: "Work 2" }, { src: "https://images.unsplash.com/photo-152254255022e-0da6a9aeefed?w=800", alt: "Work 3" }] },
      { type: "about", heading: "Hello", subheading: "I’m a designer & maker.", story: "Crafting digital experiences for 8 years." },
      { type: "contact", heading: "Let’s Work Together", subheading: "Available for freelance projects.", email: "hello@portfolio.com" },
    ],
  },
  {
    id: "organization-impact",
    name: "Organization Impact",
    description: "Story, sponsors, fundraisers and contact for nonprofits.",
    category: "organization",
    style: "warm",
    previewColor: "#059669",
    defaultBlocks: [
      { type: "hero", heading: "Make an Impact", subheading: "Join our mission to create lasting change in our community.", ctaLabel: "Donate Now", ctaHref: "/donate", variant: "center", badge: "Nonprofit" },
      { type: "about", heading: "Our Story", story: "Founded in 2015 to support local families in need.", mission: "Empowering communities through action and compassion.", highlights: [{ label: "Raised", value: "$250k", icon: "💚" }, { label: "Families", value: "1.2k", icon: "🏠" }] },
      { type: "fundraiser_embed", heading: "Active Campaigns", layout: "banner", limit: 3 },
      { type: "events_embed", heading: "Upcoming Events", layout: "grid", limit: 3 },
      { type: "contact", heading: "Get Involved", subheading: "Volunteer, donate, or spread the word." },
    ],
  },
];

export function getTemplateById(id: string): WebsiteTemplate | undefined {
  return WEBSITE_TEMPLATES.find((t) => t.id === id);
}

export function getTemplatesByCategory(category: WebsiteTemplateCategory): WebsiteTemplate[] {
  return WEBSITE_TEMPLATES.filter((t) => t.category === category);
}
