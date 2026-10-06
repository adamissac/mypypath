import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* These sheets are served with max-age=3600. Without a content hash in the
 * URL, a returning visitor keeps the previous rules for an hour after a
 * deploy that changed them. gate.css already has this treatment; the
 * page-specific sheets did not. */

const BAKER = fs.readFileSync('scripts/bake_layout.py', 'utf8');

const SHEETS = [
  ['certificate.html', 'certificate.css'],
  ['quiz.html', 'quiz.css'],
  ['classroom.html', 'classroom.css'],
  ['account.html', 'classroom.css'],
  ['progress.html', 'progress.css'],
  ['unit-test.html', 'unit-test.css'],
  ['admin.html', 'admin.css'],
];

describe('page-specific stylesheets are cache-busted', () => {
  it('the baker versions each of them', () => {
    for (const [, file] of SHEETS) {
      expect(BAKER).toContain(`'assets/css/${file}'`);
    }
  });

  it('the pages that load them carry a ten-hex query', () => {
    for (const [page, file] of SHEETS) {
      const html = fs.readFileSync(page, 'utf8');
      expect(html, page).toMatch(new RegExp(`${file}\\?v=[0-9a-f]{10}`));
    }
  });
});
