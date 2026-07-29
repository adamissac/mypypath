# Merged site updates

## Footer spacing
Footer `.container` is full-width with the same side gutters as the header (24px, 36px ≥1400px), so the copyright block is not inset in a narrow centered box.

## Remove Certifications
- Deleted `certifications.html`
- Removed Certifications from header nav and footer on every page
- Replaced home “Certification track” CTA with curriculum
- Renamed Unit 10 **Certification Prep → Capstone Project**

## Summit hero
- Static transparent Summit mountain beside PyPath on the home hero
- Trail stops 1–10 in order
- Recolored to site theme blues

## Header mountain logo idle-spin
- Files changed: 114 HTML pages + `assets/css/pypath-theme.css` + `assets/js/core.js`
- New class / keyframe: `.logo-spin-wrap`, `@keyframes pp-logo-idle-rotate` (12s linear infinite)
- Ambient spin lives on a wrapper so it does not collide with `motion.js` pointer-tilt / click-flip on `.logo`
- Hover no longer pauses the idle spin (only click-flip via `:has(.is-spinning)` does)
- Left alone: footer `logo small`, `lesson-format-kit/`
- Dead-code note: `assets/js/layout.js` is orphaned (never script-loaded); `core.js` `headerHtml()` / `footerHtml()` are defined but never called — consider wiring one up or deleting both later

## Settings cleanup
- Removed Animated UI toggle (was disabling motion site-wide via `pypath-motion`)
- Removed placeholder / low-value settings: accent color, tooltips, focus mode, progress notifications, auto-save, keyboard shortcuts, study reminders
- Kept: theme, font size, compact layout, code editor theme, lesson sidebar, export/reset
- `theme.js` now clears legacy `pypath-motion` on load; motion respects OS `prefers-reduced-motion` only

## Inspire banner contrast
- Fixed “Inspired by C.S. Awesome” readability: banner used theme `--pp-line` tokens that go pale in dark mode, washing out the text
- Locked deep blue gradient (`#075985` → `#0284c7`) and forced white text/link so it stays readable in light and dark
