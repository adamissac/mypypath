import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const registry = await readJson('assets/i18n/languages.json');
const english = await readJson('assets/i18n/en.json');
const errors = [];
const tags = new Set();
const rtlTags = [];

if (registry.defaultLocale !== 'en') errors.push('defaultLocale must be en');
if (!Array.isArray(registry.locales) || registry.locales.length !== 20) {
  errors.push('locale registry must contain exactly 20 languages');
}
for (const locale of registry.locales || []) {
  for (const field of ['tag', 'nativeName', 'englishName']) {
    if (typeof locale[field] !== 'string' || !locale[field].trim()) errors.push(`${locale.tag || '(unknown)'}: ${field} is required`);
  }
  if (tags.has(locale.tag)) errors.push(`duplicate locale tag: ${locale.tag}`);
  tags.add(locale.tag);
  if (!['ltr', 'rtl'].includes(locale.direction)) errors.push(`${locale.tag}: invalid direction`);
  if (!['ready', 'coming-soon'].includes(locale.status)) errors.push(`${locale.tag}: invalid status`);
  if (!Array.isArray(locale.aliases) || locale.aliases.some((alias) => typeof alias !== 'string' || !alias.trim())) {
    errors.push(`${locale.tag}: aliases must be non-empty strings`);
  } else {
    const normalized = locale.aliases.map((alias) => alias.normalize('NFKC').toLocaleLowerCase('en').trim());
    if (new Set(normalized).size !== normalized.length) errors.push(`${locale.tag}: duplicate normalized aliases`);
  }
  if (locale.direction === 'rtl') rtlTags.push(locale.tag);
  if (locale.status === 'ready' && locale.tag !== 'en') {
    try {
      const catalog = await readJson(`assets/i18n/${locale.tag}.json`);
      const enKeys = Object.keys(english).sort();
      if (JSON.stringify(Object.keys(catalog).sort()) !== JSON.stringify(enKeys)) {
        errors.push(`${locale.tag}: catalog keys do not match English`);
        continue;
      }
      for (const [key, source] of Object.entries(english)) {
        const target = catalog[key];
        if (typeof target !== 'string' || !target.trim()) {
          errors.push(`${locale.tag}: ${key} must be a non-empty string`);
          continue;
        }
        const tokens = (value) => (value.match(/\{[a-zA-Z][a-zA-Z0-9]*\}/g) || []).sort().join('|');
        if (tokens(source) !== tokens(target)) errors.push(`${locale.tag}: ${key} placeholders do not match English`);
      }
    } catch {
      errors.push(`${locale.tag}: ready catalog is missing or invalid JSON`);
    }
  }
}
if (JSON.stringify(rtlTags) !== JSON.stringify(['ur', 'ar', 'fa-AF', 'ps'])) {
  errors.push('only Urdu, Arabic, Dari, and Pashto must use rtl direction');
}
if (!tags.has(registry.defaultLocale)) errors.push('defaultLocale is not in the locale registry');
if (Object.values(english).some((value) => typeof value !== 'string' || !value.trim())) {
  errors.push('English catalog values must be non-empty strings');
}
if (errors.length) {
  console.error(`i18n validation failed:\n- ${errors.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`i18n validation passed (${registry.locales.length} locales; ${Object.keys(english).length} English strings)`);
}
