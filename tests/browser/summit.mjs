/* Real-browser contract for the hero diorama (assets/js/summit-3d.js +
   assets/js/summit-scene.js). Run against npm run serve:
     node tests/browser/summit.mjs [base] */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8080';
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const english = () => { try { localStorage.setItem('pypath.locale', 'en'); } catch {} };
const pendingAtDCL = () => {
  document.addEventListener('DOMContentLoaded', () => {
    window.__pendingAtDCL = document.documentElement.classList.contains('summit-pending');
  });
};
const artOpacity = (page) => page.evaluate(() => Number(getComputedStyle(document.querySelector('.home-summit__art')).opacity));
const mountain = (page) => page.locator('.home-summit__mountain');
const ok = (name) => console.log(`ok  ${name}`);

try {
  // (a) a fresh session: cloud bank, then the full entrance, then rest.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(english);
  await ctx.addInitScript(pendingAtDCL);
  let glbRequests = 0;
  ctx.on('request', (r) => { if (r.url().includes('/assets/models/summit.glb')) glbRequests += 1; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + '/');
  assert.equal(await page.evaluate(() => window.__pendingAtDCL), true, 'pending at first paint');
  await page.locator('.home-summit__canvas.is-in').waitFor({ timeout: 15000 });
  assert.equal(await mountain(page).getAttribute('data-entrance'), 'full');
  await page.waitForFunction(() => document.querySelector('.home-summit__mountain').dataset.entranceDone === '1', null, { timeout: 8000 });
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('summit-pending')), false);
  ok('fresh session: pending, full entrance, rest');

  // (e) hover a stop: its label; (f) the flag: fireworks.
  await page.waitForTimeout(300);
  const p3 = await page.evaluate(() => window.PyPathSummit.api.stopPoint(2));
  await page.mouse.move(p3.x - 4, p3.y - 4);
  await page.mouse.move(p3.x, p3.y);
  await page.locator('.home-summit__label:not([hidden])').waitFor({ timeout: 3000 });
  const title3 = (await page.locator('[data-stop-card][data-stop-index="2"] h3').textContent()).trim();
  assert.ok((await page.locator('.home-summit__label').textContent()).startsWith(`Unit 3 · ${title3}`));
  ok('hover shows the stop label');
  const flag = await page.evaluate(() => window.PyPathSummit.api.flagPoint());
  await page.mouse.click(flag.x, flag.y);
  await page.waitForFunction(() => !!document.querySelector('.home-summit__mountain').dataset.fireworks, null, { timeout: 3000 });
  ok('flag click sets off fireworks');

  // (g) theme toggle: night without reloading the model.
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.waitForFunction(() => document.querySelector('.home-summit__mountain').dataset.sceneTheme === 'dark');
  assert.equal(glbRequests, 1, 'the model is fetched once');
  ok('theme switch changes the scene, not the model');

  // (e, continued) clicking a stop opens its unit.
  const p5 = await page.evaluate(() => window.PyPathSummit.api.stopPoint(4));
  await page.mouse.move(p5.x, p5.y);
  await page.locator('.home-summit__label:not([hidden])').waitFor({ timeout: 3000 });
  await Promise.all([page.waitForURL('**/units/unit-5.html'), page.mouse.click(p5.x, p5.y)]);
  ok('clicking a stop opens its unit');

  // (b) same session again: no entrance.
  await page.goto(base + '/');
  await page.locator('.home-summit__canvas.is-in').waitFor({ timeout: 15000 });
  assert.equal(await mountain(page).getAttribute('data-entrance'), 'none');
  ok('second visit in a session skips the entrance');

  // (h) switching to Python for Data stops the scene and shows the moon.
  await page.evaluate(() => { document.documentElement.dataset.course = 'data'; });
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.home-summit__moon').isVisible(), true);
  assert.equal(await page.evaluate(() => window.PyPathSummit.api.running), false);
  await page.evaluate(() => { delete document.documentElement.dataset.course; });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.PyPathSummit.api.running), true);
  ok('course switch pauses and resumes the scene');

  // (i) a lost WebGL context hands back to the still.
  await page.evaluate(() => {
    const c = document.querySelector('.home-summit__canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    gl.getExtension('WEBGL_lose_context').loseContext();
  });
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('.home-summit__canvas').count(), 0);
  assert.equal(await artOpacity(page), 1);
  ok('context loss falls back to the still');
  assert.deepEqual(errors, []);
  await ctx.close();

  // (c) a slow model: the still at 2.5 s, then a late takeover.
  const slow = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await slow.addInitScript(english);
  await slow.route('**/assets/models/summit.glb*', async (route) => {
    await new Promise((r) => setTimeout(r, 4500));
    await route.continue();
  });
  const sp = await slow.newPage();
  await sp.goto(base + '/');
  await sp.waitForTimeout(3300);
  assert.equal(await sp.locator('.home-summit__canvas').count(), 0);
  assert.equal(await artOpacity(sp), 1, 'still visible while the model is slow');
  await sp.locator('.home-summit__canvas.is-in').waitFor({ timeout: 15000 });
  assert.equal(await mountain(sp).getAttribute('data-entrance'), 'late');
  ok('slow model: still first, then a late takeover');
  await slow.close();

  // (j) the bootstrap never runs (blocked, failed to load): the head gate
  // must not leave the hero blank.
  const blocked = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await blocked.addInitScript(english);
  await blocked.route('**/assets/js/summit-3d.js*', (route) => route.abort());
  const bp = await blocked.newPage();
  await bp.goto(base + '/');
  await bp.waitForTimeout(4600);
  assert.equal(await bp.evaluate(() => document.documentElement.classList.contains('summit-pending')), false);
  assert.equal(await artOpacity(bp), 1, 'still visible when the bootstrap never runs');
  ok('blocked bootstrap: the still appears anyway');
  await blocked.close();

  // (d) reduced motion: the still only.
  const calm = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await calm.addInitScript(english);
  await calm.addInitScript(pendingAtDCL);
  const cp = await calm.newPage();
  await cp.goto(base + '/');
  await cp.waitForTimeout(3000);
  assert.equal(await cp.evaluate(() => window.__pendingAtDCL), false);
  assert.equal(await cp.locator('.home-summit__canvas').count(), 0);
  assert.equal(await artOpacity(cp), 1);
  ok('reduced motion: still only');
  await calm.close();
} finally {
  await browser.close();
}
