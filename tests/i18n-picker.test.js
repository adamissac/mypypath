import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import registry from '../assets/i18n/languages.json';
import english from '../assets/i18n/en.json';

const html = '<!doctype html><html lang="en"><head></head><body><header><button data-language-open type="button">Choose language</button></header><main><p>Course content</p></main></body></html>';

async function boot({ saved = null } = {}) {
  const dom = new JSDOM(html, { url: 'https://mypypath.com/', runScripts: 'outside-only' });
  const { window } = dom;
  if (saved) window.localStorage.setItem('pypath.locale', saved);
  const setLocale = vi.fn((tag) => window.PyPathI18n.setLocale(tag));
  window.PyPathI18nConfig = { registry, english };
  window.fetch = async () => ({ ok: true, json: async () => english });
  window.eval(await readFile('assets/js/i18n.js', 'utf8'));
  await window.PyPathLanguagePicker.ready;
  return { dom, window, setLocale };
}

afterEach(() => vi.restoreAllMocks());

describe('language picker', () => {
  it('updates picker controls and accessibility labels when changing language', async () => {
    const { window } = await boot({ saved: 'en' });
    window.fetch = async () => ({ ok: true, json: async () => ({ ...english, 'picker.close': 'Fermer', 'picker.openLabel': 'Choisir la langue', 'picker.continueEnglish': 'Continuer en anglais' }) });
    await window.PyPathI18n.setLocale('fr');
    expect(window.document.querySelector('[data-language-close]').textContent).toBe('Fermer');
    expect(window.document.querySelector('[data-language-open]').getAttribute('aria-label')).toBe('Choisir la langue');
    expect(window.document.querySelector('[data-language-continue]').textContent).toBe('Continuer en anglais');
  });
  it('shows the searchable welcome dialog once on first visit and leaves it closed for saved visitors', async () => {
    const first = await boot();
    expect(first.window.document.querySelector('#language-dialog').hidden).toBe(false);
    expect(first.window.document.activeElement).toBe(first.window.document.querySelector('#language-search'));
    expect(first.window.document.querySelector('main').hasAttribute('inert')).toBe(true);
    expect(first.window.document.querySelector('main').getAttribute('aria-hidden')).toBe('true');
    const returning = await boot({ saved: 'en' });
    expect(returning.window.document.querySelector('#language-dialog').hidden).toBe(true);
  });

  it('keeps the compact language control accessible by name', async () => {
    const { window } = await boot();
    const trigger = window.document.querySelector('[data-language-open]');
    expect(trigger.getAttribute('aria-label')).toBe('Choose language');
    expect(trigger.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('finds language choices by English name, native name, and outreach country labels', async () => {
    const { window } = await boot();
    const search = window.document.querySelector('#language-search');
    search.value = 'nigeria';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect([...window.document.querySelectorAll('[data-language-option]')].map((button) => button.dataset.locale))
      .toContain('en');
    search.value = 'русский';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect([...window.document.querySelectorAll('[data-language-option]')].map((button) => button.dataset.locale))
      .toEqual(['ru']);
  });

  it('labels partial translations and stores English continuation', async () => {
    const { window, setLocale } = await boot();
    const russian = window.document.querySelector('[data-locale="ru"]');
    expect(russian.disabled).toBe(false);
    expect(russian.textContent).toContain('Partial');
    window.document.querySelector('[data-language-continue]').click();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(window.PyPathI18n.getLocale()).toBe('en');
    expect(window.localStorage.getItem('pypath.locale')).toBe('en');
    expect(window.document.querySelector('#language-dialog').hidden).toBe(true);
    expect(window.document.querySelector('main').hasAttribute('inert')).toBe(false);
    expect(window.document.querySelector('main').hasAttribute('aria-hidden')).toBe(false);
  });
});
