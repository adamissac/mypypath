# Full-Site Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the seven classes of defect found in the 2026-09-01 live audit of mypypath.com —
from a one-line Firestore cache misconfiguration that has been corrupting role reads for weeks,
through a dashboard read pattern that would exhaust the project's free Firestore quota on the
first real classroom, to accessibility, UI, architecture and correctness debt.

**Architecture:** Seven phases, ~50 independently revertable commits, executed in order because
each phase's findings depend on the one before it (Phase 2's summary documents are also the fix
for Phase 7's retention-expiry problem; Phase 1's cache fix is what makes Phase 2's read
measurements meaningful). Static site, no build step today — Phase 6 decides explicitly whether
that stays true.

**Tech Stack:** Plain HTML/CSS/ES modules, Firebase Auth + Firestore (SDK 11.1.0, loaded from
gstatic at runtime), Vitest + jsdom for unit tests, `@firebase/rules-unit-testing` against the
Firestore emulator for rules tests, Playwright (Python) for browser verification, Vercel for
site deploys.

**Spec:** The audit brief itself (reproduced in `docs/superpowers/specs/2026-09-01-audit-findings.md`),
plus two design docs written during execution:
- `docs/superpowers/specs/2026-09-01-roster-summary-design.md` (Phase 2 — data model change)
- `docs/superpowers/specs/2026-09-01-due-dates-and-timezones-design.md` (Phase 7 — data model change)

## Global Constraints

- Firebase JS SDK is pinned at `11.1.0` in `assets/js/firebase-config.js` (`SDK_VERSION`). Any
  API used must exist in that version.
- **No Cloud Functions.** The owner declined the Blaze plan. Every write is made by a client
  under its own credentials and is constrained only by `firestore.rules`. Anything a module
  appears to guarantee that the rules do not is not guaranteed — say so in that register.
- **Firestore Spark plan: 50,000 document reads per day for the whole project, across all
  users.** This is the budget Phase 2 is defending.
- **`firestore.rules` changes are not finished at the commit.** Per `CLAUDE.md`, the deploy
  (`npx firebase deploy --only firestore:rules`) is the owner's to run. Any commit touching that
  file must say so loudly in its message, and the final report must state whether a deploy is
  outstanding.
- Zero runtime dependencies is a deliberate, defended history (see the header of
  `assets/js/classroom-export.js` and the `xlsx-writer.js` decision). Reversing it is allowed but
  must be a stated choice in the commit message, not an accident. Dev dependencies (test tooling,
  a build step) are a separate and lower bar.
- Display names are usernames, never legal names. The rules enforce `noRealNames()` on roster
  documents; anything new written there inherits that constraint.
- Retention: student events are deleted after 180 days by rule.
- One logical change per commit, independently revertable, tests where testable.
  `npm test` and `npm run test:rules` both green before every push. Push in batches by phase.
- Honest register: where a client-side guarantee is not actually enforceable, say what a
  determined student could still forge, in the same voice as the existing
  `maxTestAttempts` / show-solutions / sequential-unlock notes.

---

## File Structure

New files this plan creates:

| File | Responsibility |
|---|---|
| `docs/superpowers/specs/2026-09-01-audit-findings.md` | The verified findings, preserved |
| `docs/superpowers/specs/2026-09-01-roster-summary-design.md` | Phase 2 data model |
| `docs/superpowers/specs/2026-09-01-due-dates-and-timezones-design.md` | Phase 7 data model |
| `assets/js/roster-summary.js` | Read/write the per-student summary document |
| `assets/js/read-counter.js` | Dev-only Firestore read instrumentation |
| `scripts/verify-multi-tab-cache.py` | Phase 1 regression guard (3 cold tabs, no failed-precondition) |
| `scripts/measure-profile-wait.py` | Phase 1 re-measurement of the `SERVER_WAIT_MS` distribution |
| `scripts/measure-dashboard-reads.mjs` | Phase 2 before/after read count on a seeded 30-student class |
| `scripts/backfill-roster-summaries.mjs` | Phase 2 one-time idempotent backfill |
| `scripts/audit-a11y.mjs` | Phase 4 axe-core run, wired into CI |
| `scripts/build-meta.js` | Phase 6 generated `og:`/`twitter:`/canonical tags |
| `tests/role-reader-discipline.test.js` | Fails if a new direct role `getDoc(users/…)` appears |
| `tests/roster-summary.test.js` | Summary shape, ratchet property, fallback |
| `tests/due-dates-tz.test.js` | Due-date boundary behaviour across timezones |

