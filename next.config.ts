import type { NextConfig } from "next";

// isDev is true only when BOTH environment signals agree this is not production.
// VERCEL_ENV is injected by Vercel's build infrastructure and cannot be
// overridden by a .env file, providing a second layer of protection against
// a misconfigured NODE_ENV leaking unsafe-eval into a production deploy.
const isDev =
  process.env.NODE_ENV !== "production" &&
  process.env.VERCEL_ENV !== "production";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";
const supabaseWssOrigin = supabaseOrigin.replace(/^https:/, "wss:");

const cspDirectives = [
  "default-src 'self'",
  [
    "script-src",
    "'self'",
    "'unsafe-inline'",
    isDev ? "'unsafe-eval'" : "",
    "https://js.stripe.com",
    "https://*.js.stripe.com",
    "https://www.googletagmanager.com",
  ],
  [
    "style-src",
    "'self'",
    "'unsafe-inline'",
    "https://cdn.jsdelivr.net",
    "https://fonts.googleapis.com",
  ],
  [
    "img-src",
    "'self'",
    "data:",
    "blob:",
    "https://images.unsplash.com",
    supabaseOrigin,
    "https://img.evbuc.com",
    "https://s1.ticketm.net",
    "https://seatgeekimages.com",
    "https://images.gofundme.com",
    "https://d2g8igdw686xgo.cloudfront.net",
    "https://upload.wikimedia.org",
    "https://*.tile.openstreetmap.org",
    "https://*.stripe.com",
    "https://*.link.com",
    "https://lh3.googleusercontent.com",
    "https://www.google-analytics.com",
  ],
  [
    "font-src",
    "'self'",
    "data:",
    "https://cdn.jsdelivr.net",
    "https://fonts.gstatic.com",
  ],
  [
    "connect-src",
    "'self'",
    supabaseOrigin,
    supabaseWssOrigin,
    "https://api.stripe.com",
    "https://link.com",
    "https://*.link.com",
    "https://fonts.googleapis.com",
    "https://www.google-analytics.com",
    "https://*.google-analytics.com",
    "https://ipwho.is",
    isDev ? "ws:" : "",
    isDev ? "http://localhost:*" : "",
    isDev ? "http://127.0.0.1:*" : "",
  ],
  [
    "frame-src",
    "'self'",
    "https://js.stripe.com",
    "https://*.js.stripe.com",
    "https://hooks.stripe.com",
    "https://link.com",
    "https://*.link.com",
    "https://www.youtube.com",
    "https://www.youtube-nocookie.com",
    "https://player.vimeo.com",
  ],
  ["media-src", "'self'", "blob:", supabaseOrigin],
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "manifest-src 'self'",
  isDev ? "" : "upgrade-insecure-requests",
]
  .map((directive) =>
    Array.isArray(directive) ? directive.filter(Boolean).join(" ") : directive
  )
  .filter(Boolean)
  .join("; ");

const nextConfig: NextConfig = {
  // TEMPORARY — Cache Components Phase 0 validation only, on the
  // cache-components/phase-0-suspense-wrap branch. Do not merge to main with
  // this enabled until Phase 1 decomposition work is done.
  cacheComponents: true,
  // Lets the dev server accept requests from a phone/tablet on the same LAN
  // (e.g. http://192.168.1.4:3000) without the "Blocked cross-origin request"
  // warning, so Fast Refresh/HMR works when testing on a real device.
  allowedDevOrigins: isDev ? ["192.168.1.3"] : undefined,
  images: {
    remotePatterns: [
      // Unsplash – used for hero images and fallbacks
      { protocol: "https", hostname: "images.unsplash.com" },
      // Supabase Storage – matches any project subdomain
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
      // External event sources
      { protocol: "https", hostname: "img.evbuc.com" },
      { protocol: "https", hostname: "s1.ticketm.net" },
      { protocol: "https", hostname: "seatgeek.com" },
      { protocol: "https", hostname: "*.seatgeek.com" },
      { protocol: "https", hostname: "seatgeekimages.com" },
      { protocol: "https", hostname: "*.seatgeekimages.com" },
      { protocol: "https", hostname: "images.gofundme.com" },
      { protocol: "https", hostname: "d2g8igdw686xgo.cloudfront.net" },
      // Wikimedia Commons – TopDestinations landmark photos
      { protocol: "https", hostname: "upload.wikimedia.org" },
      // Google / misc avatars that may appear in reviews/testimonials
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
    ],
    // Allow unoptimised fallback for blobs (editor-uploaded media)
    dangerouslyAllowSVG: false,
  },
  async redirects() {
    return [
      {
        source: "/organizations/:slug*",
        destination: "/org/:slug*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: cspDirectives,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
