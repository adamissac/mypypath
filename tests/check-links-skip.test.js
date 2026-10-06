import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* The link checker used to walk leftover Finder folders, skill HTML, and
 * the engine tree, then report missing files that are not site pages. */

const src = fs.readFileSync('scripts/check_links.py', 'utf8');

describe('check_links skips the same trees as the sitemap', () => {
  it('does not walk generator, audit, or leftover type folders', () => {
    for (const dir of ['.claude', '.agents', '.audit', 'engine', 'docs',
      'REVIEW', 'tests', 'scripts', 'html', 'lesson-format-kit']) {
      expect(src).toContain(`"${dir}"`);
    }
  });
});