Files most heavily modified: `assets/js/firebase-config.js`, `assets/js/profile.js`,
`assets/js/classroom-dashboard.js`, `assets/js/classroom-store.js`, `assets/js/classroom-core.js`,
`firestore.rules`, `assets/css/*`, and the layout baker `scripts/bake_layout.py`.

---

# PHASE 1 — The cache misconfiguration behind a class of bugs (commits 1–6)

**Finding, verified in the working tree:** `assets/js/firebase-config.js` calls
`persistentLocalCache()` with no `tabManager` option. Firebase's documentation states this
defaults to `persistentSingleTabManager()`, under which "persistence can only be enabled in one
tab at a time." A second tab therefore fails to take the lock, logs
`failed-precondition: Failed to obtain exclusive access to the persistence layer`, and **silently
drops to a memory-only — i.e. empty — cache.** That empty cache is the exact precondition
`profile.js` documents at length as the cause of "a real teacher is told they are a student".

- [ ] **Task 1: Switch to multi-tab persistence**
  - Confirm against the SDK 11.1.0 docs that `persistentMultipleTabManager` is exported from
    `firebase-firestore.js` and takes no arguments.
  - `assets/js/firebase-config.js`: import `persistentMultipleTabManager`, pass
    `persistentLocalCache({ tabManager: persistentMultipleTabManager() })`.
  - Replace the "Offline persistence" comment with one that says *why multi-tab*, not just that
    it is on.
  - Test: `tests/smoke.test.js` sibling asserting the config source names a tab manager.
  - Commit: `fix: multi-tab persistence, the missing tabManager behind the cache warning`

- [ ] **Task 2: A regression guard for the warning itself**
  - `scripts/verify-multi-tab-cache.py`, modelled on `scripts/verify-fresh-role.py` (same
    emulator harness, same static server, same Playwright shape).
  - Open **three** tabs cold on `/classroom.html` and a lesson page simultaneously; collect
    console messages from every tab; assert none contains `failed-precondition` or
    `Failed to obtain exclusive access`.
  - Must be confirmed to *catch* the bug: revert Task 1, re-run, see it fail, restore.
  - Commit: `test: three cold tabs must not fall back to a memory cache`

- [ ] **Task 3: Re-measure `SERVER_WAIT_MS` with persistence actually working**
  - `scripts/measure-profile-wait.py`: N cold multi-tab trials, record time from auth to
    resolved profile, print the distribution (min/median/p95/max).
  - The 20000ms constant was documented as an untunable guess because the multi-tab harness gave
    bimodal results (0.2s or 20s+). If the distribution collapses, lower the constant to a
    defensible multiple of p95 and put the measured numbers in the commit message. If it does
    not collapse, say so and leave the constant alone.
  - Commit: `perf: retune SERVER_WAIT_MS against a measured distribution` (or
    `docs: SERVER_WAIT_MS stands — here is the measurement`)

- [ ] **Task 4: Re-examine, do not delete, profile.js's defensive machinery**
  - Multi-tab persistence removes the *main* trigger, not the possibility of a cold cache: first
    visit, cleared storage, private browsing, and storage-partitioned embeds all still produce
    one. **Keep** the invariant "never decide a role from a snapshot with pending local writes."
  - Simplify only what is now provably dead, and prove it before removing it.
  - The long header comment is an asset; update it to say the single-tab fallback is no longer
    the common path, without deleting the account of why the invariant exists.
  - Commit: `refactor: profile.js keeps its invariant, loses only what is now dead`

- [ ] **Task 5: Hold every role reader to the shared reader**
  - Confirm `classroom-page.js`, `classroom-dashboard.js`, `account-class.js`,
    `classroom-store.js`'s `classesFor`, and `role-nav.js` all route through `profile.js`.
  - `tests/role-reader-discipline.test.js`: scan `assets/js/*.js`, fail if any file other than
    `profile.js` contains a `getDoc`/`getDocFromServer` against a `users/…` path. Allowlist by
    exception with a comment, never silently.
  - Commit: `test: one role reader, enforced`

- [ ] **Task 6: Write the finding into CLAUDE.md**
  - One short paragraph: the cache is multi-tab; why; and that a `failed-precondition`
    persistence warning in the console is a regression, not background noise. It was treated as
    ambient for weeks.
  - Commit: `docs: the persistence warning is a regression, not background noise`

---

# PHASE 2 — The dashboard will not survive a real class (commits 7–14)

