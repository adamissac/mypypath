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

## Local development

The site is static, but accounts, progress sync, and the test suite need Node:

```bash
npm install                 # test tooling + firebase-tools
npm test                    # unit tests (vitest, jsdom)
npm run test:rules          # Firestore rules tests (starts the emulator; needs Java)

# Auth + Firestore emulators for working on account features locally
npx firebase emulators:start --only auth,firestore
```

`assets/js/firebase-config.js` holds the Firebase **web config**, not secrets. That
config is public by design: access control lives in `firestore.rules`, and sign-in is
limited to the Authorized Domains list in the Firebase console. Served from
`localhost`, the app connects to the emulators instead of production.

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
