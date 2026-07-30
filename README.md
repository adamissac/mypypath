# MyPyPath

Personalized academic and career guidance site with interactive Python lessons, curriculum pages, and a sandbox. Static HTML/CSS/JS Ã¢â‚¬â€ no build step required.

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

MIT Ã¢â‚¬â€ see [LICENSE](LICENSE).

See [CONTRIBUTING.md](CONTRIBUTING.md) for local validation steps.
## Troubleshooting

- Run `py -3 scripts/check_links.py` and `py -3 scripts/check_meta.py` before deploying.
- After editing shared layout, run `py -3 scripts/bake_layout.py` and commit regenerated HTML.
