const fs = require("node:fs");
const { chromium } = require("playwright");

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .flatMap((line) => {
      const index = line.indexOf("=");
      return index > 0 ? [[line.slice(0, index), line.slice(index + 1)]] : [];
    })
);

const eventId = "e18a0c29-1d26-4565-96b5-ec7fd6337583";
const builderUrl = `http://localhost:3000/dashboard/events/${eventId}/invitation-page?edit=1`;
const previewUrl = `http://localhost:3000/invitation/builder-preview/${eventId}?embed=1`;
const variants = [
  {
    name: "canonical track",
    url: "https://soundcloud.com/erasedtapes/olafur-arnalds-poland",
  },
  {
    name: "track with si and utm query",
    url: "https://soundcloud.com/erasedtapes/olafur-arnalds-poland?si=proof123&utm_source=clipboard&utm_medium=text",
  },
  {
    name: "playlist set",
    url: "https://soundcloud.com/forss/sets/soulhack",
  },
];

const logs = { console: [], page: [], failed: [], responses: [] };

function watch(page) {
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /soundcloud|sndcdn|NotAllowedError|AbortError/i.test(message.text())
    ) {
      logs.console.push(message.text().slice(0, 500));
    }
  });
  page.on("pageerror", (error) => logs.page.push(String(error)));
  page.on("requestfailed", (request) => {
    if (/soundcloud|sndcdn/i.test(request.url())) {
      logs.failed.push({ url: request.url(), error: request.failure()?.errorText });
    }
  });
  page.on("response", (response) => {
    if (/soundcloud|sndcdn/i.test(response.url())) {
      const url = new URL(response.url());
      if (/player|api|resolve|tracks|streams|wave/i.test(url.pathname)) {
        logs.responses.push({ url: `${url.origin}${url.pathname}`, status: response.status() });
      }
    }
  });
}