**Finding, verified in the working tree — and worse than the audit brief stated.**
`classroom-dashboard.js:94-103` fans out one async read pair per student:

```js
Promise.all(roster.map(async (row) => ({
  events: await readEvents(classId, row.uid, 500).catch(() => []),
  mirror: await readMirror(classId, row.uid).catch(() => ({})),
  …
})))
```

The brief attributed `limit(400)` to `readEvents`. It is not: the three `limit(400)` calls in
`classroom-store.js` are in `purgeExpired`, `purgeArchivedClass` and `purgeStudent`.
`readEvents` is `limit(max || 500)` and the dashboard passes **500**. `readMirror` is an
**unbounded** `getDocs` over the whole progress mirror collection. So the true worst case is
**500 + |mirror| reads per student**, where the mirror grows with every syncable progress key a
student writes across ~80 lessons.

| Class size | Reads per dashboard open (worst case, events alone) |
|---|---|
| 1 student | ~501 |
| 30 students | ~15,030 |
| 50 students | ~25,050 |

Spark allows 50,000 reads/day **for the whole project, across all users**. One teacher with a
50-student class opening the dashboard twice exhausts everyone's quota for the day.

- [ ] **Task 7: Write the spec first — this changes the data model**
  - `docs/superpowers/specs/2026-09-01-roster-summary-design.md`.
  - Proposal: one precomputed summary document per student per class,
    `classes/{classId}/roster/{uid}/summary/current`, holding exactly what the roster grid
    renders — per-unit state, overall percent, last active, best test scores, assignment
    completion, certificate state, `schemaVersion`, `updatedAt`.
  - Must argue: what it contains; who writes it and when; the ratchet property; what happens
    when it disagrees with the event log (event log wins, summary is a cache — and a teacher
    must have a way to force a rebuild); and what a determined student can forge.
  - Commit: `docs: spec for the per-student roster summary`

- [ ] **Task 8: Instrument before optimising**
  - `assets/js/read-counter.js` — dev-only, activated by a query flag or localStorage key, wraps
    the store's read entry points and counts documents returned.
  - `scripts/measure-dashboard-reads.mjs` — seeds a 30-student class into the emulator (reuse
    `scripts/seed-classroom.mjs`) and reports reads per dashboard load.
  - Record the real baseline number. Optimising without a baseline is how you end up unable to
    prove the fix worked.
  - Commit: `test: count the reads a dashboard load actually costs`

- [ ] **Task 9: Decide who writes the summary, and constrain it in rules**
  - No Cloud Functions ⇒ client-written by the student. `firestore.rules` must scope the summary
    to its owner, cap its size and key set, and sanity-check what it can (percent within 0..100,
    unit count within the curriculum's range, `updatedAt == request.time`).
  - **⚠ This task changes `firestore.rules` — deploy is outstanding until the owner runs it.**
  - Document precisely what a student can still forge (they can claim any score the range
    permits) in the honest register the repo already uses. The event log remains the audit trail.
  - Commit: `rules: a student owns their summary, within bounds (RULES CHANGE — deploy needed)`

- [ ] **Task 10: Implement the summary write path**
  - Write in the same places progress is already recorded (`events.js` / `lesson-progress.js` /
    `unit-test-page.js` sinks), through a new `assets/js/roster-summary.js`.
  - Preserve the ratchet: a summary never regresses a best score.
  - Debounce so a lesson does not write the summary on every keystroke-level event.
  - Commit: `feat: students maintain their own roster summary as they work`

- [ ] **Task 11: Backfill summaries for existing students**
  - `scripts/backfill-roster-summaries.mjs` — idempotent, logs what it changed, safe to re-run.
  - Same lesson as the `assignmentUnlocks` backfill: do not leave correctness waiting on a
    teacher happening to open a page.
  - Commit: `tooling: backfill roster summaries for students already enrolled`

- [ ] **Task 12: Switch the dashboard to read summaries**
  - Read `summary/current` per student; fall back to the old event-replay path **only** when the
    summary is missing, so nothing breaks during rollout.
  - Commit: `perf: the dashboard reads summaries, not five hundred events per student`

- [ ] **Task 13: Re-measure and prove it**
  - Same counter, same seeded 30-student class. Target: one read per student, not 501.
  - The measured before/after goes in the commit message and the final report.
  - Commit: `perf: 30-student dashboard, N reads before / M after`

- [ ] **Task 14: Bound the live listener**
  - Confirm `watchRoster()` does not re-trigger the expensive path on every roster change, and
    that a dashboard left open all day does not accumulate reads. Report what you found even if
    it is already fine.
  - Commit: `perf: watchRoster does not re-fan-out` (or `docs: watchRoster is already bounded`)

---

# PHASE 3 — Teacher view usability at 30–50 students (commits 15–22)

Separate from Phase 2's cost problem. At 50 rows the mastery grid is 50 × 10 = 500 cells shown
at once with nothing prioritised — the "data eyeball attack". Google Classroom's answer is to
separate class-level analytics from a per-student drill-down. **Check `assets/js/student-detail.js`
first — it exists and may already be most of the drill-down.** Use `.claude/skills/frontend-design`
and verify in a real browser with `.claude/skills/webapp-testing`.

- [ ] **Task 15: Student picker / search** — jump to one student's full detail (per-unit progress,
      real test scores, submissions, quiz results, certificate state).
      Commit: `feat: find one student without reading the whole grid`
