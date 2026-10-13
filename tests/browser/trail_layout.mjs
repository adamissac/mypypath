/* Run against npm run serve: node tests/browser/trail_layout.mjs [base].
   ENGINE=webkit exercises the same contract in Safari's browser engine. */
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
const base = process.argv[2] || 'http://localhost:8080';
const browser = await (process.env.ENGINE === 'webkit' ? webkit : chromium).launch();
try {
  for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1440, 900], [812, 375]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      localStorage.setItem('pypath.locale', 'en');
      sessionStorage.setItem('pypath-boot-seen', '1');
    });
    const page = await context.newPage();
    await page.goto(base);
    await page.waitForFunction(() => window.PyPathTrail);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.PyPathTrail.scrollToProgress(0.6));
    await page.getByRole('button', { name: 'Yes, explore space' }).click();
    for (let index = 0; index < 20; index++) {
      await page.evaluate((i) => window.PyPathTrail.scrollToProgress(window.PyPathTrail.progressForStop(i)), index);
      // Allow the map ResizeObserver to update its cached camera geometry.
      await page.waitForTimeout(100);
      const result = await page.evaluate(() => {
        const card = document.querySelector('.path-stop-card.is-active');
        const c = card.getBoundingClientRect();
        const m = document.querySelector('.path-journey__map').getBoundingClientRect();
        const header = document.querySelector('.site-header').getBoundingClientRect();
        return {
          index: Number(card.dataset.stopIndex),
          clipped: c.bottom > innerHeight + 1 || c.top < header.bottom - 1,
          overlap: m.left < c.right && m.right > c.left && m.top < c.bottom && m.bottom > c.top,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      assert.deepEqual(result, { index, clipped: false, overlap: false, overflow: false }, `${width}x${height}, stop ${index + 1}`);
    }
    console.log(`${width}x${height}: all 20 unit cards visible, no map overlap or page overflow`);
    await context.close();
  }
} finally {
  await browser.close();
}
