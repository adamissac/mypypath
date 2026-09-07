# Breakpoints

## The scale

```
480   640   768   900   980
```

Five values, and they are not invented — they are the ones already carrying the
site's weight. Census of every `@media` prelude in `assets/css/*.css`:

| px | uses |
|---|---|
| 980 | 15 |
| 640 | 7 |
| 768 | 6 |
| 900 | 3 |
| 480 | 2 |

Plus five min-widths, which pair with these: 768, 981, 1024, 1400, 1600.

**A new page-level `max-width` breakpoint must come from the scale.**
`tests/css-breakpoints.test.js` fails on one that does not.

## The count, corrected twice

The audit reported "~10 distinct max-width breakpoints (600, 768, 900, 920,
980, 1000, 1024, 1120, 1200, 1400) with no evident system".

A naive grep for `max-width: <n>px` across the stylesheets returns **30**,
which is what the first version of this guard measured and reported.

Both are wrong. The real figure is **14**.

The 30 included ordinary `max-width` **properties** on elements — the 360px cap
on a card in `.uses-grid`, the 520px cap on a panel. Counting a card's width as
a page breakpoint is how you come to believe the site has three times the
layout complexity it has. Several of the audit's ten (1000, 1120, 1200, 1400,
920) are not media queries at all.

The scanner in the test now reads only inside an `@media` prelude.

## Why 14 is not 14 problems

**The one-less-than pattern.** `767` and `1023` are not typos for 768 and 1024.
They are the deliberate upper bound of a range whose lower bound is the round
number:

```css
@media (max-width: 767px) { /* phone  */ }
@media (min-width: 768px) { /* tablet */ }
```

Rounding them makes **both** queries match at exactly 768px, which is a
regression, not a tidy-up. They stay, and the test asserts the pairing.

**Genuine one-offs.** 520, 560, 700, 720, 820, 960, 1024 are single-use page
breakpoints that drifted in before there was a scale. They are grandfathered by
value, so they cannot multiply — a *new* one fails the test — and each is a
small future cleanup rather than a licence.

## Why this is a guard and not a refactor

Consolidating breakpoints across six stylesheets means touching every layout on
the site. The two cascade traps recorded in `CLAUDE.md` are what that looks like
when it goes wrong: a rule that is correct and silently inert because another
file loads after it, invisible until something is measured.

The measured state is good — `npm run test:mobile` reports **0 of 28**
page/viewport combinations with a problem. So the valuable move is to stop the
drift, not to risk what already works.

## Checking

```bash
npm run test:mobile     # 390x844 and 768x1024, real device emulation
npm test                # includes the breakpoint guard
```
