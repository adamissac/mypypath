/* PyPath — the accessibility audit, run in a real browser against real pages.
 *
 * WHY A SCRIPT AND NOT A UNIT TEST. Most of what WCAG asks about is a property
 * of RENDERED output: whether a target is 24 CSS pixels, whether a heading
 * level was skipped, whether a control ended up with an accessible name once
 * every label, aria-label and wrapping element had its say. None of that is
 * visible in the HTML source, and a jsdom test that claimed to check it would
 * be checking a layout engine that does not lay anything out.
 *
 * WHAT IT CHECKS. axe-core for the rule-shaped violations, plus two measured
 * checks axe does not make:
 *
 *   Target size (WCAG 2.2 SC 2.5.8). axe has no rule for this. Measured from
 *   getBoundingClientRect on everything interactive and visible.
 *
 *   Heading order. axe's heading-order rule exists but is flagged
 *   "best-practice" and is off in the default ruleset; it is turned on here
 *   because a lesson page skipping h2 to h4 is exactly what was found.
 *
 * USAGE
 *   node scripts/audit-a11y.mjs                 # against a local server
 *   BASE=https://mypypath.com node scripts/...  # against production
 *   node scripts/audit-a11y.mjs --json          # machine-readable, for CI
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.A11Y_PORT || 8099);
const BASE = process.env.BASE || `http://127.0.0.1:${PORT}`;
const JSON_OUT = process.argv.includes('--json');

/* One page per shape of page, not every page. Eighty lesson pages are baked
   from one template by scripts/bake_layout.py, so auditing three of them finds
   the same three violations three times and hides the cost of the pages that
   are genuinely different. */
export const PAGES = [
  '/index.html',
  '/curriculum.html',
  '/units/unit-1/what-is-python.html',
  '/classroom.html',
  '/quiz.html',
  '/unit-test.html',
  '/settings.html',
  '/certificate.html',
  '/account.html',
  '/login.html',
  '/progress.html',
  '/sandbox.html',
];

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
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

/* WCAG 2.2 SC 2.5.8: 24x24 CSS pixels, unless a spacing exception applies.
 *
 * The exceptions are real and are honoured, because a rule that reports them
 * as failures trains people to ignore it:
 *
 *   - inline links in a sentence are exempt (the "inline" exception);
 *   - an element whose 24px-diameter circle does not overlap any other
 *     target's is exempt (the "spacing" exception);
 *   - anything the user agent styles and the author has not is exempt.
 *
 * Only the first two can be tested from here, so both are. */
const TARGET_SIZE_PROBE = `(() => {
  const MIN = 24;
  const sel = 'a[href], button, input:not([type=hidden]), select, textarea,' +
              ' summary, [role=button], [role=link], [role=checkbox],' +
              ' [role=radio], [role=tab], [role=switch], [tabindex]:not([tabindex="-1"])';
  const nodes = [...document.querySelectorAll(sel)].filter((el) => {
    if (el.disabled) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });

  const boxes = nodes.map((el) => ({ el, r: el.getBoundingClientRect() }));

  function inlineExempt(el) {
    // A link inside a sentence of text. The spec's wording is "in a sentence
    // or block of text"; the practical test is an <a> whose parent holds text
    // either side of it.
    if (el.tagName !== 'A') return false;
    const p = el.parentElement;
    if (!p) return false;
    const text = (p.textContent || '').trim().length;
    const own = (el.textContent || '').trim().length;
    return text > own + 12;
  }

  function spacingExempt(box) {
    // A 24px circle centred on the target that overlaps no other target.
    const c = { x: box.r.left + box.r.width / 2, y: box.r.top + box.r.height / 2 };
    for (const other of boxes) {
      if (other.el === box.el) continue;
      const o = other.r;
      const nx = Math.max(o.left, Math.min(c.x, o.right));
      const ny = Math.max(o.top, Math.min(c.y, o.bottom));
      const d = Math.hypot(c.x - nx, c.y - ny);
      if (d < MIN / 2) return false;
    }
    return true;
  }

  const bad = [];
  for (const box of boxes) {
    if (box.r.width >= MIN && box.r.height >= MIN) continue;
    if (inlineExempt(box.el)) continue;
    if (spacingExempt(box)) continue;
    bad.push({
      tag: box.el.tagName.toLowerCase(),
      w: Math.round(box.r.width * 10) / 10,
      h: Math.round(box.r.height * 10) / 10,
      text: (box.el.textContent || box.el.getAttribute('aria-label') || '').trim().slice(0, 40),
      cls: (box.el.className && String(box.el.className).slice(0, 60)) || '',
    });
  }
  return bad;
})()`;

async function run() {
  const server = BASE.startsWith('http://127.0.0.1') ? await serve() : null;
  const browser = await chromium.launch();
  const axeSource = await readFile(
    path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8'
  );

  const report = [];
  for (const page of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    try {
      await p.goto(BASE + page, { waitUntil: 'domcontentloaded', timeout: 45000 });
      // Not networkidle: /classroom.html holds a live listener and never idles.
      await p.waitForTimeout(3500);
      await p.addScriptTag({ content: axeSource });

      const axe = await p.evaluate(async () => window.axe.run(document, {
        // heading-order is best-practice and off by default. It is on here
        // because a lesson page skipping h2 -> h4 is what the audit found.
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
        rules: { 'heading-order': { enabled: true } },
        resultTypes: ['violations'],
      }));

      const targets = await p.evaluate(TARGET_SIZE_PROBE);

      report.push({
        page,
        violations: axe.violations.map((v) => ({
          id: v.id, impact: v.impact, n: v.nodes.length,
          help: v.help,
          sample: v.nodes.slice(0, 2).map((n) => n.html.slice(0, 110)),
          why: v.nodes.slice(0, 2).map((n) =>
            (n.any || []).concat(n.all || []).map((c) => c.message).join(' | ').slice(0, 220)),
        })),
        smallTargets: targets,
      });
    } catch (e) {
      report.push({ page, error: String(e).slice(0, 200), violations: [], smallTargets: [] });
    }
    await ctx.close();
  }

  await browser.close();
  if (server) server.close();

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  let totalV = 0;
  let totalT = 0;
  for (const r of report) {
    const v = r.violations.reduce((a, x) => a + x.n, 0);
    totalV += v;
    totalT += r.smallTargets.length;
    const flag = r.error ? `ERROR ${r.error}` : '';
    console.log(`\n${r.page}  ${v} axe violation(s), ${r.smallTargets.length} small target(s) ${flag}`);
    for (const x of r.violations) {
      console.log(`    ${String(x.impact).padEnd(8)} ${x.id.padEnd(28)} x${x.n}  ${x.help}`);
      for (const s of x.sample) console.log(`             ${s}`);
    }
    const byClass = {};
    for (const t of r.smallTargets) {
      const k = `${t.tag}.${t.cls.split(' ')[0] || '(none)'}  ${t.w}x${t.h}`;
      byClass[k] = (byClass[k] || 0) + 1;
    }
    for (const [k, n] of Object.entries(byClass).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      console.log(`    target   ${k}  x${n}`);
    }
  }
  console.log(`\nTOTAL: ${totalV} axe violations, ${totalT} targets under 24x24`);
  return report;
}

run().catch((e) => { console.error(e); process.exit(1); });
