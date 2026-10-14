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
      assert.equal(await page.locator('.cockpit-cutscene').count(), 0, 'modifier click must not play the cutscene');

      // Plain click: the cutscene covers the page, counts down, then opens the
      // unit once, about 3.3 s later.
      let navigations = 0;
      page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations += 1; });
      const started = Date.now();
      await page.locator('[data-cockpit-launch]').click();
      await page.locator('.cockpit-cutscene').waitFor({ timeout: 2000 });
      assert.equal(await page.locator('.cockpit-cutscene[role="dialog"]').count(), 1);
      assert.equal(await page.evaluate(() => document.activeElement.matches('[data-cutscene-skip]')), true, 'Skip has focus');
      assert.equal((await page.locator('[data-cutscene-count]').textContent()).trim(), '3');
      await page.waitForFunction(() => document.querySelector('.cockpit-cutscene.is-go'), null, { timeout: 4000 });
      assert.equal((await page.locator('[data-cutscene-count]').textContent()).trim(), 'Go');
      await page.waitForURL(`**${expectHref}`, { timeout: 8000 });
      const took = Date.now() - started;
      assert.ok(took >= 3000 && took <= 6500, `cutscene took ${took} ms`);
      await page.waitForTimeout(1500);
      assert.equal(navigations, 1, 'navigates once');
    }
    console.log(`${name}: launch -> ${expectHref}`);
    await context.close();
  }
  // Skip and Escape leave at once (the cutscene is never in the way).
  for (const how of ['skip button', 'Escape']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('pypath.locale', 'en'); } catch {} });
    const page = await ctx.newPage();
    await page.goto(`${base}/data.html`);
    await page.waitForSelector('[data-cockpit-launch]');
    const t0 = Date.now();
    await page.locator('[data-cockpit-launch]').click();
    await page.locator('.cockpit-cutscene').waitFor({ timeout: 2000 });
    if (how === 'Escape') await page.keyboard.press('Escape');
    else await page.locator('[data-cutscene-skip]').click();
    await page.waitForURL('**/data/unit-1.html', { timeout: 4000 });
    assert.ok(Date.now() - t0 < 2500, `${how}: left in ${Date.now() - t0} ms`);
    console.log(`ok  cutscene skips with the ${how}`);
    await ctx.close();
  }

  // The unit page lands under a flash after a launch, then clears.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => {
      try { localStorage.setItem('pypath.locale', 'en'); } catch {}
      if (location.pathname === '/data/unit-1.html') {
        // Arm the flag once, as the cockpit would, not on the reload too.
        try { if (!sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded', '1'); sessionStorage.setItem('pypath-arrive', '1'); } } catch {}
        document.addEventListener('DOMContentLoaded', () => { window.__arriving = document.documentElement.classList.contains('is-arriving'); });
      }
    });
    const page = await ctx.newPage();
    await page.goto(`${base}/data/unit-1.html`);
    assert.equal(await page.evaluate(() => window.__arriving), true, 'landing plays on arrival');
    await page.waitForFunction(() => !document.documentElement.classList.contains('is-arriving'), null, { timeout: 4000 });
    await page.reload();
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('is-arriving')), false, 'only once');
    console.log('ok  landing plays once after a launch');
    await ctx.close();
  }

  const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await reduced.addInitScript(() => { try { localStorage.setItem('pypath.locale', 'en'); } catch {} });
  const calm = await reduced.newPage();
  await calm.goto(`${base}/data.html`);
  await calm.waitForSelector('[data-cockpit-launch]');
  await calm.locator('[data-cockpit-launch]').click();
  await calm.waitForURL('**/data/unit-1.html', { timeout: 2000 });
  assert.equal(await calm.locator('.cockpit-cutscene').count(), 0, 'no cutscene under reduced motion');
  console.log('reduced motion: launch navigates at once');
  await reduced.close();
} finally { await browser.close(); }
