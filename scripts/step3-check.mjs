import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

mkdirSync('C:/tmp/showcase-audit', { recursive: true });

const BASE = 'http://localhost:3001';
const HOME = `${BASE}/dev/showcase-preview?page=home`;
const MENU = `${BASE}/dev/showcase-preview?page=menu`;

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '1280', width: 1280, height: 900 },
];

const browser = await chromium.launch({ headless: true });

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();

  // HOME
  await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('load');
  await page.waitForTimeout(2000);
  await page.waitForFunction(() => document.fonts.ready);
  await page.screenshot({ path: `C:/tmp/showcase-audit/step3-home-${vp.name}.png`, fullPage: true });

  // Collect section order on home
  const homeOrder = await page.evaluate(() => {
    const root = document.querySelector('[data-site-template="showcase"]');
    if (!root) return { error: 'No showcase root' };
    const sections = [...root.querySelectorAll('section, [data-block]')];
    return sections.slice(0, 10).map(s => ({
      tag: s.tagName,
      id: s.id || '',
      dataBlock: s.getAttribute('data-block') || '',
      class: s.className.split(' ').filter(c => c).slice(0, 4).join(' '),
      text: s.textContent?.trim().slice(0, 60) || '',
    }));
  });
  console.log(`\n=== HOME ${vp.name} - section order ===`);
  homeOrder.forEach((s, i) => console.log(`  [${i}] ${s.tag}#${s.id} .${s.class} | "${s.text}"`));

  // Check search bar position relative to promo
  const positions = await page.evaluate(() => {
    const search = document.querySelector('form[action*="menu"], form[action*="shop"], [data-block="promotions"] form');
    // Try direct search input
    const searchInput = document.querySelector('input[type="search"]');
    const promo = document.querySelector('[data-block="promotions"], .promo-carousel, [class*="promo"]');
    const popular = document.querySelector('[data-block="picks"], [class*="picks"]');
    const trust = document.querySelector('[data-block="trust"], [class*="trust"]');

    const rect = (el) => el ? el.getBoundingClientRect() : null;
    return {
      searchInputTop: searchInput ? Math.round(rect(searchInput).top) : null,
      promoTop: promo ? Math.round(rect(promo).top) : null,
      popularTop: popular ? Math.round(rect(popular).top) : null,
      trustTop: trust ? Math.round(rect(trust).top) : null,
    };
  });
  console.log(`  Positions (top of viewport): ${JSON.stringify(positions)}`);

  // Check no category chips on home
  const chips = await page.evaluate(() => {
    const chipNav = document.querySelectorAll('[role="navigation"][aria-label*="categor"], [role="navigation"][aria-label*="Catégori"]');
    return chipNav.length;
  });
  console.log(`  Category chip navs on Home: ${chips} (expected 0)`);

  // MENU
  await page.goto(MENU, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('load');
  await page.waitForTimeout(2000);
  await page.waitForFunction(() => document.fonts.ready);
  await page.screenshot({ path: `C:/tmp/showcase-audit/step3-menu-${vp.name}.png`, fullPage: true });

  // Check catalog title padding
  const catalogTitle = await page.evaluate(() => {
    const h1 = document.querySelector('.showcase-catalog-title');
    if (!h1) return { error: 'no .showcase-catalog-title' };
    const cs = getComputedStyle(h1);
    return {
      paddingTop: cs.paddingTop,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
    };
  });
  console.log(`\n=== MENU ${vp.name} catalog title ===`);
  console.log(`  ${JSON.stringify(catalogTitle)}`);

  await ctx.close();
}

await browser.close();
console.log('\nDone. Screenshots saved to C:/tmp/showcase-audit/step3-*.png');
