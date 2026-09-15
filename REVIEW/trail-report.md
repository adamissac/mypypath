# Trail and copy: report

Branch `feat/trail-and-copy`, six commits on top of `main` at `20a5f66`. Not
merged, and `main` was not pushed.

| Commit | What |
|---|---|
| `67924a2` | Checkpoint 0 audit (`REVIEW/trail-audit.md`) and before screenshots |
| `f2ca6d7` | Job A: ten Python for Data blurbs and the course summary |
| `03d798e` | Job B: landing page copy |
| `c9726e9` | Job C1: segment refactor and generator, units 1-10, no visual change |
| `c852781` | The trail map scrolled away on phones and tablets (fix + check) |
| `237d6ea` | Job C2: 20 stops, two segments, dusk scenery for Python for Data |

A small follow-up commit adds this report and `.claude/skills/pypath-trail/`.

## What changed

### Job A: Python for Data copy

- Ten unit blurbs rewritten in `scripts/data-course-unit-{1..10}.cjs`, 10-12
  words each, and each names what the unit uses (plain Python, numpy, pandas):
  e.g. unit 3 "Use numpy arrays to do maths on a whole column at once."
- Course summary in `assets/data/courses.json`: "Load, clean, chart and
  explain real data with Python, numpy and pandas. Units 1 and 2 use plain
  Python."
- Rebuilt with `npm run build:data-course`. Only `data.html` and the ten
  `data/unit-N.html` overview pages changed. The 60 lesson pages are
  byte-identical to before: all 60 still carry their meta description, and
  `validate:checks` passes (159 check files).
- `lesson.summary` kept everywhere.
- Ribbon overlap on `/data.html` fixed: the unit number ribbon sat on long
  titles. Titles on a card with a ribbon now get right padding
  (`pypath-theme.css`).

### Job B: landing page

| | Before | After | Brief's limit |
|---|---|---|---|
| Hero lead | 52 words | 21 | under 25 |
| Trail intro | 32 | 15 | under 18 |
| End CTA | 13 | 7 | under 10 |
| Words in `<main>` outside the trail | 203 | 140 | |
| Em dashes in `<main>` | 9 | 0 | 0 |

Each claim now appears once: free, nothing to install, and exercises checked
as you go. The meta description and og:description no longer say "a 10-unit
trail" and have no em dash. The header and footer were not touched (the baked
footer still has its own em dash).

### Job C: the trail

- **Generated.** `scripts/build-trail.mjs` writes everything between
  `trail:begin` and `trail:end` in `index.html` from `courses.json` (new
  per-unit fields: `label`, `blurb`, `hours`, `level`). `--check` fails when
  the page is stale, and so does `tests/home-trail.test.js`.
- **Segments.** `assets/js/path-trail.js` reads one `<svg data-segment>` per
  course, with its own span and seam. Overall progress is split across
  segments by those budgets. Stops are still placed by arc length.
- **Numbering.** Stops and cards show 1-20. Stops 11-20 link to each Data
  unit's `first` lesson (`/data/unit-1/what-is-data-analysis.html` and so on).
  Tests check that no link is built from a stop number.
- **Scroll length.** Foundations gets 40vh a stop (span 400), then a 30vh
  seam, then Python for Data at 32vh a stop (span 320). The track is 850vh
  (779vh on phones). The seam runs from 53.3% to 57.3% of the track.
- **Jump link.** The panel shows "Jump to Python for Data" in scene 1 and
  "Back to Python Foundations" in scene 2. It moves the page to the first stop
  of that course and focus to its first card.
- **Scenery.** I built two options with the frontend-design skill and
  screenshotted both at the same scroll points:
  - Option A, graph paper: `trail-c2-optA-*`.
  - Option B, dusk: `trail-c2-optB-*`.

  I kept dusk. It has a violet sky, plotted points as stars, a bar chart as
  the skyline and an amber line. Graph paper in pale green next to a pale blue
  map read as a recolour, not a change of scenery.
  - Across the seam, the sky and frame fade in with scroll. The two maps
    overlap only in the middle 20% of the seam. The traveller head is hidden
    during the seam.
  - The panel accent switches with the scene. Dark theme has its own values.
