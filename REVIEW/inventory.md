# PyPath — Site Inventory (v2)

**Generated:** 2026-06-18  
**Stack:** Static multi-page HTML / CSS / vanilla JavaScript (no framework build at deploy time)  
**Repo:** `/workspace`  
**Live:** https://www.mypypath.com

---

## Stack & shared UI

| Layer | Mechanism |
|-------|-----------|
| **Pages** | 117 static `.html` files served from repo root (Vercel, `buildCommand: null`) |
| **Design system** | `assets/css/pypath-fast.css` (tokens, motion, hero, nav, interior polish) + `assets/css/style.css` (lesson layouts, legacy) |
| **Nav / footer** | Baked into every page via `scripts/bake_layout.py` (`HEADER` / `FOOTER` constants) |
| **Runtime** | `assets/js/core.js` (nav, year, sidebar, settings export/reset), `assets/js/theme.js` (preferences) |
| **Code runner** | `assets/js/pyodide-loader.js` (`Pyodide.runCode`) → used by `hero-editor.js`, `lesson-runner.js`, `sandbox.js` |
| **Icons** | `assets/js/icons.js` (`PyIcons`) + inline SVG in HTML |

### Design migration state

| Area | CSS / components |
|------|------------------|
| **Homepage (new)** | `body.page-home`, `.hero--live`, hero editor in `hero-editor.js` |
| **Interior pages** | Same stylesheets; body classes: `page-unit`, `page-curriculum`, `page-sandbox`, `page-about`, `page-certs`, `page-settings`, `page-404` |
| **Lessons** | `layout-course`, baked rich nav, `lesson-runner.js`, CodeMirror theme `pypath` |

---

## Page counts

| Category | Count |
|----------|------:|
| Top-level | 8 |
| Unit landings | 10 |
| Lessons | 99 |
| **Total HTML** | **117** |

---

## Top-level routes

| Route | File |
|-------|------|
| `/` | `index.html` |
| `/curriculum.html` | `curriculum.html` |
| `/sandbox.html` | `sandbox.html` |
| `/settings.html` | `settings.html` |
| `/404.html` | `404.html` |
| `/learn.html` | `learn.html` (redirect → curriculum) |

---

## Unit landings

| Unit | File | Title |
|------|------|-------|
| 1 | `units/unit-1.html` | Foundations |
| 2 | `units/unit-2.html` | Control Flow |
| 3 | `units/unit-3.html` | Functions |
| 4 | `units/unit-4.html` | Data Structures |
| 5 | `units/unit-5.html` | Modules & Packages |
| 6 | `units/unit-6.html` | OOP |
| 7 | `units/unit-7.html` | Files & Errors |
| 8 | `units/unit-8.html` | Testing |
| 9 | `units/unit-9.html` | APIs |
| 10 | `units/unit-10.html` | Certification Prep |

Unit landings list lessons in **pedagogical order** (from first-lesson sidebar), not alphabetical.

---

## Lessons by unit

| Unit | Lessons |
|------|--------:|
| 1 Foundations | 8 |
| 2 Control Flow | 11 |
| 3 Functions | 10 |
| 4 Data Structures | 10 |
| 5 Modules & Packages | 10 |
| 6 OOP | 10 |
| 7 Files & Errors | 10 |
| 8 Testing | 10 |
| 9 APIs | 10 |
| 10 Certification Prep | 10 |
| **Total** | **99** |

Lesson paths: `units/unit-N/<slug>.html` (see repo glob for full list).

---

## Canonical link map

| Destination | Canonical URL |
|-------------|---------------|
| Curriculum overview | `/curriculum.html` |
| Unit 1 start | `/units/unit-1/what-is-python.html` |
| Unit N start | First lesson per unit (see `FIRST_LESSON` in `scripts/bake_layout.py`) |
| Unit landing (optional hub) | `/units/unit-N.html` |
| Sandbox | `/sandbox.html` |
| Certifications | `/certifications.html` |
| About / team | `/about.html` |
| Settings | `/settings.html` |
| Home curriculum anchor | `/#curriculum` on `index.html` |

---

## Dev scripts

| Script | Purpose |
|--------|---------|
| `scripts/bake_layout.py` | Rebake nav/footer, unit landings, lesson fixes |
| `scripts/cleanup_lessons.py` | Remove duplicate inline Pyodide runners from lessons |