- [ ] **Task 16: A scannable roster as the default view** — one row per student; high-signal
      columns (overall %, units complete vs assigned, latest test score, last active, flags);
      sortable; click-through to detail. The full mastery grid stays reachable as an alternate
      view, not the default at scale.
      Commit: `feat: a roster you can scan, with the grid one click away`
- [ ] **Task 17: Filter / segment controls** — "needs attention", "overdue", "not started",
      "inactive 7+ days". The teacher's real question is "who is stuck", not "show me everything".
      Commit: `feat: filter the roster by the question a teacher is actually asking`
- [ ] **Task 18: Assignment card density** — verified live: an assignment targeting four lessons
      renders every title inline as one run-on line. Collapse to a count with a disclosure.
      Commit: `fix: an assignment card states a count, not four titles in a row`
- [ ] **Task 19: Bulk actions** — assign the same work to several classes at once; duplicate an
      assignment. Standard in every LMS, absent here.
      Commit: `feat: assign to several classes, and duplicate an assignment`
- [ ] **Task 20: Per-student due-date override / extension** — absent, and genuinely important:
      IEP/504 accommodations mean extended time. Without it PyPath cannot honestly be used as a
      graded system in a US public school.
      Commit: `feat: a per-student due date, for the students who are owed one`
- [ ] **Task 21: Manual grade override with an audit trail** — a teacher must be able to correct
      a score, and the record must show it was teacher-adjusted rather than silently rewritten.
      This is what "evidence for a conversation, not a grade" requires.
      Commit: `feat: a teacher may correct a score, and the record says who did`
- [ ] **Task 22: Class rollover** — duplicate a class (settings, assignments, lock mode) into a
      new term without its roster. Archive exists; rollover does not, and every teacher needs it
      in August.
      Commit: `feat: roll a class into a new term without its roster`

---

# PHASE 4 — Accessibility (commits 23–30)

Measured live with a DOM audit on the deployed pages.

- [ ] **Task 23: Tap targets** — `/units/unit-1/what-is-python.html`: 17 interactive elements
      below 24×24 CSS px. `/classroom.html`: 53. WCAG 2.2 SC 2.5.8 requires 24×24 unless a
      spacing exception applies. Fix at the component level, not element by element.
      Commit: `fix: interactive targets meet WCAG 2.2 minimum size`
- [ ] **Task 24: Heading order** — the lesson page skips h2 → h4 repeatedly. Fix the hierarchy.
      Do **not** fix it by restyling an h3 to look like an h4.
      Commit: `fix: lesson headings descend one level at a time`
- [ ] **Task 25: Unlabelled inputs** — 6 controls on the lesson page have no accessible name.
      Audit every page, not just that one.
      Commit: `fix: every form control has an accessible name`
- [ ] **Task 26: An automated a11y audit in CI** — axe-core wired into the existing Vitest setup,
      failing the build on new violations. **Install what is needed** (`@axe-core/playwright` or
      `axe-core` + jsdom); justify it as a dev dependency in the commit message. This is the
      commit that stops accessibility regressing again.
      Commit: `test: axe-core in CI, so this does not regress again`
- [ ] **Task 27: Keyboard-only pass** over the teacher dashboard and the lesson runner — every
      control reachable, visible focus, no traps, and the custom dropdown that replaced native
      selects (`select-menu.js`) operable by keyboard and announced correctly.
      Commit: `fix: the dashboard and the lesson runner are operable from the keyboard`
