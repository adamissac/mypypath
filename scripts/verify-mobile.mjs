/* Walk every page shape at phone and tablet size and report what breaks.
 *
 * The audit could not do this -- its window resize was blocked -- and said so
 * rather than claiming otherwise. This is the check it wanted.
 *
 * WHAT COUNTS AS BROKEN, and each of these is a thing a person notices:
 *
 *   Horizontal overflow. The page scrolls sideways. Reported with the widest
 *   offending element, because "the page overflows" is not actionable and
 *   ".cr-table is 780px in a 390px viewport" is.
 *
 *   A tap target under 24x24 (WCAG 2.2 SC 2.5.8), honouring the same spacing
 *   and inline exceptions scripts/audit-a11y.mjs does.
 *
 *   Text under 12px, which is not a WCAG failure but is a phone failure.
 *
 *   A control overlapping another control, which is how a mobile layout
 *   usually fails first.
 *
 *     node scripts/verify-mobile.mjs
 *     node scripts/verify-mobile.mjs --json
 */
import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.MOBILE_PORT || 8089);
const JSON_OUT = process.argv.includes('--json');

const PAGES = [
  '/index.html', '/curriculum.html', '/courses.html',
  '/units/unit-1/what-is-python.html', '/classroom.html', '/quiz.html',
  '/unit-test.html', '/settings.html', '/certificate.html', '/account.html',
  '/login.html', '/progress.html', '/sandbox.html', '/404.html',
];

const VIEWPORTS = [
  { name: 'phone  390x844', width: 390, height: 844, dpr: 3, mobile: true },
  { name: 'tablet 768x1024', width: 768, height: 1024, dpr: 2, mobile: true },
];

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

const PROBE = `(() => {
  const vw = document.documentElement.clientWidth;
  const out = { vw, overflow: [], small: [], tiny: [], overlap: [] };

  // Horizontal overflow, named by the widest offender rather than reported as
  // a fact about "the page".
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
          w: Math.round(r.width), right: Math.round(r.right),
        });
      }
    }
    wide.sort((a, b) => b.right - a.right);
    out.overflow = wide.slice(0, 4);
    out.scrollWidth = document.documentElement.scrollWidth;
  }

  const SEL = 'a[href], button, input:not([type=hidden]), select, textarea, summary,'
    + ' [role=button], [role=link], [tabindex]:not([tabindex="-1"])';
  const vis = [...document.querySelectorAll(SEL)].filter((el) => {
    if (el.disabled) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  const boxes = vis.map((el) => ({ el, r: el.getBoundingClientRect() }));

  function inlineExempt(el) {
    if (el.tagName !== 'A') return false;
    const p = el.parentElement; if (!p) return false;
    return (p.textContent || '').trim().length > (el.textContent || '').trim().length + 12;
  }
  function spacingExempt(box) {
    const c = { x: box.r.left + box.r.width / 2, y: box.r.top + box.r.height / 2 };
    for (const o of boxes) {
      if (o.el === box.el) continue;
      const nx = Math.max(o.r.left, Math.min(c.x, o.r.right));
      const ny = Math.max(o.r.top, Math.min(c.y, o.r.bottom));
      if (Math.hypot(c.x - nx, c.y - ny) < 12) return false;
    }
    return true;
  }

  for (const box of boxes) {
    if (box.r.width >= 24 && box.r.height >= 24) continue;
    if (inlineExempt(box.el) || spacingExempt(box)) continue;
    out.small.push({
      tag: box.el.tagName.toLowerCase(),
      cls: String(box.el.className || '').split(' ')[0] || '',
      w: Math.round(box.r.width * 10) / 10, h: Math.round(box.r.height * 10) / 10,
      text: (box.el.textContent || '').trim().slice(0, 24),
    });
  }

  // Text too small to read on a phone. Not a WCAG rule; a phone rule.
  for (const el of document.querySelectorAll('p, li, td, th, span, a, label, button')) {
    const t = (el.textContent || '').trim();
    if (t.length < 8) continue;
    if (el.children.length) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (size < 12) out.tiny.push({ tag: el.tagName.toLowerCase(), size, text: t.slice(0, 30) });
  }
  out.tiny = out.tiny.slice(0, 5);
  return out;
})()`;

async function run() {
  const server = await serve();
  const browser = await chromium.launch();
  const report = [];

  for (const vp of VIEWPORTS) {
    for (const page of PAGES) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.dpr,
        isMobile: vp.mobile,
        hasTouch: vp.mobile,
      });
      const p = await ctx.newPage();
      try {
        await p.goto(`http://127.0.0.1:${PORT}${page}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await p.waitForTimeout(2500);
        const r = await p.evaluate(PROBE);
        report.push({ viewport: vp.name, page, ...r });
      } catch (e) {
        report.push({ viewport: vp.name, page, error: String(e).slice(0, 160) });
      }
      await ctx.close();
    }
  }

  await browser.close();
  server.close();

  if (JSON_OUT) { console.log(JSON.stringify(report, null, 2)); return; }

  let bad = 0;
  for (const r of report) {
    const issues = (r.overflow?.length ? 1 : 0) + (r.small?.length || 0) + (r.tiny?.length || 0);
    if (!issues && !r.error) continue;
    bad += 1;
    console.log(`\n${r.viewport}  ${r.page}`);
    if (r.error) console.log(`    ERROR ${r.error}`);
    if (r.overflow?.length) {
      console.log(`    OVERFLOW  page is ${r.scrollWidth}px wide in a ${r.vw}px viewport`);
      for (const o of r.overflow) {
        console.log(`      ${o.tag}.${o.cls || '(none)'}  ${o.w}px wide, right edge ${o.right}`);
      }
    }
    for (const s of (r.small || []).slice(0, 5)) {
      console.log(`    TARGET    ${s.tag}.${s.cls || '(none)'} ${s.w}x${s.h}  "${s.text}"`);
    }
    for (const t of r.tiny || []) {
      console.log(`    TINY TEXT ${t.tag} ${t.size}px  "${t.text}"`);
    }
  }
  console.log(`\n${bad} of ${report.length} page/viewport combinations have something to fix`);
  if (bad) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
