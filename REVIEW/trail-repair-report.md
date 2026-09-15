# Trail repair: report

Branch `feat/trail-and-copy`, commits `cca248e`..HEAD, on top of `f672443`, which
is what is on `main` and live. Nothing in this pass was pushed to `main`.

| Commit | What |
|---|---|
| `cca248e` | Round 0: screenshots of both renders, diagnosis (`trail-repair-audit.md`), skills installed |
| `a4f70bf` | Trail CSS and JS URLs versioned by content |
| `33abab2` | Checkpoint 1: serpentine geometry, numbers-only map, measured labels, invariant spec (Foundations only) |
| `f613b0c` | Checkpoint 2: Python for Data segment, night scene, seam title card, palette comparison |
| `12a4464` | Checkpoint 3: panel verified, contrast rule, dark theme |
| `45aa635` | Checkpoint 4: follow camera on phones |
| last | Resize only re-measures on a width change, skill rewritten, this report |

I did not stop at the checkpoints; on the last brief you said to finish without
waiting. Each checkpoint is still its own commit with its own screenshots, so you
can review them in order.

## Checkpoint 0: what was actually wrong

**Your screenshot was a cache mix, not the code on the branch.**

- `index.html` is served `must-revalidate`.
- `/assets/(css|js)/*` is served `max-age=3600, stale-while-revalidate=86400` on
  unversioned URLs.
- For about a day after a visit, a returning browser pairs the new 20-stop markup
  with the previous `home-path.css` and `path-trail.js`.

I reproduced it by serving those two files from `20a5f66` through a Playwright
route (`trail-r0-stale-*`). Every defect in your list appears in
`trail-r0-stale-desktop-072.png`. A first-time visitor saw `trail-r0-fresh-*`
instead.

**Your root-cause analysis:**

- **Correct for the file you read.** The index-parity label rule, arc-length
  spacing, and the single `STOP_COUNT` and `drawPath` globals are all in the
  cached old `path-trail.js`. With 20 stops and one path, it placed all 20 on the
  Foundations line at half spacing. That is why Modules/OOP and Advanced
  Topics/Testing collided, why segment 2 had no dots, and why the head was
  stranded.
- **Out of date for the branch.** The segment refactor had already scoped stops,
  path and head per segment. The real bug behind defects 3 and 4 was the cache.
  The index-parity guess and arc-length spacing were still in the fresh code,
  softened only by hand-set per-stop offsets.

**The 14 defects, by which render has them:**

| Defect | Stale render | Fresh render | Status |
|---|---|---|---|
| 1 labels collide | yes | no | Misread as a code defect: it came from the cache. The label rule was still an index guess. |
| 2 labels float, no leaders | yes | yes | Real |
| 3 segment 2 has no stops | yes | no | Misread: cache |
| 4 head stranded | yes | no | Misread: cache |
| 5 segment 1 never hands off | yes | no | Misread: cache (the fresh render cross-faded) |
| 6 no scenery change | yes | no | Misread: cache (the fresh render had dusk) |
| 7 ugly future path | yes | yes | Real |
| 8 dead space | yes | yes | Real |
| 9 labels have no backing | yes | yes | Real |
| 10 two-digit numbers cramped | yes | yes | Real |
| 11 switcher unstyled | yes | no | Misread: cache (the fresh render showed one styled pill) |
| 12 progress bar through the switcher | yes | no | Misread: cache |
| 13 ambiguous numbering | yes | yes | Real |
| 14 type scale, gap above kicker | yes | yes | Real |

So seven of the fourteen were caused by the cache and seven were real design
problems. All fourteen are addressed below, and the cache is fixed so the stale
mix can't happen again.

## What changed

### Cache

`scripts/build-trail.mjs` writes `?v=<sha256 prefix>` on `home-path.css` and
`path-trail.js` in `index.html`. `--check` and a vitest test fail if either file
changes without its URL. Other pages still use unversioned asset URLs, so any
future HTML change that depends on a CSS or JS change has the same exposure. See
"Where it is still weak".

### Checkpoint 1: geometry and labels

**Geometry.** The generator computes it from the stop count. There is no
hand-authored `d` any more.

- **Layout.** A serpentine of rows of 3 and 4 on an offset lattice.
  Neighbouring stops are 133-157 viewBox units apart at 10, 20 and 30 stops
  (max/min under 1.3, tested).
- **Route.** A centripetal Catmull-Rom spline through the stops, converted to
  cubic beziers, plus one swing point outside each row turn.
