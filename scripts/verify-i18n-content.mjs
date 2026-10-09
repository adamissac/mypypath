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
  const registry = JSON.parse(await readFile(path.join(ROOT, 'assets/i18n/languages.json'), 'utf8'));
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('pypath.locale', 'en'));
  const page = await context.newPage();
  const routes = ['/', '/units/unit-1/what-is-python.html', '/settings.html', '/units/unit-9/recursion-problem-decomposition.html'];
  for (const route of routes) {
    await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.PyPathI18n);
    await page.evaluate(() => window.PyPathI18n.ready);
    const code = await page.locator('pre code').allTextContents();
    const originalTitle = await page.locator('h1').first().textContent();
    for (const locale of registry.locales.filter(item => item.tag !== 'en')) {
      const result = await page.evaluate(tag => window.PyPathI18n.setLocale(tag), locale.tag);
      if (!result) throw new Error(`${route}: ${locale.tag} activation failed`);
      if (await page.getAttribute('html', 'dir') !== locale.direction) throw new Error('Wrong text direction');
      if (JSON.stringify(await page.locator('pre code').allTextContents()) !== JSON.stringify(code)) throw new Error(`${route}: code changed`);
      if (route.includes('what-is-python') && await page.locator('h1').first().textContent() === originalTitle) throw new Error(`${locale.tag}: introductory lesson stayed English`);
      if (!await page.locator('#pypath-translation-notice').isVisible()) throw new Error('Partial translation notice missing');
    }
    await page.evaluate(() => window.PyPathI18n.setLocale('en'));
    if (await page.locator('h1').first().textContent() !== originalTitle) throw new Error('English did not restore');
    console.log(`${route}: all 19 languages activate; code unchanged; English restores`);
  }
  await page.goto(`http://127.0.0.1:${port}/`, {waitUntil:'load'});
  await page.waitForFunction(() => window.PyPathLanguagePicker);
  await page.evaluate(() => window.PyPathLanguagePicker.ready);
  await page.locator('[data-language-open]').click();
  await page.locator('[data-locale="ru"]').click();
  await page.waitForFunction(() => document.documentElement.lang === 'ru');
  if (await page.evaluate(() => localStorage.getItem('pypath.locale')) !== 'ru') throw new Error('Russian not persisted');
  await page.setViewportSize({width:375,height:812});
  await page.locator('[data-language-open]').click();
  const overflow = await page.locator('.language-dialog__panel').evaluate(el => el.scrollWidth > el.clientWidth || el.getBoundingClientRect().right > innerWidth);
  if (overflow) throw new Error('Language picker overflows mobile');
  console.log('Russian picker selection, persistence, and mobile layout passed');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
