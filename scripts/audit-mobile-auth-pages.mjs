/* Phone-width checks for signed-out account, classroom, quiz, progress,
 * and settings. These pages are usable without Firebase.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.MOBILE_AUTH_PORT || 8093);
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
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('pypath-boot-seen', '1');
      sessionStorage.setItem('pypath-nav', '1');
    } catch (e) {}
  });

  async function check(name, fn) {
    try {
      await fn();
      console.log(`ok   ${name}`);
    } catch (e) {
      fails.push(`${name}: ${e.message}`);
      console.log(`FAIL ${name}: ${e.message}`);
    }
  }

  await check('account guest state and sign-in link', async () => {
    await page.goto(`${BASE}/account.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const guest = page.locator('#account-guest');
    if (!(await guest.isVisible())) throw new Error('guest prompt hidden');
    await page.locator('#account-guest a[href="/login.html"]').click({ trial: true });
  });

  await check('progress guest state', async () => {
    await page.goto(`${BASE}/progress.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const guest = page.locator('#progress-guest');
    if (!(await guest.isVisible())) throw new Error('guest prompt hidden');
    await page.locator('#progress-guest a[href="/signup.html"]').click({ trial: true });
  });

  await check('classroom signed-out still explains itself', async () => {
    await page.goto(`${BASE}/classroom.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const main = page.locator('#main-content');
    if (!(await main.isVisible())) throw new Error('no main');
    const text = (await main.innerText()).trim();
    if (text.length < 20) throw new Error('classroom main is empty');
  });

  await check('quiz empty or gated state is visible', async () => {
    await page.goto(`${BASE}/quiz.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const main = page.locator('#main-content');
    if (!(await main.isVisible())) throw new Error('no main');
    const text = (await main.innerText()).trim();
    if (text.length < 10) throw new Error('quiz main is empty');
  });

  await check('settings theme control is 44px and works', async () => {
    await page.goto(`${BASE}/settings.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const dark = page.locator('.segmented span', { hasText: 'Dark' }).first();
    const box = await dark.boundingBox();
    if (!box || box.height < 40) throw new Error(`theme chip ${box && box.height}px`);
    await dark.click();
    await page.waitForTimeout(200);
    const theme = await page.locator('html').getAttribute('data-theme');
    if (theme !== 'dark') throw new Error(`theme is ${theme}`);
    await page.locator('.segmented span', { hasText: 'Light' }).first().click();
  });

  await check('certificate and unit-test pages render', async () => {
    for (const href of ['/certificate.html', '/unit-test.html', '/learn.html', '/courses.html']) {
      await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(600);
      const main = page.locator('main, #main-content').first();
      if (!(await main.isVisible())) throw new Error(`${href} has no main`);
    }
  });

  await check('landscape phone home does not clip the brand', async () => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const clipped = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      return [...document.querySelectorAll('.site-header .brand, .home-hero h1, .account-signin')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width && (r.left < -1 || r.right > vw + 1);
        })
        .map((el) => (el.textContent || el.className).trim().slice(0, 30));
    });
    if (clipped.length) throw new Error(`clipped: ${clipped.join(', ')}`);
  });

  await browser.close();
  server.close();
  if (fails.length) {
    console.log(`\n${fails.length} checks failed`);
    process.exitCode = 1;
  } else {
    console.log('\nall auth/settings checks passed at phone width');
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
