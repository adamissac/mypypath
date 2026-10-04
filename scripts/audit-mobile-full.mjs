/* Fast full-site phone audit: every public HTML page at 320 and 390.
 * Complements scripts/verify-mobile.mjs, which covers representative
 * shapes at seven sizes. This one is for finding stragglers.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.MOBILE_FULL_PORT || 8091);
const BASE = `http://127.0.0.1:${PORT}`;

const SKIP = new Set([
  'lesson-format-kit',
  '.claude',
  'node_modules',
  'desktop-dist',
  'engine',
  'src-tauri',
]);

async function htmlPages(dir = ROOT, acc = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['units', 'data'].includes(entry.name) || dir !== ROOT) {
        await htmlPages(full, acc);
      }
      continue;
    }
    if (entry.name.endsWith('.html')) {
      acc.push('/' + path.relative(ROOT, full).split(path.sep).join('/'));
    }
  }
  return acc;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
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

const PROBE = `(() => {
  const vw = document.documentElement.clientWidth;
  const out = { vw, overflow: [], small: [], tiny: [], zoomInputs: [], viewport: '' };
  const meta = document.querySelector('meta[name="viewport"]');
  out.viewport = meta ? meta.getAttribute('content') || '' : 'MISSING';
  if (document.documentElement.scrollWidth > vw + 1) {
    const wide = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > vw + 1 || r.left < -1) {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed') continue;
        wide.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className || '').split(' ')[0] || '',
          w: Math.round(r.width),
          right: Math.round(r.right),
        });
      }
    }
    wide.sort((a, b) => b.right - a.right);
    out.overflow = wide.slice(0, 3);
    out.scrollWidth = document.documentElement.scrollWidth;
  }
  const SEL = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link]';
  for (const el of document.querySelectorAll(SEL)) {
    if (el.disabled) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.width < 24 || r.height < 24) {
      const p = el.parentElement;
      const inline = el.tagName === 'A' && p && (p.textContent || '').trim().length > (el.textContent || '').trim().length + 12;
      if (!inline) {
        out.small.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className || '').split(' ')[0] || '',
          w: Math.round(r.width * 10) / 10,
          h: Math.round(r.height * 10) / 10,
          text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 28),
        });
      }
    }
    if ((el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') && parseFloat(cs.fontSize) < 16) {
      out.zoomInputs.push({
        name: el.name || el.id || el.type || el.tagName,
        size: parseFloat(cs.fontSize),
      });
    }
  }
  out.small = out.small.slice(0, 6);
  return out;
})()`;

async function run() {
  const pages = (await htmlPages()).sort();
  const server = await serve();
  const browser = await chromium.launch();
  const viewports = [
    { name: '320', width: 320, height: 568 },
    { name: '390', width: 390, height: 844 },
  ];
  const report = [];
  for (const vp of viewports) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    for (const href of pages) {
      try {
        await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(400);
        const r = await page.evaluate(PROBE);
        report.push({ viewport: vp.name, page: href, ...r });
      } catch (e) {
        report.push({ viewport: vp.name, page: href, error: String(e).slice(0, 160) });
      }
    }
    await ctx.close();
  }
  await browser.close();
  server.close();

  let bad = 0;
  for (const r of report) {
    const issues = (r.overflow?.length ? 1 : 0) + (r.small?.length || 0) + (r.zoomInputs?.length || 0) + (r.viewport === 'MISSING' ? 1 : 0);
    if (!issues && !r.error) continue;
    bad += 1;
    console.log(`\n${r.viewport}  ${r.page}`);
    if (r.error) console.log(`    ERROR ${r.error}`);
    if (r.viewport === 'MISSING') console.log('    VIEWPORT missing');
    if (r.overflow?.length) {
      console.log(`    OVERFLOW page is ${r.scrollWidth}px in a ${r.vw}px viewport`);
      for (const o of r.overflow) console.log(`      ${o.tag}.${o.cls || '(none)'} ${o.w}px right ${o.right}`);
    }
    for (const s of r.small || []) {
      console.log(`    TARGET ${s.tag}.${s.cls || '(none)'} ${s.w}x${s.h} "${s.text}"`);
    }
    for (const z of r.zoomInputs || []) {
      console.log(`    ZOOM INPUT ${z.name} ${z.size}px`);
    }
  }
  console.log(`\n${bad} of ${report.length} page/viewport combinations have something to inspect`);
  console.log(`scanned ${pages.length} pages`);
  if (bad) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
