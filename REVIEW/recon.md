# Recon — boot sequence + motion pass (branch `claude/boot-and-motion`)

Date: 2026-08-07. All findings verified by grep/read, not assumed.

## Script/stylesheet liveness

- **`assets/js/motion.js` is loaded by all 114 HTML pages** (`grep -rl "motion.js" --include="*.html"` → 114 files: index, curriculum, sandbox, settings, 404, all 10 unit hubs, all 99 lessons).
- **`assets/css/motion.css` — dead.** Linked by zero pages. Left untouched.
- **`assets/js/layout.js` — dead.** Loaded by zero pages. `core.js`'s `headerHtml()`/`footerHtml()` never called. Left untouched.
- `index.html` loads `pypath-theme.css` (line 27) plus `style.css`, `pypath-fast.css`, `home-path.css`, and scripts: `theme-init.js` (blocking, head), then deferred `theme.js`, `motion.js`, `pyodide-loader.js`, `icons.js`, `hero-editor.js`, `path-trail.js`, `core.js`.

## Pyodide

- **Single choke point:** `loadPyodide` appears only in `assets/js/pyodide-loader.js` (lines 36, 58). It exposes `window.Pyodide = { ensureReady, scheduleWarmup, runCode, RUN_LABEL, OUTPUT_HINT }`.
- Loader CDN: Pyodide **v0.24.1** → ships **CPython 3.11** (not 3.12 — boot copy adjusted for honesty).
- **Loading strategy:** on `DOMContentLoaded`, pages containing runner markup schedule a warmup via `requestIdleCallback` (timeout 5s) — so Pyodide usually starts loading shortly after page load, not on first Run. Per instructions, this strategy is kept; only presentation changes.
- 101 pages load `pyodide-loader.js`.

## Code runners found (Feature 2 targets)

| Runner | Page(s) | Output panel | Current loading UX |
|---|---|---|---|
| Hero editor (`hero-editor.js`) | `index.html` | `#hero-editor-output` | "Loading Python…" text on Run |
| Sandbox (`sandbox.js`) | `sandbox.html` | `#output-content` | Shows "Running…" even while Pyodide still loads (dishonest dead air) |
| Lesson runners (`lesson-runner.js`) | 99 lesson pages | `#output-<editorId>` (`.editor-output`) | "Loading Python interpreter..." immediately overwritten by "Running..." |
| Exercise checkers (`exercises.js` via `lesson-runner.js` `checkExercise`) | lesson pages | same panels, inside `[data-exercise-id]` | "Checking your code..." |

Decision: boot console attaches to **run-type** panels (hero, sandbox, lesson practice runners). Exercise panels keep their "Check Answer" idle hint — a boot prompt saying "press Run" would be wrong copy there.

## Existing motion inventory (Feature 3/4 context)

`motion.js` already contains a complete reveal system — the prompt's assumption that one needs to be added is out of date:

- `[data-reveal]` IntersectionObserver: threshold 0.08, **fires once and `unobserve`s** ✓, stagger via `[data-reveal-stagger]` (70–80ms), reduced-motion short-circuit ✓.
- `autoEnhanceReveals()` auto-tags: `.units-grid .unit-card`, `.home-practice__grid`, `.home-people`, `.home-endcta__inner`, `.path-journey__intro`, **`.page-unit .lesson-content .content-section`** (see judgment call below), `.page-curriculum .section-head`.
- Logo hover 3D-tilt + click flip (`.brand--motion`, `.logo--3d`, `.is-spinning`, `pp-logo-spin`) — untouched, new work avoids `.site-header .brand`/`.logo` transforms entirely (header choreography animates `.site-header` itself, a different element, and finishes before any hover can matter).
- `initHomeParallax()` — **pre-existing parallax** on home topo/trail-stub. The restraint rules say "no parallax" for new work; this is existing behavior and is left untouched (noted as a gap vs. the letter of the rule).
- Reveal CSS lives in `pypath-theme.css` (lines ~390–445); uses `filter: blur()` in addition to transform/opacity — pre-existing, not extended to new work.
- `.unit-card:hover` lift **already exists** (translateY(-2px) + shadow, 180ms) — meets the micro-interaction spec as-is.

## Theme tokens (used for terminal styling — no invented colors)

Light: `--pp-ink #0c4566`, `--pp-fog #e8f4fb`, `--pp-mist #f3f9fc`, `--pp-paper #f7fbfe`, `--pp-line #0ea5e9`, `--pp-line-deep #0284c7`, `--pp-muted #4a7390`, `--pp-border #d0e4ef`.
Dark: `--pp-paper #0e161d`, `--pp-mist #0c131a`, `--pp-fog #101820`, `--pp-line #38bdf8`, `--pp-line-deep #7dd3fc`, `--pp-ink #e8f4fb`, `--pp-muted #89a8ba`, `--pp-border #2a3c48`.
Fonts: display "Syne", body "Plus Jakarta Sans"; no mono token — terminal uses `ui-monospace` stack.
Boot overlay uses the **dark** values literally (a terminal is dark regardless of site theme).

## Homepage structure (Feature 1/3 targets)

- `body.page-home`; header `.site-header`; hero `.home-hero` with `.home-brand` (h1), `.home-hero__headline`, `.home-hero__lead`, `.home-cta-row` (2 `.btn-path`), `.home-hero__scrollhint`, `.home-summit__art`.
- Summit trail: `.path-journey[data-path-journey]` driven by `path-trail.js` — **not touched**; choreography ends before it and never re-triggers it.
- `theme-init.js` pattern (blocking head script + localStorage) is the established precedent for the boot-gate inline script.

## Judgment calls (documented up front)

1. **Lesson content reveals removed:** existing `autoEnhanceReveals` animates `.content-section` inside lesson pages — reading content students scroll through. The task's hard rule: "nothing animates on interior lesson pages except the Pyodide loader and hover states; never animate lesson body text." The `['.page-unit .lesson-content', '.content-section', 'up']` pair is removed. Removal is safe: elements simply never receive `data-reveal`, so they render statically.
2. **Boot copy says Python 3.11**, matching Pyodide 0.24.1, not the prompt's sample "3.12" — tied-to-real-events spirit.
3. **Exercise panels excluded** from the boot console (copy mismatch, see table above).
4. Pre-existing parallax and blur-in-reveals conflict with the restraint rules but predate this task — left as-is, flagged as gaps.

## Plan of record

- Feature 1: inline gate script in `index.html` head (`pp-wait`/`pp-boot` classes + pre-paint cover via `html.pp-boot body::before`), overlay built/typed/exited by `initBootIntro()` in `motion.js`. Flag `pp_boot_seen` set at boot start. Skip via pointerdown/keydown/wheel/touchstart. Watchdog in inline script force-finishes at 3.5s.
- Feature 2: panel registry + real-event boot console added to `pyodide-loader.js` (`Pyodide.attachBootPanel`); 1–3-line wiring changes in `hero-editor.js`, `sandbox.js`, `lesson-runner.js`.
- Feature 3: CSS keyframes in `pypath-theme.css` gated on `html.pp-go body.page-home`; last animation starts ≤ 860ms.
- Feature 4: button press states + boot-console CSS; reveal coverage verified as already present; lesson-content pair removed.
