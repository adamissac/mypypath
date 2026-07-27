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
- New class / keyframe: `.logo-spin-wrap`, `@keyframes pp-logo-idle-rotate` (16s linear infinite)
- Ambient spin lives on a wrapper so it does not collide with `motion.js` pointer-tilt / click-flip on `.logo`
- Left alone: footer `logo small`, `lesson-format-kit/`
- Dead-code note: `assets/js/layout.js` is orphaned (never script-loaded); `core.js` `headerHtml()` / `footerHtml()` are defined but never called — consider wiring one up or deleting both later
