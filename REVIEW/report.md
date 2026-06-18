# PyPath — Full Site Review Report (v2)

**Date:** 2026-06-18  
**Branch:** `cursor/full-site-review-v2-0892`  
**Scope:** Entire static site (117 HTML pages)

---

## 1. Stack detected

| | |
|-|-|
| **Stack** | Static multi-page HTML, CSS, vanilla JS |
| **Deploy** | Vercel static hosting (`vercel.json`, no build step) |
| **Shared UI before** | Per-page copy-paste nav/footer variants; inline Pyodide runners duplicated across ~57 lessons |
| **Shared UI after** | `scripts/bake_layout.py` bakes one header/footer into all pages; `Pyodide.runCode()` shared by hero, lessons, sandbox; `lesson-runner.js` is the single lesson editor/runner |

---

## 2. Design-system migration summary

The redesigned homepage (`body.page-home`, live hero editor, `pypath-fast.css` tokens) was already merged to `main` before this pass. Interior pages load the same `style.css` + `pypath-fast.css` pair and baked rich navigation.

**This pass extended consistency by:**

- Removing legacy per-lesson inline CodeMirror init (monokai theme) in favor of shared `lesson-runner.js` + `pypath` theme
- Standardizing run button label to **Run** and shortcut **⌘/Ctrl+Enter** on lesson editors
- Fixing unit landing lesson lists to pedagogical order (matching sidebars)
- Aligning Unit 10 sidebar label with nav (“Certification Prep”)
- Removing letter monogram fallbacks (A/R/P) on homepage founder photos

Further visual polish (making every interior page match the hero’s editorial density) remains incremental — structure and shared systems are now unified.

---

## 3. Page inventory

See [`REVIEW/inventory.md`](inventory.md).

| | Count |
|-|------:|
| Top-level pages | 8 |
| Unit landings | 10 |
| Lessons | 99 |
| **Total** | **117** |

---

## 4. Bugs found & fixes

### Already resolved before this v2 pass (verified on `main`)

| # | Issue | Status |
|---|-------|--------|
| 1 | Two different navbars | **Fixed** — baked rich nav everywhere |
| 2 | Multiple footer variants | **Fixed** — one `site-footer` baked |
| 3 | Missing copyright year | **Fixed** — `#year` + `core.js` |
| 4 | Placeholder unit pages | **Fixed** — real unit landings with lesson lists |
| 6 | Footer Curriculum wrong on some pages | **Fixed** — `/curriculum.html` in baked footer |
| 7 | Emoji sandbox buttons | **Fixed** — text + `PyIcons` |
| 8 | Homepage “0 Units” stat | **Resolved** — stats band removed in hero redesign |
| 5 (certs) | Letter cert badges | **Fixed** — SVG lockups on certifications page |

### Fixed in this v2 pass

| # | Issue | Root cause | Fix |
|---|-------|------------|-----|
| 9 | About qualifications duplicated/scrambled | Legacy expand panels with bad data mapping | **Previously removed** in redesign — page now shows team cards only; no duplicate content remains |
| 10 | Stale About meta / name inconsistency | Old single-creator copy | Meta updated to 3-person team; on-page uses “Adam Issac” consistently |
| 11 | Three code-runner implementations | Separate Pyodide glue in hero, lessons (inline), sandbox | Added `Pyodide.runCode()` in `pyodide-loader.js`; hero/lesson/sandbox use it; label standardized to **Run** |
| 11b | 57 lessons with inline runner overrides | Copy-paste `<script>` blocks shadowing `lesson-runner.js` | `scripts/cleanup_lessons.py` strips duplicates; keeps `window.exerciseSolutions` only |
| 11c | Inconsistent “Run Code” label | Lesson template copy | Bulk rename to **Run**; placeholder “Press Run to see output” |
| — | Unit landing lesson order wrong | Alphabetical sort in bake script | Order from first-lesson sidebar via `lesson_order_for_unit()` |
| — | Unit 10 “Final Projects” vs “Certification Prep” | Stale sidebar copy | Bake replace → Certification Prep |
| — | Lessons loading monokai CodeMirror theme | Legacy inline init | Removed inline scripts; bake strips monokai CSS link |
| — | Settings Export button dead | No handler | Wired in `core.js` → downloads `pypath-settings.json` |
| 5 (home) | Founder letter fallbacks A/R/P | `onerror` monogram divs | Removed; photos only with proper `alt` text |

### Intentionally left / limitations

| Item | Why | Recommendation |
|------|-----|----------------|
| About “View Qualifications” panels | Removed in prior redesign to eliminate duplication; restoring requires correct per-person source content from team | Re-add qualifications as structured data (one JSON/JS object per person) if product wants them back |
| Lighthouse Best Practices on lessons | CodeMirror + Pyodide loaded from CDN (third-party cookies/scripts) | Self-host or accept ~96 cap; noted in prior audit |
| Lesson heading hierarchy (`h2`→`h4`) | Deeply embedded in lesson HTML templates | Batch template pass: add `h3` section titles or demote card headings |
| 404 on Vercel | `404.html` exists; host must serve it for unknown routes | Confirm in Vercel project settings (should work by default) |
| `assets/js/layout.js`, `home.js` | Orphan files, unused | Safe to delete in a cleanup PR |

---

## 5. Lighthouse (key pages)

Scores depend on CDN latency and Pyodide download. Prior pass measurements (local `npx serve`):

| Page | Performance | Accessibility | Best Practices | SEO |
|------|-------------|---------------|----------------|-----|
| Home | ~97 | ~98 | ~96 | ~100 |
| Lesson (unit-1) | ~98 | ~96 | ~96 | ~91 |
| Sandbox | ~98 | ~96 | ~96 | ~91 |
| Certifications | ~98 | ~98 | ~100 | ~100 |
| About | ~98 | ~96 | ~100 | ~100 |
| Settings | ~98 | ~96 | ~100 | ~100 |

Re-run Lighthouse after deploy to confirm; lesson/sandbox Best Practices may stay below 100 due to CDN scripts.

---

## 6. Manual verification checklist

1. **Home** — Hero Run + `⌘↵` executes Python; output/error states show; founder photos load (no letter fallback).
2. **Curriculum** — Unit cards open unit landings or first lessons; footer Curriculum → `/curriculum.html`.
3. **Unit landing** — Lessons listed in teaching order; Start Unit CTA works.
4. **Lesson** — Run button works; `⌘↵` runs code; Reset/Clear Saved work; sidebar toggle keyboard-accessible; prev/next across unit boundaries.
5. **Sandbox** — Create/save/load/delete projects; Run works; icons on toolbar.
6. **Certifications** — Cards expand with keyboard; Map to Units → curriculum.
7. **About** — Three team cards, correct meta, contact links open.
8. **Settings** — Every toggle persists across pages; Export downloads JSON; Reset clears prefs.
9. **404** — Visit a bogus URL on production; styled 404 appears.
10. **Mobile** — Nav menu at 375px; no horizontal scroll on lesson tables.

---

## 7. Commits in this pass (logical groups)

1. `refactor: shared Pyodide.runCode for hero, lessons, sandbox`
2. `refactor: remove duplicate inline lesson runners; standardize Run label`
3. `fix: unit lesson order, Unit 10 naming, monokai removal, settings export`
4. `docs: REVIEW inventory and v2 report`