async function waitForSaved(page) {
  await page.waitForTimeout(700);
  await page.waitForFunction(
    () => document.querySelector("[role=status]")?.textContent?.includes("Saved"),
    null,
    { timeout: 25000 }
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const guest = await context.newPage();
  watch(page);
  watch(guest);
  for (const currentPage of [page, guest]) {
    await currentPage.addInitScript(() => {
      window.__csp = [];
      window.addEventListener("securitypolicyviolation", (event) => {
        window.__csp.push({
          directive: event.violatedDirective,
          blocked: event.blockedURI,
          disposition: event.disposition,
        });
      });
    });
  }

  const results = [];
  let originalRows = [];
  let restored = null;
  let restoreError = null;

  try {
    await page.goto("http://localhost:3000/login", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(4000);
    const accept = page.getByRole("button", { name: "Accept", exact: true });
    if (await accept.count()) await accept.click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Continue with Email" }).click();
    await page.locator("input[type=email]").fill(env.QA_TEST_EMAIL);
    await page.locator("input[type=password]").fill(env.QA_TEST_PASSWORD);
    await page.getByRole("button", { name: "Log In" }).click();
    await page.waitForURL(/dashboard/, { timeout: 25000 }).catch(() => {});
    await page.goto(builderUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    const form = page.locator("[data-testid=invitation-builder-form-column]");
    const header = page.locator("#inv-section-header-music");
    await form.waitFor({ timeout: 20000 });

    async function openMusic() {
      if (!(await form.locator("input[type=url]").isVisible().catch(() => false))) {
        await header.click();
        await form.locator("input[type=url]").waitFor({ timeout: 10000 });
      }
    }

    async function removeLinks() {
      while (await form.locator("li button").count()) {
        await form.locator("li button").first().click();
      }
    }

    async function addLink(provider, url) {
      await openMusic();
      await removeLinks();
      await form.locator("select").first().selectOption(provider);
      await form.locator("input[type=url]").fill(url);
      await page.getByRole("button", { name: "Add music link", exact: true }).click();
      await waitForSaved(page);
    }

    async function reloadAndVerify(url) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await form.waitFor({ timeout: 20000 });
      await page.waitForTimeout(500);
      const summary = (await header.innerText()).replace(/\s+/g, " ").trim();
      await openMusic();
      const savedLinks = await form.locator("li").evaluateAll((items) =>
        items.map((item) => [...item.querySelectorAll("p")].map((p) => p.innerText))
      );
      return {
        persisted: savedLinks.some((item) => item[1] === url),
        summary,
        savedLinks,
      };
    }

    await openMusic();
    originalRows = await form.locator("li").evaluateAll((items) =>
      items.map((item) => {
        const values = [...item.querySelectorAll("p")].map((p) => p.innerText);
        return { name: values[0], url: values[1] };
      })
    );

    await openMusic();
    const shortLink = "https://on.soundcloud.com/oxBTA32x4EgwvKVz5";
    const shortLinksBefore = await form.locator("li").count();
    await form.locator("select").first().selectOption("soundcloud");
    await form.locator("input[type=url]").fill(shortLink);
    await page.getByRole("button", { name: "Add music link", exact: true }).click();
    const shortError = await form.getByRole("alert").innerText();
    results.push({
      variant: "on.soundcloud.com short link",
      url: shortLink,
      added: false,
      builderError: shortError,
      listUnchanged: (await form.locator("li").count()) === shortLinksBefore,
    });

    for (const variant of variants) {
      const result = {
        variant: variant.name,
        url: variant.url,
        saved: false,
        playbackEvent: false,
        pauseEvent: false,
      };
      const responseStart = logs.responses.length;
      const failedStart = logs.failed.length;
      const consoleStart = logs.console.length;

      try {
        await addLink("soundcloud", variant.url);
        Object.assign(result, await reloadAndVerify(variant.url));
        result.saved = result.persisted;

        await guest.goto(previewUrl, { waitUntil: "commit", timeout: 30000 });
        await guest
          .waitForFunction(() => {
            const labels = [...document.querySelectorAll("button[aria-label]")].map(
              (button) => button.getAttribute("aria-label") || ""
            );
            const state = labels.find((label) =>
              /^(Play invitation music|Pause invitation music|SoundCloud playback unavailable|Music player loading)/i.test(
                label
              )
            );
            return !!state && state !== "Music player loading";
          }, null, { timeout: 25000 })
          .catch(() => {});
        const pill = guest.locator(
          'button[aria-label="Play invitation music"],button[aria-label="Pause invitation music"],button[aria-label="Music player loading"],button[aria-label="Starting SoundCloud playback"],button[aria-label^="SoundCloud playback unavailable"]'
        ).last();
        result.initialPillLabel = await guest.evaluate(() =>
          [...document.querySelectorAll("button[aria-label]")]
            .map((button) => button.getAttribute("aria-label") || "")
            .find((label) =>
              /^(Play invitation music|Pause invitation music|Music player loading|Starting SoundCloud playback|SoundCloud playback unavailable)/i.test(
                label
              )
            ) ?? null
        );
        result.iframe = await guest
          .locator('iframe[title="Hidden music player"]')
          .evaluate((frame) => ({ src: frame.src, allow: frame.allow }))
          .catch(() => null);
        result.widget = await guest.evaluate(() => {
          const frame = document.querySelector('iframe[title="Hidden music player"]');
          const api = window.SC;
          if (!frame || !api) return { loaded: !!api, frame: !!frame };
          const events = api.Widget.Events;
          const widget = api.Widget(frame);
          window.__scProof = { play: 0, pause: 0, error: 0 };
          widget.bind(events.PLAY, () => window.__scProof.play++);
          widget.bind(events.PAUSE, () => window.__scProof.pause++);
          widget.bind(events.ERROR, () => window.__scProof.error++);
          return { loaded: true, events };
        });

        result.previewUrl = guest.url();
        result.frameUrls = guest.frames().map((frame) => frame.url()).slice(0, 8);

        if (result.initialPillLabel === "Play invitation music") {
          await pill.click();
          await guest
            .waitForFunction(() => {
              const labels = [...document.querySelectorAll("button[aria-label]")].map(
                (button) => button.getAttribute("aria-label") || ""
              );
              return (
                (window.__scProof?.play || 0) > 0 ||
                labels.some((label) => /SoundCloud playback unavailable/i.test(label))
              );
            }, null, { timeout: 12000 })
            .catch(() => {});
          const playback = await guest.evaluate(() => ({
            events: window.__scProof,
            label: [...document.querySelectorAll("button[aria-label]")]
              .map((button) => button.getAttribute("aria-label") || "")
              .find((label) => /invitation music|SoundCloud playback/i.test(label)),
          }));
          result.providerEvents = playback.events;
          result.finalPillLabel = playback.label;
          result.playbackEvent = (playback.events?.play || 0) > 0;

          if (result.playbackEvent) {
            await pill.click();
            await guest
              .waitForFunction(() => (window.__scProof?.pause || 0) > 0, null, { timeout: 8000 })
              .catch(() => {});
            result.providerEventsAfterPause = await guest.evaluate(() => window.__scProof);
            result.pauseEvent = (result.providerEventsAfterPause?.pause || 0) > 0;
            result.pillLabelAfterPause = await pill.getAttribute("aria-label").catch(() => null);
          }
        } else {
          result.finalPillLabel = result.initialPillLabel;
        }

        result.csp = await guest.evaluate(() =>
          (window.__csp || []).filter((item) => /soundcloud|sndcdn/i.test(item.blocked))
        );
      } catch (error) {
        result.testError = error.message;
      }

      result.providerConsoleErrors = logs.console
        .slice(consoleStart)
        .filter((message) => /soundcloud|sndcdn|NotAllowedError|AbortError/i.test(message));
      result.providerRequestFailures = logs.failed
        .slice(failedStart)
        .filter((request) => !/ERR_ABORTED/.test(request.error || ""))
        .slice(0, 6);
      result.providerResponses = logs.responses
        .slice(responseStart)
        .filter((response) =>
          /w\.soundcloud\.com\/player|w\.soundcloud\.com\/player\/api\.js|api-widget\.soundcloud\.com\/(resolve|tracks|media)/.test(
            response.url
          )
        )
        .slice(0, 12);
      results.push(result);
    }
  } finally {
    if (originalRows.length) {
      try {
        await page.goto(builderUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        const form = page.locator("[data-testid=invitation-builder-form-column]");
        const header = page.locator("#inv-section-header-music");
        await form.waitFor({ timeout: 20000 });
        if (!(await form.locator("input[type=url]").isVisible().catch(() => false))) {
          await header.click();
          await form.locator("input[type=url]").waitFor({ timeout: 10000 });
        }
        while (await form.locator("li button").count()) {
          await form.locator("li button").first().click();
        }
        const providerByName = {
          Spotify: "spotify",
          "Apple Music": "apple",
          SoundCloud: "soundcloud",
          Audiomack: "audiomack",
        };
        for (const item of originalRows) {
          const provider = providerByName[item.name];
          if (!provider) continue;
          await form.locator("select").first().selectOption(provider);
          await form.locator("input[type=url]").fill(item.url);
          await page.getByRole("button", { name: "Add music link", exact: true }).click();
          await page.waitForTimeout(300);
        }
        await waitForSaved(page);
        await page.reload({ waitUntil: "domcontentloaded" });
        await form.waitFor({ timeout: 20000 });
        await page.waitForTimeout(500);
        if (!(await form.locator("input[type=url]").isVisible().catch(() => false))) {
          await header.click();
        }
        restored = await form.locator("li").evaluateAll((items) =>
          items.map((item) => [...item.querySelectorAll("p")].map((p) => p.innerText))
        );
      } catch (error) {
        restoreError = error.message;
      }
    }

    console.log(
      JSON.stringify({
        originalRows,
        results,
        restored,
        restoredMatches:
          restored !== null &&
          JSON.stringify(originalRows.map((item) => [item.name, item.url])) === JSON.stringify(restored),
        restoreError,
        providerConsoleErrors: logs.console.slice(-20),
      })
    );
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
