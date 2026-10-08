import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const themeInit = await readFile('assets/js/theme-init.js', 'utf8');

function boot(saved) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://mypypath.com/', runScripts: 'outside-only'
  });
  if (saved) dom.window.localStorage.setItem('pypath.locale', saved);
  dom.window.eval(themeInit);
  return dom.window.document.documentElement;
}

describe('language direction before first paint', () => {
  it('applies a saved supported right-to-left language before styles render', () => {
    const root = boot('ur');
    expect(root.lang).toBe('ur');
    expect(root.dir).toBe('rtl');
  });

  it('leaves unsupported preferences at the English document defaults', () => {
    const root = boot('xx');
    expect(root.lang).toBe('en');
    expect(root.dir).toBe('ltr');
  });
});
