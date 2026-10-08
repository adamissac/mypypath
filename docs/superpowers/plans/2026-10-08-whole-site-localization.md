# Whole-Site Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a searchable first-visit language chooser and a reusable locale system for all PyPath pages, with reviewed translations and safe English fallback.

**Architecture:** Keep PyPath static and use versioned, checked-in locale catalogs with stable keys. Add a small shared JavaScript runtime that loads a supported catalog, remembers the visitor's choice locally, sets `lang`/`dir`, and translates marked interface and content strings; centralize its controls in the baked shared layout. Connect course content and generated lesson pages through the existing generators, leaving Python code and behavior untouched. A locale cannot be enabled as complete until its required UI and course content is translated and reviewed.

**Tech Stack:** Plain HTML/CSS/JavaScript, JSON locale catalogs, existing Python/Node generators, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-08-whole-site-localization-design.md`

## Global Constraints

- The first release supports 20 languages total, including English.
- Keep all translations in the repository and deploy them with the site.
- Do not send page contents or user information to an external translation service at runtime.
- Keep user-entered content, Python syntax, code identifiers, URLs, and technical tokens unchanged.
- Arabic, Dari, Pashto, and Urdu use right-to-left page direction while code and code examples remain left-to-right.
- A language is selectable only when its site-wide required text has a reviewed translation.
- Translation lookup must never modify course state, user data, grading, routes, or authentication behavior.

## Review Focus

- A first-time visitor with browser locale aliases (for example `pt-BR` or `zh-Hans`) should get a sensible supported suggestion and English fallback.
- A locale fetch error or malformed catalog must leave the page usable in English and keep the language control available.
- Arabic-script right-to-left pages must keep code blocks, numeric tokens, and inline identifiers readable left-to-right.
- Search aliases must be safe for accents, non-Latin scripts, empty input, and rapid typing.
- Regenerated Foundations and Python for Data pages must preserve localization hooks and never translate executable code or grading values.

---

### Task 1: Locale registry, catalog contract, and validation

**Files:**
- Create: `assets/i18n/languages.json`
- Create: `assets/i18n/en.json`
- Create: `scripts/validate-i18n.mjs`
- Create: `tests/i18n-catalogs.test.js`
- Modify: `package.json`

**Interfaces:**
- `languages.json` exports `{ defaultLocale, locales }`; each locale has `tag`, `nativeName`, `englishName`, `direction`, `aliases`, and `status` (`ready` or `coming-soon`).
- Locale catalog JSON is a flat string-key map; interpolation uses `{name}` placeholders.
- `node scripts/validate-i18n.mjs` exits nonzero for duplicate locale tags, invalid directions/status, missing English keys, inconsistent placeholders, or an enabled locale missing any required key.

- [x] Write tests for all 20 exact language tags, unique normalized aliases within each language (country aliases intentionally overlap across languages), only RTL flags on `ar`, `fa-AF`, `ps`, and `ur`, placeholder parity, and every `ready` catalog having the English key set.
- [x] Run `npx vitest run tests/i18n-catalogs.test.js` and verify failure because the registry and validator are absent.
- [x] Add the locale registry with native/English names, country aliases derived from the outreach list, browser-locale aliases, and readiness initially `coming-soon` for translations that are not reviewed.
- [x] Add the English source catalog for onboarding, search, language control, fallback messages, and shared header/footer copy.
- [x] Implement the validator and add `validate:i18n` to package scripts.
- [x] Run the focused test and validator; both pass for the current registry (20 locales, 24 English strings).
- [x] Commit as `feat(i18n): add locale registry and catalog validation`.

### Task 2: Locale runtime and preference behavior

**Files:**
- Create: `assets/js/i18n.js`
- Create: `tests/i18n-runtime.test.js`
- Modify: `scripts/bake_layout.py`
- Modify: `scripts/build-data-course.cjs`
- Modify: `scripts/build-trail.mjs`
- Modify: `scripts/build-curriculum.js`
- Modify: existing static pages through `scripts/bake_layout.py`

**Interfaces:**
- `window.PyPathI18n.getLocale()` returns the active BCP 47 tag.
- `window.PyPathI18n.setLocale(tag)` persists the valid tag and applies translations.
- `window.PyPathI18n.t(key, params?)` returns a translated string or English fallback.
- The storage key is `pypath.locale`; invalid stored values are ignored.

- [x] Test preference precedence (saved preference, supported browser preference, English), invalid stored values, RTL direction, code block direction, placeholder interpolation, and failed fetch fallback.
- [x] Run the focused runtime tests and verify they fail before the runtime exists.
- [x] Implement the runtime with same-origin catalog fetches, request caching, `lang`/`dir` application, English fallback, safe text insertion, and no modification to code/pre content.
- [x] Load the runtime on every baked page; the canonical bake step reinserts it after generated pages, the trail generator preserves the head, and curriculum generation emits data only. The runtime JS is hash-versioned; JSON requests use same-origin no-cache revalidation.
- [x] Re-run focused tests and generator checks; all 200 public HTML pages contain exactly one runtime script; the Data course builder, curriculum builder, trail check, and repeat bake passed.
- [x] Commit as `feat(i18n): load and persist locale preferences`.

### Task 3: Accessible language picker and shared navigation

**Files:**
- Modify: `scripts/bake_layout.py`
- Modify: `assets/css/pypath-theme.css`
- Modify: `assets/css/style.css` only if that is the active shared layer
- Create: `tests/i18n-picker.test.js`
- Modify: `tests/browser/` with one browser flow for onboarding and language switching

**Interfaces:**
- Shared header control has button `data-language-open` and opens dialog `#language-dialog`.
- Search field `#language-search` matches native names, English names, ISO tags, and country aliases.
- Language rows expose availability; unavailable translations are shown as “Coming soon” and cannot be selected as active.
- First-visit dialog is dismissed after a language selection or explicit English continuation; a persistent header control can reopen it.

