/* Every control reachable by keyboard, with a visible focus ring, no traps.
 *
 * A screen-reader user and a keyboard-only user meet the same wall: a control
 * that Tab never reaches does not exist for them. This walks the tab order of
 * each page shape and reports three things:
 *
 *   UNREACHABLE  an interactive, visible element the tab order never lands on.
 *   NO FOCUS RING  a focused element whose appearance does not change, so the
 *                  visitor cannot tell where they are.
 *   TRAP  Tab from an element returns to the same element.
 *
 *     node scripts/verify-keyboard.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.KB_PORT || 8085);

const PAGES = [
  '/index.html', '/curriculum.html', '/units/unit-1/what-is-python.html',
  '/classroom.html', '/quiz.html', '/settings.html', '/login.html', '/sandbox.html',
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

const DESCRIBE = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    tag: el.tagName.toLowerCase(),
    cls: String(el.className || '').split(' ')[0] || '',
    text: (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 30),
    key: el.tagName + '|' + String(el.className || '') + '|'
       + (el.id || '') + '|' + Math.round(r.top) + ',' + Math.round(r.left),
    outline: cs.outlineStyle + ' ' + cs.outlineWidth,
    boxShadow: cs.boxShadow,
    hidden: r.width === 0 || r.height === 0,
  };
})()`;

async function run() {
  const server = await serve();
  const browser = await chromium.launch();
  let problems = 0;

  for (const page of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}${page}`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(3000);

    // Everything a sighted mouse user can reach.
    const interactive = await p.evaluate(`(() => {
      const SEL = 'a[href], button, input:not([type=hidden]), select, textarea, summary,'
        + ' [role=button], [role=link], [tabindex]:not([tabindex="-1"])';
      return [...document.querySelectorAll(SEL)].filter((el) => {
        if (el.disabled) return false;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }).length;
    })()`);

    /* Start the walk from a known place.
     *
     * The sandbox editor has autofocus:true, so without this the walk began
     * INSIDE it, tabbed through the seven controls below it, ran off the end of
     * the document and stopped -- reporting 7 of 23 reachable when all 23 are.
     * A measurement artefact that looked exactly like a real barrier, which is
     * why it is worth a comment: the fix is to start at the top, not to
     * conclude the page is broken. */
    await p.evaluate(`(() => {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      const first = document.body.firstElementChild;
      if (first) { first.setAttribute('tabindex', '-1'); first.focus(); first.removeAttribute('tabindex'); }
    })()`);
    const visited = new Set();
    const noRing = [];
    let traps = 0;
    let wrapped = false;
    let last = null;

    // Two full passes' worth of tabs, capped: enough to walk any of these
    // pages and to notice a cycle that is shorter than the control count.
    for (let i = 0; i < interactive * 2 + 40; i += 1) {
      await p.keyboard.press('Tab');
      let cur = await p.evaluate(DESCRIBE);
      if (!cur) {
        /* Focus left the document -- the end of the tab order. A browser hands
           it to its own chrome here and hands it back on the next Tab, so the
           walk continues once rather than stopping, which is how it wraps
           round to the controls above where it started. */
        if (wrapped) break;
        wrapped = true;
        continue;
      }

      /* Tab did not move. That is a trap UNLESS the component advertises an
         escape and the escape works -- which is exactly what WCAG 2.1.2 asks
         for: not that Tab itself gets you out, but that SOMETHING does and
         that you were told what.
         
         A code editor binds Tab to indentation, which is right for writing
         Python. Both editors on this site name themselves "... Press Escape to
         leave the editor", so the walk presses Escape and carries on. If focus
         still has not moved, it is a real trap. */
      if (last && cur.key === last.key) {
        const advertised = /Escape/i.test(cur.text || '')
          || /Escape/i.test(await p.evaluate('(document.activeElement && document.activeElement.getAttribute("aria-label")) || ""'));
        if (advertised) {
          await p.keyboard.press('Escape');
          cur = await p.evaluate(DESCRIBE);
          if (!cur || cur.key === last.key) { traps += 1; break; }
        } else {
          traps += 1;
          break;
        }
      }
      if (visited.has(cur.key)) break;   // wrapped round; the walk is done
      visited.add(cur.key);

      const ring = cur.outline !== 'none 0px' || (cur.boxShadow && cur.boxShadow !== 'none');
      if (!ring && !cur.hidden) noRing.push(`${cur.tag}.${cur.cls} "${cur.text}"`);
      last = cur;
    }

    const reached = visited.size;
    const missing = interactive - reached;
    const bad = missing > 0 || noRing.length > 0 || traps > 0;
    if (bad) problems += 1;

    console.log(`\n${page}`);
    console.log(`    ${reached} of ${interactive} interactive elements reached by Tab`);
    if (missing > 0) console.log(`    UNREACHABLE   ${missing}`);
    if (traps) console.log(`    TRAP          Tab did not move focus`);
    for (const n of noRing.slice(0, 6)) console.log(`    NO FOCUS RING ${n}`);
    if (noRing.length > 6) console.log(`    NO FOCUS RING ... and ${noRing.length - 6} more`);

    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(`\n${problems} of ${PAGES.length} pages have something to fix`);
  if (problems) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
