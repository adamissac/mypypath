/* Page weight and request count, asserted rather than hoped for.
 *
 * WHY THE NUMBERS IN THE AUDIT WERE NOT THE NUMBERS. It reported 43 <script
 * src> tags on a lesson page and 39 on the classroom page. The files have 7 and
 * 10. The difference is ES modules: a module graph fans out into many network
 * requests from a handful of tags, so counting tags understates the cost and
 * counting resolved requests is what actually matters. This measures requests,
 * which is the number a browser pays.
 *
 *     node scripts/verify-perf-budget.mjs
 *     node scripts/verify-perf-budget.mjs --json
 *     BASE=https://mypypath.com node scripts/verify-perf-budget.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PERF_PORT || 8088);
const BASE = process.env.BASE || `http://127.0.0.1:${PORT}`;
const JSON_OUT = process.argv.includes('--json');

/* The budget.
 *
 * criticalKB IS THE ONE THAT MATTERS, and separating it out is the whole
 * reason this script measures what it measures. It counts our own bytes
 * requested BEFORE the load event -- the ones competing with the page becoming
 * usable. Bytes fetched deliberately afterwards (three.min.js, which is 618KB
 * of decorative 3D behind a requestIdleCallback) are real weight and are not
 * on the critical path, and a budget that could not tell those apart would
 * have scored moving that download off the critical path as no improvement at
 * all -- which is exactly what happened the first time this ran.
 *
 * Thresholds are set from what the site does, rounded up to leave ordinary
 * work room, and deliberately NOT set to the current number: a budget that
 * fails on any change at all gets raised reflexively until it means nothing.
 * These are the points at which someone should stop and think.
 *
 * Third-party bytes (Firebase from gstatic, Pyodide from jsdelivr) are
 * reported and not budgeted. They are real cost to a learner and they are not
 * something a commit to this repo usually moves, so folding them in would hide
 * the half that is ours. */
const BUDGET = {
  requests: 70,
  /* 1000KB is a CEILING, not an endorsement. The heaviest page today is
     /classroom.html at 950, which is a lot of JavaScript before DOMContentLoaded
     and is the honest starting point rather than a target to be proud of. The
     budget exists so the number stops drifting upward unnoticed; lowering it is
     the follow-up work, and every reduction should come with this line moving
     down. */
  criticalKB: 1000,
  ownKB: 1500,
  cssKB: 420,
};

const PAGES = [
  '/index.html',
  '/units/unit-1/what-is-python.html',
  '/classroom.html',
  '/curriculum.html',
  '/quiz.html',
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

async function run() {
  const server = BASE.startsWith('http://127.0.0.1') ? await serve() : null;
  const browser = await chromium.launch();
  const report = [];

  for (const page of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    const seen = [];
    /* DOMContentLoaded, not load. `load` waits for every subresource
       including the ones deliberately fetched during idle time, so using it
       would mark the whole page as critical and the split would measure
       nothing. DCL is the moment the document is parsed and the page is
       becoming usable, which is what the critical budget is protecting. */
    let loaded = false;
    p.on('domcontentloaded', () => { loaded = true; });

    p.on('response', async (res) => {
      const url = res.url();
      let bytes = 0;
      try {
        const len = res.headers()['content-length'];
        bytes = len ? Number(len) : (await res.body().catch(() => Buffer.alloc(0))).length;
      } catch { bytes = 0; }
      seen.push({
        url,
        bytes,
        // Arrived before DOMContentLoaded, i.e. competing with the page
        // becoming usable, rather than fetched deliberately afterwards.
        critical: !loaded,
        third: !url.startsWith(BASE),
        kind: /\.css(\?|$)/.test(url) ? 'css'
          : /\.m?js(\?|$)/.test(url) ? 'js'
          : /\.(png|jpe?g|webp|svg|ico)(\?|$)/.test(url) ? 'img'
          : /\.woff2?(\?|$)/.test(url) ? 'font' : 'other',
      });
    });

    try {
      await p.goto(BASE + page, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await p.waitForTimeout(4000);
    } catch (e) {
      report.push({ page, error: String(e).slice(0, 140) });
      await ctx.close();
      continue;
    }

    const own = seen.filter((s) => !s.third);
    const kb = (list) => Math.round(list.reduce((a, s) => a + s.bytes, 0) / 1024);
    report.push({
      page,
      requests: own.length,
      thirdParty: seen.length - own.length,
      criticalKB: kb(own.filter((s) => s.critical)),
      deferredKB: kb(own.filter((s) => !s.critical)),
      ownKB: kb(own),
      cssKB: kb(own.filter((s) => s.kind === 'css')),
      jsKB: kb(own.filter((s) => s.kind === 'js')),
      thirdKB: kb(seen.filter((s) => s.third)),
    });
    await ctx.close();
  }

  await browser.close();
  if (server) server.close();

  if (JSON_OUT) { console.log(JSON.stringify(report, null, 2)); return; }

  const fails = [];
  console.log('page                                  reqs  critKB  defKB  ownKB  cssKB  jsKB | 3p KB');
  for (const r of report) {
    if (r.error) { console.log(`${r.page}  ERROR ${r.error}`); fails.push(r.page); continue; }
    console.log(
      `${r.page.padEnd(38)}${String(r.requests).padStart(4)}`
      + `${String(r.criticalKB).padStart(8)}${String(r.deferredKB).padStart(7)}`
      + `${String(r.ownKB).padStart(7)}${String(r.cssKB).padStart(7)}`
      + `${String(r.jsKB).padStart(6)}`
      + ` | ${String(r.thirdKB).padStart(6)}`
    );
    for (const [key, limit] of Object.entries(BUDGET)) {
      if (r[key] > limit) fails.push(`${r.page}: ${key} ${r[key]} > ${limit}`);
    }
  }
  console.log(`\nbudget: ${Object.entries(BUDGET).map(([k, v]) => `${k} <= ${v}`).join(', ')}`);
  if (fails.length) {
    console.error('\nFAIL: over budget');
    for (const f of fails) console.error('  -', f);
    process.exitCode = 1;
  } else {
    console.log('\nPASS: every page inside the budget');
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
