import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 }
  });

  await page.goto('http://localhost:3000/organizers/49c94086-8c82-4cfd-8edd-1ca2564a266d', {
    waitUntil: 'networkidle'
  });

  await page.screenshot({
    path: 'fullpage.png',
    fullPage: true
  });

  await browser.close();

  console.log('Screenshot saved as fullpage.png');
})();
