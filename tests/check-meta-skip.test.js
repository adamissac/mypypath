import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* check_meta.py used to walk skill-creator eval HTML under .agents and
 * fail CI because those pages have no meta description. They are not
 * site pages. */

const src = fs.readFileSync('scripts/check_meta.py', 'utf8');

describe('check_meta skips the same trees as the sitemap', () => {
  it('does not walk generator, audit, or leftover type folders', () => {
    for (const dir of ['.claude', '.agents', '.audit', 'engine', 'docs',
      'REVIEW', 'tests', 'scripts', 'html', 'lesson-format-kit']) {
      expect(src).toContain(`"${dir}"`);
    }
  });
});
