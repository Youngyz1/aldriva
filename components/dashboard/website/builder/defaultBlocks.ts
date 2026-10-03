/**
 * components/dashboard/website/builder/defaultBlocks.ts
 *
 * Default factory templates for all 10 standard + 2 legacy block types.
 */

import { Block, normalizeBlock } from "@/lib/website-blocks";

export interface BlockCatalogItem {
  type: string;
  label: string;
  category: "hero" | "content" | "media" | "social" | "embeds" | "legacy";
  description: string;
  iconName: string;
  createDefault: () => Block;
}

export const BLOCK_CATALOG: BlockCatalogItem[] = [
  {
    type: "hero",
    label: "Hero Section",
    category: "hero",
    description: "High-impact headline banner with background image and call-to-action buttons.",
    iconName: "LayoutTemplate",
    createDefault: (): Block => normalizeBlock({
      type: "hero",
      heading: "Empowering our Community",
      subheading: "Join us in making a real, lasting impact through our initiatives and community events.",
      align: "center",
      variant: "center",
      ctaLabel: "Get Involved",
      ctaHref: "/events",
      secondaryCtaLabel: "Learn More",
      secondaryCtaHref: "#about",
    }),
  },
  {
    type: "features",
    label: "Features Grid",
    category: "content",
    description: "Responsive 2, 3, or 4 column grid of key programs or product highlights.",
    iconName: "Grid",
    createDefault: (): Block => normalizeBlock({
      type: "features",
      heading: "What We Do",
      subheading: "Discover the programs and initiatives making a difference in our community.",
      columns: 3,
      items: [
        {
          title: "Community Outreach",
          description: "Direct assistance and volunteer initiatives across our neighborhood.",
          icon: "Heart",
        },
        {
          title: "Education & Growth",
          description: "Workshops, training sessions, and resources for skill building.",
          icon: "BookOpen",
        },
        {
          title: "Sustainable Impact",
          description: "Long-term programs built for lasting positive change.",
          icon: "TrendingUp",
        },
      ],
    }),
  },
  {
    type: "about",
    label: "About & Mission",
    category: "content",
    description: "Narrative story, mission statement, founder profile, and metric milestones.",
    iconName: "User",
    createDefault: (): Block => normalizeBlock({
      type: "about",
      heading: "Our Story & Purpose",
      subheading: "Driven by compassion, community, and actionable change.",
      story: "Founded with a mission to bring people together, solve local challenges, and create opportunities for everyone.",
      mission: "To create sustainable, positive change and empower every individual through collective action.",
      founderName: "Alex Morgan",
      founderRole: "Executive Director",
      highlights: [
        { label: "Community Members", value: "2,500+" },
        { label: "Projects Completed", value: "48" },
        { label: "Volunteers Active", value: "150+" },
      ],
    }),
  },
  {
    type: "gallery",
    label: "Media Gallery",
    category: "media",
    description: "Visual grid, masonry, or carousel showcase of event photos and achievements.",
    iconName: "Image",
    createDefault: (): Block => normalizeBlock({
      type: "gallery",
      heading: "Moments & Milestones",
      subheading: "Highlights from our recent community events and workshops.",
      layout: "grid",
      columns: 3,
      images: [
        {
          src: "https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=800&q=80",
          alt: "Community gathering",
          caption: "Annual Community Summit",
        },
        {
          src: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=800&q=80",
          alt: "Volunteer workshop",
          caption: "Volunteer Training Day",
        },
        {
          src: "https://images.unsplash.com/photo-1531545514256-b1400bc00f31?auto=format&fit=crop&w=800&q=80",
          alt: "Team collaboration",
          caption: "Planning Workshop",
        },
      ],
    }),
  },
  {
    type: "testimonials",
    label: "Testimonials",
    category: "social",
    description: "Quotes from donors, volunteers, and customers with star ratings.",
    iconName: "MessageSquareQuote",
    createDefault: (): Block => normalizeBlock({
      type: "testimonials",
      heading: "Voices of Impact",
      subheading: "What our supporters and community partners say about our work.",
      layout: "grid",
      items: [
        {
          quote: "This organization has truly transformed our neighborhood. Transparent, dedicated, and deeply impactful.",
          author: "Sarah Jenkins",
          role: "Local Volunteer",
          rating: 5,
        },
        {
          quote: "Attending their events inspired me to give back. The team is genuinely committed to the community.",
          author: "David Chen",
          role: "Community Partner",
          rating: 5,
        },
      ],
    }),
  },
  {
    type: "contact",
    label: "Contact & Hours",
    category: "content",
    description: "Direct contact channels (email, phone, address, office hours) and location preview.",
    iconName: "PhoneCall",
    createDefault: (): Block => normalizeBlock({
      type: "contact",
      heading: "Get in Touch",
      subheading: "Have questions or want to partner with us? We'd love to hear from you.",
      email: "hello@organization.org",
      phone: "+1 (555) 019-2834",
      address: "123 Community Way, Suite 400, Austin, TX",
      hours: "Mon - Fri: 9:00 AM - 5:00 PM CST",
      showMap: false,
    }),
  },
  {
    type: "faq",
    label: "FAQ Accordion",
    category: "content",
    description: "Accessible collapsible questions and answers for quick visitor help.",
    iconName: "HelpCircle",
    createDefault: (): Block => normalizeBlock({
      type: "faq",
      heading: "Frequently Asked Questions",
      subheading: "Find quick answers to common questions about our initiatives.",
      items: [
        {
          question: "How can I participate in upcoming events?",
          answer: "You can register directly on our Events page or sign up for our newsletter to receive advance notice.",
        },
        {
          question: "Where do donations and funds go?",
          answer: "100% of community contributions directly fund local outreach, volunteer training, and community resources.",
        },
        {
          question: "Can I volunteer as a team or organization?",
          answer: "Yes! We welcome corporate and student groups. Reach out via our contact form to coordinate.",
        },
      ],
    }),
  },
  {
    type: "events_embed",
    label: "Events Feed",
    category: "embeds",
    description: "Dynamic feed displaying live upcoming events and ticket registration.",
    iconName: "Calendar",
    createDefault: (): Block => normalizeBlock({
      type: "events_embed",
      heading: "Upcoming Events",
      subheading: "Join us at our upcoming workshops, fundraisers, and community sessions.",
      layout: "grid",
      limit: 3,
      showDrafts: false,
      selectedEventIds: [],
    }),
  },
  {
    type: "products_embed",
    label: "Products Catalog",
    category: "embeds",
    description: "Showcase merchandise, tickets, or digital goods from your storefront.",
    iconName: "ShoppingBag",
    createDefault: (): Block => normalizeBlock({
      type: "products_embed",
      heading: "Merchandise & Products",
      subheading: "Support our mission by purchasing official merchandise and materials.",
      layout: "grid",
      limit: 3,
      showDrafts: false,
      selectedProductIds: [],
    }),
  },
  {
    type: "fundraiser_embed",
    label: "Fundraiser Campaign",
    category: "embeds",
    description: "Display active fundraising progress bars and donation callouts.",
    iconName: "HeartHandshake",
    createDefault: (): Block => normalizeBlock({
      type: "fundraiser_embed",
      heading: "Featured Campaign",
      subheading: "Help us reach our funding goal to support families in need.",
      layout: "card",
      limit: 1,
      selectedFundraiserIds: [],
    }),
  },
  {
    type: "rich_text",
    label: "Rich Text Prose",
    category: "legacy",
    description: "Custom rich formatted text, paragraphs, and announcements.",
    iconName: "FileText",
    createDefault: (): Block => normalizeBlock({
      type: "rich_text",
      html: "<p>Welcome to our official website. Stay tuned for exciting updates, project announcements, and opportunities to connect with our community.</p>",
    }),
  },
  {
    type: "cta_banner",
    label: "CTA Banner",
    category: "legacy",
    description: "Bold full-width call to action banner prompting user registration.",
    iconName: "Megaphone",
    createDefault: (): Block => normalizeBlock({
      type: "cta_banner",
      heading: "Ready to Make a Difference?",
      subheading: "Join hundreds of community members today and start taking action.",
      ctaLabel: "Join Now",
      ctaHref: "/contact",
    }),
  },
];
