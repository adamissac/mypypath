import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.resolve(ROOT, pathname === '/' ? 'index.html' : `.${pathname}`);
  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT, 'index.html')) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(file)).isDirectory()) throw new Error('directory');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const localizationErrors = [];
  page.on('pageerror', (error) => { if (/i18n|language/i.test(error.message)) localizationErrors.push(error.message); });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#language-dialog:not([hidden])').waitFor({ timeout: 10000 });
  if (!(await page.locator('#language-search').evaluate((node) => node === document.activeElement))) throw new Error('first-visit dialog did not focus search');
  if (await page.locator('[data-locale="ru"]').isDisabled()) throw new Error('Russian partial translation was disabled');
  await page.locator('#language-search').fill('India');
  for (const tag of ['hi', 'bn', 'ur']) {
    if (!(await page.locator(`[data-language-option][data-locale="${tag}"]`).count())) throw new Error(`country alias India did not show ${tag}`);
  }
  await page.locator('[data-language-continue]').click();
  await page.locator('#language-dialog[hidden]').waitFor({ state: 'hidden' });
  if (await page.evaluate(() => localStorage.getItem('pypath.locale')) !== 'en') throw new Error('English choice was not persisted');
  await page.locator('[data-language-open]').click();
  await page.locator('#language-search').fill('Vietnam');
  if (!(await page.locator('[data-language-option][data-locale="vi"]').count())) throw new Error('Vietnam country alias did not show Vietnamese');
  await page.locator('[data-language-close]').click();
  await page.locator('#language-dialog[hidden]').waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('[data-language-open]').click();
  const overflows = await page.locator('.language-dialog__panel').evaluate((el) => el.getBoundingClientRect().right > window.innerWidth || el.getBoundingClientRect().left < 0);
  if (overflows) throw new Error('language dialog overflows narrow viewport');
  await page.locator('[data-language-close]').click();
  await page.setViewportSize({ width: 320, height: 568 });
  const signInRight = await page.locator('[data-account-signin]').evaluate((el) => el.getBoundingClientRect().right);
  if (signInRight > 320) throw new Error(`sign-in control clips at 320px (${signInRight}px)`);
  if (localizationErrors.length) throw new Error(localizationErrors.join('\n'));
  console.log('i18n browser flow passed: first visit, country search, partial locale availability, saved English, reopen, and mobile dialog');
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
