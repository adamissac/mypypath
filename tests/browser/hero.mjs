/* The home hero's mountain is big enough to be the picture on the page: its
   artwork fills its frame, and the hero gives it room without touching the
   title or scrolling sideways. Run against npm run serve:
     node tests/browser/hero.mjs [base] */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8080';
const browser = await chromium.launch();
const english = () => { try { localStorage.setItem('pypath.locale', 'en'); } catch {} };
try {
  // 1. The drawing fills its viewBox (no big empty margins around the island).
  const probe = await (await browser.newContext({ viewport: { width: 900, height: 900 } })).newPage();
  await probe.goto(`${base}/assets/img/summit-art.svg`);
  const fill = await probe.evaluate(() => {
    const svg = document.documentElement;
    // The island itself (not the clouds, sparkles and wind track around it).
    const el = svg.querySelector('#island');
    const b = el.getBBox();
    const m = el.getCTM();
    const x0 = b.x * m.a + m.e, x1 = (b.x + b.width) * m.a + m.e;
    const y0 = b.y * m.d + m.f, y1 = (b.y + b.height) * m.d + m.f;
    return { w: (x1 - x0) / innerWidth, h: (y1 - y0) / innerHeight, left: x0 / innerWidth, right: x1 / innerWidth, top: y0 / innerHeight, bottom: y1 / innerHeight };
  });
  assert.ok(fill.w >= 0.78 && fill.h >= 0.9, `the island fills ${(fill.w * 100).toFixed(0)}% x ${(fill.h * 100).toFixed(0)}% of its frame`);
  assert.ok(fill.left >= 0.02 && fill.right <= 0.98 && fill.top >= 0 && fill.bottom <= 1, 'the island stays inside its frame');
  console.log(`ok  island fills ${(fill.w * 100).toFixed(0)}% x ${(fill.h * 100).toFixed(0)}% of its frame`);

  // 2. In the hero it is large, inside the window, and clear of the title.
  for (const [w, h, minArt] of [[1440, 900, 650], [1280, 800, 575], [1024, 768, 460], [390, 844, 330]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.addInitScript(english);
    const page = await ctx.newPage();
    await page.goto(base + '/');
    await page.waitForSelector('.home-summit__art');
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => {
      const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width }; };
      return { art: r('.home-summit__art'), title: r('.home-brand'), vw: innerWidth, sw: document.documentElement.scrollWidth };
    });
    assert.ok(m.art.w >= minArt, `${w}px: art is ${Math.round(m.art.w)}px wide (wanted >= ${minArt})`);
    assert.ok(m.art.r <= m.vw + 1 && m.sw <= m.vw, `${w}px: nothing scrolls sideways`);
    if (w >= 1024) {
      // The title may sit over the drawing's empty left margin, never its subject:
      // the island's left edge starts ~6% into the frame.
      assert.ok(m.title.r <= m.art.l + m.art.w * 0.14, `${w}px: title ends at ${Math.round(m.title.r)}, art starts at ${Math.round(m.art.l)}`);
    }
    console.log(`ok  ${w}px: art ${Math.round(m.art.w)}px, ends at ${Math.round(m.art.r)} of ${m.vw}`);
    await ctx.close();
  }
} finally { await browser.close(); }
