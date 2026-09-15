# Course visuals and palette polish

## Changes

- Brightened the Data logo to lemon yellow and purple, preserving its silhouette and transparent background.
- Added a gently floating moon, orbiting satellite, moving orbital dashes and softly changing stars. All motion stops under `prefers-reduced-motion`.
- Added shared syntax colors for the home code preview and CodeMirror lesson editors, including light/dark code blocks, editor backgrounds, gutters, cursor, selections, boot console and check-button hover.
- Removed CSS gradients throughout the site and the gradient in the fallback avatar. Surfaces use solid colors.
- Replaced the two plain course links with illustrated expedition cards, clear prerequisites, skills, unit counts and free-unit information. Course destinations remain unchanged.
- Versioned the changed shared assets so returning browsers fetch the new designs.

## Verification

- 24 focused theme/trail unit tests passed.
- Browser regression at 390px and 1440px, light and dark: course links, no horizontal overflow, accessibility, Data syntax colors in home and lesson editors, flat surfaces and reduced motion.
- Course-transition regression: confirm, decline, Escape, retry and exclusive mountain/moon at desktop/mobile, with and without reduced motion.
- Normal-motion browser check: moon float and satellite orbit active, mountain absent.
- Full site accessibility, mobile, keyboard, reduced-motion and performance audits.
- Generator consistency and `git diff --check`.

Screenshots: `screenshots/courses-expeditions-1440.png` and `screenshots/courses-expeditions-390.png`.