- [ ] **Task 28: Screen-reader pass** over the quiz and unit-test flows — the ones where a wrong
      announcement costs a student marks. A real fill-the-blank announcement bug was already
      found and fixed in `568dcad`; check its siblings.
      Commit: `fix: the quiz announces what it is actually asking`
- [ ] **Task 29: Reduced motion** — the homepage boot animation, the trail draw-in and the
      cross-fades must respect `prefers-reduced-motion`. Verify; do not assume.
      Commit: `fix: prefers-reduced-motion is honoured on the homepage`
- [ ] **Task 30: Colour-independence audit** — the project already promises greyscale-legible
      marks in the mastery grid. Verify that holds for quiz results, assignment status pills and
      the Excel export's cells.
      Commit: `fix: status reads in greyscale everywhere it now matters`

---

# PHASE 5 — Visible UI bugs found live (commits 31–38)

- [ ] **Task 31: The homepage boot animation holds content hostage for ~7s** — verified: a fresh
      navigation to `/` showed a black screen typing `$ python3`, still running 7 seconds later,
      unskippable by scrolling, while `dclMs` was 208ms. Make it skippable (any key/click/scroll),
      cap it hard (~1.5s), show it at most once per session, and never to `prefers-reduced-motion`
      users. Prior art on the `claude/boot-and-motion` branch: "Gate boot intro by arrival type".
      Commit: `fix: the boot animation is capped, skippable and shown once`
- [ ] **Task 32: Clipped "Advanced" label** at trail stop 9, cut off by the trail card's right
      edge at every viewport observed.
      Commit: `fix: the last trail stop's label fits inside its card`
- [ ] **Task 33: Cross-fade renders as doubled illegible text** — outgoing and incoming
      "NOW ON THE TRAIL" cards overlap mid-transition. Either cross-fade through a neutral state
      or hard-swap.
      Commit: `fix: the trail card swaps instead of ghosting through itself`
- [ ] **Task 34: `/quiz.html` with no quiz selected renders an empty shell** — the word "Quiz",
      the footer, nothing between. This is in production. Give it a real empty/invalid state.
      Commit: `fix: /quiz.html says what happened when there is no quiz`
- [ ] **Task 35: The footer floats on short pages** — no `min-height: 100vh/dvh` layout anywhere;
      confirmed on `/quiz.html`, `/certificate.html`, `/settings.html`, `/unit-test.html`. Fix
      once, in the shared layout.
      Commit: `fix: the footer sits at the bottom on short pages`
- [ ] **Task 36: Ragged trailing card rows** — the "what Python is used for" grid renders 5 cards
      then 3 left-aligned with a large gap. Pick one rule (centre the remainder, or stretch) and
      apply it to the shared card-grid component.
      Commit: `fix: one rule for the last row of a card grid`
- [ ] **Task 37: Typography inconsistency** — numbered sub-headings render in the display font
      while sibling section headings use the body heading font. Pick one and enforce it.
      Commit: `fix: one heading font in lesson content`
- [ ] **Task 38: Mobile verification, properly** — the auditor's window resize was blocked and
      they did not claim to have verified mobile. The CSS has ~10 distinct max-width breakpoints
      (600, 768, 900, 920, 980, 1000, 1024, 1120, 1200, 1400) with no evident system. Use real
      device emulation to walk every page at 390×844 and 768×1024, fix what breaks, and
      consolidate the breakpoints into a documented scale.
      Commit: `fix: a documented breakpoint scale, and the mobile layouts it repairs`

---

# PHASE 6 — Front-end architecture and delivery (commits 39–43)

- [ ] **Task 39: Script sprawl** — the lesson page loads 43 `<script src>` tags; the classroom
      page 39. Nine stylesheets per page including a 104KB `style.css`, and apparently **two
      different files both named `main.css`** — investigate the duplicate first. Then decide:
      a minimal build step (esbuild, one command, no framework) or an explicit documented
      decision to stay unbundled. Either is defensible; the current state looks unconsidered.
      Commit: `build: <the decision>, argued in the commit message`
- [ ] **Task 40: CSS consolidation** — 104KB in one file with 24 media queries and an ad-hoc
      breakpoint set is the maintenance risk behind most of Phase 5. Split by concern or
      introduce tokens. Do not just reformat it.
      Commit: `refactor: style.css split by concern, with a token layer`
- [ ] **Task 41: SEO and link previews** — only `/index.html` has Open Graph tags and a canonical
      URL. `/quiz.html`, `/certificate.html`, `/settings.html`, `/unit-test.html` and the ~80
      lesson pages have neither, so a link shared into a school Slack or Google Classroom
      previews as nothing. Generate the tags (extend `scripts/bake_layout.py` or add
      `scripts/build-meta.js`) rather than hand-maintaining 80 pages.
      Commit: `feat: generated og/twitter/canonical tags on every page`
