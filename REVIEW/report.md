# Boot sequence + Pyodide loader + motion pass — report

Branch: `claude/boot-and-motion` · Date: 2026-08-07
(Previous report content — merged site updates — lives in git history at `9892a6d`.)
Recon findings: see [recon.md](recon.md). Screenshots: [screenshots/](screenshots/).

## What changed, file by file

### `index.html`
- Added one inline `<script>` in `<head>` (after `theme-init.js`, same blocking-gate pattern): reads `localStorage.pp_boot_seen` and `prefers-reduced-motion` **before first paint** and sets `pp-wait` (choreography pending) and `pp-boot` (first-visit overlay) classes on `<html>`. Includes a 3.5s watchdog that force-reveals the page if `motion.js` ever fails to run. Reduced-motion users get neither class and the seen-flag is set so the intro never plays for them later.

### `assets/css/pypath-theme.css` (all new CSS lives here; `motion.css` untouched and still dead)
- **Boot overlay**: full-screen fixed terminal, dark-palette values from the site's own dark theme tokens (`#0c131a` ground, `#38bdf8` accent, `#e8f4fb` ink), mono stack, blinking block caret, 280ms wipe-up exit. A `html.pp-boot body::before` cover paints from the very first frame so page content can never flash before the overlay is injected.
- **Entrance choreography** (homepage): keyframes `pp-enter-drop/rise/fade/pop`, all transform+opacity only. Sequence: header 0ms → brand 80ms → headline 160ms → lead 240ms → summit art 220ms → CTA buttons 320/360ms (pop, 40ms stagger) → scroll hint 440ms. Last animation ends at 860ms (≤ 900ms budget). Hidden states exist only under `html.pp-wait` inside `@media (prefers-reduced-motion: no-preference)` — JS-off and reduced-motion render statically.
- **Pyodide boot console**: terminal-style lines inside runner output panels; inherits each panel's background, accents from theme tokens so it reads in light and dark. Caret blink and line fade-in are motion-gated; the lines themselves always render.
- **Micro-interactions**: gentle press state (`translateY(1px) scale(0.985)`) for `.btn-path`, `.btn`, and the hero Run button. Unit-card hover lift already existed (−2px + shadow, 180ms) and was left as-is.

### `assets/js/motion.js`
- Added `initBootIntro()`: builds the overlay only when `html.pp-boot` is set (i.e. **never in the DOM on return visits** — asserted in tests, not just eyeballed). Types `$ python3 pypath.py` at 26ms/char (input is typed; output prints — like a real terminal), fills `Loading units [##########] 10/10` in 10 steps, prints `✓ ready`, wipes up. Total ≈ 1.3s. Any pointer/key/wheel/touch event completes it instantly. The seen-flag is set the moment the boot starts. On exit it triggers `pp-go`, starting the choreography as the curtain lifts; the existing Summit trail scroll animation is untouched and takes over from there.
- Removed the `.page-unit .lesson-content` pair from `autoEnhanceReveals` — lesson reading content no longer reveal-animates (hard restraint rule; removal is safe because those sections simply never get `data-reveal` now).
- No changes near the logo tilt/flip code; choreography animates `.site-header` itself, never `.brand`/`.logo`, so the two compose without conflict.

### `assets/js/pyodide-loader.js`
- Added a boot-console panel registry (`Pyodide.attachBootPanel(el)`). Lines are tied to **real events**: line 1 when `ensureReady()` actually starts, line 2 `✓` when `loadPyodide()` resolves, line 3 `>>> ready — press Run` once the stdout capture is installed. A 400ms minimum display prevents flash when the runtime is cached. Failure paints a plain-language error line with a **Try again** button that re-runs the load.
- Copy says **Python 3.11** (Pyodide 0.24.1 ships CPython 3.11 — the prompt's "3.12" sample would have been inaccurate).
- Fixed a latent bug the retry affordance exposed: `loadScript()` cached its rejected promise forever, so any load failure was permanent. It now clears the cache and removes the dead `<script>` tag on error. (Verified: blocked CDN → error state → unblock → retry → ready.)
- Loading strategy unchanged: same idle-time warmup, same lazy `ensureReady()`.

### `assets/js/hero-editor.js`, `assets/js/sandbox.js`, `assets/js/lesson-runner.js`
- Each registers its output panel(s) with `attachBootPanel` at init, so the warmup that used to be silent dead air now shows honest progress.
- Run-press paths no longer paint generic "Loading Python…" text over the boot console; "Running…" appears only once the runtime is genuinely ready.
- Lesson **exercise** panels are excluded — their idle copy ("click Check Answer") describes a different action, and ">>> ready — press Run" would be wrong there.
- The panel-ownership guard means results always win: once a runner writes output, the loader never touches that panel again.

### `.claude/skills/`
- Vendored `frontend-design` and `webapp-testing` from `anthropics/skills` (the `/plugin` marketplace route isn't scriptable from inside a session; the prompt's documented fallback was used).

## Verification (Playwright, screenshots in `REVIEW/screenshots/`)

27/27 automated checks pass; **zero console errors** on index (fresh, return, mobile, reduced-motion contexts), sandbox, and a lesson page.

| Shot | Shows |
|---|---|
| `boot-mid.png` | Fresh profile, overlay mid-typing (`$ python3 pyp▮`) |
| `boot-done-hero.png` | Hero fully choreographed in after handoff |
| `return-visit.png` | Same context reload — overlay **asserted** absent from DOM |
| `pyodide-loading.png` | Runner panel mid-load (network throttled to catch it honestly) |
| `pyodide-ready.png` | All three boot lines settled to ready |
| `pyodide-error.png` | CDN blocked → error line + Try again (retry verified to recover) |
| `reveal-before.png` / `reveal-after.png` | End CTA below fold, before/after scroll into view |
| `mobile-390.png` | Homepage at 390px post-boot, no horizontal overflow |
| `reduced-motion.png` | Emulated reduce: no overlay ever in DOM, instant render, flag set |
| `sandbox-boot.png`, `lesson-boot.png` | Boot console on the other two runner surfaces |

Also verified end-to-end: hero runner executes `trail.py` and prints the expected output after boot.

## Judgment calls

1. **Lesson reveals removed** (see recon §judgment calls) — hard rule beats existing behavior; change is render-safe.
2. **"Python 3.11"** not "3.12" — matches the actual interpreter.
3. **Exercise panels excluded** from the boot console — copy correctness.
4. **Wipe-up exit** chosen over fade: the site's motif is upward (summit, rising trail), and the choreography underneath rises to meet it.
5. **No GSAP** — vanilla CSS animation delays sequence Feature 3 cleanly; the escape hatch was not needed. Zero new dependencies.

## Known gaps (pre-existing, out of scope, verified against `main`)

- Mobile 390px: hero display text clips at the right edge — **pixel-identical on unmodified `main`** (baseline screenshot compared during verification); not a regression from this work.
- `initHomeParallax()` (existing) is parallax, and existing reveal CSS animates `filter: blur()` — both violate the letter of this task's restraint rules but predate it; left untouched.
- Pages not loading `motion.js`: none — recon found all 114 pages load it, so no gaps to note.
