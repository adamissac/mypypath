import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

/* /assets/img/* is cached for a year as immutable. A static ?v=theme1
 * never changes when the file does, so a returning visitor keeps the
 * old mountain. data-moon.svg already used a content hash; summit.png
 * did not. */

const HASH = createHash('sha256')
  .update(fs.readFileSync('assets/img/summit.png'))
  .digest('hex')
  .slice(0, 10);

const baker = fs.readFileSync('scripts/bake_layout.py', 'utf8');

describe('the summit image is cache-busted from its bytes', () => {
  it('the baker versions summit.png and replaces non-hex query tokens', () => {
    expect(baker).toContain("'assets/img/summit.png'");
    expect(baker).toContain('(?:\\?v=[^"\\\']+)?');
  });

  it('index, courses, and the nav sheet share the current hash', () => {
    const token = `summit.png?v=${HASH}`;
    expect(fs.readFileSync('index.html', 'utf8')).toContain(`/${token}`);
    expect(fs.readFileSync('courses.html', 'utf8')).toContain(`/${token}`);
    expect(fs.readFileSync('assets/css/dropdowns.css', 'utf8')).toContain(`/${token}`);
    expect(fs.readFileSync('index.html', 'utf8')).not.toContain('v=theme1');
    expect(fs.readFileSync('assets/css/dropdowns.css', 'utf8')).not.toContain('v=theme1');
  });
});
