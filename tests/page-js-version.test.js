import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* Same one-hour cache as the page-specific sheets. A deploy that changes
 * certificate.js or quiz-page.js was invisible to a returning visitor. */

const BAKER = fs.readFileSync('scripts/bake_layout.py', 'utf8');

const SCRIPTS = [
  ['download.html', 'download-page.js'],
  ['certificate.html', 'certificate.js'],
  ['certificate.html', 'certificate-gate.js'],
  ['quiz.html', 'quiz-page.js'],
  ['progress.html', 'progress-page.js'],
  ['unit-test.html', 'unit-test.js'],
  ['unit-test.html', 'unit-test-page.js'],
  ['admin.html', 'admin-page.js'],
  ['admin.html', 'admin-access.js'],
];

describe('page-specific scripts are cache-busted', () => {
  it('the baker versions each of them', () => {
    for (const [, file] of SCRIPTS) {
      expect(BAKER).toContain(`'assets/js/${file}'`);
    }
  });

  it('the pages that load them carry a ten-hex query', () => {
    for (const [page, file] of SCRIPTS) {
      const html = fs.readFileSync(page, 'utf8');
      expect(html, page).toMatch(new RegExp(`${file}\\?v=[0-9a-f]{10}`));
    }
  });
});
