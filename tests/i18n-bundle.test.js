import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import registry from '../assets/i18n/languages.json';
import english from '../assets/i18n/en.json';

const bundle = await readFile('assets/js/i18n.js', 'utf8');

describe('localization startup bundle', () => {
  it('loads the locale registry and English source without extra network requests', async () => {
    const dom = new JSDOM('<!doctype html><html lang="en"><body><p>PyPath</p></body></html>', {
      url: 'https://mypypath.com/', runScripts: 'outside-only'
    });
    const { window } = dom;
    window.fetch = vi.fn(async (url) => ({ ok: true, json: async () => String(url).includes('languages.json') ? registry : english }));
    window.eval(bundle);
    await window.PyPathI18n.ready;
    expect(window.PyPathI18n.getLocales()).toHaveLength(20);
    expect(window.PyPathI18n.getCountryAliases()).toHaveLength(91);
    expect(window.PyPathI18n.t('picker.title')).toBe('Choose your language');
    expect(window.fetch).not.toHaveBeenCalled();
  });
});
