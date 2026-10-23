import { expect, test, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import jsQR from "jsqr";
import sharp from "sharp";

const eventId = process.env.EVERGREEN_QA_EVENT_ID || "77456a7f-8cd1-4685-97a1-e443ab89e9be";
const guestPath = process.env.EVERGREEN_QA_GUEST_PATH;
const expectedQrPayload = process.env.EVERGREEN_QA_EXPECTED_QR;
const expectedGuestName = process.env.EVERGREEN_QA_GUEST_NAME || "";
const expectedEventTitle = process.env.EVERGREEN_QA_EVENT_TITLE || "";
const evidenceDir = process.env.EVERGREEN_EVIDENCE_DIR || path.resolve("work/evergreen-audit/fix-round-evidence");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("Aldriva-cookie-consent", "declined"));
});

function saveEvidence(name: string) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  return path.join(evidenceDir, name);
}

async function startGateRecorder(page: Page) {
  await page.evaluate(() => {
    const samples: Array<Record<string, unknown>> = [];
    let completeAt: number | null = null;
    const sample = () => {
      const gate = document.querySelector<HTMLElement>('[data-evergreen-gate="true"]');
      if (gate) {
        const page = document.querySelector<HTMLElement>('[data-evergreen-page="true"]');
        const cover = document.querySelector<HTMLElement>('[data-evergreen-section="cover"]');
        const cards = Array.from(gate.querySelectorAll<HTMLElement>("[data-evergreen-gate-card]")).map((card) => ({
          hidden: card.getAttribute("aria-hidden"),
          opacity: Number.parseFloat(getComputedStyle(card).opacity),
          transform: getComputedStyle(card).transform,
          zIndex: getComputedStyle(card).zIndex,
        }));
        samples.push({
          ms: Math.round(performance.now()),
          stage: gate.dataset.evergreenEnvelopeStage,
          pageOpacity: page ? Number.parseFloat(getComputedStyle(page).opacity) : 0,
          coverOpacity: cover ? Number.parseFloat(getComputedStyle(cover).opacity) : 0,
          cards,
          flapZIndex: getComputedStyle(gate.querySelector<HTMLElement>("[data-evergreen-envelope-flap]")!).zIndex,
          pocketZIndex: getComputedStyle(gate.querySelector<HTMLElement>("[data-evergreen-envelope-pocket]")!).zIndex,
        });
        if (gate.dataset.evergreenEnvelopeStage === "complete") {
          completeAt ??= performance.now();
          if (performance.now() - completeAt > 250) return;
        }
      }
      requestAnimationFrame(sample);
    };
    Reflect.set(window, "__evergreenGateFrames", samples);
    requestAnimationFrame(sample);
  });
}

async function recordedGateFrames(page: Page) {
  return page.evaluate(() => Reflect.get(window, "__evergreenGateFrames") as Array<{
    stage?: string;
    pageOpacity?: number;
    coverOpacity?: number;
    cards?: Array<{ hidden: string | null; opacity: number; zIndex: string }>;
    flapZIndex?: string;
    pocketZIndex?: string;
  }>);
}

function expectRecordedOpening(frames: Awaited<ReturnType<typeof recordedGateFrames>>) {
  const stages = new Set(frames.map((frame) => frame.stage));
  for (const stage of ["seal-press", "flap-opening", "cards-rising", "crossfade", "complete"]) {
    expect(stages.has(stage), `recording contains ${stage}`).toBe(true);
  }
  expect(frames.some((frame) => frame.stage === "cards-rising" && frame.cards?.some((card) => card.hidden === "false" && card.opacity > 0.5))).toBe(true);
  expect(frames.every((frame) => Number(frame.flapZIndex) < Number(frame.pocketZIndex))).toBe(true);
  expect(frames.every((frame) => frame.cards?.every((card) => Number(card.zIndex) < Number(frame.pocketZIndex)))).toBe(true);
  expect(frames.every((frame) => (frame.pageOpacity ?? 0) >= 0.99 && (frame.coverOpacity ?? 0) >= 0.99), "the already-mounted cover stays visible beneath the fading envelope").toBe(true);
}

