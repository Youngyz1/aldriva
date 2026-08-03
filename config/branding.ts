// config/branding.ts

export const BRAND = {
  // Platform
  name: "Aldriva",
  shortName: "Aldriva",

  slogan: "Everything Your Business Needs. One Platform.",

  website: "https://aldriva.com",

  // Contact
  supportEmail: "support@aldriva.com",
  contactEmail: "contact@aldriva.com",

  // Official Aldriva social accounts
  // These appear on the platform itself (footer, contact page, etc.)
  // They are NOT the social links users add to their own websites.
  social: {
    facebook: "",
    instagram: "",
    linkedin: "",
    x: "",
    youtube: "",
  },

  // Brand assets
  assets: {
    logo: "/logo.png",
    logoDark: "/logo-dark.png",
    favicon: "/favicon.ico",
    ogImage: "/og-image.jpg",
  },

  // Default SEO
  seo: {
    defaultTitle: "Aldriva | Build, Sell, Publish & Grow",

    titleTemplate: "%s | Aldriva",

    defaultDescription:
      "Aldriva is an all-in-one business platform where you can build websites, create landing pages and portfolios, sell digital products, publish blogs and articles, host events, launch fundraising campaigns, and grow your audience.",

    keywords: [
      "Aldriva",
      "business platform",
      "website builder",
      "mini website",
      "landing page",
      "portfolio website",
      "digital products",
      "online business",
      "creator platform",
      "blogs",
      "articles",
      "content publishing",
      "events",
      "event management",
      "fundraising",
      "community",
      "online store",
      "ecommerce",
      "payments",
      "business tools",
      "small business",
      "startup",
      "marketing",
      "business growth",
    ],

    author: "Aldriva",
    robots: "index, follow",
    locale: "en_US",
  },
} as const;