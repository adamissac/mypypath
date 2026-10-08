import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const source = await readFile('assets/js/i18n.js', 'utf8');
const baseRegistry = JSON.parse(await readFile('assets/i18n/languages.json', 'utf8'));
const english = JSON.parse(await readFile('assets/i18n/en.json', 'utf8'));
const page = '<!doctype html><html lang="en"><head></head><body><p data-i18n="nav.home">Home</p><span data-i18n="picker.searchStatus" data-i18n-params="{&quot;count&quot;:3}">3 languages found</span><pre><code>print("Home")</code></pre><input value="learner text"></body></html>';

function response(data, ok = true) {
  return { ok, json: async () => data };
}

async function createRuntime({ saved = null, browser = [], registry = baseRegistry, catalogs = { en: english } } = {}) {
  const dom = new JSDOM(page, { url: 'https://mypypath.com/courses.html', runScripts: 'outside-only' });
  const { window } = dom;
  if (saved) window.localStorage.setItem('pypath.locale', saved);
  Object.defineProperty(window.navigator, 'languages', { configurable: true, value: browser });
  window.PyPathI18nConfig = { registry, english };
  window.fetch = vi.fn(async (url) => {
    const tag = String(url).split('/').pop().split('?')[0].replace('.json', '');
    return Object.hasOwn(catalogs, tag) ? response(catalogs[tag]) : response({}, false);
  });
  window.eval(source);
  await window.PyPathI18n.ready;
  return { dom, window, i18n: window.PyPathI18n };
}

afterEach(() => vi.restoreAllMocks());

describe('PyPathI18n runtime', () => {
  it('uses a valid saved preference before the browser and defaults to English', async () => {
    const { i18n } = await createRuntime({ saved: 'en', browser: ['es-MX'] });
    expect(i18n.getLocale()).toBe('en');
    const { i18n: suggested } = await createRuntime({ browser: ['en-US'] });
    expect(suggested.getLocale()).toBe('en');
  });

  it('maps a browser regional tag to its reviewed base language', async () => {
    const registry = structuredClone(baseRegistry);
    registry.locales.find((locale) => locale.tag === 'es').status = 'ready';
    const { i18n, window } = await createRuntime({
      registry, browser: ['es-MX', 'en-US'], catalogs: { en: english, es: { ...english, 'nav.home': 'Inicio' } }
    });
    expect(i18n.getLocale()).toBe('es');
    expect(i18n.getSuggestedLocale()).toBe('es');
    expect(window.document.documentElement.lang).toBe('es');
    expect(window.document.querySelector('[data-i18n="nav.home"]').textContent).toBe('Inicio');
  });

  it('ignores invalid or not-ready saved locale values', async () => {
    const { i18n, window } = await createRuntime({ saved: 'ru' });
    expect(i18n.getLocale()).toBe('en');
    expect(window.localStorage.getItem('pypath.locale')).toBeNull();
    expect(await i18n.setLocale('ru')).toBe(false);
  });

  it('sets locale direction and translates marked text without changing code or user input', async () => {
    const registry = structuredClone(baseRegistry);
    registry.locales.find((locale) => locale.tag === 'ar').status = 'ready';
    const { i18n, window } = await createRuntime({
      registry,
      catalogs: { en: english, ar: { ...english, 'nav.home': 'الرئيسية', 'picker.searchStatus': 'تم العثور على {count} لغات' } }
    });
    expect(await i18n.setLocale('ar')).toBe(true);
    expect(window.document.documentElement.lang).toBe('ar');
    expect(window.document.documentElement.dir).toBe('rtl');
    expect(window.document.querySelector('[data-i18n="nav.home"]').textContent).toBe('الرئيسية');
    expect(window.document.querySelector('[data-i18n="picker.searchStatus"]').textContent).toBe('تم العثور على 3 لغات');
    expect(window.document.querySelector('pre code').textContent).toBe('print("Home")');
    expect(window.document.querySelector('input').value).toBe('learner text');
    expect(window.document.querySelector('pre').dir).toBe('ltr');
  });

  it('falls back to English when a ready locale catalog cannot load', async () => {
    const registry = structuredClone(baseRegistry);
    registry.locales.find((locale) => locale.tag === 'es').status = 'ready';
    const { i18n, window } = await createRuntime({ registry, catalogs: { en: english } });
    expect(await i18n.setLocale('es')).toBe(false);
    expect(i18n.getLocale()).toBe('en');
    expect(window.document.documentElement.lang).toBe('en');
  });
});
