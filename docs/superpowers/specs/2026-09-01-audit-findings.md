# Full-site audit findings — 2026-09-01

Findings from a live audit of mypypath.com on 2026-09-01, signed in as the real teacher account,
using browser automation and by reading the deployed source. Preserved here because the plan that
implements the fixes argues from them, and a fix whose reason is lost gets reverted by the next
person who finds it inconvenient.

Each finding states how it was verified. Anything speculative says so.

## How to read the confidence markers

- **Verified live** — observed in a browser against the deployed site.
- **Verified in source** — read directly out of the deployed or working-tree file.
- **Latent** — the code has the shape of a bug, but current behaviour is correct. Fixing it
  requires tests that prove the new behaviour, not just a change.

---

## 1. `persistentLocalCache()` has no tab manager (verified in source)

`assets/js/firebase-config.js` calls `persistentLocalCache()` with no `tabManager`. The deployed
file contains neither `persistentSingleTabManager` nor `persistentMultipleTabManager` nor the
string `tabManager`.

Firebase's documentation: `persistentLocalCache()` defaults to `persistentSingleTabManager()`,
and with single-tab persistence "persistence can only be enabled in one tab at a time."
<https://firebase.google.com/docs/firestore/manage-data/enable-offline>

Consequence, observed in the console on essentially every page in every session for weeks:

```
@firebase/firestore: Error using user provided cache. Falling back to memory cache:
FirebaseError: [code=failed-precondition]: Failed to obtain exclusive access to the
persistence layer.
```

Observed again during this audit on `/units/unit-1/what-is-python.html` and `/classroom.html`.

**When it fires the tab silently drops to a memory-only — empty — cache.** That is precisely the
precondition `assets/js/profile.js` documents at length as the cause of "a real teacher is told
they are a student", the bug that `47533a6` wrote an entire module to work around. The workaround
is good engineering. It was also working around a one-line misconfiguration.

## 2. The dashboard's per-student fan-out (verified in source)

`classroom-dashboard.js:94` maps the roster to one `readEvents` + one `readMirror` per student.
`readEvents` is `limit(max || 500)` and the dashboard passes 500. `readMirror` is an unbounded
`getDocs` over the student's whole progress mirror.

Worst case is therefore `500 + |mirror|` document reads **per student, per dashboard open**.
Spark allows 50,000 reads/day for the whole project across all users. A 50-student class opening
the dashboard twice exhausts everyone's quota for the day.

> The original audit brief attributed `limit(400)` to `readEvents`. That is wrong — the three
> `limit(400)` calls in `classroom-store.js` are in `purgeExpired`, `purgeArchivedClass` and
> `purgeStudent`. The real number is higher than the brief's table, not lower.

`watchRoster()`'s `onSnapshot` keeps the dashboard live, so roster changes can re-trigger the
fan-out within a session.

This is the real answer to "make the teacher view efficient for 30–50 students". It is not
primarily a rendering problem; it is a data-access problem with a direct billing consequence.

## 3. Teacher view at scale (verified live)

50 students × 10 unit columns = 500 cells shown at once with nothing prioritised. No student
search, no roster-level default view, no segment filters, no bulk actions, no per-student due-date
override, no manual grade override, no class rollover. An assignment targeting four lessons
renders all four titles inline as one run-on line.

## 4. Accessibility (measured live with a DOM audit)

- `/units/unit-1/what-is-python.html`: 17 interactive elements smaller than 24×24 CSS px.
- `/classroom.html`: 53.
- Lesson pages skip h2 → h4 repeatedly.
- 6 form controls on the lesson page have no accessible name.
- No automated accessibility check anywhere in CI.

WCAG 2.2 SC 2.5.8 (Target Size, Minimum) requires 24×24 unless spacing exceptions apply.

## 5. Visible UI defects (verified live)

- Homepage boot animation blocks content ~7s, unskippable by scrolling, while `dclMs` was 208ms.
- The "Advanced" label at trail stop 9 is clipped by the trail card's right edge at every viewport.
- Trail cross-fades render outgoing and incoming text overlapping and illegible.
- `/quiz.html` with no quiz selected renders an empty shell — heading, footer, nothing between.
- The footer floats mid-viewport on short pages; no `min-height: 100vh/dvh` layout anywhere.
- Lesson card grids leave ragged left-aligned trailing rows.
- Numbered sub-headings use the display font while sibling headings use the body heading font.

**Not verified:** mobile layouts. The auditor's window resize was blocked by the browser. The CSS
has ~10 distinct max-width breakpoints (600, 768, 900, 920, 980, 1000, 1024, 1120, 1200, 1400)
with no evident system.

## 6. Delivery (verified in source)

- Lesson page: 43 `<script src>` tags. Classroom page: 39. Nine stylesheets per page.
- `style.css` is 104KB with 24 media queries. Two different files appear to be named `main.css`.
- Only `/index.html` has Open Graph tags and a canonical URL. `/quiz.html`, `/certificate.html`,
  `/settings.html`, `/unit-test.html` and the ~80 lesson pages have neither, so a shared lesson
  link previews as nothing.
- `<noscript>` is present on two pages and absent on three; no stated policy.
- No performance budget in CI.

## 7. Correctness (latent, verified in source)

- **Timezones.** `classroom-core.js` contains zero occurrences of `getUTC*`, `toISOString` or
  `Date.UTC`, uses local-date methods, has no end-of-day handling, and never mentions timezones.
  Current behaviour is *correct for a single timezone* — verified live that an assignment due
  Aug 31 read "Overdue" and one due Sep 1 read "Not due yet" at 02:29 EDT on Sep 1. The latent
  failure is a teacher and student in different timezones disagreeing about when work is late.
- **Retention vs. long courses.** Events are deleted after 180 days by rule, and several features
  derive state by replaying events. A year-long course crosses that line.
- **Concurrent teacher edits.** Two co-teachers editing lock mode or assignments at once —
  document-scoped last-write-wins silently discards one of them.
- **Quiz bank coverage.** `568dcad` seeded match/order/blank questions for units 1–3 only. Units
  4–10 have MCQs only, and the teacher-facing picker does not say so.
- **Swallowed errors.** Several boot paths catch into a silent hidden state — the pattern in
  `student-work.js`'s `catch { show(section, false) }`. A silent failure is indistinguishable
  from "you have nothing".