- [ ] **Task 42: `<noscript>` consistency** — present on `/quiz.html` and `/unit-test.html`,
      absent on `/settings.html`, `/certificate.html`, `/index.html`. Decide the policy, apply it.
      Commit: `fix: one noscript policy, applied everywhere`
- [ ] **Task 43: A performance budget in CI** — page weight, request count and Lighthouse scores
      asserted rather than hoped for. Install what is needed; justify it.
      Commit: `test: a performance budget the build enforces`

---

# PHASE 7 — Correctness and hardening (commits 44–50)

- [ ] **Task 44: Timezone handling in due dates** — `classroom-core.js` (1091 lines) contains
      **zero** occurrences of `getUTC*`, `toISOString` or `Date.UTC`, uses local-date methods,
      has no end-of-day handling and never mentions timezones. Live behaviour is currently
      *correct for a single timezone* (verified: due Aug 31 → "Overdue", due Sep 1 → "Not due
      yet", at 02:29 EDT on Sep 1), so this is a latent risk, not a live bug. **Write the spec
      first** (`docs/superpowers/specs/2026-09-01-due-dates-and-timezones-design.md`): due dates
      mean end-of-day in the *class's* timezone, stored as an absolute instant; store the class
      timezone. Test across a boundary. Do not "fix" what currently works without tests proving
      the new behaviour.
      Commits: `docs: spec for due dates across timezones` + `fix: a due date is an instant, in the class's timezone`
- [ ] **Task 45: Three student-state edge paths** — a student in no class, a student mid-transfer,
      and a student whose class was archived. Walk each end to end. Archived-class handling
      touches purge rules and the 180-day retention expiry, and those interact.
      Commit: `fix: the three student states nobody walked end to end`
- [ ] **Task 46: Retention expiry vs. long courses** — events are deleted after 180 days by rule,
      and several features derive state by replaying events. A year-long course crosses that
      line. Phase 2's summaries are the natural fix; confirm they are, and test a simulated
      200-day-old class.
      Commit: `test: a 200-day-old class still reports its students' progress`
- [ ] **Task 47: Concurrent teacher edits** — two co-teachers editing lock mode or assignments at
      once. Last-write-wins on a whole document silently discards the other's change. Check
      whether the current writes are field-scoped or document-scoped; fix if needed.
      Commit: `fix: co-teachers stop overwriting each other`
- [ ] **Task 48: Quiz bank coverage** — `568dcad` seeded match/order/blank questions for units
      1–3 only; every unit has MCQs but the newer kinds do not exist for units 4–10. Either
      author them properly or make the teacher-facing picker state plainly which kinds a unit
      offers, so nobody assigns an empty paper.
      Commit: `fix: the picker states which question kinds a unit actually has`
- [ ] **Task 49: Error surfacing** — several boot paths swallow exceptions into a silent hidden
      state (`student-work.js`'s `catch { show(section, false) }` is the pattern). A silent
      failure is indistinguishable from "you have nothing". Audit these and give each a real
      state.
      Commit: `fix: a failure says it failed instead of showing an empty page`
- [ ] **Task 50: Update CLAUDE.md and write the final report** — what changed, what is deployed,
      what still needs the owner's hand, and **above all whether `firestore.rules` changed and
      therefore whether `npx firebase deploy --only firestore:rules` is outstanding**, plus a
      note that the previous session's rules deploy for the quiz feature may still be pending.
      Commit: `docs: what this session changed, and what the owner still has to run`

---

## Final report must contain

- Every commit hash with one line each.
- The measured before/after read count from Phase 2.
- The accessibility violation count before and after.
- Confirmation the persistence warning is gone with three tabs open.
- Whether `firestore.rules` changed, and whether the deploy is outstanding.
- Anything decided differently from the audit brief, with the reasoning.

## Known deviations from the brief, recorded up front

1. **`readEvents` is `limit(500)`, not `limit(400)`.** The brief attributed the wrong limit; the
   three `limit(400)` calls are in the purge paths. The real per-student cost is higher than the
   brief's table, and `readMirror` is unbounded on top of it. Corrected in Phase 2 above.
2. **`classroom-core.js` is 1091 lines, not 1092.** Immaterial; noted so the numbers in this plan
   are the ones actually measured here.
