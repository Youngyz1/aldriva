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

  // Card fields by accessible name, typed with real key events.
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

  // Force US so the ZIP field exists regardless of the runner's geolocation.
  await cardFrame.getByLabel('Country', { exact: true }).selectOption('US');
  const zip = cardFrame.getByRole('textbox', { name: /^zip/i });
  await zip.click();
  await zip.pressSequentially('10001', { delay: 50 });
  await zip.blur();

  // CI snapshot showed an unchecked "I am an AI agent acting on behalf of
  // someone else" checkbox inside the Stripe iframe. If it is present, tick it:
  // this run IS an automated agent, so the statement is accurate. Logged so we
  // can see in CI whether it appears at all.
  const agentBox = cardFrame.getByRole('checkbox', { name: /ai agent/i });
  const agentBoxShown = await agentBox.isVisible().catch(() => false);
  console.log('QA_DIAG ai-agent checkbox visible =', agentBoxShown);
  if (agentBoxShown) {
    await agentBox.check();
  }

  // Let Stripe register the last field before submitting.
  await page.waitForTimeout(1_000);

  // Record DOM events on the parent page so we can tell whether the Donate click
  // produced a form submit at all, and whether native validation blocked it.
  await page.evaluate(() => {
    const w = window as unknown as { __qaEvents: string[] };
    w.__qaEvents = [];
    const log = (msg: string) => w.__qaEvents.push(Date.now() + ' ' + msg);
    document.addEventListener(
      'click',
      (e) => {
        const t = e.target as HTMLElement | null;
        log('click on <' + t?.tagName + '> "' + (t?.textContent ?? '').trim().slice(0, 40) + '"');
      },
      true
    );
    document.addEventListener(
      'submit',
      (e) => log('submit event, defaultPrevented=' + e.defaultPrevented),
      true
    );
    document.addEventListener(
      'invalid',
      (e) => {
        const t = e.target as HTMLInputElement | null;
        log('INVALID control ' + t?.tagName + ' name=' + t?.getAttribute('name') + ' msg=' + t?.validationMessage);
      },
      true
    );
  });
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('QA_CONSOLE error:', m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => console.log('QA_PAGEERROR:', String(e).slice(0, 300)));

  // Arm BEFORE the click. Stripe.js confirm hits /v1/payment_intents/<id>/confirm.
  const confirmPromise = page
    .waitForResponse((r) => /\/v1\/payment_intents\/[^/]+\/confirm/.test(r.url()), {
      timeout: 30_000,
    })
    .catch(() => null);

  // Scoped to the <form> so it can never hit the Step-1 proceed button.
  const submitButton = page.locator('form').getByRole('button', { name: /donate/i });
  await submitButton.click();

  const confirmResp = await confirmPromise;
  if (!confirmResp) {
    // Submit never reached Stripe. Log only the lines that can explain why.
    const frameText = await cardFrame.locator('body').innerText().catch(() => '');
    const frameHits = frameText
      .split('\n')
      .filter((l) => /incomplete|invalid|required|error|declin|check your|not valid/i.test(l));
    const alerts = await page.locator('[role="alert"]').allInnerTexts().catch(() => []);
    const buttonText = await submitButton.innerText().catch(() => '<unreadable>');
    const buttonDisabled = await submitButton.isDisabled().catch(() => null);
    const zipValue = await zip.inputValue().catch(() => '<unreadable>');
    const focused = await page
      .evaluate(() => document.activeElement?.tagName + ' ' + (document.activeElement?.getAttribute('name') ?? ''))
      .catch(() => '<unreadable>');

    console.log('QA_DIAG no confirm request. url=', page.url());
    console.log('QA_DIAG iframe validation lines:', JSON.stringify(frameHits));
    console.log('QA_DIAG page alerts:', JSON.stringify(alerts));
    console.log('QA_DIAG submit button text=', buttonText, 'disabled=', buttonDisabled);
    console.log('QA_DIAG zip value=', zipValue, 'parent focus=', focused);
    const domEvents = await page
      .evaluate(() => (window as unknown as { __qaEvents?: string[] }).__qaEvents ?? [])
      .catch(() => ['<unreadable>']);
    console.log('QA_DIAG parent DOM events:', JSON.stringify(domEvents));
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

  // Receipt screen: "Thank you!" + "has been received."
  await expect(page.getByText('Thank you!')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/has been received/)).toBeVisible();
});