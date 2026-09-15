# Trail repair: round 0, what is actually on screen

Branch `feat/trail-and-copy` at `f672443`, the commit that is live on
mypypath.com. Screenshots: `REVIEW/screenshots/trail-r0-{fresh,stale}-{desktop,mobile}-{010,035,053,072,095}.png`.

## Two different renders of the same page

**Stale** is what the brief describes. It is new `index.html` with the
*previous* `home-path.css` and `path-trail.js`, which a returning visitor gets
from their browser cache. Reproduced by serving those two files from `20a5f66`
through a Playwright route. Every one of these defects appears in
`trail-r0-stale-desktop-072.png`:

- Modules/OOP and Advanced Topics/Testing drawn on top of each other.
- Segment 2 has no dots: the old script takes the first `.path-map__draw` and
  a single `STOP_COUNT` of all 20 stops, so all 20 are placed on the
  Foundations line.
- The head is stranded on segment 1.
- Both jump links are visible as a bare underlined run-on string, and the
  progress bar runs under them. The old CSS has no rules for either.
- There is no scenery change, because the old CSS has none.

**Why a visitor gets that mix.** `index.html` is served
`max-age=0, must-revalidate`. `/assets/(js|css)/*` is served
`max-age=3600, stale-while-revalidate=86400`, from unversioned URLs. So for up
to 25 hours after a previous visit, the browser pairs fresh HTML with stale CSS
and JS. The quoted `STOP_COUNT` / `drawPath` globals are the old file. On the
current branch they are scoped per segment (`segments[].stops`,
`segments[].drawPath`), which is why the fresh render places segment 2's stops.

**Fresh** (`trail-r0-fresh-*`, what a first-time visitor sees) does not have
defects 1, 3, 4, 5, 6, 11 or 12, but it has its own:

- Labels still float with no attachment. "Control Flow" sits below-left of dot
  2, "Capstone" above-left of 10, "Data Structures" between 3 and 4. They have
  no halo, and every label is always shown.
- The Foundations route loops back under itself and leaves the bottom-left
  empty. The map card is taller than the drawing (dead space).
- "10"-"20" are cramped inside `r=14`. At 390px the numbers render at about 7px.
- Numbering is ambiguous: the badge "14" sits next to "Python for Data", but
  that is its unit 4.
- The panel is vertically centred with a large empty gap above the kicker. The
  title wraps and dominates, and the meta row is 0.82rem.
- The label rule is still an index-parity guess
  (`i % 2`, `i % 3`) with per-route hand offsets. Stops are spaced by arc
  length along a hand-authored bezier, not by screen distance.

Both renders get fixed: the first by versioning the trail's CSS and JS URLs,
the second by the redesign.