async function expectEnvelopeOnly(page: Page, gate: Locator) {
  const state = await page.evaluate(() => {
    const envelope = document.querySelector<HTMLElement>('[data-evergreen-gate="true"]');
    const invitation = document.querySelector<HTMLElement>('[data-evergreen-page="true"]');
    const paper = envelope?.firstElementChild;
    const hit = document.elementFromPoint(Math.round(window.innerWidth / 2), Math.round(window.innerHeight / 2));
    return {
      pageOpacity: invitation ? getComputedStyle(invitation).opacity : "0",
      pageAriaHidden: invitation?.getAttribute("aria-hidden"),
      pageInert: invitation?.inert ?? false,
      paperOpacity: paper ? getComputedStyle(paper).opacity : "0",
      hitInsideEnvelope: Boolean(envelope && hit && envelope.contains(hit)),
    };
  });
  expect(state).toEqual({ pageOpacity: "1", pageAriaHidden: "true", pageInert: true, paperOpacity: "1", hitInsideEnvelope: true });
  await expect(gate).toBeVisible();
}

async function openGate(page: Page) {
  await page.goto(`/invitation/builder-preview/${eventId}?embed=1`, { waitUntil: "domcontentloaded" });
  const gate = page.locator('[data-evergreen-gate="true"]');
  await expect(gate).toBeVisible();
  const seal = gate.locator('[data-evergreen-seal="true"]');
  await expect(seal).toBeEnabled({ timeout: 8_000 });
  const closedCards = await gate.locator("[data-evergreen-gate-card]").evaluateAll((cards) => cards.map((card) => ({
    ariaHidden: card.getAttribute("aria-hidden"),
    opacity: getComputedStyle(card).opacity,
    rect: card.getBoundingClientRect().toJSON(),
  })));
  expect(closedCards.length).toBe(2);
  expect(closedCards.every((card) => card.ariaHidden === "true" && card.opacity === "0")).toBe(true);
  await expectEnvelopeOnly(page, gate);
  await seal.tap();
  await expect(gate).toHaveAttribute("data-evergreen-envelope-stage", "complete", { timeout: 6_000 });
  await expect(page.locator('[data-evergreen-page="true"]')).toHaveAttribute("aria-hidden", "false");
}

async function clickEveryMapLink(page: Page) {
  const links = page.locator('[data-evergreen-map-link="true"]');
  const count = await links.count();
  expect(count).toBeGreaterThan(0);
  const opened: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const link = links.nth(index);
    await link.scrollIntoViewIfNeeded();
    const linkDetails = await link.evaluate((element) => {
      const anchor = element as HTMLAnchorElement;
      const rect = anchor.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        href: anchor.href,
        target: anchor.target,
        rel: anchor.rel,
        hitIsLink: Boolean(hit && (hit === anchor || anchor.contains(hit))),
      };
    });
    expect(linkDetails.href.startsWith("https://")).toBe(true);
    expect(linkDetails.target).toBe("_blank");
    expect(linkDetails.rel).toContain("noopener");
    expect(linkDetails.rel).toContain("noreferrer");
    expect(linkDetails.hitIsLink).toBe(true);

    const popupPromise = page.waitForEvent("popup");
    await link.tap();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded", { timeout: 12_000 }).catch(() => {});
    expect(popup.url()).toBe(linkDetails.href);
    await popup.screenshot({ path: saveEvidence(`${page.url().includes("builder-preview") ? "preview" : "guest"}-venue-map-${index + 1}-opened.png`) }).catch(() => {});
    opened.push(popup.url());
    await popup.close();
  }
  return opened;
}

