#!/usr/bin/env node
// Fetches the third-party runtime assets the desktop build vendors locally
// (Pyodide + its numpy/pandas dependency wheels, CodeMirror, the two Google
// Fonts families) so the packaged app never calls out to a CDN at runtime.
//
// Downloads are cached under .vendor-cache/ (gitignored, not part of the
// website) and verified against the checksums recorded in
// desktop-vendor-manifest.json. A cache hit that matches its recorded sha256
// is never re-downloaded; a mismatch is treated as a corrupt/tampered file
// and re-fetched once before failing loudly. This manifest is the only place
// that needs updating to bump a vendored version.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(ROOT, '.vendor-cache');
const MANIFEST_PATH = path.join(ROOT, 'scripts', 'desktop-vendor-manifest.json');

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function cachedAndValid(destPath, expectedSha) {
  if (!existsSync(destPath)) return false;
  return sha256(readFileSync(destPath)) === expectedSha;
}

async function fetchOnce(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed (${res.status}): ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function ensureVendorCache() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  let fetched = 0;
  let cached = 0;

  for (const file of manifest.files) {
    const destPath = path.join(CACHE_DIR, file.dest);
    if (cachedAndValid(destPath, file.sha256)) {
      cached++;
      continue;
    }

    mkdirSync(path.dirname(destPath), { recursive: true });
    const buf = await fetchOnce(file.url);
    const actual = sha256(buf);
    if (actual !== file.sha256) {
      throw new Error(
        `checksum mismatch for ${file.dest}\n` +
        `  expected ${file.sha256}\n` +
        `  actual   ${actual}\n` +
        `  url      ${file.url}\n` +
        'Refusing to use this file — either the CDN served something ' +
        'unexpected, or desktop-vendor-manifest.json needs updating for a ' +
        'deliberate version bump.'
      );
    }
    writeFileSync(destPath, buf);
    fetched++;
  }

  console.log(`[fetch-desktop-vendor] ${cached} cached, ${fetched} fetched (${manifest.files.length} total)`);
  return CACHE_DIR;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ensureVendorCache().catch((err) => {
    console.error('[fetch-desktop-vendor]', err.message);
    process.exit(1);
  });
}
