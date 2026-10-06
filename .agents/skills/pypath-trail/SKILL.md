---
name: pypath-trail
description: How the scrolling course trail on PyPath's home page is built and how to change it safely: the geometry generator (scripts/build-trail.mjs), the runtime (assets/js/path-trail.js) with measured labels and the phone follow camera, the scene palettes as tokens in home-path.css, the versioned asset URLs, and the browser invariant spec that must pass. Use this whenever a task touches the home page trail, index.html between the trail:begin and trail:end markers, the unit cards or stops on the landing page, courses.json label/blurb/hours/level fields, adding a course or unit to the trail, scroll length, scenery or palettes, the course switcher, labels on the map, or the trail's reduced-motion, mobile or keyboard behaviour, even when the request just says "the path on the homepage looks broken".
---

# PyPath home trail

One sticky viewport, one `<svg class="path-map">` per course (a *segment*), one
card per unit. Scroll draws each segment's line, lights its stops and labels the
active one. Between segments, a title card closes over the map while the scene
changes underneath it.

## First: is it the cache?

`/assets/(css|js)/*` is served `max-age=3600, stale-while-revalidate=86400`.
`index.html` is not cached. Before the URLs were versioned, returning visitors got
new markup with a day-old `home-path.css` and `path-trail.js`, and the trail
looked broken in ways no code on the branch could produce. The trail's two files
are now requested as `?v=<content hash>`, written by the generator. `--check` and
`tests/home-trail.test.js` fail if a file changes and the URL does not follow.

If a report doesn't match what you can reproduce, first route the old files
through Playwright to reproduce the stale mix. See
`REVIEW/trail-repair-audit.md`.

## Never hand-edit the trail markup

```bash
node scripts/build-trail.mjs          # rewrite the trail region and the asset versions
node scripts/build-trail.mjs --check  # exit 1 if stale
```

Sources:

- `assets/data/courses.json`: each unit needs `title`, `label` (the short text
  shown on the map), `hours`, `level` and `first`. Python for Data's blurbs come
  from `scripts/data-course-unit-N.cjs`.
- `SEGMENTS` in the generator: `rows` (e.g. `[3, 4, 3]`, which must add up to
  the course's unit count), `seed`, `climb`, `startRight`, `pinToPrevious`,
  `span` (vh for the segment) and `seam` (vh of hand-over after it). All
  segments must have the same number of rows, so they share one frame.

## Geometry

`serpentine()` lays stops on rows of 3 and 4 on an offset lattice, so neighbours
are evenly spaced on screen. It then routes a centripetal Catmull-Rom spline
through the stops, plus one swing point per row turn. Each stop gets `data-at`,
its fraction along the path.

Dots and `d` come from the same points. Don't place stops by arc length and don't
hand-author a `d`. Tune `MAP` (spacing, row ratio, wave, jitter, margins)
instead. `tests/home-trail.test.js` checks spacing and bounds at 10, 20 and 30
stops.

## Labels: numbers only, measured

- The map shows numbers only.
- The active stop gets one pill with a leader line. A hovered stop gets a second.
- Placement runs in `measureSegment()` on load, on font load and on a
  width-changing resize, never in the scroll handler. It measures each label
  with `getBBox()` and tries both sides of the path normal, then the compass
  points and diagonals.
- Each candidate is scored: it must stay inside the map, clear of other dots and
  of the finish flag, off the line, and never nearer another dot than its own.
  Results are cached.
- Never place a label by index.

## Scenes are tokens

Components read only `--trail-*`. Each scene maps `--trail-*` onto a palette:

- `--day-*` for Foundations.
- `--night-*` for Python for Data, built from theme-factory's Midnight Galaxy
  with a marigold lamp.

Both palettes have light and dark site-theme values. To restyle a scene, change
its palette, not the components. A third course needs a third palette, a
`.path-map[data-segment="3"]` mapping and a `trailLine3` gradient.

## Phones

Below 560px the frame is a fixed 1.3:1 window. `cameraFor()` turns the viewBox
into a 330-unit window that sits half a stop behind the traveller, and labels
are fitted into it. Same drawing, no second layout.

## Behaviour that must survive a change

- **Sticky on phones.** `style.css` sets `overflow-x: hidden !important` at
  980px and below. `home-path.css` overrides it with `clip`, and `test:mobile`
  flags UNSTUCK if that regresses.
- **Scroll listeners.** They stay on window, body and documentElement.
- **Active stop.** Only the scene's segment has one. The gateway (the first stop
  of the next course) lights when its scene takes over, so the active card is
  always the highest lit stop.
- **Head.** It rides the scene's path and is hidden during a seam.
- **Reduced motion.** Same states, no transitions. The seam card holds for the
  whole seam, and the camera steps.
- **Keyboard.** With two or more segments, every card stays in the tab order.
  Focusing an inactive card scrolls to its stop. The switcher (`aria-current`)
  lands on a course's first stop and focuses its card.

## Verify

Screenshots are the ground truth. Scroll with
`window.PyPathTrail.scrollToProgress(p)` or `behavior: "instant"`, and wait for
the header opacity to be `'1'`.

```bash
npm run test:trail            # invariants every 5% at 1440/1024/390 (+ hover pass)
npm run test:trail:selftest   # each rule must catch a deliberate break
python3 tests/browser/trail_invariants.py --reduced | --theme dark | --step 0.01
npm test && npm run validate:checks
npm run test:a11y && npm run test:keyboard && npm run test:motion && npm run test:mobile && npm run test:perf
```

The spec's rules:

1. No label overlaps another label.
2. Every label is inside the map.
3. Every label's nearest dot is its own.
4. The head is within 2px of the scene path.
5. Exactly one card is active, and it is the highest lit stop.
6. Past a seam, the next course is lit.
7. The active stop is never at opacity 0, and is labelled and in frame.
8. Label text and the active stop's number meet 4.5:1 contrast.
