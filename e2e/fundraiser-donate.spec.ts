/**
 * e2e/fundraiser-donate.spec.ts — Stage 7 smoke: money-path UI leg.
 *
 * Donates to a SEEDED staging fundraiser (QA_SEED_FUNDRAISER_SLUG) with
 * Stripe's 4242… test card via the PaymentElement. Success is the on-page
 * "Thank you!" receipt (app/[locale]/fundraisers/[slug]/donate/DonatePage.tsx).
 *
 * Safety: test card numbers are declined-by-construction on live Stripe
 * keys, and the pk_test assertion below refuses to continue on live keys.
 *
 * Stripe Link note:
 * The Stripe PaymentElement may display a Link interstitial after the
 * parent Aldriva Donate button is submitted. That UI lives inside a
 * Stripe iframe. The parent-page Donate button must NOT be clicked again
 * when that interstitial appears; the Stripe-frame Donate button must be
 * clicked instead.
 */

import { test, expect } from './fixtures';

const slug = process.env.QA_SEED_FUNDRAISER_SLUG;

test.beforeAll(() => {
  if (!slug) {
    throw new Error(
      'QA_SEED_FUNDRAISER_SLUG is required (seeded staging fundraiser)'
    );
  }
});

test('donate $5 via test card reaches the receipt screen', async ({ page }) => {
  await page.goto(`/fundraisers/${slug}/donate`);

  // Cookie banner: dismiss if present so it can never obscure the CTA.
  const cookieBanner = page.getByRole('dialog', {
    name: 'Cookie preferences',
  });

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

  // Arm the Stripe request listener BEFORE the proceed click
  // (avoids the race).
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

  const stripeIframe = page
    .locator('iframe[name*="__privateStripeFrame"]')
    .first();

  await stripeIframe.waitFor({
    state: 'visible',
    timeout: 20_000,
  });

  // Card fields by accessible name, typed with real key events.
  const cardFrame = page
    .frameLocator('iframe[name*="__privateStripeFrame"]')
    .first();

  const card = cardFrame.getByRole('textbox', {
    name: /card number/i,
  });

  await card.click();
  await card.pressSequentially('4242424242424242', {
    delay: 50,
  });

  const exp = cardFrame.getByRole('textbox', {
    name: /expiration/i,
  });

  await exp.click();
  await exp.pressSequentially('1230', {
    delay: 50,
  });

  const cvc = cardFrame.getByRole('textbox', {
    name: /security code/i,
  });

  await cvc.click();
  await cvc.pressSequentially('123', {
    delay: 50,
  });

  // Force US so the ZIP field exists regardless of the runner's geolocation.
  // Use the exact billing-country label because Stripe also exposes
  // "Country or region for phone number" as another combobox.
  await cardFrame
    .getByLabel('Country', { exact: true })
    .selectOption('US');

  const zip = cardFrame.getByRole('textbox', {
    name: /^zip/i,
  });

  await zip.click();
  await zip.pressSequentially('10001', {
    delay: 50,
  });

  await zip.blur();

  // CI snapshot showed an unchecked "I am an AI agent acting on behalf of
  // someone else" checkbox inside the Stripe iframe. If it is present, tick it:
  // this run IS an automated agent, so the statement is accurate.
  // Logged so we can see in CI whether it appears at all.
  const agentBox = cardFrame.getByRole('checkbox', {
    name: /ai agent/i,
  });

  const agentBoxShown = await agentBox
    .isVisible()
    .catch(() => false);

  console.log(
    'QA_DIAG ai-agent checkbox visible =',
    agentBoxShown
  );

  if (agentBoxShown) {
    await agentBox.check();
  }

  // Let Stripe register the last field before submitting.
  await page.waitForTimeout(1_000);

  // Record DOM events on the parent page so we can tell whether the Donate
  // click produced a form submit at all, and whether native validation
  // blocked it.
  await page.evaluate(() => {
    const w = window as unknown as {
      __qaEvents: string[];
    };

    w.__qaEvents = [];

    const log = (msg: string) => {
      w.__qaEvents.push(`${Date.now()} ${msg}`);
    };

    document.addEventListener(
      'click',
      (e) => {
        const t = e.target as HTMLElement | null;

        log(
          'click on <' +
            t?.tagName +
            '> "' +
            (t?.textContent ?? '').trim().slice(0, 40) +
            '"'
        );
      },
      true
    );

    document.addEventListener(
      'submit',
      (e) => {
        log(
          'submit event, defaultPrevented=' +
            e.defaultPrevented
        );
      },
      true
    );

    document.addEventListener(
      'invalid',
      (e) => {
        const t = e.target as HTMLInputElement | null;

        log(
          'INVALID control ' +
            t?.tagName +
            ' name=' +
            t?.getAttribute('name') +
            ' msg=' +
            t?.validationMessage
        );
      },
      true
    );
  });

  page.on('console', (m) => {
    if (m.type() === 'error') {
      console.log(
        'QA_CONSOLE error:',
        m.text().slice(0, 300)
      );
    }
  });

  page.on('pageerror', (e) => {
    console.log(
      'QA_PAGEERROR:',
      String(e).slice(0, 300)
    );
  });

  // Arm BEFORE the click. Stripe.js confirm hits:
  // /v1/payment_intents/<id>/confirm
  const confirmPromise = page
    .waitForResponse(
      (r) =>
        /\/v1\/payment_intents\/[^/]+\/confirm/.test(
          r.url()
        ),
      {
        timeout: 30_000,
      }
    )
    .catch(() => null);

  // Scoped to the <form> so it can never hit the Step-1 proceed button.
  const submitButton = page
    .locator('form')
    .getByRole('button', { name: /donate/i });

  // ------------------------------------------------------------
  // CI BUTTON DIAGNOSTICS
  // ------------------------------------------------------------
  // These diagnostics are intentionally collected immediately before
  // the final click.
  // ------------------------------------------------------------

  console.log(
    'QA_DIAG submit count=',
    await page
      .locator('form')
      .getByRole('button', { name: /donate/i })
      .count()
  );

  console.log(
    'QA_DIAG submit visible=',
    await submitButton.isVisible()
  );

  console.log(
    'QA_DIAG submit enabled=',
    await submitButton.isEnabled()
  );

  console.log(
    'QA_DIAG submit type=',
    await submitButton.getAttribute('type')
  );

  console.log(
    'QA_DIAG submit text=',
    await submitButton.innerText()
  );

  console.log(
    'QA_DIAG submit rect=',
    await submitButton.boundingBox()
  );

  console.log(
    'QA_DIAG submit outerHTML=',
    await submitButton.evaluate((el) =>
      el.outerHTML
    )
  );

  console.log(
    'QA_DIAG submit parentHTML=',
    await submitButton.evaluate((el) =>
      el.parentElement?.outerHTML.slice(0, 3000) ?? '<none>'
    )
  );

  console.log(
    'QA_DIAG pre-click activeElement=',
    await page.evaluate(() => {
      const el = document.activeElement;

      return el
        ? `${el.tagName} ${
            el.getAttribute('name') ?? ''
          } ${
            el.textContent?.trim().slice(0, 80) ?? ''
          }`
        : '<none>';
    })
  );

  // ------------------------------------------------------------
  // STRIPE IFRAME DIAGNOSTICS
  // ------------------------------------------------------------
  // Stripe may have more than one private iframe. Log which frames
  // contain the Link interstitial and/or a Donate button.
  // ------------------------------------------------------------

  const stripeFrames = page.locator(
    'iframe[name*="__privateStripeFrame"]'
  );

  const stripeFrameCount = await stripeFrames.count();

  console.log(
    'QA_DIAG stripe iframe count=',
    stripeFrameCount
  );

  for (let i = 0; i < stripeFrameCount; i++) {
    const frame = stripeFrames.nth(i).contentFrame();

    if (!frame) {
      console.log(
        `QA_DIAG stripe frame ${i} contentFrame unavailable`
      );
      continue;
    }

    const linkText = frame.getByText(
      /Save my information for faster checkout/i
    );

    const donateButton = frame.getByRole('button', {
      name: /donate\s*\$/i,
    });

    const linkVisible = await linkText
      .first()
      .isVisible()
      .catch(() => false);

    const donateVisible = await donateButton
      .first()
      .isVisible()
      .catch(() => false);

    console.log(
      `QA_DIAG stripe frame ${i} link visible=`,
      linkVisible
    );

    console.log(
      `QA_DIAG stripe frame ${i} donate visible=`,
      donateVisible
    );
  }

  // ------------------------------------------------------------
  // FINAL PARENT-PAGE DONATE CLICK
  // ------------------------------------------------------------
  // This is the Aldriva form submit button.
  //
  // IMPORTANT:
  // If Stripe Link subsequently shows its own Donate button inside
  // a Stripe iframe, that button is handled separately below.
  // ------------------------------------------------------------

  const submitBox = await submitButton.boundingBox();

  if (submitBox) {
    const hitTarget = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y);

        return {
          tag: el?.tagName ?? null,
          id: el?.id ?? null,
          className:
            typeof el?.className === 'string'
              ? el.className
              : null,
          text:
            el?.textContent?.trim().slice(0, 100) ?? null,
          outerHTML:
            el?.outerHTML.slice(0, 1000) ?? null,
        };
      },
      {
        x: submitBox.x + submitBox.width / 2,
        y: submitBox.y + submitBox.height / 2,
      }
    );

    console.log(
      'QA_DIAG hit target=',
      JSON.stringify(hitTarget)
    );
  }

  await submitButton.click();

  console.log(
    'QA_DIAG post-click activeElement=',
    await page.evaluate(() => {
      const el = document.activeElement;

      return el
        ? `${el.tagName} ${
            el.getAttribute('name') ?? ''
          } ${
            el.textContent?.trim().slice(0, 80) ?? ''
          }`
        : '<none>';
    })
  );

  // ------------------------------------------------------------
  // STRIPE LINK INTERSTITIAL HANDLING
  // ------------------------------------------------------------
  // Stripe Link can display a second Donate button inside a private
  // Stripe iframe after the parent Aldriva form is submitted.
  //
  // DO NOT call:
  //
  //   page.getByRole('button', { name: /donate/i }).click()
  //
  // here, because that would target the Aldriva parent-page button
  // again rather than Stripe's iframe button.
  //
  // Poll briefly because Stripe may take a moment to mount the
  // Link interstitial after the parent submit.
  // ------------------------------------------------------------

  let stripeLinkClicked = false;

  const linkDeadline = Date.now() + 8_000;

  while (Date.now() < linkDeadline && !stripeLinkClicked) {
    const frames = page.locator(
      'iframe[name*="__privateStripeFrame"]'
    );

    const count = await frames.count();

    for (let i = 0; i < count; i++) {
      const iframe = frames.nth(i);
      const frame = iframe.contentFrame();

      if (!frame) {
        continue;
      }

      const linkText = frame.getByText(
        /Save my information for faster checkout/i
      );

      const linkVisible = await linkText
        .first()
        .isVisible()
        .catch(() => false);

      if (!linkVisible) {
        continue;
      }

      console.log(
        `QA_DIAG Stripe Link interstitial detected in iframe ${i}`
      );

      const stripeDonate = frame
        .getByRole('button', {
          name: /donate\s*\$/i,
        })
        .first();

      const stripeDonateVisible = await stripeDonate
        .isVisible()
        .catch(() => false);

      console.log(
        `QA_DIAG Stripe Link Donate visible in iframe ${i}=`,
        stripeDonateVisible
      );

      if (!stripeDonateVisible) {
        continue;
      }

      console.log(
        `QA_DIAG clicking Stripe Link Donate inside iframe ${i}`
      );

      await stripeDonate.click();

      stripeLinkClicked = true;

      console.log(
        'QA_DIAG Stripe Link Donate click completed'
      );

      break;
    }

    if (!stripeLinkClicked) {
      await page.waitForTimeout(250);
    }
  }

  console.log(
    'QA_DIAG stripe link clicked=',
    stripeLinkClicked
  );

  // Now wait for Stripe's PaymentIntent confirmation request.
  const confirmResp = await confirmPromise;

  if (!confirmResp) {
    // Submit never reached Stripe. Log only the lines that can explain why.
    const frameText = await cardFrame
      .locator('body')
      .innerText()
      .catch(() => '');

    const frameHits = frameText
      .split('\n')
      .filter((l) =>
        /incomplete|invalid|required|error|declin|check your|not valid/i.test(
          l
        )
      );

    const alerts = await page
      .locator('[role="alert"]')
      .allInnerTexts()
      .catch(() => []);

    const buttonText = await submitButton
      .innerText()
      .catch(() => '<unreadable>');

    const buttonDisabled = await submitButton
      .isDisabled()
      .catch(() => null);

    const zipValue = await zip
      .inputValue()
      .catch(() => '<unreadable>');

    const focused = await page
      .evaluate(() => {
        const el = document.activeElement;

        return (
          el?.tagName +
          ' ' +
          (el?.getAttribute('name') ?? '')
        );
      })
      .catch(() => '<unreadable>');

    console.log(
      'QA_DIAG no confirm request. url=',
      page.url()
    );

    console.log(
      'QA_DIAG iframe validation lines:',
      JSON.stringify(frameHits)
    );

    console.log(
      'QA_DIAG page alerts:',
      JSON.stringify(alerts)
    );

    console.log(
      'QA_DIAG submit button text=',
      buttonText,
      'disabled=',
      buttonDisabled
    );

    console.log(
      'QA_DIAG zip value=',
      zipValue,
      'parent focus=',
      focused
    );

    // Re-check Stripe frames after the attempted submission so CI
    // tells us whether a Link interstitial remained mounted.
    const finalStripeFrames = page.locator(
      'iframe[name*="__privateStripeFrame"]'
    );

    const finalFrameCount = await finalStripeFrames.count();

    console.log(
      'QA_DIAG final stripe iframe count=',
      finalFrameCount
    );

    for (let i = 0; i < finalFrameCount; i++) {
      const frame = finalStripeFrames.nth(i).contentFrame();

      if (!frame) {
        continue;
      }

      const linkText = frame.getByText(
        /Save my information for faster checkout/i
      );

      const stripeDonate = frame
        .getByRole('button', {
          name: /donate\s*\$/i,
        })
        .first();

      const linkVisible = await linkText
        .first()
        .isVisible()
        .catch(() => false);

      const donateVisible = await stripeDonate
        .isVisible()
        .catch(() => false);

      console.log(
        `QA_DIAG final stripe frame ${i} link visible=`,
        linkVisible
      );

      console.log(
        `QA_DIAG final stripe frame ${i} donate visible=`,
        donateVisible
      );
    }

    const domEvents = await page
      .evaluate(
        () =>
          (window as unknown as {
            __qaEvents?: string[];
          }).__qaEvents ?? []
      )
      .catch(() => ['<unreadable>']);

    console.log(
      'QA_DIAG parent DOM events:',
      JSON.stringify(domEvents)
    );
  } else {
    const body = await confirmResp
      .json()
      .catch(() => ({}));

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
  await expect(
    page.getByText('Thank you!')
  ).toBeVisible({
    timeout: 30_000,
  });

  await expect(
    page.getByText(/has been received/)
  ).toBeVisible();
});