- [ ] Test keyboard open/close/focus behavior, no-results state, native-name and country-alias search, coming-soon disabling, selection persistence, and explicit English continuation.
- [ ] Run focused tests and verify failure before adding markup/behavior.
- [ ] Add the accessible dialog and persistent header/footer language control to the canonical baked layout; preserve mobile navigation and screen-reader labels.
- [ ] Add responsive styling, visible focus, focus return, Escape handling, and reduced-motion-safe transitions.
- [ ] Add Playwright coverage for first visit, selection, revisit, search, and changing the active language.
- [ ] Run accessibility, keyboard, and mobile checks on the home, lesson, course, and account page shapes.
- [ ] Commit as `feat(i18n): add accessible language chooser`.

### Task 4: Translate shared interface and generated content safely

**Files:**
- Modify: `assets/js/layout.js` or canonical `scripts/bake_layout.py` output as determined by generated layout ownership
- Modify: shared UI modules that emit visible text, including `assets/js/auth-ui.js`, `assets/js/role-nav.js`, and exercise/check UI modules after inventory
- Modify: `scripts/build-data-course.cjs`, `scripts/build-curriculum.js`, and their content-source files
- Create: `scripts/audit-i18n-coverage.mjs`
- Create: `tests/i18n-coverage.test.js`
- Modify: representative static page templates and lessons with stable `data-i18n` keys

**Interfaces:**
- Static translatable elements use `data-i18n="key"`; accessible labels use `data-i18n-aria-label="key"` and document titles use `data-i18n-title="key"`.
- Dynamic UI uses `PyPathI18n.t(key, params)`.
- The coverage audit lists unmarked visible text and fails release verification when a `ready` locale would expose required English-only content.

- [ ] Inventory visible strings across shared layout, all page routes, lessons, exercises, quizzes, authentication, settings, teacher surfaces, and empty/error states; record source locations in the coverage report.
- [ ] Write tests proving representative generated content translates while `<pre>`, `<code>`, Python source, exercise answer IDs, and numerical grading state do not change.
- [ ] Add stable localization hooks at shared layout and generator sources before baking/rebuilding pages.
- [ ] Add dynamic message keys to UI scripts; keep server/user data, student work, and Python tokens outside catalogs.
- [ ] Translate source prose separately from exercise logic; run curriculum and data-course generators and verify they preserve hooks.
- [ ] Run coverage audit over all HTML pages and scripts; resolve all required unmarked strings for each locale marked `ready`.
- [ ] Commit as `feat(i18n): localize shared and course content`.

### Task 5: Locale catalog completion, RTL, and release validation

**Files:**
- Modify: `assets/i18n/*.json`
- Modify: `assets/css/pypath-theme.css`
- Modify: `tests/i18n-catalogs.test.js`, `tests/i18n-runtime.test.js`, and browser localization tests
- Modify: `docs/` localization notes and release checklist

- [ ] Complete the 20 locale records and search aliases; keep untranslated locales visibly “Coming soon” until all required strings receive fluent review.
- [ ] Add glossary-reviewed translations for shared UI and course prose, with a fluent-review status recorded for every locale.
- [ ] Test RTL layout for header, lesson sidebar, form controls, dialogs, inline identifiers, and code; enforce `dir="ltr"` on code blocks.
- [ ] Test locale-aware date/number display where used without altering underlying values or grading behavior.
- [ ] Run `npm test`, `npm run validate:i18n`, curriculum/data-course generation checks, `npm run test:a11y`, `npm run test:mobile`, `npm run test:keyboard`, `npm run test:motion`, and `npm run test:perf`; report known unrelated baseline failures by name.
- [ ] Run real-browser flows against representative route families and public production pages after release.
- [ ] Confirm no locale is marked ready without translation completeness and fluent review. If review is unavailable, ship the working chooser and registry with those locales clearly “Coming soon”; do not claim whole-site translations are finished.
- [ ] Commit final changes, push `main`, and confirm the Vercel deployment and live chooser.
