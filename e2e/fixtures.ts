/**
 * e2e/fixtures.ts - shared test fixture that scopes the Vercel
 * Deployment Protection bypass header to same-origin requests only.
 *
 * WHY THIS EXISTS: playwright.config.ts previously set the bypass
 * header globally via use.extraHTTPHeaders, which attaches it to
 * EVERY outgoing request from the page - including cross-origin calls
 * to Stripe's API. That unexpected header on a cross-origin request
 * can break Stripe's CORS preflight, silently blocking the request
 * before it ever hits the network layer. The donate spec's Stripe
 * pre-flight check (page.waitForRequest) then times out waiting
 * for a request that never fires - not because payments are broken,
 * but because the bypass header leaked onto a request it should never
 * have touched.
 *
 * FIX: intercept requests and attach the bypass header only when the
 * request's origin matches our own staging origin (baseURL). Every
 * other origin (Stripe, fonts, CDNs, anything else) passes through
 * completely untouched.
 */
import { test as base, expect } from '@playwright/test';

export const test = base.extend<{}>({
  page: async ({ page, baseURL }, use) => {
    const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

    if (bypassSecret && baseURL) {
      const ownOrigin = new URL(baseURL).origin;

      await page.route('**/*', async (route) => {
        const requestOrigin = new URL(route.request().url()).origin;

        if (requestOrigin === ownOrigin) {
          await route.continue({
            headers: {
              ...route.request().headers(),
              'x-vercel-protection-bypass': bypassSecret,
            },
          });
        } else {
          await route.continue();
        }
      });
    }

    await use(page);
  },
});

export { expect };
