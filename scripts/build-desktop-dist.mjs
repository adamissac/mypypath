#!/usr/bin/env node
// Stages a self-contained copy of the site into desktop-dist/ for the Tauri
// shell to embed. This is the ONLY place the desktop build diverges from the
// website's own HTML — the source pages under the repo root are never
// modified, so `git diff` on this repo never shows desktop concerns leaking
// into what Vercel deploys. See docs/superpowers/specs/ (or the PR that
// introduced this) for the full rationale.
//
// What it does, in order:
//   1. Wipe and recreate desktop-dist/
//   2. Copy every user-facing page + asset directory verbatim
//   3. Fetch (or reuse the cached, checksum-verified) vendored Pyodide,
//      CodeMirror and font files — see fetch-desktop-vendor.mjs
//   4. Rewrite the handful of absolute CDN URLs in the COPIED html files to
//      point at the vendored copies. Source HTML is untouched.
//   5. Append the desktop save/load bridge script tag to every copied page.
//      That script (assets/js/desktop-save-adapter.js) is a no-op outside a
//      Tauri webview, so this step doesn't need to special-case which pages
//      "need" it.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureVendorCache } from './fetch-desktop-vendor.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'desktop-dist');

const TOP_LEVEL_DIRS = ['assets', 'units', 'data'];

function copyStaticSources() {
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  const rootHtmlFiles = readdirSync(ROOT).filter((f) => f.endsWith('.html'));
  for (const f of rootHtmlFiles) {
    cpSync(path.join(ROOT, f), path.join(DIST, f));
  }

  for (const dir of TOP_LEVEL_DIRS) {
    const src = path.join(ROOT, dir);
    if (existsSync(src)) cpSync(src, path.join(DIST, dir), { recursive: true });
  }
}

function findAllHtmlFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) findAllHtmlFiles(p, out);
    else if (entry.name.endsWith('.html')) out.push(p);
  }
  return out;
}

function copyVendorAssets(cacheDir) {
  const vendorDir = path.join(DIST, 'assets', 'vendor');
  mkdirSync(vendorDir, { recursive: true });

  // Pyodide core + every dependency wheel live flat in one directory: that's
  // the layout Pyodide's own indexURL auto-detection and loadPackage() both
  // assume (wheel URLs are indexURL + file_name from pyodide-lock.json).
  const pyodideDir = path.join(vendorDir, 'pyodide');
  mkdirSync(pyodideDir, { recursive: true });
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'desktop-vendor-manifest.json'), 'utf8'));
  for (const file of manifest.files) {
    const isCodeMirror = file.dest.startsWith('codemirror/');
    const isFont = file.dest.startsWith('fonts/');
    const destRel = isCodeMirror || isFont ? file.dest : path.join('pyodide', file.dest);
    const dest = path.join(vendorDir, destRel);
    mkdirSync(path.dirname(dest), { recursive: true });
    cpSync(path.join(cacheDir, file.dest), dest);
  }

  // fonts.css is a committed source file (small, deterministic, hand-fetched
  // once from Google Fonts and re-pointed at the vendored woff2 files) — not
  // part of the checksum-verified binary manifest above.
  cpSync(
    path.join(ROOT, 'assets', 'vendor', 'fonts', 'fonts.css'),
    path.join(vendorDir, 'fonts', 'fonts.css')
  );
}

const CM_CDN_PREFIX = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/';
const CM_LOCAL_PREFIX = '/assets/vendor/codemirror/';

const FONT_LINK_BLOCK = /\s*<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com" \/>\n\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin \/>\n\s*<link href="https:\/\/fonts\.googleapis\.com\/css2\?family=Plus\+Jakarta\+Sans[^"]*" rel="stylesheet" \/>/;
const FONT_LOCAL_LINK = '\n    <link rel="stylesheet" href="/assets/vendor/fonts/fonts.css" />';

const DESKTOP_SCRIPT_TAG = '    <script type="module" src="/assets/js/desktop-save-adapter.js"></script>\n';

function rewriteHtml() {
  const htmlFiles = findAllHtmlFiles(DIST);
  for (const p of htmlFiles) {
    let html = readFileSync(p, 'utf8');

    html = html.split(CM_CDN_PREFIX).join(CM_LOCAL_PREFIX);
    html = html.replace(FONT_LINK_BLOCK, FONT_LOCAL_LINK);

    if (html.includes('</body>')) {
      html = html.replace('</body>', `${DESKTOP_SCRIPT_TAG}  </body>`);
    }

    writeFileSync(p, html);
  }
}

function reportSize() {
  let total = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else total += statSync(p).size;
    }
  };
  walk(DIST);
  console.log(`[build-desktop-dist] staged ${(total / 1024 / 1024).toFixed(1)} MB at ${path.relative(ROOT, DIST)}/`);
}

async function main() {
  copyStaticSources();
  const cacheDir = await ensureVendorCache();
  copyVendorAssets(cacheDir);
  rewriteHtml();
  reportSize();
}

main().catch((err) => {
  console.error('[build-desktop-dist]', err);
  process.exit(1);
});
