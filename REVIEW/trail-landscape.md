# MyPyPath: mountain and lunar learning trails

## Final behavior

- Foundations keeps the blue palette, a mountain hero, and quiet mountain/pine
  landmarks around stops 1–10.
- Scrolling beyond stop 10 asks “Yes, explore space” or “Stay on Foundations.”
  Escape stays on Foundations. Declining does not repeatedly reopen the dialog;
  the Data tab or keyboard entry can offer it again. Approval lasts for the page
  visit and lands on stop 11. This does not complete or unlock any lessons.
- Data uses purple/gold, moon/planet/rocket details, and sparse stars around
  stops 11–20. Its refined hero moon has craters, solid rock facets, an expedition
  ribbon, a mission flag, and a satellite. No gradients were added; the trail
  and hero backdrops use solid colors.
- Only one hero scene is mounted at a time. Data removes the mountain image and
  canvas from the DOM; Foundations restores the existing mountain. Hidden 3D
  animation stops, and the optional library loads after DOMContentLoaded.
- The Data palette and purple/yellow logo carry into shared pages. Entering
  Foundations restores blue. Light/dark mode remains an independent preference.

## Implementation

- `scripts/build-trail.mjs`: reusable scenery and confirmation markup, generated
  into `index.html`; original route coordinates and stop mechanics retained.
- `assets/css/home-path.css`: terrain/detail tokens, flat surfaces, current-node
  ring, frame shadow, dialog, and accessible switcher text.
- `assets/js/path-trail.js`: confirmation and persistent course selection, with
  focus-restoration protection when closing the dialog.
- `assets/js/theme-init.js`, `assets/css/pypath-theme.css`, and
  `assets/img/pyPathLogo-data.png`: course-aware shared palette and logo.
- `scripts/build-moon.mjs` → `assets/img/data-moon.svg`: editable vector artwork.
- `assets/js/summit-3d.js`: mutually exclusive mountain/moon mounting and safe
  deferred loading of the mountain renderer.
- `scripts/bake_layout.py --version-course-assets`: versions shared CSS/theme
  initialization URLs across 198 production HTML pages. Those page edits change
  asset URLs only. The trail builder also versions its scene assets.
- `tests/course-theme.test.js`, `tests/browser/trail_transition.mjs`,
  `tests/browser/trail_invariants.py`, and `scripts/verify-keyboard.mjs`: theme,
  confirmation, scene exclusivity, geometry, and keyboard coverage.

No dependencies were added. Lesson content, links, progress, locks, auth,
Firestore rules, and the overall page layout were preserved.

## Palette and user decision

The user approved purple/gold across the website while using Data, including
entry directly into that course. The existing palette originates in
`home-path.css` (`--night-*`) and `pypath-theme.css`
(`html[data-course="data"]`): deep purple `#2b1e3e`, gold `#f9a620`, lavender
`#a490c2`, and pale lavender `#e6e6fa`. The moon uses matching solid lavender
facets. Foundations remains blue.

## Verification

- 24 focused trail/theme unit tests passed.
- Desktop and mobile confirmation tests passed: decline, Escape, retry,
  keyboard entry, acceptance, and theme changes.
- Exclusive scene tests passed in reduced-motion and animated modes: no mountain
  image/canvas remains mounted during Data; returning restores one scene.
- All 20 mobile nodes selected the correct cards after acceptance.
- Light/dark trail geometry sweeps passed: 21 positions at 1440, 1024, and 390px.
- Full accessibility audit and desktop/dark-mobile dialog checks: zero violations.
- Mobile: 34 page/viewport combinations clear; keyboard: 9 pages clear.
- Reduced-motion and performance budgets passed.
- Shared-asset versions validated on all 198 production pages; the versioning
  command is idempotent. Generator freshness, syntax and diff checks passed.

Final full unit suite: 99 test files passed, 2,658 tests passed.

## Screenshots and release

`REVIEW/screenshots/moon-refined.png` shows the final moon. Other screenshots
record the baseline, trail revisions, confirmation dialog, and mobile/dark QA.

Release target: `main` → Vercel production at https://mypypath.com/.
