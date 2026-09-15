import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

/* Python for Data pages wear the course's purple and marigold theme
   (html[data-course="data"] in pypath-theme.css). theme-init.js sets the
   attribute from the URL before first paint, so it must pick out exactly that
   course's pages and nothing else. */

const src = fs.readFileSync('assets/js/theme-init.js', 'utf8');

function courseFor(pathname, stored) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: `https://mypypath.com${pathname}`, runScripts: 'outside-only' });
  if (stored) dom.window.localStorage.setItem("pypath-course", stored);
  dom.window.eval(src);
  return dom.window.document.documentElement.getAttribute('data-course');
}

describe('the Python for Data course theme', () => {
  it('is set on the course page, unit pages and lessons', () => {
    expect(courseFor('/data.html')).toBe('data');
    expect(courseFor('/data/unit-3.html')).toBe('data');
    expect(courseFor('/data/unit-3/why-arrays-beat-lists.html')).toBe('data');
  });

  it('is not set anywhere else', () => {
    for (const p of ['/', '/index.html', '/curriculum.html', '/units/unit-3.html', '/units/unit-1/what-is-python.html', '/database.html', '/data-privacy.html', '/sandbox.html']) {
      expect(courseFor(p), p).toBeNull();
    }
  });

  it('carries the Data palette into shared pages and resets for Foundations', () => {
    for (const path of ['/settings.html', '/sandbox.html', '/', '/courses.html']) {
      expect(courseFor(path, 'data')).toBe('data');
    }
    for (const path of ['/curriculum.html', '/units/unit-3.html']) {
      expect(courseFor(path, 'data')).toBeNull();
    }
    expect(courseFor('/settings.html', 'invalid')).toBeNull();
  });

  it('has no gradients in the course theme', () => {
    const css = fs.readFileSync('assets/css/pypath-theme.css', 'utf8');
    const block = css.slice(css.indexOf('Python for Data course theme'));
    expect(block).not.toMatch(/gradient\(/);
  });
});