- **Variation.** A seeded per-row wave and jitter, identical on every build.
- **Frame.** The map card takes the drawing's own aspect ratio (560x396), so
  there is no empty quadrant.

**Label policy.** The map shows numbers only.

- The active stop gets one label: a pill with a short leader line.
- A hovered stop gets a second label.
- Labels are placed by measurement with `getBBox()`. The candidates are both
  sides of the path's tangent normal, then the compass points and diagonals.
- Each candidate is scored on staying inside the map, staying off other dots,
  the finish flag and the line, and never being nearer another dot than its own.
- Labels are measured on load, on font load and on a width-changing resize,
  then cached. The scroll handler only reads numbers.
- The hover label takes the best candidate clear of the active label, then
  falls back to a push-apart pass, and if nothing fits it waits.

**Stops.**

- Dots are r13 with tabular 12px figures, so 1 and 20 are the same set.
- The active dot scales to 1.4x and gets a halo.
- Scroll dwells briefly on each course's first and last stop.
- The line is drawn exactly to the traveller, so a stop lights as the line
  reaches it.

### Checkpoint 2: segment 2, seam, scenery

**Palettes as tokens (theme-factory).**

- **Tokens.** Components read `--trail-*` only. `--day-*` and `--night-*` map
  onto them per scene, each with light and dark site-theme values.
- **Night survey (chosen).** Built from Midnight Galaxy (deep purple, cosmic
  blue, lavender, silver) with a marigold lamp for the lit route. The scenery
  adds stars kept clear of the route, a bar-chart skyline and a dotted future
  path.
- **Field notes (compared, dropped).** Built from Botanical Garden. It is in
  `trail-r2-field-*` next to `trail-r2-night-*`. A light green map after a light
  blue one read as a recolour, not arriving somewhere else.

**Segment 2.**

- Its rows are `[3, 3, 4]`, so it is a different shape.
- It climbs back up, and its first stop is pinned to Foundations' last.
- Stop 10 has a finish flag, stop 11 a dashed gateway ring and stop 20 a
  finish flag.

**The seam.**

- Both courses get 36vh a stop, with a 60vh seam at 46-54% of the track. That
  is what makes your 45/50/55 screenshots show it.
- My first cross-fade was a grey double exposure at 50%
  (`trail-r2-night-1440-050`). It was replaced with a title card, "Python
  Foundations complete. Next course / Python for Data", that closes over the map
  from 35% to 65% of the seam.
- The head hides during the seam.
- Only the scene's segment has an active stop.
- The outgoing line recedes to 3px as it fades.

### Checkpoint 3: panel

- **Switcher.** A segmented control: two links in a pill track, 8px gap,
  `aria-current`, a 3px focus ring, keyboard operable. It lands on the course's
  first stop and focuses its card.
- **Progress.** "Stop 16 of 20" and the bar sit on their own row under the
  switcher.
- **Numbering.** Map and progress row count stops 1-20. The card badge is the
  course's own unit ("Unit 6", then "Python for Data").
- **Title.** `clamp(1.3rem, 0.9rem + 1.1vw, 1.65rem)`, max 20ch, balanced.
  Meta 0.92rem. No kicker gap.

### Checkpoint 4: mobile

**Proposal and choice: a follow camera onto the same map.**

- **Shrunk desktop layout rejected.** At 390px it renders about 15px dots and
  8px numbers (`trail-r1-390-*`).
- **Behaviour.** Below 560px the frame is a 1.3:1 window. The viewBox becomes a
  330-unit window sitting half a stop behind the traveller.
- **Size.** Dots render about 27px and figures about 13px.
- **What stays.** Same drawing, same stops, same label measurement (fitted into
  the window), same invariants. Screenshots: `trail-r4-cam-390-*`.
- **Vertical rail not built.** It would have been a second geometry and a
  second label system to keep in step.
- **Panel only not built.** It drops the map on the device most people use.

**Compromise:** see "Where it is still weak".

## Verification

**Screenshots (`REVIEW/screenshots/`):**

| Set | Files |
|---|---|
| Final, desktop and phone | `trail-final-{1440,1024,390}-{000,020,045,050,055,080,100}` |
| Final, reduced motion | `trail-final-reduced-{1440,390}-{000,020,045,050,055,080,100}` |
| Hover label | `trail-final-1440-hover` |
| Dark theme | `trail-r3-dark-1440-{020,080}` |
| Before | `trail-r0-{fresh,stale}-*` |