test("one-tap gate, card crossover, reduced motion and tap-anywhere skip work at 390 by 844", async ({ page }) => {
  await page.goto(`/invitation/builder-preview/${eventId}?embed=1`, { waitUntil: "domcontentloaded" });
  const gate = page.locator('[data-evergreen-gate="true"]');
  await expect(gate).toBeVisible();
  const seal = gate.locator('[data-evergreen-seal="true"]');
  await expect(seal).toBeEnabled({ timeout: 8_000 });
  const closedCards = await gate.locator("[data-evergreen-gate-card]").evaluateAll((cards) => cards.map((card) => ({
    ariaHidden: card.getAttribute("aria-hidden"),
    opacity: getComputedStyle(card).opacity,
    top: Math.round(card.getBoundingClientRect().top),
  })));
  expect(closedCards).toHaveLength(2);
  expect(closedCards.every((card) => card.ariaHidden === "true" && card.opacity === "0")).toBe(true);
  await expectEnvelopeOnly(page, gate);
  await page.screenshot({ path: saveEvidence("preview-gate-closed.png") });
  const musicAtGate = page.locator('[data-evergreen-music] button').first();
  if (await musicAtGate.count()) {
    await expect(musicAtGate).toBeVisible();
    const musicGeometry = await musicAtGate.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), hit: Boolean(hit && (hit === element || element.contains(hit))) };
    });
    expect(musicGeometry.top).toBeLessThan(80);
    expect(musicGeometry.hit).toBe(true);
    await page.screenshot({ path: saveEvidence("preview-music-at-gate.png") });
  }

  await startGateRecorder(page);
  await seal.tap();
  await expect(gate).toHaveAttribute("data-evergreen-envelope-stage", "complete", { timeout: 6_000 });
  expectRecordedOpening(await recordedGateFrames(page));
  await expect(page.locator('[data-evergreen-page="true"]')).toHaveAttribute("aria-hidden", "false");
  await page.screenshot({ path: saveEvidence("preview-finished-cover.png") });
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
  await page.waitForTimeout(100);
  if (await musicAtGate.count()) {
    await expect(musicAtGate).toBeVisible();
    await page.screenshot({ path: saveEvidence("preview-music-while-scrolling.png") });
  }

  // A separate page keeps this reduced-motion proof independent of the first run.
  const reducedContext = await page.context().browser()!.newContext({
    baseURL: "http://localhost:3000",
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    storageState: path.resolve(process.env.EVERGREEN_QA_ADMIN_STATE || "work/evergreen-audit/qa-admin-state.json"),
  });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(`/invitation/builder-preview/${eventId}?embed=1`, { waitUntil: "domcontentloaded" });
  const reducedGate = reducedPage.locator('[data-evergreen-gate="true"]');
  const reducedSeal = reducedGate.locator('[data-evergreen-seal="true"]');
  await expect(reducedSeal).toBeEnabled({ timeout: 8_000 });
  await reducedPage.waitForTimeout(250);
  const cardTransformBefore = await reducedGate.locator("[data-evergreen-gate-card]").first().evaluate((element) => getComputedStyle(element).transform);
  await reducedPage.screenshot({ path: saveEvidence("preview-reduced-motion-before.png") });
  await startGateRecorder(reducedPage);
  await reducedSeal.tap();
  await expect(reducedGate).toHaveAttribute("data-evergreen-envelope-stage", "complete", { timeout: 1_500 });
  const reducedFrames = await recordedGateFrames(reducedPage);
  const reducedStages = new Set(reducedFrames.map((frame) => frame.stage));
  expect(reducedStages.has("crossfade")).toBe(true);
  expect(reducedStages.has("flap-opening")).toBe(false);
  expect(reducedStages.has("cards-rising")).toBe(false);
  const reducedCard = reducedGate.locator("[data-evergreen-gate-card]").first();
  expect(await reducedCard.evaluate((element) => getComputedStyle(element).transform)).toBe(cardTransformBefore);
  await reducedPage.screenshot({ path: saveEvidence("preview-reduced-motion-crossfade.png") });
  await expect(reducedGate).toHaveAttribute("data-evergreen-envelope-stage", "complete", { timeout: 1_000 });
  await reducedContext.close();

  // A click anywhere during the flap phase is a skip-to-cover action.
  const skipContext = await page.context().browser()!.newContext({
    baseURL: "http://localhost:3000",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    storageState: path.resolve(process.env.EVERGREEN_QA_ADMIN_STATE || "work/evergreen-audit/qa-admin-state.json"),
  });
  const skipPage = await skipContext.newPage();
  await skipPage.goto(`/invitation/builder-preview/${eventId}?embed=1`, { waitUntil: "domcontentloaded" });
  const skipGate = skipPage.locator('[data-evergreen-gate="true"]');
  await expect(skipGate.locator('[data-evergreen-seal="true"]')).toBeEnabled({ timeout: 8_000 });
  await skipGate.locator('[data-evergreen-seal="true"]').tap();
  await expect(skipGate).toHaveAttribute("data-evergreen-envelope-stage", "flap-opening", { timeout: 1_000 });
  await skipGate.tap({ position: { x: 18, y: 250 } });
  await expect(skipGate).toHaveAttribute("data-evergreen-envelope-stage", "complete", { timeout: 2_000 });
  await skipPage.screenshot({ path: saveEvidence("preview-skip-to-cover.png") });
  await skipContext.close();
});

