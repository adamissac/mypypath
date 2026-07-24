<<<<<<< HEAD
# Footer spacing fix

**Branch:** `cursor/footer-spacing-15a6`

## Problem
Footer `.container` used the narrow `min(1120px, 92%)` box plus heavy side padding, so the PyPath / tagline / © 2026 block sat with large empty gaps on the left and right.

## Fix
In `assets/css/pypath-theme.css`, make `.site-footer .container` full-width and use the same side gutters as the header (24px, 36px ≥1400px).

## Result
Footer content start aligns with header content start (36px at 1440px width).
=======
# Remove Certifications

**Branch:** `adami/remove-certifications-15a6`

## Removed
- `certifications.html` page
- Certifications nav tab (header) and footer link on every page
- Home “Certification track” CTA (replaced with curriculum)
- Unit 10 “View Certifications” CTAs
- Certifications-only CSS
- Unit 10 title renamed **Certification Prep → Capstone Project** (nav, curriculum, path map)

## Verify
- `/certifications.html` → 404
- Primary nav: Home, Units, Sandbox, Settings (no Certifications)
>>>>>>> origin/adami/remove-certifications-15a6
