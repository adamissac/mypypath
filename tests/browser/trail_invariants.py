"""Invariants for the home page trail map, checked in a real browser.

"The map looks broken" is not testable, so this turns it into rules and checks
them at every 5% of the scroll track, at 1440px, 1024px and 390px:

  1. No two visible labels overlap.
  2. Every visible label is fully inside the map.
  3. Every visible label's nearest dot is its own dot.
  4. The head is on the scene's path, within 2px of the point for the current
     progress. (It may be hidden, but never shown anywhere else.)
  5. Exactly one card is active, and it is the highest lit stop.
  6. Past the seam, a stop of the next course is lit and has a real box.
  7. The active stop is never inside something with opacity 0.

  8. Label text and the active stop's number meet 4.5:1 contrast.

plus: the active stop has a label, and the active stop's dot is inside the map.
At the two wider widths each step is checked again with the pointer on the next
stop, so the hover label is held to the same rules.

Run it through the webapp-testing helper, which starts a static server:

    npm run test:trail
    # or, against a server you already have:
    python3 tests/browser/trail_invariants.py --base http://localhost:8080 [--reduced]

Exits non-zero on any failure and saves a screenshot of the first failure at
each width to REVIEW/screenshots/trail-invariant-fail-<width>.png.
"""
import argparse
import json
import os
import sys

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WIDTHS = [(1440, 900), (1024, 768), (390, 844)]
STEPS = [round(i * 0.05, 2) for i in range(21)]

