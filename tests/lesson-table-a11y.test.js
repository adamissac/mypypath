import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function pages() {
  return execFileSync('git', ['ls-files', '*.html'], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)
    .filter((rel) => !rel.split(/[\\/]/).some((p) => p.startsWith('.') || p === 'docs' || p === 'scripts' || p === 'lesson-format-kit'));
}

describe('data tables name their column headers', () => {
  it('every <th> has a scope', () => {
    const missing = [];
    for (const rel of pages()) {
      const html = fs.readFileSync(rel, 'utf8');
      for (const m of html.matchAll(/<th\b([^>]*)>/g)) {
        if (!/\bscope="(row|col|rowgroup|colgroup)"/.test(m[1])) {
          missing.push(`${rel}: <th${m[1]}>`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('expected-output samples are named regions', () => {
  it('checkpoint output uses role=region so the label is legal', () => {
    const bad = [];
    for (const rel of pages()) {
      const html = fs.readFileSync(rel, 'utf8');
      if (!html.includes('checkpoint-output')) continue;
      if (/<pre class="checkpoint-output"(?! role="region")/.test(html)) {
        bad.push(rel);
      }
    }
    expect(bad).toEqual([]);
  });
});
