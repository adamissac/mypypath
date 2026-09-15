---
name: pypath-trail
description: How the scrolling course trail on PyPath's home page is built and how to change it safely: the generator (scripts/build-trail.mjs), the segment runtime (assets/js/path-trail.js), per-scene styling in home-path.css, and the checks that must pass. Use this whenever a task touches the home page trail, index.html between the trail:begin and trail:end markers, the unit cards or stops on the landing page, courses.json label/blurb/hours/level fields, adding a course or unit to the trail, changing scroll length, scenery, the jump link, or the trail's reduced-motion, mobile or keyboard behaviour. It applies even when the request just says "the path on the homepage" or "add the new course to the landing page".
---

# PyPath home trail

One sticky viewport, one `<svg class="path-map">` per course (a *segment*),
one card per unit. Scroll progress draws each segment's line, lights its stops
and picks the card; between segments the maps and scenery cross-fade.

## Never hand-edit the trail markup

Everything between `<!-- trail:begin ... -->` and `<!-- trail:end -->` in
`index.html` is generated. The intro above it and the rest of the page are
hand-written.

```bash
node scripts/build-trail.mjs          # rewrite the region
node scripts/build-trail.mjs --check  # exit 1 if stale (also a vitest assertion)
```

Sources:

- `assets/data/courses.json`: each unit needs `title`, `label` (short map
  label), `hours`, `level`, `first` (the first lesson's path). Foundations
  keeps `blurb` there; Python for Data's blurb comes from
  `scripts/data-course-unit-N.cjs` through `data-course-content.cjs`, so the
  course page and the trail can never disagree. A missing field throws.
- `SEGMENTS` in `scripts/build-trail.mjs`: order, `route` (path + anchors +
  label offsets), `span` (scroll budget in vh for the whole segment), `seam`
  (vh of cross-fade after it), `jump` (the link text that lands on it).

## Numbering

Stop and card numbers count across the whole trail (1-20). Links always come
from `first`. Never build a link from a stop number, and never display a unit's
own `n` on the trail. `tests/home-trail.test.js` checks both.

## Adding a course (segment 3)

1. Units in `courses.json` with the fields above; add its root to
   `COURSE_ROOTS` in `assets/js/gate.js` if it is gated.
2. A route: ten anchors in the 640x560 viewBox through `routeThrough(anchors,
   offsets)`. Keep neighbouring anchors roughly equal distances apart; stops
   are placed by arc length, not at the anchors. Set label offsets by eye,
   then screenshot: labels must not sit on the line or run off the frame.
3. A `SEGMENTS` entry with `scene: 3`, a span (about 32-40vh per stop), and a
   seam on the segment before it.
4. Scenery: `scenery(seg)` emits the scene's marks; `home-path.css` needs
   `--s3-*` tokens (light and `[data-theme="dark"]`), a `pathGradient3`, and
   `.path-map[data-segment="3"]` / `[data-scene="3"] .path-panel` rules. The
   current CSS fades one extra scene layer on `--seam`; a third scene needs its
   own layer keyed on the section's `data-scene`. Scenery is SVG and CSS only:
   the index page is close to the perf budget (ownKB 1500).
5. The jump links currently assume two segments (`[data-scene="1"]
   [data-trail-jump="2"]`). Decide what a three-course switcher shows.

## Behaviour that must survive a change

- **Sticky on phones.** `style.css` sets `overflow-x: hidden !important` on
  html/body/main at 980px and below, which makes them scroll containers and
  unpins the viewport. `home-path.css` overrides with `clip`. `test:mobile`
  fails with UNSTUCK if that regresses.
- **Scroll listeners** stay on window, body and documentElement.
- **Reduced motion.** One segment: whole line, all stops lit, last card, no
  listener (the original behaviour). Several: whole lines, all lit, scene and
  card step with scroll (`stepped`), no fades.
- **Head.** Follows the scene's segment, hidden during a seam. The hide rule
  needs four classes to beat `.path-journey.is-active .path-head`.
- **Keyboard / screen readers.** The map is `aria-hidden`. With two or more
  segments every card stays visible to the accessibility tree and in the tab
  order; focusing an inactive card scrolls to its stop. The jump link moves
  focus to the first card of the course it lands on.

## Verify

Screenshots are the ground truth. Scroll with `behavior: "instant"` (the page
smooth-scrolls, and a 750ms wait after a plain `scrollTo` lands short).

```bash
npm test && npm run validate:checks
npm run test:a11y && npm run test:keyboard && npm run test:motion && npm run test:mobile && npm run test:perf
```

Then, with `npm run serve`, capture desktop 1280x900 and 390x844 at 0, 25, 49,
51, 75 and 100% of the track, plus the last stop of each segment, the seam's
midpoint and the first stop after it (the seam is not at 50%), with and without
reduced motion, and one dark-theme pass. `window.PyPathTrail` exposes
`locate`, `setProgress`, `progressForStop` and `scrollToProgress` for probes.
