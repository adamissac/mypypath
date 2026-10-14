/* Unit overview pages: the trail shows the learner's own progress, Continue
   points at the right place, and nothing scrolls sideways on a phone.
   Run against npm run serve: node tests/browser/unit-page.mjs [base] */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8080';
const browser = await chromium.launch();
const seed = ([lessons, tests]) => {
  try {
    localStorage.setItem('pypath.locale', 'en');
    localStorage.setItem('pypath-progress-lessons', JSON.stringify(lessons));
    localStorage.setItem('pypath-unit-tests', JSON.stringify(tests));
  } catch {}
};
try {
  const cases = [
    ['/units/unit-1.html', { '/units/unit-1/what-is-python.html': { done: ['a'], passed: true } }, {}, 1, 'Continue: Lesson 2, Installing Python & IDE'],
    ['/data/unit-1.html', { '/data/unit-1/what-is-data-analysis.html': { done: ['a'], passed: true }, '/data/unit-1/rows-and-columns-with-lists.html': { done: ['a'], passed: true } }, { 'data-1': { best: 40 } }, 2, 'Continue: Lesson 3, Records as Dictionaries'],
  ];
  for (const [path, lessons, tests, upNext, label] of cases) {
    for (const width of [1440, 390, 320]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      await ctx.addInitScript(seed, [lessons, tests]);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(base + path);
      await page.waitForSelector('.unit-trail__stop.is-up-next');
      const stops = page.locator('.unit-trail__stop[data-lesson-path]');
      assert.equal(await stops.nth(upNext).getAttribute('class').then((c) => c.includes('is-up-next')), true, `${path}: up next`);
      assert.equal((await page.locator('[data-unit-continue]').textContent()).trim(), label, `${path}: continue`);
      assert.equal(await page.locator('[data-unit-progress]').isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${path} @${width}: no sideways scroll`);
      assert.equal(await page.locator('body').textContent().then((t) => /\b(\d+)\. \1\./.test(t)), false, 'no doubled numbers');
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    console.log(`ok  ${path}`);
  }
} finally { await browser.close(); }
