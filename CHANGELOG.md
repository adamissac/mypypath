# PyPath Motion Upgrade — CHANGELOG

## Foundation
- Added `assets/css/motion.css` with motion tokens, reveal system, reduced-motion guards, backgrounds, mobile nav, focus rings, view transitions
- Added `assets/js/motion.js` — shared IntersectionObserver reveal, count-up, smooth anchors
- Added `assets/js/icons.js` — inline Lucide-style SVG helpers (zero CDN dependency)
- Added `assets/js/layout.js` — unified header/footer injection across all pages
- Added `assets/js/backgrounds.js` — aurora, constellation canvas, cursor glow, noise layers
- Added `assets/js/home.js` — hero typewriter, code reveal, copy button, feature tilt
- Added `assets/js/lesson-ui.js` — reading progress bar, copy snippet buttons, run-state polish
- Refactored `animations.js`, `main.js`, `theme.js` for motion system integration
- Fixed `sandbox.js` to only init on sandbox page; icon toolbar + run/output animations

## Site-wide fixes (§10)
- Removed mobile warning banner
- Real mobile nav drawer with hamburger animation, backdrop, Esc to close
- Sticky header condenses on scroll with blur
- Unified footer links + real logo image on all pages
- Dynamic copyright year via `#year`
- Replaced two-letter badges with SVG icons (home features, cert cards, lesson headers)
- Replaced sandbox emoji buttons with icons
- Removed erroneous `sandbox.js` from ~99 lesson pages (was causing init errors)
- `learn.html` redirects to `curriculum.html`
- ARIA improvements on dropdowns, mobile nav, cert accordions, sidebar toggle

## Pages
- **Home** — full hero glow-up, team photos, testimonials monograms, animated backgrounds
- **Lessons** — faint noise background, reading progress, motion scripts (Pyodide untouched)
- **Sandbox** — pro toolbar, run spinner, output reveal, toasts
- **Certifications** — icon lockups instead of Py/Py+/IT/Jv badges

## Intentionally not changed
- Inline Pyodide init/run code in lesson HTML (99 files) — execution logic preserved
- Core lesson content, copy, and layout structure
- No framework migration or build step added

## How to preview
```bash
cd /Users/adami/Documents/python-website
python3 -m http.server 8080
# Open http://localhost:8080
```
