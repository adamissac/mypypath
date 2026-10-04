/* Phone-width checks for the sandbox, data-course pages, and a lesson editor. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.MOBILE_ED_PORT || 8094);
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
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  async function check(name, fn) {
    try {
      await fn();
      console.log(`ok   ${name}`);
    } catch (e) {
      fails.push(`${name}: ${e.message}`);
      console.log(`FAIL ${name}: ${e.message}`);
    }
  }

  await check('sandbox editor is on screen', async () => {
    await page.goto(`${BASE}/sandbox.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const editor = page.locator('.sandbox-editor-wrap, .CodeMirror, #code-editor').first();
    if (!(await editor.count())) throw new Error('no editor wrap');
    const run = page.locator('#run-btn');
    if (!(await run.isVisible())) throw new Error('Run button missing');
    const box = await run.boundingBox();
    if (!box || box.height < 40) throw new Error(`Run button ${box && box.height}px`);
    await run.click({ trial: true });
  });

  await check('data unit and lesson stay in viewport', async () => {
    for (const href of ['/data.html', '/data/unit-1.html', '/data/unit-1/reading-a-csv-file.html']) {
      await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(800);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      if (overflow) throw new Error(`${href} overflows`);
    }
  });

  await check('lesson practice editor does not overflow', async () => {
    await page.goto(`${BASE}/units/unit-1/first-program.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    if (overflow) throw new Error('lesson overflows');
    const run = page.locator('.btn-run').first();
    if (await run.isVisible()) {
      const box = await run.boundingBox();
      if (!box || box.height < 40) throw new Error(`run button ${box && box.height}px`);
    }
  });

  await check('curriculum and courses cards are tappable', async () => {
    await page.goto(`${BASE}/curriculum.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const card = page.locator('.unit-card a, .unit-card').first();
    if (!(await card.isVisible())) throw new Error('no unit card');
    await card.click({ trial: true });
    await page.goto(`${BASE}/courses.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const course = page.locator('.journey-card').first();
    if (!(await course.isVisible())) throw new Error('no course card');
    await course.click({ trial: true });
  });

  const pageErrors = errors.filter((m) => !/Firebase|auth\/|firestore/i.test(m));
  if (pageErrors.length) {
    console.log('JS errors:\n  ' + pageErrors.slice(0, 8).join('\n  '));
    fails.push(...pageErrors.slice(0, 3));
  }

  await browser.close();
  server.close();
  if (fails.length) {
    console.log(`\n${fails.length} checks failed`);
    process.exitCode = 1;
  } else {
    console.log('\nall editor/course checks passed at 390x844');
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
