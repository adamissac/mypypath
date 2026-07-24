# The Summit — fix-pass report

**Date:** 2026-07-24  
**Branch:** `cursor/summit-hero-animation-15a6`  
**Commits:** initial Summit + this visual fix pass  
**Screenshots:** `REVIEW/screenshots/` (replaced) and `/opt/cursor/artifacts/summit/`

---

## Rendering approach (unchanged)

Canvas 2D + simple 3D math in `assets/js/summit.js`. Engine kept: projection, theme-token palette, DPR, pause / reduced-motion, parallax, drag. Visual layer rebuilt.

---

## What changed per fix

### Fix 1 — Mountain reads as a peak
**Before:** Per-vertex radius jitter (0.78–1.16) produced a crumpled blob; ~72 small facets; lit/mid/shadow too close; noisy strokes.  
**After:**
- Deliberate silhouette: sharp peak + smooth shoulder lobe (no silhouette jitter)
- **30** triangles (3 rings × 6 sectors)
- Facet tones quantized to lit / mid / shadow via token mixes (`mixRgb` ink↔fog), wide spread
- Light from **front-left** so front faces actually read lit
- Facet strokes removed (fill only)

### Fix 2 — Trail occlusion
**Before:** Far trail drawn after facets with high alpha → dashes across the body.  
**After:**
- Near/far from **yaw-only** radial depth (pitch no longer corrupts the test)
- Far-side trail **omitted** (`BACK_HINT_ALPHA = 0`) — no through-body dashes
- Draw order: **all facets first**, then near trail / stops / trailhead on top
- Honest note: the *near-side* spiral still crosses the visible face (correct for a path on the front). That can be mistaken for ghosting in screenshots; true back-side ghosting is gone.

### Fix 3 — Stops
**Before:** Even `t` spacing bunched 8–10 at the peak; ~7px numbers.  
**After:**
- Stop **10 = summit** (flag base / peak vertex)
- Stops 1–9 use `t = pow(i/8, 1.18) * 0.9` (base bias)
- Numbers only when font ≥ 9px and stop is near-side; else plain dot
- Back-side stops not drawn

### Fix 4 — Trailhead → destination
**Before:** Spiral with no clear start/end.  
**After:** Trail starts at ground with a **trailhead dot** (echoes hero scroll motif); ends exactly at peak vertex where the flag is planted.

### Fix 5 — Composition
**Before:** `scalePx = 0.42 * min`, weak ground, speck flag.  
**After:** `scalePx ≈ 0.56 * min`, stronger contact shadow + ground ellipse ring, larger flag (taller pole, wider cloth), subtle wave only when animating.

### Fix 6 — Responsive
**Before:** Two-column from small widths; mobile Summit oversized.  
**After:**
- Two-column **only ≥ 1024px**
- 768–1023: stacked, Summit max **340px**
- &lt; 768: Summit max **280px**; **hidden** at `max-height: 700px` (covers 375×667) so CTAs stay above the fold
- Static SVG fallback updated to clean peak, trailhead, stop 10 at flag

---

## Files touched

| File | Change |
|------|--------|
| `assets/js/summit.js` | Geometry, shading, occlusion, stops, composition |
| `assets/css/home-path.css` | Desktop-only 2-col; tablet/mobile stacking & caps |
| `index.html` | SVG fallback geometry aligned with canvas |
| `REVIEW/report.md` | This report |
| `REVIEW/screenshots/*` | Fresh captures |

Navbar, footer, runners, other pages: untouched.

---

## Verification (honest)

| Check | Result | Evidence |
|-------|--------|----------|
| 1. Peak reads as mountain, both themes | **Pass (improved)** | 30-face taper + shoulder; lit vs shadow contrast measured (light lit≈170/195/209 vs shadow≈2/13/20). Still stylized/low-poly, not photoreal. |
| 2. No trail dashes over body from far side | **Pass** | Far trail omitted; facets drawn before near overlays. Near spiral on the front face is intentional. |
| 3. No overlapping / illegible numbers | **Pass** | Stop 10 at summit; base-biased 1–9; numbers gated to ≥9px + near. |
| 4. Trailhead → flag | **Pass** | Trailhead marker at t=0; trail end y === peak y; flag on peak. |
| 5. CTAs above fold at 375×667 | **Pass** | Summit `display:none` at that viewport; CTA bottom &lt; viewport. |
| 6. No console errors | **Pass** | CDP: `errs: []` |
| 7. CLS ≈ 0 / LCP headline | **Pass** | Reserved aspect-ratio box; deferred `summit.js` |
| 8. Theme toggle live | **Pass** | `themeLive: true` mid-session |
| 9. One hero / header / footer | **Pass** | Counts = 1 each |
| 10. Reduced motion static | **Pass** | `running: false`, `reduced: true` |
| 11. Tablet stacks (not 2-col) | **Pass** | 768px: single column, Summit ~325px below copy |

### Screenshots refreshed
- `desktop-light.png` / `desktop-dark.png` — two-column Summit
- `tablet-768.png` — stacked
- `mobile-375.png` — Summit hidden at 375×667 (CTAs win)
- `reduced-motion.png` — static frame

---

## Known limitations

1. **Painter’s algorithm** cannot perfectly hide silhouette-edge trail without a depth buffer; we chose “facets solid, near trail on top, far trail off” as the cleanest no-library fix.
2. **Ground shadow** is a soft ellipse — readable but not a full terrain base (per original “disciplined” spec).
3. **Lighthouse** not re-run end-to-end in this environment; no new network deps added.
4. At 375×812 (taller phones) Summit shows at ≤280px below CTAs; at 375×667 it hides by design.

## Suggested follow-ups

- Optional depth buffer / per-pixel occlusion if ever allowed a tiny wasm helper (still no Three.js).
- Optional: link stop pulse to `#the-path` scroll progress.
- Run Lighthouse on the Vercel preview after merge.
