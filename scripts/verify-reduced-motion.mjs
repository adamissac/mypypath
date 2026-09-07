/* Does anything still move for a visitor who asked for less motion?
 *
 * The preference is often medical: vestibular disorders make drifting,
 * parallax and large entrance animations genuinely unpleasant rather than
 * merely unwanted. There were already a dozen prefers-reduced-motion blocks in
 * these stylesheets, all individually correct, and three animations still ran
 * -- including an 18-SECOND infinite drift on the homepage -- because that
 * shape is opt-IN and every new animation has to remember to exclude itself.
 *
 *     node scripts/verify-reduced-motion.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.RM_PORT || 8079);

const PAGES = [
  '/index.html', '/curriculum.html', '/units/unit-1/what-is-python.html',
  '/classroom.html', '/quiz.html', '/sandbox.html', '/progress.html',
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

/* 150ms is the threshold. Below it a transition is a state change rather than
   an animation -- a focus ring appearing has to be allowed to appear. */
const PROBE = `(() => {
  const moving = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    const a = parseFloat(cs.animationDuration) || 0;
    const t = parseFloat(cs.transitionDuration) || 0;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if ((cs.animationName !== 'none' && a > 0.15) || t > 0.15) {
      moving.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || '').split(' ')[0] || '',
        name: cs.animationName, a, t,
      });
    }
  }
  return {
    moving: moving.slice(0, 6),
    total: moving.length,
    bootPlaying: document.documentElement.classList.contains('pp-boot'),
  };
})()`;

async function run() {
  const server = await serve();
  const browser = await chromium.launch();
  let bad = 0;

  for (const page of PAGES) {
    const ctx = await browser.newContext({
      reducedMotion: 'reduce',
      viewport: { width: 1280, height: 900 },
    });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}${page}`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(3500);
    const r = await p.evaluate(PROBE);

    const problems = [];
    if (r.total) problems.push(`${r.total} element(s) still animating`);
    if (r.bootPlaying) problems.push('the boot overlay is playing');

    console.log(`${page.padEnd(38)}${problems.length ? problems.join(', ') : 'still'}`);
    for (const m of r.moving) {
      console.log(`    ${m.tag}.${m.cls}  ${m.name}  anim ${m.a}s  transition ${m.t}s`);
    }
    if (problems.length) bad += 1;
    await ctx.close();
  }

  await browser.close();
  server.close();

  if (bad) {
    console.error(`\nFAIL: ${bad} page(s) still move for a reduced-motion visitor`);
    process.exitCode = 1;
  } else {
    console.log('\nPASS: nothing animates for a reduced-motion visitor');
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