PROBE = r"""
(hover) => {
  const out = { failures: [], notes: {} };
  const fail = (rule, msg) => out.failures.push(`${rule}: ${msg}`);
  const section = document.querySelector('[data-path-journey]');
  const frame = section.querySelector('.path-journey__map').getBoundingClientRect();
  const trail = window.PyPathTrail;
  const progress = trail.progress;
  const where = trail.locate(progress);
  const segs = trail.segments;
  const sceneSeg = segs[where.sceneIndex];
  const scene = sceneSeg.svg;
  const seaming = where.seamIndex !== -1;
  const opacityChain = (el) => {
    let o = 1;
    for (let n = el; n && n !== section; n = n.parentElement) {
      const v = parseFloat(getComputedStyle(n).opacity);
      if (Number.isFinite(v)) o *= v;
    }
    return o;
  };
  const box = (el) => el.getBoundingClientRect();
  const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const distToRect = (p, r) => {
    const dx = Math.max(r.left - p.x, 0, p.x - r.right);
    const dy = Math.max(r.top - p.y, 0, p.y - r.bottom);
    return Math.hypot(dx, dy);
  };
  const toScreen = (svg, pt) => {
    const m = svg.getScreenCTM();
    return { x: m.a * pt.x + m.c * pt.y + m.e, y: m.b * pt.x + m.d * pt.y + m.f };
  };

  // Visible labels: shown, in a map that can be seen.
  const labels = [...section.querySelectorAll('.trail-callout.is-shown')]
    .filter((g) => opacityChain(g) > 0.02)
    .map((g) => ({ g, svg: g.closest('svg'), rect: box(g.querySelector('.trail-callout__pill')), for: Number(g.getAttribute('data-for')) }));
  out.notes.labels = labels.length;

  // 1. No overlaps.
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i].rect, b = labels[j].rect;
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
        fail(1, `labels for stops ${labels[i].for + 1} and ${labels[j].for + 1} overlap`);
      }
    }
  }

  // 2. Inside the map.
  for (const l of labels) {
    const r = l.rect;
    if (r.left < frame.left - 0.5 || r.right > frame.right + 0.5 || r.top < frame.top - 0.5 || r.bottom > frame.bottom + 0.5) {
      fail(2, `label for stop ${l.for + 1} leaves the map (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} vs frame ${Math.round(frame.left)},${Math.round(frame.top)} ${Math.round(frame.width)}x${Math.round(frame.height)})`);
    }
  }

  // 3. Nearest dot is its own.
  for (const l of labels) {
    const dots = [...l.svg.querySelectorAll('.trail-stop')].map((s) => ({
      index: Number(s.getAttribute('data-stop-index')),
      c: center(box(s.querySelector('.trail-stop__dot'))),
    }));
    let best = null;
    for (const d of dots) {
      const dist = distToRect(d.c, l.rect);
      if (!best || dist < best.dist - 0.01) best = { index: d.index, dist };
    }
    if (best && best.index !== l.for) fail(3, `label for stop ${l.for + 1} is nearest to dot ${best.index + 1}`);
  }

  // 4. Head on the scene's path.
  const heads = [...section.querySelectorAll('.path-head')];
  for (const head of heads) {
    const visible = !head.classList.contains('is-hidden') && opacityChain(head) > 0.02 && parseFloat(getComputedStyle(head).opacity) > 0;
    if (!visible) continue;
    const svg = head.closest('svg');
    if (svg !== scene) { fail(4, `a head is showing on segment ${svg.getAttribute('data-segment')} while the scene is ${scene.getAttribute('data-segment')}`); continue; }
    if (seaming) { fail(4, 'the head is showing during the cross-fade'); continue; }
    const hc = center(box(head.querySelector('.path-head__core')));
    const path = svg.querySelector('.path-map__draw');
    const len = path.getTotalLength();
    const frac = parseFloat(svg.style.getPropertyValue('--path-progress')) || 0;
    const expected = toScreen(svg, path.getPointAtLength(frac * len));
    const off = Math.hypot(hc.x - expected.x, hc.y - expected.y);
    if (off > 2) fail(4, `head is ${off.toFixed(1)}px from the path point for progress ${frac.toFixed(3)}`);
    let near = Infinity;
    for (let i = 0; i <= 600; i++) {
      const p = toScreen(svg, path.getPointAtLength((i / 600) * len));
      near = Math.min(near, Math.hypot(p.x - hc.x, p.y - hc.y));
    }
    if (near > 2) fail(4, `head is ${near.toFixed(1)}px from its path`);
  }

  // 5. One active card, matching the highest lit stop.
  const activeCards = [...section.querySelectorAll('[data-stop-card].is-active')];
  if (activeCards.length !== 1) fail(5, `${activeCards.length} active cards`);
  const lit = [...section.querySelectorAll('.trail-stop.is-lit')].map((s) => Number(s.getAttribute('data-stop-index')));
  const highest = lit.length ? Math.max(...lit) : -1;
  const cardIndex = activeCards[0] ? Number(activeCards[0].getAttribute('data-stop-index')) : -1;
  if (cardIndex !== highest) fail(5, `active card is stop ${cardIndex + 1}, highest lit stop is ${highest + 1}`);
  out.notes.card = cardIndex + 1;

  // 6. Past the seam, the next course is lit and real.
  for (let i = 1; i < segs.length; i++) {
    if (progress < segs[i].start) continue;
    const s = [...segs[i].svg.querySelectorAll('.trail-stop.is-lit .trail-stop__dot')]
      .filter((d) => { const r = box(d); return r.width > 0 && r.height > 0; });
    if (!s.length) fail(6, `past the seam into segment ${i + 1} and none of its stops is lit with a box`);
    if (opacityChain(segs[i].svg) < 0.99) fail(6, `segment ${i + 1} is not fully shown past its seam`);
  }

  // 8. Label text is readable on its pill (WCAG AA, 4.5:1), and the active
  //    stop's number is readable on its dot.
  const rgb = (c) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  for (const l of labels) {
    const r = ratio(getComputedStyle(l.g.querySelector('.trail-callout__pill')).fill, getComputedStyle(l.g.querySelector('.trail-callout__text')).fill);
    if (r < 4.5) fail(8, `label for stop ${l.for + 1} has contrast ${r.toFixed(2)}`);
  }
  for (const s of section.querySelectorAll('.path-map.is-scene .trail-stop.is-active')) {
    const r = ratio(getComputedStyle(s.querySelector('.trail-stop__dot')).fill, getComputedStyle(s.querySelector('.trail-stop__num')).fill);
    if (r < 4.5) fail(8, `active stop number has contrast ${r.toFixed(2)}`);
  }

  // 7. The active stop is visible, labelled and inside the map.
  const activeStops = [...section.querySelectorAll('.trail-stop.is-active')];
  if (activeStops.length !== 1) fail(7, `${activeStops.length} active stops`);
  for (const s of activeStops) {
    for (let n = s; n && n !== section; n = n.parentElement) {
      if (getComputedStyle(n).opacity === '0') fail(7, `active stop ${Number(s.getAttribute('data-stop-index')) + 1} is inside ${n.tagName.toLowerCase()}.${String(n.className.baseVal ?? n.className).split(' ')[0]} with opacity 0`);
    }
    if (s.closest('svg') !== scene) fail(7, 'the active stop is not on the scene map');
    const idx = Number(s.getAttribute('data-stop-index'));
    if (idx !== cardIndex) fail(7, `active stop ${idx + 1} is not the active card ${cardIndex + 1}`);
    if (!labels.some((l) => l.for === idx) && !seaming) fail(7, `active stop ${idx + 1} has no label`);
    const r = box(s.querySelector('.trail-stop__dot'));
    if (r.left < frame.left || r.right > frame.right || r.top < frame.top || r.bottom > frame.bottom) fail(7, `active stop ${idx + 1} is outside the map`);
    if (r.width < 18) fail(7, `active stop ${idx + 1} renders ${r.width.toFixed(1)}px wide`);
  }
  return out;
}
"""


