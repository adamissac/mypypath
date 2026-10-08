import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

async function documentFor(path) {
  return new JSDOM(await readFile(path, 'utf8')).window.document;
}

describe('shared layout localization hooks', () => {
  it('marks shared navigation and legal footer text on the home page', async () => {
    const doc = await documentFor('index.html');
    expect(doc.querySelector('[data-i18n="nav.home"]')?.textContent.trim()).toBe('Home');
    expect(doc.querySelector('[data-i18n="nav.courses"]')?.textContent.trim()).toBe('Courses');
    expect(doc.querySelector('[data-i18n="nav.startLearning"]')?.textContent.trim()).toBe('Start learning');
    expect(doc.querySelector('[data-i18n="footer.privacy"]')?.textContent.trim()).toBe('Privacy');
    expect(doc.querySelector('[data-i18n="footer.terms"]')?.textContent.trim()).toBe('Terms');
  });

  it('marks the same header text on generated lesson pages', async () => {
    const doc = await documentFor('units/unit-1/what-is-python.html');
    expect(doc.querySelector('[data-i18n="nav.settings"]')?.textContent.trim()).toBe('Settings');
    expect(doc.querySelector('[data-language-open] [data-i18n="picker.open"]')?.textContent.trim()).toBe('Language');
  });
});
