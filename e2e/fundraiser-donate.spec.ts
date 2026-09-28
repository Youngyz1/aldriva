/**
 * e2e/fundraiser-donate.spec.ts — Stage 7 smoke: money-path UI leg.
 *
 * Donates to a SEEDED staging fundraiser (QA_SEED_FUNDRAISER_SLUG) with
 * Stripe's 4242… test card via the PaymentElement. Success is the on-page
 * "Thank you!" receipt (app/[locale]/fundraisers/[slug]/donate/DonatePage.tsx).
 *
 * Safety: test card numbers are declined-by-construction on live Stripe
 * keys, and the pk_test assertion below refuses to continue on live keys.
 */
import { test, expect } from './fixtures';

const slug = process.env.QA_SEED_FUNDRAISER_SLUG;

test.beforeAll(() => {
  if (!slug) throw new Error('QA_SEED_FUNDRAISER_SLUG is required (seeded staging fundraiser)');
});

test('donate $5 via test card reaches the receipt screen', async ({ page }) => {
  await page.goto(`/fundraisers/${slug}/donate`);

  // Cookie banner: dismiss if present so it can never obscure the CTA.
  const cookieBanner = page.getByRole('dialog', { name: 'Cookie preferences' });
  const bannerShown = await cookieBanner
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (bannerShown) {
    await page.locator('#cookie-accept').click({ timeout: 5_000 });
    await expect(cookieBanner).toBeHidden({ timeout: 5_000 });
  }

  // Amount + optional donor fields (fill BEFORE proceeding so the
  // PaymentIntent is minted for the right total).
  await page.getByPlaceholder('0').fill('5');
  await page.getByPlaceholder(/your name/i).fill('QA Smoke');
  await page.getByPlaceholder(/email/i).fill('qa-smoke@example.com');

  // Arm the Stripe request listener BEFORE the proceed click (avoids the race).
  const stripeReqPromise = page.waitForRequest(
    (req) => req.url().startsWith('https://api.stripe.com/v1/'),
    { timeout: 20_000 }
  );

  // Step 1 → Step 2: mint the PaymentIntent and mount Stripe Elements.
  // The `i` flag is load-bearing (real button renders "Donate $X →").
  await page.getByRole('button', { name: /donate.*→/i }).click();

  const stripeReq = await stripeReqPromise;
  const fromQuery = new URL(stripeReq.url()).searchParams.get('key');
  const fromBody = new URLSearchParams(stripeReq.postData() ?? '').get('key');
  const publishableKey = fromQuery ?? fromBody;
  expect(
    publishableKey,
    'Stripe publishable key must be test mode (pk_test) — refusing to run against live keys'
  ).toMatch(/^pk_test/);

  const stripeIframe = page.locator('iframe[name*="__privateStripeFrame"]').first();
  await stripeIframe.waitFor({ state: 'visible', timeout: 20_000 });

  // Card fields by accessible name. Typed with real key events
  // (pressSequentially) instead of fill(), so Stripe's fields register each
  // value the way they do for a person. (Hypothesis: fill() showed the text
  // but left Stripe's internal state empty. Verified by a manual run
  // succeeding where the automated fill() run never fired a confirm request.)
  const cardFrame = page.frameLocator('iframe[name*="__privateStripeFrame"]').first();

  const card = cardFrame.getByRole('textbox', { name: /card number/i });
  await card.click();
  await card.pressSequentially('4242424242424242', { delay: 50 });

  const exp = cardFrame.getByRole('textbox', { name: /expiration/i });
  await exp.click();
  await exp.pressSequentially('1230', { delay: 50 });

  const cvc = cardFrame.getByRole('textbox', { name: /security code/i });
  await cvc.click();
  await cvc.pressSequentially('123', { delay: 50 });

  // Billing ZIP is required under the US default country.
  // Force US so the ZIP field exists regardless of the runner's geolocation.
  await cardFrame.getByRole('combobox', { name: /country/i }).first().selectOption('US');
  const zip = cardFrame.getByRole('textbox', { name: /^zip/i });
  await zip.click();
  await zip.pressSequentially('10001', { delay: 50 });
  await zip.blur();

  // Let Stripe register the last field before submitting.
  await page.waitForTimeout(1_000);

  // Arm BEFORE the click. Stripe.js confirm hits /v1/payment_intents/<id>/confirm.
  const confirmPromise = page
    .waitForResponse((r) => /\/v1\/payment_intents\/[^/]+\/confirm/.test(r.url()), {
      timeout: 30_000,
    })
    .catch(() => null);

  // Scoped to the <form> so it can never hit the Step-1 proceed button.
  await page.locator('form').getByRole('button', { name: /donate/i }).click();

  const confirmResp = await confirmPromise;
  if (!confirmResp) {
    // Submit never reached Stripe. Log what the card form and page say.
    const frameText = await cardFrame.locator('body').innerText().catch(() => '<unreadable>');
    const pageText = await page.locator('body').innerText().catch(() => '<unreadable>');
    console.log('QA_DIAG no confirm request. url=', page.url());
    console.log('QA_DIAG iframe text:', frameText.slice(0, 1500));
    console.log('QA_DIAG page text:', pageText.slice(0, 1500));
  } else {
    const body = await confirmResp.json().catch(() => ({}));
    console.log(
      'QA_DIAG confirm status=',
      confirmResp.status(),
      'pi.status=',
      body.status,
      'error=',
      JSON.stringify(body.error ?? null)
    );
  }
  expect(
    confirmResp,
    'Stripe confirm request never fired: submit was blocked before reaching Stripe'
  ).not.toBeNull();

  // Stripe Link UI is inline in the Payment Element and does not block
  // confirmPayment; no Link interaction needed.

  // Receipt screen: "Thank you!" + "has been received."
  await expect(page.getByText('Thank you!')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/has been received/)).toBeVisible();
});