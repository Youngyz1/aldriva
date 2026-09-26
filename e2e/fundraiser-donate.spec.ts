/**
 * e2e/fundraiser-donate.spec.ts — Stage 7 smoke: money-path UI leg.
 *
 * Donates to a SEEDED staging fundraiser (QA_SEED_FUNDRAISER_SLUG) with
 * Stripe's 4242… test card via the PaymentElement. Complements — never
 * duplicates — the backend payment_reconciliation_failures signal, which
 * cannot see the DonatePage render, Checkout redirect, return handling,
 * or receipt display. Success is the on-page "Thank you!" receipt
 * (app/[locale]/fundraisers/[slug]/donate/DonatePage.tsx).
 *
 * Safety: test card numbers are declined-by-construction on live Stripe
 * keys, so a misconfigured target fails closed (no charge possible).
 * Stripe PaymentElement internals are version-sensitive — if Stripe
 * changes field naming, this spec fails loudly in shadow mode first.
 */
import { test, expect } from '@playwright/test';

const slug = process.env.QA_SEED_FUNDRAISER_SLUG;

test.beforeAll(() => {
  if (!slug) throw new Error('QA_SEED_FUNDRAISER_SLUG is required (seeded staging fundraiser)');
});

test('donate $5 via test card reaches the receipt screen', async ({ page }) => {
  await page.goto(`/fundraisers/${slug}/donate`);

  // Amount picker (placeholder "0", minimum $1).
  await page.getByPlaceholder('0').fill('5');

  // Optional donor fields — fill to exercise the full form path.
  await page.getByPlaceholder(/your name/i).fill('QA Smoke');
  await page.getByPlaceholder(/email/i).fill('qa-smoke@example.com');

  // Stripe PaymentElement lives in a same-origin-controlled iframe.
  const cardFrame = page.frameLocator('iframe[name*="__privateStripeFrame"]').first();
  await cardFrame.getByPlaceholder(/card number/i).fill('4242424242424242');
  await cardFrame.getByPlaceholder(/MM \/ YY|expiration|expiry/i).fill('12/30');
  await cardFrame.getByPlaceholder(/CVC|security code/i).fill('123');

  // Submit the donation (button label contains the total).
  await page.getByRole('button', { name: /donate/i }).click();

  // Receipt screen: "Thank you!" + "has been received."
  await expect(page.getByText('Thank you!')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/has been received/)).toBeVisible();
});
