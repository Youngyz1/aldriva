// Minimal pass-through Service Worker for PWA installability compliance.
// Intentionally avoids aggressive caching to preserve fresh Next.js & Vercel deployments.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pass-through network requests without caching app pages/assets.
  event.respondWith(fetch(event.request));
});
