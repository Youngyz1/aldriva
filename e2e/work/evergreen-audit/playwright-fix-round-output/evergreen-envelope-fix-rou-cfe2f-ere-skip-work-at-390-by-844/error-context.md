# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: evergreen-envelope-fix-round.spec.ts >> one-tap gate, card crossover, reduced motion and tap-anywhere skip work at 390 by 844
- Location: e2e\evergreen-envelope-fix-round.spec.ts:74:5

# Error details

```
Error: expect(locator).toBeEnabled() failed

Locator:  locator('[data-evergreen-gate="true"]').locator('[data-evergreen-seal="true"]')
Expected: enabled
Received: disabled
Timeout:  2000ms

Call log:
  - Expect "toBeEnabled" with timeout 2000ms
  - waiting for locator('[data-evergreen-gate="true"]').locator('[data-evergreen-seal="true"]')
    17 × locator resolved to <button disabled type="button" aria-busy="true" aria-disabled="true" data-evergreen-seal="true" aria-label="Open the Evergreen Envelope invitation" class="absolute left-1/2 top-[60.5%] z-50 grid size-[7.5rem] place-items-center rounded-full focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-emerald-950 disabled:cursor-wait">…</button>
       - unexpected value "disabled"

```

```yaml
- button "Open the Evergreen Envelope invitation" [disabled]
```

# Test source

