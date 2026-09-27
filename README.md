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

## Desktop app

PyPath also ships as a native desktop app (Windows/macOS/Linux) via
[Tauri](https://tauri.app), built from this same codebase — the desktop app is
a native window around the same HTML/CSS/JS, not a separate rewrite. It's
designed to work fully offline after installation: lessons, the sandbox, and
running/checking Python code (via a locally bundled Pyodide) never require a
network connection. Signing in, cloud sync, classroom features, and
certificates still need one when you use them — the app doesn't disable them,
it just doesn't require them for anything else.

### How it stays one codebase

- `src-tauri/` is the native shell (Rust). It embeds a *staged copy* of the
  site, never the repo root directly.
- `scripts/build-desktop-dist.mjs` builds that copy into `desktop-dist/`
  (gitignored): every page and asset directory verbatim, plus the vendored
  Pyodide/CodeMirror/font files in place of their CDN originals. This is the
  **only** place desktop and website diverge — the HTML source under the repo
  root, what Vercel deploys, is never modified by any of this.
  `assets/js/pyodide-loader.js` is the one shared source file with
  desktop-aware logic, and it's a three-line, purely additive branch
  (`window.__TAURI_INTERNALS__` is never present in a real browser, so the
  website's behavior there is unchanged).
- `scripts/desktop-vendor-manifest.json` records the exact URL and sha256 for
  every vendored file (Pyodide + its numpy/pandas dependency wheels,
  CodeMirror, two Google Fonts families). `scripts/fetch-desktop-vendor.mjs`
  fetches and verifies them into a gitignored `.vendor-cache/`, once — a
  checksum mismatch fails the build rather than silently using whatever a CDN
  happened to serve. **Building the app needs network once** (or a warm
  cache) to populate that cache; the packaged installer that results does not.

### Developing

```bash
npm install                 # once — also installs @tauri-apps/cli
npm run desktop:dev         # stages desktop-dist/, opens a live dev window
```

The first `desktop:dev`/`desktop:build` also needs a Rust toolchain
([rustup.rs](https://rustup.rs), or `brew install rust` on macOS) and, on
Linux, the usual Tauri system dependencies (see
[Tauri's prerequisites guide](https://tauri.app/start/prerequisites/)) — none
of that is needed to just run the website.

### Building an installer

```bash
npm run desktop:build       # produces a platform-native installer/bundle
```

Output lands under `src-tauri/target/release/bundle/` — a `.dmg`/`.app` on
macOS, an `.msi`/NSIS `.exe` on Windows, and a `.deb`/`.rpm`/AppImage on
Linux, depending on the machine you build on (Tauri doesn't cross-compile
installers by default; build each platform's installer on that platform, or
in that platform's CI runner).

### Save locations

Progress is written to a single JSON file, separate from the website's
`localStorage`/Firestore storage — a distinct adapter behind the same
`ProgressStore` interface the site already uses for cloud sync (see
`assets/js/desktop-save-adapter.js`). Autosaves after any progress change
(debounced a few seconds), and on quitting.

Default location:

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/com.pypath.desktop/progress.json` |
| Windows | `%APPDATA%\com.pypath.desktop\progress.json` |
| Linux | `~/.local/share/com.pypath.desktop/progress.json` |

Settings → **Save file** shows the exact current path, and lets you pick a
different one (**Save as…**), or open a save from elsewhere (**Open a save
file…**) — useful for keeping separate saves (e.g. one per learner sharing a
computer) or moving progress between machines. The app remembers the last
file you used and reopens it automatically next launch.

### Backup / restore

The save file is a plain, human-readable JSON document — back it up by
copying it, the same as any other document. To restore: **Settings → Open a
save file…** and pick the backup. Opening a file only ever adds/overwrites the
keys that file contains via a safe merge — it never deletes unrelated local
data, and never touches a signed-in account's cloud data even if you happen to
be signed in at the time.

A missing or corrupted save file is never treated as "start over": the app
leaves whatever's already loaded alone and reports the problem (a toast, and
the error text in Settings → Save file) rather than silently resetting
progress.

### Known limitations

- **Sign-in, cloud sync, classroom, and certificates need a network
  connection**, same as the website — the desktop app doesn't add offline
  support for these (a certificate's trust model specifically depends on
  server-side verification, so an offline version would be meaningless), it
  just doesn't require them for anything else.
- **Building requires network once** to populate the vendor cache (see
  above). Re-running the build offline after that first fetch works from
  the cache.
- **Pyodide's version is pinned** to what `scripts/desktop-vendor-manifest.json`
  records (`v0.24.1` at the time of writing). If the website's
  `assets/js/pyodide-loader.js` is ever upgraded to a newer Pyodide, the
  manifest needs a matching update — nothing currently checks that the two
  stay in sync automatically.
- **The app icon** was generated from the existing 180×180
  `assets/img/apple-touch-icon.png`; a higher-resolution source (ideally
  1024×1024) would produce a sharper icon, particularly on macOS's larger
  Dock sizes and Windows' jumbo tile.
- **Offline behavior was verified via**: a static audit confirming
  `desktop-dist/` contains no remaining external CDN references for
  Pyodide/CodeMirror/fonts, an automated test asserting Pyodide's `<script>`
  source resolves to the local vendored copy inside Tauri
  (`tests/desktop-pyodide-url.test.js`), and a live `tauri dev` run whose
  network log showed zero external requests. It was **not** verified by
  physically disconnecting the network during a full click-through — do that
  once (e.g. turn off Wi-Fi, then open a few lessons and run some code)
  before relying on this for a real offline scenario like a flight or a
  school with a restrictive content filter.

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

See [CONTRIBUTING.md](CONTRIBUTING.md) for local validation steps.
## Troubleshooting

- Run `py -3 scripts/check_links.py` and `py -3 scripts/check_meta.py` before deploying.
- After editing shared layout, run `py -3 scripts/bake_layout.py` and commit regenerated HTML.
