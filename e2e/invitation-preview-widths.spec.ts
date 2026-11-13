/**
 * e2e/invitation-preview-widths.spec.ts
 *
 * Regression test for the crushed preview card on the real invitation
 * builder (/dashboard/events/<id>/invitation-page, logged in).
 *
 * Visits the builder once, then changes viewport width across
 * [800, 870, 1000, 1100, 1280, 1440, 1920] with NO reload between
 * changes. At each width it waits for layout to settle and records the
 * preview panel height and device-frame scale. A crushed frame is one
 * whose panel height is far below the available viewport height or whose
 * frame scale is far below 1.0.
 *
 * Requires QA_TEST_EMAIL / QA_TEST_PASSWORD and QA_STAGING_URL=http://localhost:3000.
 */
import { test, expect } from "@playwright/test";

const email = process.env.QA_TEST_EMAIL;
const password = process.env.QA_TEST_PASSWORD;
const EVENT_ID = "77456a7f-8cd1-4685-97a1-e443ab89e9be";

const WIDTHS = [800, 870, 1000, 1100, 1280, 1440, 1920];
const VIEWPORT_HEIGHT = 900;

const PANEL = '[data-testid="invitation-preview-panel"]';
const FRAME = '[data-testid="preview-device-frame"]';

test.beforeAll(() => {
  if (!email || !password) throw new Error("QA_TEST_EMAIL and QA_TEST_PASSWORD are required");
});

async function login(page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /continue with email/i }).click();
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /^log in$/i }).click();
  await page.waitForURL(
    (url) => {
      const p = url.pathname;
      return p !== "/login" && p !== "/auth/callback";
    },
    { timeout: 20_000 },
  );
}

async function snapshot(page) {
  const panel = page.locator(PANEL);
  const frame = page.locator(FRAME);
  const pBox = (await panel.boundingBox()) ?? null;
  const scale = pBox
    ? await frame.evaluate((el) => {
        const m = window.getComputedStyle(el).transform;
        const match = m.match(/matrix\(([^,]+),/);
        return match ? Number(match[1]) : null;
      })
    : null;
  return { panelHeight: pBox?.height ?? null, scale };
}

test("preview card is not crushed at any width, no reload between widths", async ({
  page,
}) => {
  await login(page);
  await page.goto(`/dashboard/events/${EVENT_ID}/invitation-page?edit=1`);
  await expect(page.locator(PANEL)).toBeVisible({ timeout: 20_000 });

  const results: Record<number, { panelHeight: number | null; scale: number | null }> = {};

  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: VIEWPORT_HEIGHT });
    // Let layout + ResizeObserver + deferred measures settle.
    await page.waitForTimeout(1200);
    results[w] = await snapshot(page);
  }

  console.log("\n=== PREVIEW WIDTHS REGRESSION RESULTS ===");
  console.log(JSON.stringify(results, null, 1));

  for (const [w, s] of Object.entries(results)) {
    const width = Number(w);
    // At widths >= 1100 the preview column is rendered; it must not be crushed.
    // A healthy panel uses a large fraction of the viewport height and the frame
    // scale is near 1.0 (never down near 0).
    if (width >= 1100) {
      expect(s.panelHeight).toBeGreaterThan(300, `preview panel crushed at ${width}px`);
      expect(s.scale).toBeGreaterThan(0.2, `preview frame scale crushed at ${width}px`);
    }
  }
});
