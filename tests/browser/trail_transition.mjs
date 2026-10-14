/* Real-browser contract for moving between courses on the trail: at the end
   of Foundations the trail asks once whether to continue to Python for Data.
   Declining keeps the learner on Foundations without asking again; accepting
   goes straight to Unit 11 (no launch); a returning data learner is never
   asked. Run against npm run serve: node tests/browser/trail_transition.mjs [base] */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:8080';
const browser = await chromium.launch();
const english = () => { try { localStorage.setItem('pypath.locale', 'en'); } catch {} };
try {
  for (const [width, reducedMotion] of [[1440, 'reduce'], [390, 'reduce'], [1440, 'no-preference']]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion });
    await context.addInitScript(english);
    const page = await context.newPage();
    await page.goto(base);
    await page.waitForFunction(() => window.PyPathTrail);
    const dialog = page.locator('.trail-transition');

    // Past Unit 10 the question opens, and the trail holds at Unit 10.
    await page.evaluate(() => window.PyPathTrail.scrollToProgress(0.7));
    await dialog.waitFor({ state: 'visible', timeout: 3000 });
    assert.equal(await page.locator('.path-stop-card.is-active').getAttribute('data-stop-index'), '9');
    assert.equal(await page.locator('html').getAttribute('data-course'), null);

    // Declining: stays on Foundations and is not asked again on that scroll.
    await page.getByRole('button', { name: 'Stay on Foundations' }).click();
    await page.evaluate(() => window.PyPathTrail.scrollToProgress(0.8));
    assert.equal(await dialog.isVisible(), false, 'declining must not repeatedly prompt');
    assert.equal(await page.locator('.path-stop-card.is-active').getAttribute('data-stop-index'), '9');

    // Keyboard focus onto a data card asks too; Escape declines.
    await page.waitForTimeout(300);
    await page.locator('[data-stop-card][data-stop-index="10"] a').focus();
    await dialog.waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    assert.equal(await dialog.isVisible(), false);

    // Accepting: straight to Unit 11, no launch, and the hero shows the moon.
    await page.locator('[data-trail-jump="2"]').click();
    await page.getByRole('button', { name: 'Continue to Python for Data' }).click();
    await page.waitForTimeout(250);
    assert.equal(await page.locator('dialog[open]').count(), 0);
    assert.equal(await page.locator('html').getAttribute('data-course'), 'data');
    assert.equal(await page.locator('.path-stop-card.is-active').getAttribute('data-stop-index'), '10');
    await page.evaluate(() => window.PyPathTrail.scrollToProgress(0.8));
    assert.equal(await dialog.isVisible(), false, 'an accepted journey scrolls normally');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.home-summit__moon').isVisible(), true);
    assert.equal(await page.locator('.home-summit__art').count(), 0, 'mountain image must leave the DOM');
    await page.locator('[data-trail-jump="1"]').click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.home-summit__mountain').count(), 1);
    console.log(`${width}px (${reducedMotion}): ask, decline, Escape, accept, moon/mountain passed`);
    await context.close();
  }

  // A returning data learner resumes on Unit 11 without being asked.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => { try { localStorage.setItem('pypath.locale', 'en'); localStorage.setItem('pypath-course', 'data'); } catch {} });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForFunction(() => window.PyPathTrail);
  await page.evaluate(() => window.PyPathTrail.scrollToProgress(window.PyPathTrail.progressForStop(10)));
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.path-stop-card.is-active').getAttribute('data-stop-index'), '10');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.deepEqual(errors, []);
  console.log('resume on data course passed');
  await context.close();
} finally { await browser.close(); }