**The invariant spec** is `tests/browser/trail_invariants.py`, written with
webapp-testing. Run it with `npm run test:trail`. Its rules:

1. No two visible labels intersect.
2. Every label is inside the map.
3. Every label's nearest dot is its own.
4. The head is within 2px of the scene path at the current progress.
5. Exactly one card is active, and it is the highest lit stop.
6. Past the seam, a segment 2 stop is lit and has a real box.
7. The active stop is never inside opacity 0, and it has a label and is in
   frame.
8. Label text and the active stop's number meet 4.5:1 contrast (added).

It waits for the header opacity to be `'1'` and the boot overlay to go, and
checks every 5% of the track. At 1440 and 1024 each step is checked a second
time with the pointer on the next stop.

**Results:**

| Run | Result |
|---|---|
| 5%, 1440/1024/390 | PASS |
| 5%, reduced motion, all widths | PASS |
| 5%, dark theme, 1440 | PASS |
| 1% sweep, all widths | PASS |
| `--self-test` (each rule sabotaged on a good page) | all 8 caught |
| Resize mid-scroll 1440 → 390 → 390x700 → 1024 → 390 | no failures |

The spec found four real bugs I then fixed:

- Capstone's label ended up nearest dot 5.
- A pushed hover label ended up nearest dot 6.
- The finish flag scaled with the dot and moved its centre.
- The first camera lost the active stop at a row turn.

**Repo checks:**

| Check | Result |
|---|---|
| `npm test` | 2654 passed. One run had a failure in `checks-data-course.test.js` (a real-Python check, not trail code). It passed alone and on the next full run. |
| `validate:checks`, `validate:skills` | pass |
| `test:a11y` | 0 violations |
| `test:keyboard` | 0/9 |
| `test:motion` | PASS |
| `test:mobile` | 0/34 |
| `test:perf` | PASS: index 51 requests, 819 KB critical, 1437 KB own (1500 budget; was 1415), 313 KB CSS |

**Script cost** (a 1000-step synthetic sweep):

| Width | `setProgress` average | Worst call |
|---|---|---|
| 1440 | 0.6ms | 6.5ms |
| 390 | 0.8ms | 11.4ms |

Measuring labels takes 27ms and runs only on load, font load and
width-changing resizes. Height-only resizes, such as a phone's URL bar
collapsing, re-render from the cache.

**Contrast (rendered colours):**

| Pair | Ratio |
|---|---|
| Day label | 9.6:1 (15.0 in dark theme) |
| Night label | 13.7:1 |
| Hover labels | 10.2:1 and 12.6:1 |
| Active number | 5.9:1 day, 7.9:1 day dark, 8.4:1 night |
| Seam card | 12.6:1 title, 9.4:1 kicker |
| Panel accent text | 5.7:1 day, 7.4:1 night |

## What I could not verify

- **Other browsers and real phones.** Only headless Chromium was used. I didn't
  test Safari (including `:has()` and SVG `transform-box` on the scaled dots),
  Firefox, or iOS URL-bar behaviour with the camera.
- **A screen reader.** The map is `aria-hidden`, and the cards and switcher are
  in the tree and tab order. I did not listen with VoiceOver or NVDA.
- **Production.** Nothing is deployed; the branch is not merged. So I couldn't
  confirm that Vercel serves the `?v=` URLs fresh, though the logic is standard
  query-string cache busting.
- **Signed in.** The lock badge was only checked signed out.

## Where it is still weak

- **Mobile is the compromise.** The phone never shows a whole course at once:
  you see two to four stops and the traveller. The overview only exists on
  wider screens.
- **The seam card hides the map for about 20vh of scroll.** It reads as a
  deliberate beat on desktop. On a phone it's a lot of screen with no map.
- **Hover labels are desktop only.** There is no touch equivalent. The card
  carries the title, but you can't preview a stop's name on a phone.
- **Card titles are still Syne,** the wide display face. Two-line titles like
  "Visualising and Reporting" still make that panel taller than one-line ones.
- **The two maps share the same lattice positions.** The row patterns and wave
  differ, but on a second look you may notice Python for Data is Foundations
  turned over.
- **Other pages still have unversioned asset URLs.** The same stale-HTML/stale-CSS
  mix can happen on any page whose markup changes together with its CSS or JS.
  The trail is now protected; the rest of the site is not.
- **The spec checks every 5% by default.** The 1% sweep passes but takes about
  five minutes, so it is a flag, not the default.
- **On phones the lock badge forces the course name onto a second line** on
  locked units.
