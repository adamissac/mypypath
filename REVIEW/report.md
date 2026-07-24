# Lesson page side-margin fix

**Date:** 2026-07-24  
**Branch:** `cursor/lesson-page-side-margins-75cb`  
**Page verified:** `/units/unit-8/what-is-debugging.html`

---

## Problem

`.page-unit .layout-course` used asymmetric side padding that was also tighter than the site-wide `.container` gutter:

| Side | Previous value |
|------|----------------|
| Right | `clamp(1.5rem, 4vw, 3.25rem)` |
| Left | `clamp(1.25rem, 3vw, 2.5rem)` |

Site-wide container gutters use `clamp(1.5rem, 4.5vw, 3.5rem)` on both sides.

---

## Change

**File:** `assets/css/pypath-theme.css`

1. **`.page-unit .layout-course`** — equal left/right padding matching the container gutter:

```css
padding: 0 clamp(1.5rem, 4.5vw, 3.5rem) 1.5rem !important;
```

2. **`body.sidebar-closed .page-unit .layout-course`** — same clamp for the closed-sidebar override:

```css
padding-left: clamp(1.5rem, 4.5vw, 3.5rem) !important;
```

---

## Verification (Chrome headless)

Measured computed padding on `.layout-course` at `/units/unit-8/what-is-debugging.html`:

| Viewport | Width | padding-left | padding-right | Symmetric? | Overflow? | Grid |
|----------|-------|--------------|---------------|------------|-----------|------|
| Mobile | 390px | 16px (`1rem` mobile override) | 16px | Yes | No | Single column |
| Laptop | 1280px | 56px (`3.5rem`) | 56px | Yes | No | `248px` + content |
| Large | 1600px | 56px (`3.5rem`) | 56px | Yes | No | `248px` + content |
| XLarge | 1920px | 56px (`3.5rem`) | 56px | Yes | No | `248px` + content |

At desktop widths, left and right edge gaps are both **56px**, matching the site-wide container max gutter. The sidebar + content grid stays intact with no horizontal overflow.
