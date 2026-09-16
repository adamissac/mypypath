import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

/* Python for Data pages wear the course's purple and marigold theme
   (html[data-course="data"] in pypath-theme.css). theme-init.js sets the
   attribute from the URL before first paint, so it must pick out exactly that
   course's pages and nothing else. */

const src = fs.readFileSync('assets/js/theme-init.js', 'utf8');

function boot(pathname, stored = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: `https://mypypath.com${pathname}`, runScripts: 'outside-only' });
  if (stored.course) dom.window.localStorage.setItem('pypath-course', stored.course);
  if (stored.theme) dom.window.localStorage.setItem('pypath-theme', stored.theme);
  dom.window.eval(src);
  return {
    course: dom.window.document.documentElement.getAttribute('data-course'),
    theme: dom.window.document.documentElement.getAttribute('data-theme'),
    storedTheme: dom.window.localStorage.getItem('pypath-theme'),
  };
}

function courseFor(pathname, stored) {
  return boot(pathname, { course: stored }).course;
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
    expect(css).not.toMatch(/gradient\(/);
    for (const name of fs.readdirSync('assets/css').filter(name => name.endsWith('.css'))) {
      expect(fs.readFileSync(`assets/css/${name}`, 'utf8'), name).not.toMatch(/gradient\(/);
    }
  });
});

/* Each course carries a mode as well as a palette: Python for Data is a night
   survey (dark), Foundations is daylight (light). The flip belongs to the
   MOMENT the course changes, not to every page of it — otherwise the theme
   control in settings would be overruled on the next click inside the course. */

describe('the mode each course arrives in', () => {
  it('turns dark on the way into Python for Data', () => {
    for (const path of ['/data.html', '/data/unit-3.html', '/data/unit-3/boolean-masks.html']) {
      expect(boot(path, { course: 'foundations', theme: 'light' }), path).toMatchObject({
        course: 'data', theme: 'dark', storedTheme: 'dark',
      });
    }
  });

  it('turns light on the way back into Foundations', () => {
    for (const path of ['/curriculum.html', '/units/unit-3.html']) {
      expect(boot(path, { course: 'data', theme: 'dark' }), path).toMatchObject({
        course: null, theme: 'light', storedTheme: 'light',
      });
    }
  });

  it('arrives dark for someone landing on a Data page first', () => {
    expect(boot('/data/unit-1/what-is-data-science.html')).toMatchObject({
      course: 'data', theme: 'dark', storedTheme: 'dark',
    });
  });

  it('leaves the choice alone once you are inside a course', () => {
    expect(boot('/data/unit-4.html', { course: 'data', theme: 'light' })).toMatchObject({
      theme: 'light', storedTheme: 'light',
    });
    expect(boot('/units/unit-4.html', { course: 'foundations', theme: 'dark' })).toMatchObject({
      theme: 'dark', storedTheme: 'dark',
    });
  });

  it('leaves the choice alone on pages that belong to neither course', () => {
    for (const path of ['/settings.html', '/sandbox.html', '/courses.html', '/']) {
      expect(boot(path, { course: 'data', theme: 'light' }), path).toMatchObject({
        course: 'data', theme: 'light', storedTheme: 'light',
      });
    }
  });

  it('overrides a system preference on the way in, since a course is a choice', () => {
    expect(boot('/data.html', { course: 'foundations', theme: 'system' })).toMatchObject({
      theme: 'dark', storedTheme: 'dark',
    });
  });
});
