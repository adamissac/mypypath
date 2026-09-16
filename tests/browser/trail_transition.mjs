/* Real-browser contract for the optional transition between courses.
   Run against npm run serve: node tests/browser/trail_transition.mjs [base] */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:8080';
const browser = await chromium.launch();
try {
  for (const [width, reducedMotion] of [[1440, 'reduce'], [390, 'reduce'], [1440, 'no-preference']]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion });
    const page = await context.newPage();
    await page.goto(base);
    await page.waitForFunction(() => window.PyPathTrail);
    if (reducedMotion === 'no-preference') await page.waitForTimeout(3000);
    const canvasCount = await page.locator('.home-summit__canvas').count();
    await page.evaluate(() => window.PyPathTrail.scrollToProgress(0.7));
    const dialog = page.locator('.trail-transition');
    await dialog.waitFor({ state: 'visible', timeout: 3000 });
    assert.equal(await page.locator('.path-stop-card.is-active').getAttribute('data-stop-index'), '9');
    assert.equal(await page.locator('html').getAttribute('data-course'), null);
    await page.getByRole('button', { name: 'Stay on Foundations' }).click();
    await page.evaluate(() => window.PyPathTrail.scrollToProgress(0.8));
    assert.equal(await dialog.isVisible(), false, 'declining must not repeatedly prompt');
    assert.equal(await page.locator('.path-stop-card.is-active').getAttribute('data-stop-index'), '9');
    // Keyboard focus entering the next course must also ask, never leave
    // focus on an invisible lesson link after a declined scroll transition.
    await page.waitForTimeout(300); // allow native dialog top-layer removal
    await page.locator('[data-stop-card][data-stop-index="10"] a').focus();
    await dialog.waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    assert.equal(await dialog.isVisible(), false);
    await page.locator('[data-trail-jump="2"]').click();
    await page.getByRole('button', { name: 'Yes, explore space' }).click();
    assert.equal(await page.locator('html').getAttribute('data-course'), 'data');
    assert.equal(await page.locator('.path-stop-card.is-active').getAttribute('data-stop-index'), '10');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.home-summit__moon').isVisible(), true);
    assert.equal(await page.locator('.home-summit__art').count(), 0, 'mountain image must leave the DOM');
    assert.equal(await page.locator('.home-summit__canvas').count(), 0, 'mountain canvas must leave the DOM');
    await page.evaluate(() => window.PyPathTrail.scrollToProgress(0.8));
    assert.equal(await dialog.isVisible(), false, 'accepted journey must scroll normally');
    await page.locator('[data-trail-jump="1"]').click();
    assert.equal(await page.locator('html').getAttribute('data-course'), null);
    assert.equal(await page.locator('.home-summit__moon').isVisible(), false);
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.home-summit__mountain').count(), 1);
    assert.equal(await page.locator('.home-summit__canvas').count(), canvasCount);
    console.log(`${width}px (${reducedMotion}): confirm, decline, Escape, retry, exclusive moon/mountain passed`);
    await context.close();
  }
} finally { await browser.close(); }
