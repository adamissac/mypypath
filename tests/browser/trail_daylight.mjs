/* The Foundations map looks the same at Unit 10 as at Unit 1, in both themes.
   Run against npm run serve: node tests/browser/trail_daylight.mjs [base] */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:8080';
const browser = await chromium.launch();
try {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
    await context.addInitScript(() => { try { localStorage.setItem('pypath.locale', 'en'); } catch {} });
    const page = await context.newPage();
    await page.goto(base);
    await page.waitForFunction(() => window.PyPathTrail);
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    const look = async (stop) => {
      await page.evaluate((n) => window.PyPathTrail.scrollToProgress(window.PyPathTrail.progressForStop(n)), stop);
      await page.waitForTimeout(700);
      return page.evaluate(() => {
        const svg = document.querySelector('.path-map[data-segment="1"]');
        const cs = getComputedStyle(svg);
        const layers = [...document.querySelectorAll('.path-journey__map > :not(svg.path-map)')]
          .map((el) => Number(getComputedStyle(el).opacity) > 0.01 && getComputedStyle(el).display !== 'none')
          .filter(Boolean).length;
        return {
          base: cs.getPropertyValue('--trail-base').trim(),
          dot: cs.getPropertyValue('--trail-dot').trim(),
          lit: cs.getPropertyValue('--trail-lit').trim(),
          terrain: cs.getPropertyValue('--trail-terrain').trim(),
          overlays: layers,
          night: document.querySelector('.path-journey').classList.contains('is-night-altitude'),
        };
      });
    };
    const first = await look(0);
    const last = await look(9);
    assert.equal(last.night, false, 'no night-altitude class');
    assert.deepEqual(last, first, `Unit 10 must match Unit 1 in ${theme} theme`);
    console.log(`${theme}: Unit 10 palette matches Unit 1`);
    await context.close();
  }
} finally { await browser.close(); }