- **Mobile.** Two changes:
  - **The sticky bug.** Below 980px the sticky viewport did not stick, so the
    middle of the trail was a blank screen on phones. That was already broken
    before this branch; see "What the brief got wrong".
  - **Layout.** At 900px and below, the map and card are now centred as a
    pair. Before, a stretched grid row left empty bands around the map and
    pushed the card's button below the fold at 390x844.

  On phones the map is `min(40vh, 300px)` and the card is tighter. Map labels
  stay hidden at 900px and below, as before.
- **Reduced motion.**
  - With one segment, nothing changes from before.
  - With two, both lines are drawn in full and all 20 stops are lit. Scrolling
    switches the scene and the card for the stop you have reached in single
    steps, with no fades. So a reduced-motion visitor can still reach all 20
    units.
- **Keyboard and screen readers.** The map stays `aria-hidden`.
  - All 20 cards stay in the accessibility tree and the tab order. Focusing a
    card that isn't showing scrolls the trail to its stop and shows that card.
  - A Tab walk at 1280 and 390, with and without reduced motion, reached cards
    1-20 in order. Each one was the visible card when it had focus, then focus
    moved on to the next section.
- **Also fixed on the way:**
  - The rule hiding the head lost to `.path-journey.is-active .path-head`, so
    the head never hid.
  - Foundations stop 9's label ran off the map ("Advancec").
  - `gate.js` only badged cards linking to `/units/`. It now uses
    `COURSE_ROOTS`, so Data cards get the same "Account required" badge on the
    trail (stops 13-20 when signed out). `/data.html` now marks the same 8
    cards as `/curriculum.html`. On both course pages the badge sits under the
    unit ribbon and is not visible (`trail-c2-gate-*`). That was already true
    on the Foundations page and is left as it was.

## Verification

Screenshots are in `REVIEW/screenshots/`. Each one was taken after the header
reached opacity 1 and the boot intro finished. Scrolling used
`behavior: "instant"`.

| Set | Files |
|---|---|
| Before | `trail-c0-before-*` |
| C1, no regression | `trail-c1-*`: map pixel diff against c0 only shows the head's pulse phase |
| Sticky fix | `trail-c1b-mobile-*` |
| Final, desktop 1280x900 and 390x844 | `trail-c2-{desktop,mobile}-{000,025,049,051,053.3,055.3,057.3,075,100}` |
| Reduced motion | `trail-c2-reduced-{desktop,mobile}-{000,025,055.3,057.3,075,100}` |
| Dark theme | `trail-c2-dark-desktop-{025,055.3,080}` |
| Jump link | `trail-c2-jump-*`, `trail-c2-reduced-jump-*` |
| Scenery options | `trail-c2-optA-*`, `trail-c2-optB-*` |
| Data copy | `trail-a-after-*`, `trail-c2-gate-*` |

`053.3` is Foundations' last stop, `055.3` is the seam's midpoint and `057.3`
is Python for Data's first stop.

Logged state at each point, the same at both widths:

| Track | Scene | Lit | Card | Link |
|---|---|---|---|---|
| 0% | 1 | 1 | 1 | /units/unit-1/what-is-python.html |
| 25% | 1 | 5 | 5 | /units/unit-5/what-are-modules.html |
| 49% / 51% | 1 | 9 | 9 | /units/unit-9/... |
| 53.3% | 1 | 10 | 10 | /units/unit-10/... |
| 55.3% (seam) | 1 | 10 | 10 | head hidden, `--seam` 0.49 |
| 57.3% | 2 | 10 | 11 | /data/unit-1/what-is-data-analysis.html |
| 75% | 2 | 14 | 14 | /data/unit-4/the-series.html |
| 100% | 2 | 20 | 20 | /data/unit-10/choosing-a-chart.html |

Sticky top was 117-118px at every point at both widths.

Scripts (all run after the last change):

