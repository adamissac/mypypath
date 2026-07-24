# The Summit — implementation report

**Date:** 2026-07-24  
**Branch:** `cursor/summit-hero-animation-15a6`  
**Feature:** Low-poly 3D “Summit” companion in the homepage hero

---

## Rendering approach

**Canvas 2D with simple 3D math** (`assets/js/summit.js`).

Why canvas (not SVG frames / WebGL / libraries):

- Genuine Y-axis rotation needs per-frame facet shading, trail depth fade, and stop pulses — cheaper to redraw triangles than to ship dozens of SVG keyframes.
- Matches the repo constraint: vanilla HTML/CSS/JS only, no Three.js / GSAP / CDNs / build step.
- A static inline SVG remains in the hero as the no-JS / pre-enhance fallback so the reserved box is never empty.

Pipeline: build irregular cone verts + faces → rotate (yaw / pitch / roll) → perspective project → painter’s-algorithm facet fill with flat shading from one light vector → dashed trail with far-side alpha → pulsed stops → summit flag.

**Note on GSAP:** The prompt’s technical requirements forbid GSAP and any libraries. The trailing “Use the GSAP plugin” line conflicts with that constraint, so GSAP was not used. Motion tokens from `motion.css` / `PyMotion.prefersReduced()` are reused where relevant.

---

## Files added / modified

| File | Change |
|------|--------|
| `assets/js/summit.js` | **Added** — self-contained Summit module (`window.PySummit`) |
| `assets/css/home-path.css` | **Modified** — two-column hero, Summit box, responsive / reduced-motion rules |
| `index.html` | **Modified** — hero markup (intro + Summit), deferred `summit.js`, static SVG fallback |
| `REVIEW/report.md` | **Replaced** — this report |
| `REVIEW/screenshots/*.png` | **Added** — light / dark / tablet / mobile / reduced-motion captures |

Not touched: navbar, footer, runners, settings, other pages, package manifests, CDNs.

---

## Theme colors

All Summit colors come from existing homepage tokens (`--home-ink`, `--home-fog`, `--home-mist`, `--home-line`, `--home-line-deep`, `--home-mark`, `--home-mark-hot`, `--home-paper`, `--home-muted`), read at runtime via `getComputedStyle`.

Facet light/dark variants are computed with HSL lightness adjustments from `--home-ink` — no new hardcoded hex in the renderer.

Sync:

1. `themechange` custom event (from `theme.js`)
2. `MutationObserver` on `document.documentElement[data-theme]` / `class`
3. Immediate redraw when the loop is paused

Verified: toggling light → dark mid-session updates trail/facet palette (`themeChanged: true` in CDP checks).

Static SVG fallback uses the same tokens through CSS (`color-mix` / `var(--home-*)`).

---

## Performance / motion etiquette

| Behavior | Implementation |
|----------|----------------|
| Rotation | ~36s per revolution (`ROTATION_PERIOD_MS`) |
| Stop pulse | 8s sequential loop base → peak |
| Cursor parallax | ≤5° pitch/roll, lerp 0.08; fine-pointer + hover only |
| Drag spin | Optional angular impulse + friction back to base speed |
| `prefers-reduced-motion` | Single static frame; no loop / pulse / parallax |
| Tab hidden | `visibilitychange` pauses rAF |
| Off-screen | `IntersectionObserver` pauses rAF |
| DPR | Canvas sized with `devicePixelRatio` (capped at 2) |
| Script load | `defer` — does not block first paint / LCP headline |
| Layout | Reserved `aspect-ratio: 4/5` (1/1 on smaller breakpoints), `max-width: 520px`, `contain: layout paint` |

---

## Definition of done

1. **Desktop placement + themes** — Pass. Summit sits to the right of “PyPath” (~520×650 at 1440). Light and dark both correct; live theme toggle updates palette.
2. **3D rotation + trail occlusion + pulse + flag** — Pass. Yaw advances every frame; far-side trail segments draw faded; 10 stops pulse in sequence; flag at peak (~72 triangles after mesh trim).
3. **Cursor parallax** — Pass on fine pointers; skipped on coarse / touch and when motion is reduced.
4. **Reduced motion + pause** — Pass. Emulated `prefers-reduced-motion: reduce` → `running: false`, static frame. Tab-hidden → loop stops; visible again → resumes.
5. **No-JS SVG fallback** — Pass. Inline SVG (mountain, trail, 10 stops, flag) occupies the same box; JS hides it after canvas mount (`hidden` + `.is-enhanced`).
6. **CLS / LCP / console** — Pass. Reserved aspect-ratio box; headline remains in HTML before deferred scripts; CDP console empty.
7. **Responsive (320 / 375 / 768 / 1024 / 1440)** — Pass. No `scrollWidth` overflow; CTAs above the fold on mobile; &lt;768 uses static frame (no loop); short viewports (`max-height: 640px`) hide Summit so CTAs win.
8. **Exactly one hero / navbar / footer** — Pass (`section.home-hero` ×1, `site-header` ×1, `site-footer` ×1).
9. **Lighthouse** — Not run end-to-end in this environment (Chrome headless hangs on full Lighthouse). No new network deps, deferred script only, animation pauses off-screen — no expected perf regression vs prior hero.

---

## Screenshots / state descriptions

Stored under `REVIEW/screenshots/` and `/opt/cursor/artifacts/summit/`.

| State | Description |
|-------|-------------|
| Light desktop | Two-column hero; dark navy facets; cyan trail/stops; flag at peak |
| Dark desktop | Same composition; lighter facets + brighter trail from dark tokens |
| Tablet 768 | Summit stacks below copy at ~320² so CTAs stay clear |
| Mobile 375 | Static modest Summit under intro; CTAs clearly in first viewport |
| Reduced motion | Full hero with one static Summit frame; loop off |

---

## Known limitations

- Mesh is a hand-tuned irregular cone (~72 tris), not a sculpted DEM — silhouette is mountain-like but simplified.
- Far-side trail occlusion uses facing/depth alpha, not true geometric depth testing against facets.
- Drag-to-rotate is intentionally light; no inertia UI chrome.
- On mid tablets (768–900px) Summit stacks below rather than squeezing beside CTAs.
- Full Lighthouse CI was not executed here; recommend a Pagespeed pass on preview.

---

## Suggested follow-ups

1. Optional: click a stop to deep-link to that unit.
2. Optional: sync stop pulse with scroll progress on `#the-path`.
3. Run Lighthouse on the deployed preview and compare LCP/CLS to `main`.
4. Consider a slightly softer facet edge stroke in dark mode only (token-derived).