test("gate sequence remains layered at four-times CPU throttling", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto(`/invitation/builder-preview/${eventId}?embed=1`, { waitUntil: "domcontentloaded" });
  const gate = page.locator('[data-evergreen-gate="true"]');
  const seal = gate.locator('[data-evergreen-seal="true"]');
  await expect(seal).toBeEnabled({ timeout: 12_000 });
  await expectEnvelopeOnly(page, gate);
  await page.screenshot({ path: saveEvidence("preview-4x-gate-closed.png") });
  await startGateRecorder(page);
  await seal.tap();
  await expect(gate).toHaveAttribute("data-evergreen-envelope-stage", "complete", { timeout: 4_000 });
  expectRecordedOpening(await recordedGateFrames(page));
  await page.screenshot({ path: saveEvidence("preview-4x-finished-cover.png") });
  await cdp.detach();
});

test("published guest music is off at the gate, plays on tap, pauses on the next tap, and stays fixed while scrolling", async ({ page }) => {
  test.skip(!guestPath, "Set EVERGREEN_QA_GUEST_PATH to the published token route for the fresh QA event.");
  await page.goto(guestPath!, { waitUntil: "domcontentloaded" });
  const music = page.locator('[data-evergreen-music]');
  const button = music.locator("button").first();
  const audio = music.locator("audio").first();
  await expect(button).toBeVisible();
  await expect(audio).toHaveJSProperty("paused", true);
  const gateRect = await button.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: Math.round(rect.top), height: Math.round(rect.height) };
  });
  expect(gateRect.top).toBeGreaterThanOrEqual(0);
  expect(gateRect.top).toBeLessThan(80);
  await page.screenshot({ path: saveEvidence("guest-music-idle-at-gate.png") });

  const mediaResponses: Array<{ status: number; contentType: string }> = [];
  page.on("response", (response) => {
    if (response.request().resourceType() === "media") {
      mediaResponses.push({ status: response.status(), contentType: response.headers()["content-type"] || "" });
    }
  });
  await button.tap();
  await expect(button).toHaveAttribute("aria-label", "Pause invitation music", { timeout: 12_000 });
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime), { timeout: 8_000 }).toBeGreaterThan(0.25);
  expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(false);
  await page.screenshot({ path: saveEvidence("guest-music-playing-at-gate.png") });

  await button.tap();
  await expect(button).toHaveAttribute("aria-label", "Play invitation music");
  expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  expect(mediaResponses.some((response) => [200, 206].includes(response.status) && response.contentType.startsWith("audio/"))).toBe(true);

  const gate = page.locator('[data-evergreen-gate="true"]');
  await gate.locator('[data-evergreen-seal="true"]').tap();
  await expect(gate).toHaveAttribute("data-evergreen-envelope-stage", "complete", { timeout: 6_000 });
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
  await expect(button).toBeVisible();
  const scrollRect = await button.evaluate((element) => Math.round(element.getBoundingClientRect().top));
  expect(scrollRect).toBeGreaterThanOrEqual(0);
  expect(scrollRect).toBeLessThan(80);
  await page.screenshot({ path: saveEvidence("guest-music-idle-while-scrolling.png") });
});

