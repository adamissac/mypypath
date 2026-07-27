# MyPyPath

Personalized academic and career guidance site with interactive Python lessons, curriculum pages, and a sandbox. Static HTML/CSS/JS — no build step required.

**Live site:** https://www.mypypath.com

## Quick start

```bash
# from this directory
python3 -m http.server 8080
```

Open http://localhost:8080

Or deploy the repo root as a static site (Vercel config is in `vercel.json`).

## Layout

| Path | Purpose |
|------|---------|
| `index.html` | Home |
| `curriculum.html` / `units/` | Course units |
| `sandbox.html` | In-browser practice |
| `assets/` | CSS, JS, images |
| `lesson-format-kit/` | Portable lesson layout kit |
| `DEPLOYMENT.md` | Deploy to Vercel |

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/bake_layout.py` | Bake shared header/footer into HTML pages |
| `scripts/check_links.py` | Verify local links resolve (used in CI) |
| `scripts/generate_sitemap.py` | Regenerate `sitemap.xml` after adding pages |
| `scripts/cleanup_lessons.py` | Lesson HTML cleanup utilities |

Prefer editing shared assets in `assets/` so changes apply site-wide.

## License

MIT — see [LICENSE](LICENSE).
