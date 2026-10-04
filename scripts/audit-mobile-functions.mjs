/* Phone-width smoke of the public flows that a visitor can actually use
 * without signing in. Complements verify-mobile.mjs (layout) with clicks
 * and form-field checks.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.MOBILE_FN_PORT || 8092);
const BASE = `http://127.0.0.1:${PORT}`;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

function serve() {
  const server = createServer(async (req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try {
      if ((await stat(file)).isDirectory()) throw new Error('dir');
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(await readFile(file));
    } catch { res.writeHead(404).end('not found'); }
  });
  return new Promise((r) => server.listen(PORT, '127.0.0.1', () => r(server)));
}

async function run() {
  const server = await serve();
  const browser = await chromium.launch();
  const fails = [];
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();

  async function check(name, fn) {
    try {
      await fn();
      console.log(`ok   ${name}`);
    } catch (e) {
      fails.push(`${name}: ${e.message}`);
      console.log(`FAIL ${name}: ${e.message}`);
    }
  }

  await check('home loads and menu opens', async () => {
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem('pypath-boot-seen', '1');
        sessionStorage.setItem('pypath-nav', '1');
      } catch (e) {}
    });
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(800);
    const toggle = page.locator('.mobile-toggle');
    if (!(await toggle.isVisible())) throw new Error('hamburger missing');
    await toggle.click();
    const menu = page.locator('#primary-menu');
    await menu.waitFor({ state: 'visible', timeout: 3000 });
    const short = await menu.locator(':scope > li > a').evaluateAll((links) =>
      links.filter((el) => {
        if (el.closest('[hidden]')) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.height < 44;
      }).map((el) => (el.textContent || '').trim())
    );
    if (short.length) throw new Error(`menu links under 44px: ${short.join(', ')}`);
    await page.locator('#primary-menu >> text=Sandbox').click({ trial: true });
    await page.locator('#nav-courses-btn').click();
    await page.waitForTimeout(200);
    const course = page.locator('#nav-courses-panel a').first();
    if (!(await course.isVisible())) throw new Error('Courses panel did not open');
    await course.click({ trial: true });
    await toggle.click();
  });

  await check('footer Learn links are 44px', async () => {
    const short = await page.locator('.footer-links a').evaluateAll((links) =>
      links.filter((el) => el.getBoundingClientRect().height < 44)
        .map((el) => (el.textContent || '').trim())
    );
    if (short.length) throw new Error(short.join(', '));
  });

  await check('signup fields, role cards, consent', async () => {
    await page.goto(`${BASE}/signup.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    for (const id of ['signup-first-name', 'signup-last-name', 'signup-alias', 'signup-email', 'signup-password']) {
      const box = await page.locator(`#${id}`).boundingBox();
      if (!box || box.height < 40) throw new Error(`${id} is ${box && box.height}px tall`);
    }
    const pw = await page.locator('#signup-password').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    if (pw < 16) throw new Error(`password font ${pw}px`);
    const role = page.locator('.role-option').first();
    const roleBox = await role.boundingBox();
    if (!roleBox || roleBox.height < 40) throw new Error(`role option ${roleBox && roleBox.height}px`);
    const border = await role.evaluate((el) => getComputedStyle(el).borderStyle);
    if (border === 'none') throw new Error('role option has no card border');
    const box = await page.locator('#signup-terms').boundingBox();
    if (!box || box.width < 20 || box.height < 20) throw new Error(`consent checkbox ${JSON.stringify(box)}`);
    await page.locator('#signup-form button[type=submit]').click();
    const err = page.locator('#signup-error');
    await page.waitForTimeout(200);
    if (!(await err.isVisible())) throw new Error('empty submit did not show an error');
  });

  await check('login fields accept input', async () => {
    await page.goto(`${BASE}/login.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await page.fill('#login-email', 'not-an-email');
    await page.fill('#login-password', 'short');
    await page.locator('#login-form button[type=submit]').click();
    await page.waitForTimeout(300);
    const err = page.locator('#login-error, .auth-error');
    if (!(await err.first().isVisible())) throw new Error('bad login did not show an error');
  });

  await check('unit landing lesson links are 44px', async () => {
    await page.goto(`${BASE}/units/unit-1.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const short = await page.locator('.unit-lesson-list a').evaluateAll((links) =>
      links.filter((el) => el.getBoundingClientRect().height < 44)
        .map((el) => (el.textContent || '').trim().slice(0, 40))
    );
    if (short.length) throw new Error(short.slice(0, 4).join(', '));
    await page.locator('.unit-lesson-list a').first().click({ trial: true });
  });

  await check('lesson quiz radios are 24px and drawer opens', async () => {
    await page.goto(`${BASE}/units/unit-1/what-is-python.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const radios = page.locator('.quiz-choice input[type=radio], .quiz-choice input[type=checkbox]');
    if (await radios.count()) {
      const small = await radios.evaluateAll((els) =>
        els.filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.width < 24 || r.height < 24);
        }).length
      );
      if (small) throw new Error(`${small} quiz inputs under 24px`);
      await radios.first().click({ trial: true });
    }
    const toggle = page.locator('[data-lesson-navigation] button, .sidebar-toggle-btn').first();
    if (await toggle.isVisible()) {
      await toggle.click();
      await page.waitForTimeout(300);
      const side = page.locator('.course-sidebar');
      if (!(await side.isVisible())) throw new Error('lesson drawer did not open');
    }
  });

  await check('320px header stays on one row', async () => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const clipped = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const els = [...document.querySelectorAll('.site-header .brand, .mobile-toggle, .account-signin')];
      return els.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width && (r.left < -1 || r.right > vw + 1);
      }).map((el) => el.className);
    });
    if (clipped.length) throw new Error(`clipped: ${clipped.join(', ')}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    if (overflow) throw new Error(`page scrollWidth ${await page.evaluate(() => document.documentElement.scrollWidth)}`);
    await page.setViewportSize({ width: 390, height: 844 });
  });

  await check('download, sandbox, 404, settings render', async () => {
    for (const href of ['/download.html', '/sandbox.html', '/404.html', '/settings.html', '/privacy.html', '/terms.html']) {
      const res = await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
      if (!res || res.status() >= 500) throw new Error(`${href} status ${res && res.status()}`);
      const main = page.locator('main, #main-content').first();
      if (!(await main.isVisible())) throw new Error(`${href} has no main`);
    }
  });

  await browser.close();
  server.close();
  if (fails.length) {
    console.log(`\n${fails.length} checks failed`);
    process.exitCode = 1;
  } else {
    console.log('\nall function checks passed at 390x844');
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
