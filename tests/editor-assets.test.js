import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/* Pyodide and CodeMirror belong on pages that can Run code. The baker used
 * to leave a full lesson stack on course landings (and the data-unit
 * overviews) because they share motion.js with lessons. scheduleWarmup()
 * then saw no editor and fetched 4.8MB anyway. */

const SKIP_DIRS = new Set(['node_modules', '.git', 'lesson-format-kit', 'REVIEW', 'docs', 'scripts']);

function pages() {
  return execFileSync('git', ['ls-files', '*.html'], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)
    .filter((rel) => {
      const parts = rel.split(/[\\/]/);
      return !parts.some((p) => p.startsWith('.') || SKIP_DIRS.has(p));
    });
}

function needsRuntime(rel, src) {
  const base = path.basename(rel);
  if (['index.html', 'sandbox.html', 'unit-test.html'].includes(base)) return true;
  return /interactive-editor|editor-container|hero-editor-code|id="code-editor"|code-editor-small/.test(src);
}

const RUNTIME = /pyodide-loader|cdnjs\.cloudflare\.com\/ajax\/libs\/codemirror/;

describe('only pages with an editor load the Python runtime', () => {
  const all = pages();

  it('finds the public pages', () => {
    expect(all.length).toBeGreaterThan(150);
  });

  it('keeps Pyodide on the homepage, sandbox, unit test, and lessons', () => {
    const missing = all.filter((rel) => {
      const src = fs.readFileSync(rel, 'utf8');
      return needsRuntime(rel, src) && !/pyodide-loader/.test(src);
    });
    expect(missing).toEqual([]);
  });

  it('drops Pyodide and CodeMirror from pages with nothing to run', () => {
    const stray = all.filter((rel) => {
      const src = fs.readFileSync(rel, 'utf8');
      return !needsRuntime(rel, src) && RUNTIME.test(src);
    });
    expect(stray).toEqual([]);
  });
});