def settle(page):
    page.wait_for_load_state("networkidle")
    page.wait_for_function(
        "() => { const h = document.querySelector('.site-header');"
        " return h && getComputedStyle(h).opacity === '1'"
        " && !document.documentElement.classList.contains('pp-boot') && !!window.PyPathTrail }",
        timeout=20000,
    )
    page.evaluate("() => document.fonts && document.fonts.ready")
    page.wait_for_timeout(600)


def accept_course_transition(page):
    # Exercise the actual opt-in before sweeping the second course's geometry.
    # Decline/Escape and the closed gate are covered by trail_transition.mjs.
    if page.locator(".trail-transition").count():
        page.evaluate("window.PyPathTrail.scrollToProgress(0.6)")
        page.get_by_role("button", name="Yes, explore space").click()
        page.evaluate("window.PyPathTrail.scrollToProgress(0)")


def run(base, reduced, only, theme=None, steps=STEPS):
    total_fail = 0
    report = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for width, height in WIDTHS:
            if only and width not in only:
                continue
            ctx = browser.new_context(
                viewport={"width": width, "height": height},
                device_scale_factor=2 if width < 500 else 1,
                reduced_motion="reduce" if reduced else "no-preference",
                has_touch=width < 500,
            )
            page = ctx.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            if theme:
                page.add_init_script(f"try {{ localStorage.setItem('theme', '{theme}') }} catch (e) {{}}")
            page.goto(f"{base}/index.html?invariants=1", wait_until="load")
            settle(page)
            accept_course_transition(page)
            if theme:
                page.evaluate("(t) => document.documentElement.setAttribute('data-theme', t)", theme)
            failures = []
            shot = False
            for step in steps:
                page.evaluate("(p) => window.PyPathTrail.scrollToProgress(p)", step)
                page.mouse.move(2, 2)
                page.wait_for_timeout(450)
                checks = [("", page.evaluate(PROBE, False))]
                if width >= 1000:
                    # Hover the next stop on the scene map and check again.
                    target = page.evaluate(
                        """() => { const t = window.PyPathTrail; const w = t.locate(t.progress);
                          const svg = t.segments[w.sceneIndex].svg;
                          const a = svg.querySelector('.trail-stop.is-active');
                          const stops = [...svg.querySelectorAll('.trail-stop')];
                          const i = a ? stops.indexOf(a) : 0;
                          const n = stops[i + 1] || stops[i - 1];
                          if (!n) return null;
                          const r = n.querySelector('.trail-stop__dot').getBoundingClientRect();
                          return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }"""
                    )
                    if target:
                        page.mouse.move(target["x"], target["y"])
                        page.wait_for_timeout(250)
                        checks.append((" +hover", page.evaluate(PROBE, True)))
                        page.mouse.move(2, 2)
                for tag, res in checks:
                    for f in res["failures"]:
                        failures.append(f"{step:.2f}{tag}  {f}")
                    if res["failures"] and not shot:
                        os.makedirs(os.path.join(ROOT, "REVIEW", "screenshots"), exist_ok=True)
                        page.screenshot(path=os.path.join(ROOT, "REVIEW", "screenshots", f"trail-invariant-fail-{width}.png"))
                        shot = True
            if errors:
                failures.append(f"page errors: {errors[:3]}")
            report[width] = failures
            total_fail += len(failures)
            ctx.close()
        browser.close()

    for width, failures in report.items():
        print(f"\n{width}px  {len(steps)} steps  {'PASS' if not failures else f'{len(failures)} failure(s)'}")
        for f in failures[:40]:
            print("   ", f)
        if len(failures) > 40:
            print(f"    ... and {len(failures) - 40} more")
    print(f"\n{'PASS' if not total_fail else 'FAIL'}: trail invariants{' (reduced motion)' if reduced else ''}{f' ({theme} theme)' if theme else ''}")
    return 1 if total_fail else 0


