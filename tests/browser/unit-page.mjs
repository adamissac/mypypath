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
      // Layout: the page uses its width. Header on the left and sticky on a
      // wide screen, lessons filling the rest; stacked on a phone; the gutters
      // stay modest at every size.
      const box = await page.evaluate(() => {
        const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, w: b.width }; };
        return { hero: r('.unit-hero'), list: r('.unit-trail'), vw: innerWidth };
      });
      assert.ok(box.hero.l <= Math.max(24, box.vw * 0.06), `${path} @${width}: left gutter ${box.hero.l}`);
      assert.ok(box.vw - box.list.r <= Math.max(24, box.vw * 0.06), `${path} @${width}: right gutter ${box.vw - box.list.r}`);
      if (width >= 1024) {
        assert.ok(box.hero.r <= box.list.l, `${path} @${width}: header sits left of the lessons`);
        assert.ok(box.list.w >= box.vw * 0.6, `${path} @${width}: lessons are ${box.list.w} wide`);
        await page.evaluate(() => window.scrollTo(0, 400));
        await page.waitForTimeout(150);
        const top = await page.evaluate(() => document.querySelector('.unit-hero').getBoundingClientRect().top);
        assert.ok(top >= 0 && top < 200, `${path} @${width}: header stays in view (top ${top})`);
      } else {
        assert.ok(box.list.t > box.hero.t, `${path} @${width}: stacked, header above the lessons`);
        assert.ok(box.list.w >= box.vw - 2 * Math.max(24, box.vw * 0.06), `${path} @${width}: lessons use the width`);
      }
      // Hovering a lesson must not move its number: a transform on the card
      // would make the card the badge's positioning anchor and fling the
      // number into the title. Check every lesson at the wide size.
      if (width === 1440) {
        const cards = page.locator('.unit-trail__stop[data-lesson-path]');
        const n = await cards.count();
        for (let i = 0; i < n; i++) {
          const num = cards.nth(i).locator('.unit-trail__num');
          const title = cards.nth(i).locator('.unit-trail__title');
          // In view and un-hovered first, so scrolling cannot look like movement.
          await cards.nth(i).scrollIntoViewIfNeeded();
          await page.mouse.move(5, 5);
          await page.waitForTimeout(200);
          const before = await num.boundingBox();
          await cards.nth(i).locator('a.unit-trail__card').hover();
          await page.waitForTimeout(260);
          const after = await num.boundingBox();
          const t = await title.boundingBox();
          assert.ok(Math.abs(after.x - before.x) <= 1 && Math.abs(after.y - before.y) <= 1,
            `${path}: lesson ${i + 1} number moved on hover (${before.x},${before.y}) -> (${after.x},${after.y})`);
          assert.ok(after.x + after.width <= t.x, `${path}: lesson ${i + 1} number overlaps its title on hover`);
        }
        await page.mouse.move(5, 5);
      }
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    console.log(`ok  ${path}`);
  }
} finally { await browser.close(); }