test("Evergreen preview and guest map buttons open every venue URL on touch-sized viewport", async ({ page }) => {
  test.skip(!guestPath, "Set EVERGREEN_QA_GUEST_PATH to the published token route for the fresh QA event.");

  await openGate(page);
  const previewOpened = await clickEveryMapLink(page);

  await page.locator('[data-evergreen-section="venues"]').screenshot({ path: saveEvidence("preview-venue-buttons.png") });

  await page.goto(guestPath!, { waitUntil: "domcontentloaded" });
  const guestGate = page.locator('[data-evergreen-gate="true"]');
  await expect(guestGate).toBeVisible();
  const guestSeal = guestGate.locator('[data-evergreen-seal="true"]');
  await expect(guestSeal).toBeEnabled({ timeout: 8_000 });
  const guestClosedCards = await guestGate.locator("[data-evergreen-gate-card]").evaluateAll((cards) => cards.map((card) => ({
    hidden: card.getAttribute("aria-hidden"), opacity: getComputedStyle(card).opacity,
  })));
  expect(guestClosedCards.every((card) => card.hidden === "true" && card.opacity === "0")).toBe(true);
  await expectEnvelopeOnly(page, guestGate);
  await page.screenshot({ path: saveEvidence("guest-gate-closed.png") });
  const guestMusic = page.locator('[data-evergreen-music] button').first();
  if (await guestMusic.count()) await page.screenshot({ path: saveEvidence("guest-music-at-gate.png") });
  await startGateRecorder(page);
  await guestSeal.tap();
  await expect(guestGate).toHaveAttribute("data-evergreen-envelope-stage", "complete", { timeout: 6_000 });
  expectRecordedOpening(await recordedGateFrames(page));
  await page.screenshot({ path: saveEvidence("guest-finished-cover.png") });
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
  await page.waitForTimeout(100);
  if (await guestMusic.count()) {
    await expect(guestMusic).toBeVisible();
    await page.screenshot({ path: saveEvidence("guest-music-while-scrolling.png") });
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const guestOpened = await clickEveryMapLink(page);
  await page.locator('[data-evergreen-section="venues"]').screenshot({ path: saveEvidence("guest-venue-buttons.png") });

  expect(guestOpened).toHaveLength(previewOpened.length);
});

test("accepted guest QR opens a large accessible dialog and decodes to the original pass payload", async ({ page }) => {
  test.skip(!guestPath || !expectedQrPayload, "Provide the accepted QA guest route and ticket payload from the read-only fixture probe.");
  await page.goto(guestPath!, { waitUntil: "domcontentloaded" });
  const gate = page.locator('[data-evergreen-gate="true"]');
  await expect(gate).toBeVisible();
  const seal = gate.locator('[data-evergreen-seal="true"]');
  await expect(seal).toBeEnabled({ timeout: 8_000 });
  const closedCards = await gate.locator("[data-evergreen-gate-card]").evaluateAll((cards) => cards.map((card) => ({
    hidden: card.getAttribute("aria-hidden"),
    opacity: getComputedStyle(card).opacity,
  })));
  expect(closedCards.every((card) => card.hidden === "true" && card.opacity === "0")).toBe(true);
  await expectEnvelopeOnly(page, gate);
  expect(await gate.locator("[data-evergreen-gate-card] img").count()).toBe(0);
  const personalizedCardText = await gate.locator('[data-evergreen-gate-card="2"]').innerText();
  expect(personalizedCardText).toContain("Reserved for");
  if (expectedGuestName) expect(personalizedCardText).toContain(expectedGuestName);
  expect(await page.locator("body").innerText()).not.toMatch(/sample (?:photo|content|text)/i);
  await page.screenshot({ path: saveEvidence("guest-gate-closed-qr-view.png") });
  await seal.tap();
  await expect(gate).toHaveAttribute("data-evergreen-envelope-stage", "complete", { timeout: 6_000 });

  const rsvpSection = page.locator('[data-evergreen-section="rsvp"]');
  await expect(rsvpSection).toBeVisible();
  const rsvpTrigger = rsvpSection.getByRole("button").first();
  await rsvpTrigger.tap();
  const rsvpDialog = page.locator("dialog").first();
  await expect(rsvpDialog).toBeVisible();
  const expandTrigger = rsvpDialog.getByRole("button", { name: "Tap to enlarge" });
  await expect(expandTrigger).toBeVisible();
  await expandTrigger.tap();

  const expandedDialog = page.locator('[role="dialog"][data-state="open"]').last();
  await expect(expandedDialog).toBeVisible();
  const qrPanel = expandedDialog.locator("[data-qr-panel]");
  const qrSvg = qrPanel.locator("svg");
  await expect(qrSvg).toBeVisible();
  const expandedSize = await qrSvg.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(expandedSize.width).toBeGreaterThanOrEqual(Math.min(390 * 0.9, 420) - 8);
  const dialogCopy = await expandedDialog.innerText();
  expect(dialogCopy).toMatch(/present for admission/i);
  expect(dialogCopy).toContain("Increase your screen brightness");
  if (expectedGuestName) expect(dialogCopy).toContain(expectedGuestName);
  if (expectedEventTitle) expect(dialogCopy).toContain(expectedEventTitle);
  await page.screenshot({ path: saveEvidence("guest-qr-expanded.png") });

  const svgMarkup = await qrSvg.evaluate((element) => element.outerHTML);
  const raster = await sharp(Buffer.from(svgMarkup)).resize(1024, 1024).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const decoded = jsQR(new Uint8ClampedArray(raster.data), raster.info.width, raster.info.height);
  expect(decoded?.data).toBe(expectedQrPayload);

  await page.keyboard.press("Tab");
  expect(await expandedDialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe("hidden");
  const closeButton = expandedDialog.getByRole("button", { name: "Close", exact: true });
  await expect(closeButton).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(expandedDialog).toBeHidden();
  await expect(expandTrigger).toBeFocused();
  await expandTrigger.tap();
  const reopenedDialog = page.locator('[role="dialog"][data-state="open"]').last();
  await reopenedDialog.getByRole("button", { name: "Close", exact: true }).tap();
  await expect(reopenedDialog).toBeHidden();
  await expect(expandTrigger).toBeFocused();
});
