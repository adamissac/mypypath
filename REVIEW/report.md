# The Summit — hero companion (static)

**Branch:** `cursor/summit-hero-animation-15a6`  
**Local:** http://127.0.0.1:3000/  
**Screenshots:** `REVIEW/screenshots/`

## What shipped

Static Summit graphic beside the PyPath hero title — **no canvas, no animation**.

- Asset: `assets/img/summit.png` (low-poly peak, dashed spiral trail, stops 1–10, summit flag)
- Markup: plain `<img class="home-summit__art">` in `index.html`
- Styles: `assets/css/home-path.css` (layout / responsive only)
- Removed: `assets/js/summit.js` (animated canvas approach abandoned per feedback)

## Layout

| Breakpoint | Behavior |
|---|---|
| ≥1024px | Two-column hero: copy left, Summit right |
| 768–1023 | Stacked; Summit capped ~340px |
| &lt;768 | Summit capped ~280px; hidden when `max-height: 700px` so CTAs stay above the fold |

## Acceptance

| Check | Status |
|---|---|
| Looks like the reference mountain (not lumpy 3D canvas) | Pass — static PNG |
| Does not need to move | Pass — no JS / no motion on Summit |
| Stops 1–10 + flag visible | Pass |
| Theme / other pages untouched | Pass |
| Navbar / footer / path journey unchanged | Pass |
