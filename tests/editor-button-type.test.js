import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

/* Lesson Run/Reset/Clear/Check buttons sat outside a form, so the missing
 * type was silent. A later wrap in a form would submit the page. */

const baker = fs.readFileSync('scripts/bake_layout.py', 'utf8');

function pages() {
  return execFileSync('git', ['ls-files', 'units/*.html', 'data/*.html'], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);
}

describe('lesson editor controls are type=button', () => {
  it('the baker stamps type on untyped run/reset/clear/check buttons', () => {
    expect(baker).toContain('btn-run|btn-reset|btn-clear|btn-check');
    expect(baker).toContain('<button type="button"');
  });

  it('no lesson still ships an untyped editor button', () => {
    const bare = [];
    const re = /<button(?![^>]*\btype=)[^>]*\b(?:btn-run|btn-reset|btn-clear|btn-check)\b/;
    for (const rel of pages()) {
      if (re.test(fs.readFileSync(rel, 'utf8'))) bare.push(rel);
    }
    expect(bare).toEqual([]);
  });
});
