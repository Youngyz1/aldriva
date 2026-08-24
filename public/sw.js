// Minimal pass-through Service Worker for PWA installability compliance.
// Intentionally avoids aggressive caching to preserve fresh Next.js & Vercel deployments.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Bypass Service Worker interception for non-same-origin requests (external images, CDNs, APIs).
  // Calling event.respondWith(fetch(...)) on cross-origin requests causes Service Worker fetch CSP errors.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Pass-through same-origin network requests without caching app pages/assets.
  event.respondWith(fetch(event.request));
});
