# Unit Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare lesson list on all 20 unit overview pages with a unit header (blurb, hours, level, progress ring, Continue) and a lesson trail (summary, time, status per lesson, the unit test as the summit), and fix the doubled numbers and the raw `footer.settings` key.

**Architecture:** A pure content module (`scripts/unit-pages-content.mjs`) derives summaries and time estimates and renders the region's HTML; a generator (`scripts/build-unit-pages.mjs`) writes it between `<!-- unit-page:begin -->`/`<!-- unit-page:end -->` in `units/unit-N.html` and `data/unit-N.html`, adding `unit-page.css` and `unit-progress-panel.js` to each head. The trail keeps the `unit-lesson-list` class, so `lesson-progress.js` still marks lessons done/started and fills the test status; `unit-progress-panel.js` adds the ring, the Continue target and the "Up next" stop, computed from the page's own lesson list for both courses.

**Tech Stack:** Node (ESM) generator, cheerio (existing dependency) for parsing lesson HTML, vitest + jsdom, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-unit-pages-design.md`

## Global Constraints

- Small commits pushed to `main`; no attribution lines.
- No `gradient(` in any stylesheet; breakpoints only from 480/640/768/900/980 (and 767/1023 as max pairs).
- Lesson layout rules in CLAUDE.md are untouched (this is the unit overview page only).
- `npm test`, `test:a11y` (zero), `test:mobile`, `test:keyboard`, `test:motion`, `test:perf`, `validate:i18n` stay green.
- Data unit tests are keyed `data-N`; Foundations `N`; pass mark 70.
- Run `python3 scripts/bake_layout.py` before pushing; new assets go in its versioned list.

## Review Focus

1. A teacher viewing a unit page: no personal statuses, no ring, Continue says "Start Unit N" (lesson-progress already clears marks for teachers).
2. Lessons passed out of order: "Up next" is the first unfinished lesson in order, not the one after the last finished.
3. Corrupt progress JSON: every lesson "Not started", ring 0%, no exception.
4. A locked unit (account required): the lock notice from gate/lesson-progress still appears above the trail and every lesson still listed.
5. 320 px wide: no horizontal scroll, the rail stays left of the cards.

---

### Task 1: Content module

**Files:** Create `scripts/unit-pages-content.mjs`; Test `tests/unit-pages-content.test.js`.

**Produces:** `lessonSummary(html, course) → string` (data: meta description; units: first bold labels of "What You Will Learn in This Lesson" joined with ", " up to 90 chars, else first sentence of the Overview), `lessonMinutes(html, { editors, exercises }) → number` (prose words in `.lesson-content`/`main` excluding `pre, code, script, style` ÷ 200 + 2·editors + 3·exercises, rounded to 5, min 5), `renderUnitRegion(unit) → string`.

- [ ] Tests: summary from a data meta description; from a units "What You Will Learn" list (labels, colons stripped, lowercased after the first unless they start with "Python"); fallback to Overview; no double numbering in rendered titles; time estimate rounding/minimum; rendered region has the markers, one `li.unit-trail__stop` per lesson with `data-lesson-path`, the summit stop with `data-unit-test-status` and `data-unit-test-link`, `ol.unit-lesson-list.unit-trail`, h1 "Unit N: Title", and the progress panel hooks (`data-unit-progress`, `[data-unit-progress-pct]`, `.unit-progress__meter`).
- [ ] Watch fail; implement; pass; commit `feat(units): derive lesson summaries and times for unit pages`; push.

### Task 2: Generator and the 20 pages

**Files:** Create `scripts/build-unit-pages.mjs`; modify `scripts/build-data-course.cjs` (emit the markers), `scripts/build-data-course.sh` (run the generator), `scripts/bake_layout.py` (remove the dead unit-page block; version `unit-page.css`), `package.json` (`build:unit-pages`); regenerate `units/unit-*.html`, `data/unit-*.html`; test `tests/unit-pages.test.js`.

- [ ] Tests: `--check` passes; every one of the 20 pages has exactly one region, no `1. 1.` pattern, links every lesson in curriculum order, carries `unit-page.css` and `unit-progress-panel.js`.
- [ ] Watch fail; implement (first run replaces from `<!-- noscript:end -->` to `</main>` when markers are absent); run with `--print` and read every derived summary once; pass; commit `feat(units): generate unit pages as a lesson trail`; push.

### Task 3: Look and behaviour

**Files:** Create `assets/css/unit-page.css`; modify `assets/js/unit-progress-panel.js`; test `tests/unit-progress-ui.test.js` (extend), `tests/browser/unit-page.mjs`.

- [ ] Tests (jsdom): ring percent and Continue target for none / some / all passed / out of order; data course uses `data-N` record; teacher view hides ring and statuses; junk storage safe.
- [ ] Browser: Unit 1 and Data Unit 3 at 1440/390/320, light/dark, no progress and seeded progress; up-next is raised; no horizontal scroll; screenshots read.
- [ ] Commit `feat(units): style the lesson trail and show where to continue`; push.

### Task 4: Footer key and verification

- [ ] Test: `en.json` (and the bundled English catalog in `assets/js/i18n.js`) has `footer.settings`; `npm run build:i18n`.
- [ ] Full suites; commit `fix(i18n): name the Settings link in the footer`; push; wait for live hashes; re-run `tests/browser/unit-page.mjs https://mypypath.com`.