```ts
  1   | import { expect, test, type Page } from "@playwright/test";
  2   | import fs from "node:fs";
  3   | import path from "node:path";
  4   | 
  5   | const eventId = process.env.EVERGREEN_QA_EVENT_ID || "77456a7f-8cd1-4685-97a1-e443ab89e9be";
  6   | const guestPath = process.env.EVERGREEN_QA_GUEST_PATH;
  7   | const evidenceDir = process.env.EVERGREEN_EVIDENCE_DIR || path.resolve("work/evergreen-audit/fix-round-evidence");
  8   | 
  9   | function saveEvidence(name: string) {
  10  |   fs.mkdirSync(evidenceDir, { recursive: true });
  11  |   return path.join(evidenceDir, name);
  12  | }
  13  | 
  14  | async function stageName(page: Page) {
  15  |   return page.locator('[data-evergreen-gate="true"]').getAttribute("data-evergreen-envelope-stage");
  16  | }
  17  | 
  18  | async function openGate(page: Page) {
  19  |   await page.goto(`/invitation/builder-preview/${eventId}?embed=1`, { waitUntil: "domcontentloaded" });
  20  |   const gate = page.locator('[data-evergreen-gate="true"]');
  21  |   await expect(gate).toBeVisible();
  22  |   const seal = gate.locator('[data-evergreen-seal="true"]');
  23  |   await expect(seal).toBeEnabled({ timeout: 2_000 });
  24  |   const closedCards = await gate.locator("[data-evergreen-gate-card]").evaluateAll((cards) => cards.map((card) => ({
  25  |     ariaHidden: card.getAttribute("aria-hidden"),
  26  |     opacity: getComputedStyle(card).opacity,
  27  |     rect: card.getBoundingClientRect().toJSON(),
  28  |   })));
  29  |   expect(closedCards.length).toBe(2);
  30  |   expect(closedCards.every((card) => card.ariaHidden === "true" && card.opacity === "0")).toBe(true);
  31  |   await seal.click();
  32  |   await expect(gate).toHaveAttribute("data-evergreen-envelope-stage", "complete", { timeout: 6_000 });
  33  |   await expect(page.locator('[data-evergreen-page="true"]')).toHaveAttribute("aria-hidden", "false");
  34  | }
  35  | 
  36  | async function clickEveryMapLink(page: Page) {
  37  |   const links = page.locator('[data-evergreen-map-link="true"]');
  38  |   const count = await links.count();
  39  |   expect(count).toBeGreaterThan(0);
  40  |   const opened: string[] = [];
  41  | 
  42  |   for (let index = 0; index < count; index += 1) {
  43  |     const link = links.nth(index);
  44  |     await link.scrollIntoViewIfNeeded();
  45  |     const linkDetails = await link.evaluate((element) => {
  46  |       const anchor = element as HTMLAnchorElement;
  47  |       const rect = anchor.getBoundingClientRect();
  48  |       const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  49  |       return {
  50  |         href: anchor.href,
  51  |         target: anchor.target,
  52  |         rel: anchor.rel,
  53  |         hitIsLink: Boolean(hit && (hit === anchor || anchor.contains(hit))),
  54  |       };
  55  |     });
  56  |     expect(linkDetails.href.startsWith("https://")).toBe(true);
  57  |     expect(linkDetails.target).toBe("_blank");
  58  |     expect(linkDetails.rel).toContain("noopener");
  59  |     expect(linkDetails.rel).toContain("noreferrer");
  60  |     expect(linkDetails.hitIsLink).toBe(true);
  61  | 
  62  |     const popupPromise = page.waitForEvent("popup");
  63  |     await link.click();
  64  |     const popup = await popupPromise;
  65  |     await popup.waitForLoadState("domcontentloaded", { timeout: 12_000 }).catch(() => {});
  66  |     expect(popup.url()).toBe(linkDetails.href);
  67  |     await popup.screenshot({ path: saveEvidence(`${page.url().includes("builder-preview") ? "preview" : "guest"}-venue-map-${index + 1}-opened.png`) }).catch(() => {});
  68  |     opened.push(popup.url());
  69  |     await popup.close();
  70  |   }
  71  |   return opened;
  72  | }
  73  | 
  74  | test("one-tap gate, card crossover, reduced motion and tap-anywhere skip work at 390 by 844", async ({ page }) => {
  75  |   await page.goto(`/invitation/builder-preview/${eventId}?embed=1`, { waitUntil: "domcontentloaded" });
  76  |   const gate = page.locator('[data-evergreen-gate="true"]');
  77  |   await expect(gate).toBeVisible();
  78  |   const seal = gate.locator('[data-evergreen-seal="true"]');
> 79  |   await expect(seal).toBeEnabled({ timeout: 2_000 });
      |                      ^ Error: expect(locator).toBeEnabled() failed
  80  |   const closedCards = await gate.locator("[data-evergreen-gate-card]").evaluateAll((cards) => cards.map((card) => ({
  81  |     ariaHidden: card.getAttribute("aria-hidden"),
  82  |     opacity: getComputedStyle(card).opacity,
  83  |     top: Math.round(card.getBoundingClientRect().top),
  84  |   })));
  85  |   expect(closedCards).toHaveLength(2);
  86  |   expect(closedCards.every((card) => card.ariaHidden === "true" && card.opacity === "0")).toBe(true);
  87  |   await page.screenshot({ path: saveEvidence("preview-gate-closed.png") });
  88  |   const musicAtGate = page.locator('[data-evergreen-music] button').first();
  89  |   if (await musicAtGate.count()) {
  90  |     await expect(musicAtGate).toBeVisible();
  91  |     const musicGeometry = await musicAtGate.evaluate((element) => {
  92  |       const rect = element.getBoundingClientRect();
  93  |       const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  94  |       return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), hit: Boolean(hit && (hit === element || element.contains(hit))) };
  95  |     });
  96  |     expect(musicGeometry.top).toBeLessThan(80);
  97  |     expect(musicGeometry.hit).toBe(true);
  98  |     await page.screenshot({ path: saveEvidence("preview-music-at-gate.png") });
  99  |   }
  100 | 
  101 |   await seal.click();
  102 |   await page.waitForTimeout(80);
  103 |   await page.screenshot({ path: saveEvidence("preview-seal-press.png") });
  104 |   await page.waitForTimeout(140);
  105 |   expect(await stageName(page)).toBe("flap-opening");
  106 |   await page.screenshot({ path: saveEvidence("preview-flap-opening.png") });
  107 |   await page.waitForTimeout(690);
  108 |   expect(await stageName(page)).toBe("cards-rising");
  109 |   await page.waitForTimeout(300);
  110 |   await page.screenshot({ path: saveEvidence("preview-cards-rising-cover-crossover.png") });
  111 |   const raisedCards = await gate.locator("[data-evergreen-gate-card]").evaluateAll((cards) => cards.map((card) => ({
  112 |     opacity: Number(getComputedStyle(card).opacity),
  113 |     transform: getComputedStyle(card).transform,
  114 |     hidden: card.getAttribute("aria-hidden"),
  115 |   })));
  116 |   expect(raisedCards.some((card) => card.opacity > 0.7 && card.hidden === "false")).toBe(true);
  117 |   await page.waitForTimeout(200);
  118 |   expect(["crossfade", "complete"]).toContain(await stageName(page));
  119 |   await page.screenshot({ path: saveEvidence("preview-cover-crossfade.png") });
  120 |   await expect(gate).toHaveAttribute("data-evergreen-envelope-stage", "complete", { timeout: 2_000 });
  121 |   await expect(page.locator('[data-evergreen-page="true"]')).toHaveAttribute("aria-hidden", "false");
  122 |   await page.screenshot({ path: saveEvidence("preview-finished-cover.png") });
  123 |   await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
  124 |   await page.waitForTimeout(100);
  125 |   if (await musicAtGate.count()) {
  126 |     await expect(musicAtGate).toBeVisible();
  127 |     await page.screenshot({ path: saveEvidence("preview-music-while-scrolling.png") });
  128 |   }
  129 | 
  130 |   // A separate page keeps this reduced-motion proof independent of the first run.
  131 |   const reducedContext = await page.context().browser()!.newContext({
  132 |     baseURL: "http://localhost:3000",
  133 |     reducedMotion: "reduce",
  134 |     viewport: { width: 390, height: 844 },
  135 |     isMobile: true,
  136 |     hasTouch: true,
  137 |     deviceScaleFactor: 1,
  138 |     storageState: path.resolve(process.env.EVERGREEN_QA_ADMIN_STATE || "work/evergreen-audit/qa-admin-state.json"),
  139 |   });
  140 |   const reducedPage = await reducedContext.newPage();
  141 |   await reducedPage.goto(`/invitation/builder-preview/${eventId}?embed=1`, { waitUntil: "domcontentloaded" });
  142 |   const reducedGate = reducedPage.locator('[data-evergreen-gate="true"]');
  143 |   const reducedSeal = reducedGate.locator('[data-evergreen-seal="true"]');
  144 |   await expect(reducedSeal).toBeEnabled({ timeout: 2_000 });
  145 |   const cardTransformBefore = await reducedGate.locator("[data-evergreen-gate-card]").first().evaluate((element) => getComputedStyle(element).transform);
  146 |   await reducedPage.screenshot({ path: saveEvidence("preview-reduced-motion-before.png") });
  147 |   await reducedSeal.click();
  148 |   await expect(reducedGate).toHaveAttribute("data-evergreen-envelope-stage", "crossfade", { timeout: 1_000 });
  149 |   const reducedCard = reducedGate.locator("[data-evergreen-gate-card]").first();
  150 |   expect(await reducedCard.evaluate((element) => getComputedStyle(element).transform)).toBe(cardTransformBefore);
  151 |   await reducedPage.screenshot({ path: saveEvidence("preview-reduced-motion-crossfade.png") });
  152 |   await expect(reducedGate).toHaveAttribute("data-evergreen-envelope-stage", "complete", { timeout: 1_000 });
  153 |   await reducedContext.close();
  154 | 
  155 |   // A click anywhere during the flap phase is a skip-to-cover action.
  156 |   const skipContext = await page.context().browser()!.newContext({
  157 |     baseURL: "http://localhost:3000",
  158 |     viewport: { width: 390, height: 844 },
  159 |     isMobile: true,
  160 |     hasTouch: true,
  161 |     deviceScaleFactor: 1,
  162 |     storageState: path.resolve(process.env.EVERGREEN_QA_ADMIN_STATE || "work/evergreen-audit/qa-admin-state.json"),
  163 |   });
  164 |   const skipPage = await skipContext.newPage();
  165 |   await skipPage.goto(`/invitation/builder-preview/${eventId}?embed=1`, { waitUntil: "domcontentloaded" });
  166 |   const skipGate = skipPage.locator('[data-evergreen-gate="true"]');
  167 |   await expect(skipGate.locator('[data-evergreen-seal="true"]')).toBeEnabled({ timeout: 2_000 });
  168 |   await skipGate.locator('[data-evergreen-seal="true"]').click();
  169 |   await expect(skipGate).toHaveAttribute("data-evergreen-envelope-stage", "flap-opening", { timeout: 1_000 });
  170 |   await skipGate.click({ position: { x: 18, y: 250 } });
  171 |   await expect(skipGate).toHaveAttribute("data-evergreen-envelope-stage", "complete", { timeout: 2_000 });
  172 |   await skipPage.screenshot({ path: saveEvidence("preview-skip-to-cover.png") });
  173 |   await skipContext.close();
  174 | });
  175 | 
  176 | test("gate sequence remains layered at four-times CPU throttling", async ({ page }) => {
  177 |   const cdp = await page.context().newCDPSession(page);
  178 |   await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  179 |   await page.goto(`/invitation/builder-preview/${eventId}?embed=1`, { waitUntil: "domcontentloaded" });
```