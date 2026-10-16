/* /data.html cockpit: lights, launch target, modifier clicks, reduced motion.
   Run against npm run serve: node tests/browser/cockpit.mjs [base] */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:8080';
const browser = await chromium.launch();
const lessonsKey = 'pypath-progress-lessons'; // LESSON_PROGRESS_KEY in storage-keys.js
try {
  const manifest = await (await fetch(`${base}/assets/data/curriculum-data.json`)).json();
  const paths = manifest.lessons.filter((l) => l.unit === 1).map((l) => l.path);
  const lessons = JSON.stringify(Object.fromEntries(paths.map((p) => [p, { passed: true, done: ['x'] }])));
  for (const [name, progress, expectHref] of [
    ['new learner', null, '/data/unit-1.html'],
    ['unit 1 finished', { lessons, tests: JSON.stringify({ 'data-1': { best: 88 } }) }, '/data/unit-2.html'],
    ['corrupt storage', { lessons: '{oops', tests: '[1,2' }, '/data/unit-1.html'],
  ]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(([p, key]) => {
      try {
        localStorage.setItem('pypath.locale', 'en');
        if (p) { localStorage.setItem(key, p.lessons); localStorage.setItem('pypath-unit-tests', p.tests); }
      } catch {}
    }, [progress, lessonsKey]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${base}/data.html`);
    await page.waitForSelector('[data-cockpit-launch]');
    await page.waitForTimeout(600);
    assert.equal(await page.locator('[data-cockpit-launch]').getAttribute('href'), expectHref, name);
    assert.deepEqual(errors.filter((e) => /cockpit/i.test(e)), [], name);
    if (name === 'unit 1 finished') {
      assert.equal(await page.locator('.cockpit__light[data-unit="1"]').getAttribute('data-state'), 'done');
      assert.equal(await page.locator('.cockpit__light[data-unit="2"]').getAttribute('data-state'), 'current');
      // Modifier click: no cutscene, normal browser behaviour.
      const popup = context.waitForEvent('page', { timeout: 3000 }).catch(() => null);
      await page.locator('[data-cockpit-launch]').click({ modifiers: ['Meta'] });
      await popup;
      assert.equal(page.url(), `${base}/data.html`, 'modifier click keeps the original page');

      // Plain click opens the current unit without a countdown or overlay.
      await page.locator('[data-cockpit-launch]').click();
      await page.waitForURL(`**${expectHref}`, { timeout: 4000 });
      assert.equal(await page.locator('.cockpit-cutscene,.course-journey').count(), 0);
    }
    console.log(`${name}: launch -> ${expectHref}`);
    await context.close();
  }
  const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await reduced.addInitScript(() => { try { localStorage.setItem('pypath.locale', 'en'); } catch {} });
  const calm = await reduced.newPage();
  await calm.goto(`${base}/data.html`);
  await calm.waitForSelector('[data-cockpit-launch]');
  await calm.locator('[data-cockpit-launch]').click();
  await calm.waitForURL('**/data/unit-1.html', { timeout: 2000 });
  console.log('reduced motion: launch navigates at once');
  await reduced.close();
} finally { await browser.close(); }
