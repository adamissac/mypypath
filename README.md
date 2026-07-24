# MyPyPath

Personalized academic and career guidance site with interactive Python lessons, curriculum pages, and a sandbox. Static HTML/CSS/JS — no build step required.

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

Utility scripts under `scripts/` help with layout baking, navigation fixes, and page upgrades. Prefer editing shared assets in `assets/` so changes apply site-wide.
