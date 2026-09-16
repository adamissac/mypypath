# Lesson experience and teaching improvements

## Scope

- Restored the previous purple-and-gold Data logo.
- Applied a reading-first layout to both courses: calmer surfaces, clearer practice areas, larger controls, wrapping code examples and visible keyboard guidance.
- Added an accessible section navigator, including asynchronously loaded knowledge checks. Native anchor links preserve navigation history and move keyboard focus to the destination.
- Fixed a mobile CodeMirror gutter offset that covered the first characters after scrolling.
- Fixed low-contrast practice badges, save buttons and Foundations accent text in dark mode.
- Added prediction, output, explanation and a follow-up variation to all six lessons in Data Unit 1, plus Foundations’ first-program and variables/types lessons.
- Clarified exercise contracts and added six grading cases for zero values, CSV file paths/column order, negative/repeated values and unequal group sizes.
- Moved the redesigned course picker into a source template so curriculum rebuilds preserve it.

## Verification

- Full suite: 98 files passed; two structural failures were found (breakpoint scale and two heading levels). Both were corrected, and the final focused run passed all 51 tests across five files, including nine lesson-flow/worked-example checks.
- All 314 Data-course tests passed, including correct and intentionally wrong exercise solutions executed in real Python.
- All 159 check files pass validation.
- Real-browser lesson checks: Data and Foundations, 390px/1440px, light/dark. Verified section navigation, answer disclosure, editor character visibility, no overflow and accessibility. Real Python run returned 5; Reset restored the CSV starter.
- Course-page/theme regression: all four viewport/theme combinations passed.
- Site accessibility: zero violations and zero undersized targets. Mobile: zero issues across 34 combinations. Keyboard, reduced-motion and performance audits passed.
- Course rebuild reproduced the same output. Trail generator and whitespace checks passed.

The teaching additions cover eight introductory lessons. Shared layout and theme fixes apply across both courses; this is not a claim that every lesson has been rewritten.