| Check | Result |
|---|---|
| `npm test` | 2644 passed |
| `npm run validate:checks` | 159 check files valid |
| `node scripts/build-trail.mjs --check` | up to date |
| `npm run test:a11y` | 0 axe violations, 0 small targets |
| axe on the trail scrolled to 25% and 80%, light and dark, 1280 and 390 | 0 violations |
| `npm run test:keyboard` | 0 of 9 pages; index 46 of 46 reached |
| `npm run test:motion` | PASS |
| `npm run test:mobile` | 0 of 34, now including the new sticky check |
| `npm run test:perf` | PASS. Index 51 requests, critical 796 KB, own 1415 KB (baseline 1382), CSS 307 KB |

Two checks changed, and each change is explained in the check itself:

- `verify-mobile.mjs` now scrolls to the middle of any sticky trail and fails
  (UNSTUCK) if the viewport is not pinned. With the fix reverted it fails
  (phone -514px, tablet -454px). With the fix in place it passes.
- `verify-keyboard.mjs` identified the focused element by class and position
  only. Stacked cards share both, so Tab from card 1 to card 2 was reported as
  a trap. The key now also includes href and text. A real trap, where focus
  stays on the same element, still has an unchanged key.
- `tests/page-meta.test.js` pinned the old homepage description text. It now
  pins the new text, and still checks the same thing: the hand-written tags
  are there and not generated.

## What I could not verify

- **Real devices and other engines.** Every run was headless Chromium.
  - iOS Safari's changing `vh` when the URL bar collapses could shift where
    stops light.
  - `:has()` (used for the all-cards-focusable rule and on `/data.html`) needs
    Safari 15.4+ or Firefox 121+. In an older browser, inactive cards stay
    `visibility: hidden`, as they were before this branch.
- **A screen reader.** I checked the accessibility tree and tab order, not
  VoiceOver or NVDA output. The panel was `aria-live="polite"` and is now a
  labelled `<aside>`. With 20 cards always in the tree, a live region would
  have been chatty and announced nothing useful, so I removed it. That is a
  judgment call, not something I tested with a listener.
- **Production.** Nothing is deployed, because the branch isn't merged. The
  Vercel cache question doesn't apply yet. Every run served the working tree
  from disk.
- **The badge when signed in.** The widened `gate.js` selector was only
  screenshotted signed out.
- **Without JavaScript.** Only card 1 shows and the jump links are hidden,
  which is the same as before. I didn't screenshot it.

## What the brief got wrong

1. **The Data lesson meta wall was already gone.** It was removed in `0080a22`
   on 2026-09-14. The brief's snippet predates that.
2. **Line numbers and file names had moved.** `data-course-units-3-6.cjs` and
   the others no longer exist; each unit now has its own module. See the audit
   table.
3. **Six of the ten blurbs had already been rewritten.** All ten were still
   rewritten, to the brief's rules.
4. **The trail on phones was broken, not just crowded.** Below 980px,
   `style.css` sets `overflow-x: hidden !important` on html, body and main.
   That turns `main` into a scroll container, so the trail's sticky viewport
   pinned to an element that never scrolls. At 390px the map was off screen
   (sticky top -788px) for most of the track. This had to be fixed before any
   mobile treatment could be judged.
5. **The 49% and 51% screenshots assume the seam is at 50%.** It isn't, at the
   pacing the brief also asked for (40vh a stop, the second segment faster).
   It sits at 53-57%, so the seam screenshots were taken at its real
   positions as well.
6. **`courses.json` had no card data** (hours, level, blurb, label). The trail
   couldn't be generated from it without adding those fields.
7. **The lock badge would not have followed the new cards.** `gate.js` only
   matched `/units/unit-` links.
8. **"Keyboard reachability of all units" couldn't hold with the existing card
   CSS.** Inactive cards were `visibility: hidden`, so neither Tab nor a
   screen reader could reach them, even on the old ten-stop trail.

## Open for the reviewer

- Tabbing through the trail is 20 tab stops. The jump link skips half of them,
  but there is no "skip the trail" link. Add one if 20 stops is too many.
- In the middle of the seam, both scenes are faint over a lavender-grey blend
  (`trail-c2-desktop-055.3`). It lasts 30vh of scroll and reads as a
  transition, but it is the least polished frame.
