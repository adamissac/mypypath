/* Real-browser contract for moving between courses on the trail: no dialog,
   the seam hands straight over to Python for Data, and the hero swaps to the
   moon exactly when the data course is the active one.
   Run against npm run serve: node tests/browser/trail_transition.mjs [base] */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:8080';
const browser = await chromium.launch();
try {
  for (const [width, reducedMotion] of [[1440, 'reduce'], [390, 'reduce'], [1440, 'no-preference']]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion });
    await context.addInitScript(() => { try { localStorage.setItem('pypath.locale', 'en'); } catch {} });
    const page = await context.newPage();
    await page.goto(base);
    await page.waitForFunction(() => window.PyPathTrail);
    const to = (i) => page.evaluate((n) => window.PyPathTrail.scrollToProgress(window.PyPathTrail.progressForStop(n)), i);

    // Scroll past Unit 10: nothing opens, Unit 11 lights.
    await to(10);
    await page.waitForTimeout(200);
    assert.equal(await page.locator('dialog[open]').count(), 0, 'no dialog may open on the trail');
    assert.equal(await page.locator('.path-stop-card.is-active').getAttribute('data-stop-index'), '10');
    assert.equal(await page.locator('html').getAttribute('data-course'), 'data');

    // Back to Foundations.
    await to(9);
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.path-stop-card.is-active').getAttribute('data-stop-index'), '9');
    assert.equal(await page.locator('html').getAttribute('data-course'), null);

    // Keyboard focus onto a data card scrolls to it.
    await page.locator('[data-stop-card][data-stop-index="12"] a').focus();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.path-stop-card.is-active').getAttribute('data-stop-index'), '12');

    // Hero swaps exclusively between moon and mountain.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.home-summit__moon').isVisible(), true);
    assert.equal(await page.locator('.home-summit__art').count(), 0, 'mountain image must leave the DOM');
    await page.locator('[data-trail-jump="1"]').click();
    assert.equal(await page.locator('html').getAttribute('data-course'), null);
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.home-summit__mountain').count(), 1);
    console.log(`${width}px (${reducedMotion}): no dialog, seam to 11, focus, moon/mountain passed`);
    await context.close();
  }

  // A returning data learner resumes on Unit 11 without any prompt.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => { try { localStorage.setItem('pypath.locale', 'en'); localStorage.setItem('pypath-course', 'data'); } catch {} });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForFunction(() => window.PyPathTrail);
  await page.evaluate(() => window.PyPathTrail.scrollToProgress(window.PyPathTrail.progressForStop(10)));
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.path-stop-card.is-active').getAttribute('data-stop-index'), '10');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.deepEqual(errors, []);
  console.log('resume on data course passed');
  await context.close();
} finally { await browser.close(); }
