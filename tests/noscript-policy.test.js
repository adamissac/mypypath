import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/* One <noscript> policy, applied.
 *
 * Before: two pages out of 198 had one -- quiz.html and unit-test.html -- and
 * no stated reason why those two. /settings.html, /certificate.html and
 * /index.html did not, and those three are not the same case as each other.
 *
 * THE POLICY: a page whose PRIMARY FUNCTION requires JavaScript says so, in
 * its own words, where the content would have been. A page that is readable
 * without JavaScript says nothing, because a banner announcing a dependency
 * that does not affect you is noise.
 */

const APP = [
  'classroom.html', 'account.html', 'settings.html', 'certificate.html',
  'progress.html', 'sandbox.html', 'login.html', 'signup.html', 'admin.html',
];

/* Fully readable without scripting. These must stay clean. */
const CONTENT = ['index.html', 'curriculum.html', 'courses.html', 'privacy.html', 'terms.html'];

const read = (p) => fs.readFileSync(p, 'utf8');

describe('an app page says what specifically will not work', () => {
  for (const page of APP) {
    it(page, () => {
      const src = read(page);
      expect(src).toContain('<noscript>');
      // Not a generic "this page requires JavaScript", which tells someone
      // nothing they cannot already see.
      expect(src).toMatch(/noscript-notice/);
      expect(src).not.toMatch(/<noscript>\s*<p[^>]*>\s*Please enable JavaScript\s*<\/p>/i);
    });
  }

  it('each one names its own feature rather than reusing one sentence', () => {
    const notices = APP.map((p) => {
      const m = read(p).match(/<p class="noscript-notice">([^<]+)</);
      return m ? m[1] : null;
    });
    expect(notices.every(Boolean)).toBe(true);
    expect(new Set(notices).size).toBe(notices.length);
  });
});

describe('a readable page stays quiet', () => {
  for (const page of CONTENT) {
    it(page, () => {
      expect(read(page)).not.toContain('noscript:begin');
    });
  }
});

describe('a lesson page is the interesting case', () => {
  const lesson = read('units/unit-1/what-is-python.html');

  it('has a notice', () => {
    expect(lesson).toContain('<noscript>');
  });

  it('does NOT claim the page is broken', () => {
    /* The lesson text is static HTML and reads perfectly well with scripting
       off -- someone on a locked-down school machine can still learn from it.
       Telling them the page needs JavaScript would send them away from
       something that works. */
    expect(lesson).toContain("readable without JavaScript");
  });

  it('names what actually stops working', () => {
    for (const thing of ['code editors', 'checks', 'saved progress']) {
      expect(lesson, thing).toContain(thing);
    }
  });

  it('every lesson page in both courses has one', () => {
    const missing = [];
    for (const dir of ['units', 'data']) {
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, e.name);
          if (e.isDirectory()) walk(full);
          else if (e.name.endsWith('.html') && !read(full).includes('<noscript')) {
            missing.push(full);
          }
        }
      };
      walk(dir);
    }
    expect(missing).toEqual([]);
  });
});

describe('the notice lands where the content would have been', () => {
  it('inside <main>, not above the header', () => {
    // Under a header the reader has already scrolled past is the one place it
    // cannot do its job.
    const src = read('settings.html');
    const main = src.search(/<main\b/i);
    const notice = src.indexOf('noscript:begin');
    expect(main).toBeGreaterThan(-1);
    expect(notice).toBeGreaterThan(main);
  });
});

describe('hand-written notices are left alone', () => {
  it('quiz.html keeps its own wording', () => {
    // It said this well before the generator existed.
    expect(read('quiz.html')).toContain('A quiz needs JavaScript');
    expect(read('quiz.html')).not.toContain('noscript:begin');
  });

  it('unit-test.html keeps its own', () => {
    expect(read('unit-test.html')).toContain('runs your Python answer in the browser');
    expect(read('unit-test.html')).not.toContain('noscript:begin');
  });
});
