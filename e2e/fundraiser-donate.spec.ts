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
import { test, expect } from './fixtures';

const slug = process.env.QA_SEED_FUNDRAISER_SLUG;

test.beforeAll(() => {
  if (!slug) throw new Error('QA_SEED_FUNDRAISER_SLUG is required (seeded staging fundraiser)');
});

test('donate $5 via test card reaches the receipt screen', async ({ page }) => {
  await page.goto(`/fundraisers/${slug}/donate`);

  // Cookie banner (components/CookieConsent.tsx, rendered globally from
  // app/[locale]/layout.tsx): fixed bottom bar, z-50, appears ~800ms after
  // load. It does NOT gate Stripe.js — getCookieConsent() has zero
  // call-sites outside its own module, and StripeProvider mounts purely on
  // clientSecret state (see below). Dismiss with Accept anyway so the bar
  // can never obscure the Donate CTA on small viewports.
  //
  // No silent swallowing: if the banner is present, the Accept click runs
  // with a real timeout (fails loudly on failure) and the follow-up
  // toBeHidden assertion proves dismissal actually happened — a wrong
  // selector here fails the test at this line instead of hiding until a
  // later step. The only quiet path is the banner never appearing at all
  // (consent already stored), in which case there is nothing to dismiss.
  const cookieBanner = page.getByRole('dialog', { name: 'Cookie preferences' });
  const bannerShown = await cookieBanner
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (bannerShown) {
    await page.locator('#cookie-accept').click({ timeout: 5_000 });
    await expect(cookieBanner).toBeHidden({ timeout: 5_000 });
  }

  // Amount picker (placeholder "0", minimum $1) + optional donor fields.
  // Fill BEFORE proceeding so the PaymentIntent is minted for the right total.
  await page.getByPlaceholder('0').fill('5');
  await page.getByPlaceholder(/your name/i).fill('QA Smoke');
  await page.getByPlaceholder(/email/i).fill('qa-smoke@example.com');

  // Two-step flow (app/[locale]/fundraisers/[slug]/donate/DonatePage.tsx):
  // StripeProvider/Elements only mounts AFTER clientSecret is set, which
  // only happens when the "Donate $X →" proceed button POSTs to
  // /api/donate/intent. Waiting for api.stripe.com before that click can
  // never succeed — that was the 20s TimeoutError (page rendered, amount
  // pre-filled, but no Stripe iframe anywhere because Elements wasn't mounted).
  // So: arm the listener FIRST (avoids the race), THEN click proceed.
  //
  // Pre-flight (runbook Part A): prove Stripe TEST mode before touching
  // payment. Stripe.js v9 (repo: @stripe/stripe-js ^9.8.0) talks to
  // https://api.stripe.com/v1/* (elements/sessions at setup,
  // payment_methods at confirm), always carrying the publishable key as the
  // form-encoded `key` field (query param on GETs). Capture the first such
  // request — Elements setup fires it when the provider mounts, right after
  // proceed. Timeout rejects loudly (no silent pass); a non-pk_test key fails
  // the assertion before the final submit, so confirmPayment (the only charge
  // path) can never execute against live keys.
  const stripeReqPromise = page.waitForRequest(
    (req) => req.url().startsWith('https://api.stripe.com/v1/'),
    { timeout: 20_000 } // generous: covers slow staging cold starts; setup fires in seconds
  );

  // Step 1 → Step 2: mint the PaymentIntent and mount Stripe Elements.
  // NOTE: the `i` flag is load-bearing. Playwright matches a RegExp `name`
  // case-sensitively, and the real button renders "Donate $X →" (capital D,
  // DonatePage.tsx). Without `i` this locator matches zero buttons and the
  // click waits until the test timeout kills it ("Test ended") — exactly the
  // previous run's failure, which also took waitForRequest down as collateral.
  await page.getByRole('button', { name: /donate.*→/i }).click();

  const stripeReq = await stripeReqPromise;
  const fromQuery = new URL(stripeReq.url()).searchParams.get('key');
  const fromBody = new URLSearchParams(stripeReq.postData() ?? '').get('key');
  const publishableKey = fromQuery ?? fromBody;
  expect(
    publishableKey,
    'Stripe publishable key must be test mode (pk_test) — refusing to run against live keys'
  ).toMatch(/^pk_test/);

  // Stripe PaymentElement lives in a same-origin-controlled iframe.
  // It only exists after proceed (see above) — this explicit wait proves
  // Elements rendered, and fails loudly with a clear message if it didn't,
  // instead of hanging ambiguously inside the field fills below (an
  // `iframe >> placeholder` chain timeout is easily misread as "no iframe"
  // when the real mismatch is the inner placeholder text).
  const stripeIframe = page.locator('iframe[name*="__privateStripeFrame"]').first();
  await stripeIframe.waitFor({ state: 'visible', timeout: 20_000 });

  // Card fields by accessible label (role=textbox), NOT placeholder
  // substring: the /1234/ placeholder alternative matched both the card
  // number field ("1234 1234 1234 1234") and the ZIP field ("12345"),
  // tripping strict mode. Per the failure's element dump the card input has
  // aria-label="Card number" (id="payment-numberInput") — unique and stable.
  // Expiry/CVC use their accessible names ("Expiration date",
  // "Security code") for the same reason rather than placeholder text.
  const cardFrame = page.frameLocator('iframe[name*="__privateStripeFrame"]').first();
  await cardFrame.getByRole('textbox', { name: /card number/i }).fill('4242424242424242');
  await cardFrame.getByRole('textbox', { name: /expiration/i }).fill('12/30');
  await cardFrame.getByRole('textbox', { name: /security code/i }).fill('123');

  // Submit the donation via the PaymentForm submit (submitLabel `Donate $X`).
  // Scoped to the <form> so it can never hit the Step-1 proceed button
  // (which unmounts once clientSecret is set anyway).
  await page.locator('form').getByRole('button', { name: /donate/i }).click();

  // Receipt screen: "Thank you!" + "has been received."
  await expect(page.getByText('Thank you!')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/has been received/)).toBeVisible();
});
