# Trail and copy: checkpoint 0 audit

Branch `feat/trail-and-copy`, cut from `main` at `20a5f66`. Nothing changed
except this file and the before screenshots.

## Job A: the Data unit pages

**The lesson-row wall is already gone.** It was fixed on 2026-09-14 in
`0080a22` ("Data unit pages lay out their lessons..."). `data/unit-3.html` now
renders exactly like Foundations:

```html
<li><a class="route" href="/data/unit-3/why-arrays-beat-lists.html">1. Why Arrays Beat Lists</a></li>
```

There are 0 `lesson-list__meta` occurrences in the repo or on mypypath.com. The
snippet in the brief is from before that change. See
`trail-c0-before-data-unit-3.png`.

**The file references have moved:**

| Brief says | Now |
|---|---|
| `build-data-course.cjs` line 129 renders the meta | line ~343: `.unit-lesson-list`, title only |
| lines 140 / 175 render `blurb` | line 368 (unit page), line 415 (`/data.html` card) |
| `data-course-units-3-6.cjs`, `-5-7`, `-8-10` | deleted; one file per unit, `scripts/data-course-unit-1.cjs` to `-10.cjs` |
| `summary` used at 129 / 208 / 226 | line 301 (lesson Overview card), 449 (`<meta name="description">`), 470 (check prompt, only when an exercise has no title; all 120 have one) |

The warning stands: `summary` must stay, because it is the meta description
and the Overview card text.

**Six of the ten blurbs in the table were already rewritten.** Current state:

| # | Blurb now | Words |
|---|---|---|
| 1 | Rows, records, files and summaries, using nothing but the standard library. | 11 |
| 2 | Missing values, wrong types, duplicates and the order you fix them in. | 12 |
| 3 | One type, one block of memory, and arithmetic that applies to everything at once. | 14 |
| 4 | The two pandas objects, and the labels that make them different from arrays. | 13 |
| 5 | Separators, missing markers, the columns you keep, and checking what arrived. | 11 |
| 6 | Selecting the rows you meant, and building the column that answers the question. | 13 |
| 7 | Split the table by a key, summarise each piece, and put the answers back together. | 15 |
| 8 | Stacking, joining and reshaping, with the checks that keep a join honest. | 12 |
| 9 | Parsing dates, grouping by period, smoothing, and measuring change. | 9 |
| 10 | The chart the question asks for, and the write-up that survives a reader. | 13 |

They are still riddle-ish (3, 4, 6, 8, 10 especially), so Job A's rewrite is
still needed. The course summary is 27 words, as the brief says.

**Found, not in the brief:** on `/data.html` the corner number ribbon covers
the end of card titles ("Data in Plain Pytho", "Filtering and Derivin"). See
`trail-c0-before-data-course.png`.

## Job B: landing page

Measured the same way, over `<main>` with scripts removed:

- **435 words** (the brief says 410) and **24 paragraphs** carrying **311
  words** (brief: 308).
- **Hero paragraph: 52 words** (brief: 50).
- **Trail intro: 32 words.** It already says "Python for Data picks up where it
  ends".
- **CTA: 13 words.**
- **9 em dashes inside `<main>`**, 15 in the whole file.

The repeated claims are as described. "No install" appears twice (the practice
section's "No install, no setup" and the CTA's "Nothing to install"). "Ten
units" appears in the hero, the trail intro and the CTA.

## Job C: the trail

Confirmed:
- `path-trail.js` is 153 lines, with `placeStopsOnPath()`, `setProgress()`,
  `measure()` from `track.offsetHeight - innerHeight`, and the reduced-motion
  branch at line 123 (progress 1, all lit, last card active, return). Scroll
  listeners are on window, body and documentElement (lines 141-143).
- `home-path.css` is 1,360 lines. `.path-journey__track` is `520vh`, the
  `@media (max-width: 900px)` map height is `min(52vh, 420px)`, and there is
  also `@media (max-width: 560px)` with track `480vh`, map `min(46vh, 340px)`,
  and stop labels hidden.
- 10 `g.g-stop` and 10 `article[data-stop-card]`, hand-written.

**Wrong in the brief: mobile is broken today, not just crowded.** At 390px
the "sticky" viewport does not stick. Measured `.path-journey__sticky`
top as the track scrolls:

| Track | 390px wide | 1280px wide |
|---|---|---|
| 0% | 65 | 118 |
| 25% | -788 | 118 |
| 50% | -1591 | 118 |
| 100% | -3198 | 118 |

So on a phone the map scrolls away and about 80% of the 480vh track is a
blank screen while progress keeps advancing. See
`trail-c0-before-mobile-050.png`.

The cause is the cascade trap CLAUDE.md already describes. `style.css`'s
`@media (max-width: 980px)` block sets `overflow-x: hidden !important` on
`html`, `body` and `main`. That makes `main` a scroll container (computed
`overflow-y: auto`), and a sticky element sticks to its nearest scroll
container. `home-path.css` fixes this for desktop with `overflow-x: clip` on
`html`/`body`, but it has no `!important`, does not cover `main`, and loses
at 980px and below. Tablets between 900px and 980px are affected too. Job C
has to fix this before any mobile design decision means anything.

**The card copy has no source in `courses.json`.** Its units carry only
`n`, `title` and `first`. The ten card blurbs ("Syntax, variables, and I/O —
...") and the hours/level meta exist only in `index.html`. The "Account
required" badge is added at runtime. A generator therefore needs
`courses.json` extended with `blurb`, `hours` and `level` per unit, or a
separate data file. For Data units 1-10 the blurb can come from the data
course content modules, which is Job A's rewritten text, so the two stay in
sync.

**Perf headroom is tight.** `/index.html` today uses 51 of 70 requests,
764 of 1,000 KB critical, 1,382 of 1,500 KB own, and 300 of 420 KB CSS.
Only 118 KB of own weight is left for the second segment's markup, CSS and
any scenery art.

## Screenshots

`REVIEW/screenshots/trail-c0-before-*`:
- `data-unit-3.png`, `data-course.png`
- `desktop-000/025/050/075/100.png`, `mobile-000/025/050/075/100.png`
