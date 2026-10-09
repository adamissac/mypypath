import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import registry from '../assets/i18n/languages.json';
import english from '../assets/i18n/en.json';

describe('locale catalogs', () => {
  it('lists the 20 approved languages exactly once', () => {
    expect(registry.defaultLocale).toBe('en');
    expect(registry.locales.map((locale) => locale.tag)).toEqual([
      'en', 'es', 'fr', 'pt', 'hi', 'bn', 'fil', 'sw', 'ne', 'ur',
      'ar', 'fa-AF', 'ps', 'id', 'ms', 'vi', 'km', 'my', 'ru', 'zh-CN'
    ]);
    expect(new Set(registry.locales.map((locale) => locale.tag)).size).toBe(20);
  });

  it('keeps normalized aliases unique and marks only right-to-left locales', () => {
    for (const locale of registry.locales) {
      const normalized = locale.aliases.map((alias) => alias.normalize('NFKC').toLocaleLowerCase('en'));
      expect(new Set(normalized).size).toBe(normalized.length);
    }
    expect(registry.locales.filter((locale) => locale.direction === 'rtl').map((locale) => locale.tag))
      .toEqual(['ur', 'ar', 'fa-AF', 'ps']);
  });

  it('requires complete catalogs only for locales marked ready', () => {
    for (const locale of registry.locales.filter((item) => ['ready', 'partial'].includes(item.status))) {
      const file = resolve('assets/i18n', `${locale.tag}.json`);
      expect(existsSync(file)).toBe(true);
      const catalog = JSON.parse(readFileSync(file, 'utf8'));
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(english).sort());
      for (const [key, value] of Object.entries(english)) {
        const placeholders = value.match(/\{[a-zA-Z][a-zA-Z0-9]*\}/g) || [];
        const translated = catalog[key].match(/\{[a-zA-Z][a-zA-Z0-9]*\}/g) || [];
        expect(translated.sort(), key).toEqual(placeholders.sort());
      }
    }
  });

  it('indexes every outreach country and region label to at least one listed language', () => {
    expect(registry.countryAliases).toHaveLength(91);
    expect(registry.countryAliases.every((item) => item.name && item.locales.length > 0)).toBe(true);
    expect(registry.countryAliases.find((item) => item.name === 'India').locales).toContain('hi');
    expect(registry.countryAliases.find((item) => item.name === 'Afghanistan').locales).toContain('fa-AF');
    const tags = new Set(registry.locales.map((locale) => locale.tag));
    expect(registry.countryAliases.every((item) => item.locales.every((tag) => tags.has(tag)))).toBe(true);
  });

  it('has reviewed English source strings with no placeholders to interpolate', () => {
    expect(english['picker.title']).toBe('Choose your language');
    expect(english['picker.search']).toBe('Search languages or countries');
    expect(english['picker.continueEnglish']).toBe('Continue in English');
    expect(Object.values(english).every((value) => typeof value === 'string')).toBe(true);
  });
});