# Each sabotage breaks one rule on a correct page. --self-test checks that the
# probe notices, so a passing run means the rules still bite.
SABOTAGE = {
    1: """() => { const svg = document.querySelector('.path-map.is-scene');
          const a = svg.querySelector('.trail-callout:not(.trail-callout--peek)'); const p = svg.querySelector('.trail-callout--peek');
          p.innerHTML = a.innerHTML; p.classList.add('is-shown'); p.setAttribute('data-for', a.getAttribute('data-for')); }""",
    2: """() => { const pill = document.querySelector('.path-map.is-scene .trail-callout.is-shown .trail-callout__pill');
          pill.setAttribute('x', '-80'); }""",
    3: """() => { const g = document.querySelector('.path-map.is-scene .trail-callout.is-shown');
          const i = Number(g.getAttribute('data-for')); g.setAttribute('data-for', String(i === 0 ? 1 : 0)); }""",
    4: """() => { const h = document.querySelector('.path-map.is-scene .path-head'); h.setAttribute('transform', 'translate(20 20)'); }""",
    5: """() => { document.querySelectorAll('[data-stop-card]')[0].classList.add('is-active'); }""",
    6: """() => { const s = window.PyPathTrail.segments; const last = s[s.length - 1];
          last.svg.querySelectorAll('.trail-stop').forEach((e) => e.classList.remove('is-lit')); }""",
    7: """() => { document.querySelector('.path-map.is-scene .trail-stop.is-active').style.opacity = '0'; }""",
    8: """() => { const g = document.querySelector('.path-map.is-scene .trail-callout.is-shown');
          g.querySelector('.trail-callout__text').style.fill = getComputedStyle(g.querySelector('.trail-callout__pill')).fill; }""",
}


def self_test(base):
    bad = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for rule, js in SABOTAGE.items():
            page = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()
            page.goto(f"{base}/index.html?selftest={rule}", wait_until="load")
            settle(page)
            accept_course_transition(page)
            if rule == 6 and page.evaluate("window.PyPathTrail.segments.length") < 2:
                print("rule 6: n/a with one segment")
                page.context.close()
                continue
            page.evaluate("(p) => window.PyPathTrail.scrollToProgress(p)", 0.95 if rule == 6 else 0.3)
            page.wait_for_timeout(450)
            clean = page.evaluate(PROBE, False)["failures"]
            page.evaluate(js)
            page.wait_for_timeout(50)
            broken = page.evaluate(PROBE, False)["failures"]
            caught = any(f.startswith(f"{rule}:") for f in broken)
            print(f"rule {rule}: clean page {'ok' if not clean else clean}; sabotaged {'caught' if caught else 'MISSED'} {broken[:2]}")
            if clean or not caught:
                bad.append(rule)
            page.context.close()
        browser.close()
    print("PASS: every rule catches its sabotage" if not bad else f"FAIL: rules {bad}")
    return 1 if bad else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=os.environ.get("TRAIL_BASE", "http://localhost:8080"))
    ap.add_argument("--reduced", action="store_true")
    ap.add_argument("--theme", choices=["light", "dark"])
    ap.add_argument("--width", type=int, action="append")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--step", type=float, default=0.05, help="scroll step; 0.01 for a fine sweep")
    args = ap.parse_args()
    if args.self_test:
        sys.exit(self_test(args.base.rstrip("/")))
    n = int(round(1 / args.step))
    sys.exit(run(args.base.rstrip("/"), args.reduced, args.width, args.theme, [round(i / n, 4) for i in range(n + 1)]))
