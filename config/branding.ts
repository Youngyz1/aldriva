/**
 * Single source of truth for platform branding.
 *
 * Rebranding the app should require editing only this file — name, slogan,
 * default SEO/OpenGraph/Twitter copy, and brand assets all flow from here.
 * `website` is intentionally blank until a production domain is chosen;
 * see lib/site-url.ts for how the app resolves the actual site origin.
 */

export const BRAND = {
  name: "Aldriva",
  shortName: "Aldriva",
  slogan: "Connect. Support. Grow.",
  description:
    "A platform for events, fundraising, communities, businesses, products and services.",
  website: "",
  supportEmail: "",
  social: {
    twitter: "",
    facebook: "",
    instagram: "",
  },
  assets: {
    logo: "/logo.png",
    ogImage: "/og-image.jpg",
  },
  seo: {
    defaultTitle: "Aldriva — Events, Fundraising & Community Platform",
    titleTemplate: "%s | Aldriva",
    defaultDescription:
      "Aldriva helps individuals, organizations, and communities create events, raise funds, and grow — all in one place.",
    keywords: [
      "aldriva",
      "events platform",
      "online fundraising",
      "fundraising platform",
      "crowdfunding platform",
      "community platform",
      "business directory",
    ],
  },
  ogTitle: "Aldriva — Events, Fundraising & Community Platform",
  twitterTitle: "Aldriva — Events, Fundraising & Community Platform",
} as const;

export type Brand = typeof BRAND;
