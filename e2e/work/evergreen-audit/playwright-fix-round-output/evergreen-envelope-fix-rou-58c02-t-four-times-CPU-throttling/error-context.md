# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: evergreen-envelope-fix-round.spec.ts >> gate sequence remains layered at four-times CPU throttling
- Location: e2e\evergreen-envelope-fix-round.spec.ts:176:5

# Error details

```
Error: browserContext.newCDPSession: CDP session is only available in Chromium
```

# Test source

```ts
  77  |   await expect(gate).toBeVisible();
  78  |   const seal = gate.locator('[data-evergreen-seal="true"]');
  79  |   await expect(seal).toBeEnabled({ timeout: 2_000 });
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
> 177 |   const cdp = await page.context().newCDPSession(page);
      |                                    ^ Error: browserContext.newCDPSession: CDP session is only available in Chromium
  178 |   await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  179 |   await page.goto(`/invitation/builder-preview/${eventId}?embed=1`, { waitUntil: "domcontentloaded" });
  180 |   const gate = page.locator('[data-evergreen-gate="true"]');
  181 |   const seal = gate.locator('[data-evergreen-seal="true"]');
  182 |   await expect(seal).toBeEnabled({ timeout: 2_000 });
  183 |   await page.screenshot({ path: saveEvidence("preview-4x-gate-closed.png") });
  184 |   await seal.click();
  185 |   await page.waitForTimeout(180);
  186 |   await page.screenshot({ path: saveEvidence("preview-4x-flap-opening.png") });
  187 |   await expect(gate).toHaveAttribute("data-evergreen-envelope-stage", "flap-opening");
  188 |   await page.waitForTimeout(720);
  189 |   await expect(gate).toHaveAttribute("data-evergreen-envelope-stage", "cards-rising");
  190 |   await page.waitForTimeout(240);
  191 |   await page.screenshot({ path: saveEvidence("preview-4x-cards-rising.png") });
  192 |   const cardState = await gate.locator("[data-evergreen-gate-card]").evaluateAll((cards) => cards.map((card) => ({
  193 |     opacity: Number(getComputedStyle(card).opacity),
  194 |     hidden: card.getAttribute("aria-hidden"),
  195 |     transform: getComputedStyle(card).transform,
  196 |   })));
  197 |   expect(cardState.some((card) => card.opacity > 0.5 && card.hidden === "false")).toBe(true);
  198 |   await expect(gate).toHaveAttribute("data-evergreen-envelope-stage", "complete", { timeout: 4_000 });
  199 |   await page.screenshot({ path: saveEvidence("preview-4x-finished-cover.png") });
  200 |   await cdp.detach();
  201 | });
  202 | 
  203 | test("published guest music is off at the gate, plays on tap, pauses on the next tap, and stays fixed while scrolling", async ({ page }) => {
  204 |   test.skip(!guestPath, "Set EVERGREEN_QA_GUEST_PATH to the published token route for the fresh QA event.");
  205 |   await page.goto(guestPath!, { waitUntil: "domcontentloaded" });
  206 |   const music = page.locator('[data-evergreen-music]');
  207 |   const button = music.locator("button").first();
  208 |   const audio = music.locator("audio").first();
  209 |   await expect(button).toBeVisible();
  210 |   await expect(audio).toHaveJSProperty("paused", true);
  211 |   const gateRect = await button.evaluate((element) => {
  212 |     const rect = element.getBoundingClientRect();
  213 |     return { top: Math.round(rect.top), height: Math.round(rect.height) };
  214 |   });
  215 |   expect(gateRect.top).toBeGreaterThanOrEqual(0);
  216 |   expect(gateRect.top).toBeLessThan(80);
  217 |   await page.screenshot({ path: saveEvidence("guest-music-idle-at-gate.png") });
  218 | 
  219 |   const mediaResponses: Array<{ status: number; contentType: string }> = [];
  220 |   page.on("response", (response) => {
  221 |     if (response.request().resourceType() === "media") {
  222 |       mediaResponses.push({ status: response.status(), contentType: response.headers()["content-type"] || "" });
  223 |     }
  224 |   });
  225 |   await button.click();
  226 |   await expect(button).toHaveAttribute("aria-label", "Pause invitation music", { timeout: 12_000 });
  227 |   await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime), { timeout: 8_000 }).toBeGreaterThan(0.25);
  228 |   expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(false);
  229 |   await page.screenshot({ path: saveEvidence("guest-music-playing-at-gate.png") });
  230 | 
  231 |   await button.click();
  232 |   await expect(button).toHaveAttribute("aria-label", "Play invitation music");
  233 |   expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  234 |   expect(mediaResponses.some((response) => [200, 206].includes(response.status) && response.contentType.startsWith("audio/"))).toBe(true);
  235 | 
  236 |   const gate = page.locator('[data-evergreen-gate="true"]');
  237 |   await gate.locator('[data-evergreen-seal="true"]').click();
  238 |   await expect(gate).toHaveAttribute("data-evergreen-envelope-stage", "complete", { timeout: 6_000 });
  239 |   await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
  240 |   await expect(button).toBeVisible();
  241 |   const scrollRect = await button.evaluate((element) => Math.round(element.getBoundingClientRect().top));
  242 |   expect(scrollRect).toBeGreaterThanOrEqual(0);
  243 |   expect(scrollRect).toBeLessThan(80);
  244 |   await page.screenshot({ path: saveEvidence("guest-music-idle-while-scrolling.png") });
  245 | });
  246 | 
  247 | test("Evergreen preview and guest map buttons open every venue URL on touch-sized viewport", async ({ page }) => {
  248 |   test.skip(!guestPath, "Set EVERGREEN_QA_GUEST_PATH to the published token route for the fresh QA event.");
  249 | 
  250 |   await openGate(page);
  251 |   const previewOpened = await clickEveryMapLink(page);
  252 | 
  253 |   await page.locator('[data-evergreen-section="venues"]').screenshot({ path: saveEvidence("preview-venue-buttons.png") });
  254 | 
  255 |   await page.goto(guestPath!, { waitUntil: "domcontentloaded" });
  256 |   const guestGate = page.locator('[data-evergreen-gate="true"]');
  257 |   await expect(guestGate).toBeVisible();
  258 |   const guestSeal = guestGate.locator('[data-evergreen-seal="true"]');
  259 |   await expect(guestSeal).toBeEnabled({ timeout: 2_000 });
  260 |   const guestClosedCards = await guestGate.locator("[data-evergreen-gate-card]").evaluateAll((cards) => cards.map((card) => ({
  261 |     hidden: card.getAttribute("aria-hidden"), opacity: getComputedStyle(card).opacity,
  262 |   })));
  263 |   expect(guestClosedCards.every((card) => card.hidden === "true" && card.opacity === "0")).toBe(true);
  264 |   await page.screenshot({ path: saveEvidence("guest-gate-closed.png") });
  265 |   const guestMusic = page.locator('[data-evergreen-music] button').first();
  266 |   if (await guestMusic.count()) await page.screenshot({ path: saveEvidence("guest-music-at-gate.png") });
  267 |   await guestSeal.click();
  268 |   await page.waitForTimeout(220);
  269 |   await page.screenshot({ path: saveEvidence("guest-flap-opening.png") });
  270 |   await expect(guestGate).toHaveAttribute("data-evergreen-envelope-stage", "flap-opening");
  271 |   await page.waitForTimeout(690);
  272 |   await expect(guestGate).toHaveAttribute("data-evergreen-envelope-stage", "cards-rising");
  273 |   await page.waitForTimeout(300);
  274 |   await page.screenshot({ path: saveEvidence("guest-cards-rising-cover-crossover.png") });
  275 |   await expect(guestGate).toHaveAttribute("data-evergreen-envelope-stage", "complete", { timeout: 6_000 });
  276 |   await page.screenshot({ path: saveEvidence("guest-finished-cover.png") });
  277 |   await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
```