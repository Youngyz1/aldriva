import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

// isDev is true only when BOTH environment signals agree this is not production.
// VERCEL_ENV is injected by Vercel's build infrastructure and cannot be
// overridden by a .env file, providing a second layer of protection against
// a misconfigured NODE_ENV leaking unsafe-eval into a production deploy.
const isDev =
  process.env.NODE_ENV !== "production" &&
  process.env.VERCEL_ENV !== "production";

// Provide safe build-time fallbacks for static module evaluation when env is unset
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-service-role-key";
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "placeholder-anon-key";
}
if (!process.env.STRIPE_SECRET_KEY) {
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder_key_for_build_00000000000000000000";
}
if (!process.env.STRIPE_WEBHOOK_SECRET) {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_placeholder";
}
if (!process.env.RESEND_API_KEY) {
  process.env.RESEND_API_KEY = "re_placeholder";
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseOrigin = supabaseUrl && supabaseUrl !== "https://placeholder.supabase.co" ? new URL(supabaseUrl).origin : "";
const supabaseWssOrigin = supabaseOrigin ? supabaseOrigin.replace(/^https:/, "wss:") : "";
function mediaHostname(value: string | undefined, name: string): string {
  if (!value) return "";
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS.`);
  return url.hostname.toLowerCase();
}
const serverMediaHost = mediaHostname(process.env.MEDIA_BASE_URL, "MEDIA_BASE_URL");
const publicMediaHost = mediaHostname(process.env.NEXT_PUBLIC_MEDIA_BASE_URL, "NEXT_PUBLIC_MEDIA_BASE_URL");
if (serverMediaHost && publicMediaHost && serverMediaHost !== publicMediaHost) {
  throw new Error("MEDIA_BASE_URL and NEXT_PUBLIC_MEDIA_BASE_URL must use the same host.");
}
if (process.env.VERCEL_ENV === "production" && (!serverMediaHost || !publicMediaHost)) {
  throw new Error("Production requires matching MEDIA_BASE_URL and NEXT_PUBLIC_MEDIA_BASE_URL hosts.");
}
const serverImageDriver = process.env.IMAGE_STORAGE_DRIVER || "supabase";
const publicImageDriver = process.env.NEXT_PUBLIC_IMAGE_STORAGE_DRIVER || "supabase";
if (serverImageDriver !== publicImageDriver) {
  throw new Error("IMAGE_STORAGE_DRIVER and NEXT_PUBLIC_IMAGE_STORAGE_DRIVER must match.");
}
if (serverImageDriver !== "r2" && serverImageDriver !== "supabase") {
  throw new Error("IMAGE_STORAGE_DRIVER must be 'r2' or 'supabase'.");
}
const configuredMediaHost = publicMediaHost || serverMediaHost;
const mediaOrigin = configuredMediaHost ? `https://${configuredMediaHost}` : "";
const r2EndpointOrigin = (() => {
  try {
    return process.env.R2_ENDPOINT ? new URL(process.env.R2_ENDPOINT).origin : "";
  } catch {
    return "";
  }
})();

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
    mediaOrigin,
    "https://supabase.co",
    "https://supabase.in",
    "https://*.supabase.co",
    "https://*.supabase.in",
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
    r2EndpointOrigin,
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
    "https://maps.google.com",
    "https://www.google.com",
    "https://*.google.com",
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
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key",
  },
  // TEMPORARY — Cache Components Phase 0 validation only, on the
  // cache-components/phase-0-suspense-wrap branch. Do not merge to main with
  // this enabled until Phase 1 decomposition work is done.
  cacheComponents: true,
  // Lets the dev server accept requests from a phone/tablet on the same LAN
  // (e.g. http://192.168.1.4:3000) without the "Blocked cross-origin request"
  // warning, so Fast Refresh/HMR works when testing on a real device.
  allowedDevOrigins: isDev ? ["172.22.0.1", "192.168.1.3", "192.168.1.5"] : undefined,
  images: {
    // TEMPORARY: Vercel image optimization disabled due to Hobby plan quota limits (402 errors sitewide). Long-term fix planned: migrate image serving to a self-hosted AWS pipeline (S3 + Lambda + CloudFront). Do not re-enable without confirming quota/plan first.
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "supabase.co" },
      { protocol: "https", hostname: "supabase.in" },
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
      ...(configuredMediaHost ? [{ protocol: "https" as const, hostname: configuredMediaHost }] : []),
    ],
    // Allow unoptimised fallback for blobs (editor-uploaded media)
    dangerouslyAllowSVG: false,
  },
  async redirects() {
    return [
      {
        source: "/my-tickets",
        destination: "/events/my-tickets",
        permanent: true,
      },
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
        source: "/invitation/shared/:token*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store",
          },
        ],
      },
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
            value: "camera=(self), microphone=(), geolocation=()",
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

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');
export default withNextIntl(nextConfig);
